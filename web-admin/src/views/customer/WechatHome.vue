<template>
  <div class="wechat-home">
    <el-tabs v-model="activeTab" class="wt-tabs">
      <el-tab-pane label="接入设置" name="connect" />
      <el-tab-pane label="消息服务器" name="msgcfg" />
      <el-tab-pane label="自动回复" name="reply" />
      <el-tab-pane label="素材库" name="material" />
      <el-tab-pane label="粉丝" name="fans" />
      <el-tab-pane label="群发/预览" name="mass" />
      <el-tab-pane label="数据统计" name="stats" />
      <el-tab-pane label="自定义菜单" name="menu" />
    </el-tabs>

    <!-- ============ 接入设置 ============ -->
    <div v-if="activeTab === 'connect'" class="conn-wrap">
      <div v-if="loading" class="tip-loading">加载中…</div>

      <!-- 未绑定：提供两种接入方式 -->
      <template v-else-if="!status.bound">
        <el-alert type="info" :closable="false" show-icon title="微信公众号接入方式（二选一）"
          description="开放平台授权：在平台总后台配置好微信开放平台第三方平台后，一键授权，菜单/消息等接口自动可用；手动对接：填写公众号 AppID 与 AppSecret 直接接入（仅认证服务号可用自定义菜单）。" />

        <el-card class="conn-card" shadow="never">
          <template #header><span class="conn-title">方式一 · 开放平台授权</span></template>
          <p class="conn-desc">需平台总后台已完成「第三方平台配置」。授权后本公众号将与你的租户自动关联。</p>
          <el-button type="primary" :loading="authBusy" @click="goAuth">获取授权链接并授权</el-button>
          <p class="conn-hint">点击后将打开微信授权页，完成授权后点击下方按钮刷新状态。</p>
          <el-button link type="primary" :loading="loading" @click="loadStatus">刷新状态</el-button>
        </el-card>

        <el-card class="conn-card" shadow="never">
          <template #header><span class="conn-title">方式二 · 手动对接</span></template>
          <el-form :model="bindForm" label-width="110px" class="bind-form">
            <el-form-item label="AppID" required>
              <el-input v-model="bindForm.appid" placeholder="公众号 AppID（wx 开头）" />
            </el-form-item>
            <el-form-item label="AppSecret" required>
              <el-input v-model="bindForm.appSecret" type="password" show-password placeholder="公众号 AppSecret" />
            </el-form-item>
            <el-form-item label="账号类型">
              <el-radio-group v-model="bindForm.accountType">
                <el-radio label="service">服务号</el-radio>
                <el-radio label="subscription">订阅号</el-radio>
              </el-radio-group>
              <div class="conn-hint">系统会按接口权限自动校正；订阅号无法使用自定义菜单。</div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="bindBusy" @click="doBind">保存并绑定</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </template>

      <!-- 已绑定：展示状态 + 解绑 -->
      <el-card v-else class="conn-card" shadow="never">
        <template #header><span class="conn-title">已接入公众号</span></template>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="接入方式">
            <el-tag :type="status.bindMode === 'open' ? 'success' : (status.bindMode === 'manual' ? 'warning' : 'info')">
              {{ status.bindMode === 'open' ? '开放平台授权' : (status.bindMode === 'manual' ? '手动对接' : '未接入') }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="AppID">{{ status.appid }}</el-descriptions-item>
          <el-descriptions-item label="账号类型">
            <el-tag v-if="status.accountType === 'service'" type="success">服务号</el-tag>
            <el-tag v-else-if="status.accountType === 'subscription'" type="info">订阅号</el-tag>
            <span v-else>未知</span>
          </el-descriptions-item>
          <el-descriptions-item label="自动回复">
            <span>支持（订阅号 / 服务号均可被动回复）</span>
          </el-descriptions-item>
          <el-descriptions-item label="素材/粉丝/群发/统计">
            <span v-if="status.accountType === 'service'">支持（认证服务号）</span>
            <span v-else class="text-warn">不支持（仅认证服务号可用）</span>
          </el-descriptions-item>
        </el-descriptions>
        <div class="conn-actions">
          <el-button type="primary" @click="activeTab = 'msgcfg'">前往消息服务器配置</el-button>
          <el-button type="primary" plain @click="activeTab = 'reply'">前往自动回复</el-button>
          <el-button type="danger" plain :loading="unbindBusy" @click="doUnbind">解绑公众号</el-button>
        </div>
      </el-card>
    </div>

    <!-- ============ 消息服务器配置 ============ -->
    <GatedTab v-else-if="activeTab === 'msgcfg'" :open="status.bound" title="消息服务器" :reason="lockReason('bind')" @goto="activeTab = 'connect'">
      <el-alert type="info" :closable="false" show-icon title="消息服务器配置"
        description="在公众号后台「设置与开发 → 基本配置 → 服务器配置」填写下方回调 URL 与 Token，并启用。启用后粉丝消息/事件将由本系统接收并按自动回复规则被动应答。" />
      <el-card class="conn-card" shadow="never">
        <template #header><span class="conn-title">服务器配置</span></template>
        <el-form label-width="120px" class="bind-form">
          <el-form-item label="回调 URL">
            <el-input :model-value="callbackUrl" readonly>
              <template #append><el-button link type="primary" @click="copyText(callbackUrl)">复制</el-button></template>
            </el-input>
          </el-form-item>
          <el-form-item label="Token" required>
            <el-input v-model="msgCfg.token" placeholder="与公众号后台填写的 Token 一致" />
          </el-form-item>
          <el-form-item label="EncodingAESKey">
            <el-input v-model="msgCfg.aesKey" placeholder="安全/兼容模式填写（明文模式可留空）" />
          </el-form-item>
          <el-form-item label="启用消息接收">
            <el-switch v-model="msgCfg.urlEnabled" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="msgCfgSaving" @click="saveMsgCfg">保存配置</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </GatedTab>

    <!-- ============ 自动回复 / 关键字规则 ============ -->
    <GatedTab v-else-if="activeTab === 'reply'" :open="status.bound" title="自动回复" :reason="lockReason('bind')" @goto="activeTab = 'connect'">
      <el-alert v-if="!msgEnabled" type="warning" :closable="false"
        title="尚未启用消息服务器，自动回复不会生效。请先在「消息服务器」标签页配置 Token 并启用，再到公众号后台启用服务器配置。" />
      <div class="menu-toolbar">
        <span class="menu-tip">支持关注自动回复、关键字（全匹配/包含）回复、未命中兜底回复；图文用内联标题/图片/链接，无需素材库。</span>
        <el-button type="primary" :loading="replyLoading" @click="loadReplyRules">刷新</el-button>
        <el-button type="success" @click="openReplyDialog()">新增规则</el-button>
      </div>

      <el-table :data="replyRules" border stripe class="reply-table" v-loading="replyLoading">
        <el-table-column label="匹配类型" width="110">
          <template #default="{ row }">
            <el-tag size="small">{{ matchTypeLabel(row.matchType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="keyword" label="关键字" width="140" />
        <el-table-column label="回复类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ replyTypeLabel(row.replyType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="内容预览" min-width="220">
          <template #default="{ row }">
            <span v-if="row.replyType === 'text'">{{ row.content }}</span>
            <span v-else-if="row.replyType === 'transfer'">转客服</span>
            <span v-else-if="row.replyType === 'news'">图文（{{ newsCount(row.mediaJson) }} 条）</span>
            <span v-else>媒体素材</span>
          </template>
        </el-table-column>
        <el-table-column label="优先级" prop="priority" width="80" />
        <el-table-column label="启用" width="80">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" @change="(v) => toggleReply(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button link type="primary" @click="openReplyDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="deleteReply(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-dialog v-model="replyDialogVisible" :title="replyEditingId ? '编辑规则' : '新增规则'" width="620px">
        <el-form label-width="96px">
          <el-form-item label="匹配类型" required>
            <el-select v-model="replyForm.matchType" style="width: 220px">
              <el-option label="关键字·全匹配" value="exact" />
              <el-option label="关键字·包含" value="fuzzy" />
              <el-option label="关注后自动回复" value="subscribe" />
              <el-option label="未命中兜底" value="default" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="['exact','fuzzy'].includes(replyForm.matchType)" label="关键字" required>
            <el-input v-model="replyForm.keyword" placeholder="如：优惠 / 你好" />
          </el-form-item>
          <el-form-item label="回复类型" required>
            <el-select v-model="replyForm.replyType" style="width: 220px">
              <el-option label="文本" value="text" />
              <el-option label="图文" value="news" />
              <el-option label="转客服" value="transfer" />
              <el-option label="图片" value="image" />
              <el-option label="语音" value="voice" />
              <el-option label="视频" value="video" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="replyForm.replyType === 'text'" label="文本内容" required>
            <el-input v-model="replyForm.content" type="textarea" :rows="3" placeholder="回复给粉丝的文本" />
          </el-form-item>
          <template v-else-if="replyForm.replyType === 'news'">
            <div v-for="(a, ai) in replyForm.articles" :key="ai" class="news-edit">
              <div class="news-edit-head">
                <span>图文 {{ ai + 1 }}</span>
                <el-button link type="danger" :disabled="replyForm.articles.length <= 1" @click="replyForm.articles.splice(ai, 1)">删除</el-button>
              </div>
              <el-input v-model="a.title" placeholder="标题" />
              <el-input v-model="a.description" placeholder="描述" />
              <el-input v-model="a.picurl" placeholder="图片 URL（内联，无需素材库）" />
              <el-input v-model="a.url" placeholder="点击跳转链接" />
            </div>
            <el-button size="small" @click="replyForm.articles.push({ title: '', description: '', picurl: '', url: '' })">+ 添加图文</el-button>
          </template>
          <el-form-item v-else-if="['image','voice','video'].includes(replyForm.replyType)" label="media_id" required>
            <el-input v-model="replyForm.mediaId" placeholder="微信素材 media_id" />
          </el-form-item>
          <el-form-item label="优先级">
            <el-input-number v-model="replyForm.priority" :min="0" :max="999" />
            <span class="conn-hint">数值越小越优先</span>
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="replyForm.enabled" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="replyDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="replySaving" @click="saveReply">保存</el-button>
        </template>
      </el-dialog>
    </GatedTab>

    <!-- ============ 素材库 ============ -->
    <GatedTab v-else-if="activeTab === 'material'" :open="status.canMaterial" title="素材库" :reason="lockReason('service')" @goto="activeTab = 'connect'">
      <el-alert type="info" :closable="false" show-icon title="素材管理（认证服务号）"
        description="图片/图文素材来自微信侧，可上传图片、新增图文，或一键从微信拉取已存在素材做本地镜像。群发需选用图文素材。" />
      <el-radio-group v-model="materialType" @change="loadMaterial" class="material-type">
        <el-radio label="image">图片</el-radio>
        <el-radio label="news">图文</el-radio>
      </el-radio-group>
      <div class="menu-toolbar">
        <div class="menu-ops">
          <el-button :loading="materialSyncing" @click="syncMaterial">从微信拉取</el-button>
          <el-button v-if="materialType === 'image'" type="primary" @click="pickImage">上传图片</el-button>
          <el-button v-else type="primary" @click="openNewsDialog">新增图文</el-button>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="onImagePicked" />
        </div>
      </div>

      <el-table v-if="materialType === 'image'" :data="materialItems" border stripe v-loading="materialLoading">
        <el-table-column label="预览" width="90">
          <template #default="{ row }"><img v-if="row.url" :src="row.url" class="mat-thumb" /></template>
        </el-table-column>
        <el-table-column prop="title" label="名称" />
        <el-table-column prop="media_id" label="media_id" min-width="200" />
        <el-table-column label="微信创建时间" width="170">
          <template #default="{ row }">{{ row.wx_created_at ? new Date(row.wx_created_at * 1000).toLocaleString() : '-' }}</template>
        </el-table-column>
      </el-table>

      <el-table v-else :data="materialItems" border stripe v-loading="materialLoading">
        <el-table-column prop="title" label="标题" />
        <el-table-column label="图文内容" min-width="240">
          <template #default="{ row }">
            <div v-for="(a, i) in safeJson(row.news_json)" :key="i" class="news-item">{{ i + 1 }}. {{ a.title }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="media_id" label="media_id" min-width="200" />
      </el-table>

      <el-dialog v-model="newsDialogVisible" title="新增图文素材" width="640px">
        <div v-for="(a, ai) in newsForm" :key="ai" class="news-edit">
          <div class="news-edit-head">
            <span>图文 {{ ai + 1 }}</span>
            <el-button link type="danger" :disabled="newsForm.length <= 1" @click="newsForm.splice(ai, 1)">删除</el-button>
          </div>
          <el-input v-model="a.title" placeholder="标题" />
          <el-input v-model="a.author" placeholder="作者（可选）" />
          <el-input v-model="a.digest" placeholder="摘要（可选）" />
          <el-input v-model="a.content" type="textarea" :rows="3" placeholder="正文（支持 HTML）" />
          <el-input v-model="a.content_source_url" placeholder="原文链接（可选）" />
          <el-select v-model="a.thumb_media_id" placeholder="封面图 media_id（从图片素材选择）" filterable style="width: 100%">
            <el-option v-for="m in imageMaterials" :key="m.media_id" :label="`${m.title || m.media_id}`" :value="m.media_id" />
          </el-select>
        </div>
        <el-button size="small" @click="newsForm.push(emptyNews())">+ 添加图文</el-button>
        <template #footer>
          <el-button @click="newsDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="newsSaving" @click="createNews">创建并保存</el-button>
        </template>
      </el-dialog>
    </GatedTab>

    <!-- ============ 粉丝 ============ -->
    <GatedTab v-else-if="activeTab === 'fans'" :open="status.canFans" title="粉丝" :reason="lockReason('service')" @goto="activeTab = 'connect'">
      <el-alert type="info" :closable="false" show-icon title="粉丝管理（认证服务号）"
        description="粉丝数据非实时，需手动「从微信同步」拉取全量快照。同步量较大时请耐心等待。" />
      <div class="menu-toolbar">
        <span class="menu-tip">共 {{ fansTotal }} 位粉丝</span>
        <el-button type="primary" :loading="fansSyncing" @click="syncFans">从微信同步全量</el-button>
      </div>
      <el-table :data="fansItems" border stripe v-loading="fansLoading">
        <el-table-column label="头像" width="60">
          <template #default="{ row }"><img v-if="row.headimgurl" :src="row.headimgurl" class="fan-avatar" /></template>
        </el-table-column>
        <el-table-column prop="nickname" label="昵称" />
        <el-table-column prop="openid" label="openid" min-width="200" />
        <el-table-column label="性别" width="70">
          <template #default="{ row }">{{ row.sex === 1 ? '男' : row.sex === 2 ? '女' : '未知' }}</template>
        </el-table-column>
        <el-table-column prop="province" label="省份" width="90" />
        <el-table-column prop="city" label="城市" width="90" />
        <el-table-column label="关注" width="80">
          <template #default="{ row }">{{ row.subscribe ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column label="同步时间" width="170">
          <template #default="{ row }">{{ row.synced_at ? new Date(row.synced_at).toLocaleString() : '-' }}</template>
        </el-table-column>
      </el-table>
      <el-pagination class="fan-page" layout="prev,pager,next" :total="fansTotal" :page-size="fansSize" :current-page="fansPage" @current-change="(p) => { fansPage = p; loadFans(); }" />
    </GatedTab>

    <!-- ============ 群发 / 预览 ============ -->
    <GatedTab v-else-if="activeTab === 'mass'" :open="status.canMass" title="群发/预览" :reason="lockReason('service')" @goto="activeTab = 'connect'">
      <el-alert type="info" :closable="false" show-icon title="图文群发（认证服务号）"
        description="群发需选用「图文素材」的 media_id。群发为异步任务，微信处理完成后以模板消息通知粉丝；此处记录发送任务与微信返回 msg_id。" />
      <el-card class="conn-card" shadow="never">
        <template #header><span class="conn-title">发起群发</span></template>
        <el-form label-width="100px" class="bind-form">
          <el-form-item label="图文素材" required>
            <el-select v-model="massForm.articleMediaId" filterable placeholder="选择图文素材" style="width: 360px">
              <el-option v-for="n in newsMaterials" :key="n.media_id" :label="`${n.title}（${n.media_id}）`" :value="n.media_id" />
            </el-select>
          </el-form-item>
          <el-form-item label="发送范围">
            <el-radio-group v-model="massForm.sendType">
              <el-radio label="group">全部粉丝</el-radio>
              <el-radio label="tag">按标签</el-radio>
              <el-radio label="openids">指定 openid</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="massForm.sendType === 'tag'" label="标签 ID">
            <el-input v-model="massForm.tagId" placeholder="微信标签 ID" />
          </el-form-item>
          <el-form-item v-if="massForm.sendType === 'openids'" label="openid 列表">
            <el-input v-model="massForm.openidsText" type="textarea" :rows="4" placeholder="每行一个 openid" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="massSending" @click="sendMass">群发</el-button>
            <el-divider direction="vertical" />
            <el-input v-model="massPreviewOpenid" placeholder="预览微信号 openid" style="width: 280px" />
            <el-button :loading="previewSending" @click="previewMass">预览发送</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <h4 class="mass-h">发送任务记录</h4>
      <el-table :data="massTasks" border stripe v-loading="massLoading">
        <el-table-column label="类型" width="90">
          <template #default="{ row }"><el-tag size="small" :type="row.task_type === 'preview' ? 'warning' : 'success'">{{ row.task_type === 'preview' ? '预览' : '群发' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="范围" width="90">
          <template #default="{ row }">{{ sendTypeLabel(row.send_type) }}</template>
        </el-table-column>
        <el-table-column prop="wx_msg_id" label="微信 msg_id" min-width="160" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><el-tag size="small" type="success">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="发送时间" width="170">
          <template #default="{ row }">{{ row.sent_at ? new Date(row.sent_at).toLocaleString() : '-' }}</template>
        </el-table-column>
      </el-table>
    </GatedTab>

    <!-- ============ 数据统计 ============ -->
    <GatedTab v-else-if="activeTab === 'stats'" :open="status.canStats" title="数据统计" :reason="lockReason('service')" @goto="activeTab = 'connect'">
      <el-alert type="info" :closable="false" show-icon title="基础数据统计（认证服务号 + 接口分析权限）"
        description="数据来自微信数据统计接口。若返回权限错误（如 48006），需公众号具备「接口分析权限」。" />
      <div class="menu-toolbar">
        <el-date-picker v-model="statsRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" :disabled-date="disableFuture" />
        <el-button type="primary" :loading="statsLoading" @click="loadStats">查询</el-button>
      </div>
      <el-tabs v-model="statsTab" class="stats-sub">
        <el-tab-pane label="用户分析" name="users" />
        <el-tab-pane label="图文分析" name="articles" />
      </el-tabs>
      <template v-if="statsTab === 'users'">
        <h4 class="mass-h">用户增减（按日）</h4>
        <el-table :data="userSummary" border stripe v-loading="statsLoading">
          <el-table-column prop="ref_date" label="日期" width="120" />
          <el-table-column prop="user_source" label="来源" width="90" />
          <el-table-column prop="new_user" label="新增" width="90" />
          <el-table-column prop="cancel_user" label="取关" width="90" />
          <el-table-column prop="cumulate_user" label="累计" />
        </el-table>
        <h4 class="mass-h">用户累计总量（按日）</h4>
        <el-table :data="userCumulate" border stripe>
          <el-table-column prop="ref_date" label="日期" width="120" />
          <el-table-column prop="cumulate_user" label="累计粉丝数" />
        </el-table>
      </template>
      <template v-else>
        <h4 class="mass-h">图文统计数据</h4>
        <el-table :data="articleStats" border stripe v-loading="statsLoading">
          <el-table-column prop="ref_date" label="日期" width="120" />
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="int_page_read_user" label="图文阅读人数" width="120" />
          <el-table-column prop="int_page_read_count" label="图文阅读次数" width="120" />
          <el-table-column prop="share_user" label="分享人数" width="100" />
          <el-table-column prop="add_to_fav_user" label="收藏人数" width="100" />
        </el-table>
      </template>
    </GatedTab>

    <!-- ============ 自定义菜单 ============ -->
    <GatedTab v-else-if="activeTab === 'menu'" :open="status.canMenu" title="自定义菜单" :reason="lockReason('service')" @goto="activeTab = 'connect'">
      <div class="menu-head">
        <h3 class="menu-page-title">自定义菜单</h3>
        <el-link type="primary" href="https://mp.weixin.qq.com" target="_blank" :underline="false">菜单管理 ›</el-link>
      </div>
      <el-alert v-if="liveMenu" type="info" :closable="false" show-icon class="menu-alert">
        <template #title>线上已存在菜单</template>
        <template #default>检测到微信侧已有菜单{{ status.syncedAt ? `（最近发布：${fmtTime(status.syncedAt)}）` : '' }}。「保存并发布」将覆盖现有菜单。</template>
      </el-alert>

      <div class="menu-builder">
        <!-- 左：手机预览 -->
        <div class="phone">
          <div class="phone-status"><span>1:21</span><span class="phone-icons">●●● ▪</span></div>
          <div class="phone-bar"><span>‹</span><span>👤</span></div>
          <div class="phone-body">
            <div v-if="selectedTop != null && buttons[selectedTop] && buttons[selectedTop].hasSub" class="sub-pop">
              <div v-for="(s, i) in buttons[selectedTop].sub" :key="i" class="sub-pop-item" :class="{ active: selectedSub === i }" @click="selectedSub = i">{{ s.name || '子菜单' + (i + 1) }}</div>
              <div v-if="buttons[selectedTop].sub.length < 5" class="sub-pop-add" @click="addSubMenu(buttons[selectedTop])">+ 添加</div>
            </div>
          </div>
          <div class="phone-foot">
            <div v-if="buttons.length < 3" class="foot-add" @click="addTopMenu">+ 添加</div>
            <div class="foot-tabs">
              <div v-for="(b, i) in buttons" :key="i" class="foot-tab" :class="{ active: selectedTop === i && selectedSub == null }" @click="selectTop(i)">{{ b.name || '菜单' + (i + 1) }}</div>
            </div>
          </div>
          <div v-if="selectedTop != null" class="float-pill">
            <span v-if="selectedSub != null" class="pill-back" @click="selectedSub = null">‹</span>
            <span class="pill-del" @click="delSelected">🗑</span>
          </div>
        </div>

        <!-- 右：菜单信息 -->
        <div class="menu-info">
          <template v-if="currentMenu">
            <h4 class="mi-title">菜单信息</h4>
            <el-form label-width="84px">
              <el-form-item label="名称">
                <el-input v-model="currentMenu.name" maxlength="8" show-word-limit placeholder="菜单名称" />
                <div class="menu-tip">仅支持中英文和数字，字数不超过 4 个汉字或 8 个字母。</div>
              </el-form-item>
              <el-form-item label="消息类型">
                <el-radio-group v-model="currentMenu.type">
                  <el-radio label="click" :disabled="isParent">发送消息</el-radio>
                  <el-radio label="view" :disabled="isParent">跳转网页</el-radio>
                  <el-radio label="miniprogram" :disabled="isParent">跳转小程序</el-radio>
                  <el-radio label="shop" disabled>跳转小店</el-radio>
                  <el-radio label="goods" disabled>跳转商品</el-radio>
                  <el-radio label="home" disabled>跳转账号主页</el-radio>
                </el-radio-group>
              </el-form-item>

              <template v-if="!isParent">
                <el-form-item v-if="currentMenu.type === 'view'" label="链接">
                  <el-input v-model="currentMenu.url" placeholder="https://..." />
                </el-form-item>
                <el-form-item v-else-if="currentMenu.type === 'click'" label="事件 Key">
                  <el-input v-model="currentMenu.key" placeholder="如 NEWS_LATEST" />
                  <div class="menu-tip">发送消息：粉丝点击后触发「自动回复」中对应 Key 的事件回复。富媒体内容请在「自动回复」配置。</div>
                </el-form-item>
                <el-form-item v-else-if="currentMenu.type === 'miniprogram'" label="AppID">
                  <el-input v-model="currentMenu.appid" placeholder="小程序 AppID" />
                </el-form-item>
                <el-form-item v-else-if="currentMenu.type === 'miniprogram'" label="页面路径">
                  <el-input v-model="currentMenu.pagepath" placeholder="pages/index/index" />
                </el-form-item>
                <el-form-item v-else-if="currentMenu.type === 'miniprogram'" label="备用网页">
                  <el-input v-model="currentMenu.url" placeholder="https://...（旧版微信兜底）" />
                </el-form-item>
              </template>

              <el-form-item v-if="isTopSelected">
                <el-checkbox v-model="currentMenu.hasSub" @change="(v) => toggleParent(currentMenu, v)">设为含子菜单</el-checkbox>
              </el-form-item>

              <el-form-item>
                <el-link type="danger" :underline="false" @click="delSelected">删除菜单</el-link>
              </el-form-item>
            </el-form>
          </template>
          <div v-else class="menu-empty">从左侧手机预览点击菜单进行编辑，或点「+ 添加」新建</div>
        </div>
      </div>

      <div class="menu-foot-actions">
        <el-button :loading="menuLoading" @click="loadMenu">拉取菜单</el-button>
        <el-button @click="previewMenu">预览</el-button>
        <el-button type="primary" :loading="saveBusy || pushBusy" @click="saveAndPush">保存并发布</el-button>
      </div>

      <el-dialog v-model="previewVisible" title="菜单预览（当前草稿）" width="520px">
        <pre class="preview-json">{{ JSON.stringify(serialize(), null, 2) }}</pre>
      </el-dialog>
    </GatedTab>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  mpStatus, mpBind, mpUnbind, mpAuthUrl, mpGetMenu, mpSaveMenu, mpPushMenu,
  mpGetMessageConfig, mpSaveMessageConfig,
  mpGetReplyRules, mpCreateReplyRule, mpUpdateReplyRule, mpDeleteReplyRule,
  mpGetMaterial, mpSyncMaterial, mpUploadImage, mpCreateNews,
  mpGetFans, mpSyncFans,
  mpMassSend, mpMassPreview, mpGetMassTasks,
  mpStatsUsers, mpStatsArticles,
} from '../../api/index.js';
import GatedTab from './GatedTab.vue';

const activeTab = ref('connect');
const loading = ref(false);
const status = reactive({
  bound: false, canMenu: false, canReply: false, canMaterial: false, canFans: false, canMass: false, canStats: false,
  accountType: '', bindMode: 'none', appid: '', authStatus: '', menuSaved: false, syncedAt: null,
});
const msgEnabled = computed(() => !!msgCfg.urlEnabled);

const bindForm = reactive({ appid: '', appSecret: '', accountType: 'service' });
const bindBusy = ref(false);
const authBusy = ref(false);
const unbindBusy = ref(false);

// 菜单编辑器状态
const buttons = ref([]);
const menuLoading = ref(false);
const saveBusy = ref(false);
const pushBusy = ref(false);
const liveMenu = ref(null);

// 消息服务器配置
const msgCfg = reactive({ token: '', aesKey: '', urlEnabled: false });
const callbackUrl = ref('');
const msgCfgSaving = ref(false);

// 自动回复
const replyRules = ref([]);
const replyLoading = ref(false);
const replyDialogVisible = ref(false);
const replyEditingId = ref(null);
const replySaving = ref(false);
const replyForm = reactive({ matchType: 'exact', keyword: '', replyType: 'text', content: '', mediaId: '', articles: [], priority: 0, enabled: true });

// 素材
const materialType = ref('image');
const materialItems = ref([]);
const materialLoading = ref(false);
const materialSyncing = ref(false);
const newsDialogVisible = ref(false);
const newsForm = ref([emptyNews()]);
const newsSaving = ref(false);
const fileInput = ref(null);
const imageMaterials = computed(() => materialType.value === 'image' ? materialItems.value : []);
const newsMaterials = ref([]);

// 粉丝
const fansItems = ref([]);
const fansTotal = ref(0);
const fansPage = ref(1);
const fansSize = ref(20);
const fansLoading = ref(false);
const fansSyncing = ref(false);

// 群发
const massForm = reactive({ articleMediaId: '', sendType: 'group', tagId: '', openidsText: '' });
const massPreviewOpenid = ref('');
const massTasks = ref([]);
const massLoading = ref(false);
const massSending = ref(false);
const previewSending = ref(false);

// 统计
const statsTab = ref('users');
const statsRange = ref([]);
const statsLoading = ref(false);
const userSummary = ref([]);
const userCumulate = ref([]);
const articleStats = ref([]);

function emptyLeaf() {
  return { name: '', type: 'view', key: '', url: '', appid: '', pagepath: '', sub: [] };
}
function emptyNews() {
  return { title: '', author: '', digest: '', content: '', content_source_url: '', thumb_media_id: '' };
}
function safeJson(s) {
  try { return JSON.parse(s || '[]'); } catch { return []; }
}
function matchTypeLabel(t) {
  return { exact: '全匹配', fuzzy: '包含', subscribe: '关注', default: '兜底' }[t] || t;
}
function replyTypeLabel(t) {
  return { text: '文本', news: '图文', transfer: '转客服', image: '图片', voice: '语音', video: '视频' }[t] || t;
}
function sendTypeLabel(t) {
  return { group: '全部', tag: '按标签', openids: '指定' }[t] || t;
}
function newsCount(s) { return safeJson(s).length; }
function disableFuture(d) { return d && d > new Date(); }
function copyText(t) {
  if (!t) return;
  navigator.clipboard?.writeText(t).then(() => ElMessage.success('已复制')).catch(() => {});
}
// 锁定态原因文案：kind='bind' 用于消息服务器/自动回复（需先绑定）；'service' 用于素材/粉丝/群发/统计（需认证服务号）
function lockReason(kind) {
  if (kind === 'bind') {
    return '请先在「接入设置」完成公众号绑定后，再使用此功能。';
  }
  if (!status.bound) return '请先在「接入设置」完成公众号绑定。';
  const label = status.accountType === 'subscription' ? '订阅号' : (status.accountType === 'service' ? '服务号' : '未知类型');
  return `此功能仅认证服务号可用。当前账号类型：${label}。完成微信认证后自动开启。`;
}

async function loadStatus() {
  loading.value = true;
  try {
    const r = await mpStatus();
    Object.assign(status, r);
  } catch (e) {
    ElMessage.error(e || '状态获取失败');
  } finally {
    loading.value = false;
  }
}

async function doBind() {
  if (!bindForm.appid || !bindForm.appSecret) return ElMessage.warning('请填写 AppID 与 AppSecret');
  bindBusy.value = true;
  try {
    const r = await mpBind({ ...bindForm });
    ElMessage.success(`绑定成功（${r.accountType === 'subscription' ? '订阅号' : '服务号'}）`);
    bindForm.appSecret = '';
    await loadStatus();
  } catch (e) {
    ElMessage.error(e || '绑定失败');
  } finally {
    bindBusy.value = false;
  }
}

async function goAuth() {
  authBusy.value = true;
  try {
    const r = await mpAuthUrl();
    window.open(r.authUrl, '_blank');
    ElMessage.info('已打开微信授权页，完成授权后点击「刷新状态」');
  } catch (e) {
    ElMessage.error(e || '获取授权链接失败');
  } finally {
    authBusy.value = false;
  }
}

async function doUnbind() {
  try {
    await ElMessageBox.confirm('解绑后将清除公众号配置与本地菜单草稿，确认？', '解绑公众号', { type: 'warning' });
  } catch { return; }
  unbindBusy.value = true;
  try {
    await mpUnbind();
    ElMessage.success('已解绑');
    buttons.value = [emptyLeaf()];
    liveMenu.value = null;
    await loadStatus();
  } catch (e) {
    ElMessage.error(e || '解绑失败');
  } finally {
    unbindBusy.value = false;
  }
}

// —— 菜单序列化 / 反序列化 ——
function serializeLeaf(x) {
  const o = { name: x.name, type: x.type };
  if (x.type === 'view') o.url = x.url;
  else if (x.type === 'click') o.key = x.key;
  else if (x.type === 'miniprogram') { o.appid = x.appid; o.url = x.url; o.pagepath = x.pagepath; }
  return o;
}
function deserLeaf(x) {
  return {
    name: x.name || '', type: x.type || 'view', key: x.key || '', url: x.url || '',
    appid: x.appid || '', pagepath: x.pagepath || '', sub: [],
  };
}
function serialize() {
  return {
    button: buttons.value.map((b) => {
      if (b.hasSub && b.sub.length) {
        return { name: b.name, sub_button: b.sub.map(serializeLeaf) };
      }
      return serializeLeaf(b);
    }),
  };
}
function deserialize(saved) {
  if (!saved || !Array.isArray(saved.button)) return [emptyLeaf()];
  return saved.button.map((b) => {
    if (b.sub_button && b.sub_button.length) {
      return { name: b.name || '', type: 'view', key: '', url: '', appid: '', pagepath: '', hasSub: true, sub: b.sub_button.map(deserLeaf) };
    }
    const leaf = deserLeaf(b);
    leaf.hasSub = false;
    return leaf;
  });
}

function addTop() { if (buttons.value.length < 3) buttons.value.push(emptyLeaf()); }
function removeTop(i) { buttons.value.splice(i, 1); }
function addSub(b) { if (b.sub.length < 5) b.sub.push(emptyLeaf()); }
function onToggleSub(b) {
  if (b.hasSub && b.sub.length === 0) b.sub.push(emptyLeaf());
}

async function loadMenu() {
  menuLoading.value = true;
  try {
    const r = await mpGetMenu();
      if (r.saved) buttons.value = deserialize(r.saved);
      selectedTop.value = buttons.value.length ? 0 : null;
      selectedSub.value = null;
      liveMenu.value = r.live && !r.live.error ? r.live : null;
    if (r.syncedAt) status.syncedAt = r.syncedAt;
    ElMessage.success('已拉取菜单数据');
  } catch (e) {
    ElMessage.error(e || '拉取失败');
  } finally {
    menuLoading.value = false;
  }
}

function validate() {
  for (const b of buttons.value) {
    if (!b.name) return '一级菜单名称不能为空';
    if (!b.hasSub) {
      if (!b.type) return `菜单「${b.name}」未选择动作类型`;
      if (b.type === 'view' && !b.url) return `菜单「${b.name}」缺少跳转链接`;
      if (b.type === 'click' && !b.key) return `菜单「${b.name}」缺少事件 Key`;
      if (b.type === 'miniprogram' && (!b.appid || !b.pagepath)) return `菜单「${b.name}」缺少小程序参数`;
    } else {
      if (!b.sub.length) return `菜单「${b.name}」的子菜单为空`;
      for (const s of b.sub) {
        if (!s.name) return '子菜单名称不能为空';
        if (!s.type) return `子菜单「${s.name}」未选择动作类型`;
        if (s.type === 'view' && !s.url) return `子菜单「${s.name}」缺少跳转链接`;
        if (s.type === 'click' && !s.key) return `子菜单「${s.name}」缺少事件 Key`;
        if (s.type === 'miniprogram' && (!s.appid || !s.pagepath)) return `子菜单「${s.name}」缺少小程序参数`;
      }
    }
  }
  return null;
}

async function saveDraft() {
  const err = validate();
  if (err) return ElMessage.warning(err);
  saveBusy.value = true;
  try {
    await mpSaveMenu(serialize());
    ElMessage.success('草稿已保存');
    await loadStatus();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saveBusy.value = false;
  }
}

async function pushMenu() {
  const err = validate();
  if (err) return ElMessage.warning(err);
  pushBusy.value = true;
  try {
    const r = await mpPushMenu();
    status.syncedAt = r.syncedAt;
    ElMessage.success('已发布到微信');
    await loadMenu();
  } catch (e) {
    ElMessage.error(e || '发布失败');
  } finally {
      pushBusy.value = false;
    }
  }

  // 菜单选中态与发布
  const selectedTop = ref(null);
  const selectedSub = ref(null);
  const previewVisible = ref(false);
  const currentMenu = computed(() => {
    if (selectedTop.value == null) return null;
    const top = buttons.value[selectedTop.value];
    if (!top) return null;
    if (selectedSub.value != null) return top.sub[selectedSub.value] || null;
    return top;
  });
  const isParent = computed(() => !!currentMenu.value && !!currentMenu.value.hasSub);
  const isTopSelected = computed(() => selectedTop.value != null && selectedSub.value == null);
  function selectTop(i) { selectedTop.value = i; selectedSub.value = null; }
  function addTopMenu() {
    if (buttons.value.length >= 3) return ElMessage.warning('最多 3 个一级菜单');
    addTop();
    selectedTop.value = buttons.value.length - 1;
    selectedSub.value = null;
  }
  function addSubMenu(b) {
    if (b.sub.length >= 5) return ElMessage.warning('最多 5 个子菜单');
    addSub(b);
    selectedSub.value = b.sub.length - 1;
  }
  function delSelected() {
    if (selectedTop.value == null) return;
    if (selectedSub.value != null) {
      buttons.value[selectedTop.value].sub.splice(selectedSub.value, 1);
      selectedSub.value = null;
    } else {
      buttons.value.splice(selectedTop.value, 1);
      selectedSub.value = null;
      if (selectedTop.value >= buttons.value.length) selectedTop.value = buttons.value.length - 1;
    }
  }
  function toggleParent(b, val) {
    b.hasSub = !!val;
    if (b.hasSub && b.sub.length === 0) b.sub.push(emptyLeaf());
    if (!b.hasSub) { b.sub = []; selectedSub.value = null; }
  }
  function fmtTime(s) {
    if (!s) return '';
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString();
  }
  function previewMenu() { previewVisible.value = true; }
  async function saveAndPush() {
    const err = validate();
    if (err) return ElMessage.warning(err);
    saveBusy.value = true; pushBusy.value = true;
    try {
      await mpSaveMenu(serialize());
      const r = await mpPushMenu();
      status.syncedAt = r.syncedAt;
      ElMessage.success('已保存并发布到微信');
      await loadMenu();
    } catch (e) {
      ElMessage.error((e && e.error) || e || '保存并发布失败');
    } finally {
      saveBusy.value = false; pushBusy.value = false;
    }
  }
  watch(activeTab, (t) => {
    if (t === 'menu' && status.canMenu && !buttons.value.length && !menuLoading.value) loadMenu();
  });

  // —— 消息服务器配置 ——
async function loadMsgCfg() {
  if (!status.bound) return;
  try {
    const r = await mpGetMessageConfig();
    msgCfg.token = r.config.msgToken || '';
    msgCfg.aesKey = r.config.encodingAESKey || '';
    msgCfg.urlEnabled = !!r.config.urlEnabled;
    callbackUrl.value = r.callbackUrl || '';
  } catch (e) {
    ElMessage.error(e || '读取消息配置失败');
  }
}
async function saveMsgCfg() {
  if (!msgCfg.token) return ElMessage.warning('请填写 Token');
  msgCfgSaving.value = true;
  try {
    const r = await mpSaveMessageConfig({ msgToken: msgCfg.token, encodingAESKey: msgCfg.aesKey, urlEnabled: msgCfg.urlEnabled });
    callbackUrl.value = r.callbackUrl || callbackUrl.value;
    ElMessage.success('已保存');
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    msgCfgSaving.value = false;
  }
}

// —— 自动回复 ——
async function loadReplyRules() {
  replyLoading.value = true;
  try {
    const r = await mpGetReplyRules();
    replyRules.value = r.rules || [];
  } catch (e) {
    ElMessage.error(e || '读取规则失败');
  } finally {
    replyLoading.value = false;
  }
}
function openReplyDialog(row) {
  if (row) {
    replyEditingId.value = row.id;
    replyForm.matchType = row.matchType;
    replyForm.keyword = row.keyword || '';
    replyForm.replyType = row.replyType;
    replyForm.content = row.content || '';
    replyForm.mediaId = '';
    replyForm.articles = row.replyType === 'news' ? safeJson(row.mediaJson) : [];
    if (['image', 'voice', 'video'].includes(row.replyType)) {
      const m = safeJson(row.mediaJson);
      replyForm.mediaId = m.media_id || '';
    }
    replyForm.priority = row.priority;
    replyForm.enabled = row.enabled;
  } else {
    replyEditingId.value = null;
    Object.assign(replyForm, { matchType: 'exact', keyword: '', replyType: 'text', content: '', mediaId: '', articles: [], priority: 0, enabled: true });
  }
  replyDialogVisible.value = true;
}
function buildMediaJson() {
  if (replyForm.replyType === 'news') return JSON.stringify(replyForm.articles.map((a) => ({ title: a.title, description: a.description, picurl: a.picurl, url: a.url })));
  if (['image', 'voice', 'video'].includes(replyForm.replyType)) return JSON.stringify({ media_id: replyForm.mediaId });
  return '[]';
}
async function saveReply() {
  if (['exact', 'fuzzy'].includes(replyForm.matchType) && !replyForm.keyword) return ElMessage.warning('请填写关键字');
  if (replyForm.replyType === 'text' && !replyForm.content) return ElMessage.warning('请填写文本内容');
  if (replyForm.replyType === 'news' && !replyForm.articles.length) return ElMessage.warning('请至少添加一条图文');
  if (['image', 'voice', 'video'].includes(replyForm.replyType) && !replyForm.mediaId) return ElMessage.warning('请填写 media_id');
  replySaving.value = true;
  const payload = {
    matchType: replyForm.matchType,
    keyword: replyForm.keyword,
    replyType: replyForm.replyType,
    content: replyForm.content,
    mediaJson: buildMediaJson(),
    priority: replyForm.priority,
    enabled: replyForm.enabled,
  };
  try {
    if (replyEditingId.value) {
      await mpUpdateReplyRule(replyEditingId.value, payload);
    } else {
      await mpCreateReplyRule(payload);
    }
    ElMessage.success('已保存');
    replyDialogVisible.value = false;
    await loadReplyRules();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    replySaving.value = false;
  }
}
async function toggleReply(row, v) {
  try {
    await mpUpdateReplyRule(row.id, { enabled: v });
    row.enabled = v;
  } catch (e) {
    ElMessage.error(e || '更新失败');
  }
}
async function deleteReply(row) {
  try {
    await ElMessageBox.confirm('确认删除该规则？', '删除规则', { type: 'warning' });
  } catch { return; }
  try {
    await mpDeleteReplyRule(row.id);
    ElMessage.success('已删除');
    await loadReplyRules();
  } catch (e) {
    ElMessage.error(e || '删除失败');
  }
}

// —— 素材 ——
async function loadMaterial() {
  materialLoading.value = true;
  try {
    const r = await mpGetMaterial(materialType.value);
    materialItems.value = r.items || [];
  } catch (e) {
    ElMessage.error(e?.error || e || '读取素材失败');
  } finally {
    materialLoading.value = false;
  }
}
async function syncMaterial() {
  materialSyncing.value = true;
  try {
    const r = await mpSyncMaterial(materialType.value, 50);
    ElMessage.success(`已同步 ${r.upserted} 条（微信共 ${r.total} 条）`);
    await loadMaterial();
  } catch (e) {
    ElMessage.error(e?.error || e || '同步失败');
  } finally {
    materialSyncing.value = false;
  }
}
function pickImage() { fileInput.value?.click(); }
async function onImagePicked(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const r = await mpUploadImage(file);
    ElMessage.success('上传成功');
    await loadMaterial();
  } catch (err) {
    ElMessage.error(err?.error || err || '上传失败');
  }
}
function openNewsDialog() { newsForm.value = [emptyNews()]; newsDialogVisible.value = true; }
async function createNews() {
  for (const a of newsForm.value) {
    if (!a.title || !a.thumb_media_id) return ElMessage.warning('每条图文需有标题与封面图 media_id');
  }
  newsSaving.value = true;
  const articles = newsForm.value.map((a) => ({
    title: a.title,
    thumb_media_id: a.thumb_media_id,
    author: a.author || '',
    digest: a.digest || '',
    show_cover_pic: 1,
    content: a.content || '',
    content_source_url: a.content_source_url || '',
  }));
  try {
    await mpCreateNews(articles);
    ElMessage.success('图文素材已创建');
    newsDialogVisible.value = false;
    await loadMaterial();
  } catch (e) {
    ElMessage.error(e?.error || e || '创建失败');
  } finally {
    newsSaving.value = false;
  }
}

// —— 粉丝 ——
async function loadFans() {
  fansLoading.value = true;
  try {
    const r = await mpGetFans(fansPage.value, fansSize.value);
    fansItems.value = r.items || [];
    fansTotal.value = r.total || 0;
  } catch (e) {
    ElMessage.error(e?.error || e || '读取粉丝失败');
  } finally {
    fansLoading.value = false;
  }
}
async function syncFans() {
  fansSyncing.value = true;
  try {
    const r = await mpSyncFans();
    ElMessage.success(`已同步 ${r.upserted} 位（微信共 ${r.total} 位）`);
    await loadFans();
  } catch (e) {
    ElMessage.error(e?.error || e || '同步失败');
  } finally {
    fansSyncing.value = false;
  }
}

// —— 群发 ——
async function loadNewsMaterials() {
  try {
    const r = await mpGetMaterial('news');
    newsMaterials.value = r.items || [];
  } catch { /* 忽略 */ }
}
async function loadMassTasks() {
  massLoading.value = true;
  try {
    const r = await mpGetMassTasks();
    massTasks.value = r.items || [];
  } catch (e) {
    ElMessage.error(e?.error || e || '读取任务失败');
  } finally {
    massLoading.value = false;
  }
}
async function sendMass() {
  if (!massForm.articleMediaId) return ElMessage.warning('请选择图文素材');
  const payload = { articleMediaId: massForm.articleMediaId, sendType: massForm.sendType };
  if (massForm.sendType === 'openids') {
    payload.openids = massForm.openidsText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!payload.openids.length) return ElMessage.warning('请填写 openid');
  }
  if (massForm.sendType === 'tag') {
    if (!massForm.tagId) return ElMessage.warning('请填写标签 ID');
    payload.tagId = massForm.tagId;
  }
  massSending.value = true;
  try {
    await mpMassSend(payload);
    ElMessage.success('群发已提交');
    await loadMassTasks();
  } catch (e) {
    ElMessage.error(e?.error || e || '群发失败');
  } finally {
    massSending.value = false;
  }
}
async function previewMass() {
  if (!massForm.articleMediaId) return ElMessage.warning('请选择图文素材');
  if (!massPreviewOpenid.value) return ElMessage.warning('请填写预览微信号 openid');
  previewSending.value = true;
  try {
    await mpMassPreview({ articleMediaId: massForm.articleMediaId, openid: massPreviewOpenid.value });
    ElMessage.success('预览已发送');
    await loadMassTasks();
  } catch (e) {
    ElMessage.error(e?.error || e || '预览失败');
  } finally {
    previewSending.value = false;
  }
}

// —— 统计 ——
function defaultRange() {
  const end = new Date();
  const begin = new Date(Date.now() - 7 * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return [fmt(begin), fmt(end)];
}
async function loadStats() {
  const [begin, end] = statsRange.value && statsRange.value.length === 2 ? statsRange.value : defaultRange();
  statsLoading.value = true;
  try {
    if (statsTab.value === 'users') {
      const r = await mpStatsUsers(begin, end);
      userSummary.value = r.summary || [];
      userCumulate.value = r.cumulate || [];
    } else {
      const r = await mpStatsArticles(begin, end);
      articleStats.value = r.articles || [];
    }
  } catch (e) {
    ElMessage.error(e?.error || e || '查询失败');
  } finally {
    statsLoading.value = false;
  }
}

onMounted(async () => {
  await loadStatus();
  if (status.bound) {
    await loadMsgCfg();
    await loadReplyRules();
    if (status.canMaterial) { await loadMaterial(); await loadNewsMaterials(); }
    if (status.canFans) await loadFans();
    if (status.canMass) { await loadNewsMaterials(); await loadMassTasks(); }
  }
});
</script>

<style scoped>
.wechat-home { padding: 4px; }
.conn-wrap { max-width: 960px; }
.conn-card { margin-top: 16px; }
.conn-title { font-weight: 600; }
.conn-desc { color: #4e5969; margin: 0 0 12px; font-size: 13px; }
.conn-hint { color: #86909c; font-size: 12px; margin: 8px 0 0; }
.bind-form { margin-top: 8px; max-width: 520px; }
.conn-actions { margin-top: 16px; display: flex; gap: 12px; flex-wrap: wrap; }
.tip-loading { color: #86909c; padding: 40px 0; text-align: center; }
.text-warn { color: #e37318; }

.menu-wrap { max-width: 880px; }
.menu-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
.menu-tip { color: #86909c; font-size: 12px; }
.menu-ops { display: flex; gap: 8px; }
.synced-tip { color: #00b42a; font-size: 12px; margin-bottom: 8px; }
.menu-editor { border: 1px solid #e5e6eb; border-radius: 8px; padding: 16px; background: #fafbfc; }
.menu-top { border: 1px solid #e5e6eb; border-radius: 8px; padding: 12px; margin-bottom: 12px; background: #fff; }
.menu-top-head { display: flex; align-items: center; gap: 12px; }
.menu-name { width: 180px; }
.leaf-fields { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.leaf-type { width: 220px; }
.sub-list { margin-top: 10px; padding-left: 16px; border-left: 2px solid #e5e6eb; }
.menu-sub { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
.add-top { margin-top: 4px; }
.live-box { margin-top: 16px; }
.live-json { background: #1d2129; color: #e5e6eb; padding: 12px; border-radius: 6px; font-size: 12px; overflow: auto; max-height: 320px; }

.reply-table { margin-top: 8px; }
.news-edit { border: 1px dashed #e5e6eb; border-radius: 6px; padding: 10px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px; }
.news-edit-head { display: flex; justify-content: space-between; font-size: 13px; color: #4e5969; }
.mat-thumb, .fan-avatar { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; }
.news-item { font-size: 12px; color: #4e5969; }
.material-type { margin: 8px 0 4px; }
.fan-page { margin-top: 12px; justify-content: flex-end; }
.mass-h { margin: 18px 0 8px; font-size: 14px; color: #1d2129; }
.stats-sub { margin-top: 8px; }

.menu-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.menu-page-title { font-size: 16px; margin: 0; color: #1d2129; }
.menu-alert { margin-bottom: 16px; }
.menu-builder { display: flex; gap: 28px; align-items: flex-start; flex-wrap: wrap; }
.phone { width: 300px; flex: 0 0 300px; border: 10px solid #1d2129; border-radius: 28px; background: #f2f3f5; overflow: hidden; position: relative; }
.phone-status { display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; font-size: 12px; color: #1d2129; background: #e5e6eb; }
.phone-icons { letter-spacing: 1px; }
.phone-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; color: #4e5969; }
.phone-body { min-height: 320px; position: relative; padding: 12px; }
.sub-pop { position: absolute; left: 12px; right: 12px; bottom: 64px; background: #4e5969; border-radius: 6px; padding: 4px; }
.sub-pop-item { color: #fff; text-align: center; padding: 8px 6px; font-size: 13px; border-radius: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub-pop-item.active { background: #00b42a; }
.sub-pop-add { color: #c9cdd4; text-align: center; padding: 8px; font-size: 13px; cursor: pointer; }
.phone-foot { display: flex; align-items: stretch; border-top: 1px solid #e5e6eb; background: #f7f8fa; }
.foot-add { flex: 0 0 64px; display: flex; align-items: center; justify-content: center; border-right: 1px solid #e5e6eb; color: #4e5969; cursor: pointer; font-size: 13px; }
.foot-tabs { flex: 1; display: flex; }
.foot-tab { flex: 1; display: flex; align-items: center; justify-content: center; padding: 12px 4px; font-size: 13px; color: #4e5969; cursor: pointer; border-left: 1px solid #e5e6eb; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.foot-tab:first-child { border-left: none; }
.foot-tab.active { color: #00b42a; background: #e8f7ec; }
.float-pill { position: absolute; bottom: 80px; right: 18px; display: flex; gap: 8px; background: rgba(0,0,0,.55); border-radius: 16px; padding: 6px 10px; }
.pill-back, .pill-del { color: #fff; cursor: pointer; font-size: 14px; }
.menu-info { flex: 1; min-width: 320px; }
.mi-title { font-size: 15px; font-weight: 600; margin: 0 0 12px; color: #1d2129; }
.menu-foot-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
.menu-tip { color: #86909c; font-size: 12px; line-height: 1.5; }
.menu-empty { color: #86909c; padding: 40px 0; text-align: center; }
.preview-json { background: #1d2129; color: #e5e6eb; padding: 14px; border-radius: 6px; font-size: 12px; max-height: 360px; overflow: auto; white-space: pre-wrap; }
</style>
