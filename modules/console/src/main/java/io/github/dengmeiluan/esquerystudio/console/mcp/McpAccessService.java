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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicLong;

/**
 * MCP API key 的认证、固定窗口限流、日/月配额与用量计数。
 *
 * <p>限流与配额计数在进程内完成（每 key 一把对象锁），用量异步式回写存储；
 * 多实例部署时每个实例独立计数，严格的全局配额请在网关或宿主侧按 key 维度实施。
 * 这是显式的部署边界，不把单实例内存限流伪装成分布式配额。</p>
 */
public class McpAccessService {

    private static final Logger LOG = LoggerFactory.getLogger(McpAccessService.class);
    private static final long WINDOW_MS = 60_000L;

    private final McpKeyStore store;
    private final AtomicLong usageWriteWarnAt = new AtomicLong(0L);

    public McpAccessService(McpKeyStore store) {
        this.store = store;
    }

    public McpKeyRecord authenticate(String secret) {
        McpKeyRecord record = store.authenticate(secret);
        long now = System.currentTimeMillis();
        if (record == null) {
            throw new McpAccessException(401, "INVALID_MCP_KEY", "无效的 MCP API key");
        }
        if (!record.enabled) {
            throw new McpAccessException(401, "MCP_KEY_REVOKED", "该 MCP API key 已撤销");
        }
        if (record.expired(now)) {
            throw new McpAccessException(401, "MCP_KEY_EXPIRED", "该 MCP API key 已过期");
        }
        return record;
    }

    /** 在真正执行工具前扣减窗口/日/月配额；超限抛 429。 */
    public void consume(McpKeyRecord record) {
        consume(record, null);
    }

    /** 带工具名的消费：同时累计按工具计费/用量计数。 */
    public void consume(McpKeyRecord record, String toolName) {
        if (record == null) return;
        synchronized (record) {
            long now = System.currentTimeMillis();
            if (record.windowStart <= 0L || now - record.windowStart >= WINDOW_MS) {
                record.windowStart = now;
                record.windowCount = 0;
            }
            int rpm = record.requestsPerMinute > 0 ? record.requestsPerMinute : 60;
            if (record.windowCount >= rpm) {
                long retry = Math.max(1L, (record.windowStart + WINDOW_MS - now + 999L) / 1000L);
                throw new McpAccessException(429, "MCP_RATE_LIMITED",
                        "该 key 的请求频率超过 " + rpm + " 次/分钟", retry);
            }

            String day = McpKeyRecord.todayKey(now);
            if (!day.equals(record.dayKey)) {
                record.dayKey = day;
                record.dayCount = 0L;
            }
            if (record.dailyQuota > 0 && record.dayCount >= record.dailyQuota) {
                throw new McpAccessException(429, "MCP_DAILY_QUOTA_EXCEEDED",
                        "该 key 今日请求次数已达上限 " + record.dailyQuota);
            }
            String month = McpKeyRecord.monthKey(now);
            if (!month.equals(record.monthKey)) {
                record.monthKey = month;
                record.monthCount = 0L;
            }
            if (record.monthlyQuota > 0 && record.monthCount >= record.monthlyQuota) {
                throw new McpAccessException(429, "MCP_MONTHLY_QUOTA_EXCEEDED",
                        "该 key 本月请求次数已达上限 " + record.monthlyQuota);
            }

            record.windowCount++;
            record.dayCount++;
            record.monthCount++;
            record.requestCount++;
            record.lastUsedAt = now;
            if (toolName != null && !toolName.trim().isEmpty()) {
                String tool = toolName.trim();
                record.lastTool = tool;
                if (record.toolCounts == null) record.toolCounts = new java.util.LinkedHashMap<>();
                Long current = record.toolCounts.get(tool);
                record.toolCounts.put(tool, current == null ? 1L : current + 1L);
            }
        }
        persist(record);
    }

    public void recordError(McpKeyRecord record) {
        if (record == null) return;
        synchronized (record) {
            record.errorCount++;
        }
        persist(record);
    }

    private void persist(McpKeyRecord record) {
        try {
            store.updateUsage(record);
        } catch (Exception e) {
            /* 用量是增强信息：存储抖动不能把一次已经执行的查询变成失败响应。 */
            long now = System.currentTimeMillis();
            long last = usageWriteWarnAt.get();
            if (now - last > 60_000L && usageWriteWarnAt.compareAndSet(last, now)) {
                LOG.warn("[mcp] 用量回写失败（首次，60s 内不再重复）：{}", e.getMessage(), e);
            }
        }
    }
}
