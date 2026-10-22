<template>
  <div class="rx">
    <!-- v4 参数条：横向 chips（点击 chip 切换展开），展开内容全宽显示在条下方——
 参数区从左树底部上移为横贯参数条，与编辑器/结果区纵向分层不再割裂 -->
    <!-- chips 键盘导航——←→/Home/End 在 chips 间移动焦点（W3C APG roving），
 Enter/Space 原生触发 toggle（chip=button）；Tab 逐个可达不变，导航是纯增强 -->
    <div class="rx-chips" @keydown="onChipsKeydown">
      <!-- ·实报「无效控制」：分页胶囊（size/from 输入）退役——执行链里
 from 恒被 (page-1)*pageSize 覆盖、size 恒被分页档接管（562 联动后彻底成为
 分页器的重复入口），两个输入框作为「ES 检索参数」意义为零。分页唯一入口=
 表格工具行分页器；DSL 手写档外 size（如 500）仍真实生效（执行链不注入）。
 旧草稿树里的 size/from 键原样保留（序列化直通，用户可见可手删）。 -->
      <button type="button" class="rx-chip" :class="{ on: open.has('sort') }" @click="toggle('sort')">
        <span class="rx-cn">排序</span><code class="rx-key">sort</code>
        <span class="rx-state" :class="{ on: !!tree.sort?.length }">{{ tree.sort?.length ? tree.sort.length + ' 项' : '未设置' }}</span>
      </button>
      <button type="button" class="rx-chip" :class="{ on: open.has('src') }" @click="toggle('src')">
        <span class="rx-cn">字段裁剪</span><code class="rx-key">_source</code>
        <span class="rx-state" :class="{ on: !!tree.source }">{{ tree.source ? SRC_LABEL[tree.source.mode] : '默认全部' }}</span>
      </button>
      <button type="button" class="rx-chip" :class="{ on: open.has('hl') }" @click="toggle('hl')">
        <span class="rx-cn">高亮</span><code class="rx-key">highlight</code>
        <span class="rx-state" :class="{ on: !!tree.highlight?.fields.length }">{{ tree.highlight?.fields.length ? tree.highlight.fields.length + ' 项' : '未启用' }}</span>
      </button>
      <button type="button" class="rx-chip" :class="{ on: open.has('aggs') }" @click="toggle('aggs')">
        <span class="rx-cn">聚合</span><code class="rx-key">{{ tree.aggKey || 'aggs' }}</code>
        <span class="rx-state" :class="{ on: !!tree.aggs?.length }">{{ tree.aggs?.length ? tree.aggs.length + ' 项' : '未设置' }}</span>
      </button>
      <!-- 987：post_filter / collapse / knn 三键一等公民化（extras 键值表升格结构化编辑） -->
      <button type="button" class="rx-chip" :class="{ on: open.has('pf') }" title="聚合后过滤：命中统计含全部文档，返回结果按此过滤（post_filter）" @click="toggle('pf')">
        <span class="rx-cn">后置过滤</span><code class="rx-key">post_filter</code>
        <span class="rx-state" :class="{ on: !!tree.postFilter }">{{ tree.postFilter ? '已设置' : '未设置' }}</span>
      </button>
      <button type="button" class="rx-chip" :class="{ on: open.has('col') }" title="字段折叠：按字段值收敛命中（collapse）" @click="toggle('col')">
        <span class="rx-cn">折叠</span><code class="rx-key">collapse</code>
        <span class="rx-state" :class="{ on: !!tree.collapse }">{{ tree.collapse?.field || '未设置' }}</span>
      </button>
      <button type="button" class="rx-chip" :class="{ on: open.has('knn') }" title="向量近邻检索（knn）" @click="toggle('knn')">
        <span class="rx-cn">向量检索</span><code class="rx-key">knn</code>
        <span class="rx-state" :class="{ on: !!tree.knn }">{{ tree.knn?.field || '未设置' }}</span>
      </button>
      <button type="button" class="rx-chip" :class="{ on: open.has('sug') }" title="搜索建议（suggest：term/phrase/completion）" @click="toggle('sug')">
        <span class="rx-cn">搜索建议</span><code class="rx-key">suggest</code>
        <span class="rx-state" :class="{ on: !!tree.suggest?.items.length }">{{ tree.suggest?.items.length ? tree.suggest.items.length + ' 项' : '未设置' }}</span>
      </button>
      <button type="button" class="rx-chip" :class="{ on: open.has('rc') }" title="重打分：首屏按 query 相关性排序，再对前 N 条用 rescore_query 二次打分（rescore）" @click="toggle('rc')">
        <span class="rx-cn">重打分</span><code class="rx-key">rescore</code>
        <span class="rx-state" :class="{ on: !!tree.rescore }">{{ tree.rescore ? '已设置' : '未设置' }}</span>
      </button>
      <button type="button" class="rx-chip" :class="{ on: open.has('ex') }" @click="toggle('ex')">
        <span class="rx-cn">其他顶层键</span>
        <span class="rx-state" :class="{ on: !!Object.keys(tree.extras).length }">{{ Object.keys(tree.extras).length ? Object.keys(tree.extras).length + ' 个键' : '无' }}</span>
      </button>
    </div>

    <!-- 分页展开表单随胶囊退役（size/from 无效控制，见上注释） -->

    <!-- 排序 -->
    <div v-if="open.has('sort')" class="rx-open">
      <div v-if="tree.sort === null" class="rx-none">未设置 <button class="btn sm ghost rx-sort-add" @click="addSort">+ 加排序</button></div>
      <div v-for="(s, i) in tree.sort || []" :key="s.id" class="rx-sort-row">
        <!-- 排序行字段选择器只出可排序类型（ES doc_values 口径，含 boolean）；
 【W3b】候选内 date/数值族置顶（typePriority 只重排分组，候选集不变） -->
        <FieldSelect :model-value="s.field" :fields="fields" :types="types" :type-filter="SORTABLE_TYPES" :type-priority="SORT_PRIO_TYPES" @update:model-value="v => patchSort(s.id, { field: v })" />
        <select class="inp rx-sort-order" :value="String(s.params.order ?? 'asc')"
                @change="patchSort(s.id, { params: { ...s.params, order: ($event.target as HTMLSelectElement).value } })">
          <option value="asc">asc</option>
          <option value="desc">desc</option>
        </select>
        <button aria-label="参数（missing/unmapped_type…）" class="btn sm ghost" title="参数（missing/unmapped_type…）" @click="sortParamsId = sortParamsId === s.id ? null : s.id"><Settings2 :size="12" /></button>
        <button aria-label="上移" class="btn sm ghost" title="上移" :disabled="i === 0" @click="moveSort(i, -1)"><ChevronUp :size="12" /></button>
        <button aria-label="下移" class="btn sm ghost" title="下移" :disabled="i === (tree.sort?.length || 1) - 1" @click="moveSort(i, 1)"><ChevronDown :size="12" /></button>
        <button aria-label="删除" class="btn sm ghost danger" title="删除" @click="delSort(s.id)"><X :size="12" /></button>
        <div v-if="sortParamsId === s.id" class="rx-sub">
          <GenericParams :value="s.params" path-prefix="" @update="v => onSortParams(s.id, v)" />
        </div>
      </div>
      <!-- 空数组态也要有加排序入口——删光排序行/DSL 带空 sort 后此前无任何入口（通病修复） -->
      <div v-if="tree.sort !== null && !tree.sort.length" class="rx-none">
排序列表为空（DSL 保留 sort: []）
        <button class="btn sm ghost rx-sort-add" @click="addSort">+ 加排序</button>
      </div>
    </div>

    <!-- 字段裁剪 _source -->
    <div v-if="open.has('src')" class="rx-open">
      <div v-if="!tree.source" class="rx-none">
ES 默认返回全部字段
        <button class="btn sm ghost rx-src-set" @click="setSource('list')">裁剪</button>
      </div>
      <template v-else>
        <div class="rx-row">
          <select class="inp rx-src-mode" :value="tree.source.mode"
                  @change="setSource(($event.target as HTMLSelectElement).value as SourceSpec['mode'])">
            <option value="all">全部</option>
            <option value="none">不返回</option>
            <option value="one">单字段</option>
            <option value="list">字段列表</option>
            <option value="pattern">includes/excludes</option>
          </select>
          <button aria-label="移除 _source 键" class="btn sm ghost danger" title="移除 _source 键" @click="patch({ source: null })"><X :size="12" /></button>
        </div>
        <FieldPicker v-if="tree.source.mode === 'one'" class="rx-src-fields" width="100%"
               :model-value="tree.source.fields[0] || ''" :index="index || ''" placeholder="字段名"
               @update:model-value="(v: string) => setSrcFields([v])" />
        <FieldPicker v-if="tree.source.mode === 'list'" class="rx-src-fields" width="100%" multi
               :model-value="tree.source.fields.join(', ')" :index="index || ''" placeholder="逗号分隔字段"
               @update:model-value="(v: string) => setSrcFields(csv(v))" />
        <template v-if="tree.source.mode === 'pattern'">
          <input class="inp mono" :value="tree.source.includes.join(', ')" placeholder="includes 通配，逗号分隔"
                 @input="setSrcPattern('includes', ($event.target as HTMLInputElement).value)" />
          <input class="inp mono" :value="tree.source.excludes.join(', ')" placeholder="excludes 通配，逗号分隔"
                 @input="setSrcPattern('excludes', ($event.target as HTMLInputElement).value)" />
        </template>
      </template>
    </div>

    <!-- 高亮 -->
    <div v-if="open.has('hl')" class="rx-open">
      <div v-if="!tree.highlight" class="rx-none">
命中字段不加颜色
        <button class="btn sm ghost rx-hl-set" @click="hlSet">启用</button>
      </div>
      <template v-else>
        <div v-for="(f, i) in tree.highlight.fields" :key="i" class="rx-hl-row">
          <!-- 高亮行只出可分词高亮的文本类字段（text/keyword）；
 【W3b】候选内 text 置顶（全文高亮主场景是分词字段） -->
          <FieldSelect :model-value="f.name" :fields="fields" :types="types" :type-filter="HL_TYPES" :type-priority="HL_PRIO_TYPES" @update:model-value="v => hlPatchField(i, { name: v })" />
          <button aria-label="字段参数（fragment_size…）" class="btn sm ghost" title="字段参数（fragment_size…）" @click="hlParamsIdx = hlParamsIdx === i ? null : i"><Settings2 :size="12" /></button>
          <button aria-label="删除" class="btn sm ghost danger" title="删除" @click="hlDelField(i)"><X :size="12" /></button>
          <div v-if="hlParamsIdx === i" class="rx-sub">
            <GenericParams :value="f.params" path-prefix="" @update="v => onHlFieldParams(i, v)" />
          </div>
        </div>
        <div class="rx-row">
          <button class="btn sm ghost rx-hl-add" @click="hlAddField"><Plus :size="12" /> 高亮字段</button>
          <button aria-label="全局参数（pre_tags/post_tags…）" class="btn sm ghost" :class="{ on: hlGlobal }" title="全局参数（pre_tags/post_tags…）" @click="hlGlobal = !hlGlobal"><Settings2 :size="12" /></button>
          <span style="flex:1"></span>
          <button aria-label="移除 highlight 键" class="btn sm ghost danger" title="移除 highlight 键" @click="patch({ highlight: null })"><X :size="12" /></button>
        </div>
        <div v-if="hlGlobal" class="rx-sub">
          <GenericParams :value="tree.highlight.params" path-prefix="" @update="onHlGlobalParams" />
        </div>
      </template>
    </div>

    <!-- 聚合 -->
    <div v-if="open.has('aggs')" class="rx-open">
      <div v-if="tree.aggs === null" class="rx-none">
未设置
        <button class="btn sm ghost rx-agg-set" @click="aggAdd">添加聚合</button>
      </div>
      <template v-else>
        <AggTreeNode
          v-for="a in tree.aggs" :key="a.id" :node="a" :fields="fields" :types="types"
          @update:node="n => aggPatch(a.id, n)" @remove="aggDel(a.id)"
        />
        <div class="rx-row">
          <button class="btn sm ghost rx-agg-add" @click="aggAdd"><Plus :size="12" /> 顶层聚合</button>
          <span style="flex:1"></span>
          <button aria-label="移除聚合键" class="btn sm ghost danger" title="移除聚合键" @click="patch({ aggs: null })"><X :size="12" /></button>
        </div>
      </template>
    </div>

    <!-- 987：后置过滤 post_filter（QueryNode 树编辑，MiniTreeEditor 承载） -->
    <div v-if="open.has('pf')" class="rx-open">
      <div v-if="!tree.postFilter" class="rx-none">
聚合后过滤（命中统计含全部文档，仅返回结果被过滤）
        <button class="btn sm ghost rx-pf-add" @click="pfAdd">+ 加后置过滤</button>
      </div>
      <template v-else>
        <MiniTreeEditor :node="tree.postFilter" :fields="fields" :types="types" @update:node="pfUpdate" />
        <div class="rx-row">
          <span style="flex:1"></span>
          <button aria-label="移除 post_filter 键" class="btn sm ghost danger" title="移除 post_filter 键" @click="patch({ postFilter: null })"><X :size="12" /></button>
        </div>
      </template>
    </div>

    <!-- 987：字段折叠 collapse（路由字段 + 其余参数） -->
    <div v-if="open.has('col')" class="rx-open">
      <div v-if="!tree.collapse" class="rx-none">
按字段值收敛命中（每组只返回代表文档）
        <button class="btn sm ghost rx-col-add" @click="colAdd">+ 加折叠</button>
      </div>
      <template v-else>
        <div class="rx-row">
          <FieldSelect :model-value="tree.collapse.field" :fields="fields" :types="types" :type-filter="COLLAPSE_TYPES" @update:model-value="v => colPatch({ field: v })" />
          <button aria-label="折叠参数（inner_hits…）" class="btn sm ghost" :class="{ on: colParams }" title="折叠参数（inner_hits…）" @click="colParams = !colParams"><Settings2 :size="12" /></button>
          <span style="flex:1"></span>
          <button aria-label="移除 collapse 键" class="btn sm ghost danger" title="移除 collapse 键" @click="patch({ collapse: null })"><X :size="12" /></button>
        </div>
        <div v-if="colParams" class="rx-sub">
          <GenericParams :value="tree.collapse.params" path-prefix="" @update="onColParams" />
        </div>
      </template>
    </div>

    <!-- 987：向量近邻 knn（路由字段 + 向量 JSON + 其余参数） -->
    <div v-if="open.has('knn')" class="rx-open">
      <div v-if="!tree.knn" class="rx-none">
向量近邻检索（dense_vector 字段）
        <button class="btn sm ghost rx-knn-add" @click="knnAdd">+ 加向量检索</button>
      </div>
      <template v-else>
        <div class="rx-row">
          <FieldSelect :model-value="tree.knn.field || ''" :fields="fields" :types="types" :type-filter="KNN_TYPES" @update:model-value="v => knnPatch({ field: v || null })" />
          <button aria-label="kNN 参数（k/num_candidates/filter…）" class="btn sm ghost" :class="{ on: knnParams }" title="kNN 参数（k/num_candidates/filter…）" @click="knnParams = !knnParams"><Settings2 :size="12" /></button>
          <span style="flex:1"></span>
          <button aria-label="移除 knn 键" class="btn sm ghost danger" title="移除 knn 键" @click="patch({ knn: null })"><X :size="12" /></button>
        </div>
        <div class="rx-row">
          <span class="rx-lb">query_vector</span>
          <input class="inp mono rx-knn-vec" :class="{ warn: knnVecBad }" :value="knnVecText"
                 placeholder='向量 JSON 数组，如 [0.1, 0.2, 0.3]'
                 @input="onKnnVec(($event.target as HTMLInputElement).value)" />
        </div>
        <div v-if="knnParams" class="rx-sub">
          <GenericParams :value="tree.knn.params" path-prefix="" @update="onKnnParams" />
        </div>
      </template>
    </div>

    <!-- 989：搜索建议 suggest（项级结构化：名称 + text + suggester 类型体 rest） -->
    <div v-if="open.has('sug')" class="rx-open">
      <div v-if="!tree.suggest" class="rx-none">
搜索建议调试（term 纠错 / phrase 短语 / completion 补全）
        <button class="btn sm ghost rx-sug-add" @click="sugAdd">+ 加建议</button>
      </div>
      <template v-else>
        <div v-for="(s, i) in tree.suggest.items" :key="i" class="rx-sug-row">
          <input class="inp mono rx-sug-name" :value="s.name" placeholder="建议名" title="建议项名称（DSL 顶层键名）"
                 @input="sugPatch(i, { name: ($event.target as HTMLInputElement).value })" />
          <input class="inp rx-sug-text" :value="s.hasText ? String(s.text ?? '') : ''" placeholder="text（待纠错文本）"
                 @input="onSugText(i, ($event.target as HTMLInputElement).value)" />
          <button aria-label="建议参数（suggester 体）" class="btn sm ghost" :class="{ on: sugIdx === i }" title="建议参数（term/phrase/completion 体）" @click="sugIdx = sugIdx === i ? null : i"><Settings2 :size="12" /></button>
          <button aria-label="删除建议" class="btn sm ghost danger" title="删除建议" @click="sugDel(i)"><X :size="12" /></button>
          <div v-if="sugIdx === i" class="rx-sub">
            <GenericParams :value="s.rest" path-prefix="" @update="v => onSugRest(i, v)" />
          </div>
        </div>
        <div class="rx-row">
          <button class="btn sm ghost rx-sug-add2" @click="sugAdd"><Plus :size="12" /> 加建议</button>
          <button v-if="!tree.suggest.hasGlobalText" class="btn sm ghost rx-sug-gtext" title="全局 text：所有建议项共享的待纠错文本" @click="sugGlobalText">+ 全局 text</button>
          <span style="flex:1"></span>
          <button aria-label="移除 suggest 键" class="btn sm ghost danger" title="移除 suggest 键" @click="patch({ suggest: null })"><X :size="12" /></button>
        </div>
        <div v-if="tree.suggest.hasGlobalText" class="rx-row">
          <span class="rx-lb">全局 text</span>
          <input class="inp rx-sug-text" :value="String(tree.suggest.globalText ?? '')" placeholder="所有建议项共享"
                 @input="sugPatchGlobal(($event.target as HTMLInputElement).value)" />
        </div>
      </template>
    </div>

    <!-- 991：重打分 rescore（window_size + 重打分查询树编辑 + query 权重参数） -->
    <div v-if="open.has('rc')" class="rx-open">
      <div v-if="!tree.rescore" class="rx-none">
首屏排序后再对前 N 条二次打分（相关性调优）
        <button class="btn sm ghost rx-rc-add" @click="rcAdd">+ 加重打分</button>
      </div>
      <template v-else>
        <div class="rx-row">
          <label class="rx-lb" for="rc-ws">window_size</label>
          <input id="rc-ws" class="inp mono rx-num" :value="tree.rescore.hasWindowSize ? String(tree.rescore.windowSize ?? '') : ''"
                 placeholder="如 10" title="参与重打分的首屏条数（可留空 = ES 默认）"
                 @input="onRcWindow(($event.target as HTMLInputElement).value)" />
          <button aria-label="重打分参数（query_weight/rescore_query_weight…）" class="btn sm ghost" :class="{ on: rcParams }" title="重打分参数（query_weight/rescore_query_weight…）" @click="rcParams = !rcParams"><Settings2 :size="12" /></button>
          <span style="flex:1"></span>
          <button aria-label="移除 rescore 键" class="btn sm ghost danger" title="移除 rescore 键" @click="patch({ rescore: null })"><X :size="12" /></button>
        </div>
        <div class="rx-row">
          <span class="rx-lb">重打分查询</span>
        </div>
        <MiniTreeEditor v-if="tree.rescore.rescoreQuery" :node="tree.rescore.rescoreQuery" :fields="fields" :types="types" @update:node="rcUpdate" />
        <div v-if="rcParams" class="rx-sub">
          <GenericParams :value="tree.rescore.params" path-prefix="" @update="onRcParams" />
        </div>
      </template>
    </div>

    <!-- extras：其余顶层键 -->
    <div v-if="open.has('ex')" class="rx-open rx-ex">
      <div v-if="!Object.keys(tree.extras).length" class="rx-none">无（track_total_hits / collapse / search_after 等会出现在这里）</div>
      <GenericParams :value="tree.extras" path-prefix="" @update="onExtras" />
    </div>
  </div>
</template>

<script setup lang="ts">
/* W2：周边子句表单区。折叠分区有内容默认展开；size/from 非数字原样保留标黄（零降级）；
 aggs 区由 挂载（本组件模板预留位置见 补丁）。 */
import { ref, watch } from 'vue';
import { Plus, X, ChevronUp, ChevronDown, Settings2 } from 'lucide-vue-next';
import FieldSelect from './FieldSelect.vue';
import FieldPicker from '../FieldPicker.vue';
import GenericParams from './GenericParams.vue';
import AggTreeNode from './AggTreeNode.vue';
import MiniTreeEditor from './MiniTreeEditor.vue';
import { nid, type QueryTree, type SortItem, type SourceSpec, type AggNode, type QueryNode, type CollapseSpec, type KnnSpec, type SuggestItem, type SuggestSpec, type RescoreSpec } from '../../utils/queryAst';
import { setFieldSearchIndex } from '../../utils/fieldSearch';

const props = defineProps<{ tree: QueryTree; fields: string[]; types: Record<string, string>; index?: string }>();
const emit = defineEmits<{ (e: 'update:tree', t: QueryTree): void }>();

/* 排序/高亮行 FieldSelect 的类型过滤口径——
 可排序=有 doc_values 的类型（keyword/date/数值族/boolean）；高亮=text/keyword 文本类。
 数组经 props 透传 searchFields.typeFilter，mapping 缺失类型时仍可清空输入框自由手输 */
const SORTABLE_TYPES = ['keyword', 'date', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'boolean'];
const HL_TYPES = ['text', 'keyword'];
/* 【W3b】排序/高亮行的候选类型置顶（typePriority 只调候选分组排序，不改候选集）：
 排序行 date 打头、数值族紧随（时间/数值范围排序是主场景，keyword 字典序排序殿后）；
 高亮行 text 置顶（全文命中高亮主场景），keyword 次之 */
const NUMERIC_PRIO = ['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float'];
const SORT_PRIO_TYPES = ['date', ...NUMERIC_PRIO];
const HL_PRIO_TYPES = ['text'];

/* FieldSelect 换代适配：写入 fieldSearch 当前索引上下文——排序/高亮行的字段选择器
 按 per-index 记忆「最近使用」（与 QueryTreePane 同一上下文，谁挂载谁写，值同源） */
watch(() => props.index, i => setFieldSearchIndex(i || ''), { immediate: true });

const patch = (p: Partial<QueryTree>) => emit('update:tree', { ...props.tree, ...p });
const csv = (raw: string) => raw.split(',').map(x => x.trim()).filter(Boolean);

/* 分区折叠：有内容的默认展开 */
const open = ref<Set<string>>(new Set([
  'page',
  ...(props.tree.sort?.length ? ['sort'] : []),
  ...(props.tree.source ? ['src'] : []),
  ...(props.tree.highlight ? ['hl'] : []),
  ...(props.tree.aggs?.length ? ['aggs'] : []),
  ...(props.tree.postFilter ? ['pf'] : []),
  ...(props.tree.collapse ? ['col'] : []),
  ...(props.tree.knn ? ['knn'] : []),
  ...(props.tree.suggest ? ['sug'] : []),
  ...(props.tree.rescore ? ['rc'] : []),
  ...(Object.keys(props.tree.extras).length ? ['ex'] : []),
]));
function toggle(k: string) {
  const n = new Set(open.value);
  if (n.has(k)) n.delete(k); else n.add(k);
  open.value = n;
}
/* chips 键盘导航——←→ 环绕移动焦点、Home/End 跳首尾（W3C APG roving 焦点）。
 chip 是原生 button，Enter/Space=toggle（展开即「编辑入口」）已免费获得；
 其余键直接放行，Tab 逐个可达的既有路径不受影响 */
function onChipsKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  const chips = [...((e.currentTarget as HTMLElement).querySelectorAll('.rx-chip'))] as HTMLButtonElement[];
  const i = chips.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const next = e.key === 'Home' ? 0
    : e.key === 'End' ? chips.length - 1
    : e.key === 'ArrowLeft' ? (i - 1 + chips.length) % chips.length
    : (i + 1) % chips.length;
  chips[next]?.focus();
}
/* DSL 侧空→非空跳变时自动展开对应分区；已展开/用户手折的稳定态不打扰 */
function autoOpen(k: string) { if (!open.value.has(k)) { const n = new Set(open.value); n.add(k); open.value = n; } }
watch(() => props.tree.sort?.length, (n, o) => { if (n && !o) autoOpen('sort'); });
watch(() => props.tree.source, (n, o) => { if (n && !o) autoOpen('src'); });
watch(() => props.tree.highlight, (n, o) => { if (n && !o) autoOpen('hl'); });
watch(() => Object.keys(props.tree.extras).length, (n, o) => { if (n && !o) autoOpen('ex'); });
/* 【预授权偏差C】aggs 空→非空跳变自动展开（与既有 4 条同风格） */
watch(() => props.tree.aggs?.length, (n, o) => { if (n && !o) autoOpen('aggs'); });
/* 987：post_filter/collapse/knn 同风格三跳变 */
watch(() => props.tree.postFilter, (n, o) => { if (n && !o) autoOpen('pf'); });
watch(() => props.tree.collapse, (n, o) => { if (n && !o) autoOpen('col'); });
watch(() => props.tree.knn, (n, o) => { if (n && !o) autoOpen('knn'); });
/* 989：suggest 同风格跳变 */
watch(() => props.tree.suggest, (n, o) => { if (n && !o) autoOpen('sug'); });
/* 991：rescore 同风格跳变 */
watch(() => props.tree.rescore, (n, o) => { if (n && !o) autoOpen('rc'); });

/* size/from 控制链随分页节退役（numText/numPatch 曾为其专用）——
 tree 上残留的 size/from 键序列化直通（旧草稿兼容，执行链 562 联动语义接管） */

/* sort */
const sortParamsId = ref<string | null>(null);
function addSort() {
  const item: SortItem = { id: nid(), field: props.fields[0] || '', form: 'short', params: { order: 'desc' } };
  patch({ sort: [...(props.tree.sort || []), item] });
  if (!open.value.has('sort')) toggle('sort');
}
function patchSort(id: string, p: Partial<SortItem>) {
  patch({ sort: (props.tree.sort || []).map(s => s.id === id ? { ...s, ...p } : s) });
}
function delSort(id: string) { patch({ sort: (props.tree.sort || []).filter(s => s.id !== id) }); }
function moveSort(i: number, d: number) {
  const arr = [...(props.tree.sort || [])];
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  patch({ sort: arr });
}

/* _source */
const SRC_LABEL: Record<SourceSpec['mode'], string> = { all: '全部', none: '不返回', one: '单字段', list: '字段列表', pattern: '通配裁剪' };
function setSource(mode: SourceSpec['mode']) {
  const cur = props.tree.source;
  patch({ source: { mode, fields: cur?.fields || [], includes: cur?.includes || [], excludes: cur?.excludes || [] } });
  if (!open.value.has('src')) toggle('src');
}
function setSrcFields(fields: string[]) { if (props.tree.source) patch({ source: { ...props.tree.source, fields } }); }
function setSrcPattern(key: 'includes' | 'excludes', raw: string) {
  const s = props.tree.source;
  if (!s) return;
  const arr = csv(raw);
  /* 编辑即声明存在：用户输入过该侧就置 presence=true，防 parse 记忆的显式 false 吞掉输入；
 清空为空数组时保留原 presence（显式空保键 / 显式缺席语义不变） */
  const hasKey = key === 'includes' ? 'hasIncludes' : 'hasExcludes';
  patch({ source: { ...s, [key]: arr, [hasKey]: arr.length ? true : s[hasKey] } });
}

/* highlight */
const hlParamsIdx = ref<number | null>(null);
const hlGlobal = ref(false);
function hlSet() { patch({ highlight: { fields: [], params: {} } }); if (!open.value.has('hl')) toggle('hl'); }
function hlAddField() {
  if (!props.tree.highlight) return;
  patch({ highlight: { ...props.tree.highlight, fields: [...props.tree.highlight.fields, { name: props.fields[0] || '', params: {} }] } });
}
function hlPatchField(i: number, p: Partial<{ name: string; params: Record<string, unknown> }>) {
  if (!props.tree.highlight) return;
  patch({ highlight: { ...props.tree.highlight, fields: props.tree.highlight.fields.map((f, j) => j === i ? { ...f, ...p } : f) } });
}
function hlDelField(i: number) {
  if (!props.tree.highlight) return;
  patch({ highlight: { ...props.tree.highlight, fields: props.tree.highlight.fields.filter((_, j) => j !== i) } });
}

/* aggs */
function aggAdd() {
  const sibs = props.tree.aggs || [];
  let i = sibs.length + 1;
  while (sibs.some(a => a.name === 'agg_' + i)) i++;   // 跳过已占用名：删中间项后再加不撞名（同名序列化会静默覆盖）
  const a: AggNode = {
    id: nid(), name: 'agg_' + i, op: 'terms',
    body: { field: props.fields[0] || '' }, children: [], meta: {}, aggKey: 'aggs',
  };
  patch({ aggs: [...(props.tree.aggs || []), a] });
  if (!open.value.has('aggs')) toggle('aggs');
}
function aggPatch(id: string, n: AggNode) { patch({ aggs: (props.tree.aggs || []).map(a => a.id === id ? n : a) }); }
function aggDel(id: string) { patch({ aggs: (props.tree.aggs || []).filter(a => a.id !== id) }); }

/* ═══ 987：post_filter / collapse / knn 三键结构化编辑 ═══ */
/* post_filter：默认给 bool must 组带一条可编辑的空 term（比裸 match_all 立即可上手） */
function pfAdd() {
  const leaf: QueryNode = { id: nid(), type: 'leaf', op: 'term', field: props.fields[0] || '', value: '', params: {}, raw: null };
  patch({ postFilter: { id: nid(), type: 'bool', children: [{ occur: 'must', node: leaf }], params: {}, arrForm: { must: true } } });
  if (!open.value.has('pf')) toggle('pf');
}
function pfUpdate(n: QueryNode) { patch({ postFilter: n }); }

/* collapse：路由字段折叠 + 其余参数（inner_hits 等）走递归表 */
const COLLAPSE_TYPES = ['keyword', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'boolean', 'date'];
const KNN_TYPES = ['dense_vector'];
const colParams = ref(false);
function colAdd() {
  patch({ collapse: { field: props.fields[0] || '', params: {} } });
  if (!open.value.has('col')) toggle('col');
}
function colPatch(p: Partial<CollapseSpec>) { if (props.tree.collapse) patch({ collapse: { ...props.tree.collapse, ...p } }); }
function onColParams(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v) && props.tree.collapse) patch({ collapse: { ...props.tree.collapse, params: v } });
}

/* knn：向量走 JSON 文本框（768 维手填不现实，chip/递归表均不可用）——
   合法 JSON 写树、非法只本地标黄不写（不触发树→文本回写循环） */
const knnParams = ref(false);
const knnVecText = ref('[]');
const knnVecBad = ref(false);
watch(() => props.tree.knn, k => {
  const next = k?.hasVector ? JSON.stringify(k.vector) : '[]';
  /* 本地文本与树等值（parse 深度相等）时不回写——防合法输入被 JSON.stringify
   规范化改写（空格折叠/键序），光标跳尾是输入侧事故 */
  let same = false;
  if (!knnVecBad.value) {
    try { same = JSON.stringify(JSON.parse(knnVecText.value)) === next; } catch { same = false; }
  }
  knnVecText.value = same ? knnVecText.value : next;
  knnVecBad.value = false;
}, { immediate: true });
function knnAdd() {
  patch({ knn: { field: props.fields[0] || null, vector: [], params: { k: 10, num_candidates: 100 }, hasVector: true } });
  if (!open.value.has('knn')) toggle('knn');
}
function knnPatch(p: Partial<KnnSpec>) { if (props.tree.knn) patch({ knn: { ...props.tree.knn, ...p } }); }
function onKnnVec(text: string) {
  knnVecText.value = text;
  try {
    const v = JSON.parse(text);
    if (typeof v !== 'object' || v === null) { knnVecBad.value = true; return; }
    knnVecBad.value = false;
    knnPatch({ vector: v, hasVector: true });
  } catch {
    knnVecBad.value = true;   // 编辑中间态不写树（向量半输完是常态）
  }
}
function onKnnParams(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v) && props.tree.knn) patch({ knn: { ...props.tree.knn, params: v } });
}

/* ═══ 989：suggest 项级编辑（名称/text/类型体 rest/全局 text） ═══ */
const sugIdx = ref<number | null>(null);
function sugAdd() {
  /* 默认 completion 形态（补全是最常用调试入口）：rest 给可用的 suggester 体而非空对象 */
  const base = props.tree.suggest || { items: [] as SuggestItem[], globalText: null, hasGlobalText: false };
  let i = base.items.length + 1;
  while (base.items.some(s => s.name === 'my-suggest_' + i)) i++;
  patch({
    suggest: {
      ...base,
      items: [...base.items, { name: 'my-suggest_' + i, text: '', hasText: true, rest: { completion: { field: props.fields[0] || '', prefix: '' } } }],
    },
  });
  if (!open.value.has('sug')) toggle('sug');
}
function sugPatch(i: number, p: Partial<SuggestItem>) {
  if (!props.tree.suggest) return;
  patch({ suggest: { ...props.tree.suggest, items: props.tree.suggest.items.map((s, j) => (j === i ? { ...s, ...p } : s)) } });
}
function onSugText(i: number, v: string) { sugPatch(i, { text: v, hasText: true }); }
function onSugRest(i: number, v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) sugPatch(i, { rest: v });
}
function sugDel(i: number) {
  if (!props.tree.suggest) return;
  patch({ suggest: { ...props.tree.suggest, items: props.tree.suggest.items.filter((_, j) => j !== i) } });
}
function sugPatchGlobal(v: string) {
  if (!props.tree.suggest) return;
  patch({ suggest: { ...props.tree.suggest, globalText: v, hasGlobalText: true } });
}
function sugGlobalText() {
  if (!props.tree.suggest) return;
  patch({ suggest: { ...props.tree.suggest, globalText: '', hasGlobalText: true } });
}

/* ═══ 991：rescore 编辑（window_size 数字容错 + 重打分查询树编辑 + query 权重递归表） ═══ */
const rcParams = ref(false);
function rcAdd() {
  const leaf: QueryNode = { id: nid(), type: 'leaf', op: 'match_phrase', field: props.fields[0] || '', value: '', params: {}, raw: null };
  patch({ rescore: { windowSize: 10, hasWindowSize: true, rescoreQuery: leaf, params: {} } });
  if (!open.value.has('rc')) toggle('rc');
}
function rcUpdate(n: QueryNode) { if (props.tree.rescore) patch({ rescore: { ...props.tree.rescore, rescoreQuery: n } }); }
/* window_size 编辑：数字写回、空串退役键、非数字中间态不写（knn 向量等值守卫同语言） */
function onRcWindow(raw: string) {
  if (!props.tree.rescore) return;
  const n = Number(raw);
  if (raw === '') patch({ rescore: { ...props.tree.rescore, windowSize: '', hasWindowSize: false } });
  else if (Number.isFinite(n)) patch({ rescore: { ...props.tree.rescore, windowSize: n, hasWindowSize: true } });
}
function onRcParams(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v) && props.tree.rescore) patch({ rescore: { ...props.tree.rescore, params: v } });
}

/* 【预授权偏差A】GenericParams @update 联合类型收窄（Record|unknown[] → Record；数组形态忽略，params/extras 语义必须是对象）——内联箭头会 TS2322 */
function onSortParams(id: string, v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) patchSort(id, { params: v });
}
function onHlFieldParams(i: number, v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) hlPatchField(i, { params: v });
}
function onHlGlobalParams(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v) && props.tree.highlight) patch({ highlight: { ...props.tree.highlight, params: v } });
}
function onExtras(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) patch({ extras: v });
}
</script>

<style scoped>
/* v4 参数条样式：chips 横向一行 + 展开内容全宽 */
.rx-chips { display: flex; align-items: center; gap: var(--sp-1h); flex-wrap: wrap; margin-bottom: var(--sp-2); justify-content: flex-start; }
.rx-chip { display: inline-flex; align-items: center; gap: var(--sp-1h); border: 1px solid var(--line-strong); border-radius: var(--r-m);
  background: transparent; color: var(--tx2); font-size: var(--fs-xs); padding: var(--sp-1) 9px; cursor: pointer;
  transition: border-color var(--tr), background var(--tr), color var(--tr); }
.rx-chip:hover { background: var(--bg2); color: var(--tx0); }
.rx-chip.on { border-color: color-mix(in srgb, var(--ac) 45%, var(--line)); background: var(--ac-soft); color: var(--tx0); }
.rx-cn { font-weight: 600; color: inherit; }
.rx-open { padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-s);
  background: var(--bg2); margin-bottom: var(--sp-2); }

.rx { margin-top: var(--sp-3); border-top: 1px solid var(--line); padding-top: var(--sp-3); }
/* 设置行设计：折叠头整行可点卡片化（32px 高/hover 反馈/状态 pill 右对齐），
 中文名为主、英文 key 降级为 mono badge，状态一眼可读——替代原先文字与按钮堆叠 */
.rx-sec { margin-bottom: var(--sp-2); }
.rx-sec-t { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); font-weight: 600; color: var(--tx1); padding: 0 var(--sp-2); height: 32px; border-radius: var(--r-s); }
.rx-fold { cursor: pointer; user-select: none; transition: background var(--tr); }
.rx-fold:hover { background: var(--bg2); }
.rx-fold:hover .rx-fold-add { opacity: 1; }
.rx-name { color: var(--tx0); }
.rx-key { font-family: var(--mono, ui-monospace, monospace); font-size: var(--fs-2xs); color: var(--tx2); background: var(--bg3); border-radius: var(--r-xs); padding: 1px 5px; font-weight: 400; }
/* v3.1: 状态 pill 带 5px 圆点，on 品牌绿点亮 */
.rx-state { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; font-size: var(--fs-2xs); font-weight: 400; color: var(--tx2); background: var(--bg3); border-radius: 999px; padding: var(--sp-0) 9px; }
.rx-state::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--tx2); }
.rx-state.on { color: var(--ac-deep, var(--ac)); background: var(--ac-soft); font-weight: 600; }
.rx-state.on::before { background: var(--brand); }
.rx-chev { transition: transform var(--tr); color: var(--tx2); }
.rx-chev.on { transform: rotate(90deg); }
.rx-fold-add { opacity: 0; transition: opacity var(--tr); }
.rx-row { display: flex; align-items: center; gap: var(--sp-2); margin: var(--sp-1) 0; flex-wrap: wrap; }
.rx-lb { font-size: var(--fs-xs); color: var(--tx2); }
.rx-num { width: 80px; height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); }
.rx-num.warn { border-color: var(--warn); }
.rx-none { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1) 0; display: flex; align-items: center; gap: var(--sp-2); }
.rx-sort-row, .rx-hl-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin: var(--sp-1) 0; }
/* 遮挡修复：FieldSelect 在 flex 行内默认只吃内容宽（~170px），排序/高亮行 5 个控件挤一行时
 字段名显示不下——伸展占满剩余空间；按钮与下拉钉死不收缩，窄行整体折行而非互挤 */
.rx-sort-row .fs, .rx-hl-row .fs { flex: 1 1 140px; min-width: 0; }
.rx-sort-row .btn, .rx-hl-row .btn, .rx-sort-row .rx-sort-order { flex: none; }
.rx-sort-order { height: 28px; font-size: var(--fs-sm); width: 76px; }
.rx-src-mode { height: 28px; font-size: var(--fs-sm); }
.rx-sub { flex-basis: 100%; padding: var(--sp-2) var(--sp-3); background: var(--bg2); border-radius: var(--r-s); }
.rx-ex { padding-top: var(--sp-0); }
/* knn 向量 JSON 输入框：mono 长串横向吃满行（dim 向量百千位） */
.rx-knn-vec { flex: 1 1 200px; min-width: 0; font-size: var(--fs-xs); }
.rx-knn-vec.warn { border-color: var(--warn); }
/* suggest 项行：名称/文本双输入吃满剩余空间，按钮钉死不收缩 */
.rx-sug-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin: var(--sp-1) 0; }
.rx-sug-row .btn { flex: none; }
.rx-sug-name { width: 130px; height: 28px; font-size: var(--fs-sm); flex: none; }
.rx-sug-text { flex: 1 1 160px; min-width: 0; height: 28px; font-size: var(--fs-sm); }
</style>
