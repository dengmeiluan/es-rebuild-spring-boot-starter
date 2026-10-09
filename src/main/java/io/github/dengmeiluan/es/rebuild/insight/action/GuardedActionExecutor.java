package io.github.dengmeiluan.es.rebuild.insight.action;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.es.rebuild.auth.ConsoleOpsAuditStore;
import io.github.dengmeiluan.es.rebuild.auth.ConsolePrincipal;
import io.github.dengmeiluan.es.rebuild.insight.InsightForbiddenException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * R39 护栏动作执行器——协议编排层。
 *
 * <p>estimate → 角色校验 → 动作预估 → 附 confirmToken/riskLevel/supportsDryRun；
 * execute → 角色校验 → token 校验（失败 403 CONFIRM_TOKEN_INVALID）→ 动作执行 →
 * 回执 + 审计流水（action=GUARDED_ACTION，detail 含 receiptId 供检索）。</p>
 *
 * @author aicoding
 */
public class GuardedActionExecutor {

    /** 审计 action 标识：审计视图按此过滤护栏动作流水。 */
    public static final String AUDIT_ACTION = "GUARDED_ACTION";

    private static final Logger LOG = LoggerFactory.getLogger(GuardedActionExecutor.class);

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final GuardedActionRegistry registry;
    private final ConfirmTokenService tokenService;
    private final ConsoleOpsAuditStore auditStore;

    public GuardedActionExecutor(GuardedActionRegistry registry,
                                 ConfirmTokenService tokenService,
                                 ConsoleOpsAuditStore auditStore) {
        this.registry = registry;
        this.tokenService = tokenService;
        this.auditStore = auditStore;
    }

    /** 影响预估：成功即签发 confirmToken（动作 estimate 抛 IllegalArgumentException 时不发 token）。 */
    public Map<String, Object> estimate(String actionId, Map<String, Object> params, ConsolePrincipal principal) throws IOException {
        GuardedAction action = requireRole(actionId, principal);
        Map<String, Object> out = new LinkedHashMap<>(action.estimate(params));
        out.put("confirmToken", tokenService.issue(actionId, params));
        out.put("riskLevel", action.riskLevel());
        out.put("supportsDryRun", action.supportsDryRun());
        return out;
    }

    /** 零副作用试运行。 */
    public Map<String, Object> dryRun(String actionId, Map<String, Object> params, ConsolePrincipal principal) throws IOException {
        GuardedAction action = requireRole(actionId, principal);
        if (!action.supportsDryRun()) {
            throw new IllegalArgumentException("动作不支持 dry-run: " + actionId);
        }
        return action.dryRun(params);
    }

    /** 真正执行：token 三防线（无 token / 过期 / 参数篡改）→ 回执 → 审计。 */
    public Map<String, Object> execute(String actionId, Map<String, Object> params, String confirmToken,
                                       ConsolePrincipal principal) throws IOException {
        GuardedAction action = requireRole(actionId, principal);
        if (!tokenService.verify(actionId, params, confirmToken)) {
            throw new InsightForbiddenException(InsightForbiddenException.CONFIRM_TOKEN_INVALID,
                    "确认令牌无效：请先查看影响预估（无 token / 已过期 / 参数与预估时不一致）");
        }
        Map<String, Object> result = action.execute(params);
        ActionReceipt receipt = new ActionReceipt(actionId, result);
        audit(receipt, params, principal);
        return receipt.toMap();
    }

    private GuardedAction requireRole(String actionId, ConsolePrincipal principal) {
        GuardedAction action = registry.get(actionId);
        if (principal == null || !principal.getRole().atLeast(action.minRole())) {
            throw new InsightForbiddenException(InsightForbiddenException.ACTION_FORBIDDEN,
                    "该动作要求 " + action.minRole() + " 及以上角色");
        }
        return action;
    }

    private void audit(ActionReceipt receipt, Map<String, Object> params, ConsolePrincipal principal) {
        if (auditStore == null) {
            // 控制台鉴权关闭时无审计 store，跳过（回执仍正常返回）
            return;
        }
        try {
            Map<String, Object> snapshot = new LinkedHashMap<>();
            snapshot.put("receiptId", receipt.getReceiptId());
            snapshot.put("actionId", receipt.getActionId());
            snapshot.put("params", params);
            snapshot.put("result", receipt.getResult());
            // detail 超长由 store 截断兜底（2000 字符）
            auditStore.record(io.github.dengmeiluan.es.rebuild.auth.ConsoleOpsAuditEvent.builder()
                    .username(principal.getUsername()).displayName(principal.getDisplayName())
                    .role(principal.getRole().name()).method("POST")
                    .uri("/insight/actions/" + receipt.getActionId() + "/execute")
                    .action(AUDIT_ACTION).httpStatus(200)
                    .detail(OBJECT_MAPPER.writeValueAsString(snapshot))
                    .build());
        } catch (Exception e) {
            // 审计失败不影响主流程（与既有异步审计"尽力而为"语义一致）；
            // 五百五十八批：补 WARN——高危动作审计丢失此前全静默=审计黑洞无痕
            // （护栏动作本身低频且高危，逐条直 WARN 不节流）
            LOG.warn("[GuardedActionExecutor] 护栏动作审计序列化/落档失败 actionId={}（审计流水丢失，"
                    + "回执照常返回）: {}", receipt.getActionId(), e.getMessage());
        }
    }
}
