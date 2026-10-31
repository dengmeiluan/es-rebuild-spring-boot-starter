/* W6：curl 命令 → {method,path,body} 纯函数。仅解析形态（不校验语义）；识别不了返回 null（调用方提示不动手）。 */
type ParsedCurl = { method: string; path: string; body: string };

/**
 * 1439：把命令结构里的换行拍平成空格，但**保留引号内的换行**（那是请求体数据）。
 * 同时支持两种续行：反斜杠续行（unix `\` + 换行）与脱字符续行（windows `^` + 换行）。
 */
function joinLinesOutsideQuotes(text: string): string {
  let out = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < text.length) { out += ch + text[++i]; continue; }
      if (ch === quote) quote = null;
      out += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; continue; }
    if (ch === '\\' && (text[i + 1] === '\n' || text[i + 1] === '\r')) {
      i++; if (text[i + 1] === '\n') i++;
      out += ' ';
      continue;
    }
    if (ch === '^' && (text[i + 1] === '\n' || text[i + 1] === '\r')) {
      i++; if (text[i + 1] === '\n') i++;
      out += ' ';
      continue;
    }
    if (ch === '\r') { if (text[i + 1] === '\n') i++; out += ' '; continue; }
    if (ch === '\n') { out += ' '; continue; }
    out += ch;
  }
  return out;
}

export function parseCurl(text: string): ParsedCurl | null {
  if (!text) return null;
  /* 1439：只在**引号外**拍平换行。此前无条件 replace(/\r?\n/g,' ')，会把多行 JSON 体
     （`-d "{ ... }"`）里的真实换行也压成空格——body 从此与原始请求不一致，
     而用户正是拿这条命令去别处复跑。引号内的换行是数据，必须原样保留。 */
  const flat = joinLinesOutsideQuotes(text).trim();
  if (!/^curl\s/i.test(flat)) return null;
  const tokens: string[] = [];
  /* POSIX shell 里单引号不能转义自身：表示一个 `'` 要写成 `'\''`（收引号 + \' + 重开），
     于是同一个词会被相邻的多段引号拼起来。codegen 产出的 curl 正是这种形态
     （body 含 `'` 时，如 {"q":"it's"}）。这里把「紧邻、无空白的引号段」合并成一个词，
     与 shell 的拼接语义一致；否则往返会把 body 切碎。 */
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|((?:\\.|[^\s\\])+)/g;
  let m: RegExpExecArray | null;
  let prevEnd = -1;
  while ((m = re.exec(flat))) {
    const val = m[1] !== undefined
      /* 双引号内 shell 只认 \ " $ ` 四种转义，其余反斜杠是字面——按此还原 */
      ? m[1].replace(/\\(["\\$`])/g, '$1')
      : m[2] !== undefined
        ? m[2]
        /* 未加引号的词里 `\'` / `\"` / `\\` 都是 shell 转义：还原成字面字符。 */
        : m[3].replace(/\\(.)/g, '$1');
    if (prevEnd === m.index && tokens.length) tokens[tokens.length - 1] += val;
    else tokens.push(val);
    prevEnd = m.index + m[0].length;
  }
  let method = ''; let url = ''; let body = '';
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '-X' || t === '--request') { method = (tokens[++i] || '').toUpperCase(); continue; }
    if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-ascii') { body = tokens[++i] ?? ''; continue; }
    if (t === '-H' || t === '--header' || t === '-u' || t === '--user' || t === '-A' || t === '--user-agent') { i++; continue; }
    if (t === '--compressed' || t === '-k' || t === '--insecure' || t === '-s' || t === '--silent' || t === '-i' || t === '-v') continue;
    if (!t.startsWith('-') && !url) { url = t; }
  }
  if (!url) return null;
  let path = url.replace(/^https?:\/\/[^/]+/i, '');
  if (!path) path = '/';
  if (!path.startsWith('/')) path = '/' + path;
  if (!method) method = body ? 'POST' : 'GET';
  return { method, path, body };
}
