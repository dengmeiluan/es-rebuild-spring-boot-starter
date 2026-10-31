/**
 * 一千四百一十批：字段候选「按语义自动排序」的生产字段集实证。
 *
 * 用户反复要求「尽可能的智能便捷性字段自动匹配排序」。1077 只锁了角色判定与快捷任务绑定，
 * 缺的是**候选列表真实顺序**：加一个条件时，选字段弹层里第一个该是跟当前算子语义最相关的
 * 那个（match → 标题/正文；terms → 状态/类型；range → 日期/金额）。
 *
 * 判据：用一组生产形态字段（研报/公告/债券混合），跑 searchFields + rolePriorityForOp，
 * 断言每类算子下前三名都属于该类语义——而不是字母序。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { searchFields } from '../utils/fieldSearch';
import { rolePriorityForOp, defaultOpForField, fieldRoleOf } from '../utils/fieldRole';
import type { FieldItem } from '../composables/useIndexFields';

/* 生产形态字段集：故意把「不该排前」的字段名字母序放前面（amount/announcement_title…） */
const FIELDS: FieldItem[] = [
  { path: 'amount', type: 'double' },
  { path: 'announcement_id', type: 'keyword' },
  { path: 'announcement_title', type: 'text' },
  { path: 'bond_code', type: 'keyword' },
  { path: 'content', type: 'text' },
  { path: 'issuer_name', type: 'keyword' },
  { path: 'issuer_type', type: 'keyword' },
  { path: 'publish_time', type: 'date' },
  { path: 'sentiment', type: 'keyword' },
  { path: 'title', type: 'text' },
];

const topNames = (op: string, n = 3): string[] => {
  const r = searchFields({ fields: FIELDS, query: '', cap: 20, rolePriority: rolePriorityForOp(op) });
  return r.flat.slice(0, n).map(h => h.path);
};

describe('1410 字段候选按算子语义自动排序', () => {
  it('match（全文）→ 标题/正文类排在最前', () => {
    const top = topNames('match');
    /* 实测序：content(text) → 标题/主体(entity) → 分类；数值/日期不进前三 */
    expect(top.some(n => ['title', 'announcement_title', 'content'].includes(n)), '前三：' + top.join(',')).toBe(true);
    expect(top).not.toContain('amount');
    expect(top).not.toContain('publish_time');
  });

  it('terms（多值精确）→ 分类/主体类排在最前，纯正文不进前三', () => {
    const top = topNames('terms');
    /* 实测序：issuer_type/sentiment(category) → 标题/主体(entity) → 标识符 */
    expect(['issuer_type', 'sentiment'], '前三：' + top.join(',')).toContain(top[0]);
    expect(top, '纯正文（content）不该进前三').not.toContain('content');
    expect(top).not.toContain('amount');
  });

  it('range（区间）→ 日期/数值类排在最前', () => {
    const top = topNames('range');
    expect(top.some(n => ['publish_time', 'amount'].includes(n)), '前三：' + top.join(',')).toBe(true);
  });

  it('新条件默认算子按字段类型给（不是一律 match）', () => {
    expect(defaultOpForField('publish_time', 'date')).toBe('range');
    expect(defaultOpForField('amount', 'double')).toBe('range');
    expect(defaultOpForField('issuer_type', 'keyword')).toBe('term');
    expect(defaultOpForField('title', 'text')).toBe('match');
    /* 角色兜底：无类型但有度量词根 → range；其余 → term */
    expect(defaultOpForField('trade_amount')).toBe('range');
    expect(defaultOpForField('anything_else')).toBe('term');
  });

  it('角色判定与生产字段语义一致（防止改名/规则漂移把排序搞反）', () => {
    expect(fieldRoleOf('title', 'text')).toBe('entity');
    expect(fieldRoleOf('content', 'text')).toBe('text');
    expect(fieldRoleOf('issuer_type', 'keyword')).toBe('category');
    expect(fieldRoleOf('issuer_name', 'keyword')).toBe('entity');
    expect(fieldRoleOf('bond_code', 'keyword')).toBe('identifier');
    expect(fieldRoleOf('amount', 'double')).toBe('metric');
    expect(fieldRoleOf('publish_time', 'date')).toBe('date');
  });

  it('选字段弹层：字段还空（新加条件）时也必须按角色排序，不能退化成字母序', () => {
    const FS = readFileSync(join(__dirname, '../components/builder/FieldSelect.vue'), 'utf-8');
    /* 1410 实测缺口：此前 rolePriority 被 props.modelValue 门控，空字段时完全不参与排序 */
    expect(FS, 'searchFields 调用点不得再用 modelValue 门控角色序').toMatch(/rolePriority: props\.rolePriority,/);
    expect(FS).not.toMatch(/rolePriority: props\.modelValue \? props\.rolePriority : undefined/);
    /* 局部 rp（组内排序同一门控）也要放开 */
    expect(FS).toMatch(/const rp = props\.rolePriority\?\.length \? props\.rolePriority : null;/);
    expect(FS).not.toMatch(/const rp = props\.modelValue && props\.rolePriority\?\.length/);
  });
});
