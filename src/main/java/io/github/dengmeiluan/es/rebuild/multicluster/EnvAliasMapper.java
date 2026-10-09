package io.github.dengmeiluan.es.rebuild.multicluster;

/**
 * 连接中心原始环境值 → es 控制台档案 env 枚举(PROD/STAGING/QA/DEV)映射(连接中心自动同步批)。
 * 白名单外 fail-closed 归 PROD——与 infra 侧 {@code EnvironmentDomains}「白名单 DEV/QA/UAT 为测试,
 * 其余一律按生产」的全站哲学一致;空白=未标注(null)。
 *
 * @author aicoding
 */
public final class EnvAliasMapper {

    private EnvAliasMapper() {
    }

    /** rawEnv 空白 → null;dev/qa/uat → DEV/QA/STAGING;prod/prd/production → PROD;其余 fail-closed → PROD。 */
    public static String map(String rawEnv) {
        if (rawEnv == null || rawEnv.trim().isEmpty()) {
            return null;
        }
        switch (rawEnv.trim().toLowerCase(java.util.Locale.ROOT)) {
            case "dev":
                return "DEV";
            case "qa":
                return "QA";
            case "uat":
                return "STAGING";
            case "prod":
            case "prd":
            case "production":
                return "PROD";
            default:
                return "PROD"; // fail-closed:未知值按生产
        }
    }
}
