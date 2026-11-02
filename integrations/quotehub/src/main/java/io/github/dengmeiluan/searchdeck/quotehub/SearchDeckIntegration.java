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

package io.github.dengmeiluan.searchdeck.quotehub;

import io.github.dengmeiluan.searchdeck.platform.integration.ConsoleHostIntegration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;
import java.util.List;

/**
 * QuoteHub 的 SearchDeck 适配器：只声明品牌与默认功能包。
 * 鉴权/菜单/连接目录仍走既有细粒度 SPI，不在本类重复。
 */
@Configuration
public class SearchDeckIntegration {

    @Bean
    public ConsoleHostIntegration searchDeckQuoteHubIntegration() {
        return new ConsoleHostIntegration() {
            @Override
            public String id() {
                return "quotehub";
            }

            @Override
            public String displayName() {
                return "QuoteHub";
            }

            @Override
            public String tagline() {
                return "搜索运维，即刻上甲板。";
            }

            /** 仅当 searchdeck.console.features.packs 未显式配置时生效。 */
            @Override
            public List<String> preferredPacks() {
                return Arrays.asList("platform", "search", "index", "data",
                        "lifecycle", "observe", "security", "devtools");
            }
        };
    }
}
