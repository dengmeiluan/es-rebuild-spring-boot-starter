package io.github.dengmeiluan.es.rebuild.adhoc;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Adhoc（无 provider）托管重建端点。
 *
 * <p>路径落在 {@code internal/es/index/adhoc-rebuild} 下 ——
 * 与鉴权拦截器 ADMIN 关键字清单中的 {@code /adhoc-rebuild} 匹配，全部端点要求 ADMIN 角色。</p>
 *
 * <p>异常语义沿用 starter 约定：IllegalArgument/IllegalState 由
 * {@code InternalEsRebuildExceptionAdvice} 转为结构化 {@code {code,message}}。</p>
 */
@RestController
@RequestMapping("internal/es/index/adhoc-rebuild")
public class InternalAdhocRebuildController {

    private final AdhocRebuildService adhocRebuildService;

    public InternalAdhocRebuildController(AdhocRebuildService adhocRebuildService) {
        this.adhocRebuildService = adhocRebuildService;
    }

    /** 向导第一步：探测逻辑名形态 + 预填 settings/mapping/docCount/timeField 候选 */
    @GetMapping("/prepare")
    public Map<String, Object> prepare(@RequestParam("index") String index) throws IOException {
        return adhocRebuildService.prepare(index);
    }

    /** 启动托管重建（body 见 {@link AdhocRebuildService#start}） */
    @PostMapping("/start")
    public Map<String, Object> start(@RequestBody Map<String, Object> req) throws IOException {
        return adhocRebuildService.start(req);
    }

    /** 作业进度快照 */
    @GetMapping("/status")
    public Map<String, Object> status(@RequestParam("jobId") String jobId) {
        return adhocRebuildService.status(jobId);
    }

    /** 请求中止（best-effort 取消 ES 侧 reindex task） */
    @PostMapping("/abort")
    public Map<String, Object> abort(@RequestParam("jobId") String jobId) {
        return adhocRebuildService.abort(jobId);
    }

    /**
     * R93：人工放行切换（仅对 pauseBeforeSwitch=true 的作业有效）。
     *
     * <p>若等待已超时/中止，返回 IllegalState 错误而非成功 —— 谎报成功会让操作者
     * 以为切换正在进行，而实际作业已中止、写阻断已解除。</p>
     */
    @PostMapping("/confirm-switch")
    public Map<String, Object> confirmSwitch(@RequestParam("jobId") String jobId) {
        return adhocRebuildService.confirmSwitch(jobId);
    }

    /** 全部作业（内存态，按启动时间倒序） */
    @GetMapping("/jobs")
    public List<Map<String, Object>> jobs() {
        return adhocRebuildService.listJobs();
    }
}
