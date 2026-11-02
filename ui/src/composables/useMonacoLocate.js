import { ref } from 'vue';
export function useMonacoLocate(getEditor) {
    const kw = ref('');
    const count = ref(0);
    const current = ref(0);
    let matches = [];
    function run() {
        const ed = getEditor();
        const model = ed?.getModel?.() ?? null;
        if (!ed || !model || !kw.value) {
            matches = [];
            count.value = 0;
            current.value = 0;
            return;
        }
        try {
            matches = model.findMatches(kw.value, false, false, false, null, false);
        }
        catch {
            matches = []; // 非法 pattern 等异常按无命中处理，不打断输入
        }
        count.value = matches.length;
        current.value = matches.length ? 1 : 0;
        if (matches.length)
            jumpTo(1);
    }
    function jumpTo(idx) {
        const ed = getEditor();
        const m = matches[idx - 1];
        if (!ed || !m)
            return;
        ed.revealLineInCenter(m.range.startLineNumber);
        ed.setPosition({ lineNumber: m.range.startLineNumber, column: m.range.startColumn });
        ed.setSelection(m.range);
        ed.focus();
    }
    function step(dir) {
        if (!matches.length)
            return;
        const n = matches.length;
        current.value = ((current.value - 1 + dir + n) % n) + 1;
        jumpTo(current.value);
    }
    return { kw, count, current, run, next: () => step(1), prev: () => step(-1) };
}
