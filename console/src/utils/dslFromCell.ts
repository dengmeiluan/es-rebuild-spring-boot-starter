/**
 * 二百二十七批：单元格值 → 查询 DSL 生成（dbx 19 种复制 extractor 的 ES 语义对位）。
 *
 * 路由规则：_id → ids；多值（去重后 >1）→ terms；单值按字段类型 text → match、
 * 其余（keyword/数值/日期/布尔/未知）→ term。epoch 毫秒人性化只存在于显示层
 * （epochMsText），本函数直读原始值——日期列给 ES epoch 毫秒它原生接受。
 *
 * 转义边界：term/terms/match/ids 均非 regexp 语法，无需 Lucene 转义，
 * 唯一转义层是 JSON.stringify（调用方对返回对象整体 stringify 落剪贴板）。
 * ⚠ 若未来加 wildcard/query_string 项，必须补 `+-=&amp;&amp;||><!(){}[]^"~*?:\/` 转义。
 */
export function buildDsl(field: string, values: unknown[], fieldType?: string): Record<string, any> | null {
  const vals: unknown[] = [];
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    vals.push(typeof v === 'object' ? JSON.stringify(v) : v);
  }
  if (!vals.length) return null;
  const uniq = [...new Set(vals)];
  if (field === '_id') return { ids: { values: uniq } };
  if (uniq.length > 1) return { terms: { [field]: uniq } };
  const v = uniq[0];
  /* text 字段 term 查不到（分词问题）——text 路由到 match；keyword/数值/未知走 term */
  if (fieldType === 'text') return { match: { [field]: v } };
  return { term: { [field]: v } };
}

/* 二百五十三批：exists 查询——字段存在性检索语义（buildDsl 剔空值的反面：
   找的就是「这列有没有值」）。任意业务列可用（含 text）；_id 恒存在无意义不出项 */
export function buildExistsDsl(field: string): Record<string, any> | null {
  if (!field || field === '_id') return null;
  return { exists: { field } };
}
