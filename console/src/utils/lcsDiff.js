export function lcsDiffLines(a, b) {
    const n = a.length;
    const m = b.length;
    const out = [];
    /* 防御上限:行积超限退化为线性对齐(前缀 eq + 余量 del/add),不炸内存 */
    if (n * m > 4000000) {
        const common = Math.min(n, m);
        for (let i = 0; i < common; i++)
            out.push({ op: a[i] === b[i] ? 'eq' : 'del', tx: a[i] });
        for (let i = common; i < n; i++)
            out.push({ op: 'del', tx: a[i] });
        for (let j = common; j < m; j++)
            out.push({ op: 'add', tx: b[j] });
        return out;
    }
    /* dp[i][j] = a[i..] 与 b[j..] 的 LCS 长度 */
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            out.push({ op: 'eq', tx: a[i] });
            i++;
            j++;
        }
        else if (dp[i + 1][j] >= dp[i][j + 1]) {
            out.push({ op: 'del', tx: a[i] });
            i++;
        }
        else {
            out.push({ op: 'add', tx: b[j] });
            j++;
        }
    }
    while (i < n)
        out.push({ op: 'del', tx: a[i++] });
    while (j < m)
        out.push({ op: 'add', tx: b[j++] });
    return out;
}
