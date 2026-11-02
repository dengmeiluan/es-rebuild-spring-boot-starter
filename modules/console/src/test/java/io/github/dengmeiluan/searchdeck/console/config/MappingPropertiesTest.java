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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

public class MappingPropertiesTest {

    @Test
    public void mappingDefaultsAreStartupFailSkip() {
        SearchDeckElasticsearchProperties p = new SearchDeckElasticsearchProperties();

        assertThat(p.getMapping().getAutoRegister()).isEqualTo("startup");
        assertThat(p.getMapping().getConflictPolicy()).isEqualTo("fail");
        assertThat(p.getMapping().getMissingIndexPolicy()).isEqualTo("skip");
    }

    @Test
    public void documentedNonDefaultValuesAreValid() {
        SearchDeckElasticsearchProperties p = new SearchDeckElasticsearchProperties();

        p.getMapping().setAutoRegister("off");
        p.getMapping().setConflictPolicy("warn");
        p.getMapping().setMissingIndexPolicy("fail");

        p.validate();
    }

    @Test
    public void unknownAutoRegisterFailsValidation() {
        SearchDeckElasticsearchProperties p = new SearchDeckElasticsearchProperties();
        p.getMapping().setAutoRegister("later");

        assertThatThrownBy(p::validate).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("searchdeck.elasticsearch.mapping.auto-register");
    }

    @Test
    public void nullAutoRegisterFailsValidation() {
        SearchDeckElasticsearchProperties p = new SearchDeckElasticsearchProperties();
        p.getMapping().setAutoRegister(null);

        assertThatThrownBy(p::validate).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("searchdeck.elasticsearch.mapping.auto-register");
    }

    @Test
    public void unknownConflictPolicyFailsValidation() {
        SearchDeckElasticsearchProperties p = new SearchDeckElasticsearchProperties();
        p.getMapping().setConflictPolicy("ignore");

        assertThatThrownBy(p::validate).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("searchdeck.elasticsearch.mapping.conflict-policy");
    }

    @Test
    public void nullConflictPolicyFailsValidation() {
        SearchDeckElasticsearchProperties p = new SearchDeckElasticsearchProperties();
        p.getMapping().setConflictPolicy(null);

        assertThatThrownBy(p::validate).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("searchdeck.elasticsearch.mapping.conflict-policy");
    }

    @Test
    public void unknownMissingIndexPolicyFailsValidation() {
        SearchDeckElasticsearchProperties p = new SearchDeckElasticsearchProperties();
        p.getMapping().setMissingIndexPolicy("create");

        assertThatThrownBy(p::validate).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("searchdeck.elasticsearch.mapping.missing-index-policy");
    }

    @Test
    public void nullMissingIndexPolicyFailsValidation() {
        SearchDeckElasticsearchProperties p = new SearchDeckElasticsearchProperties();
        p.getMapping().setMissingIndexPolicy(null);

        assertThatThrownBy(p::validate).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("searchdeck.elasticsearch.mapping.missing-index-policy");
    }
}
