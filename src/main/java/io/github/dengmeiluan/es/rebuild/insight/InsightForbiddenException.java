package io.github.dengmeiluan.es.rebuild.insight;

/**
 *  Insight 403 语义异常。
 *
 * <p>两类 code：</p>
 * <ul>
 *   <li>{@code ACTION_FORBIDDEN} —— 角色不足（低于动作 minRole）</li>
 *   <li>{@code CONFIRM_TOKEN_INVALID} —— 无 token / 过期 / 参数被篡改（护栏协议核心防线）</li>
 * </ul>
 *
 * @author aicoding
 */
public class InsightForbiddenException extends RuntimeException {

    public static final String ACTION_FORBIDDEN = "ACTION_FORBIDDEN";
    public static final String CONFIRM_TOKEN_INVALID = "CONFIRM_TOKEN_INVALID";

    private final String code;

    public InsightForbiddenException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
