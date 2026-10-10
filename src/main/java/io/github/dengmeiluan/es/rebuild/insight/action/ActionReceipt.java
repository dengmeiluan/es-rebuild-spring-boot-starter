package io.github.dengmeiluan.es.rebuild.insight.action;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 *  护栏动作执行回执。
 *
 * <p>{@code ConsoleOpsAuditStore.record} 为异步 void（无返回 id），故回执 id 由
 * 本类自生成 UUID，审计 detail JSON 里同样带 receiptId——前端/运维可按 receiptId
 * 在审计视图检索到对应流水。</p>
 *
 * @author aicoding
 */
public class ActionReceipt {

    private final String receiptId;
    private final String actionId;
    private final long executedAt;
    private final Map<String, Object> result;

    public ActionReceipt(String actionId, Map<String, Object> result) {
        this.receiptId = UUID.randomUUID().toString();
        this.actionId = actionId;
        this.executedAt = System.currentTimeMillis();
        this.result = result;
    }

    public String getReceiptId() {
        return receiptId;
    }

    public String getActionId() {
        return actionId;
    }

    public long getExecutedAt() {
        return executedAt;
    }

    public Map<String, Object> getResult() {
        return result;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("receiptId", receiptId);
        m.put("actionId", actionId);
        m.put("executedAt", executedAt);
        m.put("result", result);
        m.put("auditHint", "审计流水可按 receiptId 检索");
        return m;
    }
}
