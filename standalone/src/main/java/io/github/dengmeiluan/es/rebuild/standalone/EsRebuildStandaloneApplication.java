package io.github.dengmeiluan.es.rebuild.standalone;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 独立部署入口（Kibana 形态）：{@code java -jar es-rebuild-standalone-*.jar} 即拥有全套控制台。
 *
 * <p>starter 的全部能力走 spring.factories 自动配置（组件为显式 {@code @Bean} 装配，
 * 不依赖组件扫描），本类只提供 Spring Boot 宿主壳：内嵌 web 服务器 + ES 客户端栈由本模块
 * compile 自带。首启无控制集群时控制面为 NONE 模式，浏览器打开控制台走 Setup 向导
 * 完成首连即全套可用；此后自举档案持久在 {@code ~/.es-console/}，重启即达。</p>
 */
@SpringBootApplication
public class EsRebuildStandaloneApplication {

    public static void main(String[] args) {
        SpringApplication.run(EsRebuildStandaloneApplication.class, args);
    }
}
