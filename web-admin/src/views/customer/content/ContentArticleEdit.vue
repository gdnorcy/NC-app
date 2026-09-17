<template>
  <div class="article-edit-page">
    <!-- 页头 -->
    <div class="edit-header">
      <div class="edit-title">{{ isEdit ? '编辑文章' : '添加文章' }}</div>
      <div class="edit-ops">
        <el-button @click="router.back()">返回</el-button>
        <el-button type="primary" plain :loading="saving" @click="save(false)">保存</el-button>
        <el-button type="primary" :loading="saving" @click="save(true)">保存并返回列表</el-button>
      </div>
    </div>

    <el-tabs v-model="tab" type="border-card">
      <!-- ============ 基础设置 ============ -->
      <el-tab-pane label="基础设置" name="base">
        <el-form :model="form" label-width="140px" class="edit-form">
          <el-form-item label="状态">
            <el-radio-group v-model="form.status">
              <el-radio :value="1">上架</el-radio>
              <el-radio :value="0">下架</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="排序">
            <el-input-number v-model="form.sortOrder" :min="0" controls-position="right" style="width: 160px" />
            <span class="form-hint">数字越大越靠前</span>
          </el-form-item>
          <el-form-item label="所属分类" required>
            <el-select v-model="form.cateIds" multiple style="width: 420px" placeholder="请选择分类，可多选">
              <el-option-group v-for="c in cateTree" :key="c.id" :label="c.name">
                <el-option :value="c.id" :label="c.name" />
                <el-option v-for="s in c.children || []" :key="s.id" :value="s.id" :label="`└ ${s.name}`" />
              </el-option-group>
            </el-select>
            <div class="form-hint full">请选择分类，可多选，保存后第一个分类会作为主分类使用</div>
          </el-form-item>
          <el-form-item label="文章标题" required>
            <el-input v-model="form.title" maxlength="50" placeholder="请输入文章标题" style="width: 420px" />
          </el-form-item>
          <el-form-item label="缩略图">
            <div class="img-picker">
              <el-image v-if="form.thumb" :src="resolveUrl(form.thumb)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(form.thumb)]" preview-teleported />
              <div v-else class="thumb-box thumb-empty" @click="openPicker('thumb')"><el-icon><Plus /></el-icon></div>
              <div class="picker-ops">
                <el-button size="small" @click="openPicker('thumb')">选择图片</el-button>
                <el-button v-if="form.thumb" size="small" text type="danger" @click="form.thumb = ''">移除</el-button>
              </div>
            </div>
            <div class="form-hint">建议尺寸与文章分类中的图片比例一致，不超过 500kb</div>
          </el-form-item>
          <el-form-item label="轮播图">
            <div class="img-list">
              <div v-for="(img, i) in form.carousel" :key="i" class="img-item">
                <el-image :src="resolveUrl(img)" fit="cover" class="img-box" :preview-src-list="form.carousel.map(resolveUrl)" preview-teleported />
                <span class="img-del" @click="form.carousel.splice(i, 1)"><el-icon><Close /></el-icon></span>
              </div>
              <div class="img-item img-add" @click="openPicker('carousel')"><el-icon><Plus /></el-icon></div>
            </div>
            <div class="form-hint">建议尺寸 750*432，不超过 200kb</div>
          </el-form-item>
          <el-form-item label="更新时间">
            <el-date-picker v-model="form.updateAt" type="date" value-format="YYYY-MM-DD" placeholder="选择更新时间" style="width: 200px" />
          </el-form-item>
          <el-form-item label="浏览次数">
            <el-input-number v-model="form.views" :min="0" controls-position="right" style="width: 160px" />
            <span class="form-hint">次</span>
          </el-form-item>
          <el-form-item label="文章简介">
            <el-input v-model="form.intro" type="textarea" :rows="2" maxlength="200" placeholder="请输入文章简介" style="width: 480px" />
          </el-form-item>
          <el-form-item label="文章详情" required>
            <RichTextEditor v-model="form.detail" class="rich-editor" />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 样式设置 ============ -->
      <el-tab-pane label="样式设置" name="style">
        <el-form :model="form" label-width="140px" class="edit-form">
          <div class="form-section">标题板块</div>
          <el-form-item label="标题展示">
            <el-radio-group v-model="form.titleShow">
              <el-radio :value="1">展示</el-radio>
              <el-radio :value="0">隐藏</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="时间展示">
            <el-radio-group v-model="form.timeShow">
              <el-radio :value="1">展示</el-radio>
              <el-radio :value="0">隐藏</el-radio>
            </el-radio-group>
          </el-form-item>

          <div class="form-section">海报与分享</div>
          <el-form-item label="海报背景">
            <div class="img-picker">
              <el-image v-if="form.posterBg" :src="resolveUrl(form.posterBg)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(form.posterBg)]" preview-teleported />
              <div v-else class="thumb-box thumb-empty" @click="openPicker('posterBg')"><el-icon><Plus /></el-icon></div>
              <div class="picker-ops">
                <el-button size="small" @click="openPicker('posterBg')">选择图片</el-button>
                <el-button v-if="form.posterBg" size="small" text type="danger" @click="form.posterBg = ''">移除</el-button>
              </div>
            </div>
            <div class="form-hint">建议尺寸 600*960，不超过 500kb，分享图底部留空 260px</div>
          </el-form-item>
          <el-form-item label="分享标题">
            <el-input v-model="form.shareTitle" maxlength="30" placeholder="分享给好友时展示的标题" style="width: 320px" />
          </el-form-item>
          <el-form-item label="分享图">
            <el-radio-group v-model="form.shareImgMode">
              <el-radio value="thumb">缩略图</el-radio>
              <el-radio value="custom">自定义</el-radio>
              <el-radio value="mini">小程序转发图</el-radio>
            </el-radio-group>
            <div v-if="form.shareImgMode !== 'thumb'" class="img-picker full-row">
              <el-image v-if="form.shareImg" :src="resolveUrl(form.shareImg)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(form.shareImg)]" preview-teleported />
              <div v-else class="thumb-box thumb-empty" @click="openPicker('shareImg')"><el-icon><Plus /></el-icon></div>
              <el-button size="small" @click="openPicker('shareImg')">选择图片</el-button>
              <el-button v-if="form.shareImg" size="small" text type="danger" @click="form.shareImg = ''">移除</el-button>
            </div>
          </el-form-item>

          <div class="form-section">数据展示</div>
          <el-form-item label="访问量展示">
            <el-radio-group v-model="form.visitShow">
              <el-radio :value="1">展示</el-radio>
              <el-radio :value="0">隐藏</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="点赞量展示">
            <el-radio-group v-model="form.likeShow">
              <el-radio :value="1">展示</el-radio>
              <el-radio :value="0">隐藏</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="收藏量展示">
            <el-radio-group v-model="form.collectShow">
              <el-radio :value="1">展示</el-radio>
              <el-radio :value="0">隐藏</el-radio>
            </el-radio-group>
          </el-form-item>

          <div class="form-section">关联文章</div>
          <el-form-item label="关联文章显示标题">
            <el-input v-model="form.relateTitle" maxlength="10" placeholder="默认 推荐阅读" style="width: 200px" />
            <span class="form-hint">不超过 10 字</span>
          </el-form-item>
          <el-form-item label="关联文章">
            <div class="relate-list">
              <div v-for="(a, i) in form.relateList" :key="a.id" class="relate-item">
                <span class="relate-drag">≡</span>
                <span class="relate-name">{{ a.title }}</span>
                <el-button link type="danger" @click="form.relateList.splice(i, 1)">移除</el-button>
              </div>
              <el-button size="small" @click="openRelatePicker">添加文章</el-button>
            </div>
            <div class="form-hint">按住标题可以上下拖动排序</div>
          </el-form-item>

          <div class="form-section">高级展示</div>
          <el-form-item label="展示内容">
            <el-radio-group v-model="form.showContent">
              <el-radio value="goods">推荐商品</el-radio>
            </el-radio-group>
            <div class="form-hint full">请将商品开启推荐和分销功能</div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 音视频设置 ============ -->
      <el-tab-pane label="音视频设置" name="media">
        <el-form :model="form" label-width="140px" class="edit-form">
          <div class="form-section">视频设置</div>
          <el-form-item label="视频">
            <div class="video-list">
              <div v-for="(v, i) in form.videos" :key="i" class="video-item">
                <el-button size="small" type="primary" plain @click="openVideoPicker(i)">选择视频</el-button>
                <video v-if="v.url" :src="resolveUrl(v.url)" controls style="width: 120px; height: 68px; object-fit: cover; border-radius: 6px;"></video>
                <el-input v-model="v.url" placeholder="视频链接（素材库/mp4/腾讯视频/抖音）" style="width: 260px" />
                <el-radio-group v-model="v.playMode">
                  <el-radio value="click">点击播放</el-radio>
                  <el-radio value="auto">自动播放</el-radio>
                </el-radio-group>
                <el-button link type="danger" @click="form.videos.splice(i, 1)">移除</el-button>
              </div>
              <el-button size="small" @click="form.videos.push({ url: '', playMode: 'click' })">增加视频</el-button>
            </div>
            <div class="form-hint">播放方式默认点击播放；可通过素材库选择或粘贴第三方平台视频链接</div>
          </el-form-item>

          <div class="form-section">音频设置</div>
          <el-form-item label="音频标题">
            <el-input v-model="form.audioTitle" placeholder="请输入音频标题" style="width: 320px" />
          </el-form-item>
          <el-form-item label="音频链接">
            <el-input v-model="form.audioUrl" placeholder="选择音频" style="width: 320px" />
          </el-form-item>
          <el-form-item label="播放设置">
            <el-radio-group v-model="form.audioMode">
              <el-radio value="normal">正常音频</el-radio>
              <el-radio value="background">背景音频</el-radio>
            </el-radio-group>
            <div class="form-hint full">背景音频离开页面后可继续播放，背景音频仅支持微信/百度/QQ小程序</div>
          </el-form-item>
          <el-form-item label="播放方式">
            <el-radio-group v-model="form.audioPlayMode">
              <el-radio value="click">点击</el-radio>
              <el-radio value="auto">自动</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="播放形式">
            <el-radio-group v-model="form.audioPlayForm">
              <el-radio value="once">单次</el-radio>
              <el-radio value="loop">循环</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 分销设置 ============ -->
      <el-tab-pane label="分销设置" name="dist">
        <el-form :model="form" label-width="140px" class="edit-form">
          <el-form-item label="分销规则">
            <el-radio-group v-model="form.distRule">
              <el-radio value="close">关闭</el-radio>
              <el-radio value="default">默认设置</el-radio>
              <el-radio value="custom">单独配置</el-radio>
            </el-radio-group>
            <div class="form-hint full">默认设置，跟随分销设置，查看平台分销设置</div>
          </el-form-item>
          <el-form-item label="说明">
            <div class="dist-tip">
              <p>分销设置对接应用中心「分销体系」：关闭=不参与分销；默认设置=跟随分销体系全局配置；单独配置=为本文设置独立的分佣比例。</p>
              <p>前往 <el-button link type="primary" @click="$router.push('/apps/dist')">应用中心 → 分销裂变</el-button> 配置分销规则。</p>
            </div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 高级设置 ============ -->
      <el-tab-pane label="高级设置" name="advanced">
        <el-form :model="form" label-width="140px" class="edit-form">
          <el-form-item label="设为推荐">
            <el-switch v-model="form.recommend" :active-value="1" :inactive-value="0" />
            <span class="form-hint">DIY-文章模块中，数据来选可选推荐文章</span>
          </el-form-item>
          <el-form-item label="直接跳转链接">
            <el-input v-model="form.jumpUrl" placeholder="可填网址或本小程序页面地址" style="width: 420px" />
          </el-form-item>
          <el-form-item label="文章评论">
            <el-radio-group v-model="form.commentMode">
              <el-radio value="default">系统默认</el-radio>
              <el-radio value="close">本篇关闭</el-radio>
              <el-radio value="open">本篇启用</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="文章分享">
            <el-radio-group v-model="form.shareMode">
              <el-radio value="default">系统默认</el-radio>
              <el-radio value="close">本篇关闭</el-radio>
              <el-radio value="open">本篇启用</el-radio>
            </el-radio-group>
            <div class="form-hint full">分享后，好友点击你可获得积分</div>
          </el-form-item>
          <el-form-item label="分享样式">
            <el-radio-group v-model="form.shareStyle">
              <el-radio value="popup">弹框展示</el-radio>
              <el-radio value="bottom">底部展示</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="积分数量">
            <el-input-number v-model="form.points" :min="0" controls-position="right" style="width: 160px" />
            <span class="form-hint">积分</span>
          </el-form-item>
          <el-form-item label="积分限制">
            <el-input-number v-model="form.pointsLimit" :min="0" controls-position="right" style="width: 160px" />
            <span class="form-hint">次/每天</span>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 付费设置 ============ -->
      <el-tab-pane label="付费设置" name="pay">
        <el-form :model="form" label-width="140px" class="edit-form">
          <el-form-item label="文章付费">
            <el-input-number v-model="form.payAmount" :min="0" :precision="2" controls-position="right" style="width: 160px" />
            <span class="form-hint">元，0或空为不收费</span>
          </el-form-item>
          <el-form-item label="文章表单">
            <el-select v-model="form.superForm" style="width: 260px" placeholder="不使用表单">
              <el-option label="不使用表单" value="" />
              <el-option label="红包封面（待接入）" value="hongbao" disabled>
                <span>红包封面（待接入）</span>
              </el-option>
            </el-select>
            <div class="form-hint full">超级表单能力待接入：需新建「超级表单」应用后生效</div>
          </el-form-item>
          <el-form-item label="表单展示">
            <el-radio-group v-model="form.formShow">
              <el-radio value="pay">付费展示</el-radio>
              <el-radio value="direct">直接展示</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="文件下载">
            <div class="file-list">
              <div v-for="(f, i) in form.files" :key="i" class="file-item">
                <el-input v-model="f.name" placeholder="文件名" style="width: 180px" />
                <el-input v-model="f.url" placeholder="文件链接" style="width: 240px" />
                <el-button link type="danger" @click="form.files.splice(i, 1)">移除</el-button>
              </div>
              <el-button size="small" @click="form.files.push({ name: '', url: '' })">增加文件</el-button>
            </div>
            <div class="form-hint full">① 配置 downloadFile 合法域名 ② 远程附件域名 ③ iOS 小程序暂不支持打开 ppt</div>
          </el-form-item>
          <el-form-item label="文件展示">
            <el-radio-group v-model="form.fileShow">
              <el-radio value="pay">付费展示</el-radio>
              <el-radio value="direct">直接展示</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <div class="save-bar">
      <el-button @click="router.back()">返回</el-button>
      <el-button type="primary" plain :loading="saving" @click="save(false)">保存</el-button>
      <el-button type="primary" :loading="saving" @click="save(true)">保存并返回列表</el-button>
    </div>

    <MaterialPicker v-model="picker.show" :file-type="picker.type || 'image'" @confirm="onPickImg" />
    <MaterialPicker v-model="videoPicker.show" file-type="video" @confirm="onPickVideo" />
    <el-dialog v-model="relate.show" title="添加关联文章" width="720px" destroy-on-close>
      <el-table :data="relate.list" height="420" @selection-change="(v) => (relate.selected = v)">
        <el-table-column type="selection" width="44" />
        <el-table-column label="ID" width="70" prop="id" />
        <el-table-column label="标题" min-width="240" prop="title" show-overflow-tooltip />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '上架' : '下架' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="relate.show = false">取消</el-button>
        <el-button type="primary" @click="confirmRelate">确定添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Plus, Close } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import RichTextEditor from '../apps/design/RichTextEditor.vue';
import MaterialPicker from '../apps/design/MaterialPicker.vue';

const route = useRoute();
const router = useRouter();
const articleId = computed(() => Number(route.query.id) || 0);
const isEdit = computed(() => articleId.value > 0);

const tab = ref('base');
const cateTree = ref([]);
const saving = ref(false);
const picker = reactive({ show: false, target: '', type: 'image' });
const videoPicker = reactive({ show: false, index: -1 });
const relate = reactive({ show: false, list: [], selected: [] });

const emptyForm = () => ({
  status: 1, sortOrder: 0, cateIds: [], title: '', thumb: '', carousel: [], updateAt: '',
  views: 0, intro: '', detail: '',
  titleShow: 1, timeShow: 1, posterBg: '', shareTitle: '', shareImgMode: 'thumb', shareImg: '',
  visitShow: 1, likeShow: 1, collectShow: 1, relateTitle: '推荐阅读', relateIds: [], relateList: [],
  showContent: 'goods', videos: [], audioTitle: '', audioUrl: '', audioMode: 'normal',
  audioPlayMode: 'click', audioPlayForm: 'once', distRule: 'close', recommend: 0, jumpUrl: '',
  commentMode: 'default', shareMode: 'default', shareStyle: 'popup', points: 0, pointsLimit: 0,
  payAmount: 0, superForm: '', formShow: 'pay', files: [], fileShow: 'pay',
});
const form = reactive(emptyForm());

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

async function loadCates() {
  try {
    const res = await customerApiCall.get('/content/article-cates');
    cateTree.value = (res.tree || []).filter((c) => c.pid === 0).map((c) => ({ ...c, children: c.children || [] }));
  } catch (e) { ElMessage.error(e || '分类加载失败'); }
}

async function loadDetail() {
  try {
    const res = await customerApiCall.get(`/content/articles/${articleId.value}`);
    Object.assign(form, emptyForm(), {
      status: res.status, sortOrder: res.sort_order, cateIds: JSON.parse(res.cate_ids || '[]'),
      title: res.title, thumb: res.thumb, carousel: JSON.parse(res.carousel || '[]'),
      updateAt: res.update_at || '', views: res.views, intro: res.intro, detail: res.detail,
      titleShow: res.title_show, timeShow: res.time_show, posterBg: res.poster_bg,
      shareTitle: res.share_title, shareImgMode: res.share_img_mode, shareImg: res.share_img,
      visitShow: res.visit_show, likeShow: res.like_show, collectShow: res.collect_show,
      relateTitle: res.relate_title, relateIds: JSON.parse(res.relate_ids || '[]'),
      showContent: res.show_content, videos: JSON.parse(res.videos || '[]'),
      audioTitle: res.audio_title, audioUrl: res.audio_url, audioMode: res.audio_mode,
      audioPlayMode: res.audio_play_mode, audioPlayForm: res.audio_play_form,
      distRule: res.dist_rule, recommend: res.recommend, jumpUrl: res.jump_url,
      commentMode: res.comment_mode, shareMode: res.share_mode, shareStyle: res.share_style,
      points: res.points, pointsLimit: res.points_limit, payAmount: res.pay_amount,
      superForm: res.super_form, formShow: res.form_show, files: JSON.parse(res.files || '[]'),
      fileShow: res.file_show,
    });
    // 关联文章回显
    const ids = JSON.parse(res.relate_ids || '[]');
    if (ids.length) {
      const r = await customerApiCall.get('/content/articles', { params: { page: 1, pageSize: 100 } }).catch(() => ({ list: [] }));
      form.relateList = (r.list || []).filter((a) => ids.includes(a.id));
    }
  } catch (e) { ElMessage.error(e || '文章加载失败'); }
}

function openPicker(target) {
  picker.target = target;
  picker.show = true;
}
function onPickImg(url) {
  if (!url) return;
  if (picker.target === 'thumb') form.thumb = url;
  else if (picker.target === 'carousel') form.carousel.push(url);
  else if (picker.target === 'posterBg') form.posterBg = url;
  else if (picker.target === 'shareImg') form.shareImg = url;
}

function openVideoPicker(index) {
  videoPicker.index = index;
  videoPicker.show = true;
}
function onPickVideo(url) {
  if (!url || videoPicker.index < 0) return;
  if (!form.videos[videoPicker.index]) form.videos.push({ url: '', playMode: 'click' });
  form.videos[videoPicker.index].url = url;
  videoPicker.index = -1;
}

async function openRelatePicker() {
  relate.selected = [];
  try {
    const res = await customerApiCall.get('/content/articles', { params: { page: 1, pageSize: 100 } });
    relate.list = (res.list || []).filter((a) => a.id !== articleId.value);
  } catch (e) { ElMessage.error(e || '文章列表加载失败'); }
  relate.show = true;
}
function confirmRelate() {
  for (const a of relate.selected) {
    if (!form.relateList.some((x) => x.id === a.id)) form.relateList.push({ id: a.id, title: a.title });
  }
  relate.show = false;
}

function buildPayload() {
  return {
    ...form,
    relateIds: form.relateList.map((a) => a.id),
    cateIds: form.cateIds,
  };
}

async function save(backToList) {
  if (!form.title.trim()) { ElMessage.warning('请输入文章标题'); tab.value = 'base'; return; }
  if (!form.detail.trim()) { ElMessage.warning('请输入文章详情'); tab.value = 'base'; return; }
  saving.value = true;
  try {
    const payload = buildPayload();
    let id = articleId.value;
    if (id) {
      await customerApiCall.put(`/content/articles/${id}`, payload);
    } else {
      const r = await customerApiCall.post('/content/articles', payload);
      id = r.id;
    }
    ElMessage.success('保存成功');
    if (backToList) router.push('/content?m=article');
    else router.replace({ query: { id } });
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadCates();
  if (isEdit.value) loadDetail();
});
</script>

<style scoped>
.edit-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.edit-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.edit-ops { display: flex; gap: 8px; }
.edit-form { max-width: 860px; padding-top: 8px; }
.form-section {
  font-size: 13px; font-weight: 600; color: #165dff;
  margin: 4px 0 12px; padding: 4px 0; border-bottom: 1px solid #f2f3f5;
}
.form-section:not(:first-child) { margin-top: 16px; }
.form-hint { font-size: 12px; color: #86909c; margin-left: 10px; }
.form-hint.full { display: block; margin-left: 0; margin-top: 4px; width: 100%; }
.img-picker { display: flex; align-items: center; gap: 10px; }
.img-picker.full-row { margin-top: 8px; }
.thumb-box { width: 72px; height: 72px; border-radius: 6px; display: block; border: 1px solid #e5e6eb; }
.thumb-empty { border: 1px dashed #c9cdd4; background: #f7f8fa; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #86909c; }
.picker-ops { display: flex; flex-direction: column; gap: 4px; }
.img-list { display: flex; gap: 8px; flex-wrap: wrap; }
.img-item { position: relative; width: 72px; height: 72px; }
.img-box { width: 72px; height: 72px; border-radius: 6px; display: block; border: 1px solid #e5e6eb; }
.img-del {
  position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%;
  background: #f53f3f; color: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 12px;
}
.img-add {
  width: 72px; height: 72px; border: 1px dashed #c9cdd4; border-radius: 6px; background: #f7f8fa;
  display: flex; align-items: center; justify-content: center; color: #86909c; cursor: pointer;
}
.rich-editor { width: 100%; }
.video-list, .relate-list, .file-list { display: flex; flex-direction: column; gap: 8px; }
.video-item, .file-item { display: flex; gap: 8px; align-items: center; }
.relate-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid #e5e6eb; border-radius: 6px; background: #fafbfc; }
.relate-drag { color: #c9cdd4; cursor: move; }
.relate-name { font-size: 13px; color: #1d2129; flex: 1; }
.dist-tip { font-size: 13px; color: #4e5969; line-height: 1.8; }
.dist-tip p { margin: 0; }
.save-bar {
  display: flex; justify-content: flex-end; gap: 12px;
  background: #fff; border-radius: 8px; padding: 14px 20px; margin-top: 16px;
}
</style>
