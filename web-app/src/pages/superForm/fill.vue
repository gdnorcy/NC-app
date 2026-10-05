<template>
<!-- PageNav -->
<PageNav title="超级表单" back />
  <!--
    超级表单独立填表页（薄壳）
    表单渲染 / 校验 / 条件显隐 / 分页 / 支付 / 协议与视频弹层等全部逻辑
    已抽到共享组件 SuperFormRender.vue，本页只负责「取路由参数 + 决定提交后去哪」。

    装修组件内嵌渲染走同一个组件（mode='embed'），因此不存在两套实现。
  -->
  <SuperFormRender
    :form-id="formId"
    mode="page"
    @submit-success="onSubmitSuccess"
  />
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import SuperFormRender from '../../components/SuperFormRender.vue';

const formId = ref('');

onLoad((opts) => {
  // 参数契约：?formId=（兼容旧写法 ?id=）
  formId.value = opts?.formId || opts?.id || '';
});

// 组件内部对「有跳转链接」已自行 redirectTo；这里只在没有链接时兜底提示
function onSubmitSuccess() {}
</script>