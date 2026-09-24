<template>
  <div>
    <div class="center-nav">
      <div
        v-for="t in tabs"
        :key="t.key"
        class="center-nav-item"
        :class="{ active: activeTab === t.key }"
        @click="switchTab(t.key)"
      >{{ t.label }}</div>
    </div>

    <!-- ============ 雷达事件 ============ -->
    <div v-if="activeTab === 'events'">
      <div class="sec-title">
        <span>雷达事件</span>
        <el-button type="primary" size="small" @click="openEventDialog()">新建事件</el-button>
      </div>
      <el-table :data="events" size="small" border>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="事件标识" width="130" />
        <el-table-column prop="title" label="展示名" min-width="130" />
        <el-table-column prop="icon" label="图标" width="90" />
        <el-table-column label="重要级" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.importance >= 2 ? 'danger' : 'info'" size="small">{{ row.importance >= 2 ? '高' : '普通' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="weight" label="权重" width="70" align="center" />
        <el-table-column label="推送方式" width="100" align="center">
          <template #default="{ row }">
            <span>{{ noticeTypeText(row.notice_type) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="计入AI" width="80" align="center">
          <template #default="{ row }"><el-tag :type="row.is_show_ai ? 'success' : 'info'" size="small">{{ row.is_show_ai ? '是' : '否' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="启用" width="70" align="center">
          <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '开' : '关' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="70" align="center" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="openEventDialog(row)">编辑</el-button>
            <el-button size="small" link type="danger" @click="removeEvent(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- ============ 话术库 ============ -->
    <div v-if="activeTab === 'words'">
      <div class="sec-title">
        <span>话术库</span>
        <el-button type="primary" size="small" :disabled="!events.length" @click="openWordDialog()">新增话术</el-button>
      </div>
      <div v-for="g in wordGroups" :key="g.eventId" class="word-group">
        <div class="word-group-head">
          <span class="word-group-title">{{ g.title }}</span>
          <el-tag size="small" :type="g.importance >= 2 ? 'danger' : 'info'">{{ g.name }}</el-tag>
          <el-tag v-if="!g.enabled" size="small" type="info">已停用</el-tag>
        </div>
        <div v-if="!g.words.length" class="word-empty">暂无话术，点击上方「新增话术」配置</div>
        <div v-for="w in g.words" :key="w.id" class="word-row">
          <div class="word-range">第 {{ w.time_start }} 次{{ w.time_end ? '~第 ' + w.time_end + ' 次' : '起' }}</div>
          <div class="word-content">{{ w.words }}</div>
          <div class="word-ops">
            <el-button size="small" link type="primary" @click="openWordDialog(g, w)">编辑</el-button>
            <el-button size="small" link type="danger" @click="removeWord(w)">删除</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 推送模板 ============ -->
    <div v-if="activeTab === 'push'">
      <div class="sec-title"><span>推送模板配置</span></div>
      <el-form :model="pushForm" label-width="150px" class="push-form">
        <el-form-item label="雷达推送总开关">
          <el-switch v-model="pushForm.switch" active-text="开启" inactive-text="关闭" />
        </el-form-item>
        <el-form-item label="小程序订阅消息模板ID">
          <el-input v-model="pushForm.xcxTmpid" placeholder="wx.requestSubscribeMessage 授权模板 id" style="max-width: 420px" />
        </el-form-item>
        <el-form-item label="公众号 AppID">
          <el-input v-model="pushForm.gzhAppid" placeholder="公众号 appid（需已关注）" style="max-width: 420px" />
        </el-form-item>
        <el-form-item label="公众号模板ID">
          <el-input v-model="pushForm.gzhTmpid" placeholder="审核通过的模板 id" style="max-width: 420px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="small" :loading="savingPush" @click="savePush">保存配置</el-button>
        </el-form-item>
      </el-form>
      <div class="push-tip">提示：阶段 A–C 推送以站内提醒为主；订阅消息 / 公众号通道在阶段 D 联调，配置后可下发。</div>
    </div>

    <!-- 事件编辑对话框 -->
    <el-dialog v-model="eventDialog.visible" :title="eventDialog.id ? '编辑事件' : '新建事件'" width="520px">
      <el-form label-width="110px">
        <el-form-item label="事件标识" required>
          <el-input v-model="eventDialog.form.name" placeholder="如 book_visit（与 track actionType 对齐）" :disabled="!!eventDialog.id" />
        </el-form-item>
        <el-form-item label="展示名">
          <el-input v-model="eventDialog.form.title" placeholder="如 预约到访" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="eventDialog.form.icon" placeholder="图标名（view/like/comment…）" />
        </el-form-item>
        <el-form-item label="重要级">
          <el-radio-group v-model="eventDialog.form.importance">
            <el-radio :value="1">普通</el-radio>
            <el-radio :value="2">高（转发/留电话/二次回访）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="eventDialog.form.weight" :min="1" :max="10" />
        </el-form-item>
        <el-form-item label="推送方式">
          <el-select v-model="eventDialog.form.noticeType" style="width: 200px">
            <el-option :value="1" label="小程序订阅消息" />
            <el-option :value="2" label="公众号模板" />
            <el-option :value="0" label="不推送" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="eventDialog.form.sortOrder" :min="0" />
        </el-form-item>
        <el-form-item label="计入AI报告">
          <el-switch v-model="eventDialog.form.isShowAi" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="eventDialog.form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="eventDialog.visible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="savingEvent" @click="saveEvent">保存</el-button>
      </template>
    </el-dialog>

    <!-- 话术编辑对话框 -->
    <el-dialog v-model="wordDialog.visible" :title="wordDialog.id ? '编辑话术' : '新增话术'" width="520px">
      <el-form label-width="110px">
        <el-form-item label="所属事件" required>
          <el-select v-model="wordDialog.form.eventId" style="width: 100%" :disabled="!!wordDialog.id">
            <el-option v-for="e in events" :key="e.id" :value="e.id" :label="`${e.title}（${e.name}）`" />
          </el-select>
        </el-form-item>
        <el-form-item label="命中区间">
          <div class="range-row">
            第 <el-input-number v-model="wordDialog.form.timeStart" :min="0" size="small" /> 次
            ～ <el-input-number v-model="wordDialog.form.timeEnd" :min="0" size="small" /> 次（0 = 不限）
          </div>
        </el-form-item>
        <el-form-item label="话术内容" required>
          <el-input v-model="wordDialog.form.words" type="textarea" :rows="3" maxlength="500" placeholder="跟进建议话术（不自动群发，仅作建议）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="wordDialog.visible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="savingWord" @click="saveWord">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  fetchRadarEvents, createRadarEvent, updateRadarEvent, deleteRadarEvent,
  fetchRadarWords, createRadarWord, updateRadarWord, deleteRadarWord,
  fetchRadarPushConfig, saveRadarPushConfig,
} from '../../api';

const tabs = [
  { key: 'events', label: '雷达事件' },
  { key: 'words', label: '话术库' },
  { key: 'push', label: '推送模板' },
];
const activeTab = ref('events');
const switchTab = (k) => { activeTab.value = k; };

const events = ref([]);
const wordGroups = ref([]);
const pushForm = ref({ switch: false, xcxTmpid: '', gzhAppid: '', gzhTmpid: '' });

const noticeTypeText = (n) => (n === 1 ? '订阅消息' : n === 2 ? '公众号' : '不推送');

const loadEvents = async () => { events.value = await fetchRadarEvents().then((r) => r.events); };
const loadWords = async () => { wordGroups.value = await fetchRadarWords().then((r) => r.groups); };
const loadPush = async () => {
  const c = await fetchRadarPushConfig().then((r) => r.config);
  pushForm.value = { switch: !!c.switch, xcxTmpid: c.xcxTmpid || '', gzhAppid: c.gzhAppid || '', gzhTmpid: c.gzhTmpid || '' };
};

onMounted(() => { loadEvents(); loadWords(); loadPush(); });

// —— 事件 ——
const eventDialog = ref({ visible: false, id: null, form: {} });
const openEventDialog = (row) => {
  if (row) {
    eventDialog.value = {
      visible: true, id: row.id,
      form: { name: row.name, title: row.title, icon: row.icon, importance: row.importance, weight: row.weight, noticeType: row.notice_type, sortOrder: row.sort_order, isShowAi: !!row.is_show_ai, enabled: !!row.enabled },
    };
  } else {
    eventDialog.value = { visible: true, id: null, form: { name: '', title: '', icon: '', importance: 1, weight: 1, noticeType: 1, sortOrder: 0, isShowAi: true, enabled: true } };
  }
};
const savingEvent = ref(false);
const saveEvent = async () => {
  const f = eventDialog.value.form;
  if (!f.name || !f.name.trim()) return ElMessage.warning('请填写事件标识');
  savingEvent.value = true;
  try {
    if (eventDialog.value.id) await updateRadarEvent(eventDialog.value.id, f);
    else await createRadarEvent(f);
    ElMessage.success('已保存');
    eventDialog.value.visible = false;
    await loadEvents(); await loadWords();
  } catch (e) { ElMessage.error(e); } finally { savingEvent.value = false; }
};
const removeEvent = async (row) => {
  try {
    await ElMessageBox.confirm(`删除事件「${row.title}」将连同其话术一并清理，确认删除？`, '删除确认', { type: 'warning' });
    await deleteRadarEvent(row.id);
    ElMessage.success('已删除');
    await loadEvents(); await loadWords();
  } catch {}
};

// —— 话术 ——
const wordDialog = ref({ visible: false, id: null, form: {} });
const openWordDialog = (group, w) => {
  if (w) {
    wordDialog.value = { visible: true, id: w.id, form: { eventId: group.eventId, timeStart: w.time_start, timeEnd: w.time_end, words: w.words } };
  } else {
    wordDialog.value = { visible: true, id: null, form: { eventId: group ? group.eventId : (events.value[0]?.id), timeStart: 1, timeEnd: 0, words: '' } };
  }
};
const savingWord = ref(false);
const saveWord = async () => {
  const f = wordDialog.value.form;
  if (!f.eventId) return ElMessage.warning('请选择所属事件');
  if (!f.words || !f.words.trim()) return ElMessage.warning('请填写话术内容');
  savingWord.value = true;
  try {
    if (wordDialog.value.id) await updateRadarWord(wordDialog.value.id, f);
    else await createRadarWord(f);
    ElMessage.success('已保存');
    wordDialog.value.visible = false;
    await loadWords();
  } catch (e) { ElMessage.error(e); } finally { savingWord.value = false; }
};
const removeWord = async (w) => {
  try {
    await ElMessageBox.confirm('确认删除该条话术？', '删除确认', { type: 'warning' });
    await deleteRadarWord(w.id);
    ElMessage.success('已删除');
    await loadWords();
  } catch {}
};

// —— 推送模板 ——
const savingPush = ref(false);
const savePush = async () => {
  savingPush.value = true;
  try {
    await saveRadarPushConfig(pushForm.value);
    ElMessage.success('配置已保存');
  } catch (e) { ElMessage.error(e); } finally { savingPush.value = false; }
};
</script>

<style scoped>
.center-nav { display: flex; gap: 4px; padding: 4px 0 12px; }
.center-nav-item { padding: 6px 16px; font-size: 14px; color: #666; cursor: pointer; border-radius: 6px; }
.center-nav-item.active { background: #1f6feb; color: #fff; font-weight: 600; }
.sec-title { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; font-weight: 600; font-size: 15px; }
.word-group { margin-bottom: 16px; border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden; }
.word-group-head { display: flex; gap: 8px; align-items: center; padding: 8px 12px; background: #fafafa; font-weight: 600; }
.word-group-title { font-size: 14px; }
.word-empty { padding: 12px; color: #909399; font-size: 13px; }
.word-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-top: 1px solid #f0f0f0; }
.word-range { flex: 0 0 130px; color: #606266; font-size: 13px; }
.word-content { flex: 1; color: #303133; font-size: 13px; }
.word-ops { flex: 0 0 auto; }
.push-form { max-width: 640px; }
.push-tip { color: #909399; font-size: 13px; }
.range-row { display: flex; align-items: center; gap: 6px; }
</style>
