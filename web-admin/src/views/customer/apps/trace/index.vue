<template>
  <div class="trace-admin">
    <!-- 🔴 标准 §5.1/§5.3：后台页必须挂 AppPageHeader；禁止 el-tabs border-card，改用 CardTabs 范式 -->
    <AppPageHeader title="防伪溯源" desc="管理防伪码制、批次与查询记录，消费者扫码后可于 C 端溯源页验真领奖">
      <div class="hd-actions">
        <!-- 🔴 库存是平台侧发放的计量口径，租户侧只展示余量，不提供自助充值入口 -->
        <el-tag v-if="cocom === -888" type="success" effect="plain">防伪码库存：不限</el-tag>
        <el-tag v-else-if="cocom > 0" type="warning" effect="plain">防伪码库存：{{ cocom }}</el-tag>
        <el-tag v-else type="danger" effect="plain">防伪码库存：已用尽</el-tag>
        <span class="cocom-hint">库存不足时请联系平台管理员发放</span>
      </div>
    </AppPageHeader>

    <div class="card-tabs">
      <div v-for="t in tabs" :key="t.key" class="ctab" :class="{ active: activeTab === t.key }" @click="switchTab(t.key)">
        <SIcon :name="t.icon" size="default" :color="activeTab === t.key ? '#165dff' : '#4e5969'" />
        <span>{{ t.label }}</span>
      </div>
    </div>

    <main class="trace-content">
      <!-- ============ 批次管理 ============ -->
      <section v-show="activeTab === 'batches'">
        <!-- 🔴 码制软引导：只提示不阻断。硬拦会让「用默认码制直接干活」的租户一进来就卡死，
             而真正不可逆的坑（生成后结构参数锁死）放在保存/生成接口上兜底。 -->
        <el-alert v-if="!ruleConfirmed" type="warning" :closable="false" show-icon class="mb12">
          <div class="guide-row">
            <span>防伪码制（前缀 / 各段长度 / 校验字符集）由系统初始化，还没经你确认。<b>一旦生成过码，结构参数就永久锁定不可改</b>，请先核对再生成。</span>
            <el-button size="small" type="primary" @click="gotoRuleTab">去核对码制</el-button>
          </div>
        </el-alert>
        <div class="filter-bar">
          <el-input v-model.trim="batchQuery.keyword" placeholder="批次号 / 产品 / 厂家 / 品牌" class="w260" clearable
            @keyup.enter="batchQuery.page = 1; loadBatches()" @clear="batchQuery.page = 1; loadBatches()" />
          <el-button type="primary" @click="batchQuery.page = 1; loadBatches()"><el-icon><Search /></el-icon>查询</el-button>
          <el-button type="success" @click="openBatchCreate"><el-icon><Plus /></el-icon>新增批次</el-button>
          <!-- 🔴 公众号带参二维码能力预检：永久码只对「已认证服务号」开放，
               订阅号/未认证服务号出码会直接撞 48001 → 先在界面上说清楚，别让商户印完才发现。 -->
          <el-tag v-if="mpQrCap && mpQrCap.supported === true" type="success" size="small" effect="plain">公众号带参二维码：可用</el-tag>
          <el-tag v-else-if="mpQrCap && mpQrCap.supported === false" type="danger" size="small" effect="plain" :title="mpQrCap.reason">公众号带参二维码：不可用</el-tag>
          <el-tag v-else-if="mpQrCap" type="info" size="small" effect="plain" :title="mpQrCap.reason">公众号带参二维码：状态未知</el-tag>
          <!-- 🔴 G3 批量激活：闸门开启后存量批次要逐个激活，几百个批次 = 几百次点击。
               只在闸门开启时才显示（闸门没开，激活无意义）。 -->
          <el-button v-if="Number(s.isjihuo)" type="warning" plain size="small" :disabled="!batchSelection.length" @click="batchActivateSelected">
            批量激活（{{ batchSelection.length }}）
          </el-button>
          <span class="list-total">共 {{ batchTotal }} 个批次</span>
        </div>

        <el-table v-loading="batchLoading" :data="batchList" class="mt12" empty-text="暂无批次"
          @selection-change="onBatchSelectionChange">
          <!-- 多选列：仅闸门开启时才允许勾选（关着时激活没意义，避免误操作） -->
          <el-table-column v-if="Number(s.isjihuo)" type="selection" width="46" :selectable="(row) => !Number(row.activated)" />
          <el-table-column prop="batch" label="批次号" width="140" />
          <el-table-column prop="product" label="产品" min-width="160" show-overflow-tooltip />
          <el-table-column prop="factory" label="厂家" width="140" show-overflow-tooltip />
          <el-table-column prop="brand" label="品牌" width="140" show-overflow-tooltip />
          <el-table-column label="已查次数" width="100" align="center">
            <template #default="{ row }"><span>{{ Number(row.rcon || 0) }}</span></template>
          </el-table-column>
          <!-- 🔴 P1 试印数：与正式码（num）完全分离，试印不占正式库存 -->
          <el-table-column label="试印数" width="90" align="center">
            <template #default="{ row }"><span>{{ Number(row.demo_num || 0) }}</span></template>
          </el-table-column>
          <!-- 🔴 批次启停（is_active）叫「启用/停用」，与下面 P2 的「先印后绑激活」区分开：
               两个都叫「激活」的话，租户根本分不清自己点的是哪个。 -->
          <el-table-column label="批次状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="Number(row.is_active) ? 'success' : 'info'" size="small">{{ Number(row.is_active) ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <!-- 🔴 P2 先印后绑：闸门开启时，未激活批次消费者扫码只得到「请联系经销商扫码激活」 -->
          <el-table-column label="先印后绑" width="110" align="center">
            <template #default="{ row }">
              <el-tag v-if="!Number(s.isjihuo)" type="info" size="small" effect="plain">闸门未开</el-tag>
              <el-tag v-else-if="Number(row.activated)" type="success" size="small">已激活</el-tag>
              <el-tag v-else type="warning" size="small">待激活</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="320" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" :disabled="!Number(row.is_active)" @click="openGen(row)">生成</el-button>
              <el-button link type="primary" size="small" :disabled="!Number(row.is_active)" @click="openGen(row)">下载码包</el-button>
              <el-button v-if="!Number(row.is_active)" link type="success" size="small" @click="activateBatch(row)">启用</el-button>
              <el-button v-if="Number(s.isjihuo) && !Number(row.activated)" link type="warning" size="small" @click="activateBatchGate(row)">激活</el-button>
              <el-button link type="primary" size="small" @click="openBatchEdit(row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="removeBatch(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager">
          <el-pagination v-model:current-page="batchQuery.page" :page-size="batchQuery.pageSize" :total="batchTotal"
            layout="total, prev, pager, next" @current-change="loadBatches" />
        </div>
      </section>

      <!-- ============ 防伪码记录 ============ -->
      <section v-show="activeTab === 'codes'">
        <div class="filter-bar">
          <el-input v-model.trim="codeQuery.code" placeholder="防伪码" class="w260" clearable
            @keyup.enter="codeQuery.page = 1; loadCodes()" @clear="codeQuery.page = 1; loadCodes()" />
          <el-button type="primary" @click="codeQuery.page = 1; loadCodes()"><el-icon><Search /></el-icon>查询</el-button>
          <span class="list-total">共 {{ codeTotal }} 条</span>
        </div>

        <el-table v-loading="codeLoading" :data="codeList" class="mt12" empty-text="暂无防伪码">
          <el-table-column prop="code" label="防伪码" min-width="200" show-overflow-tooltip />
          <el-table-column prop="batch" label="批次" width="140" />
          <el-table-column prop="product" label="产品" min-width="160" show-overflow-tooltip />
          <el-table-column label="查询次数" width="100" align="center">
            <template #default="{ row }"><span>{{ Number(row.num || 0) }}</span></template>
          </el-table-column>
          <el-table-column label="异常" width="90" align="center">
            <template #default="{ row }"><el-tag v-if="Number(row.is_err)" type="danger" size="small">异常</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <!-- 🔴 出公众号带参二维码：消费者用微信扫 → 在公众号内弹出图文卡片（溯源结果） -->
              <el-button link type="primary" size="small" @click="openMpQr(row.code)">出带参码</el-button>
              <el-button link type="danger" size="small" @click="markError(row)">标记异常</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager">
          <el-pagination v-model:current-page="codeQuery.page" :page-size="codeQuery.pageSize" :total="codeTotal"
            layout="total, prev, pager, next" @current-change="loadCodes" />
        </div>
      </section>

      <!-- ============ 防伪设置（7 子 Tab：码制 / 功能 / 回复 / 企业 / 快捷 / 通用 / 红包） ============ -->
      <section v-show="activeTab === 'settings'">
        <div class="card-tabs sub-tabs">
          <div v-for="st in settingTabs" :key="st.key" class="ctab" :class="{ active: settingTab === st.key }" @click="settingTab = st.key">
            <SIcon :name="st.icon" size="default" :color="settingTab === st.key ? '#165dff' : '#4e5969'" />
            <span>{{ st.label }}</span>
          </div>
        </div>

        <main class="set-content">
          <!-- ===== 码制配置（独立存储，单独保存） ===== -->
          <section v-show="settingTab === 'rule'">
            <el-card class="set-card" shadow="never">
              <template #header><span class="card-title">码制配置</span></template>
              <!-- 🔴 P0 印刷锁定：正式印刷过防伪码后，密钥(k1~k4)与结构(m1~m5)永久锁死 ——
                   改了会让已印出去的码全部失效。这里直接禁用输入框，别让用户填完再被服务端拒。 -->
              <el-alert v-if="ruleLocked" type="error" :closable="false" show-icon class="mb12"
                :title="`码制已锁定（${ruleLockedAtText} 已正式印刷防伪码）：前缀 / 各段长度 / 校验字符集 k1~k4 均不可修改`" />
              <el-alert v-if="ruleSelfCheck !== ''" type="warning" :closable="false" show-icon :title="ruleSelfCheck" class="mb12" />
              <el-form label-width="130px" class="rule-form">
                <el-row :gutter="20">
                  <el-col :span="8">
                    <el-form-item label="码前缀 m1" required>
                      <el-input v-model.trim="ruleForm.m1" maxlength="2" placeholder="2 位，如 FW" :disabled="ruleLocked" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="批次号长度 m2">
                      <el-input-number v-model="ruleForm.m2" :min="1" :max="12" controls-position="right" :disabled="ruleLocked" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="流水号长度 m3">
                      <el-input-number v-model="ruleForm.m3" :min="1" :max="12" controls-position="right" :disabled="ruleLocked" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="校验位长度 m4">
                      <el-input-number v-model="ruleForm.m4" :min="1" :max="12" controls-position="right" :disabled="ruleLocked" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="防伪码总长 m5">
                      <el-input-number v-model="ruleForm.m5" :min="6" :max="40" controls-position="right" :disabled="ruleLocked" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="错误次数上限">
                      <el-input-number v-model="ruleForm.zdl" :min="1" :max="999" controls-position="right" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-form-item label="校验字符集 k1" required>
                  <el-input v-model.trim="ruleForm.k1" maxlength="10" placeholder="10 位" :disabled="ruleLocked">
                    <template #append><el-button :loading="kRandomizing === 1" :disabled="ruleLocked" @click="randomizeKey(1)">随机</el-button></template>
                  </el-input>
                </el-form-item>
                <el-form-item label="校验字符集 k2" required>
                  <el-input v-model.trim="ruleForm.k2" maxlength="10" placeholder="10 位" :disabled="ruleLocked">
                    <template #append><el-button :loading="kRandomizing === 2" :disabled="ruleLocked" @click="randomizeKey(2)">随机</el-button></template>
                  </el-input>
                </el-form-item>
                <el-form-item label="校验字符集 k3" required>
                  <el-input v-model.trim="ruleForm.k3" maxlength="10" placeholder="10 位" :disabled="ruleLocked">
                    <template #append><el-button :loading="kRandomizing === 3" :disabled="ruleLocked" @click="randomizeKey(3)">随机</el-button></template>
                  </el-input>
                </el-form-item>
                <el-form-item label="校验字符集 k4" required>
                  <el-input v-model.trim="ruleForm.k4" maxlength="10" placeholder="10 位" :disabled="ruleLocked">
                    <template #append><el-button :loading="kRandomizing === 4" :disabled="ruleLocked" @click="randomizeKey(4)">随机</el-button></template>
                  </el-input>
                </el-form-item>
                <el-form-item label="系统保留位 k5">
                  <el-input :model-value="ruleForm.k5" disabled placeholder="1 位">
                    <template #append><el-tag size="small" type="info" effect="plain">不可修改</el-tag></template>
                  </el-input>
                  <span class="form-hint">k5 是算法保留盐位（1 位），由系统固定，不参与位运算校验字符集，租户不可更改</span>
                </el-form-item>

                <el-dialog v-model="downloadDlg.visible" title="下载码制配置备份" width="520px" append-to-body>
                  <el-alert type="warning" :closable="false" show-icon class="mb12">
                    本文件含防伪密钥（k1~k5），泄露可被用于伪造该租户的防伪码。请离线妥善保管，勿经微信 / 邮件 / 云盘明文传输。
                  </el-alert>
                  <el-form label-width="120px">
                    <el-form-item label="备份方式">
                      <el-radio-group v-model="downloadDlg.mode">
                        <el-radio value="encrypted">加密（推荐）</el-radio>
                        <el-radio value="plain">明文</el-radio>
                      </el-radio-group>
                    </el-form-item>
                    <template v-if="downloadDlg.mode === 'encrypted'">
                      <el-form-item label="加密密码" required>
                        <el-input v-model="downloadDlg.password" type="password" show-password placeholder="设置解密密码" />
                      </el-form-item>
                      <el-form-item label="确认密码" required>
                        <el-input v-model="downloadDlg.confirmPwd" type="password" show-password placeholder="再输一次" />
                      </el-form-item>
                      <el-alert type="error" :closable="false" class="mb12">
                        平台不保存此密码，遗忘将无法恢复备份。
                      </el-alert>
                    </template>
                  </el-form>
                  <template #footer>
                    <el-button @click="downloadDlg.visible = false">取消</el-button>
                    <el-button type="primary" :loading="downloadPreparing" @click="doDownload">下载 .txt</el-button>
                  </template>
                </el-dialog>
                <el-form-item>
                  <el-button type="primary" :loading="ruleSaving" @click="saveRule">保存码制</el-button>
                  <el-button :loading="downloadPreparing" @click="openDownload">下载码制配置</el-button>
                  <span class="form-hint" v-if="ruleLocked">已正式印刷过防伪码，码制结构与校验密钥已永久锁定；仅「错误次数上限」仍可调整</span>
                  <span class="form-hint" v-else>已生成过防伪码后，前缀/各长度参数将被锁定不可改，否则已印码全部失效</span>
                </el-form-item>
              </el-form>
            </el-card>
          </section>

          <!-- ===== 功能设置 ===== -->
          <section v-show="settingTab === 'func'">
            <el-card class="set-card" shadow="never">
              <template #header><span class="card-title">功能设置</span></template>
              <el-form label-width="140px" class="set-form">
                <el-row :gutter="20">
                  <el-col :span="12">
                    <el-form-item label="查询次数上限">
                      <el-input-number v-model="s.upperlimit" :min="0" :max="9999" controls-position="right" />
                      <span class="form-hint">0 表示不限制</span>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="历史记录条数">
                      <el-input-number v-model="s.history_limit" :min="1" :max="50" controls-position="right" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="溯源页域名">
                      <el-input v-model.trim="s.siteroot" placeholder="留空则用当前站点域名" />
                    </el-form-item>
                  </el-col>
                </el-row>

                <!-- ===== 扫码查询方案 ===== -->
                <!-- 🔴 三档决定「印刷什么形态的码 + 验真结果从哪里出来」，由服务端出具可用性，本页只渲染 -->
                <el-divider content-position="left">扫码查询方案</el-divider>
                <el-form-item label="验真结果出口">
                  <el-radio-group v-model="s.scanMode" class="scan-mode-group">
                    <el-radio
                      v-for="opt in (scanQuery.options || [])"
                      :key="opt.value"
                      :value="opt.value"
                      :disabled="!opt.available"
                      class="scan-mode-radio"
                    >
                      <div class="scan-mode-title">
                        {{ opt.label }}
                        <span class="scan-mode-print">{{ opt.print }}</span>
                      </div>
                      <div class="scan-mode-desc">{{ opt.desc }}</div>
                      <div v-if="!opt.available" class="scan-mode-bad">当前不可用：{{ opt.reason }}</div>
                      <div v-else-if="opt.note" class="scan-mode-note">{{ opt.note }}</div>
                    </el-radio>
                  </el-radio-group>
                  <el-alert
                    v-if="currentMode && !currentMode.available"
                    type="warning"
                    :closable="false"
                    show-icon
                    :title="`当前所选档位暂不可用：${currentMode.reason || '前置条件未满足'}，消费者侧会回落到网页验真。`"
                    class="mt12"
                  />
                  <div class="form-hint mt12">三档决定「印什么形态的码 + 验真结果从哪出来」。若希望某批次已印出的码不受后续全局设置变更影响，可在该批次编辑中开启「方案冻结」，将其固定为出码时的方案。</div>
                </el-form-item>
                <el-col :span="16">
                  <el-form-item label="公众号内回复验真">
                    <el-switch v-model="s.wxReply" :active-value="1" :inactive-value="0" />
                    <span class="form-hint">开启后，消费者在公众号会话里直接发送防伪码即可收到验真结果（含「是否已被多次查询」预警）；每次回复同时登记一次查询。</span>
                  </el-form-item>
                </el-col>

                <el-divider content-position="left">功能开关</el-divider>
                <el-row :gutter="20" class="switch-grid">
                  <el-col :span="8"><el-form-item label="开启历史查询"><el-switch v-model="s.ishistory" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="积分功能"><el-switch v-model="s.isint" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="外链跳转"><el-switch v-model="s.islink" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="码激活"><el-switch v-model="s.isjihuo" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="窜货检测"><el-switch v-model="s.ischuanhuo" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="生成习惯记录"><el-switch v-model="s.xiguang" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="防窜货提示"><el-switch v-model="s.istixe" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="验证码"><el-switch v-model="s.isccode" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="开放对外 API"><el-switch v-model="s.isapi" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="抽奖功能"><el-switch v-model="s.isluck" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
                </el-row>
                <el-alert type="info" :closable="false" show-icon title="开关类字段已落库保存，但部分（积分/外链/抽奖/码激活等）的后端消费逻辑将在后续批次接入；当前保存不影响已有功能。" class="mt12" />

                <el-form-item label="高级设置">
                  <el-switch v-model="advancedMode" active-text="编辑原始 JSON" />
                </el-form-item>
                <el-form-item v-if="advancedMode" label=" " label-width="0">
                  <el-input v-model="rawJson" type="textarea" :rows="10" class="raw-json" @input="onRawInput" />
                  <div v-if="rawError" class="raw-err">JSON 解析失败：{{ rawError }}</div>
                </el-form-item>
              </el-form>
            </el-card>
          </section>

          <!-- ===== 回复设置（文案） ===== -->
          <section v-show="settingTab === 'reply'">
            <el-card class="set-card" shadow="never">
              <template #header><span class="card-title">回复设置（验真页文案）</span></template>
              <el-form label-width="150px" class="set-form">
                <el-divider content-position="left">商品模式文案</el-divider>
                <el-row :gutter="20">
                  <el-col :span="12"><el-form-item label="欢迎语"><el-input v-model.trim="s.welcome" placeholder="验真页欢迎语" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="欢迎副文案"><el-input v-model.trim="s.welcometxt" placeholder="欢迎语下方副文案" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="首次查询提示"><el-input v-model.trim="s.suc_one" placeholder="如：验证通过" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="二次查询提示"><el-input v-model.trim="s.suc_two" placeholder="如：请勿重复验证" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="三次查询提示"><el-input v-model.trim="s.suc_three" placeholder="第 3 次查询时提示" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="超限提示"><el-input v-model.trim="s.con_msg" placeholder="达到上限时提示" /></el-form-item></el-col>
                </el-row>
                <el-divider content-position="left">活动模式文案（现场活动场景变体）</el-divider>
                <el-alert type="info" :closable="false" show-icon title="「活动」系列为现场活动模式的文案变体；当前 C 端验真页默认走商品模式，活动变体将在 C 端支持活动模式后生效。" class="mb12" />
                <el-row :gutter="20">
                  <el-col :span="12"><el-form-item label="活动欢迎语"><el-input v-model.trim="s.welcome1" placeholder="活动模式欢迎语" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="活动欢迎副文案"><el-input v-model.trim="s.welcometxt1" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="活动首次提示"><el-input v-model.trim="s.suc_one1" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="活动二次提示"><el-input v-model.trim="s.suc_two1" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="活动三次提示"><el-input v-model.trim="s.suc_three1" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="活动超限提示"><el-input v-model.trim="s.con_msg1" /></el-form-item></el-col>
                </el-row>
                <el-divider content-position="left">公众号关注回复</el-divider>
                <el-row :gutter="20">
                  <el-col :span="12"><el-form-item label="关注回复一"><el-input v-model.trim="s.myone" placeholder="关注后首条回复" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="关注回复二"><el-input v-model.trim="s.mytwo" placeholder="关注后第二条回复" /></el-form-item></el-col>
                </el-row>
              </el-form>
            </el-card>
          </section>

          <!-- ===== 企业设置 ===== -->
          <section v-show="settingTab === 'company'">
            <el-card class="set-card" shadow="never">
              <template #header><span class="card-title">企业设置</span></template>
              <el-form label-width="130px" class="set-form">
                <el-row :gutter="20">
                  <el-col :span="12"><el-form-item label="企业名称"><el-input v-model.trim="s.factory" placeholder="厂家/企业名称" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="客服电话"><el-input v-model.trim="s.ftel" placeholder="400-xxx" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="厂家电话"><el-input v-model.trim="s.dtel" placeholder="厂家联系电话" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="常用快递"><el-input v-model.trim="s.kuaidi" placeholder="如：顺丰、圆通" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="联系链接"><el-input v-model.trim="s.link" placeholder="联系我们页 URL" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="官网"><el-input v-model.trim="s.website" placeholder="https://" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="企业简介"><el-input v-model.trim="s.profile" type="textarea" :rows="2" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="名片链接"><el-input v-model.trim="s.cardlink" placeholder="企业名片 URL" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="录入链接"><el-input v-model.trim="s.lurulink" placeholder="内部录入页 URL" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="Logo"><el-input v-model.trim="s.logo" placeholder="图片 URL" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="主图"><el-input v-model.trim="s.banner" placeholder="图片 URL" /></el-form-item></el-col>
                </el-row>
              </el-form>
            </el-card>
          </section>

          <!-- ===== 快捷设置 ===== -->
          <section v-show="settingTab === 'quick'">
            <el-card class="set-card" shadow="never">
              <template #header><span class="card-title">快捷设置（批次录入常用项）</span></template>
              <el-form label-width="140px" class="set-form">
                <el-row :gutter="20">
                  <el-col :span="12"><el-form-item label="常用快递"><el-input v-model.trim="s.kuaidi" placeholder="一行一家，生成批次时可直接选用" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="常用溯源项目"><el-input v-model.trim="s.ttx_sy" placeholder="如：生产批号、生产日期" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="常用项目默认"><el-input v-model.trim="s.ttx_yd" placeholder="默认填充到溯源项目，如：生产批号" /></el-form-item></el-col>
                </el-row>
              </el-form>
            </el-card>
          </section>

          <!-- ===== 通用设置（首页展示位） ===== -->
          <section v-show="settingTab === 'general'">
            <!-- 首页展示位：C 端验真结果页下方的推广位（多展位，各配封面图+展示条件） -->
            <el-card class="set-card" shadow="never">
              <template #header>
                <div class="slot-head">
                  <span class="card-title">首页展示位</span>
                  <span class="form-hint">最多 {{ SLOT_MAX }} 个（与公众号图文消息单条 1~8 图文的接口上限一致）</span>
                </div>
              </template>

              <el-empty v-if="!s.displaySlots.length" description="还没有展示位，点下方「新增展示位」开始配置" :image-size="60" />

              <div v-for="(it, i) in s.displaySlots" :key="i" class="slot-item">
                <div class="slot-item-hd">
                  <span class="slot-idx">第 {{ i + 1 }} 位</span>
                  <el-tag v-if="it.when === 0" type="info" size="small" effect="plain">已关闭</el-tag>
                  <div class="slot-ops">
                    <el-button link size="small" :disabled="i === 0" @click="moveSlot(i, -1)">上移</el-button>
                    <el-button link size="small" :disabled="i === s.displaySlots.length - 1" @click="moveSlot(i, 1)">下移</el-button>
                    <el-button link size="small" type="danger" @click="removeSlot(i)">删除</el-button>
                  </div>
                </div>
                <el-form label-width="90px" class="slot-form">
                  <el-form-item label="封面图">
                    <div class="slot-cover-pick" @click="openCoverPicker(i)">
                      <img v-if="it.cover" :src="it.cover" class="slot-thumb" />
                      <div v-else class="slot-add">+ 选择图片</div>
                    </div>
                    <span class="form-hint">建议 240×180；未上传时 C 端显示占位底色</span>
                  </el-form-item>
                  <el-form-item label="标题">
                    <el-input v-model.trim="it.title" maxlength="32" placeholder="展示位标题" class="slot-in" />
                  </el-form-item>
                  <el-form-item label="展示条件">
                    <el-select v-model="it.when" class="slot-when">
                      <el-option v-for="w in SLOT_WHEN_OPTIONS" :key="w.value" :label="w.label" :value="w.value" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="跳转链接">
                    <el-input v-model.trim="it.link" placeholder="/pages/xxx 或 https://..." class="slot-in" />
                    <span class="form-hint">http(s) 开头按网页打开（小程序端降级为复制链接），其余按内部页面跳转</span>
                  </el-form-item>
                  <el-form-item label="接口密钥">
                    <el-input v-model.trim="it.accessKey" show-password placeholder="用于代理外部接口调用" class="slot-in" />
                    <span class="form-hint">保存后仅回显脱敏串；原样提交表示不修改，输入新值才会覆盖。当前为预留字段，暂不影响展示位行为</span>
                  </el-form-item>
                </el-form>
              </div>

              <div class="slot-foot">
                <el-button :disabled="s.displaySlots.length >= SLOT_MAX" @click="addSlot">+ 新增展示位</el-button>
              </div>
            </el-card>
            <MaterialPicker v-model="coverPicker.show" @confirm="onPickCover" />
          </section>

          <!-- ===== 红包设置（配置占位，待接入租户微信支付凭据） ===== -->
          <section v-show="settingTab === 'redpack'">
            <el-card class="set-card" shadow="never">
              <template #header><span class="card-title">红包设置</span></template>
              <el-alert type="warning" :closable="false" show-icon
                title="当前为配置占位：红包真正发放需先接入租户级微信支付商户号与证书（apicert / apikey / rootca）。在凭据未提供前，本 Tab 仅保存文案与策略配置，不会实际发红包，避免建成「空头权益」。" class="mb12" />
              <el-form label-width="140px" class="set-form">
                <el-form-item label="启用红包">
                  <el-switch v-model="s.isred" :active-value="1" :inactive-value="0" />
                  <span class="form-hint">总开关；为 0 时不生效（对标站逻辑一致）</span>
                </el-form-item>
                <el-form-item label="红包类型">
                  <el-select v-model="s.redtype" class="w260">
                    <el-option :value="0" label="普通红包" />
                    <el-option :value="1" label="裂变红包" />
                  </el-select>
                </el-form-item>
                <el-row :gutter="20">
                  <el-col :span="12"><el-form-item label="祝福语"><el-input v-model.trim="s.redwishing" placeholder="如：恭喜发财" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="错误提示"><el-input v-model.trim="s.rednotx" placeholder="领取失败提示" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="备注"><el-input v-model.trim="s.redremark" /></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="说明链接"><el-input v-model.trim="s.redlink" placeholder="活动说明页 URL" /></el-form-item></el-col>
                  <el-col :span="12">
                    <el-form-item label="补发策略">
                      <el-select v-model="s.redbufa" class="w260">
                        <el-option :value="0" label="补发给首位查询人" />
                        <el-option :value="1" label="补发给当前查询人" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </el-card>
          </section>

          <!-- ===== 全局活动设置（P3 独立广告位，不复用首页展示位） ===== -->
          <section v-show="settingTab === 'activity'">
            <el-card class="set-card" shadow="never">
              <template #header><span class="card-title">全局活动设置</span></template>
              <el-form label-width="140px" class="set-form">
                <el-alert type="info" :closable="false" show-icon class="mb12"
                  title="在验真结果海报下方展示一张活动广告位（与首页展示位相互独立）。链接中的 [FWM] 会自动替换为本次查询的防伪码、[KEY] 会自动替换为下方填写的活动标识，便于活动落地页区分来源。" />
                <el-form-item label="启用活动位">
                  <el-switch v-model="s.activity.enabled" :active-value="true" :inactive-value="false" />
                  <span class="form-hint">关闭后消费者侧不展示该广告位</span>
                </el-form-item>
                <el-form-item label="展示时机">
                  <el-select v-model="s.activity.when" class="w260">
                    <el-option :value="0" label="总是展示" />
                    <el-option :value="1" label="仅首次查询展示" />
                    <el-option :value="2" label="仅非首次查询展示" />
                  </el-select>
                </el-form-item>
                <el-form-item label="广告图">
                  <el-input v-model.trim="s.activity.cover" placeholder="图片 URL（建议 750×300）" />
                  <el-button link type="primary" class="ml8" @click="openActivityCover">选择素材</el-button>
                </el-form-item>
                <el-form-item label="标题文案">
                  <el-input v-model.trim="s.activity.title" placeholder="如：扫码领周年庆福利，可含 [FWM] / [KEY]" />
                </el-form-item>
                <el-form-item label="跳转链接">
                  <el-input v-model.trim="s.activity.link" placeholder="如：https://example.com/act?code=[FWM]&key=[KEY]" />
                  <span class="form-hint">支持 [FWM]（防伪码）与 [KEY]（活动标识）占位符</span>
                </el-form-item>
                <el-form-item label="活动标识 KEY">
                  <el-input v-model.trim="s.activity.linkKey" placeholder="如：anniv2026" />
                  <span class="form-hint">会替换链接 / 文案中的 [KEY]</span>
                </el-form-item>
              </el-form>
            </el-card>
            <MaterialPicker v-model="activityCoverPicker.show" @confirm="onPickActivityCover" />
          </section>
        </main>

        <!-- 数据类 Tab 的统一保存条（码制 Tab 走自身保存） -->
        <div v-if="settingTab !== 'rule'" class="set-savebar">
          <el-button type="primary" :loading="setSaving" @click="saveSettings">保存设置</el-button>
          <span class="form-hint">所有子 Tab 的字段随本次保存一并提交</span>
        </div>
      </section>

      <!-- ============ 数据统计（数据魔方报表中心，Phase 3） ============ -->
      <section v-show="activeTab === 'stats'">
        <el-row :gutter="16" class="stat-cards">
          <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ stat.totalQueries }}</div><div class="stat-label">累计查询次数</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ stat.totalCodes }}</div><div class="stat-label">防伪码总数</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ stat.errorCodes }}</div><div class="stat-label">异常码数</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ stat.batches }}</div><div class="stat-label">批次总数</div></el-card></el-col>
        </el-row>

        <el-row :gutter="16" style="margin-top:16px">
          <el-col :span="14">
            <el-card shadow="never">
              <template #header>
                <div class="slot-head">
                  <span class="card-title">地域分布</span>
                  <el-radio-group v-model="regionLevel" size="small" @change="loadStatsRegion">
                    <el-radio-button value="province">按省</el-radio-button>
                    <el-radio-button value="city">按市</el-radio-button>
                  </el-radio-group>
                </div>
              </template>
              <div class="bar-chart">
                <div v-for="item in regionBars" :key="item.name" class="bar-row">
                  <span class="bar-label" :title="item.name">{{ item.name }}</span>
                  <div class="bar-track"><div class="bar-fill" :style="{ width: item.pct + '%' }"></div></div>
                  <span class="bar-val">{{ item.value }}</span>
                </div>
                <div v-if="!regionBars.length" class="chart-empty">暂无数据</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="10">
            <el-card shadow="never">
              <template #header><span class="card-title">查询健康度</span></template>
              <div class="donut-wrap">
                <div class="donut" :style="donutStyle"><div class="donut-center">{{ healthyCount + stat.errorCodes }}</div></div>
                <div class="donut-legend">
                  <div><i class="dot ok"></i>正常查询 <b>{{ healthyCount }}</b></div>
                  <div><i class="dot bad"></i>异常查询 <b>{{ stat.errorCodes }}</b></div>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="16" style="margin-top:16px">
          <el-col :span="24">
            <el-card shadow="never">
              <template #header><span class="card-title">查询趋势（按日）</span></template>
              <svg class="trend-svg" viewBox="0 0 600 220" preserveAspectRatio="none">
                <path :d="trendGeom.area" class="trend-area" />
                <path :d="trendGeom.line" class="trend-line" />
              </svg>
              <div class="trend-axis">
                <span v-if="trendGeom.points.length">{{ trendGeom.points[0].name }} ~ {{ trendGeom.points[trendGeom.points.length - 1].name }}</span>
                <span>峰值 {{ trendGeom.max }}</span>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </section>

      <!-- ============ 查询历史 ============ -->
      <section v-show="activeTab === 'histories'">
        <div class="filter-bar">
          <el-select v-model="histQuery.type" class="w200" @change="histQuery.page = 1; loadHistories()">
            <el-option :value="-1" label="全部类型" />
            <el-option :value="0" label="查询验真" />
            <el-option :value="1" label="后台操作" />
          </el-select>
          <el-input v-model.trim="histQuery.summary" placeholder="摘要/码/OpenID" class="w260" clearable
            @keyup.enter="histQuery.page = 1; loadHistories()" @clear="histQuery.page = 1; loadHistories()" />
          <el-button type="primary" @click="histQuery.page = 1; loadHistories()"><el-icon><Search /></el-icon>查询</el-button>
          <span class="list-total">共 {{ histTotal }} 条</span>
        </div>
        <el-table v-loading="histLoading" :data="histList" class="mt12" empty-text="暂无记录">
          <el-table-column prop="created_at" label="时间" width="170" />
          <el-table-column label="类型" width="110">
            <template #default="{ row }"><el-tag size="small" :type="Number(row.type) === 0 ? 'success' : 'info'">{{ Number(row.type) === 0 ? '查询验真' : '后台操作' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="summary" label="摘要" min-width="180" show-overflow-tooltip />
          <el-table-column prop="openid" label="OpenID" min-width="120" show-overflow-tooltip />
          <el-table-column prop="ip" label="IP" width="130" />
          <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        </el-table>
        <div class="pager"><el-pagination v-model:current-page="histQuery.page" :page-size="histQuery.pageSize" :total="histTotal" layout="total, prev, pager, next" @current-change="loadHistories" /></div>
      </section>

      <!-- ============ 错误码 ============ -->
      <section v-show="activeTab === 'wrong'">
        <div class="filter-bar">
          <span class="list-total">共 {{ wrongTotal }} 条异常查询记录</span>
          <el-button @click="loadWrong"><el-icon><Search /></el-icon>刷新</el-button>
        </div>
        <el-table v-loading="wrongLoading" :data="wrongList" class="mt12" empty-text="暂无错误码记录">
          <el-table-column prop="created_at" label="时间" width="170" />
          <el-table-column prop="code" label="防伪码" min-width="200" show-overflow-tooltip />
          <el-table-column prop="openid" label="OpenID" min-width="120" show-overflow-tooltip />
          <el-table-column prop="ip" label="IP" width="130" />
        </el-table>
        <div class="pager"><el-pagination v-model:current-page="wrongQuery.page" :page-size="wrongQuery.pageSize" :total="wrongTotal" layout="total, prev, pager, next" @current-change="loadWrong" /></div>
      </section>

      <!-- ============ 商城集成 ============ -->
      <section v-show="activeTab === 'shop'">
        <el-card class="set-card" shadow="never">
          <template #header><span class="card-title">商城集成（溯源页「查看商品」跳转目标）</span></template>
          <el-alert type="info" :closable="false" show-icon title="选择后点「保存设置」即生效（随防伪设置一并提交）。仅接入本平台真实存在的来源，避免「后台能选、服务端零消费」的空头配置。" class="mb12" />
          <el-form label-width="140px" class="set-form">
            <el-form-item label="商品来源">
              <el-select v-model="s.isint" class="w320">
                <el-option v-for="opt in shopSources" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
              <span class="form-hint">0 不关联 / 1 本平台商城商品 / 2 外部商品链接</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="setSaving" @click="saveSettings">保存设置</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </section>

      <!-- ============ 使用说明（静态帮助页，P0-6 最便宜项） ============ -->
      <section v-show="activeTab === 'help'">
        <el-card class="set-card" shadow="never">
          <template #header><span class="card-title">使用说明</span></template>
          <div class="help-body">
            <h4>一、溯源流程</h4>
            <p>消费者扫描商品上的防伪码（或手动输入），在 C 端溯源页验真：首次查询显示验证通过，重复查询会提示查询次数与首次/上次查询时间。</p>
            <h4>二、批次与码制</h4>
            <p>在「批次管理」新增批次并生成防伪码；码制（前缀 / 各段长度 / 校验字符集）一旦生成过码将被锁定，请先规划好码制再生成。</p>
            <h4>三、首页展示位</h4>
            <p>在「防伪设置 → 通用设置」配置 C 端验真结果页下方的推广位，最多 8 个，可设置封面图、标题、展示条件与跳转链接。</p>
            <h4>四、数据统计与排查</h4>
            <p>在「数据统计」查看累计查询次数、地域分布与查询趋势；在「查询历史 / 错误码」排查异常查询。</p>
            <h4>五、防伪码库存</h4>
            <p>防伪码库存由平台发放，租户侧只显示余量（「不限」或具体数量），<b>不提供自助充值入口</b>。生成批次时按量扣减，余量不足时请联系平台管理员发放后再生成。</p>
            <h4>版本说明</h4>
            <p>当前为防伪溯源模块 P0 版本。红包真发、客户管理、批次奖励四分区等能力将随后续版本接入（详见方案文档）。</p>
          </div>
        </el-card>
      </section>

    </main>

    <!-- 新增/编辑批次弹窗 -->
    <el-dialog v-model="batchDlg.visible" :title="batchDlg.isEdit ? '编辑批次' : '新增批次'" width="640px" :close-on-click-modal="false">
      <el-form label-width="100px" class="batch-form">
        <el-form-item label="批次号" required>
          <el-input v-model.trim="batchDlg.form.batch" placeholder="由码制「批次号长度」决定，如 7 位" />
        </el-form-item>
        <el-form-item label="产品"><el-input v-model.trim="batchDlg.form.product" /></el-form-item>
        <el-form-item label="厂家"><el-input v-model.trim="batchDlg.form.factory" /></el-form-item>
        <el-form-item label="品牌"><el-input v-model.trim="batchDlg.form.brand" /></el-form-item>
        <el-form-item label="原产地"><el-input v-model.trim="batchDlg.form.origin" /></el-form-item>
        <el-form-item label="省"><el-input v-model.trim="batchDlg.form.province" /></el-form-item>
        <el-form-item label="市"><el-input v-model.trim="batchDlg.form.city" /></el-form-item>
        <el-form-item label="区"><el-input v-model.trim="batchDlg.form.district" /></el-form-item>
        <el-form-item label="窜货检测">
          <el-select v-model="batchDlg.form.isChuanhuo" class="w200">
            <el-option :value="0" label="关闭" />
            <el-option :value="2" label="按省" />
            <el-option :value="3" label="按市" />
            <el-option :value="4" label="按区县" />
          </el-select>
        </el-form-item>

        <el-form-item label="活动类型">
          <el-select v-model="batchDlg.form.inttype" class="w240">
            <el-option :value="0" label="无奖励" />
            <el-option :value="1" label="积分奖励 1" />
            <el-option :value="2" label="积分奖励 2" />
            <el-option :value="3" label="积分奖励 3" />
            <el-option :value="4" label="积分奖励 4" />
            <el-option :value="5" label="积分奖励 5" />
            <el-option :value="7" label="实物商品（邮寄）" />
            <el-option :value="8" label="微信卡券" />
            <el-option :value="9" label="微信红包" />
            <el-option :value="99" label="专属抽奖" />
            <el-option :value="88" label="商品联动不发放" />
          </el-select>
          <span class="form-hint">决定消费者扫码后获得的奖励类型</span>
        </el-form-item>

        <!-- 🔴 P3 方案冻结：开关 OFF 时，本批次已印出的码沿用「出码时记录的模式」，
             不受后续全局「扫码查询方案」变更影响（避免已印制在外、印成网页码的码被切到公众号通道）。 -->
        <el-form-item label="方案冻结">
          <el-switch v-model="batchDlg.form.scanModeFollow" :active-value="1" :inactive-value="0" active-text="跟随当前设置" inactive-text="冻结出码方案" />
          <span class="form-hint" style="margin-left:8px" v-if="batchDlg.form.scanModeFollow === 0">
            冻结后本批次印出的码按出码时记录的模式（{{ batchFrozenLabel || '尚未出码，将按当前设置' }}）验真
          </span>
        </el-form-item>

        <el-form-item label="套标箱规">
          <el-input-number v-model="batchDlg.form.bbox" :min="0" :max="9999" controls-position="right" />
          <span class="form-hint" style="margin-left:8px">每箱盒数（0 = 不启用套标）</span>
        </el-form-item>
        <el-form-item label="套标盒规">
          <el-input-number v-model="batchDlg.form.sbox" :min="0" :max="9999" controls-position="right" />
          <span class="form-hint" style="margin-left:8px">每盒码数（0 = 不启用套标）</span>
        </el-form-item>

        <el-card class="sub-card" shadow="never">
          <template #header><span class="card-title">奖励配置（四分区）</span></template>
          <el-alert type="info" :closable="false" show-icon title="随批次存入 caid_json，由验真奖励引擎按「活动类型」消费；红包真发需先接入租户微信支付凭据。" class="mb12" />
          <el-form-item label="积分红包">
            <el-switch v-model="batchDlg.form.caid.jfEnabled" />
            <template v-if="batchDlg.form.caid.jfEnabled">
              <span class="form-hint" style="margin:0 8px">下限</span>
              <el-input-number v-model="batchDlg.form.caid.jf.do" :min="0" :max="999999" controls-position="right" />
              <span class="form-hint" style="margin:0 8px">上限</span>
              <el-input-number v-model="batchDlg.form.caid.jf.up" :min="0" :max="999999" controls-position="right" />
            </template>
          </el-form-item>
          <el-form-item label="微信卡券">
            <el-input v-model="batchDlg.form.caid.caidText" type="textarea" :rows="2" class="w360" placeholder="一行一个 cardId" />
          </el-form-item>
          <el-form-item label="红包参数">
            <el-input v-model="batchDlg.form.caid.red.merchantId" class="w320" placeholder="商户号（需租户微信支付凭据）" />
          </el-form-item>
          <el-form-item label="专属抽奖">
            <div class="cj-list">
              <div v-for="(p, idx) in batchDlg.form.caid.cjList" :key="idx" class="cj-row">
                <el-input v-model="p.tx" placeholder="奖项名称" class="w160" />
                <el-input v-model="p.gl" placeholder="权重" class="w100" />
                <el-input v-model="p.zz" placeholder="值(#分隔)" class="w160" />
                <el-button link type="danger" @click="batchDlg.form.caid.cjList.splice(idx, 1)">删除</el-button>
              </div>
              <el-button @click="batchDlg.form.caid.cjList.push({ tx: '', gl: '', zz: '', is: '1' })">+ 添加奖项</el-button>
            </div>
          </el-form-item>
        </el-card>

        <template v-if="batchDlg.isEdit">
          <el-form-item label="Logo"><el-input v-model.trim="batchDlg.form.logo" placeholder="图片 URL" /></el-form-item>
          <el-form-item label="主图"><el-input v-model.trim="batchDlg.form.banner" placeholder="图片 URL" /></el-form-item>
          <el-form-item label="视频"><el-input v-model.trim="batchDlg.form.video" placeholder="视频 URL" /></el-form-item>
          <el-form-item label="购买链接"><el-input v-model.trim="batchDlg.form.buyLink" /></el-form-item>
          <el-form-item label="批次状态">
            <el-switch v-model="batchDlg.form.isActive" active-text="启用" inactive-text="停用" />
          </el-form-item>

          <!-- 🔴 P2 先印后绑（激活闸门）管理位：口令给经销商、激活/撤销在这里操作 -->
          <el-card class="sub-card" shadow="never">
            <template #header><span class="card-title">先印后绑（激活闸门）</span></template>
            <el-alert type="info" :closable="false" show-icon class="mb12"
              title="开启「功能设置 → 码激活」后，本批次在被激活之前，消费者扫码只会看到「请联系经销商扫码激活」，看不到溯源详情。激活口令请线下交给经销商，凭口令由其自助激活。" />
            <el-form-item label="激活状态">
              <el-tag v-if="batchDlg.activation.activated" type="success" size="small">已激活</el-tag>
              <el-tag v-else type="warning" size="small">未激活</el-tag>
              <span class="form-hint" style="margin-left:8px" v-if="batchDlg.activation.activated">
                {{ batchDlg.activation.source === 'dealer' ? '经销商凭口令激活' : '租户后台激活' }}{{ batchDlg.activation.activatedAt ? ' · ' + batchDlg.activation.activatedAt : '' }}
              </span>
            </el-form-item>
            <el-form-item label="激活口令">
              <el-input :model-value="batchDlg.activation.activatePin || '未设置'" readonly placeholder="未设置">
                <template #append>
                  <el-button :loading="pinSaving" @click="resetActivationPin">重置口令</el-button>
                </template>
              </el-input>
              <span class="form-hint">明文只在重置时显示一次，库里存密文；丢失只能重置</span>
            </el-form-item>
            <el-form-item>
              <el-button type="success" size="small" :disabled="batchDlg.activation.activated" @click="activateBatchGate(batchDlg.form)">激活批次</el-button>
              <el-button type="warning" size="small" :disabled="!batchDlg.activation.activated" @click="revokeActivation(batchDlg.form)">撤销激活</el-button>
            </el-form-item>
          </el-card>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="batchDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="saveBatch">保存</el-button>
      </template>
    </el-dialog>

    <!-- 生成防伪码弹窗（🔴 用 el-input-number 替代 window.prompt） -->
    <el-dialog v-model="genDlg.visible" :title="`生成防伪码：${genDlg.row?.batch || ''}`" width="460px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="码型">
          <el-select v-model="genDlg.codetype" class="w240">
            <el-option :value="1" label="普通文本码（含校验位，可扫码/手输）" />
            <el-option :value="2" label="二维码码包（HTML，可印刷）" />
            <el-option :value="6" label="纯数字码" />
          </el-select>
        </el-form-item>
        <!-- 🔴 P1 试印模式：印刷前先小批量试印（不扣库存、不锁码制、码值可区分） -->
        <el-form-item label="生成模式">
          <el-radio-group v-model="genDlg.demo">
            <el-radio :value="0">正式生成</el-radio>
            <el-radio :value="1">试印 · 演示</el-radio>
          </el-radio-group>
          <span class="form-hint" v-if="genDlg.demo">试印码不扣库存、不锁定码制，流水号走顶部预留段（与正式码绝不撞号），码包首行带【演示·试印】标注</span>
          <span class="form-hint" v-else>正式生成会扣减库存，并在生成成功后永久锁定码制（密钥与结构不可再改）</span>
        </el-form-item>
        <el-form-item label="生成数量">
          <el-input-number v-model="genDlg.count" :min="1" :max="genDlg.demo ? 1000 : 10000" :step="100" controls-position="right" />
          <span class="form-hint">{{ genDlg.demo ? '试印建议单次不超过 500 个' : '最多 10000 个' }}</span>
          <span class="form-hint" v-if="!genDlg.demo">分多次生成会连续占用本批次的流水号段（每批接着上一批往下排，不会重号）</span>
          <span class="form-hint form-hint-amber" v-if="!genDlg.demo && genDlg.codetype === 2 && genDlg.count >= 2000">二维码码型单次 ≥ 2000 个将自动打包为 ZIP 分文件（每码一张 SVG + 目录页），可直接分块交给印刷厂</span>
        </el-form-item>
        <!-- 🔴 打包格式：大批量时单 txt 在部分 IM/邮件客户端会被截断，打包成 zip 更稳 -->
        <el-form-item label="打包格式">
          <el-radio-group v-model="genDlg.format">
            <el-radio :value="''">原始文件</el-radio>
            <el-radio :value="'zip'">ZIP 压缩包</el-radio>
          </el-radio-group>
          <span class="form-hint">ZIP 内含一个与原始文件同名同内容的文件，解压即可直接使用</span>
        </el-form-item>
        <!-- 🔴 扫码地址：印在包装上的码扫出来打开什么，必须在生成前让商家看到。
             URL 配错是「印完才发现」的事故（印 10 万个码扫出来打不开 = 全废）。 -->
        <el-form-item label="扫码地址">
          <div class="scan-url-box" :class="{ 'is-warn': scanUrl && !scanUrl.absolute }">
            <template v-if="scanUrl">
              <div v-if="scanUrl.absolute" class="scan-url-ok">
                <el-icon color="#07c160"><CircleCheckFilled /></el-icon>
                <span>{{ scanUrl.previewUrl }}</span>
              </div>
              <div v-else class="scan-url-bad">
                <el-icon color="#f53f3f"><WarningFilled /></el-icon>
                <span>{{ scanUrl.hint }}</span>
              </div>
            </template>
            <span v-else class="form-hint">正在检测扫码地址…</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="genDlg.visible = false">取消</el-button>
        <el-button :loading="genSaving" @click="confirmGen">生成</el-button>
        <el-button v-if="genDlg.lastGen" type="success" :loading="genSaving" @click="downloadLastGen">下载此批</el-button>
        <el-button type="primary" :loading="genSaving" @click="confirmDownload">生成并下载</el-button>
      </template>
    </el-dialog>

    <!-- 🔴 出公众号带参二维码弹窗（G1：此前后端有接口、后台无入口 → 能力对商家等于不存在） -->
    <el-dialog v-model="mpQrDlg.visible" title="生成公众号带参二维码" width="520px" append-to-body>
      <el-form label-width="100px">
        <el-form-item label="防伪码">
          <el-input v-model.trim="mpQrDlg.code" placeholder="输入防伪码（可手输未扫码的码）" clearable />
        </el-form-item>
        <el-form-item label="公众号能力">
          <el-tag v-if="mpQrCap && mpQrCap.supported === true" type="success" size="small" effect="plain">可用</el-tag>
          <el-tag v-else-if="mpQrCap && mpQrCap.supported === false" type="danger" size="small" effect="plain" :title="mpQrCap.reason">不可用</el-tag>
          <el-tag v-else-if="mpQrCap" type="info" size="small" effect="plain" :title="mpQrCap.reason">状态未知</el-tag>
          <span v-else class="form-hint">检测中…</span>
        </el-form-item>
        <el-form-item v-if="mpQrCap && mpQrCap.supported === false" label=" ">
          <div class="scan-url-box">
            <div class="scan-url-bad"><el-icon color="#f53f3f"><WarningFilled /></el-icon><span>{{ mpQrCap.reason }}</span></div>
          </div>
        </el-form-item>
      </el-form>
      <div v-if="mpQrDlg.result" class="mp-qr-result">
        <div class="mp-qr-title">扫码后公众号内弹出溯源卡片</div>
        <img v-if="mpQrDlg.result.imgUrl" :src="mpQrDlg.result.imgUrl" alt="公众号带参二维码" class="mp-qr-img" />
        原「二维码链接」写法有误导性：showUrl 是微信图床上的图片地址（不是扫码目标），
        这里如实标注，并提示该方案适配的场景。
        <div class="mp-qr-links">
          <div>图片地址（微信图床，仅供排查）：<a :href="mpQrDlg.result.showUrl" target="_blank" rel="noopener">{{ mpQrDlg.result.showUrl }}</a></div>
          <div>场景值（即该防伪码）：<code>{{ mpQrDlg.result.code }}</code></div>
          <div class="form-hint">这张图对应上面这一个码，适合「公众号直推（小批量）」方案；大批量请改用网页 + 公众号推送方案。</div>
        </div>
        <el-button size="small" @click="downloadMpQr">下载二维码图片</el-button>
      </div>
      <template #footer>
        <el-button @click="mpQrDlg.visible = false">关闭</el-button>
        <el-button type="primary" :loading="mpQrSaving" @click="confirmMpQr">生成</el-button>
      </template>
    </el-dialog>


  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, CircleCheckFilled, WarningFilled } from '@element-plus/icons-vue';
// 🔴 标准 §5.2：必须走 customerApiCall（baseURL=/api/customer），禁止裸 fetch / 自建 request
import { customerApiCall } from '../../../../api';
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import SIcon from '../../../../components/SIcon.vue';
import MaterialPicker from '../design/MaterialPicker.vue';

const tabs = [
  { key: 'batches', label: '批次管理', icon: 'box' },
  { key: 'codes', label: '防伪码记录', icon: 'list' },
  { key: 'settings', label: '防伪设置', icon: 'settings' },
  { key: 'stats', label: '数据统计', icon: 'chart' },
  { key: 'histories', label: '查询历史', icon: 'clock' },
  { key: 'wrong', label: '错误码', icon: 'warning' },
  { key: 'shop', label: '商城集成', icon: 'link' },
  { key: 'help', label: '使用说明', icon: 'doc' },
];
const activeTab = ref('batches');
function switchTab(key) {
  activeTab.value = key;
  // 🔴 C 类 Tab 懒加载：进入时才拉数据，避免首页一次性打满后端
  if (key === 'stats') loadStats();
  else if (key === 'histories') loadHistories();
  else if (key === 'wrong') loadWrong();
  else if (key === 'shop') loadShop();
}

// 🔴 防伪设置从单卡片拆成 7 个子 Tab（对标站 8 Tab 去掉仅 founder 可见的「密码部署/站长专区」后，
// 补回我们独有的「码制配置」），对齐 P0-1。
const settingTabs = [
  { key: 'rule', label: '码制配置', icon: 'lock' },
  { key: 'func', label: '功能设置', icon: 'settings' },
  { key: 'reply', label: '回复设置', icon: 'chat' },
  { key: 'company', label: '企业设置', icon: 'shop' },
  { key: 'quick', label: '快捷设置', icon: 'flash' },
  { key: 'general', label: '通用设置', icon: 'image' },
  { key: 'redpack', label: '红包设置', icon: 'gift' },
  { key: 'activity', label: '活动设置', icon: 'star' },
];
const settingTab = ref('rule');

/* ----------------- 批次 ----------------- */
const batchQuery = reactive({ page: 1, pageSize: 20, keyword: '' });
const batchList = ref([]);
const batchTotal = ref(0);
const batchLoading = ref(false);
// 🔴 码制是否已由用户确认：false 时批次管理显示软引导。默认给 true，
//    避免接口没吐这个字段（旧版本服务端）时新用户一进来就被黄条糊脸。
const ruleConfirmed = ref(true);
// 🔴 公众号带参二维码能力预检（supported: true 可用 / false 不可用 / null 未知）
const mpQrCap = ref(null);
async function loadMpQrCapability() {
  try {
    const res = await customerApiCall.get('/trace/mp-qr/capability');
    mpQrCap.value = { supported: res.supported === true ? true : (res.supported === false ? false : null), reason: String(res.reason || ''), accountType: String(res.accountType || '') };
  } catch (e) {
    // 未配置公众号 / 无权限 → 不展示标签（不是错误态，别在页面上刷红字）
    mpQrCap.value = null;
  }
}
async function loadBatches() {
  batchLoading.value = true;
  try {
    const params = { page: batchQuery.page, pageSize: batchQuery.pageSize };
    if (batchQuery.keyword) params.keyword = batchQuery.keyword;
    const res = await customerApiCall.get('/trace/batches', { params });
    batchList.value = res.list || [];
    batchTotal.value = Number(res.total || 0);
    ruleConfirmed.value = res.ruleConfirmed !== false;
  } catch (e) {
    ElMessage.error(e || '加载批次失败');
  } finally { batchLoading.value = false; }
}

/** 从批次管理的软引导跳到「防伪设置 → 码制配置」 */
function gotoRuleTab() {
  activeTab.value = 'settings';
  settingTab.value = 'rule';
  loadRule();
}

const batchDlg = reactive({ visible: false, isEdit: false, form: {}, activation: { activated: false, activatePin: '', source: '', activatedAt: '', hasPin: false } });
const batchSaving = ref(false);
const pinSaving = ref(false);
function emptyBatch() {
  return {
    id: 0, batch: '', product: '', factory: '', brand: '', origin: '', province: '', city: '', district: '', isChuanhuo: 0,
    logo: '', banner: '', video: '', buyLink: '', isActive: true,
    inttype: 0, bbox: 0, sbox: 0, integral: 0, redBudgetCents: -1, validity: 0,
    scanModeFollow: 1, printScanMode: '',
    caid: { jfEnabled: false, jf: { do: 0, up: 0 }, caidText: '', red: { merchantId: '' }, cjList: [] },
  };
}
function openBatchCreate() { batchDlg.isEdit = false; batchDlg.form = emptyBatch(); batchDlg.visible = true; }
function openBatchEdit(row) {
  let hd = {};
  try { hd = JSON.parse(row.caid_json || '{}'); } catch (e) { hd = {}; }
  const cjSrc = hd.cj || {};
  const cjList = Object.keys(cjSrc).filter(k => k !== '0').map(k => ({
    tx: cjSrc[k].tx || '', gl: String(cjSrc[k].gl ?? ''), zz: cjSrc[k].zz || '', is: cjSrc[k].is || '1',
  }));
  batchDlg.isEdit = true;
  batchDlg.form = {
    id: row.id,
    batch: row.batch,
    product: row.product || '',
    factory: row.factory || '',
    brand: row.brand || '',
    origin: row.origin || '',
    province: row.province || '',
    city: row.city || '',
    district: row.district || '',
    isChuanhuo: Number(row.is_chuanhuo || 0),
    logo: row.logo || '',
    banner: row.banner || '',
    video: row.video || '',
    buyLink: row.buy_link || '',
    isActive: !!Number(row.is_active),
    inttype: Number(row.inttype || 0),
    bbox: Number(row.bbox || 0),
    sbox: Number(row.sbox || 0),
    integral: Number(row.integral || 0),
    redBudgetCents: Number(row.red_budget_cents ?? -1),
    validity: Number(row.validity || 0),
    scanModeFollow: Number(row.scan_mode_follow ?? 1),
    printScanMode: row.print_scan_mode || '',
    caid: {
      jfEnabled: String(hd.jf?.tp || '') === '1',
      jf: { do: Number(hd.jf?.do || 0), up: Number(hd.jf?.up || 0) },
      caidText: typeof hd.caid === 'string' ? hd.caid : '',
      red: { merchantId: hd.red?.merchantId || '' },
      cjList,
    },
  };
  batchDlg.visible = true;
  // 🔴 P2：顺带拉批次的激活态（编辑弹窗里管理口令/激活/撤销）
  loadBatchActivation(row.id);
}

/** 拉取批次激活态（P2 先印后绑） */
async function loadBatchActivation(id) {
  try {
    const res = await customerApiCall.get(`/trace/batches/${id}/activation`);
    batchDlg.activation = {
      activated: Boolean(res.activated),
      activatePin: String(res.activatePin || ''),
      source: String(res.source || ''),
      activatedAt: String(res.activatedAt || ''),
      hasPin: Boolean(res.hasPin),
    };
  } catch (e) {
    batchDlg.activation = { activated: false, activatePin: '', source: '', activatedAt: '', hasPin: false };
  }
}

/** P2：租户后台直接激活批次 */
async function activateBatchGate(row) {
  try {
    await customerApiCall.post(`/trace/batches/${row.id}/activation`, { remark: '租户后台激活' });
    ElMessage.success('批次已激活');
    if (batchDlg.visible && batchDlg.form.id === row.id) loadBatchActivation(row.id);
    loadBatches();
  } catch (e) { ElMessage.error(e || '激活失败'); }
}

/**
 * G3 批量激活（先印后绑）。
 *
 * 🔴 激活 = 放行消费者看溯源详情 → **误激活等于没设防**。所以：
 *    ① 显式二次确认（ElMessageBox），确认文案写清「这会让这些批次的码可以被消费者查到溯源详情」；
 *    ② 服务端要求 confirm=true 才真执行（防绕过前端直接调接口）；
 *    ③ 不做「一键全激活」——只激活勾选中的那些。
 */
const batchSelection = ref([]);
/** 表格勾选变化 → 记录选中的批次 id（模板里不能直接给 ref 赋值，ref 在模板中只解包读取） */
function onBatchSelectionChange(rows) {
  batchSelection.value = (rows || []).map((r) => Number(r.id)).filter((x) => x > 0);
}
async function batchActivateSelected() {
  const ids = (batchSelection.value || []).map((x) => Number(x)).filter((x) => x > 0);
  if (!ids.length) { ElMessage.warning('请先勾选要激活的批次'); return; }
  try {
    await ElMessageBox.confirm(
      `即将激活 ${ids.length} 个批次。激活后，这些批次的防伪码消费者扫码即可查看溯源详情（未激活的批次消费者只会看到「请联系经销商扫码激活」）。确认继续？`,
      '批量激活确认',
      { type: 'warning', confirmButtonText: '确认激活', cancelButtonText: '取消' },
    );
  } catch (e) { return; } // 用户取消
  try {
    const res = await customerApiCall.post('/trace/batches/activate-batch', { ids, confirm: true, remark: '租户后台批量激活' });
    const failed = Number(res.failed || 0);
    if (failed > 0) {
      ElMessage.warning(`批量激活完成：成功 ${res.success} 个，失败 ${failed} 个`);
    } else {
      ElMessage.success(`已激活 ${res.success} 个批次`);
    }
    batchSelection.value = [];
    loadBatches();
  } catch (e) {
    ElMessage.error(e || '批量激活失败');
  }
}

/** P2：重置激活口令（明文只显示这一次） */
async function resetActivationPin() {
  const id = Number(batchDlg.form.id || 0);
  if (!id) return;
  pinSaving.value = true;
  try {
    const res = await customerApiCall.post(`/trace/batches/${id}/activation-pin`, {});
    const pin = String(res.activatePin || '');
    ElMessageBox.alert(
      `激活口令：${pin}\n\n请立即复制并线下交给经销商（明文只显示这一次，平台只存密文）。`,
      '批次激活口令',
      { confirmButtonText: '我已复制' },
    );
    await loadBatchActivation(id);
  } catch (e) { ElMessage.error(e || '重置激活口令失败'); } finally { pinSaving.value = false; }
}

/** P2：撤销批次激活 */
async function revokeActivation(row) {
  try {
    await ElMessageBox.confirm('撤销后，本批次的码在闸门开启时消费者将只能看到「请联系经销商扫码激活」。确定撤销吗？', '撤销激活', { type: 'warning' });
  } catch { return; }
  try {
    await customerApiCall.delete(`/trace/batches/${row.id}/activation`);
    ElMessage.success('已撤销激活');
    await loadBatchActivation(Number(row.id || 0));
    loadBatches();
  } catch (e) { ElMessage.error(e || '撤销激活失败'); }
}
async function saveBatch() {
  const f = batchDlg.form;
  if (!f.batch) { ElMessage.warning('批次号必填'); return; }
  batchSaving.value = true;
  const caid = {
    jf: f.caid.jfEnabled ? { tp: '1', do: Number(f.caid.jf.do || 0), up: Number(f.caid.jf.up || 0), gd: Number(f.caid.jf.do || 0) } : { tp: '0' },
    caid: f.caid.caidText || '',
    red: { merchantId: f.caid.red.merchantId || '' },
    cj: {},
  };
  f.caid.cjList.forEach((p, i) => { caid.cj[i + 1] = { zz: p.zz || '', tx: p.tx || '', is: p.is || '1', gl: Number(p.gl || 0) }; });
  const batchExtra = {
    inttype: Number(f.inttype || 0), bbox: Number(f.bbox || 0), sbox: Number(f.sbox || 0),
    integral: Number(f.integral || 0), redBudgetCents: Number(f.redBudgetCents ?? -1), validity: Number(f.validity || 0), caid,
  };
  try {
    if (batchDlg.isEdit) {
      await customerApiCall.put(`/trace/batches/${f.id}`, {
        product: f.product, factory: f.factory, brand: f.brand, origin: f.origin,
        logo: f.logo, banner: f.banner, video: f.video, buyLink: f.buyLink,
        province: f.province, city: f.city, district: f.district,
        isChuanhuo: Number(f.isChuanhuo || 0), isActive: f.isActive ? 1 : 0,
        scanModeFollow: Number(f.scanModeFollow ?? 1), printScanMode: f.printScanMode || '', ...batchExtra,
      });
    } else {
      await customerApiCall.post('/trace/batches', {
        batch: f.batch, product: f.product, factory: f.factory, brand: f.brand,
        origin: f.origin, province: f.province, city: f.city, district: f.district,
        isChuanhuo: Number(f.isChuanhuo || 0), ...batchExtra,
      });
    }
    ElMessage.success('保存成功');
    batchDlg.visible = false;
    loadBatches();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally { batchSaving.value = false; }
}
async function removeBatch(row) {
  try {
    await ElMessageBox.confirm(`确定删除批次「${row.batch}」吗？已有查询记录的批次会被停用而非删除。`, '删除批次', { type: 'warning' });
  } catch { return; }
  try {
    await customerApiCall.delete(`/trace/batches/${row.id}`);
    ElMessage.success('操作成功');
    loadBatches();
  } catch (e) { ElMessage.error(e || '删除失败'); }
}

/* ----------------- 生成 / 下载 ----------------- */
// 🔴 lastGen 持有「最近一次生成」的产物，用于「生成后再下载同一批」：
//    系统生成码时不落库（只累加批次 num），所以二次请求必然是另一批新码。
//    要「同一批」就必须复用同一次生成返回的内容，绝不能调两次生成接口。
const genDlg = reactive({ visible: false, row: null, codetype: 1, count: 100, demo: 0, format: '', lastGen: null });
const genSaving = ref(false);
// 🔴 扫码地址状态：弹窗打开时拉一次（/trace/scan-url）。
//    absolute=false = 没配站点根域名 → 印出去的码扫出来打不开，必须在生成前拦住。
const scanUrl = ref(null);
async function loadScanUrl() {
  try {
    const res = await customerApiCall.get('/trace/scan-url');
    scanUrl.value = { absolute: res.absolute === true, previewUrl: String(res.previewUrl || ''), hint: String(res.hint || ''), source: String(res.source || '') };
  } catch (e) {
    scanUrl.value = null;
  }
}
function openGen(row) {
  genDlg.row = row; genDlg.codetype = 1; genDlg.count = 100; genDlg.demo = 0; genDlg.format = ''; genDlg.lastGen = null;
  genDlg.visible = true;
  loadScanUrl();
}
async function confirmGen() {
  if (!genDlg.row) return;
  genSaving.value = true;
  try {
    const res = await customerApiCall.post(`/trace/batches/${genDlg.row.id}/generate-codes`, {
      codetype: genDlg.codetype,
      codeno: Number(genDlg.count || 1),
      demo: genDlg.demo ? 1 : 0,
      format: genDlg.format || '',
    });
    // 🔴 不关弹窗、留住产物：让「下载此批」能下载这同一批，而不是重新生成
    genDlg.lastGen = { content: res.content, contentType: res.contentType, filename: res.filename, created: res.created, demo: Boolean(res.demo), encoding: res.encoding || '' };
    ElMessage.success(`已生成 ${res.created ?? 0} 个${res.demo ? '试印·演示' : ''}防伪码，可点「下载此批」获取同一批`);
  } catch (e) {
    ElMessage.error(e || '生成失败');
  } finally { genSaving.value = false; }
}
/**
 * 保存产物到本地。
 * 🔴 encoding='base64' 是 ZIP 通道：JSON 里传二进制只能靠 base64，
 *    少了这一步会把 base64 文本当文件内容存下来 → 下载到的 zip 打不开。
 */
function saveBlob(content, contentType, filename, encoding) {
  const isBase64 = encoding === 'base64';
  const blob = isBase64
    ? new Blob([base64ToBytes(String(content ?? ''))], { type: contentType || 'application/zip' })
    : new Blob([String(content ?? '')], { type: contentType || 'text/plain; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `trace-${genDlg.row?.batch || ''}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** base64 → Uint8Array（ZIP 通道专用；atob 在部分环境缺失，自己解不依赖它） */
function base64ToBytes(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e0 = chars.indexOf(clean[i]);
    const e1 = chars.indexOf(clean[i + 1]);
    const e2 = chars.indexOf(clean[i + 2]);
    const e3 = chars.indexOf(clean[i + 3]);
    if (p < bytes.length) bytes[p++] = (e0 << 2) | (e1 >> 4);
    if (e2 >= 0 && p < bytes.length) bytes[p++] = ((e1 & 15) << 4) | (e2 >> 2);
    if (e3 >= 0 && p < bytes.length) bytes[p++] = ((e2 & 3) << 6) | e3;
  }
  return bytes;
}
// 下载「生成」按钮刚产出的同一批（内容已在 lastGen，不二次生成）
function downloadLastGen() {
  if (!genDlg.lastGen) return;
  saveBlob(genDlg.lastGen.content, genDlg.lastGen.contentType, genDlg.lastGen.filename, genDlg.lastGen.encoding);
  ElMessage.success(`已下载 ${genDlg.lastGen.created ?? 0} 个防伪码（与刚生成的是同一批）`);
}
/**
 * 🔴 生成并下载 = 单次生成 + 当场落盘同一批。只调一次 generate-codes，
 *    拿返回 content 直接下载 —— 不复用 /export（那会是第二次独立生成，得到不同流水号的另一批）。
 *    数量与码型全部取自弹窗（genDlg.count / genDlg.codetype），不再写死 100。
 */
async function confirmDownload() {
  if (!genDlg.row) return;
  genSaving.value = true;
  try {
    const res = await customerApiCall.post(`/trace/batches/${genDlg.row.id}/generate-codes`, {
      codetype: genDlg.codetype,
      codeno: Number(genDlg.count || 1),
      demo: genDlg.demo ? 1 : 0,
      format: genDlg.format || '',
    });
    saveBlob(res.content, res.contentType, res.filename, res.encoding);
    genDlg.lastGen = { content: res.content, contentType: res.contentType, filename: res.filename, created: res.created, demo: Boolean(res.demo), encoding: res.encoding || '' };
    ElMessage.success(`已生成并下载 ${res.created ?? 0} 个${res.demo ? '试印·演示' : ''}防伪码（同一批）`);
    genDlg.visible = false;
    loadBatches();
  } catch (e) {
    ElMessage.error(e || '生成并下载失败');
  } finally { genSaving.value = false; }
}

/* ----------------- 防伪码记录 ----------------- */
const codeQuery = reactive({ page: 1, pageSize: 20, code: '' });
const codeList = ref([]);
const codeTotal = ref(0);
const codeLoading = ref(false);
async function loadCodes() {
  codeLoading.value = true;
  try {
    const params = { page: codeQuery.page, pageSize: codeQuery.pageSize };
    if (codeQuery.code) params.code = codeQuery.code;
    const res = await customerApiCall.get('/trace/codes', { params });
    codeList.value = res.list || [];
    codeTotal.value = Number(res.total || 0);
  } catch (e) {
    ElMessage.error(e || '加载防伪码失败');
  } finally { codeLoading.value = false; }
}
async function markError(row) {
  try {
    await customerApiCall.post(`/trace/codes/${row.id}/mark-error`, { reason: '' });
    ElMessage.success('已标记为异常');
    loadCodes();
  } catch (e) { ElMessage.error(e || '标记失败'); }
}

/* ----------------- 公众号带参二维码（G1：后台出码入口） ----------------- */
// 🔴 之前后端有接口、后台**没有入口** → 商家无法自助出带参码，该能力等于不存在。
//    出码对象是**任意防伪码**（含尚未被扫码的码）：trace_codes 表只记录被扫过的码，
//    所以弹窗允许手输码值，不依赖列表。
const mpQrDlg = reactive({ visible: false, code: '', result: null });
const mpQrSaving = ref(false);
function openMpQr(code) {
  mpQrDlg.code = String(code || '').trim().toUpperCase();
  mpQrDlg.result = null;
  mpQrDlg.visible = true;
  loadMpQrCapability();
}
async function confirmMpQr() {
  const code = String(mpQrDlg.code || '').trim().toUpperCase();
  if (!code) { ElMessage.warning('请输入防伪码'); return; }
  mpQrSaving.value = true;
  try {
    const res = await customerApiCall.post(`/trace/codes/${encodeURIComponent(code)}/mp-qr`, { code });
    // 🔴 图片走服务端代理（同源）：微信图片站有防盗链，前端直连大概率显示空白。
    const imgUrl = `/api/customer/trace/mp-qr/image?ticket=${encodeURIComponent(res.ticket)}&code=${encodeURIComponent(res.code)}`;
    mpQrDlg.result = { ticket: res.ticket, showUrl: res.showUrl, code: res.code, imgUrl };
    ElMessage.success('已生成公众号带参二维码');
  } catch (e) {
    // 🔴 48001 的中文提示由服务端给出 → 这里直接透传，不二次包装（避免丢掉可操作建议）
    ElMessage.error(typeof e === 'string' ? e : (e?.message || '生成失败'));
  } finally { mpQrSaving.value = false; }
}
function downloadMpQr() {
  const r = mpQrDlg.result;
  if (!r?.imgUrl) return;
  const a = document.createElement('a');
  a.href = r.imgUrl;
  a.download = `mpqr_${r.code}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ----------------- 码制配置 ----------------- */
const ruleForm = reactive({ m1: 'FW', m2: 7, m3: 6, m4: 5, m5: 20, k1: '', k2: '', k3: '', k4: '', k5: '', zdl: 10 });
const ruleSaving = ref(false);
const kRandomizing = ref(0);
// 🔴 P0 印刷锁定态：服务端 locked=true 时禁用结构与密钥输入。
const ruleLocked = ref(false);
const ruleLockedAt = ref('');
// 🔴 服务端时间统一是 UTC（datetime('now')）→ 解析必须补 'Z'，否则本地时区差 8 小时。
const ruleLockedAtText = computed(() => {
  const raw = String(ruleLockedAt.value || '').trim();
  if (!raw) return '此前';
  const t = new Date(raw.replace(' ', 'T') + 'Z');
  return Number.isNaN(t.getTime()) ? raw : t.toLocaleString('zh-CN');
});
// 🔴 码长自洽校验：前缀长度 + m2 + m3 + m4 必须等于 m5，否则生成的码会被截断撞码
const ruleSelfCheck = computed(() => {
  const expect = String(ruleForm.m1 || '').length + Number(ruleForm.m2) + Number(ruleForm.m3) + Number(ruleForm.m4);
  if (expect !== Number(ruleForm.m5)) {
    return `码长不自洽：前缀(${String(ruleForm.m1 || '').length}) + 批次号(${ruleForm.m2}) + 流水号(${ruleForm.m3}) + 校验位(${ruleForm.m4}) = ${expect}，必须等于总长 ${ruleForm.m5}`;
  }
  if ([ruleForm.k1, ruleForm.k2, ruleForm.k3, ruleForm.k4].some((k) => String(k || '').length !== 10)) {
    return '校验字符集 k1~k4 必须为 10 位';
  }
  return '';
});
async function loadRule() {
  try {
    const res = await customerApiCall.get('/trace/code-rule');
    const r = res.rule || {};
    const m = r.m || {};
    const k = r.k || {};
    ruleLocked.value = res.locked === true;
    ruleLockedAt.value = String(res.lockedAt || '');
    ruleForm.m1 = String(m[1] || 'FW');
    ruleForm.m2 = Number(m[2] || 7);
    ruleForm.m3 = Number(m[3] || 6);
    ruleForm.m4 = Number(m[4] || 5);
    ruleForm.m5 = Number(m[5] || 20);
    ruleForm.k1 = String(k[1] || '');
    ruleForm.k2 = String(k[2] || '');
    ruleForm.k3 = String(k[3] || '');
    ruleForm.k4 = String(k[4] || '');
    // 🔴 k5 是服务端保留位（1 位，参与算法但不可由租户改），只读展示 + 备份下载用。
    //    这里只取展示值，落库时随 k1~k4 一起回传，后端 saveRule 会原样保住它。
    ruleForm.k5 = String(k[5] || '7');
    ruleForm.zdl = Number(r.zdl || 10);
  } catch (e) { ElMessage.error(e || '加载码制失败'); }
}
/**
 * 随机填充单个校验字符集 k1~k4。
 * 🔴 随机串必须向服务端取（/trace/code-rule/random-keys），不许在前端本地生成：
 *    ① 密钥随机源单一出处，前端抄一份就是两端漂移；
 *    ② 这些是防伪密钥，前端 Math.random 强度不够，服务端用的是 crypto.randomInt。
 * 🔴 只填表单、**不落库**：换掉租户正在用的 k 会让已印出去的码全部验真失败，
 *    落库必须由用户点「保存码制」显式确认。
 */
async function randomizeKey(n) {
  kRandomizing.value = n;
  try {
    const res = await customerApiCall.get('/trace/code-rule/random-keys');
    const v = String(res?.[`k${n}`] || '');
    if (v.length !== 10) throw new Error('随机字符集返回异常');
    ruleForm[`k${n}`] = v;
  } catch (e) {
    ElMessage.error(e || '随机字符集生成失败');
  } finally {
    kRandomizing.value = 0;
  }
}

async function saveRule() {
  if (ruleSelfCheck.value) { ElMessage.warning(ruleSelfCheck.value); return; }
  ruleSaving.value = true;
  try {
    // 🔴 后端 saveRule 接收扁平字段（m1..m5, k1..k4, zdl），不是整包 rule 对象
    await customerApiCall.put('/trace/code-rule', {
      m1: ruleForm.m1, m2: ruleForm.m2, m3: ruleForm.m3, m4: ruleForm.m4, m5: ruleForm.m5,
      k1: ruleForm.k1, k2: ruleForm.k2, k3: ruleForm.k3, k4: ruleForm.k4, k5: ruleForm.k5, zdl: ruleForm.zdl,
    });
    ElMessage.success('码制已保存');
    // 保存即确认 → 批次管理的软引导当场消失，不用刷新页面
    ruleConfirmed.value = true;
  } catch (e) {
    ElMessage.error(e || '保存码制失败');
  } finally { ruleSaving.value = false; }
}

/* ----------------- 码制配置下载备份 ----------------- */
const downloadPreparing = ref(false);
const downloadDlg = reactive({ visible: false, mode: 'encrypted', password: '', confirmPwd: '' });

/** 拼出明文备份内容（独立于加密逻辑，便于单测与回读还原共用）。 */
function buildBackupText() {
  const f = ruleForm;
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return [
    '防伪码制配置备份',
    `生成时间: ${ts}`,
    `前缀 m1: ${f.m1}`,
    `批次号长度 m2: ${f.m2}`,
    `流水号长度 m3: ${f.m3}`,
    `校验位长度 m4: ${f.m4}`,
    `防伪码总长 m5: ${f.m5}`,
    `错误次数上限 zdl: ${f.zdl}`,
    `系统保留位 k5: ${f.k5}（不可修改）`,
    `校验字符集 k1: ${f.k1}`,
    `校验字符集 k2: ${f.k2}`,
    `校验字符集 k3: ${f.k3}`,
    `校验字符集 k4: ${f.k4}`,
    '【警告】本文件含防伪密钥，请勿通过微信 / 邮件 / 云盘明文传输，泄露可被用于伪造防伪码。',
  ].join('\n');
}

function triggerDownload(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 🔴 浏览器原生 Web Crypto 加密（AES-GCM + PBKDF2），不引第三方库。
 * 输出格式：TRACEBCK1:<b64(salt)>.<b64(iv)>.<b64(ct)>，便于将来做回读还原时识别。
 * 明文被 AES-GCM 整体加密，无密码不可恢复。
 */
async function encryptBackup(text, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  return `TRACEBCK1:${b64(salt)}.${b64(iv)}.${b64(ct)}`;
}

function openDownload() {
  downloadDlg.visible = true;
  downloadDlg.mode = 'encrypted';
  downloadDlg.password = '';
  downloadDlg.confirmPwd = '';
}

async function doDownload() {
  if (downloadDlg.mode === 'encrypted') {
    if (downloadDlg.password.length < 6) { ElMessage.warning('加密密码至少 6 位'); return; }
    if (downloadDlg.password !== downloadDlg.confirmPwd) { ElMessage.warning('两次密码不一致'); return; }
  }
  downloadPreparing.value = true;
  try {
    const text = buildBackupText();
    const stamp = new Date().toISOString().slice(0, 10);
    if (downloadDlg.mode === 'encrypted') {
      const enc = await encryptBackup(text, downloadDlg.password);
      triggerDownload(`trace-code-rule-${stamp}.txt`, enc);
    } else {
      triggerDownload(`trace-code-rule-${stamp}.txt`, text);
    }
    ElMessage.success('已下载码制配置备份');
    downloadDlg.visible = false;
  } catch (e) {
    ElMessage.error(e || '下载失败');
  } finally {
    downloadPreparing.value = false;
  }
}

/* ----------------- 系统设置（多 Tab 共享的单一事实来源 s） ----------------- */
// 🔴 s 为 settings 单一事实来源；常用字段直接 v-model 到 s.xxx，高级模式编辑原始 JSON。
//    后端 settings 是泛型 JSON 列（saveSettings 整体 JSON.stringify 落库），新增字段无需改后端。
// ⚠️ 部分开关/文案当前仅落库、后端消费逻辑待后续批次接入（已在界面对应位置标注），避免建成「空头入口」假象。
const s = reactive({
  // 文案（商品模式 + 活动模式变体 + 关注回复）
  welcome: '', welcome1: '', welcometxt: '', welcometxt1: '',
  suc_one: '', suc_two: '', suc_three: '',
  suc_one1: '', suc_two1: '', suc_three1: '',
  con_msg: '', con_msg1: '', myone: '', mytwo: '',
  // 功能开关 + 限额
  upperlimit: 0, history_limit: 10, siteroot: '',
  ishistory: 0, isint: 0, islink: 0, isjihuo: 0, ischuanhuo: 0,
  xiguang: 0, istixe: 0, isccode: 0, isapi: 0, isluck: 0,
  // 企业/联系
  factory: '', ftel: '', dtel: '', kuaidi: '', link: '',
  logo: '', banner: '', website: '', profile: '', cardlink: '', lurulink: '',
  // 快捷
  ttx_yd: '生产批号', ttx_sy: '',
  // 红包（配置占位，待接入租户微信支付凭据）
  isred: 0, redtype: 0, redwishing: '', rednotx: '', redremark: '', redlink: '', redbufa: 0,
  // 首页展示位
  displaySlots: [],
  // 扫码查询方案（服务端白名单归一化后的档位）+ 公众号内回复验真
  scanMode: 'web', wxReply: 1,
  // 🔴 P3 全局活动广告位（独立字段，不复用首页展示位；服务端按 [FWM]/[KEY] 替换后下发）
  activity: { enabled: false, cover: '', title: '', link: '', linkKey: '', when: 0 },
});
// 🔴 服务端下发的方案视图（三档标签/说明/可用性），本页不自带一份副本 ——
//    否则「界面显示能用、服务端根本不支持」的空开关又会重演。
const scanQuery = ref({ current: 'web', options: [] });
const currentMode = computed(() => (scanQuery.value.options || []).find((o) => o.value === s.scanMode) || null);
// 🔴 批次编辑弹窗里的「已冻结模式」展示：把批次记录的 print_scan_mode 翻成中文。
const BATCH_MODE_LABELS = { web: '网页验真', push_dynamic: '网页 + 公众号推送', push_permanent: '公众号直推（小批量）' };
const batchFrozenLabel = computed(() => BATCH_MODE_LABELS[String(batchDlg.form.printScanMode || '')] || '');
const advancedMode = ref(false);

/* ----------------- 首页展示位 ----------------- */
/**
 * 展示位数量上限。
 * 🔴 依据：当前公众号「上传图文消息素材」接口限制一个图文消息支持 1 到 8 条图文，
 *   每条自带缩略图 + 标题 + 原文链接 —— 与展示位逐项对映。
 *   （对标系统的固定 10 位对应的是较早的接口口径，已超出当前上限，不跟。）
 */
const SLOT_MAX = 8;
const SLOT_WHEN_OPTIONS = [
  { value: 0, label: '关闭（不显示）' },
  { value: 1, label: '全部查询都显示' },
  { value: 2, label: '仅首次查询显示' },
  { value: 5, label: '首位查询人每次显示' },
  { value: 4, label: '非首位查询人显示' },
];
const EMPTY_SLOT = () => ({ when: 1, title: '', cover: '', link: '', accessKey: '' });

/**
 * 服务端下发的展示位 → 表单形状。
 * 🔴 服务端剥掉了 keyCipher 只给脱敏的 accessKey，这里补成空串避免 undefined 进输入框。
 */
function slotsForForm(list) {
  return (Array.isArray(list) ? list : []).slice(0, SLOT_MAX).map((it) => ({
    when: Number(it.when) || 0,
    title: String(it.title || ''),
    cover: String(it.cover || ''),
    link: String(it.link || ''),
    accessKey: String(it.accessKey || ''),
  }));
}
function addSlot() {
  if (s.displaySlots.length >= SLOT_MAX) { ElMessage.warning(`展示位最多 ${SLOT_MAX} 个`); return; }
  s.displaySlots.push(EMPTY_SLOT());
}
function removeSlot(i) { s.displaySlots.splice(i, 1); }
function moveSlot(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= s.displaySlots.length) return;
  const a = s.displaySlots;
  const tmp = a[i];
  a[i] = a[j];
  a[j] = tmp;
}
// 封面图走系统素材选择器（MaterialPicker），与全站其他上传入口一致
const coverPicker = reactive({ show: false, idx: -1 });
function openCoverPicker(i) {
  coverPicker.idx = i;
  coverPicker.show = true;
}
function onPickCover(url) {
  const i = coverPicker.idx;
  if (i < 0 || i >= s.displaySlots.length) return;
  s.displaySlots[i].cover = url;
  coverPicker.show = false;
}
// 🔴 P3 活动广告位封面：复用系统素材选择器
const activityCoverPicker = reactive({ show: false });
function openActivityCover() { activityCoverPicker.show = true; }
function onPickActivityCover(url) {
  if (url) s.activity.cover = url;
  activityCoverPicker.show = false;
}

const rawJson = ref('');
const rawError = ref('');
const setSaving = ref(false);
const cocom = ref(0);

/**
 * 活动广告位的表单形状。
 * 🔴 activity 是**对象字段**：不能整体覆盖 s.activity（库里存了 null / 残缺对象时，
 *    模板里读 s.activity.enabled 会直接抛 "Cannot read properties of null" → 整个设置页白屏）。
 *    所以统一走「默认值 ⊕ 已存字段」的合并。
 */
const EMPTY_ACTIVITY = () => ({ enabled: false, cover: '', title: '', link: '', linkKey: '', when: 0 });
function activityForForm(raw) {
  return { ...EMPTY_ACTIVITY(), ...(raw && typeof raw === 'object' ? raw : {}) };
}

function syncFormFromSettings(settings) {
  const src = settings || {};
  for (const key of Object.keys(s)) {
    // 🔴 展示位单独走 slotsForForm：要补默认值（accessKey 脱敏回填等）
    if (key === 'displaySlots') continue;
    // 🔴 活动位同理：合并而非覆盖（避免库里 null/残缺对象把设置页搞崩）
    if (key === 'activity') continue;
    if (src[key] !== undefined && src[key] !== null) s[key] = src[key];
  }
  s.displaySlots = slotsForForm(src.displaySlots);
  s.activity = activityForForm(src.activity);
  // 高级模式原本是空的（读不到当前配置，只能盲打）→ 回填一次，编辑才有意义
  rawJson.value = JSON.stringify(s, null, 2);
}
/**
 * 服务端归一化后的档位回填到表单。
 * 🔴 必须以服务端为准：库里可能存着早期写入的脏值（或已被 normalizeScanMode 回落），
 *    直接用 s.scanMode 会把脏值当真相继续显示。
 */
function syncFromScanQuery() {
  if (scanQuery.value?.current) s.scanMode = scanQuery.value.current;
  if (scanQuery.value?.replyEnabled !== undefined) s.wxReply = Number(scanQuery.value.replyEnabled) || 0;
}
async function loadSettings() {
  try {
    const res = await customerApiCall.get('/trace/settings');
    cocom.value = Number(res.cocom ?? 0);
    // 🔴 方案视图在 **res.settings.scanQuery** 里（GET /settings 返回的是 { settings: {...}, cocom }，
    //    没有顶层 scanQuery）。读错层级 = 三档全部渲染不出来（变成一个只有 label 的空壳）。
    scanQuery.value = (res.settings && res.settings.scanQuery) || { current: 'web', options: [] };
    syncFromScanQuery();
    syncFormFromSettings(res.settings || {});
  } catch (e) { ElMessage.error(e || '加载设置失败'); }
}
function onRawInput(val) {
  try {
    const parsed = JSON.parse(val);
    Object.keys(s).forEach((k) => {
      if (parsed[k] === undefined) return;
      // 🔴 活动位必须合并（raw JSON 里手写成 null 会让模板读 s.activity.enabled 直接炸）
      s[k] = k === 'displaySlots' ? slotsForForm(parsed[k]) : (k === 'activity' ? activityForForm(parsed[k]) : parsed[k]);
    });
    rawError.value = '';
  } catch (err) {
    rawError.value = err.message;
  }
}
async function saveSettings() {
  if (advancedMode.value && rawError.value) { ElMessage.warning('高级设置 JSON 解析失败，请修正后再保存'); return; }
  if (s.displaySlots.length > SLOT_MAX) { ElMessage.warning(`展示位最多 ${SLOT_MAX} 个，请删除多余项后再保存`); return; }
  setSaving.value = true;
  try {
    // 🔴 后端 PUT /settings 接收 { settings }，settings 为对象（非字符串）
    const payload = {
      ...s,
      displaySlots: (s.displaySlots || []).map((it) => ({
        when: it.when,
        title: it.title,
        cover: it.cover,
        link: it.link,
        accessKey: it.accessKey,
      })),
    };
    await customerApiCall.put('/trace/settings', { settings: payload });
    // 🔴 保存后必须回读：接口密钥提交的是明文、库里存的是密文，回读才能让输入框
    //    显示成脱敏串 —— 否则用户以为「明文保存成功了」，其实界面和库里是两套东西。
    await loadSettings();
    ElMessage.success('设置已保存');
  } catch (e) {
    ElMessage.error(e || '保存设置失败');
  } finally { setSaving.value = false; }
}

/* ----------------- 数据统计 / 查询历史 / 错误码 / 商城集成（C 类 7 项出面，P0-4） -----------------
 * 后端路由均已存在（stats×3 / histories / wrong-attempts / shop-integration / batches/:id/activate），
 * 本段只补后台 UI 入口，不新增任何后端契约。
 */
const stat = reactive({ totalQueries: 0, totalCodes: 0, errorCodes: 0, batches: 0 });
const regionLevel = ref('province');
const regionList = ref([]);
const trendList = ref([]);
async function loadStatsSummary() {
  try {
    const r = await customerApiCall.get('/trace/stats/summary');
    stat.totalQueries = Number(r.totalQueries || 0);
    stat.totalCodes = Number(r.totalCodes || 0);
    stat.errorCodes = Number(r.errorCodes || 0);
    stat.batches = Number(r.batches || 0);
  } catch (e) { ElMessage.error(e || '加载统计失败'); }
}
async function loadStatsRegion() {
  try {
    const r = await customerApiCall.get('/trace/stats/region', { params: { level: regionLevel.value } });
    regionList.value = r.list || [];
  } catch (e) { ElMessage.error(e || '加载地域分布失败'); }
}
async function loadStatsTrend() {
  try {
    const r = await customerApiCall.get('/trace/stats/trend');
    trendList.value = r.list || [];
  } catch (e) { ElMessage.error(e || '加载趋势失败'); }
}
async function loadStats() {
  await Promise.all([loadStatsSummary(), loadStatsRegion(), loadStatsTrend()]);
}

/* —— 数据魔方报表中心：纯 CSS/SVG 可视化（无第三方图表依赖）—— */
const regionBars = computed(() => {
  const list = (regionList.value || []).slice(0, 12);
  const max = Math.max(1, ...list.map(d => Number(d.value || 0)));
  return list.map(d => {
    const v = Number(d.value || 0);
    return { name: d.name, value: v, pct: Math.round((v / max) * 100) };
  });
});
const healthyCount = computed(() => Math.max(0, stat.totalQueries - stat.errorCodes));
const donutStyle = computed(() => {
  const ok = healthyCount.value, bad = stat.errorCodes, total = ok + bad;
  if (!total) return { background: 'conic-gradient(#e5e6eb 0% 100%)' };
  const okPct = ((ok / total) * 100).toFixed(1);
  return { background: `conic-gradient(#00b42a 0% ${okPct}%, #f53f3f ${okPct}% 100%)` };
});

const TPAD = { l: 36, r: 12, t: 16, b: 24 };
const TREND_W = 600, TREND_H = 220;
const trendGeom = computed(() => {
  const list = trendList.value || [];
  if (!list.length) return { line: '', area: '', max: 0, points: [] };
  const vals = list.map(d => Number(d.value || 0));
  const max = Math.max(1, ...vals);
  const n = list.length;
  const innerW = TREND_W - TPAD.l - TPAD.r;
  const innerH = TREND_H - TPAD.t - TPAD.b;
  const points = list.map((d, i) => {
    const x = TPAD.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = TPAD.t + innerH - (Number(d.value || 0) / max) * innerH;
    return { x, y, name: d.name, value: Number(d.value || 0) };
  });
  const line = points.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
  const last = points[points.length - 1], first = points[0];
  const area = line + ` L ${last.x.toFixed(1)} ${(TPAD.t + innerH).toFixed(1)} L ${first.x.toFixed(1)} ${(TPAD.t + innerH).toFixed(1)} Z`;
  return { line, area, max, points };
});

const histQuery = reactive({ page: 1, pageSize: 20, summary: '', type: -1 });
const histList = ref([]);
const histTotal = ref(0);
const histLoading = ref(false);
async function loadHistories() {
  histLoading.value = true;
  try {
    const params = { page: histQuery.page, pageSize: histQuery.pageSize };
    if (histQuery.summary) params.summary = histQuery.summary;
    if (histQuery.type >= 0) params.type = histQuery.type;
    const r = await customerApiCall.get('/trace/histories', { params });
    histList.value = r.list || [];
    histTotal.value = Number(r.total || 0);
  } catch (e) { ElMessage.error(e || '加载历史失败'); }
  finally { histLoading.value = false; }
}

const wrongQuery = reactive({ page: 1, pageSize: 20 });
const wrongList = ref([]);
const wrongTotal = ref(0);
const wrongLoading = ref(false);
async function loadWrong() {
  wrongLoading.value = true;
  try {
    const r = await customerApiCall.get('/trace/wrong-attempts', { params: { page: wrongQuery.page, pageSize: wrongQuery.pageSize } });
    wrongList.value = r.list || [];
    wrongTotal.value = Number(r.total || 0);
  } catch (e) { ElMessage.error(e || '加载错误码失败'); }
  finally { wrongLoading.value = false; }
}

const shopSources = ref([]);
async function loadShop() {
  try {
    const r = await customerApiCall.get('/trace/shop-integration');
    shopSources.value = r.sources || [];
    if (r.current !== undefined) s.isint = Number(r.current || 0);
  } catch (e) { ElMessage.error(e || '加载商城集成失败'); }
}

async function activateBatch(row) {
  try {
    await ElMessageBox.confirm(`确认激活批次「${row.batch}」吗？`, '激活批次', { type: 'warning' });
  } catch { return; }
  try {
    await customerApiCall.post(`/trace/batches/${row.id}/activate`);
    ElMessage.success('批次已启用');
    loadBatches();
  } catch (e) { ElMessage.error(e || '激活失败'); }
}

onMounted(() => {
  loadBatches();
  loadCodes();
  loadSettings();
  loadRule();
  loadMpQrCapability();
});
</script>

<style scoped>
.hd-actions { display: flex; align-items: center; gap: 12px; }
.cocom-hint { font-size: 12px; color: #a9aeb8; }
.card-tabs {
  display: flex; gap: 8px; background: #fff; border-radius: 8px; padding: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04); overflow-x: auto; margin-bottom: 16px;
}
/* 🔴 设置子 Tab 视觉降一级，避免与一级 Tab 等高造成层级混乱 */
.sub-tabs { background: #f7f8fa; box-shadow: none; padding: 6px; margin-bottom: 12px; }
.ctab {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 8px;
  font-size: 14px; color: #4e5969; cursor: pointer; white-space: nowrap; transition: all 0.2s;
}
.ctab:hover { background: #f2f3f5; color: #1d2129; }
.ctab.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.trace-content { min-height: 400px; }
.set-content { min-height: 300px; }
.filter-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.list-total { font-size: 13px; color: #86909c; }
.w260 { width: 260px; } .w200 { width: 200px; } .w240 { width: 240px; }
.mt12 { margin-top: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.set-card { margin-bottom: 16px; }
.card-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.form-hint { font-size: 12px; color: #86909c; margin-left: 8px; }
.form-hint-amber { color: #d48806; }
/* 🔴 扫码地址提示：印在包装上的码扫出来打开什么 → 生成前必须让商家看到（URL 配错=印完才发现的全废事故） */
.scan-url-box { font-size: 12px; line-height: 1.6; }
.scan-url-box.is-warn { color: #f53f3f; }
.scan-url-ok { display: flex; align-items: flex-start; gap: 6px; color: #07c160; word-break: break-all; }
.scan-url-bad { display: flex; align-items: flex-start; gap: 6px; color: #f53f3f; }
/* 🔴 公众号带参码出码结果区 */
.mp-qr-result { margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e6eb; }
.mp-qr-title { font-size: 13px; color: #4e5969; margin-bottom: 10px; }
.mp-qr-img { width: 180px; height: 180px; display: block; border: 1px solid #e5e6eb; border-radius: 4px; }
.mp-qr-links { margin: 10px 0; font-size: 12px; color: #4e5969; line-height: 1.8; word-break: break-all; }
.mp-qr-links code { background: #f7f8fa; padding: 1px 4px; border-radius: 3px; }
.guide-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.guide-row span { font-size: 13px; line-height: 1.6; }
.guide-row b { color: #d9821b; }
.raw-json { font-family: monospace; }
.raw-err { color: #f53f3f; font-size: 12px; margin-top: 4px; }
.rule-form :deep(.el-input-number), .set-form :deep(.el-input-number) { width: 160px; }
.set-savebar { display: flex; align-items: center; gap: 12px; margin: 8px 0 20px; }

/* 首页展示位编辑器 */
.slot-head { display: flex; align-items: center; gap: 10px; }
.slot-item { border: 1px solid #e5e6eb; border-radius: 8px; padding: 12px 16px 0; margin-bottom: 12px; background: #fafbfc; }
.slot-item-hd { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.slot-idx { font-size: 13px; font-weight: 600; color: #1d2129; }
.slot-ops { margin-left: auto; display: flex; gap: 4px; }
.slot-cover-pick { display: inline-block; cursor: pointer; }
.slot-thumb { width: 90px; height: 68px; object-fit: cover; border-radius: 6px; display: block; border: 1px solid #e5e6eb; }
.slot-add {
  width: 90px; height: 68px; line-height: 68px; text-align: center; cursor: pointer;
  border: 1px dashed #c9cdd4; border-radius: 6px; color: #86909c; font-size: 13px; background: #fff;
}
.slot-add:hover { border-color: #165dff; color: #165dff; }
.slot-in { width: 420px; max-width: 100%; }
.slot-when { width: 260px; }
.slot-foot { display: flex; align-items: center; gap: 12px; }

/* 数据统计 */
.stat-cards { margin-bottom: 4px; }
.stat-card { text-align: center; }
.stat-card .stat-num { font-size: 28px; font-weight: 700; color: #165dff; line-height: 1.2; }
.stat-card .stat-label { font-size: 13px; color: #86909c; margin-top: 4px; }

/* 数据魔方图表（CSS/SVG，无图表库依赖） */
.bar-chart { max-height: 320px; overflow-y: auto; padding-right: 4px; }
.bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.bar-label { width: 84px; flex-shrink: 0; color: #4e5969; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { flex: 1; height: 14px; background: #f2f3f5; border-radius: 7px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, #4080ff, #165dff); border-radius: 7px; transition: width .4s ease; }
.bar-val { width: 54px; text-align: right; color: #1d2129; font-variant-numeric: tabular-nums; }
.chart-empty { padding: 40px 0; text-align: center; color: #86909c; font-size: 12px; }
.donut-wrap { display: flex; align-items: center; gap: 24px; padding: 10px 0; }
.donut { width: 120px; height: 120px; border-radius: 50%; position: relative; flex-shrink: 0; }
.donut::after { content: ''; position: absolute; inset: 30px; background: #fff; border-radius: 50%; }
.donut-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 600; color: #1d2129; z-index: 1; }
.donut-legend { font-size: 13px; color: #4e5969; line-height: 2.2; }
.donut-legend b { color: #1d2129; }
.donut-legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.dot.ok { background: #00b42a; } .dot.bad { background: #f53f3f; }
.trend-svg { width: 100%; height: 220px; display: block; }
.trend-line { fill: none; stroke: #165dff; stroke-width: 2; vector-effect: non-scaling-stroke; }
.trend-area { fill: rgba(22, 93, 255, 0.12); }
.trend-axis { display: flex; justify-content: space-between; margin-top: 4px; color: #86909c; font-size: 12px; }

/* 使用说明 */
.help-body h4 { margin: 14px 0 4px; font-size: 14px; color: #1d2129; }
.help-body h4:first-child { margin-top: 0; }
.help-body p { color: #4e5969; line-height: 1.7; margin: 0 0 8px; }

/* 扫码查询方案：一档一卡，把「印什么」与「缺什么」直接写在选项里 */
.scan-mode-group { display: block; width: 100%; }
.scan-mode-radio { display: flex; width: 100%; height: auto; margin-right: 0; padding: 10px 0; align-items: flex-start; }
.scan-mode-radio.is-disabled { opacity: 0.65; }
.scan-mode-title { font-size: 14px; color: #1d2129; font-weight: 600; line-height: 22px; }
.scan-mode-print { margin-left: 6px; font-size: 12px; font-weight: 400; color: #86909c; }
.scan-mode-desc { margin-top: 2px; color: #4e5969; font-size: 12px; line-height: 1.7; white-space: normal; }
.scan-mode-bad { margin-top: 4px; color: #f53f3f; font-size: 12px; }
.scan-mode-note { margin-top: 4px; color: #86909c; font-size: 12px; }
</style>
