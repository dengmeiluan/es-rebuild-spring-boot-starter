<template>
  <!-- 单元格右键菜单共享组件（RT/QRT 复用；dbx 紧凑风格）——
       items 由调用方构造（label+icon+danger+run 闭包），组件只管定位/遮罩/关闭；
       视口碰撞自适应——底部/右侧溢出自动翻转，超长限高内滚，
       列表首行/末行/右缘右键不再「看不到菜单」（实报：首行右键要滚动才能看全） -->
  <teleport to="body">
    <div class="ccm-mask" role="presentation" @click="emit('close')" @contextmenu.prevent="emit('close')" @keydown.esc="emit('close')" tabindex="-1">
      <div ref="menuEl" class="ccm" role="menu" :aria-label="title || '操作菜单'" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @click.stop @keydown.esc="emit('close')" tabindex="-1">
        <div v-if="title" class="ccm-hd mono">{{ title }}</div>
        <template v-for="it in items" :key="it.key">
          <div v-if="it.sep" class="ccm-sep" role="separator" />
          <button class="ccm-it" :class="{ danger: it.danger }" @click="runItem(it)">
            <component :is="it.icon" :size="12" v-if="it.icon" />
            {{ it.label }}
          </button>
        </template>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { fitPopupPos } from '../utils/popFit';

const props = defineProps<{
  x: number;
  y: number;
  title?: string;
  items: { key: string; label: string; icon?: any; danger?: boolean; sep?: boolean; run: () => void }[];
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

/* 动作执行后自动关闭——此前点完菜单还开着，需再点空白才能收起 */
function runItem(it: { run: () => void }) {
  it.run();
  emit('close');
}

/* ═══ ：视口碰撞自适应 ═══
   旧行为：菜单固定落在光标点 (x,y)，右/下溢出直接被视口裁掉。
   新行为：先落点再 nextTick 实测尺寸——右缘溢出向左翻、底缘溢出向上翻，
   最终四向钳位（8px 边距，数学收口 utils/popFit 纯函数）；尺寸为 0 的环境
   （happy-dom）数学上不翻，行为与旧版一致。 */
const menuEl = ref<HTMLElement>();
const pos = ref({ x: props.x, y: props.y });
async function adjust() {
  pos.value = { x: props.x, y: props.y }; /* 先跟点，防复用旧位置闪帧 */
  await nextTick();
  const el = menuEl.value;
  if (!el) return;
  pos.value = fitPopupPos(props.x, props.y, el.offsetWidth, el.offsetHeight, innerWidth, innerHeight);
}
watch(() => [props.x, props.y], adjust, { immediate: true });

/* Esc 关闭（ARIA 菜单惯例）——此前只能点遮罩/执行动作收起；
   capture 阶段先于 Monaco 等内部消费者，stopPropagation 防泄漏；
   菜单为条件渲染（打开挂载/关闭卸载），监听随卸载自动移除 */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close'); }
}
document.addEventListener('keydown', onKey, true);
onBeforeUnmount(() => document.removeEventListener('keydown', onKey, true));
</script>

<style scoped>
/* 全局右键菜单统一样式（dbx 紧凑风格；RT/QRT 复用）
   z 字面量收口全局 token——mask=--z-ctx（1200 上下文层）、面板=+1，语义不变 */
.ccm-mask { position: fixed; inset: 0; z-index: var(--z-ctx); }
.ccm { position: fixed; min-width: 168px; padding: var(--sp-1); background: var(--bg1); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: var(--shadow-pop); z-index: calc(var(--z-ctx) + 1);
  /* 超长按视口限高内滚——再长的菜单也全程可用 */
  max-height: calc(100vh - 16px); overflow-y: auto; }
.ccm-hd { font-size: var(--fs-2xs); font-weight: 650; color: var(--tx2); letter-spacing: .06em; padding: var(--sp-1) var(--sp-2h) var(--sp-1h); border-bottom: 1px solid var(--line); margin-bottom: 3px; }
.ccm-it { display: flex; align-items: center; gap: var(--sp-2); width: 100%; padding: var(--sp-1h) var(--sp-2h); border: 0; background: transparent; border-radius: var(--r-s); cursor: pointer; font-size: var(--fs-sm); color: var(--tx1); text-align: left; }
.ccm-it:hover { background: var(--ac-soft); color: var(--ac-hi); }
.ccm-it.danger { color: var(--err); }
.ccm-it.danger:hover { background: var(--err-soft); }
.ccm-sep { height: 1px; background: var(--line); margin: 3px var(--sp-1h); }
</style>
