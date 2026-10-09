package io.github.dengmeiluan.es.rebuild.auth;

import javax.servlet.http.HttpServletRequest;

/**
 * 控制台鉴权 SPI（R34）。
 *
 * <p>starter 默认提供 {@link BuiltinConsoleAuthService}（账号存 ES 系统索引 + HMAC token）。
 * 宿主项目若已有自己的登录体系（JWT/SSO/Spring Security），注册一个本接口的 bean 即可整体替换：
 * 从请求头/上下文解析出身份并映射到 {@link ConsoleRole} 三级角色。</p>
 *
 * @author aicoding
 */
public interface EsConsoleAuthorizer {

    /**
     * 解析请求身份。
     *
     * @param request 当前 HTTP 请求
     * @return 已认证身份；未认证/凭证无效返回 {@code null}（拦截器将回 401）
     */
    ConsolePrincipal authenticate(HttpServletRequest request);
}
