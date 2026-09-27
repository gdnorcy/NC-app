<template>
  <GoodsTagList title="品牌标签" desc="商品编辑时可选择的品牌标签" endpoint="/goods/brand-tags" :has-content="true" />
</template>
<script setup>
import GoodsTagList from './GoodsTagList.vue';
</script>
