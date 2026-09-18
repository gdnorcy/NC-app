<template>
  <div class="live-rooms">
    <AppPageHeader title="直播列表" desc="管理小程序直播：创建/同步直播间，展示微信小程序直播数据">
      <div class="hd-actions">
        <el-button type="primary" @click="openCreate"><el-icon class="btn-ic"><Plus /></el-icon>创建直播间</el-button>
        <el-button @click="syncRooms">同步直播列表</el-button>
      </div>
    </AppPageHeader>

    <!-- 两条黄色提示（1:1 对齐菜鸟云直播列表页） -->
    <div class="warn-box">
      <div class="warn-line">可使用直播列表与DIY组件中的直播模块展示直播，直播间只能在微信小程序端打开</div>
      <div class="warn-line">导入的商品无法手动取消，需要去微信后台删除该直播间的商品</div>
    </div>

    <!-- 筛选：标题/主播昵称 + 状态 + 时间范围 -->
    <div class="filter-bar">
      <el-input v-model="query.keyword" placeholder="直播标题 / 主播昵称" clearable class="w200" @keyup.enter="page = 1; load()" @clear="page = 1; load()" />
      <el-select v-model="query.status" placeholder="直播状态" clearable class="w140" @change="page = 1; load()">
        <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
      </el-select>
      <el-date-picker
        v-model="range" type="datetimerange" range-separator="至" start-placeholder="开播开始" end-placeholder="开播结束"
        value-format="YYYY-MM-DD HH:mm:ss" class="w360" @change="page = 1; load()" />
      <el-button type="primary" plain @click="page = 1; load()"><el-icon><Search /></el-icon>搜索</el-button>
      <span class="list-total">共 {{ total }} 个直播间</span>
    </div>

    <el-table v-loading="loading" :data="list" class="mt12">
      <el-table-column label="房间号" width="90" align="center">
        <template #default="{ row }"><span class="room-no">{{ row.room_id ?? '-' }}</span></template>
      </el-table-column>
      <el-table-column label="直播名称" min-width="220">
        <template #default="{ row }">
          <div class="room-name">
            <span>{{ row.name }}</span>
            <el-button v-if="row.room_id" link type="primary" size="small" @click="copyLink(row)">复制直播间链接</el-button>
            <el-tag v-if="row.room_id" size="small" type="primary" effect="plain" class="mp-tag">小程序直播 竖屏</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="anchor_name" label="主播名称" width="120" />
      <el-table-column label="开播时间" width="170">
        <template #default="{ row }"><span>{{ row.start_time || '-' }}</span></template>
      </el-table-column>
      <el-table-column label="直播状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ row.status || '未开始' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="直播类型" width="100" align="center">
        <template #default="{ row }"><span>{{ row.live_type === 'push' ? '推流' : '手机直播' }}</span></template>
      </el-table-column>
      <el-table-column label="显示位置" width="90" align="center">
        <template #default="{ row }"><span>{{ row.list_display ? '列表显示' : '隐藏' }}</span></template>
      </el-table-column>
      <el-table-column label="直播数据" width="90" align="center">
        <template #default="{ row }"><span>{{ row.view_count ?? 0 }} 观看</span></template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openGoods(row)">查看商品</el-button>
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="delRoom(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination v-model:current-page="page" :page-size="query.pageSize" :total="total" layout="total, prev, pager, next" @current-change="load" />
    </div>

    <!-- 创建/编辑直播间弹窗（1:1 对齐菜鸟云「创建直播间」全量字段） -->
    <el-dialog v-model="dlg.show" :title="dlg.id ? '编辑直播间' : '创建直播间'" width="620px" :close-on-click-modal="false">
      <el-form label-width="110px" class="room-form">
        <el-form-item label="直播名称" required>
          <el-input v-model="dlg.form.name" maxlength="30" placeholder="最短3个汉字，最长30字符" />
        </el-form-item>

        <template v-if="!dlg.id">
          <el-form-item label="背景图" required>
            <div class="img-picker">
              <el-image v-if="dlg.form.backgroundImg" :src="resolveUrl(dlg.form.backgroundImg)" fit="cover" class="pick-box" />
              <div v-else class="pick-box pick-empty" @click="openPicker('backgroundImg')"><el-icon><Plus /></el-icon></div>
              <div class="picker-ops">
                <el-button size="small" @click="openPicker('backgroundImg')">选择图片</el-button>
                <el-button v-if="dlg.form.backgroundImg" size="small" text type="danger" @click="dlg.form.backgroundImg = ''">移除</el-button>
              </div>
            </div>
            <div class="form-hint">建议尺寸 1080×1920，文件不超过 2MB</div>
          </el-form-item>

          <el-form-item label="开始时间" required>
            <el-date-picker v-model="dlg.form.startTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="开播开始时间（当前10分钟后，不超6个月）" class="w100p" />
          </el-form-item>
          <el-form-item label="结束时间" required>
            <el-date-picker v-model="dlg.form.endTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="开播结束时间（与开始间隔30分钟-24小时）" class="w100p" />
          </el-form-item>
          <el-form-item label="主播昵称" required>
            <el-input v-model="dlg.form.anchorName" maxlength="15" placeholder="2-15个汉字" />
          </el-form-item>
          <el-form-item label="主播微信" required>
            <el-input v-model="dlg.form.anchorWechat" placeholder="须实名认证的微信号" />
          </el-form-item>
          <el-form-item label="分享图" required>
            <div class="img-picker">
              <el-image v-if="dlg.form.shareImg" :src="resolveUrl(dlg.form.shareImg)" fit="cover" class="pick-box" />
              <div v-else class="pick-box pick-empty" @click="openPicker('shareImg')"><el-icon><Plus /></el-icon></div>
              <div class="picker-ops">
                <el-button size="small" @click="openPicker('shareImg')">选择图片</el-button>
                <el-button v-if="dlg.form.shareImg" size="small" text type="danger" @click="dlg.form.shareImg = ''">移除</el-button>
              </div>
            </div>
            <div class="form-hint">建议尺寸 800×640，文件不超过 1MB</div>
          </el-form-item>
          <el-form-item label="封面图" required>
            <div class="img-picker">
              <el-image v-if="dlg.form.coverImg" :src="resolveUrl(dlg.form.coverImg)" fit="cover" class="pick-box" />
              <div v-else class="pick-box pick-empty" @click="openPicker('coverImg')"><el-icon><Plus /></el-icon></div>
              <div class="picker-ops">
                <el-button size="small" @click="openPicker('coverImg')">选择图片</el-button>
                <el-button v-if="dlg.form.coverImg" size="small" text type="danger" @click="dlg.form.coverImg = ''">移除</el-button>
              </div>
            </div>
            <div class="form-hint">建议尺寸 800×800，文件不超过 100KB</div>
          </el-form-item>

          <el-form-item label="直播类型">
            <el-radio-group v-model="dlg.form.liveType">
              <el-radio value="phone">手机直播</el-radio>
              <el-radio value="push">推流</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="功能开关">
            <div class="switch-grid">
              <span class="sw-item"><el-switch v-model="dlg.form.likeEnabled" />点赞</span>
              <span class="sw-item"><el-switch v-model="dlg.form.shelfEnabled" />货架</span>
              <span class="sw-item"><el-switch v-model="dlg.form.commentEnabled" />评论</span>
              <span class="sw-item"><el-switch v-model="dlg.form.replayEnabled" />回放</span>
              <span class="sw-item"><el-switch v-model="dlg.form.shareEnabled" />分享</span>
              <span class="sw-item"><el-switch v-model="dlg.form.serviceEnabled" />客服</span>
            </div>
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item label="直播间ID">
            <el-input v-model="dlg.form.roomId" placeholder="微信直播间ID" />
          </el-form-item>
          <el-form-item label="主播名称">
            <el-input v-model="dlg.form.anchorName" />
          </el-form-item>
          <el-form-item label="缩略图">
            <div class="img-picker">
              <el-image v-if="dlg.form.thumbnail" :src="resolveUrl(dlg.form.thumbnail)" fit="cover" class="pick-box" />
              <div v-else class="pick-box pick-empty" @click="openPicker('thumbnail')"><el-icon><Plus /></el-icon></div>
              <div class="picker-ops">
                <el-button size="small" @click="openPicker('thumbnail')">选择图片</el-button>
                <el-button v-if="dlg.form.thumbnail" size="small" text type="danger" @click="dlg.form.thumbnail = ''">移除</el-button>
              </div>
            </div>
            <div class="form-hint">文件不超过 200KB</div>
          </el-form-item>
          <el-form-item label="直播时间">
            <div class="time-ro"><span>{{ dlg.form.start_time || '-' }}</span><span>至</span><span>{{ dlg.form.end_time || '-' }}</span></div>
            <div class="form-hint">仅展示，不会自动改变直播状态</div>
          </el-form-item>
          <el-form-item label="来源">
            <el-input :model-value="dlg.form.source || '小程序直播'" disabled />
          </el-form-item>
          <el-form-item label="列表显示">
            <el-switch v-model="dlg.form.listDisplay" />
            <span class="form-hint">是否在直播列表中显示</span>
          </el-form-item>
          <el-form-item label="设为推荐">
            <el-switch v-model="dlg.form.recommend" />
            <span class="form-hint">开启后用于DIY直播模块区分展示</span>
          </el-form-item>
          <el-form-item label="直播类型">
            <el-radio-group v-model="dlg.form.liveType">
              <el-radio value="phone">手机直播</el-radio>
              <el-radio value="push">推流</el-radio>
            </el-radio-group>
          </el-form-item>
          <template v-if="dlg.form.liveType === 'push'">
            <el-form-item label="推流地址">
              <span class="push-text">{{ dlg.form.pushAddr || '-' }}</span>
              <el-button v-if="dlg.form.pushAddr" link type="primary" size="small" @click="copyPush('pushAddr')">复制</el-button>
            </el-form-item>
            <el-form-item label="推流码">
              <span class="push-text">{{ dlg.form.pushCode || '-' }}</span>
              <el-button v-if="dlg.form.pushCode" link type="primary" size="small" @click="copyPush('pushCode')">复制</el-button>
            </el-form-item>
          </template>
          <el-form-item label="功能开关">
            <div class="switch-grid">
              <span class="sw-item"><el-switch v-model="dlg.form.replayEnabled" />回放</span>
              <span class="sw-item"><el-switch v-model="dlg.form.shareEnabled" />分享</span>
              <span class="sw-item"><el-switch v-model="dlg.form.serviceEnabled" />客服</span>
            </div>
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dlg.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 直播间商品弹窗 -->
    <el-dialog v-model="goodsDlg.show" :title="`直播间商品：${goodsDlg.name || ''}`" width="640px">
      <el-table v-loading="goodsDlg.loading" :data="goodsDlg.rows" size="small">
        <el-table-column prop="name" label="商品名称" min-width="160" />
        <el-table-column label="价格" width="100">
          <template #default="{ row }"><span>¥{{ row.priceYuan }}</span></template>
        </el-table-column>
        <el-table-column prop="page_path" label="页面路径" min-width="200" show-overflow-tooltip />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }"><el-tag size="small" :type="row.audit_status === 'approved' ? 'success' : 'info'">{{ auditLabel(row.audit_status) }}</el-tag></template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <MaterialPicker v-model="picker.show" @confirm="onPickImg" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import MaterialPicker from '../apps/design/MaterialPicker.vue';

const statusOptions = ['全部', '直播中', '未开始', '已结束', '禁播', '暂停中', '异常', '已过期'];
const statusType = (s) => ({ 直播中: 'success', 已结束: 'info', 禁播: 'danger', 异常: 'warning' }[s] || 'info');

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const range = ref(null);
const query = reactive({ keyword: '', status: '', pageSize: 10 });

function resolveUrl(u) { return u || ''; }
const auditLabel = (s) => ({ pending: '待审核', approved: '已通过', failed: '审核失败' }[s] || s);

async function load() {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: query.pageSize };
    if (query.keyword) params.keyword = query.keyword;
    if (query.status && query.status !== '全部') params.status = query.status;
    if (range.value && range.value.length === 2) { params.startDate = range.value[0]; params.endDate = range.value[1]; }
    const res = await customerApiCall.get('/live/rooms', { params });
    list.value = res.rows || [];
    total.value = res.total || 0;
  } catch (e) {
    ElMessage.error(e || '加载直播列表失败');
  } finally { loading.value = false; }
}

const dlg = reactive({ show: false, id: null, form: {} });
const saving = ref(false);
function emptyForm() {
  return {
    name: '', backgroundImg: '', shareImg: '', coverImg: '',
    startTime: '', endTime: '', anchorName: '', anchorWechat: '',
    liveType: 'phone', likeEnabled: true, shelfEnabled: true, commentEnabled: true,
    replayEnabled: false, shareEnabled: true, serviceEnabled: false,
  };
}
function openCreate() { dlg.id = null; dlg.form = emptyForm(); dlg.show = true; }
function openEdit(row) {
  dlg.id = row.id;
  dlg.form = {
    name: row.name, roomId: row.room_id, anchorName: row.anchor_name,
    thumbnail: row.thumbnail, listDisplay: !!row.list_display, recommend: !!row.recommend,
    liveType: row.live_type || 'phone',
    pushAddr: row.push_addr || '', pushCode: row.push_code || '',
    start_time: row.start_time, end_time: row.end_time,
    source: row.source, replayEnabled: !!row.replay_enabled, shareEnabled: !!row.share_enabled, serviceEnabled: !!row.service_enabled,
  };
  dlg.show = true;
}
async function save() {
  const f = dlg.form;
  if (!f.name || f.name.trim().length < 3) { ElMessage.warning('直播名称最短3个汉字'); return; }
  if (!dlg.id) {
    if (!f.startTime || !f.endTime) { ElMessage.warning('请填写开始/结束时间'); return; }
    if (!f.anchorName) { ElMessage.warning('请填写主播昵称'); return; }
    if (!f.anchorWechat) { ElMessage.warning('请填写主播微信'); return; }
  }
  saving.value = true;
  try {
    if (dlg.id) {
      await customerApiCall.put(`/live/rooms/${dlg.id}`, {
        name: f.name, roomId: f.roomId, anchorName: f.anchorName, thumbnail: f.thumbnail,
        listDisplay: f.listDisplay ? 1 : 0, recommend: f.recommend ? 1 : 0, liveType: f.liveType,
        replayEnabled: f.replayEnabled ? 1 : 0, shareEnabled: f.shareEnabled ? 1 : 0, serviceEnabled: f.serviceEnabled ? 1 : 0,
      });
    } else {
      await customerApiCall.post('/live/rooms', {
        name: f.name, backgroundImg: f.backgroundImg, shareImg: f.shareImg, coverImg: f.coverImg,
        startTime: f.startTime, endTime: f.endTime, anchorName: f.anchorName, anchorWechat: f.anchorWechat,
        liveType: f.liveType,
        likeEnabled: f.likeEnabled ? 1 : 0, shelfEnabled: f.shelfEnabled ? 1 : 0, commentEnabled: f.commentEnabled ? 1 : 0,
        replayEnabled: f.replayEnabled ? 1 : 0, shareEnabled: f.shareEnabled ? 1 : 0, serviceEnabled: f.serviceEnabled ? 1 : 0,
      });
    }
    ElMessage.success('保存成功');
    dlg.show = false;
    load();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally { saving.value = false; }
}

async function syncRooms() {
  try {
    const res = await customerApiCall.post('/live/rooms/sync');
    ElMessage.success(`同步完成：新增 ${res.added} 个直播间`);
    load();
  } catch (e) { ElMessage.error(e || '同步失败'); }
}

async function copyLink(row) {
  try {
    const res = await customerApiCall.get(`/live/rooms/${row.id}/link`);
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(res.link);
    ElMessage.success('直播间链接已复制');
  } catch (e) { ElMessage.error(e || '复制失败'); }
}

async function copyPush(field) {
  const val = dlg.form[field];
  if (!val) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(val);
    ElMessage.success(field === 'pushAddr' ? '推流地址已复制' : '推流码已复制');
  } catch (e) { ElMessage.error(e || '复制失败'); }
}

async function delRoom(row) {
  try {
    await ElMessageBox.confirm(`确定删除直播间「${row.name}」吗？删除后不可恢复`, '删除直播间', { type: 'warning' });
  } catch { return; }
  try {
    await customerApiCall.delete(`/live/rooms/${row.id}`);
    ElMessage.success('删除成功');
    load();
  } catch (e) { ElMessage.error(e || '删除失败'); }
}

// 直播间商品弹窗：展示商品库（直播间上架商品）
const goodsDlg = reactive({ show: false, name: '', rows: [], loading: false });
async function openGoods(row) {
  goodsDlg.name = row.name;
  goodsDlg.show = true;
  goodsDlg.loading = true;
  try {
    const res = await customerApiCall.get('/live/goods', { params: { pageSize: 50 } });
    goodsDlg.rows = res.rows || [];
  } catch (e) { ElMessage.error(e || '加载商品失败'); }
  finally { goodsDlg.loading = false; }
}

const picker = reactive({ show: false, target: '' });
function openPicker(target) { picker.target = target; picker.show = true; }
function onPickImg(url) { if (url) dlg.form[picker.target] = url; }

onMounted(load);
</script>

<style scoped>
.hd-actions { display: flex; gap: 12px; }
.btn-ic { margin-right: 4px; }
.warn-box {
  background: #fffbe6; border: 1px solid #ffe58f; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px;
}
.warn-line { font-size: 13px; color: #ad6800; line-height: 1.8; }
.warn-line + .warn-line { margin-top: 2px; }
.filter-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.list-total { font-size: 13px; color: #86909c; }
.w200 { width: 200px; } .w140 { width: 140px; } .w360 { width: 360px; } .w100p { width: 100%; }
.room-name { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.room-no { font-family: monospace; }
.mp-tag { margin-left: 2px; }
.mt12 { margin-top: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.img-picker { display: flex; align-items: center; gap: 10px; }
.pick-box { width: 88px; height: 88px; border-radius: 6px; }
.pick-empty { border: 1px dashed #c9cdd4; display: flex; align-items: center; justify-content: center; color: #86909c; cursor: pointer; }
.picker-ops { display: flex; flex-direction: column; gap: 4px; }
.form-hint { font-size: 12px; color: #86909c; line-height: 1.5; margin-top: 4px; }
.switch-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.sw-item { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #1d2129; }
.time-ro { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #1d2129; }
.push-text { font-family: monospace; font-size: 13px; color: #1d2129; word-break: break-all; margin-right: 8px; }
</style>
