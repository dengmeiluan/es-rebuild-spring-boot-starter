/**
 * 530 批 W-D：跨页一次性值携带（link-carry）统一件。
 * 键约定 es-console.link.{key}，sessionStorage 承载，JSON 序列化，取后即焚
 * （receive 读到即 removeItem，二次 receive 恒 null）。所有异常吞掉：
 * send 存储不可用静默失败，receive 存储不可用或非法 JSON 一律返回 null。
 */
export function useLinkCarry<T>(key: string) {
  const K = 'es-console.link.' + key;

  function send(v: T): void {
    try { sessionStorage.setItem(K, JSON.stringify(v)); } catch { /* 存储不可用：静默 */ }
  }

  function receive(): T | null {
    try {
      const raw = sessionStorage.getItem(K);
      if (raw == null) return null;
      /* 先焚再解：解析失败值也不得残留，防下一次进入误吃陈稿 */
      sessionStorage.removeItem(K);
      return JSON.parse(raw) as T;
    } catch { return null; }
  }

  return { send, receive };
}
