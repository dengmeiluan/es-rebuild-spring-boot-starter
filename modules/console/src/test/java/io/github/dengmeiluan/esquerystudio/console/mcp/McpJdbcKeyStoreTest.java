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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/** JDBC key 存储持久化契约：建表、签发、认证、用量、撤销、重启后仍可读。 */
public class McpJdbcKeyStoreTest {

    private JdbcDataSource dataSource() {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:mcpkeys_" + System.nanoTime() + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        return ds;
    }

    @Test
    public void keysAndUsageSurviveANewStoreInstance() {
        JdbcDataSource ds = dataSource();
        JdbcMcpKeyStore store = new JdbcMcpKeyStore(ds);
        Map<String, List<String>> scoped = new java.util.LinkedHashMap<>();
        scoped.put("qa", Arrays.asList("read", "write"));
        scoped.put("prod", Collections.singletonList("read"));
        Map<String, Object> created = store.create("agent", "alice", "OPERATOR",
                Arrays.asList("es_search", "es_index_doc"), Arrays.asList("qa", "prod"),
                Collections.singletonList("read"), scoped, 30, 1000, 5000, null);
        String secret = String.valueOf(created.get("secret"));
        assertEquals(1, store.list().size());

        McpKeyRecord record = store.authenticate(secret);
        assertNotNull(record);
        assertEquals("alice", record.owner);
        assertTrue(record.canWrite("qa"));
        assertFalse(record.canWrite("prod"));
        assertTrue(record.canRead("prod"));
        assertEquals(Collections.singletonList("read"), record.permissions);

        record.requestCount = 7;
        record.dayCount = 3;
        record.dayKey = McpKeyRecord.todayKey(System.currentTimeMillis());
        record.lastUsedAt = System.currentTimeMillis();
        store.updateUsage(record);

        JdbcMcpKeyStore reopened = new JdbcMcpKeyStore(ds);
        McpKeyRecord persisted = reopened.authenticate(secret);
        assertNotNull("重启后 key 仍应可认证", persisted);
        assertEquals(7, persisted.requestCount);
        assertEquals(3, persisted.dayCount);

        Map<String, Object> rotated = reopened.rotate(record.id);
        String newSecret = String.valueOf(rotated.get("secret"));
        assertFalse(secret.equals(newSecret));
        assertNull("旧 secret 轮换后必须失效", reopened.authenticate(secret));
        assertNotNull(reopened.authenticate(newSecret));

        assertTrue(reopened.revoke(record.id));
        McpKeyRecord revoked = new JdbcMcpKeyStore(ds).find(record.id);
        assertFalse(revoked.enabled);
    }
}
