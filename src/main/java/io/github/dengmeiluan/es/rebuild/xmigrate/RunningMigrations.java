package io.github.dengmeiluan.es.rebuild.xmigrate;

import java.util.Collection;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 活跃迁移注册表：{@code jobId → } {@link MigrationHandle}。
 *
 * <p>仅进程内有效（凭据随之只在内存）。重启即空，遗留 RUNNING 作业由
 * {@link MigrateJobTracker#sweepInterrupted(RunningMigrations)} 标为 INTERRUPTED。</p>
 */
public class RunningMigrations {

    private final ConcurrentHashMap<String, MigrationHandle> handles = new ConcurrentHashMap<>();

    public void register(MigrationHandle handle) {
        handles.put(handle.getJobId(), handle);
    }

    public MigrationHandle get(String jobId) {
        return handles.get(jobId);
    }

    public void remove(String jobId) {
        handles.remove(jobId);
    }

    public boolean isRunning(String jobId) {
        return handles.containsKey(jobId);
    }

    public Collection<MigrationHandle> all() {
        return handles.values();
    }
}
