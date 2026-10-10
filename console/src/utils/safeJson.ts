/* JSON 长整型精度保真。
   致命病灶：ES 文档里 19 位 long ID（如雪花 ID 2018093000000045300）超过
   Number.MAX_SAFE_INTEGER（9007199254740991），原生 JSON.parse 在解析瞬间就把
   尾数抹成 0——表格展示、复制、乃至「读出→编辑→回写」全链路都是失真数据，
   回写即数据污染。根治：解析前把超安全范围的整数字面量加引号转字符串，
   数值保真；ES 的 long 字段接受字符串数字写入，回写无害。 */

const INT_RE = /-?\d{16,}/; // 快速预检：16 位以下整数必然安全，绝大多数响应走零开销通道

/** 判断纯数字串（不含符号）是否超出 JS 安全整数范围 */
function unsafeDigits(digits: string): boolean {
  if (digits.length > 16) return true;
  if (digits.length < 16) return false;
  return digits > '9007199254740991';
}

/** 把 JSON 文本里超出安全范围的整数字面量加引号（字符串内部原样跳过） */
export function quoteBigInts(text: string): string {
  if (!INT_RE.test(text)) return text; // 零开销快速通道
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      /* 字符串字面量整体拷贝，处理转义，绝不误改字符串里的数字 */
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '"') { j++; break; }
        j++;
      }
      out += text.slice(i, j);
      i = j;
      continue;
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      /* 读取完整 number token */
      let j = i;
      if (text[j] === '-') j++;
      const ds = j;
      while (j < n && text[j] >= '0' && text[j] <= '9') j++;
      const digits = text.slice(ds, j);
      /* 小数/科学计数不是整数 ID，原样保留（本就有精度语义） */
      const isFloat = j < n && (text[j] === '.' || text[j] === 'e' || text[j] === 'E');
      if (!isFloat && unsafeDigits(digits)) {
        out += '"' + text.slice(i, j) + '"';
      } else {
        /* float 连尾部一起拷走 */
        if (isFloat) {
          if (text[j] === '.') { j++; while (j < n && text[j] >= '0' && text[j] <= '9') j++; }
          if (j < n && (text[j] === 'e' || text[j] === 'E')) {
            j++;
            if (j < n && (text[j] === '+' || text[j] === '-')) j++;
            while (j < n && text[j] >= '0' && text[j] <= '9') j++;
          }
        }
        out += text.slice(i, j);
      }
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 精度保真版 JSON.parse——api 层统一入口 */
export function parseJsonSafe(text: string): any {
  return JSON.parse(quoteBigInts(text));
}
