package io.github.dengmeiluan.es.rebuild.client;

import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 *  client 模式资源守卫：让控制台静态资源返 404。
 *
 * <p>为什么需要它：控制台的 6MB 静态资源打在 {@code classpath:/static/console/} 下，
 * 由 Spring Boot 默认资源处理器无条件兜住 —— {@code es.rebuild.web-enabled=false}
 * 只掐掉 Controller Bean，页面照样能被任意宿主访问。</p>
 *
 * <p>做法：显式注册这些 pattern 的 handler，它优先于默认的 {@code /**}；
 * 给它<b>空 location 列表</b>，于是任何命中请求都找不到资源 → 404。
 * 注意 jar 里那 6MB 资源仍然存在（spec D5 明确接受），本类只管可访问性。</p>
 *
 * <p>覆盖面不止 {@code /console/**}：{@code static/} 根下还有两个平级的控制台入口页
 * （{@code es-rebuild.html} / {@code es-xmigrate.html}），它们不在 {@code /console/} 前缀下，
 * 漏掉就会让业务应用仍然对外露出一个「跳转到 ES 控制台」的入口。
 * {@code ConsoleAssetGuardTest} 有一条护栏断言：{@code static/} 根下的实际内容必须与
 * {@link #GUARDED_PATTERNS} 逐一对应 —— 将来有人往 {@code static/} 加文件，测试会红。</p>
 *
 * @author aicoding
 */
public class ConsoleAssetGuard implements WebMvcConfigurer {

    /**
     * 本守卫接管的全部路径，与 {@code src/main/resources/static/} 下的实际内容一一对应。
     *
     * <p>改这里必须同步 {@code static/} 的实际内容，反之亦然；护栏断言会强制这一点。</p>
     */
    static final String[] GUARDED_PATTERNS = {
            "/console/**",
            "/es-rebuild.html",
            "/es-xmigrate.html"
    };

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 空 locations：命中 pattern 但解析不到任何资源 → 404，而不是落回默认 handler。
        // spring-webmvc 5.2.15 下 ResourceHttpRequestHandler.afterPropertiesSet() 对空 locations
        // 只 warn 不抛（"Locations list is empty..."），注册条目本身照常存活并生效。
        registry.addResourceHandler(GUARDED_PATTERNS).addResourceLocations(new String[0]);
    }
}
