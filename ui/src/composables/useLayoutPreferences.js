import { ref } from 'vue';
import { clampPaneSize, migrateLegacySplit, } from '../utils/layout';
import { removeStoredRaw, writeStoredRaw } from '../utils/safeJson';
const EMPTY_SNAPSHOT = () => ({ version: 1, updatedAt: 0, panes: {} });
/* v2: 偏好 key 版本升 v2——v1 里存着 560px 窄树宽，加宽默认(680)对存量用户
 会被旧偏好覆盖；升版本即全部视图布局一次性回新 defaultSize，代价可接受 */
export function layoutStorageKey(scope) {
    return `es-console.layout.v2:${scope.target || 'host'}:${scope.route}:${scope.mode}:${scope.profile}`;
}
function parseSnapshot(raw, constraints) {
    if (!raw)
        return EMPTY_SNAPSHOT();
    try {
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1 || !parsed.panes || typeof parsed.panes !== 'object')
            return EMPTY_SNAPSHOT();
        const panes = {};
        for (const [id, value] of Object.entries(parsed.panes)) {
            if (constraints[id] === undefined && Object.keys(constraints).length > 0)
                continue;
            if (!value || typeof value !== 'object' || !Number.isFinite(value.size))
                continue;
            panes[id] = {
                size: value.size,
                ...(typeof value.collapsed === 'boolean' ? { collapsed: value.collapsed } : {}),
            };
        }
        return {
            version: 1,
            updatedAt: Number.isFinite(parsed.updatedAt) ? Number(parsed.updatedAt) : 0,
            panes,
        };
    }
    catch {
        return EMPTY_SNAPSHOT();
    }
}
function readStorage(key, constraints) {
    try {
        return parseSnapshot(localStorage.getItem(key), constraints);
    }
    catch {
        return EMPTY_SNAPSHOT();
    }
}
export function createLayoutPreferences(scope, constraints = {}) {
    const key = layoutStorageKey(scope);
    const initial = readStorage(key, constraints);
    const snapshot = ref(initial);
    if (initial.updatedAt === 0 && scope.route === '/search') {
        const legacyRaw = readLegacySplit();
        const migrated = migrateLegacySplit(legacyRaw, 'query-builder.tree');
        if (migrated) {
            snapshot.value = {
                version: 1,
                updatedAt: Date.now(),
                panes: { 'query-builder.tree': { size: migrated.size } },
            };
            writeSnapshot(key, snapshot.value);
        }
        /* 迁移成功或确认无旧值后清除遗留键（此前只读不删，localStorage 永久残留） */
        if (legacyRaw != null || migrated) {
            removeStoredRaw(localStorage, 'es_console_qb_split');
        }
    }
    function persist(next) {
        writeStoredRaw(localStorage, key, JSON.stringify(next));
    }
    function writeSnapshot(storageKey, next) {
        writeStoredRaw(localStorage, storageKey, JSON.stringify(next));
    }
    function readLegacySplit() {
        try {
            return localStorage.getItem('es_console_qb_split');
        }
        catch {
            return null;
        }
    }
    function setPane(id, state) {
        if (!Number.isFinite(state.size))
            return;
        const current = readStorage(key, constraints);
        const next = {
            version: 1,
            updatedAt: Date.now(),
            panes: {
                ...current.panes,
                [id]: {
                    size: state.size,
                    ...(typeof state.collapsed === 'boolean' ? { collapsed: state.collapsed } : {}),
                },
            },
        };
        snapshot.value = next;
        persist(next);
    }
    function restorePane(id, pane, available) {
        return clampPaneSize(snapshot.value.panes[id]?.size ?? pane.defaultSize, pane, available);
    }
    function reset() {
        snapshot.value = EMPTY_SNAPSHOT();
        removeStoredRaw(localStorage, key);
    }
    return { key, snapshot, setPane, restorePane, reset };
}
