/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.searchdeck.console.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.EnumerablePropertySource;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertySource;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 2.0 配置前缀桥：{@code searchdeck.elasticsearch.*} → 一代兼容的
 * {@code es.rebuild.*}。
 *
 * <p>新宿主使用新前缀；旧部署继续用旧键。新键优先（alias source 放在最前），
 * 因此同一键同时存在时以新键为准。桥只做字符串别名，不改变任何绑定语义。</p>
 *
 * @author aicoding
 */
public class SearchDeckConfigAliasPostProcessor implements EnvironmentPostProcessor, Ordered {

    static final String NEW_PREFIX = "searchdeck.elasticsearch.";
    static final String OLD_PREFIX = "es.rebuild.";
    static final String ALIAS_SOURCE_NAME = "searchdeckElasticsearchAliases";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Map<String, Object> aliases = new LinkedHashMap<>();
        for (PropertySource<?> source : environment.getPropertySources()) {
            if (ALIAS_SOURCE_NAME.equals(source.getName())) {
                continue;
            }
            if (!(source instanceof EnumerablePropertySource)) {
                continue;
            }
            for (String name : ((EnumerablePropertySource<?>) source).getPropertyNames()) {
                if (name.startsWith(NEW_PREFIX)) {
                    aliases.put(OLD_PREFIX + name.substring(NEW_PREFIX.length()), source.getProperty(name));
                }
            }
        }
        if (!aliases.isEmpty()) {
            environment.getPropertySources().addFirst(new MapPropertySource(ALIAS_SOURCE_NAME, aliases));
        }
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
