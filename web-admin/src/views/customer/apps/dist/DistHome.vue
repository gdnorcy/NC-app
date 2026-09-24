<template>
  <div class="dist-home">
    <!-- 应用内 Tab：配置 / 分销商 / 佣金明细 / 溯源记录 / 钱包提现 / 数据大盘 -->
    <div class="card-tabs">
      <div v-for="t in tabs" :key="t.key" class="ctab" :class="{ active: activeTab === t.key }" @click="activeTab = t.key">
        <SIcon :name="t.icon" size="default" :color="activeTab === t.key ? '#165dff' : '#4e5969'" />
        <span>{{ t.label }}</span>
        <em v-if="t.key === 'wallet' && stats.withdrawPending > 0" class="tab-badge">{{ stats.withdrawPending }}</em>
      </div>
    </div>

    <!-- 配置 -->
    <section v-if="activeTab === 'config'">
      <AppPageHeader title="分销配置" desc="分销裂变全局配置（基础 / 关系 / 佣金 / 提现 / 显示 / 申请与协议）">
        <div class="hd-actions">
          <el-button type="primary" :loading="saving" @click="saveConfig">保存配置</el-button>
        </div>
      </AppPageHeader>
      <div class="cfg-layout">
        <!-- 左侧竖排分类导航（应用中心「功能分类」样式，无数量角标） -->
        <div class="cfg-side">
          <div v-for="cat in cfgCats" :key="cat.key" class="cfg-cat" :class="{ on: cfgCat === cat.key }" @click="cfgCat = cat.key">
            <SIcon :name="cat.icon" size="default" :color="cfgCat === cat.key ? '#165dff' : '#4e5969'" />
            <span>{{ cat.label }}</span>
          </div>
        </div>
        <!-- 右侧内容区 -->
        <el-card shadow="never" class="cfg-main">
          <el-form label-width="140px" label-position="right" class="cfg-form">

            <!-- ===== 基础设置 ===== -->
            <template v-if="cfgCat === 'base'">
              <el-form-item label="插件开关">
                <el-switch v-model="pluginOn" @change="onPluginChange" />
                <span class="form-tip">关闭后新订单不再产生佣金，历史收益与钱包保留</span>
              </el-form-item>
              <el-form-item label="分销商名称" required>
                <el-input v-model="cfg.distName" maxlength="32" placeholder="如：推广员" class="w320" />
                <span class="form-tip">C 端分销中心对推广用户的称呼</span>
              </el-form-item>
              <el-form-item label="下级名称">
                <el-input v-model="cfg.subName" maxlength="32" placeholder="如：下级" class="w320" />
                <span class="form-tip">C 端对下级的称呼</span>
              </el-form-item>
              <el-form-item label="默认等级">
                <el-input v-model="cfg.defaultLevel" maxlength="32" placeholder="不填即为「默认等级」" class="w320" />
                <span class="form-tip">分销商默认等级名称</span>
              </el-form-item>
              <el-form-item label="0元订单">
                <el-radio-group v-model="cfg.zeroOrder">
                  <el-radio :value="1">产生佣金</el-radio>
                  <el-radio :value="0">不产生佣金</el-radio>
                </el-radio-group>
                <span class="form-tip">订单在优惠券、积分等折扣下实付金额为 0 时是否计佣（当前分账按实付金额计算，0 元订单无佣金收益）</span>
              </el-form-item>
            </template>

            <!-- ===== 关系设置 ===== -->
            <template v-if="cfgCat === 'relation'">
              <el-form-item label="成为下线">
                <el-radio-group v-model="cfg.bindRule">
                  <el-radio :value="0">首次点击</el-radio>
                  <el-radio :value="1">首次下单</el-radio>
                  <el-radio :value="2">仅分销商海报</el-radio>
                </el-radio-group>
                <span class="form-tip">首次点击：扫码/点链接首次进入即绑定；首次下单：首次支付成功后绑定；仅分销商海报：仅通过推广二维码/海报进入才绑定</span>
              </el-form-item>
              <el-form-item label="成为分销商">
                <el-radio-group v-model="cfg.becomeRule">
                  <el-radio :value="0">无条件</el-radio>
                  <el-radio :value="1">申请即通过</el-radio>
                  <el-radio :value="2">申请需审核</el-radio>
                  <el-radio :value="3">总消费金额</el-radio>
                  <el-radio :value="4">购买商品</el-radio>
                  <el-radio :value="5">指定商品</el-radio>
                </el-radio-group>
                <span class="form-tip">无条件：所有人都是分销商；申请即通过/申请需审核：走申请制（自动通过/管理员审核）；购买指定商品下单支付完成即成为分销商</span>
              </el-form-item>
              <el-form-item v-if="cfg.becomeRule === 3" label="总消费金额" required>
                <el-input-number v-model="cfg.becomeAmount" :min="0" :step="100" />
                <span class="form-tip">元，累计实付达到该金额自动成为分销商</span>
              </el-form-item>
              <el-form-item v-if="cfg.becomeRule === 5" label="指定商品" required>
                <el-input v-model="cfg.becomeProducts" placeholder="商品名称，多个用英文逗号分隔" class="w480" />
                <span class="form-tip">购买以下任一商品（下单支付完成）即成为分销商</span>
              </el-form-item>
              <el-form-item label="分销内购">
                <el-switch v-model="cfg.isSelfBuy" />
                <span class="form-tip">开启后分销商自己购买商品，享受直推佣金，上级享受间推佣金</span>
              </el-form-item>
            </template>

            <!-- ===== 佣金结算 ===== -->
            <template v-if="cfgCat === 'commission'">
              <el-form-item label="一级佣金比例">
                <el-input-number v-model="cfg.ratio1" :min="0" :max="0.9" :step="0.05" :precision="2" />
                <span class="form-tip">一级下线付费订单的佣金比例</span>
              </el-form-item>
              <el-form-item v-if="cfg.isOpenLevel2" label="二级佣金比例">
                <el-input-number v-model="cfg.ratio2" :min="0" :max="0.9" :step="0.05" :precision="2" />
                <span class="form-tip">二级下线付费订单的佣金比例</span>
              </el-form-item>
              <el-form-item label="开启二级分销">
                <el-switch v-model="cfg.isOpenLevel2" />
              </el-form-item>
              <el-form-item label="佣金计算值">
                <el-radio-group v-model="cfg.calcType">
                  <el-radio :value="1">实付金额</el-radio>
                  <el-radio :value="2">商品利润</el-radio>
                </el-radio-group>
                <span class="form-tip">实付金额：商品实付金额（扣除积分/优惠券等）；商品利润：实付金额-商品成本价（当前订单无成本价概念，选择后按实付金额计佣）</span>
              </el-form-item>
              <el-form-item label="结算周期（T+N）">
                <el-input-number v-model="cfg.settleDay" :min="1" :max="90" />
                <span class="form-tip">订单完成后 N 天进入可提现余额</span>
              </el-form-item>
              <el-form-item label="订单总让利上限">
                <el-input-number v-model="cfg.maxTotalRatio" :min="0" :max="1" :step="0.05" :precision="2" />
                <span class="form-tip">佣金+分红总和不超过订单金额的比例，防止超支</span>
              </el-form-item>
            </template>

            <!-- ===== 提现设置 ===== -->
            <template v-if="cfgCat === 'withdraw'">
              <el-form-item label="最低提现金额">
                <el-input-number v-model="cfg.minWithdraw" :min="0" :step="10" />
                <span class="form-tip">元</span>
              </el-form-item>
              <el-form-item label="单次提现上限">
                <el-input-number v-model="cfg.maxWithdraw" :min="0" :step="100" />
                <span class="form-tip">元；0 表示不限</span>
              </el-form-item>
              <el-form-item label="提现手续费比例">
                <el-input-number v-model="cfg.withdrawFeeRate" :min="0" :max="1" :step="0.01" :precision="2" />
                <span class="form-tip">0~1（如 0.05 表示 5%）</span>
              </el-form-item>
            </template>

            <!-- ===== 显示设置 ===== -->
            <template v-if="cfgCat === 'display'">
              <el-form-item label="显示上级">
                <el-radio-group v-model="cfg.showParent">
                  <el-radio :value="1">启用</el-radio>
                  <el-radio :value="0">禁用</el-radio>
                </el-radio-group>
                <span class="form-tip">分销中心是否显示上级推荐人</span>
              </el-form-item>
              <el-form-item label="显示电话">
                <el-radio-group v-model="cfg.showPhone">
                  <el-radio :value="1">显示</el-radio>
                  <el-radio :value="0">隐藏</el-radio>
                </el-radio-group>
                <span class="form-tip">分销中心下级客户是否显示客户联系电话</span>
              </el-form-item>
              <el-form-item label="海报角标">
                <el-radio-group v-model="cfg.posterBadge">
                  <el-radio :value="1">显示</el-radio>
                  <el-radio :value="0">隐藏</el-radio>
                </el-radio-group>
                <span class="form-tip">分享海报左上角展示「分销商名称 + 等级」徽标</span>
              </el-form-item>
              <el-form-item label="申请页顶图">
                <el-input v-model="cfg.applyTopImg" placeholder="图片 URL（建议 710×280，≤100KB）" clearable class="w480">
                  <template #prepend>URL</template>
                </el-input>
                <div v-if="cfg.applyTopImg" class="img-preview"><el-image :src="cfg.applyTopImg" fit="cover" style="width:160px;height:64px;border-radius:6px" /></div>
                <span class="form-tip">C 端「申请成为分销商」页顶部展示图</span>
              </el-form-item>
              <el-form-item label="分销推广图">
                <el-input v-model="cfg.promoteImg" placeholder="图片 URL（建议 750×750 正方形，≤200KB）" clearable class="w480">
                  <template #prepend>URL</template>
                </el-input>
                <div v-if="cfg.promoteImg" class="img-preview"><el-image :src="cfg.promoteImg" fit="cover" style="width:64px;height:64px;border-radius:6px" /></div>
                <span class="form-tip">当前生效的海报背景；也可在下方模板库中多模板管理并设默认</span>
              </el-form-item>
              <el-form-item label="海报模板库">
                <div class="poster-lib">
                  <div v-for="(t, i) in cfg.posterTemplates" :key="t.id" class="poster-item" :class="{ on: cfg.promoteImg === t.url }">
                    <el-image :src="t.url" fit="cover" class="poster-thumb" />
                    <div class="poster-ops">
                      <el-button size="small" link type="primary" :disabled="cfg.promoteImg === t.url" @click="setDefaultPoster(t.url)">设默认</el-button>
                      <el-button size="small" link type="danger" @click="cfg.posterTemplates.splice(i, 1); if (cfg.promoteImg === t.url) cfg.promoteImg = ''">删除</el-button>
                    </div>
                  </div>
                  <div class="poster-add">
                    <el-input v-model="newPosterUrl" placeholder="新增模板图片 URL（750×750 推荐）" clearable class="w480" size="small" @keyup.enter="addPoster" />
                    <el-button size="small" type="primary" @click="addPoster">添加模板</el-button>
                  </div>
                </div>
                <span class="form-tip">保存后 C 端「生成海报」弹层可切换模板；未设默认时使用「分销推广图」</span>
              </el-form-item>
              <el-form-item label="分享标题">
                <el-input v-model="cfg.shareTitle" maxlength="64" placeholder="分享给客户时的标题文案" class="w480" />
              </el-form-item>
              <el-form-item label="分享图">
                <el-input v-model="cfg.shareImg" placeholder="图片 URL（建议 5:4，≤100KB）" clearable class="w480">
                  <template #prepend>URL</template>
                </el-input>
                <div v-if="cfg.shareImg" class="img-preview"><el-image :src="cfg.shareImg" fit="cover" style="width:120px;height:96px;border-radius:6px" /></div>
              </el-form-item>
            </template>

            <!-- ===== 申请与协议 ===== -->
            <template v-if="cfgCat === 'agreement'">
              <el-form-item label="申请页提示">
                <el-input v-model="cfg.applyTip" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="分销商的商品销售统一由厂家直接收款、直接发货…" class="w480" />
              </el-form-item>
              <el-form-item label="申请协议">
                <el-input v-model="cfg.applyAgreement" type="textarea" :rows="8" maxlength="20000" show-word-limit placeholder="C 端申请分销时需勾选的协议内容（支持 HTML 富文本）" class="w680" />
                <span class="form-tip">C 端申请页展示协议文本，勾选后才能提交申请</span>
              </el-form-item>
              <el-form-item label="分销须知">
                <el-input v-model="cfg.distNotice" type="textarea" :rows="8" maxlength="20000" show-word-limit placeholder="C 端分销中心「规则」弹窗展示的须知内容（支持 HTML 富文本，为空时显示默认规则）" class="w680" />
              </el-form-item>
            </template>

            <!-- ===== 等级设置 ===== -->
            <template v-if="cfgCat === 'level'">
              <div class="level-head">
                <div class="level-tip">按「累计收益（元）」或「直推人数」任一达标自动升级；海报角标与 C 端等级展示实时联动。</div>
                <el-button type="primary" size="small" @click="openLevelDialog()">新增等级</el-button>
              </div>
              <el-table :data="levels" v-loading="levelLoading" stripe class="level-table">
                <template #empty>
                  <el-empty description="暂无等级配置" :image-size="60" />
                </template>
                <el-table-column label="等级" width="90">
                  <template #default="{ row }">
                    <el-tag size="small" effect="plain">{{ row.level_no }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="name" label="等级名称" min-width="140" />
                <el-table-column label="累计收益门槛" width="160">
                  <template #default="{ row }">
                    <span>{{ row.min_total_income > 0 ? '¥' + (row.min_total_income / 100).toFixed(2) : '不设' }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="直推人数门槛" width="120">
                  <template #default="{ row }">
                    <span>{{ row.min_direct > 0 ? row.min_direct + ' 人' : '不设' }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="权益描述" min-width="220">
                  <template #default="{ row }">
                    <span class="text-muted ellipsis-l2">{{ row.benefits || '—' }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="130">
                  <template #default="{ row }">
                    <el-button link type="primary" size="small" @click="openLevelDialog(row)">编辑</el-button>
                    <el-button link type="danger" size="small" :disabled="levels.length <= 1" @click="removeLevel(row)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </template>

            <!-- ===== 消息通知（微信订阅消息） ===== -->
            <template v-if="cfgCat === 'notice'">
              <el-form-item label="订阅消息">
                <el-switch v-model="subForm.enabled" />
                <span class="form-tip">开启后提现审核/打款、收益结算将向用户微信发送订阅消息</span>
              </el-form-item>
              <el-form-item v-if="subForm.enabled" label="提现审核模板" required>
                <el-input v-model="subForm.tmplReview" placeholder="微信订阅消息模板 ID（审核通过/驳回共用）" class="w480" />
                <span class="form-tip">字段：thing1 结果 / amount2 金额 / thing3 状态 / date4 时间</span>
              </el-form-item>
              <el-form-item v-if="subForm.enabled" label="打款完成模板">
                <el-input v-model="subForm.tmplDone" placeholder="微信订阅消息模板 ID（打款完成）" class="w480" />
                <span class="form-tip">字段：thing1 内容 / amount2 金额 / thing3 流水号 / date4 时间</span>
              </el-form-item>
              <el-form-item v-if="subForm.enabled" label="结算到账模板">
                <el-input v-model="subForm.tmplSettle" placeholder="微信订阅消息模板 ID（收益结算到账）" class="w480" />
                <span class="form-tip">字段：thing1 内容 / amount2 金额 / thing3 说明 / date4 时间</span>
              </el-form-item>
              <el-form-item label=" ">
                <el-button type="primary" :loading="subSaving" @click="saveSubConfig">保存订阅配置</el-button>
                <span class="form-tip">模板字段名需在微信公众平台选用 thing1/amount2/thing3/date4 命名；未填模板 ID 的分类不发消息</span>
              </el-form-item>
            </template>

          </el-form>
        </el-card>
      </div>

      <!-- 等级编辑弹窗 -->
      <el-dialog v-model="levelDialog.show" :title="levelDialog.form.id ? '编辑等级' : '新增等级'" width="460px">
        <el-form label-width="120px" label-position="right">
          <el-form-item label="等级名称" required>
            <el-input v-model="levelDialog.form.name" maxlength="32" placeholder="如：白银推广员" />
          </el-form-item>
          <el-form-item label="等级序号" required>
            <el-input-number v-model="levelDialog.form.levelNo" :min="1" :max="99" />
            <span class="form-tip">数字越小等级越低（1 为默认等级）</span>
          </el-form-item>
          <el-form-item label="累计收益门槛">
            <el-input-number v-model="levelDialog.form.minTotalIncome" :min="0" :step="100" :precision="2" />
            <span class="form-tip">元；累计收益达到即升级（0 = 不设收益门槛）</span>
          </el-form-item>
          <el-form-item label="直推人数门槛">
            <el-input-number v-model="levelDialog.form.minDirect" :min="0" :step="1" />
            <span class="form-tip">直推人数达到即升级（0 = 不设人数门槛）；任一达标即升级</span>
          </el-form-item>
          <el-form-item label="等级权益描述">
            <el-input v-model="levelDialog.form.benefits" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="如：解锁专属海报角标；优先参与平台活动（展示在 C 端等级说明弹层，可留空）" />
            <span class="form-tip">C 端「等级说明」弹层展示的权益文案，可留空（留空时显示升级门槛）</span>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="levelDialog.show = false">取消</el-button>
          <el-button type="primary" :loading="levelSaving" @click="saveLevel">保存</el-button>
        </template>
      </el-dialog>
    </section>

    <!-- 分销商管理 -->
    <section v-if="activeTab === 'members'">
      <AppPageHeader title="分销商管理" desc="本租户内已有绑定关系或收益的推广用户">
        <div class="hd-actions">
          <el-input v-model="memberKeyword" placeholder="搜索昵称 / 手机号" clearable class="w240" @keyup.enter="loadMembers" />
          <el-button type="primary" plain @click="loadMembers">查询</el-button>
        </div>
      </AppPageHeader>
      <!-- 分销商申请（门槛=2 时 C 端提交，租户后台审核） -->
      <el-card shadow="never" class="mb16">
        <template #header>
          <div class="card-head">
            <span>分销商申请<el-tag v-if="applies.length" size="small" type="danger" class="ml8">{{ applies.length }} 条待审核</el-tag></span>
            <el-button type="primary" plain size="small" @click="loadApplies">刷新</el-button>
          </div>
        </template>
        <el-table :data="applies" v-loading="applyLoading" stripe>
          <template #empty>
            <el-empty description="暂无待审核的申请" :image-size="60" />
          </template>
          <el-table-column label="用户" min-width="160">
            <template #default="{ row }">
              <div class="user-cell">
                <el-avatar :size="28" :src="row.avatar">{{ (row.nickname || '微')[0] }}</el-avatar>
                <span>{{ row.nickname || '微信用户' }}</span>
                <span class="muted ml8">ID {{ row.user_id }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="身份" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="row.identity_type === 'employee' ? 'warning' : 'success'">
                {{ row.identity_type === 'employee' ? '企业员工' : '入驻个人' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="申请时间" width="170" />
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button link type="primary" @click="reviewApply(row, 'approve')">通过</el-button>
              <el-button link type="danger" @click="reviewApply(row, 'reject')">驳回</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
      <el-card shadow="never" v-if="cfg.distributorGate === 2" class="mb16">
        <template #header>
          <div class="card-head">
            <span>分销商白名单</span>
            <div class="wl-ops">
              <el-input v-model="wlUserId" placeholder="用户ID" class="w120" clearable />
              <el-select v-model="wlIdentity" class="w120">
                <el-option label="入驻个人" value="individual" />
                <el-option label="企业员工" value="employee" />
              </el-select>
              <el-button type="primary" @click="addWhitelist">添加</el-button>
            </div>
          </div>
        </template>
        <div class="wl-tip">指定名单门槛已开启，仅白名单成员可获得推广佣金</div>
        <el-table :data="whitelist" v-loading="wlLoading" stripe>
          <el-table-column prop="userId" label="用户ID" width="100" />
          <el-table-column label="用户" min-width="160">
            <template #default="{ row }">
              <div class="user-cell">
                <el-avatar :size="28" :src="row.avatar">{{ (row.nickname || '微')[0] }}</el-avatar>
                <span>{{ row.nickname || '微信用户' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="身份" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="row.identityType === 'employee' ? 'warning' : 'success'">
                {{ row.identityType === 'employee' ? '企业员工' : '入驻个人' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="添加时间" width="170" />
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button link type="danger" @click="removeWhitelist(row)">移除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
      <el-card shadow="never">
        <el-table :data="members" v-loading="loading" stripe>
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column label="用户" min-width="160">
            <template #default="{ row }">
              <div class="user-cell">
                <el-avatar :size="28" :src="row.avatar">{{ (row.nickname || '微')[0] }}</el-avatar>
                <span>{{ row.nickname || '微信用户' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" width="130" />
          <el-table-column label="身份" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.identity_type === 'employee' ? 'warning' : 'success'">
                {{ row.identity_type === 'employee' ? '企业员工' : '入驻个人' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="一级下线" prop="pid1" width="90" />
          <el-table-column label="二级下线" prop="pid2" width="90" />
          <el-table-column label="来源" width="90">
            <template #default="{ row }">{{ sourceLabel(row.source_type) }}</template>
          </el-table-column>
          <el-table-column prop="bind_time" label="绑定时间" width="160" />
          <el-table-column label="可提现(元)" width="110">
            <template #default="{ row }">{{ fen(row.available) }}</template>
          </el-table-column>
          <el-table-column label="累计收益(元)" width="110">
            <template #default="{ row }">{{ fen(row.total_income) }}</template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="memberPage" :page-size="20" :total="memberTotal"
          layout="total, prev, pager, next" class="mt16" @current-change="loadMembers"
        />
      </el-card>
    </section>

    <!-- 佣金明细 -->
    <section v-if="activeTab === 'logs'">
      <AppPageHeader title="佣金明细" desc="本租户全部推广佣金流水（一级 / 二级）">
        <div class="hd-actions">
          <el-date-picker v-model="summaryMonth" type="month" placeholder="选择月份" value-format="YYYY-MM" class="w160" />
          <el-button type="primary" plain @click="exportStatement">月度对账</el-button>
          <el-button type="primary" plain @click="printStatement">打印对账单</el-button>
          <el-button type="primary" plain @click="exportLogs">导出明细</el-button>
          <el-select v-model="logType" placeholder="收益类型" clearable class="w160" @change="loadLogs">
            <el-option label="一级佣金" value="level1" />
            <el-option label="二级佣金" value="level2" />
            <el-option label="自购返佣" value="level1" />
          </el-select>
          <el-select v-model="logStatus" placeholder="状态" clearable class="w140" @change="loadLogs">
            <el-option label="待结算" value="pending" />
            <el-option label="已结算" value="settled" />
            <el-option label="已扣回" value="charged_back" />
          </el-select>
        </div>
      </AppPageHeader>
      <el-card shadow="never">
        <el-table :data="logs" v-loading="loading" stripe>
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column label="用户" min-width="140">
            <template #default="{ row }">{{ row.nickname || '微信用户' }}</template>
          </el-table-column>
          <el-table-column prop="order_no" label="订单号" width="170" />
          <el-table-column label="类型" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="logTypeTag(row.type)">{{ logTypeLabel(row.type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="金额(元)" width="110">
            <template #default="{ row }">
              <span :class="{ 'text-danger': row.status === 'charged_back' }">{{ fen(row.amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.status === 'settled' ? 'success' : row.status === 'charged_back' ? 'danger' : 'warning'">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="时间" width="160" />
          <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        </el-table>
        <el-pagination
          v-model:current-page="logPage" :page-size="20" :total="logTotal"
          layout="total, prev, pager, next" class="mt16" @current-change="loadLogs"
        />
      </el-card>
    </section>

    <!-- 月度对账单预览（浏览器打印即存 PDF） -->
    <el-dialog v-model="statementShow" title="分销佣金月度对账单" width="1120px" top="5vh" append-to-body @close="statementClose">
      <iframe ref="statementIframe" :src="statementUrl" class="statement-frame" />
      <template #footer>
        <el-button @click="statementClose">关闭</el-button>
        <el-button type="primary" @click="statementPrint">打印 / 存为 PDF</el-button>
      </template>
    </el-dialog>

    <!-- 溯源记录 -->
    <section v-if="activeTab === 'relations'">
      <AppPageHeader title="溯源记录" desc="本租户推广绑定关系（首次进入永久锁定）">
        <div class="hd-actions">
          <el-radio-group v-model="relView" @change="relViewChanged">
            <el-radio-button label="list">绑定列表</el-radio-button>
            <el-radio-button label="tree">关系树</el-radio-button>
          </el-radio-group>
          <el-input v-if="relView === 'list'" v-model="relKeyword" placeholder="搜索昵称 / 手机号" clearable class="w240" @keyup.enter="loadRelations" />
          <el-button v-if="relView === 'list'" type="primary" plain @click="loadRelations">查询</el-button>
          <el-button v-else type="primary" plain @click="loadRelationTree">刷新</el-button>
        </div>
      </AppPageHeader>
      <el-card v-if="relView === 'list'" shadow="never">
        <el-table :data="relations" v-loading="loading" stripe>
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column label="用户" min-width="140">
            <template #default="{ row }">{{ row.nickname || '微信用户' }}</template>
          </el-table-column>
          <el-table-column prop="pid1" label="一级上级" width="90" />
          <el-table-column prop="pid2" label="二级上级" width="90" />
          <el-table-column label="身份" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.identity_type === 'employee' ? 'warning' : 'success'">
                {{ row.identity_type === 'employee' ? '企业员工' : '入驻个人' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="来源" width="90">
            <template #default="{ row }">{{ sourceLabel(row.source_type) }}</template>
          </el-table-column>
          <el-table-column prop="bind_time" label="绑定时间" width="160" />
        </el-table>
        <el-pagination
          v-model:current-page="relPage" :page-size="20" :total="relTotal"
          layout="total, prev, pager, next" class="mt16" @current-change="loadRelations"
        />
      </el-card>
      <el-card v-else shadow="never">
        <el-tree :data="relationTree" node-key="userId" default-expand-all :expand-on-click-node="false" v-loading="treeLoading" empty-text="暂无绑定关系，推广二维码分享后自动生成">
          <template #default="{ data }">
            <span class="tree-node">
              <span class="tree-name">{{ data.nickname }}</span>
              <el-tag v-if="data.identityType === 'employee'" size="small" type="warning">企业员工</el-tag>
              <el-tag v-for="t in data.tags" :key="t" size="small" class="tree-tag">{{ t }}</el-tag>
              <span class="tree-meta">ID {{ data.userId }}</span>
            </span>
          </template>
        </el-tree>
      </el-card>
    </section>

    <!-- 钱包提现 -->
    <section v-if="activeTab === 'wallet'">
      <AppPageHeader title="钱包与提现" desc="本租户用户钱包余额与提现审核">
        <div class="hd-actions">
          <el-button type="primary" plain @click="exportWithdraws">导出对账</el-button>
          <el-button type="primary" plain @click="loadWithdraws">刷新</el-button>
        </div>
      </AppPageHeader>
      <el-row :gutter="16" class="mb16">
        <el-col :span="6">
          <el-card shadow="never"><div class="stat-cell"><div class="stat-label">可提现余额（元）</div><div class="stat-value">{{ fen(walletStat.available) }}</div></div></el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never"><div class="stat-cell"><div class="stat-label">待结算（元）</div><div class="stat-value">{{ fen(walletStat.waitSettle) }}</div></div></el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never"><div class="stat-cell"><div class="stat-label">待审核提现笔数</div><div class="stat-value">{{ walletStat.pendingWithdraw }}</div></div></el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never"><div class="stat-cell"><div class="stat-label">累计提现（元）</div><div class="stat-value">{{ fen(walletStat.totalWithdraw) }}</div></div></el-card>
        </el-col>
      </el-row>
      <el-card shadow="never">
        <div class="sub-title">提现审核</div>
        <div v-if="wdSelected.length" class="batch-bar mb12">
          <span class="text-muted">已选 {{ wdSelected.length }} 笔</span>
          <el-button size="small" type="primary" plain @click="batchReview('approve')">批量通过</el-button>
          <el-button size="small" type="danger" plain @click="batchReview('reject')">批量驳回</el-button>
          <el-button size="small" @click="wdSelected = []">取消选择</el-button>
        </div>
        <el-table :data="withdraws" v-loading="loading" stripe @selection-change="(rows) => (wdSelected = rows)">
          <el-table-column type="selection" width="46" :selectable="(row) => row.status === 'pending'" />
          <el-table-column prop="withdraw_no" label="提现单号" width="200" />
          <el-table-column label="用户" min-width="140">
            <template #default="{ row }">{{ row.nickname || '微信用户' }}</template>
          </el-table-column>
          <el-table-column label="提现金额(元)" width="110">
            <template #default="{ row }">{{ fen(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="手续费(元)" width="100">
            <template #default="{ row }">{{ fen(row.service_fee) }}</template>
          </el-table-column>
          <el-table-column label="实际到账(元)" width="110">
            <template #default="{ row }">{{ fen(row.actual_amount) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="withdrawTag(row.status)">{{ withdrawLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="提交时间" width="150" />
          <el-table-column label="收款信息" min-width="160">
            <template #default="{ row }">
              <span v-if="row.pay_account" class="text-muted">{{ acctLabel(row.pay_account) }}</span>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="打款信息" min-width="160">
            <template #default="{ row }">
              <span v-if="row.status === 'done'" class="text-muted">{{ row.pay_no || '已打款' }}<template v-if="row.pay_remark"> · {{ row.pay_remark }}</template></span>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button size="small" type="primary" plain @click="review(row, 'approve')">通过</el-button>
                <el-button size="small" type="danger" plain @click="review(row, 'reject')">驳回</el-button>
              </template>
              <el-button v-else-if="row.status === 'approved'" size="small" type="success" plain @click="payDialog(row)">登记打款</el-button>
              <span v-else-if="row.status === 'rejected'" class="text-muted">{{ row.reject_reason || '已驳回' }}</span>
              <span v-else class="text-muted">已完成</span>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="wdPage" :page-size="20" :total="wdTotal"
          layout="total, prev, pager, next" class="mt16" @current-change="loadWithdraws"
        />

        <!-- 登记打款弹窗 -->
        <el-dialog v-model="payBox.show" title="登记打款" width="440px" :close-on-click-modal="false">
          <el-form label-width="100px">
            <el-form-item label="打款流水号" required>
              <el-input v-model="payBox.payNo" placeholder="线下转账流水号 / 单号" maxlength="60" />
            </el-form-item>
            <el-form-item label="打款备注">
              <el-input v-model="payBox.payRemark" type="textarea" :rows="2" placeholder="转账方式、凭证备注等（选填）" maxlength="200" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="payBox.show = false">取消</el-button>
            <el-button type="primary" @click="submitPay">确认打款完成</el-button>
          </template>
        </el-dialog>
      </el-card>
    </section>

    <!-- 分账快照 -->
    <section v-if="activeTab === 'splits'">
      <AppPageHeader title="分账快照" desc="每一笔订单的完整分账记录，对账与退款回滚的唯一数据源">
        <div class="hd-actions">
          <el-select v-model="splitFilter" style="width: 140px" @change="loadSplits(1)">
            <el-option label="全部状态" value="" />
            <el-option label="待结算" value="pending" />
            <el-option label="已结算" value="settled" />
            <el-option label="已退款回滚" value="refunded" />
          </el-select>
          <el-button type="primary" plain @click="loadSplits(1)">刷新</el-button>
        </div>
      </AppPageHeader>
      <el-card shadow="never" class="block-card">
        <el-table :data="splitRows" v-loading="splitLoading" stripe>
          <el-table-column prop="orderNo" label="订单号" min-width="170" show-overflow-tooltip />
          <el-table-column prop="nickname" label="买家" min-width="100" />
          <el-table-column label="订单金额" width="110">
            <template #default="{ row }">{{ fen(row.orderAmount) }} 元</template>
          </el-table-column>
          <el-table-column label="一级佣金" width="100">
            <template #default="{ row }">{{ fen(row.commission1) }}</template>
          </el-table-column>
          <el-table-column label="二级佣金" width="100">
            <template #default="{ row }">{{ fen(row.commission2) }}</template>
          </el-table-column>
          <el-table-column label="合伙人分红" width="105">
            <template #default="{ row }">{{ fen(row.partner) }}</template>
          </el-table-column>
          <el-table-column label="全民股东" width="100">
            <template #default="{ row }">{{ fen(row.shareAll) }}</template>
          </el-table-column>
          <el-table-column label="类目股东" width="100">
            <template #default="{ row }">{{ fen(row.shareCat) }}</template>
          </el-table-column>
          <el-table-column label="区域股东" width="100">
            <template #default="{ row }">{{ fen(row.shareArea) }}</template>
          </el-table-column>
          <el-table-column label="总分成" width="100">
            <template #default="{ row }">{{ fen(row.totalBonus) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="105">
            <template #default="{ row }">
              <el-tag :type="row.settleStatus === 'settled' ? 'success' : row.settleStatus === 'refunded' ? 'danger' : 'warning'" size="small">
                {{ row.settleStatus === 'settled' ? '已结算' : row.settleStatus === 'refunded' ? '已退款回滚' : '待结算' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="分账时间" width="165" />
        </el-table>
        <div class="page-bar">
          <el-pagination background layout="total, prev, pager, next" :total="splitTotal" :page-size="splitPageSize" :current-page="splitPage" @current-change="loadSplits" />
        </div>
      </el-card>
    </section>

    <!-- 数据大盘 -->
    <section v-if="activeTab === 'stats'">
      <AppPageHeader title="分销数据大盘" desc="本租户分销收益全景">
        <div class="hd-actions">
          <el-button type="primary" plain @click="loadStats">刷新</el-button>
          <el-button type="primary" @click="runSettle">模拟结算 T+N</el-button>
        </div>
      </AppPageHeader>
      <el-row :gutter="16" class="mb16">
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">佣金总支出(元)</div><div class="stat-value">{{ fen(stats.totalCommission) }}</div></div></el-card></el-col>
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">已结算(元)</div><div class="stat-value">{{ fen(stats.settledCommission) }}</div></div></el-card></el-col>
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">分账订单数</div><div class="stat-value">{{ stats.splitCount }}</div></div></el-card></el-col>
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">分账总额(元)</div><div class="stat-value">{{ fen(stats.splitAmount) }}</div></div></el-card></el-col>
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">绑定成员数</div><div class="stat-value">{{ stats.memberCount }}</div></div></el-card></el-col>
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">待审提现</div><div class="stat-value">{{ stats.withdrawPending }}</div></div></el-card></el-col>
      </el-row>
      <el-row :gutter="16" class="mb16">
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">合伙人分红(元)</div><div class="stat-value">{{ fen(stats.bonusByType?.partner || 0) }}</div></div></el-card></el-col>
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">全民股东(元)</div><div class="stat-value">{{ fen(stats.bonusByType?.share_all || 0) }}</div></div></el-card></el-col>
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">类目股东(元)</div><div class="stat-value">{{ fen(stats.bonusByType?.share_cat || 0) }}</div></div></el-card></el-col>
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">区域股东(元)</div><div class="stat-value">{{ fen(stats.bonusByType?.share_area || 0) }}</div></div></el-card></el-col>
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">合伙人/全民</div><div class="stat-value">{{ stats.partnerCount || 0 }} / {{ stats.shareAllCount || 0 }}</div></div></el-card></el-col>
        <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">类目/区域</div><div class="stat-value">{{ stats.shareCatCount || 0 }} / {{ stats.shareAreaCount || 0 }}</div></div></el-card></el-col>
      </el-row>
      <el-card shadow="never" class="mb16">
        <div class="sub-title">推广效果</div>
        <el-row :gutter="16" class="mb16">
          <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">绑定用户</div><div class="stat-value">{{ stats.promo?.boundTotal || 0 }}</div></div></el-card></el-col>
          <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">其中付费用户</div><div class="stat-value">{{ stats.promo?.paidTotal || 0 }}</div></div></el-card></el-col>
          <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">付费转化率</div><div class="stat-value">{{ stats.promo?.paidRate || 0 }}%</div></div></el-card></el-col>
          <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">今日新增推广</div><div class="stat-value">{{ stats.promo?.todayNew || 0 }}</div></div></el-card></el-col>
          <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">本月新增推广</div><div class="stat-value">{{ stats.promo?.monthNew || 0 }}</div></div></el-card></el-col>
          <el-col :span="4"><el-card shadow="never"><div class="stat-cell"><div class="stat-label">带来的佣金(元)</div><div class="stat-value">{{ fen(stats.promo?.commissionByPromo || 0) }}</div></div></el-card></el-col>
        </el-row>
        <el-table :data="stats.promo?.srcList || []" v-loading="loading" stripe>
          <el-table-column label="绑定来源" prop="label" min-width="160" />
          <el-table-column label="绑定人数" prop="count" width="140" />
          <el-table-column label="占比" width="180">
            <template #default="{ row }">{{ row.ratio }}%</template>
          </el-table-column>
        </el-table>
      </el-card>
      <el-card shadow="never" class="mb16">
        <div class="sub-title">
          分销漏斗
          <span class="sub-desc">分享 / 曝光 / 绑定 / 付费（按月，逐层去重单调不增）</span>
          <el-date-picker v-model="funnelMonth" type="month" placeholder="选择月份" value-format="YYYY-MM" class="w160 pull-right" @change="loadFunnel" />
        </div>
        <el-row :gutter="16">
          <el-col :span="5"><el-card shadow="never"><div class="funnel-cell">
            <div class="funnel-step">① 分享</div><div class="funnel-num">{{ funnel.shareCount }}</div><div class="funnel-sub">分享人次</div>
          </div></el-card></el-col>
          <el-col :span="5"><el-card shadow="never"><div class="funnel-cell">
            <div class="funnel-step">② 曝光</div><div class="funnel-num">{{ funnel.viewCount }}</div><div class="funnel-sub">去重访客 · 曝光→绑定 {{ funnel.viewToBind }}%</div>
          </div></el-card></el-col>
          <el-col :span="5"><el-card shadow="never"><div class="funnel-cell">
            <div class="funnel-step">③ 绑定</div><div class="funnel-num">{{ funnel.bindCount }}</div><div class="funnel-sub">绑定用户 · 绑定→付费 {{ funnel.bindToPay }}%</div>
          </div></el-card></el-col>
          <el-col :span="5"><el-card shadow="never"><div class="funnel-cell">
            <div class="funnel-step">④ 付费</div><div class="funnel-num">{{ funnel.payCount }}</div><div class="funnel-sub">付费用户 · 总转化 {{ funnel.viewToPay }}%</div>
          </div></el-card></el-col>
          <el-col :span="4"><el-card shadow="never"><div class="funnel-cell">
            <div class="funnel-step">付费金额</div><div class="funnel-num">{{ fen(funnel.paidAmount) }}</div><div class="funnel-sub">绑定用户付费合计</div>
          </div></el-card></el-col>
        </el-row>
        <el-table :data="funnel.trend" v-loading="loading" stripe class="mt16">
          <el-table-column prop="month" label="月份" width="140" />
          <el-table-column prop="share" label="分享" width="120" />
          <el-table-column prop="view" label="曝光访客" width="120" />
          <el-table-column prop="bind" label="绑定" width="120" />
          <el-table-column prop="pay" label="付费" />
        </el-table>
      </el-card>
      <el-card shadow="never">
        <div class="sub-title">近 7 日订单分账趋势</div>
        <el-table :data="stats.trend" v-loading="loading" stripe>
          <el-table-column prop="d" label="日期" width="200" />
          <el-table-column prop="n" label="分账订单数" width="160" />
          <el-table-column label="分账金额(元)">
            <template #default="{ row }">{{ fen(row.s) }}</template>
          </el-table-column>
        </el-table>
      </el-card>
      <el-card shadow="never">
        <div class="sub-title">分销商健康度
          <span class="sub-desc">按 活跃(近7天分享/近30天曝光/新增直推) + 转化(直推付费率) 评分；预警 = 健康分最低，建议优先跟进</span>
        </div>
        <el-table :data="healthList" v-loading="loading" stripe>
          <el-table-column label="排名" width="70">
            <template #default="{ row }">
              <span class="rank-no" :class="row.score >= 60 ? 'rank-ok' : row.score >= 30 ? 'rank-warn' : 'rank-hot'">{{ row.rank }}</span>
            </template>
          </el-table-column>
          <el-table-column label="分销商" min-width="130">
            <template #default="{ row }">
              <span class="rank-name">{{ row.nickname }}</span>
              <span class="rank-sub">ID {{ row.userId }}</span>
            </template>
          </el-table-column>
          <el-table-column label="直推(付费·转化)" min-width="130">
            <template #default="{ row }">{{ row.direct }} · {{ row.paid }} · {{ row.conversion }}%</template>
          </el-table-column>
          <el-table-column label="近7天分享" width="95" prop="share7" />
          <el-table-column label="近30天曝光" width="100" prop="view30" />
          <el-table-column label="近30天新增" width="100" prop="bind30" />
          <el-table-column label="最近活跃" width="130">
            <template #default="{ row }">{{ row.lastActive ? row.lastActive.slice(0, 10) : '—' }}</template>
          </el-table-column>
          <el-table-column label="健康分" width="90">
            <template #default="{ row }">
              <span class="health-score" :class="'hs-' + row.status">{{ row.score }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'healthy' ? 'success' : row.status === 'watch' ? 'warning' : 'danger'" size="small">{{ { healthy: '健康', watch: '关注', churn: '流失预警' }[row.status] }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div class="health-empty" v-if="!healthList.length">暂无分销商数据，绑定推广关系后展示</div>
      </el-card>
      <el-card shadow="never">
        <div class="sub-title">预警中心
          <span class="sub-desc">绑定爆发 / 退款集中 / 提现积压 / 让利逼近上限（自动检测）</span>
        </div>
        <template v-if="alerts.length">
          <div class="alert-list">
            <div v-for="a in alerts" :key="a.type" class="alert-item" :class="'alert-' + a.level">
              <span class="alert-dot"></span>
              <div class="alert-body">
                <div class="alert-title">{{ a.title }}</div>
                <div class="alert-desc">{{ a.desc }}</div>
              </div>
              <el-button size="small" text type="primary" @click="goAlertTab(a.action)">{{ a.action }}</el-button>
            </div>
          </div>
        </template>
        <div v-else class="health-empty">当前无预警，各项指标运行正常</div>
      </el-card>
      <el-card shadow="never">
        <div class="sub-title">近 {{ trend.days || 30 }} 天分销趋势
          <span class="sub-desc">折线 = 佣金/分红(元) · 柱 = 新增绑定(人)</span>
        </div>
        <div class="trend-chart" ref="trendBox" v-show="trend.list.length">
          <svg :viewBox="'0 0 ' + tW + ' 220'" class="trend-svg">
            <g v-for="(g, i) in tGrid" :key="'g' + i">
              <line :x1="tPadL" :x2="tW - tPadR" :y1="g.y" :y2="g.y" stroke="#f0f2f5" stroke-width="1" />
              <text :x="tPadL - 6" :y="g.y + 4" text-anchor="end" class="t-axis">{{ g.v }}</text>
            </g>
            <g v-for="(d, i) in trend.list" :key="d.d">
              <rect :x="tX(i) - 2.5" :y="tY(d.bind, 'bind')" width="5" :height="tH - tY(d.bind, 'bind')" fill="rgba(22,93,255,0.15)" rx="2">
                <title>{{ d.d }} 绑定 {{ d.bind }} 人</title>
              </rect>
            </g>
            <polyline :points="tPts('comm')" fill="none" stroke="#165DFF" stroke-width="2" />
            <polyline :points="tPts('bonus')" fill="none" stroke="#FF7D00" stroke-width="2" stroke-dasharray="5 3" />
            <circle v-for="(d, i) in trend.list" :key="'c' + i" :cx="tX(i)" :cy="tY(d.comm, 'comm')" r="2.5" fill="#165DFF">
              <title>{{ d.d }} 佣金 {{ fen(d.comm) }} 元</title>
            </circle>
            <circle v-for="(d, i) in trend.list" :key="'b' + i" :cx="tX(i)" :cy="tY(d.bonus, 'bonus')" r="2.5" fill="#FF7D00">
              <title>{{ d.d }} 分红 {{ fen(d.bonus) }} 元</title>
            </circle>
            <text v-if="trend.list.length" :x="tPadL + (tW - tPadL - tPadR) / 2" :y="212" text-anchor="middle" class="t-axis">{{ trend.list[0].d }} → {{ trend.list[trend.list.length - 1].d }}</text>
          </svg>
          <div class="trend-legend">
            <span class="lg"><i class="lg-line lg-blue"></i>佣金(元)</span>
            <span class="lg"><i class="lg-line lg-orange"></i>分红(元)</span>
            <span class="lg"><i class="lg-bar"></i>新增绑定(人)</span>
          </div>
        </div>
        <div v-if="!trend.list.length" class="health-empty">暂无趋势数据</div>
      </el-card>
      <el-card shadow="never">
        <div class="sub-title">分销商排行 TOP {{ ranking.length }}</div>
        <el-table :data="ranking" v-loading="loading" stripe>
          <el-table-column label="排名" width="80">
            <template #default="{ row }">
              <span class="rank-no" :class="row.rank <= 3 ? 'rank-hot' : ''">{{ row.rank }}</span>
            </template>
          </el-table-column>
          <el-table-column label="分销商" min-width="160">
            <template #default="{ row }">
              <div class="rank-user">
                <span class="rank-name">{{ row.nickname }}</span>
                <el-tag v-for="t in row.tags" :key="t" size="small" class="tree-tag">{{ t }}</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="累计收益(元)" width="130">
            <template #default="{ row }">{{ fen(row.totalIncome) }}</template>
          </el-table-column>
          <el-table-column label="可提现(元)" width="110">
            <template #default="{ row }">{{ fen(row.available) }}</template>
          </el-table-column>
          <el-table-column prop="directCount" label="直推人数" width="100" />
        </el-table>
        <div v-if="!ranking.length" class="text-muted mt16">暂无收益排行，订单分账后自动生成</div>
      </el-card>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../../components/SIcon.vue';
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import { customerApiCall } from '../../../../api';
import { fen, sourceLabel, logTypeLabel, logTypeTag, statusLabel, withdrawLabel, withdrawTag } from '../../../../utils/distFormat.js';

const tabs = [
  { key: 'config', label: '分销配置', icon: 'settings' },
  { key: 'members', label: '分销商', icon: 'user' },
  { key: 'logs', label: '佣金明细', icon: 'chart' },
  { key: 'splits', label: '分账快照', icon: 'orders' },
  { key: 'relations', label: '溯源记录', icon: 'dist' },
  { key: 'wallet', label: '钱包提现', icon: 'wallet' },
  { key: 'stats', label: '数据大盘', icon: 'analytics' },
];
const activeTab = ref('config');

const saving = ref(false);
const loading = ref(false);
const pluginOn = ref(false);
const cfgCats = [
  { key: 'base', label: '基础设置', icon: 'settings' },
  { key: 'relation', label: '关系设置', icon: 'team' },
  { key: 'commission', label: '佣金结算', icon: 'chart' },
  { key: 'withdraw', label: '提现设置', icon: 'wallet' },
  { key: 'display', label: '显示设置', icon: 'palette' },
  { key: 'agreement', label: '申请与协议', icon: 'audit' },
  { key: 'level', label: '等级设置', icon: 'crown' },
  { key: 'notice', label: '消息通知', icon: 'dynamic' },
];
const cfgCat = ref('base');
const subForm = reactive({ enabled: false, tmplReview: '', tmplDone: '', tmplSettle: '' });
const subSaving = ref(false);
const newPosterUrl = ref('');
function addPoster() {
  const url = newPosterUrl.value.trim();
  if (!url) { ElMessage.warning('请输入模板图片 URL'); return; }
  cfg.posterTemplates = cfg.posterTemplates || [];
  cfg.posterTemplates.push({ id: `t${Date.now()}_${cfg.posterTemplates.length}`, url });
  if (!cfg.promoteImg) cfg.promoteImg = url;
  newPosterUrl.value = '';
}
function setDefaultPoster(url) { cfg.promoteImg = url; }
const cfg = reactive({
  ratio1: 0.2, ratio2: 0.05, isOpenLevel2: true, isSelfBuy: false,
  calcType: 1, settleDay: 7, minWithdraw: 10, maxWithdraw: 0, withdrawFeeRate: 0, maxTotalRatio: 0.3,
  distName: '推广员', subName: '下级', applyTopImg: '', promoteImg: '', applyTip: '',
  zeroOrder: false, showParent: false, showPhone: false, defaultLevel: '默认等级', posterBadge: true,
  posterTemplates: [],
  bindRule: 0, becomeRule: 0, becomeAmount: 0, becomeProducts: '',
  shareTitle: '', shareImg: '', applyAgreement: '', distNotice: '',
});

async function loadConfig() {
  try {
    const res = await customerApiCall.get('/distribution/config');
    const c = res.config || {};
    Object.assign(cfg, {
      ratio1: c.ratio1 ?? 0.2, ratio2: c.ratio2 ?? 0.05,
      isOpenLevel2: c.is_open_level2 ? true : false, isSelfBuy: c.is_self_buy ? true : false,
      calcType: c.calc_type ?? 1, settleDay: c.settle_day ?? 7,
      minWithdraw: c.min_withdraw ?? 10, maxWithdraw: c.max_withdraw ?? 0, withdrawFeeRate: c.withdraw_fee_rate ?? 0,
      maxTotalRatio: c.max_total_ratio ?? 0.3,
      // 基本设置 + 分销参数
      distName: c.dist_name || '推广员', subName: c.sub_name || '下级',
      applyTopImg: c.apply_top_img || '', promoteImg: c.promote_img || '', applyTip: c.apply_tip || '',
      zeroOrder: c.zero_order ? true : false, showParent: c.show_parent ? true : false, showPhone: c.show_phone ? true : false,
      defaultLevel: c.default_level || '默认等级',
      posterBadge: c.poster_badge !== undefined ? (c.poster_badge ? true : false) : true,
      // 关系设置 / 分享设置 / 申请协议 / 分销须知
      bindRule: [0, 1, 2].includes(Number(c.bind_rule)) ? Number(c.bind_rule) : 0,
      becomeRule: [0, 1, 2, 3, 4, 5].includes(Number(c.become_rule)) ? Number(c.become_rule) : Number(c.distributor_gate || 0),
      becomeAmount: Number(c.become_amount || 0), becomeProducts: c.become_products || '',
      shareTitle: c.share_title || '', shareImg: c.share_img || '',
      applyAgreement: c.apply_agreement || '', distNotice: c.dist_notice || '',
      posterTemplates: (() => { try { return JSON.parse(c.poster_templates || '[]'); } catch { return []; } })(),
    });
  } catch (e) { ElMessage.error(e || '加载配置失败'); }
  try {
    const p = await customerApiCall.get('/distribution/plugins');
    const dp = (p.list || []).find((x) => x.plugin_code === 'dist');
    pluginOn.value = !!(dp && dp.is_install && dp.is_enable);
    let sub = {};
    try { sub = (dp && dp.config && JSON.parse(dp.config)) || {}; sub = sub.subscribe || {}; } catch {}
    Object.assign(subForm, {
      enabled: !!sub.enabled, tmplReview: sub.tmplReview || '', tmplDone: sub.tmplDone || '', tmplSettle: sub.tmplSettle || '',
    });
  } catch (e) { /* 忽略 */ }
}

async function saveSubConfig() {
  subSaving.value = true;
  try {
    await customerApiCall.put('/distribution/plugins/dist/config', { subscribe: { ...subForm } });
    ElMessage.success('订阅配置已保存');
  } catch (e) { ElMessage.error(e || '保存失败'); } finally { subSaving.value = false; }
}

async function onPluginChange(v) {
  try {
    await customerApiCall.put('/distribution/plugins/dist', { enable: v, install: true });
    ElMessage.success(v ? '已启用分销插件' : '已停用分销插件');
  } catch (e) {
    pluginOn.value = !v;
    ElMessage.error(e || '操作失败');
  }
}

async function saveConfig() {
  saving.value = true;
  try {
    await customerApiCall.put('/distribution/config', {
      ratio1: cfg.ratio1, ratio2: cfg.ratio2, is_open_level2: cfg.isOpenLevel2 ? 1 : 0,
      is_self_buy: cfg.isSelfBuy ? 1 : 0, calc_type: cfg.calcType, settle_day: cfg.settleDay,
      min_withdraw: cfg.minWithdraw, max_withdraw: cfg.maxWithdraw, withdraw_fee_rate: cfg.withdrawFeeRate, max_total_ratio: cfg.maxTotalRatio,
      dist_name: cfg.distName, sub_name: cfg.subName, apply_top_img: cfg.applyTopImg,
      promote_img: cfg.promoteImg, apply_tip: cfg.applyTip, zero_order: cfg.zeroOrder ? 1 : 0,
      show_parent: cfg.showParent ? 1 : 0, show_phone: cfg.showPhone ? 1 : 0, default_level: cfg.defaultLevel,
      bind_rule: cfg.bindRule, become_rule: cfg.becomeRule, become_amount: cfg.becomeAmount,
      become_products: cfg.becomeProducts, share_title: cfg.shareTitle, share_img: cfg.shareImg,
      apply_agreement: cfg.applyAgreement, dist_notice: cfg.distNotice,
      poster_badge: cfg.posterBadge ? 1 : 0,
      poster_templates: cfg.posterTemplates || [],
    });
    ElMessage.success('配置已保存');
  } catch (e) { ElMessage.error(e || '保存失败'); } finally { saving.value = false; }
}

// —— 等级设置（dist_level CRUD）——
const levels = ref([]);
const levelLoading = ref(false);
const levelSaving = ref(false);
const levelDialog = reactive({ show: false, form: { id: null, levelNo: 1, name: '', minTotalIncome: 0, minDirect: 0, benefits: '' } });
async function loadLevels() {
  levelLoading.value = true;
  try {
    const res = await customerApiCall.get('/distribution/levels');
    levels.value = res.list || [];
  } catch (e) { ElMessage.error(e || '加载等级失败'); } finally { levelLoading.value = false; }
}
function openLevelDialog(row) {
  levelDialog.form = row
    ? { id: row.id, levelNo: row.level_no, name: row.name, minTotalIncome: row.min_total_income > 0 ? row.min_total_income / 100 : 0, minDirect: row.min_direct || 0, benefits: row.benefits || '' }
    : { id: null, levelNo: levels.value.length ? Math.max(...levels.value.map((l) => l.level_no)) + 1 : 1, name: '', minTotalIncome: 0, minDirect: 0, benefits: '' };
  levelDialog.show = true;
}
async function saveLevel() {
  const f = levelDialog.form;
  if (!f.name || !String(f.name).trim()) return ElMessage.warning('请填写等级名称');
  levelSaving.value = true;
  try {
    const payload = { levelNo: f.levelNo, name: f.name.trim(), minTotalIncome: Math.round(Number(f.minTotalIncome || 0) * 100), minDirect: Number(f.minDirect || 0), benefits: String(f.benefits || '').trim() };
    if (f.id) await customerApiCall.put(`/distribution/levels/${f.id}`, payload);
    else await customerApiCall.post('/distribution/levels', payload);
    ElMessage.success('等级已保存');
    levelDialog.show = false;
    await loadLevels();
  } catch (e) { ElMessage.error(e || '保存失败'); } finally { levelSaving.value = false; }
}
async function removeLevel(row) {
  try {
    await ElMessageBox.confirm(`确定删除等级「${row.name}」？删除后等级序号自动顺延，历史收益不受影响。`, '删除等级', { type: 'warning' });
  } catch { return; }
  try {
    const res = await customerApiCall.delete(`/distribution/levels/${row.id}`);
    if (res.ok === false) return ElMessage.error(res.error || '删除失败');
    ElMessage.success('等级已删除');
    await loadLevels();
  } catch (e) { ElMessage.error(e || '删除失败'); }
}

// ===== 分销商 =====
const members = ref([]); const memberPage = ref(1); const memberTotal = ref(0); const memberKeyword = ref('');
const whitelist = ref([]); const wlLoading = ref(false); const wlUserId = ref(''); const wlIdentity = ref('individual');
async function loadWhitelist() {
  wlLoading.value = true;
  try {
    const res = await customerApiCall.get('/distribution/distributors');
    whitelist.value = res.list || [];
  } catch (e) { whitelist.value = []; } finally { wlLoading.value = false; }
}
async function addWhitelist() {
  const uid = Number(wlUserId.value);
  if (!wlUserId.value || !Number.isInteger(uid) || uid <= 0) return ElMessage.warning('请填写正确的用户ID');
  try {
    const r = await customerApiCall.post('/distribution/distributors', { userId: uid, identityType: wlIdentity.value });
    if (r.ok === false) return ElMessage.error(r.error || '添加失败');
    ElMessage.success('已加入白名单');
    wlUserId.value = '';
    loadWhitelist();
  } catch (e) { ElMessage.error(e || '添加失败'); }
}
async function removeWhitelist(row) {
  try {
    await customerApiCall.delete(`/distribution/distributors/${row.userId}`, { params: { identityType: row.identityType } });
    ElMessage.success('已移除');
    loadWhitelist();
  } catch (e) { ElMessage.error(e || '操作失败'); }
}

// ===== 分销商申请（门槛=2：C 端提交 → 租户后台审核）=====
const applies = ref([]); const applyLoading = ref(false);
async function loadApplies() {
  applyLoading.value = true;
  try {
    const res = await customerApiCall.get('/distribution/applies', { params: { status: 'pending' } });
    applies.value = res.list || [];
  } catch (e) { applies.value = []; } finally { applyLoading.value = false; }
}
async function reviewApply(row, action) {
  let reason = '';
  if (action === 'reject') {
    try {
      const { value } = await ElMessageBox.prompt('驳回原因（用户可见）', '驳回申请', { confirmButtonText: '确认驳回', cancelButtonText: '取消', inputPlaceholder: '如：行业不符合' });
      reason = (value || '').trim();
    } catch (e) { return; }
  }
  try {
    const r = await customerApiCall.post(`/distribution/applies/${row.id}/review`, { action, reason });
    if (r.ok === false) return ElMessage.error(r.error || '操作失败');
    ElMessage.success(action === 'approve' ? '已通过，用户自动获得分销资格' : '已驳回');
    loadApplies();
    if (action === 'approve') loadWhitelist();
  } catch (e) { ElMessage.error(e || '操作失败'); }
}
async function loadMembers() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/distribution/members', { params: { page: memberPage.value, pageSize: 20, keyword: memberKeyword.value } });
    members.value = res.list || []; memberTotal.value = res.total || 0;
  } catch (e) { ElMessage.error(e || '加载失败'); } finally { loading.value = false; }
}

// ===== 佣金明细 =====
const logs = ref([]); const logPage = ref(1); const logTotal = ref(0); const logType = ref(''); const logStatus = ref('');
const splitRows = ref([]); const splitPage = ref(1); const splitTotal = ref(0); const splitPageSize = ref(20); const splitFilter = ref(''); const splitLoading = ref(false);
async function loadSplits(page = 1) {
  splitPage.value = page; splitLoading.value = true;
  try {
    const res = await customerApiCall.get('/distribution/splits', { params: { page, pageSize: splitPageSize.value, settleStatus: splitFilter.value } });
    splitRows.value = res.list || []; splitTotal.value = res.total || 0;
  } catch (e) { splitRows.value = []; splitTotal.value = 0; } finally { splitLoading.value = false; }
}
async function loadLogs() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/distribution/logs', { params: { page: logPage.value, pageSize: 20, type: logType.value, status: logStatus.value } });
    logs.value = res.list || []; logTotal.value = res.total || 0;
  } catch (e) { ElMessage.error(e || '加载失败'); } finally { loading.value = false; }
}

// ===== 溯源记录 =====
const relations = ref([]); const relPage = ref(1); const relTotal = ref(0); const relKeyword = ref('');
const relView = ref('list'); const relationTree = ref([]); const treeLoading = ref(false);
async function loadRelations() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/distribution/relations', { params: { page: relPage.value, pageSize: 20, keyword: relKeyword.value } });
    relations.value = res.list || []; relTotal.value = res.total || 0;
  } catch (e) { ElMessage.error(e || '加载失败'); } finally { loading.value = false; }
}
function relViewChanged(v) { if (v === 'tree') loadRelationTree(); }
async function loadRelationTree() {
  treeLoading.value = true;
  try {
    const res = await customerApiCall.get('/distribution/tree');
    relationTree.value = res.list || [];
  } catch (e) { ElMessage.error(e || '加载失败'); } finally { treeLoading.value = false; }
}

// ===== 钱包提现 =====
const withdraws = ref([]); const wdPage = ref(1); const wdTotal = ref(0); const wdSelected = ref([]);
const walletStat = reactive({ available: 0, waitSettle: 0, pendingWithdraw: 0, totalWithdraw: 0 });
async function loadWithdraws() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/distribution/withdraws', { params: { page: wdPage.value, pageSize: 20 } });
    withdraws.value = res.list || []; wdTotal.value = res.total || 0;
    try {
      const ws = await customerApiCall.get('/distribution/wallets', { params: { page: 1, pageSize: 1 } });
      const all = ws.list || [];
      walletStat.available = all.reduce((s, x) => s + (x.available || 0), 0);
      walletStat.waitSettle = all.reduce((s, x) => s + (x.wait_settle || 0), 0);
      walletStat.totalWithdraw = all.reduce((s, x) => s + (x.total_withdraw || 0), 0);
    } catch (e) { /* 忽略 */ }
    walletStat.pendingWithdraw = withdraws.value.filter((x) => x.status === 'pending').length;
  } catch (e) { ElMessage.error(e || '加载失败'); } finally { loading.value = false; }
}

// 导出提现对账 CSV（带 BOM，Excel 直接打开不乱码）
async function exportWithdraws() {
  try {
    const res = await customerApiCall.get('/distribution/withdraws', { params: { export: 'csv' }, responseType: 'blob' });
    const blob = res instanceof Blob ? res : new Blob([res], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `提现对账-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success('对账文件已导出');
  } catch (e) { ElMessage.error(e || '导出失败'); }
}

async function review(row, action) {
  if (action === 'reject') {
    try {
      const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回提现', { confirmButtonText: '确定驳回', cancelButtonText: '取消', inputPlaceholder: '驳回原因' });
      await customerApiCall.post(`/distribution/withdraws/${row.id}/review`, { action, reason: value || '审核不通过' });
    } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e || '操作失败'); return; }
  } else {
    try { await customerApiCall.post(`/distribution/withdraws/${row.id}/review`, { action }); } catch (e) { ElMessage.error(e || '操作失败'); return; }
  }
  ElMessage.success('操作成功');
  loadWithdraws();
}

// 登记打款弹窗（线下转账流水号 + 备注）
const payBox = reactive({ show: false, row: null, payNo: '', payRemark: '' });
function payDialog(row) { payBox.row = row; payBox.payNo = ''; payBox.payRemark = ''; payBox.show = true; }
async function submitPay() {
  if (!payBox.payNo.trim()) { ElMessage.warning('请填写打款流水号'); return; }
  try {
    await customerApiCall.post(`/distribution/withdraws/${payBox.row.id}/review`, { action: 'done', payNo: payBox.payNo, payRemark: payBox.payRemark });
    ElMessage.success('打款登记成功');
    payBox.show = false;
    loadWithdraws();
  } catch (e) { ElMessage.error(e || '操作失败'); }
}

// 批量审核（仅 pending 可选）
async function batchReview(action) {
  const ids = wdSelected.value.map((r) => r.id);
  if (!ids.length) { ElMessage.warning('请先选择提现记录'); return; }
  let payload = { ids, action };
  if (action === 'reject') {
    try {
      const { value } = await ElMessageBox.prompt('请输入驳回原因', '批量驳回', { confirmButtonText: '确定驳回', cancelButtonText: '取消', inputPlaceholder: '驳回原因' });
      payload.reason = value || '审核不通过';
    } catch (e) { return; }
  }
  try {
    const r = await customerApiCall.post('/distribution/withdraws/batch-review', payload);
    ElMessage.success(`批量${action === 'approve' ? '通过' : '驳回'}成功 ${r.okCount} 笔${r.failCount ? `，失败 ${r.failCount} 笔` : ''}`);
    wdSelected.value = [];
    loadWithdraws();
  } catch (e) { ElMessage.error(e || '操作失败'); }
}

const summaryMonth = ref(new Date().toISOString().slice(0, 7));

// 月度对账 CSV（含扣回/实得/提现/合计）
async function exportStatement() {
  try {
    const res = await customerApiCall.get('/distribution/statement', { params: { month: summaryMonth.value, export: 'csv' }, responseType: 'blob' });
    const blob = res instanceof Blob ? res : new Blob([res], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `分销月度对账-${summaryMonth.value}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success('月度对账已导出');
  } catch (e) { ElMessage.error(e || '导出失败'); }
}

// 打印对账单（弹窗内嵌 HTML 预览，可打印/下载；浏览器打印即存 PDF）
const statementUrl = ref('');
const statementShow = ref(false);
async function printStatement() {
  try {
    const res = await customerApiCall.get('/distribution/statement', { params: { month: summaryMonth.value, export: 'html' }, responseType: 'blob' });
    const blob = res instanceof Blob ? res : new Blob([res], { type: 'text/html;charset=utf-8' });
    statementUrl.value = URL.createObjectURL(blob);
    statementShow.value = true;
  } catch (e) { ElMessage.error(e || '生成对账单失败'); }
}
function statementPrint() {
  const f = statementIframe.value;
  if (f && f.contentWindow) f.contentWindow.print();
}
function statementClose() {
  statementShow.value = false;
  if (statementUrl.value) { URL.revokeObjectURL(statementUrl.value); statementUrl.value = ''; }
}
const statementIframe = ref(null);

// 月度汇总导出 CSV（旧版兼容入口保留）
async function exportMonthly() {
  try {
    const res = await customerApiCall.get('/distribution/logs/summary', { params: { month: summaryMonth.value, export: 'csv' }, responseType: 'blob' });
    const blob = res instanceof Blob ? res : new Blob([res], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `佣金月度汇总-${summaryMonth.value}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success('月度汇总已导出');
  } catch (e) { ElMessage.error(e || '导出失败'); }
}

// 导出佣金明细 CSV
async function exportLogs() {
  try {
    const res = await customerApiCall.get('/distribution/logs', { params: { export: 'csv' }, responseType: 'blob' });
    const blob = res instanceof Blob ? res : new Blob([res], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `佣金明细-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success('佣金明细已导出');
  } catch (e) { ElMessage.error(e || '导出失败'); }
}

// ===== 数据大盘 =====
function acctLabel(acct) {
  if (!acct) return '—';
  try {
    const o = JSON.parse(acct);
    const zh = { wx: '微信', alipay: '支付宝', bank: '银行卡' };
    return `${zh[o.type] || o.type}${o.name ? '·' + o.name : ''}:${o.value}`;
  } catch { return acct; }
}
const stats = reactive({ totalCommission: 0, settledCommission: 0, splitCount: 0, splitAmount: 0, memberCount: 0, withdrawPending: 0, withdrawTotal: 0, trend: [], bonusByType: {}, partnerCount: 0, shareAllCount: 0, shareCatCount: 0, shareAreaCount: 0, promo: {} });
const ranking = ref([]);
const healthList = ref([]);
const alerts = ref([]);
const trend = reactive({ days: 30, list: [] });
const trendBox = ref(null);
const tW = 860, tPadL = 46, tPadR = 12, tH = 168;
const tMax = computed(() => {
  let m = 0;
  for (const d of trend.list) m = Math.max(m, d.comm / 100, d.bonus / 100, d.bind * 20);
  return m || 1;
});
const tGrid = computed(() => Array.from({ length: 5 }, (_, i) => ({ v: Math.round(((tMax.value * (4 - i)) / 4) * 100) / 100, y: tPadL + ((tH * i) / 4) })));
function tX(i) { return tPadL + (trend.list.length > 1 ? ((tW - tPadL - tPadR) * i) / (trend.list.length - 1) : 0); }
function tY(v, k) { const val = k === 'bind' ? v * 20 : v / 100; return tPadL + tH - (val / tMax.value) * tH; }
function tPts(k) { return trend.list.map((d, i) => `${tX(i)},${tY(d[k], k)}`).join(' '); }
function goAlertTab(action) {
  const map = { '前往溯源记录': 'trace', '前往佣金明细': 'logs', '前往钱包提现': 'wallet', '前往分销配置': 'config' };
  activeTab.value = map[action] || 'dashboard';
}
async function loadAlerts() {
  try {
    const res = await customerApiCall.get('/distribution/alerts');
    alerts.value = res.alerts || [];
  } catch (e) { /* 预警失败不阻塞大盘 */ }
}
async function loadTrend() {
  try {
    const res = await customerApiCall.get('/distribution/trend', { params: { days: 30 } });
    trend.days = res.days || 30;
    trend.list = res.list || [];
  } catch (e) { /* 趋势失败不阻塞大盘 */ }
}
async function loadHealth() {
  try {
    const res = await customerApiCall.get('/distribution/health');
    healthList.value = (res.list || []).map((r, i) => ({ ...r, rank: i + 1 }));
  } catch (e) { /* 健康度失败不阻塞大盘 */ }
}
const funnelMonth = ref(new Date().toISOString().slice(0, 7));
const funnel = reactive({ shareCount: 0, viewCount: 0, bindCount: 0, payCount: 0, paidAmount: 0, viewToBind: 0, bindToPay: 0, viewToPay: 0, trend: [] });
async function loadFunnel() {
  try {
    const res = await customerApiCall.get('/distribution/funnel', { params: { month: funnelMonth.value } });
    Object.assign(funnel, res);
  } catch (e) { /* 漏斗加载失败不阻塞大盘 */ }
}
async function loadStats() {
  loading.value = true;
  try {
    const res = await customerApiCall.get('/distribution/stats');
    Object.assign(stats, res);
  } catch (e) { ElMessage.error(e || '加载失败'); } finally { loading.value = false; }
}
async function loadRanking() {
  try {
    const res = await customerApiCall.get('/distribution/ranking', { params: { limit: 10 } });
    ranking.value = res.list || [];
  } catch (e) { /* 排行失败不阻塞大盘 */ }
}

async function runSettle() {
  try {
    const res = await customerApiCall.post('/distribution/settle-due');
    ElMessage.success(`结算完成，共处理 ${res.settled || 0} 条收益`);
    loadStats();
  } catch (e) { ElMessage.error(e || '结算失败'); }
}


onMounted(() => {
  loadConfig();
  loadMembers();
  loadWhitelist();
  loadApplies();
  loadLogs();
  loadLevels();
  loadSplits();
  loadRelations();
  loadFunnel();
  loadHealth();
  loadAlerts();
  loadTrend();
  loadWithdraws();
  loadStats();
  loadRanking();
});
</script>

<style scoped>
.card-tabs {
  display: flex; align-items: center; overflow-x: auto; gap: 4px;
  background: #fff; border-radius: 8px; padding: 8px 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04); margin-bottom: 16px; white-space: nowrap;
}
.ctab {
  display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
  cursor: pointer; color: #4e5969; font-size: 13px; transition: all 0.2s;
}
.ctab:hover { background: #f2f3f5; color: #1d2129; }
.ctab.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.ctab { position: relative; }
.tab-badge { position: absolute; top: -6px; right: -6px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: #f53f3f; color: #fff; font-size: 11px; font-style: normal; line-height: 16px; text-align: center; }
.ml8 { margin-left: 8px; }
.muted { color: #86909c; font-size: 12px; }
.hd-actions { display: flex; gap: 12px; align-items: center; }
.mb16 { margin-bottom: 16px; }
.mb12 { margin-bottom: 12px; }
.mt16 { margin-top: 16px; }
.statement-frame { width: 100%; height: 66vh; border: 1px solid var(--color-border, #e5e6eb); border-radius: 8px; background: #fff; }
.funnel-cell { text-align: center; padding: 6px 0; }
.funnel-step { font-size: 13px; color: #165dff; font-weight: 500; }
.funnel-num { font-size: 26px; font-weight: 600; color: #1d2129; margin: 6px 0 2px; }
.funnel-sub { font-size: 12px; color: #86909c; }
.sub-desc { font-size: 12px; color: #86909c; font-weight: 400; margin-left: 8px; }
.pull-right { float: right; width: 140px; }
.rank-ok { color: #00b42a; font-weight: 600; }
.rank-warn { color: #ff7d00; font-weight: 600; }
.health-score { font-weight: 700; font-size: 16px; }
.hs-healthy { color: #00b42a; }
.hs-watch { color: #ff7d00; }
.hs-churn { color: #f53f3f; }
.health-empty { text-align: center; color: #86909c; padding: 24px 0; font-size: 13px; }
.alert-list { display: flex; flex-direction: column; gap: 10px; }
.alert-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border-radius: 8px; }
.alert-high { background: #ffece8; border: 1px solid #ffd0c7; }
.alert-mid { background: #fff7e8; border: 1px solid #ffd9ad; }
.alert-low { background: #e8f3ff; border: 1px solid #c8e0ff; }
.alert-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; }
.alert-high .alert-dot { background: #f53f3f; }
.alert-mid .alert-dot { background: #ff7d00; }
.alert-low .alert-dot { background: #165dff; }
.alert-body { flex: 1; min-width: 0; }
.alert-title { font-size: 13px; font-weight: 600; color: #1d2129; }
.alert-desc { font-size: 12px; color: #4e5969; margin-top: 2px; line-height: 1.5; }
.trend-chart { padding: 4px 0 0; }
.trend-svg { width: 100%; height: auto; display: block; }
.t-axis { font-size: 10px; fill: #86909c; }
.trend-legend { display: flex; gap: 18px; justify-content: flex-end; margin-top: 6px; font-size: 12px; color: #4e5969; }
.lg { display: inline-flex; align-items: center; gap: 5px; }
.lg-line { width: 18px; height: 2px; border-radius: 1px; display: inline-block; }
.lg-blue { background: #165dff; }
.lg-orange { background: #ff7d00; }
.lg-bar { width: 8px; height: 8px; border-radius: 2px; background: rgba(22, 93, 255, 0.25); display: inline-block; }
.batch-bar { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: #f7f8fa; border: 1px solid #e5e6eb; border-radius: 8px; }
.text-muted { color: #86909c; font-size: 12px; }
.tree-node { display: inline-flex; align-items: center; gap: 8px; }
.tree-name { font-weight: 500; color: #1d2129; }
.tree-tag { margin-left: 0 !important; }
.tree-meta { color: #86909c; font-size: 12px; margin-left: 4px; }
.rank-no { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: #f2f3f5; color: #4e5969; font-weight: 600; font-size: 13px; }
.rank-no.rank-hot { background: rgba(22, 93, 255, 0.1); color: #165dff; }
.rank-user { display: inline-flex; align-items: center; gap: 8px; }
.rank-name { color: #1d2129; font-weight: 500; }
.w240 { width: 240px; }
.w160 { width: 160px; }
.w140 { width: 140px; }
.form-tip { margin-left: 12px; color: #86909c; font-size: 12px; }
.img-preview { margin-top: 8px; }
.poster-lib { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.poster-item { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid #e5e6eb; border-radius: 8px; background: #fff; }
.poster-item.on { border-color: #165dff; box-shadow: 0 0 0 1px #165dff; }
.poster-thumb { width: 88px; height: 88px; border-radius: 6px; }
.poster-ops { display: flex; gap: 6px; justify-content: center; }
.poster-add { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
/* 分销配置：左侧竖排分类 + 右侧内容区（应用中心「功能分类」样式，无数量角标） */
.cfg-layout { display: flex; align-items: flex-start; gap: 16px; }
.cfg-side { width: 176px; flex-shrink: 0; background: #fff; border-radius: 8px; padding: 8px 12px; }
.cfg-cat { display: flex; align-items: center; gap: 10px; height: 44px; line-height: 44px; padding: 0 12px; border-radius: 8px; margin-bottom: 4px; cursor: pointer; font-size: 14px; color: #4e5969; transition: background-color 0.2s, color 0.2s; }
.cfg-cat:hover { background: #f2f3f5; color: #1d2129; }
.cfg-cat.on { background: #e8f3ff; color: #165dff; font-weight: 500; }
.cfg-main { flex: 1 1 auto; min-width: 0; margin-bottom: 0; }
.level-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.level-tip { color: #86909c; font-size: 12px; }
.level-table { width: 100%; }
@media (max-width: 900px) { .cfg-layout { flex-direction: column; } .cfg-side { width: 100%; display: flex; flex-wrap: wrap; gap: 4px; } .cfg-cat { margin-bottom: 0; } }
.sub-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 12px; }
.stat-cell { text-align: center; }
.stat-label { font-size: 12px; color: #86909c; margin-bottom: 6px; }
.stat-value { font-size: 22px; font-weight: 600; color: #1d2129; }
.user-cell { display: flex; align-items: center; gap: 8px; }
.text-danger { color: #f53f3f; }
.text-muted { color: #86909c; font-size: 12px; }
.cfg-form { max-width: 720px; }
.wl-ops { display: flex; align-items: center; gap: 8px; }
.wl-tip { margin-bottom: 12px; font-size: 12px; color: #86909c; }
.card-head { display: flex; align-items: center; justify-content: space-between; width: 100%; }
</style>
