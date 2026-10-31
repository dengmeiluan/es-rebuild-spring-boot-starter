/* 语法桥：从 translated DSL 抽取 Lucene query_string（启发式）。
 纯函数零依赖——从 SqlBridgeView 抽出，供 DSL/Lucene 工具栏内联复用。

 1229 修掉两处**会给出错误结果**的行为（比"翻不全"严重得多）：
 ① `bool.should` 此前和 must 一起用 `AND` 拼——should 是"任一满足"，拼成 AND 是**收紧**语义。
    现在单 should 组用 `OR` 括起来；若同时存在 must/filter，ES 里 should 只是"加分"，
    query_string 没有这个概念，并入必须条件会收紧、并入 OR 会放宽，两者都会改变结果——
    取**保守（收紧）**并记入 `lossy` 让调用方提示。
 ② `terms` / `prefix` / `multi_match` / `nested` 等此前一律静默吞掉并整体回退 `*`
    （**返回全部文档**，用户以为在过滤其实没过滤）。现在能表达的补上
    （terms→OR 组、prefix→`k:v*`、multi_match→各字段 OR），表达不了的记入 `lossy`。

 `dslToLucene` 旧签名保持返回字符串（既有出口零改动）；需要提示时用 `dslToLuceneDetailed`。 */

function leaf(n: any, lossy: string[]): string {
  if (!n || typeof n !== 'object') return '';
  if (n.term) { const k = Object.keys(n.term)[0]; const v = n.term[k]; const val = typeof v === 'object' ? v.value : v; return `${k}:"${val}"`; }
  if (n.match) { const k = Object.keys(n.match)[0]; const v = n.match[k]; const val = typeof v === 'object' ? v.query : v; return `${k}:${val}`; }
  if (n.match_phrase) { const k = Object.keys(n.match_phrase)[0]; const v = n.match_phrase[k]; return `${k}:"${v}"`; }
  if (n.range) { const k = Object.keys(n.range)[0]; const r = n.range[k]; const lo = r.gte ?? r.gt ?? '*'; const hi = r.lte ?? r.lt ?? '*'; return `${k}:[${lo} TO ${hi}]`; }
  if (n.wildcard) { const k = Object.keys(n.wildcard)[0]; const v = n.wildcard[k]; const val = typeof v === 'object' ? v.value : v; return `${k}:${val}`; }
  /* terms = "任一命中" → OR 组；单值退化成 term 形态 */
  if (n.terms) {
    const k = Object.keys(n.terms)[0]; const vs = n.terms[k];
    if (!Array.isArray(vs) || !vs.length) { lossy.push('terms(空/非数组)'); return ''; }
    if (vs.length === 1) return `${k}:"${vs[0]}"`;
    return '(' + vs.map((v: any) => `${k}:"${v}"`).join(' OR ') + ')';
  }
  /* prefix → k:v*（query_string 原生支持尾通配） */
  if (n.prefix) {
    const k = Object.keys(n.prefix)[0]; const v = n.prefix[k];
    const val = typeof v === 'object' ? v.value : v;
    return `${k}:${val}*`;
  }
  /* multi_match → 各字段 OR 同一查询串 */
  if (n.multi_match) {
    const mm = n.multi_match;
    const q = typeof mm?.query === 'string' ? mm.query : '';
    if (!Array.isArray(mm?.fields) || !mm.fields.length || !q) { lossy.push('multi_match(缺 fields/query)'); return ''; }
    if (mm.fields.length === 1) return `${mm.fields[0]}:${q}`;
    return '(' + mm.fields.map((f: string) => `${f}:${q}`).join(' OR ') + ')';
  }
  if (n.exists) { return `_exists_:${n.exists.field}`; }
  if (n.match_all) return '*';
  /* 其余（nested / has_child / geo_* / knn / script 等）query_string 表达不了。
     旧实现静默跳过 → 整条退化成 '*'，用户以为过滤了其实返回全部。现在记名上报。 */
  const op = Object.keys(n)[0];
  if (op) lossy.push(op);
  return '';
}

/** 内部：连同「无法翻译的子句名」一起返回，供调用方提示 */
export function dslToLuceneDetailed(dslObj: any): { lucene: string; lossy: string[] } {
  const parts: string[] = [];
  const lossy: string[] = [];
  const q = dslObj?.query;
  if (!q) return { lucene: '*', lossy };

  const walk = (node: any): string => {
    if (!node || typeof node !== 'object') return '';
    if (node.bool) {
      const must: string[] = [];
      (node.bool.must || []).forEach((n: any) => { const s = walk(n); if (s) must.push(s); });
      (node.bool.filter || []).forEach((n: any) => { const s = walk(n); if (s) must.push(s); });
      (node.bool.must_not || []).forEach((n: any) => { const s = walk(n); if (s) must.push('NOT ' + s); });
      const shoulds: string[] = [];
      (node.bool.should || []).forEach((n: any) => { const s = walk(n); if (s) shoulds.push(s); });
      if (shoulds.length) {
        const grp = shoulds.length === 1 ? shoulds[0] : '(' + shoulds.join(' OR ') + ')';
        if (must.length) {
          /* 有 must 时 should 只是加分项：并入必须条件=收紧（保守），并留痕 */
          must.push(grp);
          lossy.push('bool.should(原为加分项，已并入必须条件)');
        } else {
          must.push(grp);
        }
      }
      return must.join(' AND ');
    }
    return leaf(node, lossy);
  };

  const s = walk(q);
  if (s) parts.push(s);
  return { lucene: parts.length ? parts.join(' AND ') : '*', lossy };
}

export function dslToLucene(dslObj: any): string {
  return dslToLuceneDetailed(dslObj).lucene;
}
