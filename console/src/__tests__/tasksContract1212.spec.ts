/**
 * 1212：路由巡检发现的契约对齐守卫。
 *
 * 背景（可复现的现场）：我写的 mock 替身把 `/cluster/tasks` 返回成 ES 原生的
 * `{ nodes, tasks }` 包装对象，而**真实后端返回的是扁平 List**：
 *   InternalEsIndexRebuildController.clusterTasks(...) → List<Map<String,Object>>
 * TasksView 消费端写的是 `(raw || []).map(...)`，于是整页落到 catch，
 * 用户看到的是「(raw || []).map is not a function + 重试」。
 *
 * 这**不是产品缺陷**（真实后端契约正确、页面在真实契约下正常），但它暴露两个真问题：
 *  ① 测试替身可以与真实契约漂移，而没有任何门禁发现——巡检会把替身的 bug 报成产品的；
 *  ② 消费端的空值兜底 `(raw || [])` 只挡 null/undefined，不挡「形状变了」——
 *     契约一旦从 List 变成对象，整页崩而不是局部降级。
 *
 * 本 spec 锁 ①：把「后端返回 List」与「消费端按数组消费」两侧钉在一起。
 * 不锁 ②：全站只有 2 处这种写法，且后端契约在本仓库内闭合，
 * 为不存在的形状变化加运行时校验属于过度防御（见 AGENTS 的「只在校验边界验证」）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf-8');

const mockSrc = () => read('.tmp/browser/mock.mjs');

describe('1212 /cluster/tasks 契约两侧对齐', () => {
  it('后端返回扁平 List（不是 { nodes, tasks } 包装）', () => {
    const java = read('src/main/java/io/github/dengmeiluan/es/rebuild/web/InternalEsIndexRebuildController.java');
    /* 方法签名必须是 List<Map<String,Object>> —— 这是契约的唯一出处 */
    expect(java).toMatch(/@GetMapping\("cluster\/tasks"\)\s*\n\s*public java\.util\.List<Map<String, Object>> clusterTasks\(/);
  });

  it('前端按数组消费（(raw || []).map），与后端 List 一致', () => {
    const view = read('console/src/views/TasksView.vue');
    expect(view).toMatch(/const raw = await api\.clusterTasks\(/);
    expect(view).toContain('tasks.value = (raw || []).map((t: any) => ({');
  });

  it('浏览器巡检替身也返回扁平数组（否则巡检报的是替身的错）', () => {
    const mock = mockSrc();
    const block = mock.slice(mock.indexOf("p.includes('/cluster/tasks')"));
    const body = block.slice(0, block.indexOf('});') + 3);
    /* 不能出现包装对象的键 */
    expect(body).not.toContain('nodes:');
    expect(body).not.toMatch(/tasks:\s*\[/);
    /* 必须是数组字面量直接返回 */
    expect(body).toMatch(/return json\(res, \[\s*\{/);
  });

  it('替身里的任务字段与消费端读取的键同源（taskId/action/runningTimeNanos）', () => {
    const mock = mockSrc();
    const block = mock.slice(mock.indexOf("p.includes('/cluster/tasks')")).slice(0, 900);
    for (const key of ['taskId', 'action', 'runningTimeNanos', 'startTimeInMillis', 'description']) {
      expect(block).toContain(key);
    }
    /* 消费端确实读这两项（tookMs 折算依赖 runningTimeNanos） */
    const view = read('console/src/views/TasksView.vue');
    expect(view).toContain('runningTimeNanos');
  });
});
