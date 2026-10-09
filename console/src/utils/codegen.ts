/** 三语言代码生成（Kibana Console "Copy as" 同款） */
export type CodeLang = 'curl' | 'js' | 'python';

export function toCurl(method: string, path: string, body?: string, host = 'http://localhost:9200'): string {
  const m = method.toUpperCase();
  let cmd = `curl -X${m} "${host}${path}"`;
  if (body && body.trim()) {
    cmd += ` -H "Content-Type: application/json" -d'\n${body.trim()}\n'`;
  }
  return cmd;
}

export function toJs(method: string, path: string, body?: string, host = 'http://localhost:9200'): string {
  const m = method.toUpperCase();
  const hasBody = body && body.trim();
  return `const resp = await fetch("${host}${path}", {
  method: "${m}",${hasBody ? `
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(${body.trim()}),` : ''}
});
const data = await resp.json();
console.log(data);`;
}

export function toPython(method: string, path: string, body?: string, host = 'http://localhost:9200'): string {
  const m = method.toUpperCase();
  const hasBody = body && body.trim();
  return `import requests

resp = requests.request(
    "${m}",
    "${host}${path}",${hasBody ? `
    headers={"Content-Type": "application/json"},
    json=${pyLiteral(body!.trim())},` : ''}
)
print(resp.json())`;
}

function pyLiteral(json: string): string {
  // 粗略 JSON→Python 字面量（true/false/null → True/False/None，字符串外）
  return json
    .replace(/\btrue\b/g, 'True')
    .replace(/\bfalse\b/g, 'False')
    .replace(/\bnull\b/g, 'None');
}

export function generate(lang: CodeLang, method: string, path: string, body?: string, host?: string): string {
  if (lang === 'js') return toJs(method, path, body, host);
  if (lang === 'python') return toPython(method, path, body, host);
  return toCurl(method, path, body, host);
}
