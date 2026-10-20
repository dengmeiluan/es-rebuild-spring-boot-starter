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

package io.github.dengmeiluan.es.rebuild.auth;

import org.elasticsearch.client.EsFakeClients;
import org.junit.Test;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 防提权：security 页写键持有人可以管理普通账号，但不得授予、改写或删除 ADMIN 账号。
 */
public class BuiltinConsoleAuthServicePrivilegeTest {

    private static BuiltinConsoleAuthService serviceWithAdminDoc() {
        return new BuiltinConsoleAuthService(
                () -> EsFakeClients.scripted(req -> {
                    if (req.getEndpoint().contains("/_doc/")) {
                        return "{\"found\":true,\"_source\":{\"username\":\"admin1\",\"role\":\"ADMIN\"}}";
                    }
                    return "{}";
                }),
                "es_console_user", "admin", "es-console", 3_600_000L, "it-secret");
    }

    private static ConsolePrincipal nonAdmin() {
        return new ConsolePrincipal("security-writer", ConsoleRole.VIEWER, false);
    }

    private static void expectRejected(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("ADMIN"));
        }
    }

    @Test
    public void 非ADMIN不能授予ADMIN角色() {
        expectRejected(() -> {
            try {
                serviceWithAdminDoc().upsertUser(nonAdmin(), "new-admin", "password1", ConsoleRole.ADMIN);
            } catch (java.io.IOException e) {
                throw new RuntimeException(e);
            }
        }, "非 ADMIN 创建 ADMIN");
    }

    @Test
    public void 非ADMIN不能修改ADMIN账号() {
        expectRejected(() -> {
            try {
                serviceWithAdminDoc().upsertUser(nonAdmin(), "admin1", null, ConsoleRole.VIEWER);
            } catch (java.io.IOException e) {
                throw new RuntimeException(e);
            }
        }, "非 ADMIN 改写 ADMIN");
    }

    @Test
    public void 非ADMIN不能删除ADMIN账号() {
        expectRejected(() -> {
            try {
                serviceWithAdminDoc().deleteUser("admin1", nonAdmin());
            } catch (java.io.IOException e) {
                throw new RuntimeException(e);
            }
        }, "非 ADMIN 删除 ADMIN");
    }
}
