<template>
  <div class="content-home">
    <!-- 左侧竖向二级菜单（对齐菜鸟云「内容」7 子菜单） -->
    <div class="content-body">
      <aside class="cat-sidebar">
        <div class="cat-header">内容管理</div>
        <div
          v-for="s in subMenus"
          :key="s.key"
          class="cat-item"
          :class="{ active: activeSub === s.key }"
          @click="switchSub(s.key)"
        >
          <SIcon :name="s.icon" size="default" />
          <span class="cat-name">{{ s.label }}</span>
          <span v-if="s.count !== null" class="cat-count">{{ s.count }}</span>
        </div>
      </aside>

      <!-- 右侧内容区 -->
      <main class="content-main">
        <component :is="activeComp" :key="activeComp.name" @counts-updated="loadCounts" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SIcon from '../../../components/SIcon.vue';
import { customerApiCall } from '../../../api';
import ContentArticleList from './ContentArticleList.vue';
import ContentArticleCate from './ContentArticleCate.vue';
import ContentComment from './ContentComment.vue';
import ContentPicCate from './ContentPicCate.vue';
import ContentPicList from './ContentPicList.vue';
import ContentVideoList from './ContentVideoList.vue';
import ContentBaseSetting from './ContentBaseSetting.vue';

const route = useRoute();
const router = useRouter();

// 左侧 7 子菜单（对齐菜鸟云「内容」：文章/组图/视频/评论/基础设置）
const subDefs = [
  { key: 'article', label: '文章列表', icon: 'doc', countKey: 'article' },
  { key: 'articleCate', label: '文章分类', icon: 'category', countKey: 'articleCate' },
  { key: 'comment', label: '文章评论', icon: 'comment' },
  { key: 'pic', label: '组图列表', icon: 'template', countKey: 'pic' },
  { key: 'picCate', label: '组图分类', icon: 'category', countKey: 'picCate' },
  { key: 'video', label: '视频列表', icon: 'mobile', countKey: 'video' },
  { key: 'base', label: '基础设置', icon: 'settings' },
];

const activeSub = ref('article');
const counts = ref({ article: 0, articleCate: 0, pic: 0, picCate: 0, video: 0 });

const subMenus = computed(() =>
  subDefs.map((s) => ({
    ...s,
    count: s.countKey ? counts.value[s.countKey] : null,
  }))
);

const compMap = {
  article: ContentArticleList,
  articleCate: ContentArticleCate,
  comment: ContentComment,
  pic: ContentPicList,
  picCate: ContentPicCate,
  video: ContentVideoList,
  base: ContentBaseSetting,
};
const activeComp = computed(() => compMap[activeSub.value] || ContentArticleList);

function switchSub(key) {
  if (activeSub.value === key) return;
  activeSub.value = key;
  syncQuery();
}

function syncQuery() {
  router.replace({ query: { ...route.query, m: activeSub.value } });
}

async function loadCounts() {
  try {
    const [a, ac, p, pc, v] = await Promise.all([
      customerApiCall.get('/content/articles', { params: { page: 1, pageSize: 1 } }),
      customerApiCall.get('/content/article-cates'),
      customerApiCall.get('/content/pics', { params: { page: 1, pageSize: 1 } }),
      customerApiCall.get('/content/pic-cates'),
      customerApiCall.get('/content/videos', { params: { page: 1, pageSize: 1 } }),
    ]);
    counts.value = {
      article: a.total || 0,
      articleCate: ac.total || 0,
      pic: p.total || 0,
      picCate: pc.total || 0,
      video: v.total || 0,
    };
  } catch (e) { /* 角标失败不阻塞 */ }
}

onMounted(() => {
  const qM = String(route.query.m || '');
  if (subDefs.some((s) => s.key === qM)) activeSub.value = qM;
  loadCounts();
});
</script>

<style scoped>
.content-home { display: flex; flex-direction: column; gap: 16px; }
.content-body { display: flex; gap: 16px; align-items: flex-start; }
/* 左侧竖向二级菜单（复用商品管理 cat-sidebar 样式） */
.cat-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
}
.cat-header {
  font-size: 11px;
  color: #909399;
  text-transform: uppercase;
  padding: 8px 12px 8px;
  letter-spacing: 0.5px;
}
.cat-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  color: #4e5969;
  transition: all 0.2s;
}
.cat-item:hover { background: #f2f3f5; color: #1d2129; }
.cat-item.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.cat-name { flex: 1; font-size: 14px; }
.cat-count {
  font-size: 12px;
  color: #86909c;
  background: #f2f3f5;
  border-radius: 10px;
  padding: 0 8px;
  line-height: 20px;
}
.cat-item.active .cat-count { background: rgba(22, 93, 255, 0.1); color: #165dff; }

/* 右侧内容区 */
.content-main { flex: 1; min-width: 0; background: #fff; border-radius: 8px; padding: 20px; }
</style>
