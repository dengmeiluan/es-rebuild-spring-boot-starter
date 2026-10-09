/* 语法桥：从 translated DSL 抽取 Lucene query_string（启发式）。
   纯函数零依赖——从 SqlBridgeView 抽出，供 DSL/Lucene 工具栏内联复用。
   识别 bool(must/filter/should/must_not) + term/match/match_phrase/range/wildcard/exists/match_all，
   无法识别的叶子子句静默跳过；整体无命中回退 '*'。 */

function leaf(n: any): string {
  if (!n || typeof n !== 'object') return '';
  if (n.term) { const k = Object.keys(n.term)[0]; const v = n.term[k]; const val = typeof v === 'object' ? v.value : v; return `${k}:"${val}"`; }
  if (n.match) { const k = Object.keys(n.match)[0]; const v = n.match[k]; const val = typeof v === 'object' ? v.query : v; return `${k}:${val}`; }
  if (n.match_phrase) { const k = Object.keys(n.match_phrase)[0]; const v = n.match_phrase[k]; return `${k}:"${v}"`; }
  if (n.range) { const k = Object.keys(n.range)[0]; const r = n.range[k]; const lo = r.gte ?? r.gt ?? '*'; const hi = r.lte ?? r.lt ?? '*'; return `${k}:[${lo} TO ${hi}]`; }
  if (n.wildcard) { const k = Object.keys(n.wildcard)[0]; const v = n.wildcard[k]; const val = typeof v === 'object' ? v.value : v; return `${k}:${val}`; }
  if (n.exists) { return `_exists_:${n.exists.field}`; }
  if (n.match_all) return '*';
  return '';
}

export function dslToLucene(dslObj: any): string {
  const parts: string[] = [];
  const q = dslObj?.query;
  if (!q) return '*';
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.bool) {
      (node.bool.must || []).forEach(walk);
      (node.bool.filter || []).forEach(walk);
      (node.bool.must_not || []).forEach((n: any) => { const s = leaf(n); if (s) parts.push('NOT ' + s); });
      (node.bool.should || []).forEach(walk);
      return;
    }
    const s = leaf(node); if (s) parts.push(s);
  };
  walk(q);
  return parts.length ? parts.join(' AND ') : '*';
}
