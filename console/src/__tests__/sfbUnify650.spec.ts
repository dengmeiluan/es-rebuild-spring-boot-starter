/* 六百五十批轨4【残余自造过滤框三判据裁决轮】看守（621 ⑥-3 建议落地）。
 *
 * 清点口径：grep `placeholder="过滤` + `class=.*kw` 全量（views+components，.vue）。
 * 三判据裁决：
 *  · 高价值换装 7 面（6 文件）→ SearchFilterBar 单源收编（胶囊壳三件套+Search 图标+Esc
 *    清空内建，落位类归 wrap 父 scoped 照常命中、input-class 仅运行时锚，547/621 范式）：
 *      AnalyzeView tkKw（token 详情过滤，原裸 input 无 Esc 语义=补课）
 *      BoostTunerView fieldKw（字段名过滤）
 *      DslQueryView aggKw（terms 桶行过滤）/ cardsKw（卡片视图过滤；561 批
 *        「统一件归其他批次改造」预告件，本批兑现、负锁翻正）
 *      QueryXrayView term kw（每卡 term 过滤，:model-value 定向 setTvTool 形态）
 *      SecurityView adKw（审计快滤明面，639 G21 语义不变）
 *      MappingFieldTree mft-filter（手作绝对图标胞收编，style 内联 hack 退役，
 *        Enter 定位轮转 @enter 等价接线）
 *  · 刻意保字面豁免（本 spec 记档锁防误收）：JsonTree jt-kw（工具条紧凑「搜索+定位」
 *    混合语义，表格行内嵌场景回归面广留专批）/ ColFilterPopover cfp-kw（弹层表单值输入
 *    非过滤条）/ BoostTuner bt-kw（主查询+datalist 候选）/ QueryXray qx-tv-inp.num
 *    （数值区间输入）。
 *  · 冻结不动：ReconcileReportDrawer rr-kw（tableKernelWave532 运行时锁对方资产，
 *    解冻后随迁——sweep524 既有锁覆盖，此处不重复）。
 * 随迁三 spec（566-C4 纪律）：sweep524（tkKw 锁形）/ boostMgmt525（bt-fkw 锚）/ dqWave561
 * （cardsKw it 重写+SearchFilterBar 负锁翻正+aggKw Esc 锁改 SFB 形态）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('六百五十批：残余自造过滤框换装 SearchFilterBar 单源', () => {
  it('AnalyzeView tkKw：SFB 换装（av-tk-kw-wrap 落位 + av-tk-kw 运行时锚），裸 ipt input 退役', () => {
    const v = src('views/AnalyzeView.vue');
    expect(v).toMatch(
      /<SearchFilterBar v-model="tkKw" class="av-tk-kw-wrap" input-class="av-tk-kw" placeholder="过滤 token \/ 词性…" \/>/,
    );
    expect(v, '裸 input 旧形不得回潮').not.toMatch(/<input v-model="tkKw" class="ipt av-tk-kw"/);
    /* 落位 CSS 随迁（529 宽度钳制锁字面保持） */
    expect(v).toMatch(/\.av-tk-kw-wrap\s*\{[^}]*width:\s*min\(180px, 100%\)/);
  });

  it('BoostTunerView fieldKw：SFB 换装（bt-fkw-wrap 落位 + bt-fkw 运行时锚），v-if 空态语义保留', () => {
    const v = src('views/BoostTunerView.vue');
    expect(v).toMatch(
      /<SearchFilterBar v-if="fields.length" v-model="fieldKw" class="bt-fkw-wrap" input-class="bt-fkw" placeholder="过滤字段名…" \/>/,
    );
    expect(v, '裸 input 旧形不得回潮').not.toMatch(/<input v-if="fields.length" v-model="fieldKw" class="bt-fkw"/);
  });

  it('DslQueryView aggKw：SFB 换装（dq-agg-kw 落位类+mono），Esc 清空转内建', () => {
    const v = src('views/DslQueryView.vue');
    expect(v).toMatch(
      /<SearchFilterBar v-model="aggKw" class="dq-agg-kw mono" placeholder="过滤聚合桶…" \/>/,
    );
    expect(v, '裸 input 旧形不得回潮').not.toMatch(/<input v-model="aggKw"/);
  });

  it('DslQueryView cardsKw：外胞 div+计数 span 结构保留，SFB 入胞（561 负锁翻正）', () => {
    const v = src('views/DslQueryView.vue');
    expect(v).toMatch(/<div v-if="view === 'cards'" class="dq-cards-kw">/);
    expect(v).toMatch(
      /<SearchFilterBar v-model="cardsKw" class="dq-cards-kw-sfb mono" input-class="dq-cards-kw-i" placeholder="过滤卡片（_id \/ 字段值）…" \/>/,
    );
    expect(v).toMatch(/<span v-if="cardsKw.trim\(\)" class="mono dq-json-mc">\{\{ cardHits.length \}\}\/\{\{ resp.hits.length \}\}<\/span>/);
    expect(v, '裸 input 旧形不得回潮').not.toMatch(/<input v-model="cardsKw"/);
  });

  it('QueryXrayView term kw：SFB 换装（qx-tv-kw 落位 + qx-tv-inp 运行时锚），:model-value 定向形态保留', () => {
    const v = src('views/QueryXrayView.vue');
    expect(v).toMatch(
      /<SearchFilterBar v-if="\(tvViewMap\[fname\]\?\.total \?\? 0\) > 20" class="qx-tv-kw" :model-value="tvTools\[fname\]\?\.kw \?\? ''" input-class="qx-tv-inp" placeholder="过滤 term…" @update:model-value="setTvTool\(fname, 'kw', \$event\)" \/>/,
    );
    expect(v, '裸 input 旧形不得回潮').not.toMatch(/<input v-if="\(tvViewMap\[fname\]\?\.total \?\? 0\) > 20" class="qx-tv-inp"/);
    /* 数值区间输入异形不收：num 双输入保字面 */
    expect(v).toMatch(/class="qx-tv-inp num"/);
  });

  it('SecurityView adKw：审计快滤明面 SFB 换装（sv-adkw 落位 + sm-ipt 锚），639 G21 语义零变', () => {
    const v = src('views/SecurityView.vue');
    expect(v).toMatch(
      /<SearchFilterBar v-model="adKw" class="sv-adkw" input-class="sm-ipt" placeholder="过滤用户\/URI\/集群" \/>/,
    );
    expect(v, '裸 input 旧形不得回潮').not.toMatch(/<input v-model="adKw"/);
  });

  it('MappingFieldTree：手作绝对图标胞收编（mft-sfb 落位），内联 padding hack 退役，Enter 定位 @enter 等价', () => {
    const v = src('components/MappingFieldTree.vue');
    expect(v).toMatch(
      /<SearchFilterBar v-model="kwLocal" class="mft-sfb" placeholder="过滤字段名 \/ 类型 \/ analyzer…" @enter="onHitKey" \/>/,
    );
    expect(v, '内联 padding hack 不得回潮').not.toMatch(/style="padding-left:30px"/);
    expect(v, '手作绝对图标壳不得回潮').not.toMatch(/\.mft-filter-ic/);
    expect(v).toMatch(/\.mft-sfb\s*\{[^}]*flex:\s*1/);
  });
});

describe('六百五十批：三判据豁免记档锁（刻意保字面，防误收过收）', () => {
  it('JsonTree jt-kw：工具条紧凑「搜索+定位」混合语义豁免（行内嵌回归面广留专批）', () => {
    expect(src('components/JsonTree.vue')).toMatch(/v-model="kw" class="jt-kw"/);
  });

  it('ColFilterPopover cfp-kw：弹层表单值输入豁免（值/包含两输入非过滤条）', () => {
    const v = src('components/ColFilterPopover.vue');
    expect(v).toMatch(/class="cfp-kw mono"/);
  });

  it('BoostTuner bt-kw：主查询输入+datalist 候选豁免（非过滤条）', () => {
    const v = src('views/BoostTunerView.vue');
    expect(v).toMatch(/class="bt-kw"/);
    expect(v).toMatch(/list="bt-kw-candidates"/);
  });
});
