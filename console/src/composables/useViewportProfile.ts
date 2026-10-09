import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { getViewportProfile, type ViewportProfile } from '../utils/layout';

type ResizeTarget = Ref<HTMLElement | undefined>;

export function useViewportProfile(target?: ResizeTarget): {
  width: Ref<number>;
  height: Ref<number>;
  profile: ComputedRef<ViewportProfile>;
  dispose: () => void;
} {
  const width = ref(typeof window === 'undefined' ? 0 : window.innerWidth);
  const height = ref(typeof window === 'undefined' ? 0 : window.innerHeight);
  const profile = computed(() => getViewportProfile(width.value, height.value));
  const ResizeObserverCtor = typeof window !== 'undefined' ? window.ResizeObserver : undefined;
  let observer: ResizeObserver | undefined;
  let observed: HTMLElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const update = (nextWidth: number, nextHeight: number) => {
    if (disposed) return;
    /* 元素不可见（display:none/iframe 隐藏）时 rect 归零——忽略之，保持上次实测尺寸：
       否则宿主切页签的瞬间布局按 0 宽重排、切回再弹回，肉眼可见的跳动/闪烁 */
    if (nextWidth < 1 && nextHeight < 1) return;
    width.value = Number.isFinite(nextWidth) ? Math.max(0, nextWidth) : 0;
    height.value = Number.isFinite(nextHeight) ? Math.max(0, nextHeight) : 0;
  };

  const updateFromWindow = () => {
    if (observed) {
      const rect = observed.getBoundingClientRect();
      update(rect.width, rect.height);
    } else if (typeof window !== 'undefined') {
      update(window.innerWidth, window.innerHeight);
    }
  };

  const onWindowResize = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      updateFromWindow();
    }, 120);
  };

  const useWindowFallback = () => {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onWindowResize);
      updateFromWindow();
    }
  };

  const stopWindowFallback = () => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', onWindowResize);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = undefined;
  };

  const observe = (element?: HTMLElement) => {
    if (observed === element) return;
    observer?.disconnect();
    observed = element;
    if (observer && element) {
      stopWindowFallback();
      observer.observe(element);
      const rect = element.getBoundingClientRect();
      update(rect.width, rect.height);
    } else {
      if (element) {
        const rect = element.getBoundingClientRect();
        update(rect.width, rect.height);
      }
      useWindowFallback();
    }
  };

  if (ResizeObserverCtor) {
    observer = new ResizeObserverCtor((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) update(rect.width, rect.height);
    });
  }

  const stopWatch = target ? watch(target, observe, { immediate: true }) : undefined;
  if (!target) observe();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopWatch?.();
    observer?.disconnect();
    observer = undefined;
    observed = undefined;
    stopWindowFallback();
  };

  return { width, height, profile, dispose };
}
