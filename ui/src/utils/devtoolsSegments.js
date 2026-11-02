function isSepLine(line) {
    const t = line.trim();
    return t === '' || t.startsWith('//');
}
export function splitRequests(body) {
    const out = [];
    if (!body)
        return out;
    const lines = body.split('\n');
    let offset = 0;
    let segStart = -1;
    let segEnd = 0;
    let segLines = [];
    const flush = () => {
        if (segStart >= 0 && segLines.length)
            out.push({ start: segStart, end: segEnd, text: segLines.join('\n') });
        segStart = -1;
        segLines = [];
    };
    for (const line of lines) {
        if (isSepLine(line)) {
            flush();
        }
        else {
            if (segStart < 0)
                segStart = offset;
            segLines.push(line);
            segEnd = offset + line.length;
        }
        offset += line.length + 1;
    }
    flush();
    return out;
}
export function locateSegment(body, cursorOffset) {
    const segs = splitRequests(body);
    if (!segs.length)
        return -1;
    for (let i = 0; i < segs.length; i++) {
        if (cursorOffset >= segs[i].start && cursorOffset <= segs[i].end)
            return i;
    }
    for (let i = 0; i < segs.length; i++) {
        if (cursorOffset < segs[i].start)
            return i;
    }
    return segs.length - 1;
}
