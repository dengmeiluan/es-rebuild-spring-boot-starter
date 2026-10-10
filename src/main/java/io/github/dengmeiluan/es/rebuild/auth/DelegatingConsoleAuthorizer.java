package io.github.dengmeiluan.es.rebuild.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.http.HttpServletRequest;

/**
 * 组合鉴权器（）：宿主委托先行、内置账号兜底。
 *
 * <p>宿主注册 {@link ConsoleAuthDelegate}（如 宿主 校验 X-Es-Host-Token）后，
 * 每个请求先问 delegate；返回 null（本请求不带宿主凭证）则回落内置
 * {@link BuiltinConsoleAuthService} 的 token 校验——两套身份可并存：
 * iframe 嵌入走宿主委托、独立开页走内置登录。</p>
 *
 * <p>delegate 抛异常按「未认证」降级 fallback（宿主鉴权故障不挡死内置登录），
 * 内置校验自身失败仍回 null → 拦截器 401。</p>
 *
 * @author aicoding
 */
public class DelegatingConsoleAuthorizer implements EsConsoleAuthorizer {

    private static final Logger LOG = LoggerFactory.getLogger(DelegatingConsoleAuthorizer.class);

    private final ConsoleAuthDelegate delegate;
    private final EsConsoleAuthorizer fallback;

    public DelegatingConsoleAuthorizer(ConsoleAuthDelegate delegate, EsConsoleAuthorizer fallback) {
        this.delegate = delegate;
        this.fallback = fallback;
    }

    @Override
    public ConsolePrincipal authenticate(HttpServletRequest request) {
        if (delegate != null) {
            try {
                ConsolePrincipal p = delegate.authenticate(request);
                if (p != null) {
                    return p;
                }
            } catch (Exception e) {
                // WARN 末参补 e——降级留痕只有 getMessage 无从定位宿主侧根因，
                // 堆栈补上；返回 fallback 契约不变
                LOG.warn("[DelegatingConsoleAuthorizer] 宿主委托鉴权异常（降级内置校验）: {}", e.getMessage(), e);
            }
        }
        return fallback == null ? null : fallback.authenticate(request);
    }
}
