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

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 一把 MCP API key 的持久化记录。
 *
 * <p>明文 key 只在创建响应里出现一次；存储只保留 {@link #keyHash}。
 * {@code owner} 与 {@code role} 是创建时的身份快照，用于管理面板按登录人和角色区分；
 * 角色变更后请撤销旧 key 并重新签发，避免权限漂移。</p>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class McpKeyRecord {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("yyyy-MM");
    private static final char[] HEX = "0123456789abcdef".toCharArray();

    public String id;
    public String prefix;
    public String name;
    public String owner;
    public String role;
    public String keyHash;
    public List<String> allowedTools = new ArrayList<>();
    /** 允许的连接 id（host + 连接档案 id）；空/null 等同 host。 */
    public List<String> connections = new ArrayList<>();
    /** read / write；空/null 等同只读。连接未在 {@link #connectionPermissions} 中单列时使用。 */
    public List<String> permissions = new ArrayList<>();
    /** 连接级权限覆盖：connectionId -> [read, write]；用于「QA/UAT 可写、生产只读」这类混合授权。 */
    public Map<String, List<String>> connectionPermissions = new LinkedHashMap<>();
    public int requestsPerMinute = 60;
    public long dailyQuota = 5000;
    public long monthlyQuota = 100000;
    public boolean enabled = true;
    public long createdAt = System.currentTimeMillis();
    public Long expiresAt;
    public Long lastUsedAt;
    public long requestCount;
    public long errorCount;
    public String dayKey;
    public long dayCount;
    public String monthKey;
    public long monthCount;
    public long windowStart;
    public int windowCount;
    public Long revokedAt;

    public static String newId() {
        byte[] bytes = new byte[9];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String newSecret() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(HEX[(b >>> 4) & 0x0f]).append(HEX[b & 0x0f]);
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public boolean expired(long now) {
        return expiresAt != null && expiresAt > 0 && now >= expiresAt;
    }

    /** 该连接的实际权限：有连接级覆盖用覆盖，否则回落全局 permissions。 */
    public List<String> permissionsFor(String connectionId) {
        if (connectionPermissions != null && connectionPermissions.containsKey(connectionId)) {
            List<String> scoped = connectionPermissions.get(connectionId);
            return scoped == null || scoped.isEmpty()
                    ? java.util.Collections.singletonList("read") : scoped;
        }
        return permissions == null || permissions.isEmpty()
                ? java.util.Collections.singletonList("read") : permissions;
    }

    public boolean canRead(String connectionId) {
        return permissionsFor(connectionId).contains("read");
    }

    public boolean canWrite(String connectionId) {
        return permissionsFor(connectionId).contains("write");
    }

    /** 任意连接可写：决定 key 是否能拿到写工具（真正执行时按目标连接再次判定）。 */
    public boolean hasAnyWrite() {
        if (permissions != null && permissions.contains("write")) return true;
        if (connectionPermissions != null) {
            for (List<String> scoped : connectionPermissions.values()) {
                if (scoped != null && scoped.contains("write")) return true;
            }
        }
        return false;
    }

    public boolean hasAnyRead() {
        if (permissions == null || permissions.isEmpty() || permissions.contains("read")) return true;
        if (connectionPermissions != null) {
            for (List<String> scoped : connectionPermissions.values()) {
                if (scoped != null && scoped.contains("read")) return true;
            }
        }
        return false;
    }

    /** 管理面视图：绝不包含 keyHash，也不包含明文。 */
    public Map<String, Object> redacted(long now) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("prefix", prefix);
        out.put("name", name);
        out.put("owner", owner);
        out.put("role", role);
        out.put("allowedTools", allowedTools == null ? new ArrayList<String>() : new ArrayList<>(allowedTools));
        out.put("connections", connections == null || connections.isEmpty()
                ? new ArrayList<>(java.util.Collections.singletonList("host")) : new ArrayList<>(connections));
        out.put("permissions", permissions == null || permissions.isEmpty()
                ? new ArrayList<>(java.util.Collections.singletonList("read")) : new ArrayList<>(permissions));
        Map<String, List<String>> scoped = new LinkedHashMap<>();
        if (connectionPermissions != null) {
            for (Map.Entry<String, List<String>> e : connectionPermissions.entrySet()) {
                scoped.put(e.getKey(), e.getValue() == null ? new ArrayList<String>() : new ArrayList<>(e.getValue()));
            }
        }
        out.put("connectionPermissions", scoped);
        out.put("requestsPerMinute", requestsPerMinute);
        out.put("dailyQuota", dailyQuota);
        out.put("monthlyQuota", monthlyQuota);
        out.put("enabled", enabled);
        out.put("createdAt", createdAt);
        out.put("expiresAt", expiresAt);
        out.put("lastUsedAt", lastUsedAt);
        out.put("requestCount", requestCount);
        out.put("errorCount", errorCount);
        out.put("todayCount", todayKey(now).equals(dayKey) ? dayCount : 0L);
        out.put("monthCount", monthKey(now).equals(monthKey) ? monthCount : 0L);
        out.put("expired", expired(now));
        return out;
    }

    public static String todayKey(long now) {
        return LocalDateTime.ofEpochSecond(now / 1000, 0, ZoneOffset.UTC).format(DAY);
    }

    public static String monthKey(long now) {
        return LocalDateTime.ofEpochSecond(now / 1000, 0, ZoneOffset.UTC).format(MONTH);
    }

}
