<template>
  <div class="rt-wrap">
    <Toolbar class="rt-toolbar" :editor="editorRef" :defaultConfig="toolbarConfig" mode="default" />
    <Editor class="rt-editor" v-model="html" :defaultConfig="editorConfig" mode="default" @onCreated="handleCreated" @onChange="handleChange" />
    <div class="rt-status">
      <span v-if="selPath" class="rt-path">{{ selPath }}</span>
      <span class="rt-count">字数统计：{{ wordCount }}</span>
    </div>
    <!-- 素材选择弹窗（ew 同步：图片按钮调系统素材库，非新上传方式） -->
    <MaterialPicker v-model="imgSel" @confirm="onPickImg" />
  </div>
</template>

<script setup>
import { ref, shallowRef, onBeforeUnmount, watch } from 'vue';
import { Editor, Toolbar } from '@wangeditor/editor-for-vue';
import '@wangeditor/editor/dist/css/style.css';
import MaterialPicker from './MaterialPicker.vue';

const props = defineProps({ modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);

const editorRef = shallowRef();
const html = ref(props.modelValue || '');
const wordCount = ref(0);
const selPath = ref('');
const imgSel = ref(false);
let pickInsertFn = null;

const toolbarConfig = {
  // ew 1:1：段落格式/字号/基础格式/文字与背景色/对齐/列表/表情/链接/代码块/图片(素材库)/缩进/行间距/表格
  // 注意: wangEditor5 的 toolbarKeys 只能用标准菜单 key(字符串), 对象{key,menuKeys}会渲染为工具栏外的孤立按钮
  toolbarKeys: [
    'headerSelect', 'fontSize', 'bold', 'italic', 'underline', 'through',
    'color', 'bgColor',
    'justifyLeft', 'justifyRight', 'justifyCenter', 'justifyJustify',
    'bulletedList', 'numberedList', 'emotion', 'insertLink', 'codeBlock',
    'uploadImage',
    'indent', 'delIndent',
    'lineHeight', 'insertTable',
  ],
};
const editorConfig = {
  placeholder: '请输入内容…',
  MENU_CONF: {
    uploadImage: {
      // ew 同步：点击图片按钮弹出系统素材库选择，不弹 wangEditor 原生上传
      // 注意: wangEditor5 配置项为 customBrowseAndUpload(customBrowse 不被识别→按钮 disabled)
      customBrowseAndUpload(insertFn) {
        pickInsertFn = insertFn;
        imgSel.value = true;
      },
    },
  },
};

async function onPickImg(url) {
  if (pickInsertFn && url) {
    // 弹窗操作后 wangEditor selection 丢失(isInsertImageMenuDisabled=true 不插入), 需恢复焦点+选区
    // editor.focus() 内部恢复 slate selection; 再延时让 selectionchange 完成
    const editor = editorRef.value;
    if (editor) {
      editor.focus();
      await new Promise((r) => setTimeout(r, 80));
    }
    pickInsertFn(url, '', url);
  }
  imgSel.value = false;
}

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
