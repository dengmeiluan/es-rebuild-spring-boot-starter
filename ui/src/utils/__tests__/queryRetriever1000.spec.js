/* 1000 批：retriever 检索器一等化门禁（8.14+ 顶层检索面，query 的继任写法）。
   三条硬契约与 queryAstCorpus 同构：
   ① 每一个合法形态 serialize(parse(x)) 深等于 x（往返无损）；
   ② 六变体全结构化（standard 查询树 / knn 平面向量 / rrf·linear 子数组 / tsr·rule 单子），
     不落 extras 键值表；
   ③ 未注册变体/畸形体整键落 extras 零丢失（全树往返仍一致）。
   嵌套深、字面量括号易错——语料统一走 R/BM25 构造器（deep-equal 与字面量等价）。 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree, emptyTree, parseRetriever, serRetriever } from '../queryAst';
import { RETRIEVER_META, RETRIEVER_PARAMS } from '../queryAstOps';
const R = (op, body) => ({ [op]: body });
const BM25 = (q, extra = {}) => R('standard', { query: q, ...extra });
const KNN = (o) => R('knn', o);
const TSRR = (o) => R('text_similarity_reranker', o);
const RETRIEVER_CORPUS = [
    /* ---- standard：内嵌完整查询树 ---- */
    ['standard', { retriever: BM25({ match_all: {} }) }],
    ['standard-bool', { retriever: BM25({ bool: { must: [{ term: { status: 'active' } }] } }, { k: 100 }) }],
    /* ---- knn：平面字段 + 向量 + 参数 ---- */
    ['knn', { retriever: KNN({ field: 'emb', query_vector: [0.1, 0.2], k: 10, num_candidates: 100 }) }],
    ['knn-min', { retriever: KNN({ field: 'emb', query_vector: [1] }) }],
    ['knn-no-vector', { retriever: KNN({ field: 'emb', k: 5 }) }],
    ['knn-similarity', { retriever: KNN({ field: 'emb', query_vector: [1], similarity: 0.9, boost: 0.4 }) }],
    /* ---- rrf：多路子检索器融合（递归） ---- */
    ['rrf', { retriever: R('rrf', { retrievers: [BM25({ match: { title: 'x' } }), KNN({ field: 'emb', query_vector: [0.5], k: 5 })] }) }],
    ['rrf-params', { retriever: R('rrf', { retrievers: [BM25({ match_all: {} })], rank_constant: 20, rank_window_size: 50 }) }],
    ['rrf-nested', { retriever: R('rrf', { retrievers: [R('rrf', { retrievers: [BM25({ match_all: {} })] })] }) }],
    /* ---- text_similarity_reranker：单子重排 ---- */
    ['tsr', { retriever: TSRR({ retriever: BM25({ match: { text: '公司政策' } }), field: 'semantic_text', inference_text: '年假政策', inference_id: '.rerank-v1' }) }],
    ['tsr-window', { retriever: TSRR({ retriever: KNN({ field: 'emb', query_vector: [0.2] }), field: 't', inference_text: 'q', rank_window_size: 10 }) }],
    /* ---- rule：规则路由（带回退子检索器） ---- */
    ['rule', { retriever: R('rule', { ruleset_id: 'my-rules', match_criteria: { release_branch: 'trunk' }, retriever: BM25({ match_all: {} }) }) }],
    ['rule-no-fallback', { retriever: R('rule', { ruleset_id: 'r1', match_criteria: { env: 'prod' } }) }],
    /* ---- linear：线性加权（每子项 weight 包裹） ---- */
    ['linear', { retriever: R('linear', { retrievers: [{ retriever: BM25({ match: { a: 'x' } }), weight: 0.7 }, { retriever: KNN({ field: 'emb', query_vector: [1] }), weight: 0.3 }], normalizer: 'minmax' }) }],
    ['linear-no-weight', { retriever: R('linear', { retrievers: [{ retriever: BM25({ match_all: {} }) }] }) }],
    /* ---- 深嵌套组合（rrf 外壳 → linear → tsr → standard） ---- */
    ['deep', { retriever: R('rrf', { retrievers: [
                    R('linear', { retrievers: [{ retriever: BM25({ match_all: {} }), weight: 1 }] }),
                    TSRR({ retriever: BM25({ match_all: {} }), field: 'f', inference_text: 't' }),
                ] }) }],
];
const rtTree = (dsl) => {
    const r = parseTree(dsl);
    if (!r.ok)
        throw new Error(r.reason);
    return serializeTree(r.tree);
};
describe('1000 retriever 全量语料往返无损', () => {
    it.each(RETRIEVER_CORPUS)('%s 往返一致', (_name, dsl) => {
        expect(rtTree(dsl)).toEqual(dsl);
    });
});
describe('1000 retriever 结构化覆盖', () => {
    it('六变体全部结构化（不落 extras）', () => {
        for (const [, dsl] of RETRIEVER_CORPUS) {
            const r = parseTree(dsl);
            if (!r.ok)
                throw new Error(r.reason);
            expect(r.tree.retriever, JSON.stringify(dsl)).not.toBeNull();
            expect(r.tree.extras, JSON.stringify(dsl)).toEqual({});
        }
    });
    it('六变体注册表齐员', () => {
        expect(new Set(Object.keys(RETRIEVER_META))).toEqual(new Set(['standard', 'knn', 'rrf', 'text_similarity_reranker', 'rule', 'linear', 'pinned', 'diversify', 'rescorer']));
    });
    it('knn 向量在节点结构面（value），不埋参数表', () => {
        const r = parseTree({ retriever: KNN({ field: 'emb', query_vector: [1, 2], k: 3 }) });
        if (!r.ok)
            throw new Error(r.reason);
        expect(r.tree.retriever.field).toBe('emb');
        expect(r.tree.retriever.value).toEqual([1, 2]);
        expect(r.tree.retriever.params).toEqual({ k: 3 });
    });
    it('linear 每子项伴随键（weight）结构化保留', () => {
        const r = parseTree(RETRIEVER_CORPUS.find(([n]) => n === 'linear')[1]);
        if (!r.ok)
            throw new Error(r.reason);
        const lin = r.tree.retriever;
        expect(lin.children).toHaveLength(2);
        const w = Object.values(lin.childKeys || {}).map(x => x.weight);
        expect(w).toEqual([0.7, 0.3]);
    });
    it('standard 查询体是真 QueryNode 树（bool 结构化非 raw）', () => {
        const r = parseTree({ retriever: BM25({ bool: { must: [{ term: { a: 1 } }] } }) });
        if (!r.ok)
            throw new Error(r.reason);
        expect(r.tree.retriever.query.type).toBe('bool');
    });
    it('parseRetriever/serRetriever 节点级 API 对外可用', () => {
        const n = parseRetriever(R('rrf', { retrievers: [BM25({ match_all: {} })] }));
        expect(n).not.toBeNull();
        expect(serRetriever(n)).toEqual(R('rrf', { retrievers: [BM25({ match_all: {} })] }));
    });
});
describe('1000 retriever 畸形与未注册零丢失', () => {
    const BAD = [
        ['unknown-variant', { retriever: R('ml_model', { model_id: 'x' }) }],
        ['not-object', { retriever: 42 }],
        ['multi-variant-body', { retriever: { ...BM25({ match_all: {} }), ...KNN({ field: 'e', query_vector: [1] }) } }],
        ['standard-no-query', { retriever: R('standard', { k: 10 }) }],
        ['rrf-bad-child', { retriever: R('rrf', { retrievers: [BM25({ match_all: {} }), 42] }) }],
        ['rrf-no-list', { retriever: R('rrf', { rank_constant: 1 }) }],
        ['linear-bad-item', { retriever: R('linear', { retrievers: [{ weight: 1 }] }) }],
    ];
    it.each(BAD)('%s 整键落 extras，全树往返一致', (_name, dsl) => {
        const r = parseTree(dsl);
        if (!r.ok)
            throw new Error(r.reason);
        expect(r.tree.retriever).toBeNull();
        expect(r.tree.extras.retriever).toEqual(dsl.retriever);
        expect(serializeTree(r.tree)).toEqual(dsl);
    });
    it('emptyTree 默认无键（消费方 undefined 防护）', () => {
        const t = emptyTree();
        expect(t.retriever).toBeNull();
        expect(serializeTree(t)).toEqual({});
    });
});
describe('1000 retriever 参数 schema', () => {
    it('各变体常用参数在册（enum/number 档驱动下拉）', () => {
        const keys = (op) => (RETRIEVER_PARAMS[op] || []).map(p => p.key);
        expect(keys('knn')).toEqual(expect.arrayContaining(['k', 'num_candidates', 'similarity']));
        expect(keys('rrf')).toEqual(expect.arrayContaining(['rank_constant', 'rank_window_size']));
        expect(keys('text_similarity_reranker')).toEqual(expect.arrayContaining(['inference_text', 'inference_id', 'rank_window_size']));
        expect(keys('rule')).toContain('ruleset_id');
        expect(keys('linear')).toContain('normalizer');
        expect(keys('standard')).toContain('k');
    });
});
