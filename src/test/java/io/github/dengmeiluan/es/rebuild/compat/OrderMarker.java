package io.github.dengmeiluan.es.rebuild.compat;

/** 排序探针用：记录哪个自动配置先建成了这个 Bean。 */
public class OrderMarker {

    public final String who;

    public OrderMarker(String who) {
        this.who = who;
    }
}
