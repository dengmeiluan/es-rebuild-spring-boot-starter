import { type Ref } from 'vue';
import { usePref } from './urlState';

/*  W9：档循环统一件——视图本地「TIERS 数组 + usePref + cycle 函数」三件套的
   最小抽象，示范迁移 IlmView（宽度档 ilm.listW）与 ConfigValidatorView（px 档
   configvalidator.issuesH）。罩住站内既有四形态：行数档（JsonArea rows）、px 档
   （面板 max-height）、vh 档（弹性高）、宽度档（CSS var 注入侧栏宽）。
   落盘沿用 usePref（es-console.pref.* 键、JSON 序列化、坏值回落默认）；
   cycle 语义 = 视图原实现逐字平移：当前档切下一档，末档回首档，越档脏值（indexOf -1）回首档。
   defVal 缺省取 tiers[0]；存量视图默认档不在首位时显式传入（360/380 先例）。 */
export function useTierCycle<T>(key: string, tiers: readonly T[], defVal?: T): { v: Ref<T>; cycle: () => void } {
  const v = usePref<T>(key, defVal !== undefined ? defVal : tiers[0]);
  function cycle() {
    const i = tiers.indexOf(v.value);
    v.value = tiers[(i + 1) % tiers.length];
  }
  return { v, cycle };
}
