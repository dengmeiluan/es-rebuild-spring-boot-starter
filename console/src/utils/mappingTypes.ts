/* W2-1：mapping properties 展平。从 DslQueryView.preloadMapping 的内联 walk 抽出，
   额外产出 field→type 映射（原实现只在 type==='date' 时记 date，其余类型丢弃），
   供查询构建器按类型给出算子候选与值控件。纯函数，可穷举单测。

   行为等价约束（回归网 §1 三态与  pickHistField 都依赖它）：
   - fields 顺序 = 父先子后的深度优先，调用方仍做 [...new Set()].sort()
   - dates 顺序 = 遍历顺序，调用方只做 [...new Set()] 不排序（pickHistField 认首个）
   - 只递归 v.properties，不下钻 multi-fields 的 v.fields */
export function walkMappingTypes(props: unknown, prefix = ''):
  { fields: string[]; dates: string[]; types: Record<string, string> } {
  const fields: string[] = [];
  const dates: string[] = [];
  const types: Record<string, string> = {};
  const walk = (p: unknown, pre: string) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return;
    for (const [k, v] of Object.entries(p as Record<string, any>)) {
      const path = pre ? pre + '.' + k : k;
      fields.push(path);
      if (v && typeof v === 'object') {
        if (typeof v.type === 'string') types[path] = v.type;
        if (v.type === 'date') dates.push(path);
        if (v.properties) walk(v.properties, path);
      }
    }
  };
  walk(props, prefix);
  return { fields, dates, types };
}
