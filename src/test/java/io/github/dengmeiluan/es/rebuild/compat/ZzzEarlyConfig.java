package io.github.dengmeiluan.es.rebuild.compat;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 简单名排<b>后</b>、FQN 排<b>前</b>（{@code compat.Z} < {@code compat.zzzpkg.A}，
 * 大写 'Z'(90) 小于小写 'z'(122)）。无任何排序注解 —— 谁赢完全由兜底口径决定。
 */
@Configuration
public class ZzzEarlyConfig {

    @Bean
    @ConditionalOnMissingBean
    public OrderMarker marker() {
        return new OrderMarker("ZZZ-EARLY-FQN-FIRST");
    }
}
