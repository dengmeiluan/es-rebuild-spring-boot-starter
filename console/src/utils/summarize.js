export function summarize(values) {
    let count = 0, numCount = 0, sum = 0, min = NaN, max = NaN;
    const seen = new Set();
    for (const v of values) {
        count++;
        seen.add(typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
        if (typeof v === 'number' && Number.isFinite(v)) {
            numCount++;
            sum += v;
            if (numCount === 1 || v < min)
                min = v;
            if (numCount === 1 || v > max)
                max = v;
        }
    }
    return {
        count,
        numCount,
        skipped: count - numCount,
        distinct: seen.size,
        sum: numCount ? sum : 0,
        avg: numCount ? sum / numCount : null,
        min: numCount ? min : null,
        max: numCount ? max : null,
    };
}
