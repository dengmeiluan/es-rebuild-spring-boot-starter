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

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 路径归一化 / 白名单精确匹配回归钉：
 * {@code /auth/login/../users/upsert} 曾借白名单 {@code contains} 短路鉴权（VIEWER 直取用户管理），
 * {@code %2e%2e}、重复斜杠、反斜杠等变形路径必须在授权判定前折叠或 fail-closed。
 */
public class ConsoleAuthInterceptorPathCanonicalTest {

    private static HttpServletRequest stubRequest(String uri) {
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getRequestURI": return uri;
                case "getContextPath": return "";
                case "getServletPath": return "";
                case "getPathInfo": return null;
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleAuthInterceptorPathCanonicalTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    @Test
    public void 点点段被折叠_登录路径不再能借白名单跳到用户管理() {
        assertEquals("/internal/es/index/auth/users/upsert",
                ConsoleAuthInterceptor.normalizePath(
                        stubRequest("/internal/es/index/auth/login/../users/upsert")));
    }

    @Test
    public void 编码的点点段同样折叠() {
        assertEquals("/internal/es/index/auth/users/upsert",
                ConsoleAuthInterceptor.normalizePath(
                        stubRequest("/internal/es/index/auth/login/%2e%2e/users/upsert")));
    }

    @Test
    public void 重复斜杠折叠为单斜杠() {
        assertEquals("/internal/es/index/cluster/raw",
                ConsoleAuthInterceptor.normalizePath(stubRequest("/internal/es/index/cluster//raw")));
    }

    @Test
    public void 点点越过根_failClosed() {
        assertNull(ConsoleAuthInterceptor.normalizePath(stubRequest("/../../x")));
        assertNull(ConsoleAuthInterceptor.normalizePath(stubRequest("/a/../../x")));
    }

    @Test
    public void 反斜杠与NUL_failClosed() {
        assertNull(ConsoleAuthInterceptor.normalizePath(
                stubRequest("/internal/es/index\\auth\\login")));
        assertNull(ConsoleAuthInterceptor.normalizePath(
                stubRequest("/internal/es/index/auth/\u0000login")));
    }

    @Test
    public void 根路径归一为单斜杠() {
        assertEquals("/", ConsoleAuthInterceptor.normalizePath(stubRequest("/")));
    }

    @Test
    public void 白名单仅精确路径命中() {
        assertTrue(ConsoleAuthInterceptor.isWhitelisted("/internal/es/index/auth/login"));
        assertTrue(ConsoleAuthInterceptor.isWhitelisted("/internal/es/index/setup/status"));
        assertFalse("未归一化的穿越路径不得命中白名单",
                ConsoleAuthInterceptor.isWhitelisted(
                        "/internal/es/index/auth/login/../users/upsert"));
        assertFalse("前缀/后缀变形不得命中白名单",
                ConsoleAuthInterceptor.isWhitelisted("/x/internal/es/index/auth/login"));
        assertFalse(ConsoleAuthInterceptor.isWhitelisted("/internal/es/index/auth/login/extra"));
        assertFalse(ConsoleAuthInterceptor.isWhitelisted(null));
    }
}
