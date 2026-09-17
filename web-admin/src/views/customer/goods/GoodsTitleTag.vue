<template>
  <GoodsTagList title="标题标签" desc="商品编辑时可选择的标题标签（1:1 复刻菜鸟云标题标签）" endpoint="/goods/title-tags" :has-content="true" />
</template>
<script setup>
import GoodsTagList from './GoodsTagList.vue';
</script>
