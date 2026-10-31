/**
 * 1381：拓扑分片格右键。
 *
 * 缺口：TopologyView 的分片格子此前只有「点击跳转定位」。排查分片异常时，
 * 用户真正要做的是把「索引 / 分片号 / 主副 / 所在节点」贴进工单、拼进
 * `_cluster/reroute` 的 exclude 段——只能对着 tooltip 手抄。
 *
 * 约定（与表格右键一致）：一级 ≤3（2 直达 + 1 分组），低频动作进二级。
 *
 * 负控：
 *  ① 去掉一级里的分组 → ② 的分组断言必红；
 *  ② 把 `primary` 判定写成恒 true → ③ 的副本断言必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/TopologyView.vue'), 'utf-8');

function block(): string {
  const i = src.indexOf('const shardMenuItems');
  expect(i, '缺 shardMenuItems').toBeGreaterThan(-1);
  const j = src.indexOf('\n});', i);
  expect(j).toBeGreaterThan(i);
  return src.slice(i, j);
}

describe('1381 拓扑分片右键', () => {
  it('① 分片 <g> 挂 @contextmenu.prevent，且菜单组件挂载', () => {
    expect(src, '分片格必须挂右键').toMatch(/@contextmenu\.prevent="openShardMenu\(\$event, s\)"/);
    expect(src, '菜单必须渲染').toContain(':items="shardMenuItems"');
    expect(src, '无分片数据时不渲染菜单（v-if shardMenu）').toMatch(/<CellContextMenu v-if="shardMenu"/);
  });

  it('② 一级 ≤3 项且含 1 个分组父项（低频动作不许摊到一级）', () => {
    const b = block();
    const top = [...b.matchAll(/^    \{ key: '/gm)].length;
    const groups = [...b.matchAll(/children: \[/g)].length;
    expect(groups, `分组父项数（实际 ${groups}）`).toBe(1);
    expect(top, `一级项数 ${top}`).toBeLessThanOrEqual(3);
    /* 负控 A：键名/节点/reroute 都必须在分组内（不在顶层） */
    for (const k of ['copy-index', 'copy-node', 'copy-reroute']) {
      expect(b, `${k} 必须在分组内`).not.toMatch(new RegExp(`^    \\{ key: '${k}'`, 'm'));
    }
  });

  it('③ 分片标识主副口径正确（p → p 后缀，其余 → r）', () => {
    const b = block();
    expect(b).toMatch(/s\.prirep === 'p' \? 'p' : 'r'/);
    /* 负控 B：详情 JSON 的 primary 必须由 prirep 派生，不能恒 true */
    expect(b).toMatch(/primary: s\.prirep === 'p'/);
    expect(b, 'primary 不能写死 true').not.toMatch(/primary: true/);
    /* docs/store 允许 null（未分配分片无值），不能兜成 0 假装有数据 */
    expect(b).toMatch(/docs: s\.docs \?\? null/);
  });
});
