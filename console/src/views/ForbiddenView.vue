<template>
  <div class="forbidden-wrap">
    <NResult status="403" :title="'暂无「' + pageName + '」功能权限'"
             description="当前账号未被授予该功能页面。请联系管理员在宿主系统的角色权限中勾选对应菜单后刷新重试。">
      <template v-if="showHome" #footer>
        <NButton @click="goHome">回到概览</NButton>
      </template>
    </NResult>
  </div>
</template>

<script setup lang="ts">
/* 2.5.0 菜单 SPI：页面级授权拒绝落地页。pageName 来自守卫 query（契约页面名） */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton, NResult } from 'naive-ui';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const pageName = computed(() => String(route.query.name || '该页面'));
/* 概览页不可达时（全拒 [] 或白名单不含 overview）「回到概览」会被守卫再拦回本页（自跳转死胡同）——仅文案引导，不渲染 CTA */
const showHome = computed(() => auth.grantedPages == null || auth.grantedPages.includes('overview'));
function goHome() { router.replace('/'); }
</script>

<style scoped>
.forbidden-wrap { display: flex; align-items: center; justify-content: center; min-height: 60vh; min-width: 0;}
</style>
