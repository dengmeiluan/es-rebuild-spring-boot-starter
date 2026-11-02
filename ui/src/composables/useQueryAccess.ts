import { computed } from 'vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';

/** 查询工作台权限摘要单一出处：模式菜单/当前索引 chip 等右键面只消费本组合式，
 *  避免目标/env/角色/读写口径在各宿主里各写一份而漂移。只读读取，不触发请求。 */
export function useQueryAccess() {
  const store = useAppStore();
  const auth = useAuthStore();

  const env = computed(() => store.conns.find(c => c.id === store.target)?.env || '');
  const role = computed(() => auth.me?.role
    || (auth.authDisabled ? 'auth-off' : auth.probed ? 'anonymous' : 'probing'));
  const canRead = computed(() => auth.canReadPage('search', store.target));
  const canWrite = computed(() => auth.canWriteOn(store.target));

  const summary = computed(() => [
    `target=${store.target || 'host'}`,
    `env=${env.value || '—'}`,
    `role=${role.value}`,
    `read=${canRead.value ? 'yes' : 'no'}`,
    `write=${canWrite.value ? 'yes' : 'no'}`,
  ].join(' '));

  return { env, role, canRead, canWrite, summary };
}
