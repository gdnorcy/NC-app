<template>
  <GoodsTagList title="服务保障" desc="商品编辑时可选择的服务保障标签（1:1 复刻菜鸟云服务保障）" endpoint="/goods/service-tags" :has-icon="true" />
</template>
<script setup>
import GoodsTagList from './GoodsTagList.vue';
</script>
