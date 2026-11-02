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

import org.junit.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class SearchDeckConfigAliasTest {

    @Test
    public void 新前缀覆盖旧前缀且旧前缀保留() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("es.rebuild.mode", "client")
                .withProperty("searchdeck.elasticsearch.mode", "console")
                .withProperty("searchdeck.elasticsearch.console.store", "sqlite");
        new SearchDeckConfigAliasPostProcessor().postProcessEnvironment(env, new SpringApplication());
        assertEquals("console", env.getProperty("es.rebuild.mode"));
        assertEquals("sqlite", env.getProperty("es.rebuild.console.store"));
    }

    @Test
    public void 只有旧前缀时保持原值() {
        MockEnvironment env = new MockEnvironment().withProperty("es.rebuild.mode", "client");
        new SearchDeckConfigAliasPostProcessor().postProcessEnvironment(env, new SpringApplication());
        assertEquals("client", env.getProperty("es.rebuild.mode"));
        assertNull(env.getProperty("searchdeck.elasticsearch.mode"));
    }
}
