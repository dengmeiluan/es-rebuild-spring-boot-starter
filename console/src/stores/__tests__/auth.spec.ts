import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '../../api';
import { useAuthStore } from '../auth';

/* probe 代际守卫：并发探测乱序完成时只认最新一代。
   防的失败模式——iframe 握手场景无凭证首探的 401 晚于宿主 token 重探的 200 回来，
   旧代 catch 把 me 清回 null，grantedPages 随之退回 null（未启用=全放行），授权静默失守。 */

type Me = { username: string; role: string; fallback: boolean };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let meSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  meSpy = vi.spyOn(api.auth, 'me');
});

afterEach(() => {
  meSpy.mockRestore();
});

describe('auth.probe 代际守卫', () => {
  it('旧代 401 晚于新代 200 回来：已认出身份不被清回 null', async () => {
    const slow = deferred<Me>(); // 旧代（先发、慢回）
    const fast = deferred<Me>(); // 新代（后发、先回）
    meSpy.mockImplementationOnce(() => slow.promise as any)
         .mockImplementationOnce(() => fast.promise as any);
    const auth = useAuthStore();
    const p1 = auth.probe();
    const p2 = auth.probe();

    fast.resolve({ username: 'frank', role: 'ADMIN', fallback: false });
    await p2;
    expect(auth.me?.username).toBe('frank');

    slow.reject(new Error('401'));
    await p1;
    expect(auth.me?.username).toBe('frank'); // 旧代结果被丢弃，身份保留
    expect(auth.probed).toBe(true);
  });

  it('旧代 200 晚于新代 200 回来：最新一代身份获胜（运行期换发场景）', async () => {
    const slow = deferred<Me>();
    const fast = deferred<Me>();
    meSpy.mockImplementationOnce(() => slow.promise as any)
         .mockImplementationOnce(() => fast.promise as any);
    const auth = useAuthStore();
    const p1 = auth.probe();
    const p2 = auth.probe();

    fast.resolve({ username: 'new-token-user', role: 'OPERATOR', fallback: false });
    await p2;
    slow.resolve({ username: 'stale-user', role: 'VIEWER', fallback: true });
    await p1;
    expect(auth.me?.username).toBe('new-token-user');
  });

  it('单代正常路径：401 清身份且 probed 落位', async () => {
    meSpy.mockRejectedValue(new Error('401'));
    const auth = useAuthStore();
    await auth.probe();
    expect(auth.me).toBeNull();
    expect(auth.probed).toBe(true);
  });

  it('认出身份即收遮罩（重探自愈语义不变）', async () => {
    meSpy.mockResolvedValue({ username: 'a', role: 'VIEWER', fallback: false } as any);
    const auth = useAuthStore();
    auth.showLogin = true;
    await auth.probe();
    expect(auth.me?.username).toBe('a');
    expect(auth.showLogin).toBe(false);
  });
});
