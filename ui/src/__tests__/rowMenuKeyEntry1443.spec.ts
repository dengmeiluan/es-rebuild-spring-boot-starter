/**
 * 1443：自定义列表/卡片行的右键菜单补齐键盘入口。
 * 约定（docs/design.md「右键菜单覆盖面」）：新增右键面必须同时补键盘入口与速查面板登记。
 * 统一判据落在 utils/menuKey（ContextMenu 键 / Shift+F10，锚点取行盒左下角）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey } as KeyboardEvent);

/* 每个视图至少一条行级菜单键绑定（字符串精确到行内参数，防同名 handler 互相冒充） */
const ROWS: Array<[string, string]> = [
  ['views/TasksView.vue', '@keydown="onTaskMenuKey($event, t)"'],
  ['views/SnapshotsView.vue', '@keydown="onSnapMenuKey($event, s)"'],
  ['views/AliasesView.vue', '@keydown="onAliasMenuKey($event, g)"'],
  ['views/AliasesView.vue', '@keydown="onAliasRowMenuKey($event, g, r.index, r.isWriteIndex)"'],
  ['views/IndexHubView.vue', '@keydown="onIdxMenuKey($event, idx.index)"'],
  ['views/HealthReportView.vue', '@keydown="onCheckMenuKey($event, c)"'],
  ['views/WatcherView.vue', '@keydown="onWatchMenuKey($event, w)"'],
  ['views/TemplatesView.vue', '@keydown="onTplMenuKey($event, t)"'],
  ['views/IlmView.vue', '@keydown="onIlmMenuKey($event, p)"'],
  ['views/LifecycleView.vue', '@keydown="onLcMenuKey($event, p)"'],
  ['views/SlmView.vue', '@keydown="onSlmMenuKey($event, p)"'],
  ['views/RemoteClustersView.vue', '@keydown="onRcMenuKey($event, r)"'],
  ['views/FavoritesView.vue', '@keydown="onFavMenuKey($event, it)"'],
  ['views/SearchTemplatesView.vue', '@keydown="onTplMenuKey($event, t)"'],
  ['views/TemplateGalleryView.vue', '@keydown="onTgMenuKey($event, t)"'],
  ['views/TopologyView.vue', '@keydown="onShardMenuKey($event, s)"'],
  ['views/ProfileFlameView.vue', '@keydown="onFlameMenuKey($event, n, i)"'],
  ['views/ConfigValidatorView.vue', '@keydown="onIssueMenuKey($event, iss)"'],
  ['views/DiffEditorView.vue', '@keydown="onLineMenuKey($event, l, i)"'],
  ['views/AdhocRebuildView.vue', '@keydown="onDiffMenuKey($event, row)"'],
  ['views/AdhocRebuildView.vue', '@keydown="onRoundMenuKey($event, r)"'],
  ['views/IndexOptimizerView.vue', '@keydown="onRecMenuKey($event, r)"'],
  ['views/AnalysisSettingsView.vue', '@keydown="onItemMenuKey($event, g.key, String(name), cfg)"'],
  ['views/DevToolsView.vue', '@keydown="onTabMenuKey($event, i)"'],
  ['views/DevToolsView.vue', '@keydown="onRespRowMenuKey($event, r, ri)"'],
  ['views/XmigrateView.vue', '@keydown="onJobMenuKey($event, rowJob(row))"'],
  ['views/IndexSettingsView.vue', '@keydown="openRowMenu($event)"'],
  ['views/RestView.vue', '@keydown="onRespMenuKey"'],
  ['components/QueryHistoryPanel.vue', '@keydown="onRowMenuKey($event, it)"'],
  ['components/SettingsGrid.vue', '@keydown="onRowMenuKey($event, r)"'],
  ['components/MappingFieldTree.vue', '@keydown="onRowMenuKey($event, f)"'],
  ['components/ExplainTree.vue', '@keydown="onCtxKey($event)"'],
  ['components/DocDiffModal.vue', '@keydown="onCellMenuKey($event, r, -1)"'],
  ['components/builder/AggTreeNode.vue', '@keydown.self="onRowMenuKey"'],
  ['components/builder/BoolGroupNode.vue', '@keydown.self="onRowMenuKey"'],
  ['components/builder/ClauseNode.vue', '@keydown.self="onRowMenuKey"'],
  ['components/builder/MultiNodeRow.vue', '@keydown.self="onRowMenuKey"'],
  ['components/builder/WrapNodeRow.vue', '@keydown.self="onRowMenuKey"'],
  ['components/builder/RootExtrasPane.vue', '@keydown.self="onSortMenuKey($event, s, i)"'],
  ['components/builder/RootExtrasPane.vue', '@keydown.self="onHlMenuKey($event, i)"'],
];

describe('1443 行级右键菜单键盘入口', () => {
  it('menuKey 判据：ContextMenu / Shift+F10 命中，F10 单独与 Enter 不命中', () => {
    expect(isMenuKey(key('ContextMenu'))).toBe(true);
    expect(isMenuKey(key('F10', true))).toBe(true);
    expect(isMenuKey(key('F10'))).toBe(false);
    expect(isMenuKey(key('Enter'))).toBe(false);
    expect(isMenuKey(key(' '))).toBe(false);
  });

  it('锚点取当前行盒左下角 +12px，无元素时回落 0,0', () => {
    const row = { currentTarget: { getBoundingClientRect: () => ({ left: 10, bottom: 40 }) } };
    expect(menuKeyAnchor(row as any)).toEqual({ x: 22, y: 40 });
    expect(menuKeyAnchor({ currentTarget: null })).toEqual({ x: 0, y: 0 });
  });

  it('全部自定义行都绑定菜单键，并且共用同一判据/锚点', () => {
    const seen = new Set<string>();
    for (const [file, anchor] of ROWS) {
      const s = src(file);
      expect(s, `${file} 缺 ${anchor}`).toContain(anchor);
      expect(s, `${file} 未接入 isMenuKey`).toContain('isMenuKey');
      expect(s, `${file} 未接入 menuKeyAnchor`).toContain('menuKeyAnchor');
      seen.add(file);
    }
    expect(seen.size).toBe(36);
  });

  it('TemplatesView 不再使用匹配不到 ContextMenu 的 @keydown.menu 修饰符', () => {
    const s = src('views/TemplatesView.vue');
    expect(s).not.toContain('@keydown.menu');
    expect(s).toMatch(/function onTplMenuKey\(e: KeyboardEvent/);
  });

  it('行列可聚焦或原本已可聚焦：新接入的行都补了 tabindex', () => {
    for (const file of [
      'views/SnapshotsView.vue',
      'views/AliasesView.vue',
      'views/HealthReportView.vue',
      'views/WatcherView.vue',
      'views/IlmView.vue',
      'views/LifecycleView.vue',
      'views/SlmView.vue',
      'views/RemoteClustersView.vue',
      'views/FavoritesView.vue',
      'views/TemplateGalleryView.vue',
      'views/ProfileFlameView.vue',
      'views/ConfigValidatorView.vue',
      'views/DiffEditorView.vue',
      'views/AdhocRebuildView.vue',
      'views/IndexOptimizerView.vue',
      'views/AnalysisSettingsView.vue',
    ]) {
      expect(src(file), `${file} 行不可聚焦`).toContain('tabindex="0"');
    }
  });

  it('快捷键速查面板登记了列表/卡片行入口', () => {
    const hk = src('components/HotkeyPanel.vue');
    expect(hk).toContain('列表/卡片行（任务、快照、别名、索引、体检项、告警、策略、模板、校验、差分行、火焰图、查询记录行、设置行、mapping 字段、explain 行、文档差异格、构建器条件/聚合行、DevTools 标签/响应行）');
    expect(hk).toContain('Shift+F10 同效');
  });
});
