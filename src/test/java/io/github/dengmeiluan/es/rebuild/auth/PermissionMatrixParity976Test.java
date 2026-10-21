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

import org.junit.Test;

import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertTrue;

/**
 * 权限矩阵完整性锚：每个共享写/读端点引用的页面 key 必须在契约里真实存在；
 * 面板登记的每个写端点必须有归属页、共享写映射，或明确属于系统管理域。
 * 新增写端点忘了登记页面时，本测试直接失败（而不是默默回落角色门）。
 */
public class PermissionMatrixParity976Test {

    private static final Set<String> SYSTEM_ADMIN_WRITE_PATHS = new HashSet<>(Arrays.asList(
            "/internal/es/index/setup/rebind",
            "/internal/es/index/clusters/save",
            "/internal/es/index/clusters/delete",
            "/internal/es/index/clusters/test",
            "/internal/es/index/clusters/sync/run"));

    @SuppressWarnings("unchecked")
    private static Map<String, List<String>> sharedWritePages() throws Exception {
        Field f = ConsoleAuthInterceptor.class.getDeclaredField("SHARED_WRITE_PAGES");
        f.setAccessible(true);
        return (Map<String, List<String>>) f.get(null);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, List<String>> sharedReadPages() throws Exception {
        Field f = ConsoleAuthInterceptor.class.getDeclaredField("SHARED_READ_PAGES");
        f.setAccessible(true);
        return (Map<String, List<String>>) f.get(null);
    }

    @SuppressWarnings("unchecked")
    private static List<String> writeEndpointPaths() throws Exception {
        Field f = ConsolePermissionsController.class.getDeclaredField("WRITE_ENDPOINT_PATHS");
        f.setAccessible(true);
        return (List<String>) f.get(null);
    }

    private static Set<String> pageKeys(ConsolePageCatalog catalog) {
        Set<String> keys = new HashSet<>();
        for (ConsolePageCatalog.Page p : catalog.getPages()) keys.add(p.getKey());
        return keys;
    }

    @Test
    public void 共享写读映射引用的页面key必须存在于契约() throws Exception {
        ConsolePageCatalog catalog = ConsolePageCatalog.load();
        Set<String> keys = pageKeys(catalog);
        for (Map.Entry<String, List<String>> e : sharedWritePages().entrySet()) {
            for (String page : e.getValue()) {
                assertTrue("共享写端点 " + e.getKey() + " 引用未知页面 " + page, keys.contains(page));
            }
        }
        for (Map.Entry<String, List<String>> e : sharedReadPages().entrySet()) {
            for (String page : e.getValue()) {
                assertTrue("共享读端点 " + e.getKey() + " 引用未知页面 " + page, keys.contains(page));
            }
        }
    }

    @Test
    public void 面板写端点必须有页面或共享归属或系统管理白名单() throws Exception {
        ConsolePageCatalog catalog = ConsolePageCatalog.load();
        for (String path : writeEndpointPaths()) {
            if (SYSTEM_ADMIN_WRITE_PATHS.contains(path)) continue;
            boolean owned = catalog.pageOf(path) != null
                    || ConsoleAuthInterceptor.sharedWritePages(path) != null;
            assertTrue("写端点未登记页面/共享归属: " + path, owned);
        }
    }

    @Test
    public void 建索引与DevTools端点保持共享授权() throws Exception {
        Map<String, List<String>> shared = sharedWritePages();
        assertTrue(shared.get("/cluster/create-index").containsAll(Arrays.asList("config-validator", "indices")));
        assertTrue(shared.get("/cluster/devtools/execute").containsAll(Arrays.asList("rest", "devtools")));
        assertTrue("devtools 页必须在契约中",
                pageKeys(ConsolePageCatalog.load()).contains("devtools"));
    }
}
