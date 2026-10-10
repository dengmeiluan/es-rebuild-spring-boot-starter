package io.github.dengmeiluan.es.rebuild.auth;

import javax.servlet.http.HttpServletRequest;

/**
 * 宿主鉴权委托 SPI（）：宿主应用（如 宿主）注册本接口 Bean 后，
 * 控制台请求先交宿主校验自己的凭据（如 {@code X-Es-Host-Token} 里的宿主 JWT），
 * 认出则免控制台内置登录直接放行；返回 {@code null} 交回内置 token 鉴权（两套并存，互不排斥）。
 *
 * <p>返回的 {@link ConsolePrincipal} 应以 {@code delegated=true} 构造——
 * 前端据此隐藏「退出/改密」（凭据归宿主管），审计正常落控制集群。</p>
 *
 * <p>角色映射由宿主自定（建议：管理员→ADMIN、运维→OPERATOR、其余→VIEWER）。</p>
 *
 * @author aicoding
 */
public interface ConsoleAuthDelegate {

    /**
     * 用宿主自己的凭据体系解析请求身份。
     *
     * @param request 当前 HTTP 请求
     * @return 宿主认出的身份（建议 delegated=true）；认不出返回 {@code null}（交回内置鉴权，不视为失败）
     */
    ConsolePrincipal authenticate(HttpServletRequest request);
}
