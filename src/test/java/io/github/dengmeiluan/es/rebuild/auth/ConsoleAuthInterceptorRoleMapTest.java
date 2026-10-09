package io.github.dengmeiluan.es.rebuild.auth;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

/**
 * 二百二十批：requiredRole 映射锚点——自助流水 {@code /auth/ops-audit/mine} 全角色可看（VIEWER），
 * 全量审计 {@code /auth/ops-audit} 保持 rank3（AUDIT_OP/CLUSTER_OP/REBUILD_OP/ADMIN），
 * 防自助通道把全量审计门槛拉低；顺手锚住用户点名的两档高危映射（删索引/用户管理）。
 */
public class ConsoleAuthInterceptorRoleMapTest {

    @Test
    public void 自助流水_mine_任何已认证身份可看() {
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/auth/ops-audit/mine"));
    }

    @Test
    public void 全量审计_opsAudit_仍需rank3() {
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/auth/ops-audit"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/auth/ops-audit?username=a"));
    }

    @Test
    public void mine特例不被AUDIT前缀吞_判定顺序锚() {
        /* containsAny(AUDIT_KEYWORDS) 用 contains("/auth/ops-audit")——/mine 同前缀，
           特例必须先于关键词块命中（防回归：把特例挪到块后立刻 rank3） */
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/auth/ops-audit/mine"));
    }

    @Test
    public void 删索引删文档保持rank3_用户管理保持ADMIN() {
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/delete-index"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/delete-by-id"));
        assertEquals(ConsoleRole.ADMIN,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/auth/users"));
    }

    @Test
    public void 五百五十八批_危险级重划_观测读降档与漏网写升档() {
        /* adhoc 的 GET（任务列表/就绪检查）是观测面：裸词 "/adhoc-rebuild" 退役后 VIEWER 可读 */
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/adhoc-rebuild/jobs"));
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/adhoc-rebuild/prepare"));
        /* adhoc 写动词逐一列出，rank3 不变 */
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/adhoc-rebuild/start"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/adhoc-rebuild/abort"));
        /* 漏网写升 rank3：删备份 / ILM 策略变更 / SLM 执行（原先落缺省 OPERATOR） */
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("DELETE", "/internal/es/index/cluster/snapshot/delete"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("PUT", "/internal/es/index/cluster/ilm/policy"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("DELETE", "/internal/es/index/cluster/ilm/policy"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/slm/execute"));
    }

    @Test
    public void 五百七十四批_reindexAdvanced写端点升rank3() {
        /* reindex-advanced（@PostMapping cluster/reindex-advanced）是与 /rebuild 同族的重建写端点，
           原先落缺省 OPERATOR；升 rank3（该端点无 GET 形态，裸词不误伤观测面） */
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/reindex-advanced"));
    }

    @Test
    public void 文档编辑保持OPERATOR_查询类POST保持VIEWER() {
        assertEquals(ConsoleRole.OPERATOR,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/update-document"));
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/query"));
    }
}
