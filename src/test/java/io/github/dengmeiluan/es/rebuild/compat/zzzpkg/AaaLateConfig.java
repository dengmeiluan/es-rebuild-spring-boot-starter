package io.github.dengmeiluan.es.rebuild.compat.zzzpkg;

import io.github.dengmeiluan.es.rebuild.compat.OrderMarker;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 简单名排<b>前</b>、FQN 排<b>后</b>。与 {@code ZzzEarlyConfig} 构成方向相反的一对。 */
@Configuration
public class AaaLateConfig {

    @Bean
    @ConditionalOnMissingBean
    public OrderMarker marker() {
        return new OrderMarker("AAA-LATE-SIMPLE-FIRST");
    }
}
