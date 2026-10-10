package io.github.dengmeiluan.es.rebuild.control;

/**
 * 控制台尚未绑定控制集群（ SETUP 模式）时访问控制面存储抛出。
 * 拦截器/异常 advice 捕获后统一回 409 {@code {code:"SETUP_REQUIRED"}}，前端据此弹首连向导。
 *
 * @author aicoding
 */
public class SetupRequiredException extends IllegalStateException {

    public SetupRequiredException() {
        super("控制台尚未绑定控制集群，请先完成 Setup 首连");
    }
}
