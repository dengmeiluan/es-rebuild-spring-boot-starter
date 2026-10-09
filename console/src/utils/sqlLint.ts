/**
 * 五百三十四批 P0-3：SQL 静态 lint（SqlConsoleView / SqlBridgeView 划线+banner 双通道消费）。
 * 纯函数、零 Monaco/Vue 依赖，规则可穷举单测；输出 { line, message, suggestion } 行号形态
 * （MonacoEditor.setLineMarkers 行号直射契约，SynonymsManagerView 范式）。
 *
 * 规则宁少勿误报（dslLint 同哲学）——五条：
 *  ① 引号未闭合（单/双引号，'' "" 双写转义；未闭合时只报此一条，其余规则整体跳过——
 *     字符串挖除不可靠，LuceneInput.syntaxIssues 同口径防噪音叠加）
 *  ② 括号不平衡（()[]{} 栈扫描：配对错乱报错位行，残栈报首个未闭合括号行）
 *  ③ FROM 缺表名（FROM 后无表名 token：EOF/标点/保留字开头均缺；引号壳与 ( 子查询算在场）
 *  ④ 保留字拼写（SELECT/FROM/WHERE/GROUP/ORDER 词表编辑距离 ≤2，且只在「词位证据」成立时
 *     提示——后随运算符/函数括号/限定点/保留字即视为标识符用法豁免，列名 form/wheres 等
 *     同形词不误报；GROUP/ORDER 额外要求后随 ≈BY；SELECT 要求语句起始位）
 *  ⑤ 行尾悬空 AND/OR（逐行；大小写不敏感；RANDOM/FOR 等词内命中被 \b 挡住）
 */
import { editDistance } from './editDistance';

interface SqlLintFinding {
  line: number;
  message: string;
  suggestion: string;
}

/** 词法 token（挖除后的掩码文本上切）：word=标识符/数字词，否则单字符符号。 */
interface SqlTok { w: string; word: boolean; line: number }

/** 保留字精确表：两个用途——FROM 缺表名的「后随保留字」判定、拼写候选的「后随词是保留字
 *  → 标识符用法」豁免。收录常用子句/操作词即可（宁小勿误）。 */
const RESERVED = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'BY', 'LIMIT', 'HAVING',
  'AND', 'OR', 'NOT', 'AS', 'ASC', 'DESC', 'BETWEEN', 'IN', 'IS', 'NULL',
  'LIKE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'UNION', 'ALL',
  'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'INTERVAL',
]);

/** 拼写词表（规则④）：GROUP BY / ORDER BY 拆单词判，BY 由词位守卫补验 */
const KW_VOCAB = ['SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER'];

/** 标识符用法豁免的后随符号集：出现即说明该词是名字不是关键字 */
const IDENT_NEXT_SYMS = new Set(['=', '<', '>', '!', '+', '-', '/', ',', ';', ')', '.']);
/* 注意：'*' 不入集——SELECT 后随 * 是关键字证据（语句起始位守卫另行把关，见 ruleKeyword） */

const WORD_RE = /[A-Za-z0-9_$#]/;

function tokenize(s: string, lineOf: (i: number) => number): SqlTok[] {
  const toks: SqlTok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (WORD_RE.test(ch)) {
      let j = i;
      while (j < s.length && WORD_RE.test(s[j])) j++;
      toks.push({ w: s.slice(i, j), word: true, line: lineOf(i) });
      i = j;
    } else {
      toks.push({ w: ch, word: false, line: lineOf(i) });
      i++;
    }
  }
  return toks;
}

/** 词表内最近候选（严格最小才返回；并列/无 ≤2 候选 → null，宁少勿误报）。 */
function nearestKeyword(w: string): string | null {
  let best: string | null = null;
  let bestD = 3;
  let tie = false;
  for (const kw of KW_VOCAB) {
    const d = editDistance(w, kw);
    if (d === 0 || d > 2) continue;
    if (d < bestD) { bestD = d; best = kw; tie = false; }
    else if (d === bestD) tie = true;
  }
  return best && !tie ? best : null;
}

/** 词位证据守卫下的拼写候选判定（kw=nearestKeyword 命中的词表关键字，分支按词表关键字
 *  而非拼错词本身）：返回是否可报。
 *  - GROUP/ORDER：后随词 ≈BY（编辑距离 ≤1）即关键字证据（GROP BY / ORDR BY）；
 *  - SELECT：语句起始位（文首/`;`/`(` 之后）且后随 `*` 或标识符样；
 *  - FROM/WHERE：后随标识符样（非保留词或引号壳）且前驱非保留字（表名位豁免）。
 *  运算符后随/函数括号/限定点三种标识符用法在各分支前置豁免。 */
function keywordTypo(kw: string, t: SqlTok, pv: SqlTok | undefined, nx: SqlTok | undefined, nx2: SqlTok | undefined): boolean {
  if (!nx) return false;
  if (kw === 'GROUP' || kw === 'ORDER') {
    const nxU = nx.word ? nx.w.toUpperCase() : '';
    return !!nxU && editDistance(nxU, 'BY') <= 1;
  }
  if (nx.w === '(') return false; /* 函数调用：COUNT( 之类 */
  if (nx.w === '.' || pv?.w === '.') return false; /* 限定名片段：a.form / form.x */
  const nxIdentLike = nx.word ? !RESERVED.has(nx.w.toUpperCase()) : nx.w === '"' || nx.w === "'";
  if (!nxIdentLike && nx.w !== '*') return false; /* 后随运算符/标点 = 标识符用法 */
  if (kw === 'SELECT') {
    /* 语句起始位才判（列名 selects 等豁免） */
    return !pv || pv.w === ';' || pv.w === '(';
  }
  if (kw === 'FROM' || kw === 'WHERE') {
    if (!nxIdentLike) return false; /* 后随 `*` 只属 SELECT 语义，FROM/WHERE 不判 */
    if (pv && RESERVED.has(pv.w.toUpperCase())) return false; /* 前驱保留字=表名/值位豁免 */
    if (kw === 'FROM' && nx2 && nx2.word && !RESERVED.has(nx2.w.toUpperCase())) return false;
    /* FROM 的表名位后不应再跟普通标识符（别名须 AS）——`select a form t x` 形态存疑不判，
       `select a, b form t where` 的 nx2=WHERE 才出证据（EOF/`;`/保留字跟随均放行） */
    return true;
  }
  return false;
}

/** SQL 静态 lint 主入口。空/全空白输入零误报返回 []。 */
export function lintSql(sql: string): SqlLintFinding[] {
  const out: SqlLintFinding[] = [];
  if (!sql || !sql.trim()) return out;

  /* 行号工具：掩码与原文同索引（串内容挖成空格、换行保留），lineOf 对两者通用 */
  const lineStarts: number[] = [0];
  for (let i = 0; i < sql.length; i++) if (sql[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (idx: number): number => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };

  /* ① 引号未闭合 + 字符串挖除（'' "" 双写转义；串内挖成空格、引号壳保留——表名/串值
     词法上退化为壳 token，行号不变）。 */
  const chars = sql.split('');
  let unclosedLine = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch !== '\'' && ch !== '"') continue;
    let j = i + 1;
    let closed = false;
    while (j < chars.length) {
      if (chars[j] === ch) {
        if (chars[j + 1] === ch) { j += 2; continue; } /* 双写转义 */
        closed = true;
        break;
      }
      j++;
    }
    if (!closed) { unclosedLine = lineOf(i); break; }
    for (let k = i + 1; k < j; k++) if (chars[k] !== '\n') chars[k] = ' ';
    i = j;
  }
  if (unclosedLine) {
    return [{
      line: unclosedLine,
      message: '引号未闭合（缺收尾引号）',
      suggestion: 'SQL 串用单引号、标识符用双引号；串内引号双写转义（两个连续引号表示一个字面引号）',
    }];
  }
  const masked = chars.join('');

  /* ② 括号不平衡（栈扫描：右括号弹栈不配对报错位行；残栈报首个未闭合括号行） */
  {
    const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    const stack: { ch: string; line: number }[] = [];
    let mismatchLine = 0;
    for (let i = 0; i < masked.length; i++) {
      const ch = masked[i];
      if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, line: lineOf(i) });
      else if (ch === ')' || ch === ']' || ch === '}') {
        const top = stack.pop();
        if (!top || top.ch !== PAIRS[ch]) { mismatchLine = lineOf(i); break; }
      }
    }
    if (mismatchLine) {
      out.push({
        line: mismatchLine,
        message: '括号不平衡（()[]{} 配对错乱）',
        suggestion: '检查括号配对：函数调用/子查询的 ( 需有对应 )',
      });
    } else if (stack.length) {
      out.push({
        line: stack[0].line,
        message: `括号不平衡（${stack[0].ch} 未闭合）`,
        suggestion: '补齐对应的闭括号；子查询/函数实参各占一对',
      });
    }
  }

  const toks = tokenize(masked, lineOf);

  /* ③ FROM 缺表名 */
  for (let ti = 0; ti < toks.length; ti++) {
    const t = toks[ti];
    if (!t.word || t.w.toUpperCase() !== 'FROM') continue;
    const nx = toks[ti + 1];
    /* 缺表名形态：EOF / 后随保留字 / 后随标点（引号壳=表名在场、( =子查询，均豁免） */
    const missing = !nx
      || (nx.word && RESERVED.has(nx.w.toUpperCase()))
      || (!nx.word && nx.w !== '"' && nx.w !== "'" && nx.w !== '(');
    if (missing) {
      out.push({
        line: t.line,
        message: 'FROM 缺少表名',
        suggestion: 'FROM 后写目标索引名，如 FROM "my-index"（标识符须双引号包裹）',
      });
    }
  }

  /* ④ 保留字拼写（词位证据守卫，见 keywordTypo） */
  for (let ti = 0; ti < toks.length; ti++) {
    const t = toks[ti];
    if (!t.word) continue;
    const upper = t.w.toUpperCase();
    if (RESERVED.has(upper)) continue;
    const near = nearestKeyword(upper);
    if (near && keywordTypo(near, t, toks[ti - 1], toks[ti + 1], toks[ti + 2])) {
      out.push({
        line: t.line,
        message: `保留字「${t.w}」疑似拼写错误（最接近：${near}）`,
        suggestion: `改为 ${near}；ES SQL 关键字不区分大小写，拼错会被当成列名报 Unknown column`,
      });
    }
  }

  /* ⑤ 行尾悬空 AND/OR（逐行；大小写不敏感；词内命中被 \b 挡住） */
  const maskedLines = masked.split('\n');
  for (let i = 0; i < maskedLines.length; i++) {
    const m = /\b(AND|OR)\s*$/i.exec(maskedLines[i]);
    if (m) {
      out.push({
        line: i + 1,
        message: `行尾悬空 ${m[1].toUpperCase()}：缺右侧条件`,
        suggestion: 'AND/OR 两侧都要有完整条件表达式，或删去行尾悬空的运算符',
      });
    }
  }

  return out;
}
