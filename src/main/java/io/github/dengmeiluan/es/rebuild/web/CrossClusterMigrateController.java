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

package io.github.dengmeiluan.es.rebuild.web;

import io.github.dengmeiluan.es.rebuild.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.es.rebuild.auth.ConsolePrincipal;
import io.github.dengmeiluan.es.rebuild.auth.ConsoleRole;
import io.github.dengmeiluan.es.rebuild.auth.EnvPagesResolver;
import io.github.dengmeiluan.es.rebuild.multicluster.ConnStore;
import io.github.dengmeiluan.es.rebuild.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.es.rebuild.xmigrate.MigrateJobES;
import io.github.dengmeiluan.es.rebuild.xmigrate.MigrateRequest;
import io.github.dengmeiluan.es.rebuild.xmigrate.RemoteClusterConn;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * (内部) ES 跨集群迁移运维接口（客户端 scroll+bulk 搬运）。
 *
 * <p>与零停机重建接口（{@code /internal/es/index/**}）并列、解耦。由 {@code es.rebuild.web-enabled} 与
 * {@code es.rebuild.migrate.enabled} 同时为 true 才装配。<b>凭据类请求一律走 POST body，不进 query/日志。</b></p>
 *
 * <p> 起源集群支持引用已存连接档案（{@code srcConnId}/{@code connId}）：服务端取档案含密构造连接，
 * 密码明文不经前端；引用前校验当前登录角色满足档案 minRole（不满足 403 CONN_FORBIDDEN）。</p>
 */
@RestController
@RequestMapping("internal/es/xmigrate")
public class CrossClusterMigrateController {

    private final CrossClusterMigrateService migrateService;
    private final ConnStore connStore;
    private final EnvPagesResolver envPagesResolver;
    private final boolean pageAuthEnabled;

    public CrossClusterMigrateController(CrossClusterMigrateService migrateService, ConnStore connStore,
                                         EnvPagesResolver envPagesResolver, boolean pageAuthEnabled) {
        this.migrateService = migrateService;
        this.connStore = connStore;
        this.envPagesResolver = envPagesResolver;
        this.pageAuthEnabled = pageAuthEnabled;
    }

    /** 旧集群连通性自检 + 列出旧集群索引。connId 非空时用已存档案（body 可传 {}）。 */
    @PostMapping("connect-check")
    public List<Map<String, Object>> connectCheck(@RequestBody RemoteClusterConn conn,
                                                  @RequestParam(required = false) String connId,
                                                  HttpServletRequest request) {
        requireSourceWrite(connId, request);
        return migrateService.connectCheck(pick(conn, connId, request));
    }

    /**
     * 环境变量/${表达式} 解析预览：返回服务端从自身运行环境解析出的 scheme/host/port/username
     * 与"密码是否已解析"，<b>不返回密码值</b>。供"只知变量名、填不出实际值"场景确认解析结果。
     */
    @PostMapping("resolve-preview")
    public Map<String, Object> resolvePreview(@RequestBody RemoteClusterConn conn) {
        return migrateService.resolvePreview(conn);
    }

    /** 迁移前预检：目标索引是否已存在（已存在则同名文档将跳过、结果是合并），供启动确认弹层前置警告。 */
    @PostMapping("preflight")
    public Map<String, Object> preflight(@RequestBody MigrateRequest request, HttpServletRequest http) {
        requireSourceWrite(request.getSrcConnId(), http);
        return migrateService.preflight(request);
    }

    /** 发起迁移（异步），返回 jobId。srcConnId 非空时服务端注入已存档案为源连接。 */
    @PostMapping("start")
    public Map<String, Object> start(@RequestBody MigrateRequest request, HttpServletRequest http) {
        requireSourceWrite(request.getSrcConnId(), http);
        if (request.getSrcConnId() != null && !request.getSrcConnId().trim().isEmpty()) {
            request.setConn(storedConn(request.getSrcConnId(), http));
        }
        String jobId = migrateService.start(request);
        return ok("jobId", jobId);
    }

    /**
     * 从旧集群读取指定索引的 mapping + settings，供前端预览/编辑后再创建目标索引。
     * 返回 {"mapping": "...", "settings": "..."}。connId 非空时用已存档案。
     */
    @PostMapping("fetch-config")
    public Map<String, Object> fetchConfig(@RequestBody RemoteClusterConn conn,
                                           @RequestParam String sourceIndex,
                                           @RequestParam(required = false) String connId,
                                           HttpServletRequest request) {
        requireSourceWrite(connId, request);
        return migrateService.fetchSourceConfig(pick(conn, connId, request), sourceIndex);
    }

    /** 进度快照（连接模型：只允许作业源连接的写键持有人）。 */
    @GetMapping("progress")
    public MigrateJobES progress(@RequestParam String jobId, HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request);
        return job;
    }

    /** 近期迁移作业列表（连接模型：只列源连接写键可达的作业）。 */
    @GetMapping("jobs")
    public List<MigrateJobES> jobs(@RequestParam(required = false, defaultValue = "20") int limit,
                                   HttpServletRequest request) {
        List<MigrateJobES> all = migrateService.jobs(limit);
        if (!connModel(request)) return all;
        ConsolePrincipal principal = principal(request);
        List<MigrateJobES> visible = new ArrayList<>();
        for (MigrateJobES job : all) {
            if (job.getSrcConnId() != null && !job.getSrcConnId().trim().isEmpty()
                    && envPagesResolver.writeAllowed(job.getSrcConnId().trim(), "xmigrate",
                            principal.getGrantedPages())) {
                visible.add(job);
            }
        }
        return visible;
    }

    /**
     * 迁移写入端（宿主/控制集群）索引清单——目标索引补全专用。
     * 迁移恒定写宿主，与数据面 X-Es-Target 无关，故不走 /cluster/** 数据面通道。
     */
    @GetMapping("dest-indices")
    public List<Map<String, Object>> destIndices() {
        return migrateService.destIndices();
    }

    /** 续跑（重新供给旧集群凭据；connId 非空时用已存档案）。 */
    @PostMapping("resume")
    public Map<String, Object> resume(@RequestParam String jobId, @RequestBody RemoteClusterConn conn,
                                      @RequestParam(required = false) String connId,
                                      HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request);
        if (connModel(request) && job.getSrcConnId() != null && !job.getSrcConnId().trim().isEmpty()) {
            if (connId == null || !job.getSrcConnId().trim().equals(connId.trim())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "续跑必须使用该作业的源连接档案 " + job.getSrcConnId());
            }
        }
        requireSourceWrite(connId, request);
        migrateService.resume(jobId, pick(conn, connId, request));
        return ok("jobId", jobId);
    }

    /** 中止（连接模型：只允许作业源连接的写键持有人）。 */
    @PostMapping("abort")
    public Map<String, Object> abort(@RequestParam String jobId, HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request);
        migrateService.abort(jobId);
        return ok("aborted", jobId);
    }

    /** 连接模型下源连接档案必须有该连接的迁移写键；手输连接不绑定档案（仍受当前页 rank3 门）。 */
    private void requireSourceWrite(String connId, HttpServletRequest request) {
        if (!connModel(request) || connId == null || connId.trim().isEmpty()) return;
        ConsolePrincipal principal = principal(request);
        if (!envPagesResolver.writeAllowed(connId.trim(), "xmigrate", principal.getGrantedPages())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "暂无源连接档案 " + connId.trim() + " 的迁移写权限");
        }
    }

    /** 连接模型下作业必须记录源连接档案，且操作者持有该档案的迁移写键；旧版/手输作业不下放。 */
    private void requireJobSource(MigrateJobES job, HttpServletRequest request) {
        if (!connModel(request)) return;
        String src = job == null ? null : job.getSrcConnId();
        if (src == null || src.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "该迁移作业未记录源连接档案，连接模型下不可操作");
        }
        requireSourceWrite(src, request);
    }

    private boolean connModel(HttpServletRequest request) {
        if (!pageAuthEnabled || envPagesResolver == null) return false;
        ConsolePrincipal principal = principal(request);
        // ADMIN 是全局超管：不受源连接写键/作业过滤限制
        if (principal != null && principal.getRole().atLeast(io.github.dengmeiluan.es.rebuild.auth.ConsoleRole.ADMIN)) {
            return false;
        }
        return principal != null && principal.isDelegated() && principal.getGrantedPages() != null
                && envPagesResolver.inConnModel(principal.getGrantedPages());
    }

    private static ConsolePrincipal principal(HttpServletRequest request) {
        Object attr = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        return attr instanceof ConsolePrincipal ? (ConsolePrincipal) attr : null;
    }

    private static Map<String, Object> ok(String key, Object value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ok", true);
        m.put(key, value);
        return m;
    }

    /** connId 非空优先用已存档案，否则沿用手输 conn。 */
    private RemoteClusterConn pick(RemoteClusterConn manual, String connId, HttpServletRequest request) {
        if (connId == null || connId.trim().isEmpty()) {
            return manual;
        }
        return storedConn(connId, request);
    }

    /**
     * 按 id 取已存档案（含密码，仅服务端流转）；不存在拒、登录角色低于档案 minRole 拒（403）。
     */
    private RemoteClusterConn storedConn(String connId, HttpServletRequest request) {
        RemoteClusterConn conn = connStore.get(connId.trim());
        if (conn == null) {
            throw new IllegalArgumentException("连接不存在或已被删除: " + connId);
        }
        ConsoleRole required = ConsoleRole.parse(conn.getMinRole());
        Object p = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        ConsoleRole actual = p instanceof ConsolePrincipal ? ((ConsolePrincipal) p).getRole() : ConsoleRole.VIEWER;
        if (!actual.atLeast(required)) {
            throw new SecurityException("当前角色无权使用该集群连接（需 " + required.name() + "）");
        }
        return conn;
    }
}
