package io.github.dengmeiluan.es.rebuild.store;

import org.sqlite.SQLiteDataSource;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 本地 SQLite 档装配工具（{@code es.rebuild.console.store=sqlite}）：作业与审计元数据
 * 落同一个本地库文件，重启后历史可查，零外部服务依赖。
 *
 * <p>驱动 {@code org.xerial:sqlite-jdbc} 在 starter 里是 optional（不传染嵌入宿主）；
 * {@link #driverAvailable()} 在装配期判断，缺驱动时调用方回落 control-es 档并 WARN 留痕。
 * 既有 JDBC 存储（{@code JdbcAdhocJobStore}/{@code JdbcConsoleOpsAuditStore}）直接吃本类
 * 产出的 {@link DataSource}：幂等建表、DELETE+INSERT 最小公倍数 upsert，SQLite 全部兼容。</p>
 */
public final class SqliteStores {

    private SqliteStores() {
    }

    /** 驱动是否在 classpath（装配期切换 sqlite 档与 control-es 回落的依据）。 */
    public static boolean driverAvailable() {
        try {
            Class.forName("org.sqlite.JDBC");
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    /**
     * 库文件路径：显式配置（{@code es.rebuild.console.sqlite.path}）逐字优先；
     * 空 → {@code ~/.es-console/<appName>/jobs.db}（与控制集群自举档案同目录哲学）。
     */
    public static Path resolveDatabaseFile(String configuredPath, String appName) {
        if (configuredPath != null && !configuredPath.trim().isEmpty()) {
            return Paths.get(configuredPath.trim()).toAbsolutePath().normalize();
        }
        String app = (appName == null || appName.trim().isEmpty()) ? "default" : appName.trim();
        return Paths.get(System.getProperty("user.home"), ".es-console", app, "jobs.db");
    }

    /** 建库连接源：父目录不存在则自建（首启零手工准备）。 */
    public static DataSource buildDataSource(Path dbFile) throws IOException {
        Path parent = dbFile.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        SQLiteDataSource ds = new SQLiteDataSource();
        ds.setUrl("jdbc:sqlite:" + dbFile.toAbsolutePath());
        return ds;
    }
}
