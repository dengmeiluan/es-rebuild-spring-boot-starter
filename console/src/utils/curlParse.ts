/* W6：curl 命令 → {method,path,body} 纯函数。仅解析形态（不校验语义）；识别不了返回 null（调用方提示不动手）。 */
type ParsedCurl = { method: string; path: string; body: string };

export function parseCurl(text: string): ParsedCurl | null {
  if (!text) return null;
  const flat = text
    .replace(/\\\r?\n/g, ' ')   // 反斜杠续行（unix）
    .replace(/\^\r?\n/g, ' ')   // 脱字符续行（windows cmd）
    .replace(/\r?\n/g, ' ')
    .trim();
  if (!/^curl\s/i.test(flat)) return null;
  const tokens: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) tokens.push(m[1] !== undefined ? m[1].replace(/\\"/g, '"') : (m[2] ?? m[3]));
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
