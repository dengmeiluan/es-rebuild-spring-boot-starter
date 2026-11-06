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

import java.util.List;
import java.util.Map;

/**
 * MCP API key 存储 SPI。默认实现落控制集群内部索引（{@link EsMcpKeyStore}），
 * 宿主可以替换为数据库实现；测试用 {@link InMemoryMcpKeyStore}。
 */
public interface McpKeyStore {

    /** 管理面列表（脱敏，已按创建时间倒序）。 */
    List<Map<String, Object>> list();

    /** 创建 key；返回值包含一次性明文 {@code secret}，之后无法再取回。 */
    Map<String, Object> create(String name, String owner, String role, List<String> allowedTools,
                               List<String> connections, List<String> permissions,
                               int requestsPerMinute, long dailyQuota, long monthlyQuota, Long expiresAt);

    /**
     * 带连接级权限覆盖的创建。默认实现为兼容旧 SPI：无覆盖时退回全局权限；
     * 一旦请求混合连接权限而宿主自定义存储未实现该方法，明确失败而不是静默丢权限。
     */
    default Map<String, Object> create(String name, String owner, String role, List<String> allowedTools,
                                       List<String> connections, List<String> permissions,
                                       Map<String, List<String>> connectionPermissions,
                                       int requestsPerMinute, long dailyQuota, long monthlyQuota, Long expiresAt) {
        if (connectionPermissions != null && !connectionPermissions.isEmpty()) {
            throw new UnsupportedOperationException(
                    "custom McpKeyStore must implement connectionPermissions create overload");
        }
        return create(name, owner, role, allowedTools, connections, permissions,
                requestsPerMinute, dailyQuota, monthlyQuota, expiresAt);
    }

    /** 按 id 撤销；不存在返回 false。 */
    boolean revoke(String id);

    /** 轮换明文：保留 id/权限/用量，只换 keyHash；返回一次性 secret，key 不存在/已撤销返回 null。 */
    Map<String, Object> rotate(String id);

    /** 按 id 取完整记录（仅服务端内部使用）。 */
    McpKeyRecord find(String id);

    /** 用明文 key 找记录；无效/不存在返回 null。 */
    McpKeyRecord authenticate(String secret);

    /** 回写用量/窗口计数（管理面读得到今天的请求数与最近使用时间）。 */
    void updateUsage(McpKeyRecord record);

    /** 清空认证缓存（撤销/创建后调用）。 */
    void invalidate();
}
