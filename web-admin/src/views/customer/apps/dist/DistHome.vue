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
      <AppPageHeader title="分销配置" desc="分销裂变全局配置（佣金比例 / 结算周期 / 提现门槛 / 基本设置 / 分销参数）">
        <div class="hd-actions">
          <el-button type="primary" :loading="saving" @click="saveConfig">保存配置</el-button>
        </div>
      </AppPageHeader>
      <el-card shadow="never" class="mb16">
        <el-form label-width="140px" label-position="right" class="cfg-form">
          <el-form-item label="插件开关">
            <el-switch v-model="pluginOn" @change="onPluginChange" />
            <span class="form-tip">关闭后新订单不再产生佣金，历史收益与钱包保留</span>
          </el-form-item>
          <el-divider content-position="left">佣金比例</el-divider>
          <el-form-item label="一级佣金比例">
            <el-input-number v-model="cfg.ratio1" :min="0" :max="0.9" :step="0.05" :precision="2" />
            <span class="form-tip">一级下线付费订单的佣金比例</span>
          </el-form-item>
          <el-form-item label="二级佣金比例">
            <el-input-number v-model="cfg.ratio2" :min="0" :max="0.9" :step="0.05" :precision="2" />
            <span class="form-tip">二级下线付费订单的佣金比例</span>
          </el-form-item>
          <el-form-item label="开启二级分销">
            <el-switch v-model="cfg.isOpenLevel2" />
          </el-form-item>
          <el-form-item label="分销内购">
            <el-switch v-model="cfg.isSelfBuy" />
            <span class="form-tip">开启后分销商自己购买商品，享受直推佣金，上级享受间推佣金</span>
          </el-form-item>
          <el-form-item label="分销商开通门槛">
            <el-radio-group v-model="cfg.distributorGate">
              <el-radio :value="0">无门槛</el-radio>
              <el-radio :value="1">付费用户</el-radio>
              <el-radio :value="2">指定名单</el-radio>
            </el-radio-group>
            <span class="form-tip">付费用户：有已支付订单才可获推广佣金；指定名单：仅白名单成员可获佣金</span>
          </el-form-item>
          <el-divider content-position="left">结算与提现</el-divider>
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
          <el-form-item label="最低提现金额">
            <el-input-number v-model="cfg.minWithdraw" :min="0" :step="10" />
            <span class="form-tip">元</span>
          </el-form-item>
          <el-form-item label="提现手续费比例">
            <el-input-number v-model="cfg.withdrawFeeRate" :min="0" :max="1" :step="0.01" :precision="2" />
            <span class="form-tip">0~1（如 0.05 表示 5%）</span>
          </el-form-item>
          <el-divider content-position="left">基本设置</el-divider>
          <el-form-item label="分销商名称" required>
            <el-input v-model="cfg.distName" maxlength="32" placeholder="如：推广员" class="w320" />
            <span class="form-tip">C 端分销中心对推广用户的称呼</span>
          </el-form-item>
          <el-form-item label="下级名称">
            <el-input v-model="cfg.subName" maxlength="32" placeholder="如：下级" class="w320" />
            <span class="form-tip">C 端对下级的称呼</span>
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
            <span class="form-tip">推广/分享卡片配图；开启「海报装修」后此处不生效</span>
          </el-form-item>
          <el-form-item label="申请页提示">
            <el-input v-model="cfg.applyTip" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="分销商的商品销售统一由厂家直接收款、直接发货…" class="w480" />
          </el-form-item>
          <el-form-item label="0元订单">
            <el-radio-group v-model="cfg.zeroOrder">
              <el-radio :value="1">产生佣金</el-radio>
              <el-radio :value="0">不产生佣金</el-radio>
            </el-radio-group>
            <span class="form-tip">订单在优惠券、积分等折扣下实付金额为 0 时是否计佣（当前分账按实付金额计算，0 元订单无佣金收益）</span>
          </el-form-item>
          <el-divider content-position="left">分销参数</el-divider>
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
          <el-form-item label="默认等级">
            <el-input v-model="cfg.defaultLevel" maxlength="32" placeholder="不填即为「默认等级」" class="w320" />
            <span class="form-tip">分销商默认等级名称</span>
          </el-form-item>
        </el-form>
      </el-card>
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
          <el-button type="primary" plain @click="exportMonthly">月度汇总</el-button>
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
const cfg = reactive({
  ratio1: 0.2, ratio2: 0.05, isOpenLevel2: 1, isSelfBuy: 0,
  calcType: 1, settleDay: 7, minWithdraw: 10, withdrawFeeRate: 0, maxTotalRatio: 0.3, distributorGate: 0,
  distName: '推广员', subName: '下级', applyTopImg: '', promoteImg: '', applyTip: '',
  zeroOrder: 0, showParent: 0, showPhone: 0, defaultLevel: '默认等级',
});

async function loadConfig() {
  try {
    const res = await customerApiCall.get('/distribution/config');
    const c = res.config || {};
    Object.assign(cfg, {
      ratio1: c.ratio1 ?? 0.2, ratio2: c.ratio2 ?? 0.05,
      isOpenLevel2: c.is_open_level2 ?? 1, isSelfBuy: c.is_self_buy ?? 0,
      calcType: c.calc_type ?? 1, settleDay: c.settle_day ?? 7,
      minWithdraw: c.min_withdraw ?? 10, withdrawFeeRate: c.withdraw_fee_rate ?? 0,
      maxTotalRatio: c.max_total_ratio ?? 0.3,
      distributorGate: [0, 1, 2].includes(Number(c.distributor_gate)) ? Number(c.distributor_gate) : 0,
      // 基本设置 + 分销参数
      distName: c.dist_name || '推广员', subName: c.sub_name || '下级',
      applyTopImg: c.apply_top_img || '', promoteImg: c.promote_img || '', applyTip: c.apply_tip || '',
      zeroOrder: c.zero_order ? 1 : 0, showParent: c.show_parent ? 1 : 0, showPhone: c.show_phone ? 1 : 0,
      defaultLevel: c.default_level || '默认等级',
    });
  } catch (e) { ElMessage.error(e || '加载配置失败'); }
  try {
    const p = await customerApiCall.get('/distribution/plugins');
    const dp = (p.list || []).find((x) => x.plugin_code === 'dist');
    pluginOn.value = !!(dp && dp.is_install && dp.is_enable);
  } catch (e) { /* 忽略 */ }
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
      min_withdraw: cfg.minWithdraw, withdraw_fee_rate: cfg.withdrawFeeRate, max_total_ratio: cfg.maxTotalRatio,
      distributor_gate: cfg.distributorGate,
      dist_name: cfg.distName, sub_name: cfg.subName, apply_top_img: cfg.applyTopImg,
      promote_img: cfg.promoteImg, apply_tip: cfg.applyTip, zero_order: cfg.zeroOrder ? 1 : 0,
      show_parent: cfg.showParent ? 1 : 0, show_phone: cfg.showPhone ? 1 : 0, default_level: cfg.defaultLevel,
    });
    ElMessage.success('配置已保存');
  } catch (e) { ElMessage.error(e || '保存失败'); } finally { saving.value = false; }
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

// 月度汇总导出 CSV
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
const stats = reactive({ totalCommission: 0, settledCommission: 0, splitCount: 0, splitAmount: 0, memberCount: 0, withdrawPending: 0, withdrawTotal: 0, trend: [], bonusByType: {}, partnerCount: 0, shareAllCount: 0, shareCatCount: 0, shareAreaCount: 0 });
const ranking = ref([]);
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
  loadSplits();
  loadRelations();
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
