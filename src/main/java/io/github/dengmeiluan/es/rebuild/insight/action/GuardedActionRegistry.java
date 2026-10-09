package io.github.dengmeiluan.es.rebuild.insight.action;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * R39 护栏动作注册表。
 *
 * <p>构造收 {@code List<GuardedAction>}（AutoConfig 集合注入），后续批次新增动作
 * 只需注册新的 {@link GuardedAction} Bean，协议层零改动。</p>
 *
 * @author aicoding
 */
public class GuardedActionRegistry {

    private final Map<String, GuardedAction> actions = new LinkedHashMap<>();

    public GuardedActionRegistry(List<GuardedAction> actionList) {
        if (actionList != null) {
            for (GuardedAction a : actionList) {
                actions.put(a.id(), a);
            }
        }
    }

    /** 按 id 取动作，未注册抛 IllegalArgumentException（上层转 400）。 */
    public GuardedAction get(String actionId) {
        GuardedAction a = actions.get(actionId);
        if (a == null) {
            throw new IllegalArgumentException("未知动作: " + actionId);
        }
        return a;
    }
}
