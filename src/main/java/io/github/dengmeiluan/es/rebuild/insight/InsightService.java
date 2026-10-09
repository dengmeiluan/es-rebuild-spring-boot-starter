package io.github.dengmeiluan.es.rebuild.insight;

import io.github.dengmeiluan.es.rebuild.insight.analyzer.SettingsChangeAnalyzer;

import java.util.Map;

/**
 * R39 现场智能门面：InsightController 与各分析器之间的路由层。
 *
 * <p>本批（R39.1）只挂 settings 变更分析；R39.2+ 的诊断/故障分析器在此扩展，
 * Controller 契约保持稳定。</p>
 *
 * @author aicoding
 */
public class InsightService {

    private final SettingsChangeAnalyzer settingsChangeAnalyzer;

    public InsightService(SettingsChangeAnalyzer settingsChangeAnalyzer) {
        this.settingsChangeAnalyzer = settingsChangeAnalyzer;
    }

    /** 现场①：settings 变更影响分析（只读零副作用）。 */
    public Map<String, Object> settingsImpact(String index, Map<String, Object> changes) {
        if (index == null || index.trim().isEmpty()) {
            throw new IllegalArgumentException("index 必填");
        }
        if (changes == null || changes.isEmpty()) {
            throw new IllegalArgumentException("changes 必填且不能为空");
        }
        return settingsChangeAnalyzer.analyze(index.trim(), changes);
    }
}
