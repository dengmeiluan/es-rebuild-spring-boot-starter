package io.github.dengmeiluan.es.rebuild.auth;

import io.github.dengmeiluan.es.rebuild.config.EsRebuildProperties;
import io.github.dengmeiluan.es.rebuild.multicluster.ConnStore;
import io.github.dengmeiluan.es.rebuild.xmigrate.RemoteClusterConn;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 *  P2-4 v2：连接环境页面模板（纯 grantedPages 同构方案）。
 *
 * <p>语义：连接档案的 {@code env}（PROD/STAGING/QA/DEV）映射到该环境的<b>页面 key 白名单模板</b>，
 * 与宿主 grantedPages <b>取交集</b>后作为该连接下的实际页面授权——「测试环境菜单全给、
 * 生产自动收缩为只读页集」。三层各管一维：宿主 角色 rank（操作类别上限）×
 * 宿主 grantedPages（用户级页面授权）× env 模板（环境级页集收缩）。</p>
 *
 * <p>插拔保证：未配置 env 模板（Map 为空或该 env 无模板）→ 原样透传，行为与现状逐字节一致；
 * 删除配置即完全回滚。前端零改动（grantedPages 驱动菜单已存在）。</p>
 *
 * @author aicoding
 */
@Component
public class EnvPagesResolver {

    private final ConnStore connStore;
    private final EsRebuildProperties properties;

    public EnvPagesResolver(ConnStore connStore, EsRebuildProperties properties) {
        this.connStore = connStore;
        this.properties = properties;
    }

    /** 该连接的环境封顶页集；未配置返回 null（不收缩）。targetId=连接 id（host 字面量=宿主，无模板）。 */
    public Set<String> pagesFor(String targetId) {
        if (targetId == null || targetId.isEmpty() || "host".equalsIgnoreCase(targetId.trim())) {
            return null;
        }
        RemoteClusterConn conn = connStore.get(targetId);
        if (conn == null) return null;
        String env = conn.getEnv();
        if (env == null || env.isEmpty()) return null;
        Map<String, java.util.Set<String>> templates = properties.getEnvPages();
        if (templates == null || templates.isEmpty()) return null;
        Set<String> pages = templates.get(env.toUpperCase());
        return pages == null || pages.isEmpty() ? null : pages;
    }

    /** 连接维度键前缀(grantedPages 形态:conn:{connId}:{pageKey},写:conn:{connId}:w:{pageKey})。 */
    public static final String CONN_KEY_PREFIX = "conn:";
    private static final java.util.regex.Pattern CONN_KEY = java.util.regex.Pattern.compile("^conn:([^:]+):(?:w:)?(.+)$");

    /** 解析 grantedPages 中的连接维度键 → {connId → 该连接的页面 key 集(含写键的页面)};无连接键返回空 Map。 */
    public Map<String, Set<String>> connPagesOf(Set<String> grantedPages) {
        Map<String, Set<String>> out = new java.util.LinkedHashMap<>();
        if (grantedPages == null) return out;
        for (String g : grantedPages) {
            if (g == null || !g.startsWith(CONN_KEY_PREFIX)) continue;
            java.util.regex.Matcher m = CONN_KEY.matcher(g);
            if (m.matches()) out.computeIfAbsent(m.group(1), k -> new java.util.LinkedHashSet<>()).add(m.group(2));
        }
        return out;
    }

    /**
     * 有效页面授权(扩展连接维度):
     * <ul>
     *   <li>静态 key(无 conn: 前缀)→ 全局页,对所有连接生效(仍受 env 模板交集);</li>
     *   <li>conn:{connId}:{pageKey} 键 → 仅对 targetId=connId 的连接生效(pageKey 并入有效集);</li>
     *   <li>grantedPages 无任何 conn 键 → 现状行为逐字节一致(纯静态+env 交集)。</li>
     * </ul>
     */
    public Set<String> effectivePages(String targetId, Set<String> grantedPages) {
        Map<String, Set<String>> connMap = connPagesOf(grantedPages);
        Set<String> staticKeys = new LinkedHashSet<>();
        if (grantedPages != null) {
            for (String g : grantedPages) {
                if (g != null && !g.startsWith(CONN_KEY_PREFIX)) staticKeys.add(g);
            }
        }
        Set<String> out = new LinkedHashSet<>(staticKeys);
        if (!connMap.isEmpty()) {
            Set<String> connPages = connMap.get(targetId);
            if (connPages != null) out.addAll(connPages);
        }
        Set<String> envPages = pagesFor(targetId);
        if (envPages != null) {
            if (connMap.isEmpty()) {
                // 纯静态模型(现状):env 模板收缩静态页
                out.retainAll(envPages);
                out.addAll(staticPagesUnderEnv(staticKeys, envPages));
            }
            // conn 模型:env 模板与 conn 键双轨,不做交集(宿主 RBAC 已按连接明示授权)
        }
        return out;
    }

    /** 静态 key 与 env 页集的交集(空/无 env 模板时为空集,调用方自行合并)。 */
    private Set<String> staticPagesUnderEnv(Set<String> staticKeys, Set<String> envPages) {
        Set<String> out = new LinkedHashSet<>(staticKeys);
        out.retainAll(envPages);
        return out;
    }

    /** 用户是否处于连接授权模型(grantedPages 含任一 conn: 前缀键)。写门判定用。 */
    public boolean inConnModel(Set<String> grantedPages) {
        if (grantedPages == null) return false;
        for (String g : grantedPages) {
            if (g != null && g.startsWith(CONN_KEY_PREFIX)) return true;
        }
        return false;
    }

    /** 连接写授权检查:targetId 连接上 pageKey 的写操作是否被显式授权(conn:{id}:w:{page} 键)。 */
    public boolean writeAllowed(String targetId, String pageKey, Set<String> grantedPages) {
        if (grantedPages == null) return false;
        return grantedPages.contains(CONN_KEY_PREFIX + targetId + ":w:" + pageKey);
    }

    /** ·实报打通:targetId 连接上是否持有任意页写键(conn:{id}:w:* 通配)——
     *  与前端 auth.canWriteOn 的 conn 解析语义同源对齐(),供共享端点(无页面归属、
     *  无法按页精确定位写键)的低危写档放行判定使用。 */
    public boolean hasAnyWriteKey(String targetId, Set<String> grantedPages) {
        if (grantedPages == null || targetId == null || targetId.isEmpty()) return false;
        String prefix = CONN_KEY_PREFIX + targetId + ":w:";
        for (String g : grantedPages) {
            if (g != null && g.startsWith(prefix)) return true;
        }
        return false;
    }

    /** 403 响应体（页面被 env 模板收缩掉时——与 PAGE_DENIED 风格区分）。 */
    public static String denyBody(String page) {
        return "{\"code\":\"ENV_PAGE_DENIED\",\"page\":\"" + page + "\",\"message\":\"当前连接环境未开放该页面\"}";
    }

    /** Collections 显式引用占位（保持 import 最小集，供后续扩展排序视图）。 */
    static Set<String> unmodifiableCopy(Set<String> src) {
        return Collections.unmodifiableSet(new LinkedHashSet<>(src));
    }
}
