// 926 批滚动移档第二百二十二演（一次性件，收工删）
// 纪律：cutOnce 锚缺/重复即 throw；滚出=入档逐块等值断言；POST fail-exit；体积定点循环回读一致
import { readFileSync, writeFileSync } from 'node:fs';

const SP = 'GOAL-CONSOLE-DEEP-STATE.md';
const AR = 'GOAL-CONSOLE-DEEP-STATE-ARCHIVE.md';
const A13 = 'GOAL-CONSOLE-DEEP-STATE-ARCHIVE-13.md';
let st = readFileSync(SP, 'utf8');
const ar0 = readFileSync(AR, 'utf8');
let a13 = readFileSync(A13, 'utf8');
const EOL = st.includes('\r\n') ? '\r\n' : '\n';

function cutOnce(s, startNeedle, endNeedle, tag) {
  const i = s.indexOf(startNeedle);
  if (i < 0) throw new Error(tag + ' START-MISSING');
  if (s.indexOf(startNeedle, i + 1) >= 0) throw new Error(tag + ' START-DUP');
  const j = s.indexOf(endNeedle, i + startNeedle.length);
  if (j < 0) throw new Error(tag + ' END-MISSING');
  return s.slice(i, j);
}
function lineOf(s, startNeedle, tag) {
  const i = s.indexOf(startNeedle);
  if (i < 0) throw new Error(tag + ' MISSING');
  if (s.indexOf(startNeedle, i + 1) >= 0) throw new Error(tag + ' DUP');
  let j = s.indexOf('\n', i);
  if (j < 0) j = s.length;
  return s.slice(i, j);
}

// ── 1. 滚出四件抽取（原文字节级） ──
const b_924 = lineOf(st, '- **924 批（20261016 16:3x~18:0x', '①924') + EOL;
const b_4_923 = lineOf(st, '**923 时点快照（20261016 15:2x~16:0x', '④923') + EOL;
const b_5_921 = lineOf(st, '- **921 收口门禁（=922 开工基线）**', '⑤921') + EOL;
const b_6_923 = cutOnce(st, '——以下为 923 时点增补并档（用户令 5601 升级', '## ⑦ 历史归档', '⑥923');
// ⑥923 块尾去掉 ⑦ 节头前多余空行，保留块本体与一个换行
const b_6_923_clean = b_6_923.replace(/\s+$/, '') + EOL + EOL;

// ── 2. 新内容 ──
const P926 = '- **926 批（20261016 18:1x~20:4x，轨6 走查批「LuceneQueryView」busy 混态甄别刀+计时器泄漏刀+copyLink 反馈刀+926-C1/C2 判例入库+925-lane 补账，零 Java）。**开工甄别**：HEAD=0e00668 超 924 指针四笔=并行 lane 已提交批（自报「914 follow-up/916」撞号=866-C1 谱系，勘误定名 925-lane；251c808 KPI 图 y-tick 让位/642aace bump 1.0.23 side-publish/c93ec6d 对比顶部图 36px 让位/0e00668 对比图高度链修正；CI run 38864421518 success @ 0e00668 定谳），顺延取号 926；工作树开局净。开工基线 npm test **8420/8420[982] 全绿 EXIT=0 924.52s**（=⑤924 收口 8416+lane plotClearance916 4 用例自洽）。**取件**（⑥924-2）：轨6 走查接力 LuceneQueryView（913~924 同模式）。**刀①（busy 混态甄别·918-C1③ 谱系三演）**：busy 被执行链（qr）与字段体检链（doSchema）共享——体检在途时执行钮误显「执行中（Ns）…」（qr.elapsedMs 陈旧值）+取消钮 v-if="busy" 误现（qr 无在途 abort=死钮）、反向查询在途时体检钮误显「体检中…」；doRun 无再入守卫（SqlBridge/Xmigrate/SearchSandbox 三页有、SqlConsole/Lucene 无）=Enter/历史回放/setSize 三通道绕 disabled 并发双跑（旧请求被 begin() abort 后其 finally 提前熄灭 qr.running，第二跑全程无进度无取消）；修=执行钮读秒/Play spinning/取消钮归位 qr.running+体检示能随新 schemaBusy 自链（互斥闸门保持共享 busy）+doRun 首行 busy||qr.running 双查再入守卫（SqlBridge 同口径）。**刀②（useQueryRun begin() 计时器泄漏根治）**：begin 的连查形态（abort 旧控制器=382 立法）下旧 elapsedTimer 句柄被直接覆盖不清——泄漏表 finish 后持续用旧 t0 覆写 elapsedMs（finish 只清最新句柄，泄漏表存活至页面弃用）；修=begin 首段 clearInterval 旧句柄；spec 判据=「finish 后读数冻结」（同周期计时器同 tick 后注册者后写会掩蔽读数跳变类判据，冻结判据才能稳定判红=926-C1）。**刀③（copyLink 静默失败补反馈·⑥924-3 本页在列）**：copyText false 零反馈与域内五页双分支 notify 口径冲突；修=ok 三元双分支（success 原文案/error「复制失败」）。**size 裸绑两口径记档不刀**（header size v-model 绕 usePagerSize 共享键：不钳制/不重置 from/不写共享键 vs setSize 全套=874-C1 同文件两口径；钳制契约与「上限 10000」title 存在产品权衡→⑥ 裁决候选）。**spec**：luceneBusyChain926 6 用例先红后绿（红 6/6=体检混态双行为锚+泄漏冻结锚+copyLink 锚+doRun 守卫源码锁+示能归位逐字锁→绿 6/6）+spinAriaCross811 两把锁随迁（Play/ShieldAlert 示能链新字面；重试钮锁零触）+857-C1 按被改文件名反查 43 spec 逐把核锁（唯 811 两把受触）。**门禁**：typecheck 0 错（825-C1 手术窗干净树读数）+vue parse 0 孤儿+npm test 收口 **8425/8426[983]**（=基线+6 我方用例数学自洽；唯一红 altViewsShare565:31=lane 在途竞态：lane 于全量跑动中改写该 spec 锁面预迁移其新特性而 product WIP 被我手术窗 checkout 到 HEAD=瞬态错位，恢复 lane WIP 后复验 23/23 绿自愈，零我方=git diff 实锚主语文件全 lane 触面）+npm run build 绿 23.85s（手术窗读数）+敏感面终扫零命中+黑话双表零命中+Java 零触面（⑤922 mvn 1053 读数为准）。**真机 probe**（vite dev 127.0.0.1:5180+vite.config 临时 /internal proxy→5601〔1.0.23 常驻〕；cp 存底收工还原 diff 零漂）：登录链 admin/es-console ✓+刀① 绿证=组件态 2ms 轮询跃迁帧（体检在途 34~234ms 窗 busy=true+schemaBusy=true 而 qrRunning=false=读秒/取消钮/spinning 归位语义实证）+取消链复验=取消钮 t+34ms 在场（qr.running 归位）即点→「已取消查询（0.0s）」info+零红面板（924 刀① 本批树上复验通过）+刀③ 绿证=「复制失败」error toast 在场（IAB 剪贴板被拒即走新 else 分支）+五序列全绿（语法手册开/关/开+JSON 聚焦放大/还原钮可见可达 hit-self/还原主体 50 行保留+QRT 翻页/上一页解禁/每页条数选择器+视图切换表格→JSON→表格无空白+历史弹层开/取消记录 1 条/关层组件终态 histOpen=false/触发器恒在）+高度哨兵六拍恒定 1653x1486+三档 1600/1280/900 零横向溢出。**真机甄别**：还原钮 hit-self 首查红=n-modal-mask 卡 enter-from（「欢迎使用」引导层，后台 tab 动画冻结=853-C3① 谱系五演）遮命中测试，冻结 mask 指针穿透后 hit-self=true=环境伪影非产品缺陷定谳；历史弹层 Esc 真键盘通道 IAB 不达（851-C3 谱系）=escLayer445 spec 兜底如实声明。**收工甄别**：5180 已杀+vite.config 还原零漂；并行 lane 在途 4 文件（AltHitsViews/ResultTable/DslQueryView/altViewsShare565 spec）禁改零卷入（825-C1 手术窗为门禁干净读数短暂 checkout 三 product 件已按补丁恢复，恢复后 lane 自洽态复验 23/23 绿）。**发链**：显式路径提交（4 文件；禁 add -A）推 main+v1.0 随批强移+CI 核绿 run 号收工后回填本段。下一批=927（⑥926 时点段为准）。' + EOL;
const P925LANE = '- **925-lane 批（20261016 13:4x~14:5x）摘要（868-C1 补账+866-C1 撞号勘误：lane 四笔自报「batch 914 follow-up/batch 914 follow-up side-publish/batch 916/batch 916 follow-up」，与 914-lane/916-lane 补账名撞号〔先占方保持〕，勘误定名 925-lane；lane 未记 STATE，全文=各笔 OSS 提交信息双存）**：251c808「KPI chart plot shifts right to clear the y-tick column; compare end dots move outside the plot」（KPI 图绘图区右移让 y-tick 列+对比卡末端圆点移出绘图区；LiveChartCard+LiveDashboardView）+642aace「bump to 1.0.23」（bump 七面发版链=lane 自主 side-publish）+c93ec6d「compare and top charts get the 36px y-tick clearance wrap」（对比/顶部图 36px y-tick 让位换行+plotClearance916 新 spec 4 用例）+0e00668「compare plot height chain after the clearance wrap; y-ticks right-align」（让位后对比图高度链修正+y-tick 右对齐）；v1.0 tag 未随批移（lane 惯例，债 926 随批清）；CI run 38864421518 success @ 0e006689642628f29da00661a863800b694f4f1a（40 位全串）。' + EOL;
const P924SUM = '- **924 批（20261016 16:3x~18:0x）摘要**：轨6 走查批「SearchSandboxView」取消甄别四视图刀+空态示能刀+重跑动线刀+924-C1/C2 判例入库；门禁 8406→8416/8416[981] 全绿+CI 首跑 frontend Typecheck 红我方真漏（924-C2）verdict 修复后复验绿（run 38854879861 @ 4000c0f）；提交 00718cc（5 文件 +284/−5）+4000c0f 推 main+v1.0 双强移。全文=git blob 00718cc/4000c0f〔924 提交〕+OSS 提交信息双存+ARCHIVE 主卷第二百二十二演滚入实体。' + EOL;

const JC1 = '### 926-C1 ★连查形态下计时器句柄的覆盖即泄漏——「begin 支持连查」的自家契约要求 begin 自清旧计时器——useQueryRun 实锚：begin() 立法（382，abort 旧控制器=连查/改参快查竞态根治）使「在途再 begin」成为受支持形态，但 elapsedTimer 旧句柄被直接覆盖不清：泄漏的旧 interval 每 tick 用旧 t0 覆写 elapsedMs，且 finish() 只清最新句柄=泄漏表存活至页面弃用；真矿指纹=连查后再起新跑、finish 后 elapsedMs 仍持续漂移（读数态被无主写入）。立法=①「支持重复 begin」的句柄型资源（interval/timeout/observer）必须在 begin 首段清理上一句柄——abort 通道清的是网络资源，计时器是第二资源通道，同一立法域两资源通道要同批对账（874-C1 同域两口径的资源维）；②计时器泄漏的行为锚判据=「finish 后读数冻结」（快进至 finish、冻结读数、再快进半窗断言不变）——同周期计时器在同一 tick 内后注册者后写，会掩蔽「读数跳变」类判据（本批首版判据即被掩蔽翻案），冻结判据对同周期/异周期/泄漏表全覆盖。' + EOL + EOL;
const JC2 = '### 926-C2 ★并行 lane 锁面预迁移击穿 825-C1 手术窗的干净读数——「checkout 产品件到 HEAD」遇「lane 已把守卫 spec 改写为新形态」时，spec-vs-HEAD 反向错位红——926 门禁实锚：825-C1 构造范式（备份补丁→checkout lane 三 product 件到 HEAD→跑门禁→恢复）窗口内，lane 改写了断言这些 product 件的守卫 spec（altViewsShare565 预迁移其 doc-count 新特性字面），checkout 读数反被「spec 新字面 vs HEAD 旧产品」错位打红（与全量跑中「spec 旧字面 vs WIP 新产品」红相方向相反）。立法=①构造窗内 lane 仍会写盘：读数归因先核 spec 与被读文件双方 mtime+git diff，红相先辨「谁新谁旧」再定我方/对方（本例两向红相都零我方）；②lane 活跃期（30 分钟内有写盘）做手术窗须「checkout→立即读数→立即恢复」最短化，恢复后必须复验 lane 自洽态（本例恢复后 23/23 绿=lane 双侧自洽定谳）；③868-C1 开工对账的 lane 活跃判据补时钟维：git log 撞号甄别（已提交面）+工作树 WIP mtime（在途面）双读——开工时树净≠lane 不在场（本批 lane 在我基线起跑后 20 分钟开写）。' + EOL + EOL;

const P4 = '**926 时点快照（20261016 18:1x~20:4x，轨6 走查批 LuceneQueryView 三刀+926-C1/C2+925-lane 补账+滚动移档第二百二十二演+主归档续卷 ARCHIVE-13 十一演）**：开工甄别=HEAD=0e00668，开局树净；批内 lane 开写在途 4 文件（AltHitsViews.vue/ResultTable.vue/DslQueryView.vue/altViewsShare565.spec.ts，15:16~15:45 写入）转黑名单禁改，本批显式路径提交零卷入（825-C1 手术窗三 product 件短暂 checkout 已按补丁恢复原样）。本批自产（随批提交 4 件）：LuceneQueryView.vue（示能归位 qr.running/schemaBusy+doRun 再入守卫+copyLink 双分支）+useQueryRun.ts（begin 清旧计时器）+spinAriaCross811.spec.ts（两把锁随迁）+luceneBusyChain926.spec.ts（新建 6 用例）。一次性件收工删（console/docs/.lane-wip-926.patch 已删+vite.config.ts 已还原零漂+本脚本收工删）。5601 常驻=1.0.23（lane 发版批产物）未碰。后续批黑名单按开工 git status 重甄别。' + EOL + EOL;
const P5 = '- **926 收口门禁（=927 开工基线）**：console **typecheck 0 错（825-C1 手术窗干净树读数；带 lane WIP 树上唯一错=DslQueryView(493) TS18047=lane 在途新增行 git diff 实锚归因）+vue parse 0 孤儿+npm test 收口 8425/8426[983]**（=开工基线 8420/8420[982]+luceneBusyChain926 6 用例自洽；唯一红 altViewsShare565:31=lane 竞态已自愈（恢复 lane WIP 后复验 23/23 绿），逐用例归因零我方；红证 6/6 先行在档）+npm run build 绿 23.85s（手术窗读数）+真机 probe（vite dev 5180 临时 proxy→5601：登录链/混态跃迁帧绿证/取消链复验绿证/copyLink 失败分支绿证/五序列全绿/高度哨兵六拍恒定 1653x1486/三档零溢出）+敏感面终扫零命中+黑话双表零命中；Java 零触面（⑤922 收口读数=mvn 1053 跑 0 失败 2 跳 BUILD SUCCESS 为准）+CI 核绿 run 号收工后回填本段。（开工以此比对）' + EOL + EOL;
const P6HEAD = '——以下为 926 时点增补并档（轨6 走查批 LuceneQueryView 三刀+926-C1/C2+925-lane 补账+滚动移档第二百二十二演+主归档续卷 ARCHIVE-13 十一演）——' + EOL;
const P6ITEM = '1. **头号候选：用户实报随修恒优先**（926 三刀待下次走查顺带复验：体检期间执行钮应显「执行」禁用无读秒、取消钮只在查询在途出现；复制失败应有「复制失败」反馈）。2. **次选：轨6 常态轮转走查**（下一深档页走查候选按 ② 清单分档序取件；913 BulkEditor/915 Snapshots/917 Tasks/918 SqlConsole/919 Aliases/920 Rest/921 PitScroll/924 SearchSandbox/926 LuceneQuery 同模式接力）。3. **记档小刀候选（观察级，沿用 ⑥924-3 全谱+新增）**：**LuceneQueryView header size 裸绑两口径**（v-model 绕 usePagerSize：不钳制/不重置 from/不写共享键 vs setSize 全套；修复方向三选=走 setSize 全套+title 改档位制/保留会话本地语义+补 from 重置/移除输入统一走分页器——动刀须同批裁决「上限 10000」title 语义与共享键污染面）/结果工具行 6 控件密度（横切批统一处置）/fetch_size clamp（ES 裁决兜底）/buffer push spread（RangeError 边缘）/非唯一字段 tie-breaker 警示（ES 通病）/模板覆写草稿确认（Kibana 同语言）/--vh-offset 漂移 9 文件横切批（动刀须随迁 flattenWave538:162 逐字锁）/copyText false 零反馈同族横切清点（LuceneQuery 已修，余下消费点待横切批）/主归档 A13 历史重复存量独立批（176/175/174 演带×8/×8/×4 副本）。4. **主归档阈监测**（926 演滚入越阈→ARCHIVE-13 续卷十一演；下批常规监测）。5. 横切第十二轮/Docker 批顺位后移。6. **纪律常备**：805~926 全链（851+=主档全文区，850-=索引行+ARCHIVE-7 §B）+788-C2+843-C1+851-C1（黑话落笔即终审）+924-C2（TDD 延伸轮门禁三件套全复跑）+926-C2（lane 锁面预迁移击穿手术窗读数）。' + EOL;

// ⑦ 演行（体积数字走定点循环填充）
const P7_TPL = (fill) => '926 批=滚动移档第二百二十二演+**主归档头插续卷（第二百二十二演滚入段+注记 236/237）+续卷 ARCHIVE-13 十一演（770 口径十八演）**（①926 全文段插入+①925-lane 摘要行补账（lane 四笔未记档=868-C1，全文=各笔 OSS 提交信息 251c808/642aace/c93ec6d/0e00668 双存）+①924 全文段→摘要行（实体滚 ARCHIVE 主卷，全文=git blob 00718cc/4000c0f 双存）+**滚出四件=①924 实体+④923 快照+⑤921 门禁+⑥923 时点段（写入 ARCHIVE 主卷头部「926 批滚入段」）**〔滚出 4 段=入档 4 段守恒=860-C3 双侧断言执法；注记 236；⑤ 滚 921=宪法「最近 4 批门禁」口径十八演；⑥ 滚 923=「最近 2 段建议」口径〕+③926-C1/C2 判例新增（### 66→68）+④926 快照+⑤926 门禁+⑥926 时点段+⑦222 演行=窗口归一）。收口实测：主档 179806B→@@A@@B，主归档 303446B→@@B@@B（滚入越阈→最旧带@@MOVED@@整移 A13 后回落阈内），ARCHIVE-13 187841B→@@C@@B。**发链**：显式路径提交（4 文件）推 main+v1.0 随批强移+CI 核绿 run 号收工后回填。（926 批史正文=本演行+①926 段+OSS 提交信息三存）' + EOL;

// ── 3. STATE 手术 ──
// ① 924 全文段 → 摘要行
if (!st.includes(b_924)) throw new Error('①924 block drift');
st = st.replace(b_924, P924SUM);
// ① 插入 926 全文段+925-lane 摘要行（926 在最上、925-lane 次之、924 摘要再次）
const p924pos = st.indexOf(P924SUM);
if (p924pos < 0) throw new Error('P924SUM pos');
st = st.slice(0, p924pos) + P926 + P925LANE + st.slice(p924pos);
// ③ 判例插入（924-C1 之前）
const c1pos = st.indexOf('### 924-C1 ');
if (c1pos < 0) throw new Error('924-C1 pos');
st = st.slice(0, c1pos) + JC1 + JC2 + st.slice(c1pos);
// ④ 快照插入（节头后）
const h4 = '## ④ 当轮黑名单（时点快照堆叠，最新在上；每批开工须重新甄别）' + EOL;
if (!st.includes(h4)) throw new Error('④ header');
st = st.replace(h4, h4 + P4);
// ④ 删除 923 快照
if (!st.includes(b_4_923)) throw new Error('④923 remove drift');
st = st.replace(b_4_923, '');
// ⑤ 门禁插入（节头后）
const h5 = '## ⑤ 门禁基线' + EOL;
if (!st.includes(h5)) throw new Error('⑤ header');
st = st.replace(h5, h5 + P5);
// ⑤ 删除 921 门禁
if (!st.includes(b_5_921)) throw new Error('⑤921 remove drift');
st = st.replace(b_5_921, '');
// ⑥ 建议插入（节头后）
const h6 = st.slice(st.indexOf('## ⑥ 下一批')).indexOf(EOL) >= 0 ? st.match(/## ⑥ 下一批[^\n]*/)[0] + EOL : null;
if (!h6) throw new Error('⑥ header');
st = st.replace(h6, h6 + P6HEAD + P6ITEM);
// ⑥ 删除 923 时点段（原样整体，含其后的空行→保留 ⑦ 节头前结构）
if (!st.includes(b_6_923_clean)) throw new Error('⑥923 remove drift');
st = st.replace(b_6_923_clean, '');
// ⑦ 演行插入（节头后）
const h7 = '## ⑦ 历史归档' + EOL;
if (!st.includes(h7)) throw new Error('⑦ header');
st = st.replace(h7, h7 + P7_TPL());

// ── 4. ARCHIVE 手术 ──
const note236 = '<!-- 注记 236:926 批滚动·第二百二十二演滚入：①924 全文实体+④923 时点快照+⑤921 收口门禁+⑥923 时点段四件写入（滚出 4 段=入档 4 段守恒=860-C3 双侧断言执法）；①924 全文滚出=git blob 00718cc/4000c0f 双存；⑤ 滚 921=宪法「最近 4 批门禁」口径十八演；⑥ 滚 923=「最近 2 段建议」口径 -->';
let rollSection = note236 + EOL + EOL + '## 926 批滚入段（第二百二十二演）' + EOL + EOL
  + b_924 + EOL + b_4_923 + EOL + b_5_921 + EOL + b_6_923_clean;
let ar = rollSection + EOL + ar0;

// ── 5. A13 续卷（越阈整移最旧带） ──
const THRESH = 307200;
const moved = [];
let bAr = Buffer.byteLength(ar, 'utf8');
function moveBand(startNeedle, endNeedleExclusive, tag) {
  let a = ar.indexOf(startNeedle);
  if (a < 0) throw new Error(tag + ' band start missing');
  if (ar.indexOf(startNeedle, a + 1) >= 0) throw new Error(tag + ' band start dup');
  let b = endNeedleExclusive === null ? ar.length : ar.indexOf(endNeedleExclusive, a);
  if (b < 0) throw new Error(tag + ' band end missing');
  const seg = ar.slice(a, b);
  ar = ar.slice(0, a) + '<!-- 指路:' + startNeedle.replace(/^## /, '').replace(/（.+$/, '') + '（' + tag + '） 已于 926 批续卷十一演（注记 237）整移 ARCHIVE-13 尾接，本位不留原文 -->' + EOL + EOL + ar.slice(b);
  a13 = a13.replace(/\s*$/, '') + EOL + EOL + seg.replace(/\s*$/, '') + EOL;
  moved.push(startNeedle.replace('## ', ''));
}
if (bAr > THRESH) {
  moveBand('## 917 批滚入段（第二百一十四演）', null, '第二百一十四演');
  bAr = Buffer.byteLength(ar, 'utf8');
}
if (bAr > THRESH) {
  moveBand('## 915 批滚入段（第二百一十三演）', '## 917 批滚入段', '第二百一十三演');
  bAr = Buffer.byteLength(ar, 'utf8');
}
const movedDesc = moved.length
  ? ('〔' + moved.join('、') + '〕')
  : '（未越阈零整移）';

// ── 6. ⑦ 演行数字定点填充+写盘回读一致 ──
let a13Final = a13;
let fill = P7_TPL().replace('@@MOVED@@', movedDesc);
for (let it = 0; it < 5; it++) {
  const A = Buffer.byteLength(st, 'utf8');
  const B = bAr;
  const C = Buffer.byteLength(a13Final, 'utf8');
  const next = fill.replace('@@A@@', String(A)).replace('@@B@@', String(B)).replace('@@C@@', String(C));
  // 把 next 写进 st 的演行位（演行当前为含占位符版本）
  const ph = P7_TPL();
  if (st.includes(ph)) { st = st.replace(ph, fill); }
  else {
    // 演行已是上一轮 fill 版本：定位 926 批=滚动移档 行整行替换
    const lines = st.split(EOL);
    const idx = lines.findIndex(l => l.startsWith('926 批=滚动移档第二百二十二演'));
    if (idx < 0) throw new Error('⑦ row missing');
    lines[idx] = next.replace(/\r?\n$/, '');
    st = lines.join(EOL);
  }
  fill = next;
}
// 终验：写盘后实测回读
writeFileSync(SP, st);
writeFileSync(AR, ar);
writeFileSync(A13, a13Final);
const st2 = readFileSync(SP, 'utf8');
const written = st2.split(EOL).find(l => l.startsWith('926 批=滚动移档第二百二十二演'));
const mA = /主档 179806B→(\d+)B/.exec(written);
const mB = /主归档 303446B→(\d+)B/.exec(written);
const mC = /ARCHIVE-13 187841B→(\d+)B/.exec(written);
const realA = Buffer.byteLength(readFileSync(SP, 'utf8'), 'utf8');
const realB = Buffer.byteLength(readFileSync(AR, 'utf8'), 'utf8');
const realC = Buffer.byteLength(readFileSync(A13, 'utf8'), 'utf8');
const checks = [
  ['主档回读一致', mA && Number(mA[1]) === realA, mA && mA[1] + ' vs ' + realA],
  ['主归档回读一致', mB && Number(mB[1]) === realB, mB && mB[1] + ' vs ' + realB],
  ['A13 回读一致', mC && Number(mC[1]) === realC, mC && mC[1] + ' vs ' + realC],
  ['主归档阈内', realB <= THRESH, realB + '/' + THRESH],
  ['占位符残留=0', !/@@[ABC]@@|@@MOVED@@/.test(st2), ''],
  ['滚出①924入档恰一', (ar.match(/924 批（20261016 16:3x~18:0x/g) || []).length === 1, ''],
  ['STATE①924摘要行恰一', (st2.match(/924 批（20261016 16:3x~18:0x）摘要/g) || []).length === 1, ''],
  ['STATE①926恰一', (st2.match(/- \*\*926 批（20261016 18:1x/g) || []).length === 1, ''],
  ['STATE①925-lane恰一', (st2.match(/925-lane 批（20261016 13:4x/g) || []).length === 1, ''],
  ['③###计数68', (st2.match(/^### /gm) || []).length === 68, String((st2.match(/^### /gm) || []).length)],
  ['⑤921已滚出', !st2.includes('921 收口门禁（=922 开工基线）'), ''],
  ['⑥923已滚出', !st2.includes('——以下为 923 时点增补并档'), ''],
  ['④923已滚出', !st2.includes('**923 时点快照（20261016 15:2x'), ''],
  ['滚出四件逐块等值', ar.includes(b_924.trimEnd()) && ar.includes(b_4_923.trimEnd()) && ar.includes(b_5_921.trimEnd()) && ar.includes(b_6_923_clean.trimEnd()), ''],
  ['A13尾接917带', a13Final.includes('## 917 批滚入段（第二百一十四演）'), 'moved=' + moved.join('|')],
];
let fail = 0;
for (const [name, ok, info] of checks) { if (!ok) { fail++; console.log('POST-FAIL', name, info); } }
console.log('SIZES 主档', realA, '主归档', realB, 'A13', realC, '| moved=', moved.join('|') || '无', '| POST', fail === 0 ? 'ALL-PASS' : fail + ' FAIL');
if (fail) process.exit(1);
