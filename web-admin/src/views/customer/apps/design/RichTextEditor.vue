<template>
  <div class="rt-wrap">
    <Toolbar class="rt-toolbar" :editor="editorRef" :defaultConfig="toolbarConfig" mode="default" />
    <Editor class="rt-editor" v-model="html" :defaultConfig="editorConfig" mode="default" @onCreated="handleCreated" @onChange="handleChange" />
    <div class="rt-status">
      <span v-if="selPath" class="rt-path">{{ selPath }}</span>
      <span class="rt-count">字数统计：{{ wordCount }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, onBeforeUnmount, watch } from 'vue';
import { Editor, Toolbar } from '@wangeditor/editor-for-vue';
import '@wangeditor/editor/dist/css/style.css';
import { designCall } from '../../../../api';

const props = defineProps({ modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);

const editorRef = shallowRef();
const html = ref(props.modelValue || '');
const wordCount = ref(0);
const selPath = ref('');

const toolbarConfig = {
  // ew 1:1：只保留 ew 富文本工具栏等价项（段落格式/字号/基础格式/文字与背景色/图片/链接/表格），避免溢出
  toolbarKeys: [
    'headerSelect', 'fontSize', 'bold', 'italic', 'underline', 'through',
    'color', 'bgColor',
    { key: 'group-image', menuKeys: ['insertImage', 'uploadImage'] },
    'insertLink', 'insertTable',
  ],
};
const editorConfig = {
  placeholder: '请输入内容…',
  MENU_CONF: {
    insertImage: { onInsertedImage(imageNode) { } },
    uploadImage: {
      async customUpload(file, insertFn) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const res = await designCall.post('/material/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          const url = res?.url || '';
          if (url) insertFn(url, file.name, url);
        } catch (e) {
          // 上传失败：插入本地预览（保存前不会持久化）
          const url = URL.createObjectURL(file);
          insertFn(url, file.name, url);
        }
      },
    },
  },
};

watch(() => props.modelValue, (v) => {
  if (editorRef.value && v !== html.value) {
    editorRef.value.setHtml(v || '');
  }
});

function handleCreated(editor) {
  editorRef.value = editor;
  const txt = editor.getText() || '';
  wordCount.value = txt.replace(/\s/g, '').length;
  editor.on('selectionchange', () => {
    const node = editor.selection?.getSelectionStartNode?.();
    selPath.value = node ? (node.nodeName || '').toLowerCase() : '';
  });
}
function handleChange(editor) {
  html.value = editor.getHtml();
  emit('update:modelValue', html.value);
  const txt = editor.getText() || '';
  wordCount.value = txt.replace(/\s/g, '').length;
}
onBeforeUnmount(() => {
  editorRef.value?.destroy();
});
</script>

<style scoped>
.rt-wrap { border: 1px solid #E5E6EB; border-radius: 8px; overflow: hidden; background: #fff; }
.rt-toolbar { border-bottom: 1px solid #E5E6EB; }
.rt-editor { min-height: 200px; max-height: 360px; overflow-y: auto; }
.rt-editor :deep(.w-e-text-container) { min-height: 200px; max-height: 360px; }
.rt-status { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; font-size: 12px; color: #86909C; border-top: 1px solid #E5E6EB; background: #FAFAFA; }
</style>
