<template>
  <div class="design-home">
    <!-- 应用内 Tab：页面装修 / 系统风格 / 底部导航 / 素材中心 / 系统模板 / 首页跳转 -->
    <div class="card-tabs">
      <div v-for="t in tabs" :key="t.key" class="ctab" :class="{ active: activeTab === t.key }" @click="activeTab = t.key">
        <SIcon :name="t.icon" size="default" :color="activeTab === t.key ? '#165dff' : '#4e5969'" />
        <span>{{ t.label }}</span>
      </div>
    </div>

    <!-- ============ 素材中心 ============ -->
    <section v-if="activeTab === 'media'">
      <AppPageHeader title="素材中心" desc="租户独立素材库：上传、分类、引用追踪（被页面/导航/风格引用的素材不可删除）">
        <div class="hd-actions">
          <el-button type="primary" @click="uploadPick">上传素材</el-button>
          <el-button @click="openNewCategory">新建分类</el-button>
          <el-button v-if="batchMode" :disabled="!batchIds.length" @click="openBatchMove">批量移动</el-button>
          <el-button v-if="batchMode" type="danger" plain :disabled="!batchIds.length" @click="batchDelete">批量删除</el-button>
          <el-button @click="batchMode = !batchMode">{{ batchMode ? '退出批量' : '批量操作' }}</el-button>
        </div>
        <input ref="fileInput" type="file" accept="image/*,video/mp4" multiple class="hide" @change="onFileChange" />
      </AppPageHeader>

      <div class="media-layout">
        <div class="media-side">
          <div class="media-cat" :class="{ active: catFilter === '' }" @click="catFilter = ''">
            全部素材 <span class="cat-n">{{ totalAll }}</span>
          </div>
          <div class="media-cat" :class="{ active: catFilter === 'uncat' }" @click="catFilter = 'uncat'">
            未分类 <span class="cat-n">{{ uncatCount }}</span>
          </div>
          <template v-for="c in categories" :key="c.id">
            <div class="media-cat" :class="{ active: catFilter === String(c.id) }" @click="catFilter = String(c.id)">
              <span class="cat-name">{{ c.category_name }}</span>
              <span class="cat-ops">
                <el-icon @click.stop="renameCat(c)"><EditPen /></el-icon>
                <el-icon @click.stop="delCat(c)"><Delete /></el-icon>
              </span>
            </div>
          </template>
        </div>
        <div class="media-main">
          <div class="media-toolbar">
            <el-input v-model="keyword" placeholder="搜索素材名称" clearable class="w220" @keyup.enter="loadMaterials" @clear="loadMaterials" />
            <span class="media-count">共 {{ total }} 个素材</span>
          </div>
          <div v-loading="loading" class="media-grid">
            <div v-for="m in materials" :key="m.id" class="media-card" :class="{ selected: batchIds.includes(m.id) }" @click="toggleBatch(m)">
              <div class="media-thumb">
                <video v-if="m.file_type === 'mp4'" :src="resolveUrl(m.file_url)" class="media-video-thumb" preload="metadata" muted @click.stop="preview(m)"></video>
                <img v-else :src="resolveUrl(m.file_url)" :alt="m.file_name" loading="lazy" @click.stop="preview(m)" />
                <span v-if="m.file_type === 'mp4'" class="video-tag">视频</span>
                <span v-if="m.ref_count > 0" class="ref-tag">被引用 {{ m.ref_count }}</span>
                <span v-else class="free-tag">闲置</span>
              </div>
              <div class="media-info">
                <div class="media-name" :title="m.file_name">{{ m.file_name }}</div>
                <div class="media-meta">{{ m.category_name || '未分类' }} · {{ fmtSize(m.file_size) }}</div>
              </div>
              <div v-if="!batchMode" class="media-ops" @click.stop>
                <el-button size="small" text type="primary" @click="preview(m)">预览</el-button>
                <el-button size="small" text @click="openMove(m)">移动</el-button>
                <el-button size="small" text @click="copyLink(m)">复制链接</el-button>
                <el-tooltip :disabled="m.ref_count === 0" content="被页面/导航/风格引用，无法删除">
                  <span>
                    <el-button size="small" text type="danger" :disabled="m.ref_count > 0" @click="delMaterial(m)">删除</el-button>
                  </span>
                </el-tooltip>
              </div>
            </div>
            <div v-if="!materials.length && !loading" class="media-empty">暂无素材，点击「上传素材」添加</div>
          </div>
          <el-pagination v-if="total > pageSize" background layout="prev, pager, next" :total="total" :page-size="pageSize" :current-page="page" class="mt16" @current-change="(p) => { page = p; loadMaterials(); }" />
        </div>
      </div>

      <!-- 素材预览 -->
      <el-dialog v-model="previewShow" title="素材预览" width="480px" append-to-body>
        <video v-if="previewType === 'mp4'" :src="previewUrl" controls class="preview-video" style="width:100%;max-height:420px;background:#000"></video>
        <img v-else :src="previewUrl" class="preview-img" />
        <div class="preview-path">{{ previewUrl }}</div>
        <template #footer>
          <el-button @click="copyLink({ file_url: previewUrl })">复制链接</el-button>
          <el-button type="primary" @click="previewShow = false">关闭</el-button>
        </template>
      </el-dialog>

      <!-- 新建/重命名分类 -->
      <el-dialog v-model="catDialog.show" :title="catDialog.id ? '重命名分类' : '新建分类'" width="420px" append-to-body>
        <el-input v-model="catDialog.name" placeholder="分类名称" maxlength="20" @keyup.enter="saveCat" />
        <template #footer>
          <el-button @click="catDialog.show = false">取消</el-button>
          <el-button type="primary" :loading="catSaving" @click="saveCat">保存</el-button>
        </template>
      </el-dialog>

      <!-- 移动分类 -->
      <el-dialog v-model="moveShow" title="移动素材" width="420px" append-to-body>
        <el-select v-model="moveTarget" placeholder="选择目标分类" style="width: 100%">
          <el-option label="未分类" :value="null" />
          <el-option v-for="c in categories" :key="c.id" :label="c.category_name" :value="c.id" />
        </el-select>
        <template #footer>
          <el-button @click="moveShow = false">取消</el-button>
          <el-button type="primary" :loading="moving" @click="doMove">移动</el-button>
        </template>
      </el-dialog>
    </section>

    <!-- ============ 系统风格（1:1 菜鸟云） ============ -->
    <section v-if="activeTab === 'style'">
      <AppPageHeader title="系统风格" desc="整体主题配色：头部颜色/头部文字/配色方案/自定配色；保存后作用于当前租户全部页面">
        <div class="hd-actions"><el-button type="primary" :loading="styleSaving" @click="saveStyle">确定</el-button></div>
      </AppPageHeader>
      <!-- 菜鸟云排版：左侧配置 + 右侧手机预览区 -->
      <div class="ds-layout">
        <div class="card form-card ds-config">
        <!-- 基础设置 -->
        <div class="ds-group-title">基础设置</div>
        <el-form label-width="140px">
          <el-form-item label="头部颜色">
            <el-radio-group v-model="style.headColor" @change="onHeadColorChange">
              <el-radio value="1">跟随主色</el-radio>
              <el-radio value="2">白色头部</el-radio>
            </el-radio-group>
            <span class="form-hint">顶部背景色，为白色头部时顶部文字颜色固定黑色</span>
          </el-form-item>
          <!-- 菜鸟云实测：头部文字选项始终显示；切白色头部瞬间渲染强制黑，点击文字选项后按 radio 值渲染 -->
          <el-form-item label="头部文字">
            <el-radio-group v-model="style.headText">
              <el-radio value="#ffffff" @click="headTextTouched = true">白色</el-radio>
              <el-radio value="#000000" @click="headTextTouched = true">黑色</el-radio>
            </el-radio-group>
            <span class="form-hint">顶部的文字颜色，建议与背景色相反</span>
          </el-form-item>
        </el-form>

        <!-- 配色方案 -->
        <div class="ds-group-title">配色方案</div>
        <div class="ds-scheme-grid">
          <div
            v-for="(s, i) in STYLE_SCHEMES"
            :key="i"
            class="ds-scheme-item"
            :class="{ active: style.colorScheme === i + 1 }"
            @click="pickScheme(i + 1)"
          >
            <div class="ds-scheme-swatch" :style="{ background: `linear-gradient(135deg, ${s.primaryColor}, ${s.gradientColor})` }">
              <span v-if="style.colorScheme === i + 1" class="ds-scheme-check">✓</span>
            </div>
            <span class="ds-scheme-name">{{ s.name }}</span>
          </div>
          <div class="ds-scheme-item" :class="{ active: style.colorScheme === 0 }" @click="pickScheme(0)">
            <div class="ds-scheme-swatch ds-custom-swatch"><span class="ds-custom-plus">+</span></div>
            <span class="ds-scheme-name">自定义</span>
          </div>
        </div>

        <!-- 自定配色（自定义时显示） -->
        <div v-if="style.colorScheme === 0" class="ds-custom-box">
          <div class="ds-group-title">自定配色</div>
          <el-form label-width="140px">
            <el-form-item label="主题颜色">
              <PeColorPicker v-model="style.primaryColor" />
              <span class="form-hint">包含头部颜色（头部颜色为跟随主色时生效）</span>
            </el-form-item>
            <el-form-item label="渐变颜色">
              <PeColorPicker v-model="style.gradientColor" />
              <span class="form-hint">建议与主色颜色相近</span>
            </el-form-item>
            <el-form-item label="辅助颜色">
              <PeColorPicker v-model="style.secondaryColor" />
              <span class="form-hint">建议与主色搭配色</span>
            </el-form-item>
            <el-form-item label="文字颜色">
              <PeColorPicker v-model="style.textColor" />
            </el-form-item>
            <el-form-item label="文字辅色">
              <PeColorPicker v-model="style.subTextColor" />
            </el-form-item>
          </el-form>
        </div>
        </div>

        <!-- 右侧预览（1:1 菜鸟云：商品列表 / 商品详情 / 商品订单 三窗；头部状态栏+胶囊为素材图，头部底色/覆盖层颜色随主题动态） -->
        <div class="ds-preview-panel card">
        <div class="ds-group-title">预览</div>
        <div class="ds-preview-row">
          <!-- 商品列表 -->
          <div class="ds-preview">
            <img class="ds-preview-top" :src="headTopImg" alt="" />
            <img class="ds-preview-bg" :src="previewList" alt="" />
            <div class="ds-preview-head" :style="dsHeadStyle()">商品列表</div>
            <div class="ds-preview-ov">
              <span class="ds-ov" :style="{ top: '82px', left: '0', width: '15px', height: '40px', background: style.primaryColor }"></span>
              <span class="ds-ov" :style="{ top: '82px', left: '54px', width: '24px', height: '40px', background: `linear-gradient(90deg, ${style.primaryColor}, ${style.gradientColor})` }"></span>
              <span class="ds-ov" :style="{ top: '135px', right: '8px', width: '33px', height: '280px', background: style.primaryColor }"></span>
            </div>
          </div>
          <!-- 商品详情（菜鸟云 W2 无 top/head 层：img2 头部自带状态栏） -->
          <div class="ds-preview">
            <img class="ds-preview-bg" :src="previewDetail" alt="" />
            <div class="ds-preview-ov">
              <span class="ds-ov" :style="{ top: '253px', left: '4px', width: '164px', height: '40px', background: `linear-gradient(90deg, ${style.primaryColor}, ${style.gradientColor})` }"></span>
              <span class="ds-ov" :style="{ bottom: '43px', left: '5px', width: '240px', height: '50px', background: style.primaryColor }"></span>
            </div>
            <!-- 以下动态元素均位于背景图不透明区域，覆盖层(z0)在其之下会被遮住，必须独立 z3 置于背景图之上 -->
            <!-- 邀请好友一起抢：主题颜色 + 渐变颜色组成的实色渐变胶囊（菜鸟云 1:1，白字） -->
            <span class="ds-invite" :style="{ color: style.textColor, background: `linear-gradient(90deg, ${style.primaryColor}, ${style.gradientColor})` }">邀请好友一起抢</span>
            <!-- 已售300份：纯文字 + 主色火焰图标在文字上方（无胶囊背景，菜鸟云 1:1） -->
            <span class="ds-sale" :style="{ color: style.primaryColor }">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 2c1.2 4.2-3.6 6.2-3.6 9.8A4.6 4.6 0 0 0 13 16.4a4.6 4.6 0 0 0 4.6-4.6c0-2.2-1-3.6-2-4.8-1.2 1.4-2.4 2-3.4 1.4.8-2.2 1.2-4.4-.2-6.4z"/></svg>
              <b>已售300份</b>
            </span>
            <!-- 标签行（推荐/新品/热卖/促销/限量，白底浅青描边圆角，商品名下方） -->
            <span class="ds-tag-row">
              <b v-for="t in tagList" :key="t" class="ds-tag" :style="{ color: style.primaryColor, borderColor: hexA(style.primaryColor, 0.45) }">{{ t }}</b>
            </span>
            <!-- 邀请区头像组：独立于覆盖层，置于背景图之上（与菜鸟云 1:1） -->
            <div class="ds-av-row" :style="{ bottom: '52px', left: '10px' }">
              <img v-for="(a, i) in avatars" :key="i" :src="a" class="ds-av" alt="" />
            </div>
            <!-- 底部操作：加入购物车（辅助色底+主色字）+ 立即购买（主题色底+白字）左右无缝合成一个整体胶囊（菜鸟云 1:1；右移避开素材收藏图标） -->
            <span class="ds-btns">
              <b class="ds-cart" :style="{ color: style.subTextColor, background: style.secondaryColor }">加入购物车</b>
              <b class="ds-buy" :style="{ color: style.textColor, background: style.primaryColor }">立即购买</b>
            </span>
          </div>
          <!-- 商品订单 -->
          <div class="ds-preview">
            <img class="ds-preview-top" :src="headTopImg" alt="" />
            <img class="ds-preview-bg" :src="previewOrder" alt="" />
            <div class="ds-preview-head" :style="dsHeadStyle()">商品订单</div>
            <div class="ds-preview-ov">
              <span class="ds-ov" :style="{ top: '52px', left: '0', width: '100%', height: '55px', background: style.primaryColor }"></span>
              <!-- 上门自提选中 tab 底色：素材右半为半透明挖空，z0 补主题色浅青由素材透出（不另套 tab 形状） -->
              <span class="ds-ov" :style="{ top: '60px', left: '50%', width: '50%', height: '26px', background: hexA(style.primaryColor, 0.25), borderRadius: '8px' }"></span>
            </div>
            <!-- 上门自提文字：主色、居中于素材自带 tab（无背景，菜鸟云 1:1） -->
            <span class="ds-ziti" :style="{ color: style.primaryColor }">上门自提</span>
            <!-- 提交订单（主色实底圆角按钮，底部右侧） -->
            <span class="ds-submit" :style="{ background: style.primaryColor, color: '#fff' }">提交订单</span>
          </div>
        </div>
        </div>
      </div>
    </section>

    <!-- ============ 底部导航 ============ -->
    <section v-if="activeTab === 'tabs'">
      <AppPageHeader title="底部导航" desc="多套导航方案管理；小程序读取「默认方案」渲染 Tab（默认方案不可删除）">
        <div class="hd-actions"><el-button type="primary" @click="openTabScheme()">新建导航方案</el-button></div>
      </AppPageHeader>
      <div class="card">
        <div class="table-scroll">
        <el-table :data="tabSchemes" v-loading="tabLoading" stripe style="min-width: 900px">
          <el-table-column label="方案名称" prop="scheme_name" min-width="160" />
          <el-table-column label="Tab 项数" width="100">
            <template #default="{ row }">{{ tabCount(row) }}</template>
          </el-table-column>
          <el-table-column label="默认方案" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.is_default" type="success" size="small">默认</el-tag>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="更新时间" width="150">
            <template #default="{ row }">{{ (row.updated_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="280">
            <template #default="{ row }">
              <el-button v-if="!row.is_default" size="small" text type="primary" @click="setDefault(row)">设为默认</el-button>
              <el-button size="small" text @click="openTabScheme(row)">编辑</el-button>
              <el-button size="small" text @click="copyTabScheme(row)">复制</el-button>
              <el-button size="small" text @click="toggleTabScheme(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
              <el-button size="small" text type="danger" :disabled="row.is_default" @click="delTabScheme(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        </div>
      </div>

      <!-- 编辑导航方案 -->
      <el-dialog v-model="schemeShow" :title="schemeForm.id ? '编辑导航方案' : '新建导航方案'" width="680px" append-to-body>
        <el-form label-width="100px">
          <el-form-item label="方案名称">
            <el-input v-model="schemeForm.scheme_name" maxlength="20" style="width: 260px" />
          </el-form-item>
        </el-form>
        <div class="tab-items">
          <div v-for="(it, i) in schemeForm.items" :key="i" class="tab-item-row">
            <el-input v-model="it.text" placeholder="文字" class="w100" />
            <div class="tab-icon">
              <img v-if="it.icon" :src="resolveUrl(it.icon)" class="tab-icon-img" @click="openImageSelect('tab', i)" />
              <span v-else class="tab-icon-empty" @click="openImageSelect('tab', i)">选图标</span>
            </div>
            <el-input v-model="it.url" placeholder="跳转页面地址，如 /pages/card/market" class="flex-1" />
            <el-button text type="danger" @click="schemeForm.items.splice(i, 1)">删除</el-button>
          </div>
          <el-button size="small" @click="schemeForm.items.push({ text: '', icon: '', url: '' })">+ 添加导航项</el-button>
        </div>
        <template #footer>
          <el-button @click="schemeShow = false">取消</el-button>
          <el-button type="primary" :loading="schemeSaving" @click="saveTabScheme">保存方案</el-button>
        </template>
      </el-dialog>
    </section>

    <!-- ============ 首页跳转（按应用维度化：每个行业应用可单独配置启动页） ============ -->
    <section v-if="activeTab === 'home'">
      <AppPageHeader title="首页跳转" desc="每个行业应用可单独设置启动后的默认页面（1:1 复刻菜鸟云：选择链接弹窗，支持 DIY 装修页面/应用页面）">
        <div class="hd-actions"><el-button type="primary" :loading="homeSaving" @click="saveHome">保存配置</el-button></div>
      </AppPageHeader>
      <div class="card form-card">
        <div v-for="app in HOME_APPS" :key="app.appCode" class="home-app-row">
          <div class="home-app-name">
            <SIcon :name="app.icon || 'apps'" size="default" />
            <span>{{ app.name }}</span>
          </div>
          <div class="home-link-row">
            <el-input :model-value="homeLabel(app.appCode)" readonly placeholder="点击右侧「选择链接」设置启动页" style="width: 380px">
              <template #prepend><span class="link-pre">{{ homePages[app.appCode] ? '已选择' : '未设置' }}</span></template>
            </el-input>
            <el-button type="primary" plain @click="openHomePicker(app.appCode)">选择链接</el-button>
            <el-button v-if="homePages[app.appCode]" text type="danger" @click="homePages[app.appCode] = ''">清除</el-button>
          </div>
        </div>
        <span class="form-hint">设置后，该应用启动直达所选页面；未设置时展示应用默认首页（智能名片 = DIY 装修首页「首页」开关生效）</span>
      </div>

      <!-- 页面选择器弹窗（1:1 复刻菜鸟云：按应用分类展示可选页面，选中高亮 + 确定） -->
      <el-dialog v-model="homePicker.show" :title="`选择「${homePickerAppName}」启动页`" width="680px" append-to-body>
        <div class="home-picker">
          <div v-for="g in groupsFor(homePicker.appCode)" :key="g.name" class="picker-group">
            <div class="picker-group-title">{{ g.name }}</div>
            <div class="picker-list">
              <div
                v-for="p in g.items"
                :key="p.value"
                class="picker-item"
                :class="{ active: homePicker.value === p.value }"
                @click="homePicker.value = p.value"
              >
                <SIcon :name="p.icon || 'apps'" size="default" :color="homePicker.value === p.value ? '#165dff' : '#4e5969'" />
                <span class="picker-name">{{ p.label }}</span>
                <span v-if="p.desc" class="picker-desc">{{ p.desc }}</span>
                <span v-if="homePicker.value === p.value" class="picker-check">✓</span>
              </div>
            </div>
          </div>
        </div>
        <template #footer>
          <el-button @click="homePicker.show = false">取消</el-button>
          <el-button type="primary" @click="confirmHomePicker">确定</el-button>
        </template>
      </el-dialog>
    </section>

    <!-- ============ 系统模板 ============ -->
    <section v-if="activeTab === 'template'">
      <AppPageHeader title="系统模板" desc="平台公共模板市场 + 租户私有模板；应用模板将新建页面并载入模板内容，不影响现有页面">
        <div class="hd-actions">
          <el-button @click="importTemplate">导入模板 JSON</el-button>
          <el-button type="primary" @click="saveAsTemplate">存为模板</el-button>
        </div>
        <input ref="importInput" type="file" accept="application/json,.json" class="hide" @change="onImport" />
      </AppPageHeader>
      <div class="card">
        <el-radio-group v-model="tplScope" class="mb16">
          <el-radio-button value="public">模板市场</el-radio-button>
          <el-radio-button value="mine">我的模板</el-radio-button>
        </el-radio-group>
        <el-radio-group v-model="tplCat" class="mb16 tpl-cat-group">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button v-for="c in tplCategories" :key="c" :value="c">{{ c }}</el-radio-button>
        </el-radio-group>
        <div v-loading="tplLoading" class="tpl-grid">
          <div v-for="t in filteredTemplates" :key="t.id" class="tpl-card">
            <div class="tpl-phone">
              <div class="tpl-phone-notch"></div>
              <div class="tpl-phone-screen">
                <img v-if="t.cover_url" :src="resolveUrl(t.cover_url)" style="width:100%;height:100%;object-fit:cover;" />
                <div v-else class="tpl-screen-inner" v-html="thumbHtml(t)"></div>
              </div>
              <div class="tpl-hover">
                <div class="tpl-mask"></div>
                <button class="tpl-use" @click="applyTemplate(t)">应用模板</button>
                <div class="tpl-hover-btns">
                  <span @click="exportTemplate(t)">导出</span>
                  <span v-if="!t.is_public" class="tpl-del" @click="delTemplate(t)">删除</span>
                </div>
              </div>
            </div>
            <div class="tpl-name">
              {{ t.template_name }}
              <span v-if="t.is_public" class="tpl-badge">平台模板</span>
            </div>
          </div>
          <div v-if="!filteredTemplates.length && !tplLoading" class="media-empty">暂无模板</div>
        </div>
      </div>
    </section>

    <!-- ============ 页面装修（云菜鸟 moban 风格：顶部手机真实预览 + 操作条 + 页面表格） ============ -->
    <section v-if="activeTab === 'page'">
      <AppPageHeader title="页面装修" desc="顶部为当前使用中首页的真实手机预览（可操作）；下方管理全部页面（装修/复制/推广/删除）">
        <div class="hd-actions">
          <el-button type="primary" @click="createPage">新建页面</el-button>
        </div>
      </AppPageHeader>

      <div class="page-manage pm-layout">
        <!-- 左侧：模板名 + 正常手机大小真实预览（iframe 可操作） -->
        <div class="pm-left">
          <div class="pm-tpl-head">
            <span class="pm-tpl-name">{{ homeName }}</span>
            <span class="pm-use-tag">使用中</span>
            <el-button size="small" text type="primary" @click="editHome">立即装修</el-button>
          </div>
          <div class="pm-update">最近更新：{{ homeUpdated }}</div>
          <div class="pm-phone">
            <div class="pm-status">
              <span>10:18</span>
              <span class="pm-ps-icons">
                <svg viewBox="0 0 22 12" width="19" height="12" fill="#1d2129"><circle cx="3" cy="9" r="2.6"/><circle cx="8.5" cy="7.5" r="2.2"/><circle cx="13.5" cy="5.5" r="1.8"/><circle cx="18" cy="3.5" r="1.4"/></svg>
                <svg viewBox="0 0 18 14" width="15" height="13" fill="none" stroke="#1d2129" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 6a9 9 0 0 1 13 0"/><path d="M5.2 9a5.4 5.4 0 0 1 7.6 0"/><path d="M7.8 11.6a2 2 0 0 1 2.4 0"/><circle cx="9" cy="13.2" r="1.1" fill="#1d2129" stroke="none"/></svg>
                <svg viewBox="0 0 26 13" width="23" height="12" fill="none"><rect x="0.5" y="0.5" width="21" height="12" rx="3.5" stroke="#1d2129" stroke-width="1.1"/><rect x="2.5" y="2.5" width="13" height="8" rx="1.8" fill="#1d2129"/><path d="M23.5 4.5v4a2.2 2.2 0 0 0 0-4z" fill="#1d2129"/></svg>
              </span>
            </div>
            <div v-if="pagePreviewUrl" class="pm-iframe-wrap">
              <iframe :src="pagePreviewUrl" class="pm-iframe" title="首页实时预览" />
            </div>
            <div v-else class="pm-canvas">
              <div v-for="comp in homePreview" :key="comp.id" class="pm-comp">
                <ComponentRender :comp="comp" />
              </div>
              <div v-if="!homePreview.length" class="pm-empty">首页暂无组件，点击「立即装修」添加内容</div>
            </div>
          </div>
        </div>

        <!-- 右侧：操作条 + 页面列表（云菜鸟 moban：左右布局） -->
        <div class="pm-right">
          <div class="pm-toolbar">
            <el-input v-model="pageSearch" placeholder="页面名称搜索" clearable class="w220" @keyup.enter="pageSearch = pageSearch" @clear="pageSearch = ''" />
            <el-button @click="pageSearch = pageSearch">搜索</el-button>
            <span class="pm-count">共 {{ filteredPages.length }} 个页面</span>
            <div class="pm-toolbar-right">
              <el-button @click="renameTemplate">重命名模板</el-button>
              <el-button @click="openPreview">预览模板</el-button>
              <el-button type="primary" @click="goEdit(homePageType)">立即装修</el-button>
            </div>
          </div>

          <!-- 表格：页面名称 / 是否首页 / 头部展示 / 密码访问 / 会员访问 / 操作 -->
          <div class="table-scroll" @dragstart="onPageRowDragStart" @dragover="onPageRowDragOver" @drop.prevent.stop="onPageRowDrop" @dragend="onPageRowDragEnd">
            <el-table :data="pagedPages" v-loading="pageLoading" stripe row-key="page_type" :row-class-name="pageRowClassName" style="min-width: 820px">
              <el-table-column type="index" label="#" width="48" />
              <el-table-column label="页面名称" min-width="180">
                <template #default="{ row }">
                  <span class="pm-row-drag" title="按住拖动排序">⠿</span>
                  <span class="pm-row-name">{{ row.page_name }}</span>
                  <el-tag v-if="row.isHome" size="small" type="success" class="pm-home-tag">首页</el-tag>
                  <el-tag v-for="tag in industryHomeTags(row.page_type)" :key="tag" size="small" type="warning" effect="plain" class="pm-home-tag">{{ tag }}</el-tag>
                  <el-tag v-if="row.status === 1" size="small" type="info" effect="plain">已发布</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="是否首页" width="110">
                <template #default="{ row }">
                  <span class="pm-home-switch" :class="{ 'is-home': row.isHome }" @click="setHome(row)">{{ row.isHome ? '是' : '否' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="头部展示" width="120">
                <template #default="{ row }">
                  {{ { custom: '自定义头部', immersive: '沉浸式头部', official: '仿官方头部' }[row.headerType] || '仿官方头部' }}
                </template>
              </el-table-column>
              <el-table-column label="密码访问" width="110">
                <template #default="{ row }">
                  <el-tag :type="row.passwordEnabled ? 'warning' : 'info'" size="small" effect="plain">{{ row.passwordEnabled ? '开' : '关' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="会员访问" width="110">
                <template #default="{ row }">
                  <el-tag :type="row.memberOnly ? 'warning' : 'info'" size="small" effect="plain">{{ row.memberOnly ? '开' : '关' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="290">
                <template #default="{ row }">
                  <div class="pm-ops">
                    <el-button size="small" text type="primary" @click="goEdit(row.page_type)">装修</el-button>
                    <el-button size="small" text @click="copyPage(row)">复制</el-button>
                    <el-button size="small" text @click="sharePage(row)">推广</el-button>
                    <el-button size="small" text type="primary" @click="openIndustryHome(row)">设置为…</el-button>
                    <el-button size="small" text type="danger" :disabled="builtinPages.includes(row.page_type)" @click="deletePage(row)">删除</el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
            <div class="pm-drag-tip">按住行首 ⠿ 拖动可调整页面顺序</div>
          <div v-if="!filteredPages.length && !pageLoading" class="media-empty">暂无页面，点击「新建页面」创建</div>
          <div v-else-if="filteredPages.length > pmPageSize" class="pm-pager">
            <el-pagination background layout="total, prev, pager, next, jumper" :total="filteredPages.length" :page-size="pmPageSize" :current-page="pageNum" @current-change="pageNum = $event" />
          </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 行内「设置为…」行业首页弹窗 -->
    <el-dialog v-model="industryHomeDialog.show" :title="`设置为…（${industryHomeDialog.row ? industryHomeDialog.row.page_name : ''}）`" width="440px" append-to-body>
      <div class="ind-desc">将该页面设为某行业应用的首页；同一行业应用只保留一个首页，设置后原首页身份自动取消。不影响「首页」（统一默认首页）。</div>
      <div class="ind-list">
        <div v-for="app in INDUSTRY_APPS" :key="app.appCode" class="ind-item">
          <div class="ind-name">{{ app.name }}首页</div>
          <el-button size="small" type="primary" plain :loading="industryHomeDialog.saving" @click="setIndustryHome(app)">设为{{ app.name }}首页</el-button>
        </div>
      </div>
      <template #footer><el-button @click="industryHomeDialog.show = false">取消</el-button></template>
    </el-dialog>

    <!-- 素材选择弹窗（统一素材选择器：本地上传/网络提取/搜索/分类/分页） -->
    <MaterialPicker v-model="imgSel.show" @confirm="confirmImgSel" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted, inject } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { EditPen, Delete, Close } from '@element-plus/icons-vue';
import SIcon from '../../../../components/SIcon.vue';
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import ComponentRender from './ComponentRender.vue';
import MaterialPicker from './MaterialPicker.vue';
import PeColorPicker from './PeColorPicker.vue';
import { designCall } from '../../../../api';
import { STYLE_SCHEMES, DEFAULT_STYLE, applyScheme, headPreviewStyle, hexA } from '../../../../utils/designStyle.js';
// 系统风格预览素材（1:1 菜鸟云：商品列表/商品详情/商品订单 三窗 + 头部状态栏图）
import previewList from '../../../../assets/design-preview/choose_style_img.png';
import previewDetail from '../../../../assets/design-preview/choose_style_img2.png';
import previewOrder from '../../../../assets/design-preview/choose_style_img3.png';
import previewTop1 from '../../../../assets/design-preview/choose_style_top1.png';
import previewTop2 from '../../../../assets/design-preview/choose_style_top2.png';
import av0 from '../../../../assets/design-preview/avatars/av0.png';
import av1 from '../../../../assets/design-preview/avatars/av1.png';
import av2 from '../../../../assets/design-preview/avatars/av2.png';
import av3 from '../../../../assets/design-preview/avatars/av3.png';
import av4 from '../../../../assets/design-preview/avatars/av4.png';

const tabs = [
  { key: 'page', label: '页面装修', icon: 'dynamic' },
  { key: 'style', label: '系统风格', icon: 'palette' },
  { key: 'tabs', label: '底部导航', icon: 'apps' },
  { key: 'media', label: '素材中心', icon: 'storage' },
  { key: 'template', label: '系统模板', icon: 'template' },
  { key: 'home', label: '首页跳转', icon: 'dashboard' },
];
const activeTab = ref('page');

// 子 Tab 联动面包屑：面包屑随当前 Tab 变化（设计中心 / 页面装修）
const crumbExtra = inject('crumbExtra', null);
watch(activeTab, (k) => {
  const t = tabs.find((x) => x.key === k);
  crumbExtra?.set(t ? t.label : '');
}, { immediate: true });
onUnmounted(() => crumbExtra?.set(''));

const API = '/design';
const MAT = '/material';
const router = useRouter();

// 页面装修（云菜鸟 moban 风格）：顶部手机真实预览 + 操作条 + 页面表格
const pageList = ref([]);
const pageLoading = ref(false);
const pageSearch = ref('');
const homePreview = ref([]);
const homeName = ref('首页');
const homeUpdated = ref('');
const pagePreviewUrl = ref('');
const builtinPages = ['home', 'card', 'dynamic', 'mine', 'mall-home'];
async function loadPages() {
  pageLoading.value = true;
  try {
    const res = await designCall.get(`${API}/page/list`);
    pageList.value = res.list || [];
    mergedPages.value = mergePages(pageList.value);
    await loadHomePreview();
  } catch (e) { ElMessage.error(e); } finally { pageLoading.value = false; }
}
async function loadHomePreview() {
  try {
    const home = pageList.value.find((p) => p.isHome) || pageList.value.find((p) => p.page_type === 'home');
    const homeType = home?.page_type || 'home';
    const [pubRes, draftRes, pvRes] = await Promise.all([
      designCall.get(`${API}/page/detail`, { params: { pageType: homeType, published: 1 } }),
      designCall.get(`${API}/page/detail`, { params: { pageType: homeType, published: 0 } }),
      designCall.get(`${API}/previewUrl`),
    ]);
    const src = draftRes.page || pubRes.page;
    if (src) {
      homeName.value = src.page_name || '首页';
      homeUpdated.value = (src.updated_at || '').slice(0, 16);
      homePreview.value = (src.design_json?.components || []).slice(0, 12);
    } else {
      homeName.value = '首页';
      homePreview.value = [];
    }
    if (pvRes && pvRes.url) pagePreviewUrl.value = pvRes.url;
  } catch (e) { /* 预览加载失败不阻塞 */ }
}
const homePageType = computed(() => pageList.value.find((p) => p.isHome)?.page_type || 'home');
function editHome() { goEdit(homePageType.value); }
async function renameTemplate() {
  try {
    const { value } = await ElMessageBox.prompt('请输入模板名称（当前首页名称）', '重命名模板', { inputValue: homeName.value, inputPattern: /\S+/, inputErrorMessage: '名称不能为空' });
    await designCall.post(`${API}/page/rename`, { pageType: homePageType.value, pageName: value });
    ElMessage.success('模板已重命名');
    homeName.value = value;
    loadPages();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}
async function openPreview() {
  try {
    if (!pagePreviewUrl.value) {
      const pv = await designCall.get(`${API}/previewUrl`);
      pagePreviewUrl.value = pv.url || '';
    }
    if (pagePreviewUrl.value) window.open(pagePreviewUrl.value, '_blank');
  } catch (e) { ElMessage.error(e); }
}
async function sharePage(p) {
  try {
    if (!pagePreviewUrl.value) {
      const pv = await designCall.get(`${API}/previewUrl`);
      pagePreviewUrl.value = pv.url || '';
    }
    await ElMessageBox.alert(`页面「${p.page_name}」推广链接（带签名预览，30 分钟内有效）：\n\n${pagePreviewUrl.value || '预览链接生成失败'}`, '推广', { confirmButtonText: '复制链接' }).catch(() => {});
    if (pagePreviewUrl.value) {
      try { await navigator.clipboard.writeText(pagePreviewUrl.value); ElMessage.success('已复制推广链接'); } catch { /* 剪贴板不可用 */ }
    }
  } catch (e) { ElMessage.error(e); }
}
// 同 page_type 合并为一行（发布态优先），避免草稿+发布显示两行；合并结果为响应式数组，支持拖拽排序 splice 重排
const mergedPages = ref([]);
function mergePages(list) {
  const map = new Map();
  for (const p of list || []) {
    const exist = map.get(p.page_type);
    if (!exist || (p.status === 1 && exist.status !== 1)) map.set(p.page_type, p);
  }
  return [...map.values()];
}
// 页面列表拖拽排序（el-table 行）：容器事件委托 + 行 index→全局索引 → drop 一次性重排提交
const pageDrag = ref(null);
function pageGlobalIdx(rowIdx) { return (pageNum.value - 1) * pmPageSize + rowIdx; }
function pageTrIdx(e) {
  const tr = e.target.closest('tr');
  const body = tr && tr.parentElement;
  if (!body) return -1;
  return [...body.children].indexOf(tr);
}
function onPageRowDragStart(e) {
  const idx = pageTrIdx(e);
  if (idx < 0) return;
  pageDrag.value = { from: pageGlobalIdx(idx), over: pageGlobalIdx(idx) };
  e.dataTransfer.effectAllowed = 'move';
}
function onPageRowDragOver(e) {
  if (!pageDrag.value) return;
  const idx = pageTrIdx(e);
  if (idx < 0) return;
  pageDrag.value.over = pageGlobalIdx(idx);
  e.preventDefault();
}
function pageRowClassName({ rowIndex }) {
  const gi = pageGlobalIdx(rowIndex);
  return pageDrag.value && pageDrag.value.over === gi ? 'pm-drop-target' : '';
}
async function onPageRowDrop() {
  const d = pageDrag.value;
  pageDrag.value = null;
  if (!d || d.from === d.over || d.over < 0) return;
  const arr = mergedPages.value;
  const [moved] = arr.splice(d.from, 1);
  arr.splice(d.over, 0, moved);
  try {
    await designCall.post(`${API}/page/sort`, { pageTypes: mergedPages.value.map((p) => p.page_type) });
    ElMessage.success('页面顺序已保存');
  } catch (e) { ElMessage.error(e); }
}
function onPageRowDragEnd() { pageDrag.value = null; }
const filteredPages = computed(() => {
  const kw2 = pageSearch.value.trim();
  if (!kw2) return mergedPages.value;
  return mergedPages.value.filter((p) => (p.page_name || '').includes(kw2));
});
const pageNum = ref(1);
const pmPageSize = 10;
const pagedPages = computed(() => {
  const start = (pageNum.value - 1) * pmPageSize;
  return filteredPages.value.slice(start, start + pmPageSize);
});
// el-table 行 draggable 需在渲染后设置；数据变化/首次挂载后重设（必须在 pagedPages 声明之后）
function setupRowDraggable() {
  nextTick(() => {
    const el = document.querySelector('.table-scroll .el-table');
    if (!el) return;
    el.querySelectorAll('tbody tr').forEach((tr) => { tr.draggable = true; });
  });
}
watch(pagedPages, setupRowDraggable);
onMounted(setupRowDraggable);
function goEdit(type) {
  router.push({ path: '/design/edit', query: { pageType: type || 'home' } });
}
async function createPage() {
  try {
    const { value } = await ElMessageBox.prompt('请输入页面名称', '新建页面', { inputValue: `新页面 ${pageList.value.length + 1}`, inputPattern: /\S+/, inputErrorMessage: '页面名称不能为空' });
    const res = await designCall.post(`${API}/page/create`, { pageName: value });
    ElMessage.success('页面已创建');
    loadPages();
    if (res.pageType) goEdit(res.pageType);
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}
async function renamePage(p) {
  try {
    const { value } = await ElMessageBox.prompt('请输入新页面名称', '重命名页面', { inputValue: p.page_name, inputPattern: /\S+/, inputErrorMessage: '页面名称不能为空' });
    await designCall.post(`${API}/page/rename`, { pageType: p.page_type, pageName: value });
    ElMessage.success('已重命名');
    loadPages();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}
async function copyPage(p) {
  try {
    const res = await designCall.post(`${API}/page/copy`, { pageType: p.page_type });
    ElMessage.success('已复制');
    loadPages();
    if (res.pageType) goEdit(res.pageType);
  } catch (e) { ElMessage.error(e); }
}
async function deletePage(p) {
  try { await ElMessageBox.confirm(`确认删除页面「${p.page_name}」？删除后不可恢复`, '删除确认', { type: 'warning' }); } catch { return; }
  try {
    await designCall.post(`${API}/page/delete`, { pageType: p.page_type });
    ElMessage.success('已删除');
    loadPages();
  } catch (e) { ElMessage.error(e); }
}
// ============ 行内「设置为…」行业首页（home_pages 按应用，互斥覆盖；不影响 is_home 统一默认首页） ============
const INDUSTRY_APPS = [
  { appCode: 'goods', name: '商城', path: (pt) => `/pages/mall/index?pageType=${pt}` },
  { appCode: 'card', name: '智能名片', path: (pt) => `/pages/cardMain/home?pageType=${pt}` },
  { appCode: 'panorama', name: '360全景', path: (pt) => `/pages/panorama/home?pageType=${pt}` },
];
const industryHomeDialog = reactive({ show: false, row: null, saving: false });
function openIndustryHome(row) {
  industryHomeDialog.row = row;
  industryHomeDialog.show = true;
}
function industryHomeTags(pageType) {
  if (!pageType) return [];
  const tags = [];
  for (const app of INDUSTRY_APPS) {
    const v = homePages.value[app.appCode] || '';
    if (v && v.includes(`pageType=${pageType}`)) tags.push(`${app.name}首页`);
  }
  return tags;
}
async function setIndustryHome(app) {
  const row = industryHomeDialog.row;
  if (!row) return;
  const old = homePages.value[app.appCode];
  if (old && old.includes(`pageType=${row.page_type}`)) {
    ElMessage.info(`「${row.page_name}」已是${app.name}首页`);
    return;
  }
  industryHomeDialog.saving = true;
  try {
    homePages.value[app.appCode] = app.path(row.page_type);
    await saveHome();
    ElMessage.success(`已将「${row.page_name}」设为${app.name}首页（原${app.name}首页身份已取消）`);
    industryHomeDialog.show = false;
  } catch (e) { ElMessage.error(e); } finally { industryHomeDialog.saving = false; }
}

// ============ 系统模板分类（动态去重） ============
const tplCat = ref('');
const tplCategories = computed(() => [...new Set(templates.value.map((t) => t.category).filter(Boolean))]);
const filteredTemplates = computed(() => (tplCat.value ? templates.value.filter((t) => t.category === tplCat.value) : templates.value));

// 系统模板手机壳线框缩略：按模板 JSON 的组件结构自动生成低保真示意
function thumbHtml(t) {
  try {
    const json = typeof t.template_json === 'string' ? JSON.parse(t.template_json) : t.template_json;
    const page = json && json.pages && Object.values(json.pages)[0];
    const comps = (page && page.components) || [];
    const ACC = 'rgba(22,93,255,0.14)';
    const LINE = '#e5e6eb';
    const out = [];
    const row = (h, bg, r = 3, m = '4px 6px') => `<div style="height:${h}px;background:${bg};border-radius:${r}px;margin:${m}"></div>`;
    for (const c of comps) {
      const p = c.props || {};
      switch (c.type) {
        case 'search': out.push(row(11, '#f2f3f5', 6)); break;
        case 'swiper': out.push(row(32, ACC, 4)); break;
        case 'notice': out.push(row(8, LINE, 2, '3px 8px')); break;
        
        case 'title-bar':
          out.push(`<div style="display:flex;align-items:center;gap:4px;margin:5px 6px 3px;"><div style="width:26px;height:6px;background:#1d2129;border-radius:2px;"></div><div style="flex:1;height:5px;background:${LINE};border-radius:2px;"></div><div style="width:12px;height:5px;background:${LINE};border-radius:2px;"></div></div>`);
          break;
        
        case 'image': out.push(row(26, ACC, 3)); break;
        case 'image-text':
          out.push(`<div style="display:flex;gap:5px;margin:4px 6px;align-items:center;"><div style="width:26px;height:20px;background:${ACC};border-radius:3px;"></div><div style="flex:1;"><div style="height:6px;background:#1d2129;border-radius:2px;"></div><div style="height:5px;background:${LINE};border-radius:2px;margin-top:3px;"></div></div></div>`);
          break;
        case 'rich-text':
          out.push(row(6, LINE, 2, '4px 8px')); out.push(row(6, LINE, 2, '2px 8px')); break;
        case 'grid-nav': {
          let cells = '';
          for (let i = 0; i < 4; i++) cells += `<div style="height:12px;background:${ACC};border-radius:3px;"></div>`;
          out.push(`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin:4px 6px;">${cells}</div>`);
          break;
        }
        case 'article-list':
        case 'pic-list':
        case 'video-list':
          out.push(`<div style="display:flex;gap:5px;margin:4px 6px;align-items:center;"><div style="width:24px;height:20px;background:${LINE};border-radius:3px;"></div><div style="flex:1;"><div style="height:6px;background:#1d2129;border-radius:2px;"></div><div style="height:5px;background:${LINE};border-radius:2px;margin-top:3px;"></div></div></div>`);
          break;
        case 'banner':
        case 'image-card': out.push(row(28, ACC, 4)); break;
        case 'button': out.push(row(12, ACC, 6, '4px 24px')); break;
        case 'section-divider': out.push(row(2, LINE, 1, '6px 6px')); break;
        default: out.push(row(10, LINE, 2, '4px 8px'));
      }
    }
    return out.join('');
  } catch (e) { return ''; }
}

async function setHome(row) {
  if (row.isHome) return;
  try {
    await designCall.post(`${API}/page/setHome`, { id: row.id });
    ElMessage.success(`已切换首页为「${row.page_name}」`);
    pageNum.value = 1;
    loadPages();
  } catch (e) { ElMessage.error(e); }
}
function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function fmtSize(b) {
  const n = Number(b) || 0;
  if (n < 1024) return n + 'B';
  if (n < 1048576) return (n / 1024).toFixed(1) + 'KB';
  return (n / 1048576).toFixed(1) + 'MB';
}

// ============ 素材中心 ============
const categories = ref([]);
const materials = ref([]);
const total = ref(0);
const totalAll = ref(0);
const uncatCount = ref(0);
const page = ref(1);
const pageSize = 20;
const catFilter = ref('');
const keyword = ref('');
const loading = ref(false);
const batchMode = ref(false);
const batchIds = ref([]);
const fileInput = ref(null);
const previewShow = ref(false);
const previewUrl = ref('');
const previewType = ref('');
const catDialog = reactive({ show: false, id: null, name: '' });
const catSaving = ref(false);
const moveShow = ref(false);
const moveTarget = ref(null);
const moveIds = ref([]);
const moving = ref(false);

async function loadCategories() {
  try {
    const res = await designCall.get(`${MAT}/category/list`);
    categories.value = res.list || [];
  } catch (e) { ElMessage.error(e); }
}
async function loadMaterials() {
  loading.value = true;
  try {
    const res = await designCall.get(`${MAT}/list`, { params: { categoryId: catFilter.value === 'uncat' ? 0 : catFilter.value || undefined, keyword: keyword.value || undefined, page: page.value, pageSize } });
    materials.value = res.list || [];
    total.value = res.total || 0;
    const all = await designCall.get(`${MAT}/list`, { params: { page: 1, pageSize: 1 } });
    totalAll.value = all.total || 0;
    const uncat = await designCall.get(`${MAT}/list`, { params: { categoryId: 0, page: 1, pageSize: 1 } });
    uncatCount.value = uncat.total || 0;
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}
function uploadPick() { fileInput.value?.click(); }
async function onFileChange(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length) return;
  for (const f of files) {
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('categoryId', catFilter.value && catFilter.value !== 'uncat' ? catFilter.value : '');
      await designCall.post(`${MAT}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    } catch (err) { ElMessage.error(`${f.name} 上传失败：${err}`); }
  }
  ElMessage.success(`已上传 ${files.length} 个素材`);
  loadMaterials();
}
function toggleBatch(m) {
  if (!batchMode.value) return;
  const i = batchIds.value.indexOf(m.id);
  if (i >= 0) batchIds.value.splice(i, 1); else batchIds.value.push(m.id);
}
function preview(m) { previewUrl.value = resolveUrl(m.file_url); previewType.value = m.file_type || ''; previewShow.value = true; }
async function copyLink(m) {
  try { await navigator.clipboard.writeText(resolveUrl(m.file_url)); ElMessage.success('链接已复制'); }
  catch { ElMessage.warning('复制失败，请手动复制地址'); }
}
async function delMaterial(m) {
  if (m.ref_count > 0) { ElMessage.warning('该素材正被页面/导航/风格引用，无法删除'); return; }
  try { await ElMessageBox.confirm(`确认删除素材「${m.file_name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try { await designCall.post(`${MAT}/delete`, { id: m.id }); ElMessage.success('已删除'); loadMaterials(); } catch (e) { ElMessage.error(e); }
}
function openNewCategory() { Object.assign(catDialog, { show: true, id: null, name: '' }); }
function renameCat(c) { Object.assign(catDialog, { show: true, id: c.id, name: c.category_name }); }
async function saveCat() {
  if (!catDialog.name.trim()) { ElMessage.warning('请输入分类名称'); return; }
  catSaving.value = true;
  try {
    await designCall.post(`${MAT}/category/save`, { id: catDialog.id || undefined, name: catDialog.name });
    catDialog.show = false; ElMessage.success('已保存'); loadCategories();
  } catch (e) { ElMessage.error(e); } finally { catSaving.value = false; }
}
async function delCat(c) {
  try { await ElMessageBox.confirm(`确认删除分类「${c.category_name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try { await designCall.post(`${MAT}/category/delete`, { id: c.id }); ElMessage.success('已删除'); loadCategories(); loadMaterials(); } catch (e) { ElMessage.error(e); }
}
function openMove(m) { moveIds.value = [m.id]; moveTarget.value = m.category_id; moveShow.value = true; }
function openBatchMove() { moveIds.value = [...batchIds.value]; moveTarget.value = null; moveShow.value = true; }
async function doMove() {
  moving.value = true;
  try {
    await designCall.post(`${MAT}/move`, { ids: moveIds.value, categoryId: moveTarget.value });
    ElMessage.success('已移动'); moveShow.value = false; batchIds.value = []; loadMaterials();
  } catch (e) { ElMessage.error(e); } finally { moving.value = false; }
}
async function batchDelete() {
  try { await ElMessageBox.confirm(`确认删除选中的 ${batchIds.value.length} 个素材？被引用的素材将跳过`, '批量删除', { type: 'warning' }); } catch { return; }
  let ok = 0, skip = 0;
  for (const id of batchIds.value) {
    try { await designCall.post(`${MAT}/delete`, { id }); ok++; } catch { skip++; }
  }
  ElMessage.success(`删除 ${ok} 个${skip ? `，跳过 ${skip} 个被引用素材` : ''}`);
  batchIds.value = []; loadMaterials();
}

// ============ 系统风格（1:1 菜鸟云） ============
// 14 套预设配色 / 默认玫红 / applyScheme / 头部预览联动 见 utils/designStyle.js（配测试）
const style = reactive({ ...DEFAULT_STYLE });
const styleSaving = ref(false);
function pickScheme(n) {
  Object.assign(style, applyScheme({ ...style }, n));
}
// 预览头部样式：跟随主色→主题色底+头部文字色；白色头部→白底，切过去瞬间强制黑（菜鸟云实测规则，2026-09-17 定案）
const headTextTouched = ref(false);
function onHeadColorChange(v) {
  // 每次切换头部颜色都重置：切白头部瞬间若 radio=白 → 渲染强制黑（radio 值不动）；
  // 之后用户点击文字选项 → 按 radio 值渲染（白头部+白字可生效）；切回跟随主色同理重置
  headTextTouched.value = false;
}
function dsHeadStyle() {
  const forceBlack = style.headColor === '2' && !headTextTouched.value;
  return headPreviewStyle(style, forceBlack);
}
// 头部状态栏图：按最终渲染的文字颜色切换（黑→top2 白底黑字，白→top1 主题色底）——与菜鸟云 choose_style_top 联动一致
const headTopImg = computed(() => (dsHeadStyle().color === '#000000' ? previewTop2 : previewTop1));
// 邀请区头像素材（菜鸟云 stylediy 同款，1:1）
const avatars = [av0, av1, av2, av3, av4];
// 商品名下方标签行（菜鸟云 W2 同款：推荐/新品/热卖/促销/限量）
const tagList = ['推荐', '新品', '热卖', '促销', '限量'];
async function loadStyle() {
  try {
    const res = await designCall.get(`${API}/style/get`);
    const s = res.style || {};
    // 新格式（含配色方案）才合并；旧格式（无 colorScheme）按新默认覆盖（存量覆盖策略）
    if (s && typeof s.colorScheme !== 'undefined' && s.colorScheme !== null) {
      const { radius, buttonStyle, bgColor, bgImage, ...rest } = s;
      Object.assign(style, rest);
    }
  } catch (e) { /* 风格加载失败不阻塞 */ }
}
async function saveStyle() {
  styleSaving.value = true;
  try {
    const { bgColor, bgImage, radius, buttonStyle, ...stylePayload } = style;
    await designCall.post(`${API}/style/save`, { style: { ...stylePayload } });
    ElMessage.success('风格已保存，小程序端将按最新配置渲染');
  } catch (e) { ElMessage.error(e); } finally { styleSaving.value = false; }
}

// ============ 底部导航 ============
const tabSchemes = ref([]);
const tabLoading = ref(false);
const schemeShow = ref(false);
const schemeSaving = ref(false);
const schemeForm = reactive({ id: null, scheme_name: '', items: [] });
async function loadTabSchemes() {
  tabLoading.value = true;
  try {
    const res = await designCall.get(`${API}/tab/list`);
    tabSchemes.value = res.list || [];
  } catch (e) { ElMessage.error(e); } finally { tabLoading.value = false; }
}
function tabCount(row) {
  try { return JSON.parse(row.tab_json || '[]').length; } catch { return 0; }
}
function openTabScheme(row) {
  if (row) {
    let items = [];
    try { items = JSON.parse(row.tab_json || '[]'); } catch { items = []; }
    Object.assign(schemeForm, { id: row.id, scheme_name: row.scheme_name, items });
  } else {
    Object.assign(schemeForm, { id: null, scheme_name: '', items: [{ text: '首页', icon: '', url: '/pages/card/myCard' }, { text: '集市', icon: '', url: '/pages/card/market' }] });
  }
  schemeShow.value = true;
}
async function saveTabScheme() {
  if (!schemeForm.scheme_name.trim()) { ElMessage.warning('请输入方案名称'); return; }
  schemeSaving.value = true;
  try {
    await designCall.post(`${API}/tab/save`, { id: schemeForm.id || undefined, name: schemeForm.scheme_name, tabJson: schemeForm.items });
    schemeShow.value = false; ElMessage.success('已保存'); loadTabSchemes();
  } catch (e) { ElMessage.error(e); } finally { schemeSaving.value = false; }
}
async function setDefault(row) {
  try { await designCall.post(`${API}/tab/setDefault`, { id: row.id }); ElMessage.success('已设为默认导航'); loadTabSchemes(); } catch (e) { ElMessage.error(e); }
}
async function copyTabScheme(row) {
  try { await designCall.post(`${API}/tab/copy`, { id: row.id }); ElMessage.success('已复制'); loadTabSchemes(); } catch (e) { ElMessage.error(e); }
}
async function toggleTabScheme(row) {
  try { await designCall.post(`${API}/tab/save`, { id: row.id, enabled: row.enabled ? 0 : 1 }); loadTabSchemes(); } catch (e) { ElMessage.error(e); }
}
async function delTabScheme(row) {
  try { await ElMessageBox.confirm(`确认删除导航方案「${row.scheme_name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try { await designCall.post(`${API}/tab/delete`, { id: row.id }); ElMessage.success('已删除'); loadTabSchemes(); } catch (e) { ElMessage.error(e); }
}

// ============ 首页跳转（按应用维度化：1:1 复刻菜鸟云页面选择器，每个行业应用单独配置） ============
const homePages = ref({});
const homeSaving = ref(false);
const homePicker = ref({ show: false, appCode: 'card', value: '' });

// 行业应用清单：每个应用可选启动页（含该应用的页面 + DIY 装修页面归属 card）
const HOME_APPS = [
  { appCode: 'card', name: '智能名片', icon: 'card' },
  { appCode: 'panorama', name: '360全景', icon: 'panorama' },
  { appCode: 'goods', name: '商城', icon: 'show' },
];

// 每个应用的可选页面分组（card：名片页面 + DIY 装修页面；panorama：全景页面）
const CARD_PAGES = [
  { value: '/pages/cardMain/home', label: '名片首页（默认）', icon: 'card' },
  { value: '/pages/card/market', label: '人脉集市', icon: 'market' },
  { value: '/pages/card/visitors', label: '访客雷达', icon: 'radar' },
  { value: '/pages/card/member', label: '会员中心', icon: 'crown' },
  { value: '/pages/card/distribution', label: '分销中心', icon: 'wallet' },
  { value: '/pages/card/customers', label: '客户管理', icon: 'customer' },
  { value: '/pages/card/connections', label: '名片交换', icon: 'exchange' },
  { value: '/pages/card/dynamic', label: '我的动态', icon: 'dynamic' },
  { value: '/pages/card/messages', label: '消息中心', icon: 'sms' },
  { value: '/pages/card/myCard', label: '我的名片', icon: 'card' },
  { value: '/pages/card/profile', label: '我的', icon: 'user' },
];
const PANORAMA_PAGES = [
  { value: '/pages/panorama/index', label: '360全景首页', icon: 'panorama', desc: '360°全景方案列表（全景应用内首页）' },
  { value: '/pages/viewer/viewer', label: '360全景浏览', icon: 'panorama', desc: '直接进入全景浏览' },
];
const GOODS_PAGES = [
  { value: '/pages/mall/index', label: '商城首页', icon: 'show', desc: '建设中，暂为占位页' },
];

// 弹窗分组：card 含「装修页面」（已建 DIY 页面动态）
function groupsFor(appCode) {
  if (appCode === 'card') {
    return [
      { name: '智能名片', items: CARD_PAGES },
      {
        name: '装修页面',
        items: (pageList.value && pageList.value.length ? pageList.value : []).map((p) => ({
          value: `/pages/cardMain/home?pageType=${p.page_type}`,
          label: p.page_name || p.page_type,
          icon: 'template',
          desc: p.is_home ? '当前 DIY 首页' : 'DIY 装修页面',
        })),
      },
    ];
  }
  if (appCode === 'panorama') return [{ name: '360全景', items: PANORAMA_PAGES }];
  if (appCode === 'goods') return [{ name: '商城', items: GOODS_PAGES }];
  return [];
}

function homeLabel(appCode) {
  const v = homePages.value[appCode];
  if (!v) return '未设置（展示应用默认首页）';
  for (const g of groupsFor(appCode)) {
    const hit = g.items.find((it) => it.value === v);
    if (hit) return `${g.name} / ${hit.label}`;
  }
  return v;
}

const homePickerAppName = computed(() => HOME_APPS.find((a) => a.appCode === homePicker.value.appCode)?.name || '');

// 旧 key 兼容映射（存量配置 card/market/radar/member/distribution → 新路径）
const LEGACY_HOME_KEYS = {
  card: '/pages/cardMain/home',
  market: '/pages/card/market',
  radar: '/pages/card/visitors',
  member: '/pages/card/member',
  distribution: '/pages/card/distribution',
};

function openHomePicker(appCode) {
  const cur = LEGACY_HOME_KEYS[homePages.value[appCode]] || homePages.value[appCode] || '';
  homePicker.value = { show: true, appCode, value: cur };
}
function confirmHomePicker() {
  homePages.value[homePicker.value.appCode] = homePicker.value.value;
  homePicker.value.show = false;
}
async function loadHome() {
  try {
    const res = await designCall.get(`${API}/home/get`);
    const pages = res.homePages || {};
    const out = {};
    for (const app of HOME_APPS) {
      const raw = pages[app.appCode] || '';
      if (raw === 'card') out[app.appCode] = '';
      else if (LEGACY_HOME_KEYS[raw]) out[app.appCode] = LEGACY_HOME_KEYS[raw];
      else out[app.appCode] = raw;
    }
    homePages.value = out;
  } catch (e) { /* 忽略 */ }
}
async function saveHome() {
  homeSaving.value = true;
  try {
    await designCall.post(`${API}/home/save`, { homePages: homePages.value });
    ElMessage.success('已保存');
  } catch (e) { ElMessage.error(e); } finally { homeSaving.value = false; }
}

// ============ 系统模板 ============
const tplScope = ref('public');
const templates = ref([]);
const tplLoading = ref(false);
const importInput = ref(null);
async function loadTemplates() {
  tplLoading.value = true;
  try {
    const res = await designCall.get(`${API}/template/${tplScope.value === 'public' ? 'publicList' : 'myList'}`);
    templates.value = res.list || [];
  } catch (e) { ElMessage.error(e); } finally { tplLoading.value = false; }
}
function buildTemplateJson() {
  return {
    style: { ...style },
    homePages: homePages.value,
    tabs: tabSchemes.value.filter((t) => t.is_default).map((t) => ({ name: t.scheme_name, items: (() => { try { return JSON.parse(t.tab_json); } catch { return []; } })() })),
    pages: {},
    materialIds: [],
  };
}
async function saveAsTemplate() {
  try {
    const { value } = await ElMessageBox.prompt('请输入模板名称', '存为模板', { inputValue: `我的模板 ${new Date().toISOString().slice(0, 10)}`, inputPattern: /\S+/, inputErrorMessage: '模板名称不能为空' });
    await designCall.post(`${API}/template/saveMy`, { name: value, templateJson: buildTemplateJson() });
    ElMessage.success('模板已保存到「我的模板」');
  } catch (e) { if (e !== 'cancel') ElMessage.error(e); }
}
async function exportTemplate(t) {
  try {
    const detail = await designCall.post(`${API}/template/export`, { id: t.id });
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${detail.template_name || t.template_name}.json`; a.click();
    URL.revokeObjectURL(url);
  } catch (e) { ElMessage.error(e); }
}
function importTemplate() { importInput.value?.click(); }
async function onImport(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    const text = await f.text();
    const json = JSON.parse(text);
    const { value } = await ElMessageBox.prompt('请输入模板名称', '导入模板', { inputValue: json.template_name || f.name.replace(/\.json$/, ''), inputPattern: /\S+/, inputErrorMessage: '模板名称不能为空' });
    const payload = { name: value, templateJson: { style: json.style, homePages: json.homePages || (json.homePage ? { card: json.homePage } : undefined), tabs: json.tabs, pages: json.pages } };
    if (payload.templateJson.homePages === undefined) delete payload.templateJson.homePages;
    await designCall.post(`${API}/template/import`, payload);
    ElMessage.success('模板导入成功');
  } catch (err) { ElMessage.error('导入失败：' + (err || 'JSON 格式不正确')); }
}
async function applyTemplate(t) {
  try { await ElMessageBox.confirm(`基于模板「${t.template_name}」新建页面，不影响现有页面，确认继续？`, '应用模板', { type: 'warning' }); } catch { return; }
  try {
    const res = await designCall.post(`${API}/template/applyAsNew`, { id: t.id });
    ElMessage.success(`已新建页面「${res.pageName || t.template_name}」`);
    loadPages();
    if (res.pageType) goEdit(res.pageType);
  } catch (e) { ElMessage.error(e); }
}
async function delTemplate(t) {
  try { await ElMessageBox.confirm(`确认删除模板「${t.template_name}」？`, '删除确认', { type: 'warning' }); } catch { return; }
  try { await designCall.post(`${API}/template/delete`, { id: t.id }); ElMessage.success('已删除'); loadTemplates(); } catch (e) { ElMessage.error(e); }
}

// ============ 素材选择弹窗 ============
const imgSel = reactive({ show: false, target: null, targetIdx: null });
function openImageSelect(target, idx) {
  imgSel.target = target;
  imgSel.targetIdx = idx ?? null;
  imgSel.show = true;
}
function confirmImgSel(url) {
  if (url) {
    if (imgSel.target === 'tab' && imgSel.targetIdx !== null) schemeForm.items[imgSel.targetIdx].icon = url;
  }
  imgSel.show = false;
}

onMounted(() => {
  loadCategories(); loadMaterials();
  loadStyle(); loadTabSchemes(); loadHome(); loadTemplates();
  loadPages();
});
</script>

<style scoped>
/* 页面装修（云菜鸟 moban 风格：顶部手机真实预览 + 操作条 + 表格） */
.page-manage { width: 100%; }
.pm-layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; align-items: start; }
.pm-left { background: #fff; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.pm-tpl-head { display: flex; align-items: center; gap: 8px; width: 100%; }
.pm-use-tag { font-size: 11px; color: #165dff; background: #e8f3ff; border-radius: 10px; padding: 2px 8px; line-height: 16px; flex-shrink: 0; }
.pm-tpl-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.pm-update { font-size: 12px; color: #86909c; width: 100%; }
.pm-phone { width: 270px; background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,.08), 0 0 0 1px #e5e6eb; }
.pm-status { height: 24px; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; font-size: 11px; font-weight: 600; color: #1d2129; }
.pm-ps-icons { display: flex; align-items: center; gap: 4px; }
.pm-iframe-wrap { width: 270px; height: 518px; overflow: hidden; }
.pm-iframe { display: block; width: 375px; height: 720px; border: 0; background: #fff; transform: scale(0.72); transform-origin: top left; }
.pm-canvas { min-height: 380px; padding: 10px; background: #fff; }
.pm-comp { margin-bottom: 8px; }
.pm-empty { color: #86909c; text-align: center; padding: 60px 0; font-size: 12px; }
.pm-right { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.pm-toolbar { width: 100%; display: flex; align-items: center; gap: 8px; background: #fff; border-radius: 8px; padding: 12px 16px; box-sizing: border-box; flex-wrap: wrap; }
.pm-count { font-size: 12px; color: #86909c; }
.pm-toolbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.table-scroll { width: 100%; background: #fff; border-radius: 8px; padding: 16px; box-sizing: border-box; }
.pm-row-name { font-weight: 500; color: #1d2129; margin-right: 6px; }
.pm-ops { display: flex; align-items: center; white-space: nowrap; }
.pm-ops .el-button { margin-left: 0; margin-right: 2px; padding: 4px 5px; }
.pm-home-tag { margin-right: 4px; }
.pm-home-switch { display: inline-block; min-width: 32px; text-align: center; padding: 2px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; user-select: none; color: #86909c; background: #f2f3f5; border: 1px solid #e5e6eb; }
.pm-home-switch:hover { color: #165dff; border-color: #165dff; background: #e8f3ff; }
.pm-home-switch.is-home { color: #fff; background: #00b42a; border-color: #00b42a; cursor: default; }
.pm-home-switch.is-home:hover { color: #fff; background: #00b42a; }
.pm-row-drag { display: inline-block; margin-right: 6px; color: #c9cdd4; cursor: grab; user-select: none; }
.pm-row-drag:hover { color: #165dff; }
.pm-drop-target td { background: #e8f3ff !important; box-shadow: inset 0 2px 0 #165dff, inset 0 -2px 0 #165dff; }
.pm-drag-tip { margin-top: 8px; font-size: 12px; color: #86909c; }
.pm-pager { display: flex; justify-content: flex-end; margin-top: 12px; }

.design-home { display: flex; flex-direction: column; gap: 16px; }
/* 应用内 Tab：与 CardTabs.vue 一致的圆角块导航、激活主色、横向滚动 */
.card-tabs {
  display: flex;
  align-items: center;
  overflow-x: auto;
  gap: 4px;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
}
.card-tabs::-webkit-scrollbar { display: none; }
.ctab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 14px;
  color: #4e5969;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.ctab:hover { background: #f2f3f5; color: #1d2129; }
.ctab.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.hide { display: none; }
.w100p { width: 100%; }
.mb16 { margin-bottom: 16px; }
.mt16 { margin-top: 16px; }
.w100 { width: 100px; }
.w220 { width: 220px; }
.flex-1 { flex: 1; }
.text-muted { color: #86909c; font-size: 12px; }
.hd-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.table-scroll { overflow-x: auto; }
.form-card { max-width: 880px; }
.form-hint { font-size: 12px; color: #86909c; margin-left: 12px; }
/* ---- 系统风格（1:1 菜鸟云） ---- */
.ds-group-title { font-size: 14px; font-weight: 600; color: #1d2129; margin: 20px 0 12px; }
.ds-group-title:first-child { margin-top: 0; }
.ds-scheme-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.ds-scheme-item { display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; user-select: none; padding: 6px 4px; border: 1px solid transparent; border-radius: 8px; width: 68px; }
.ds-scheme-item:hover { border-color: #e5e6eb; }
.ds-scheme-item.active { border-color: #165dff; background: #f7fbff; }
.ds-scheme-swatch { position: relative; width: 34px; height: 34px; border-radius: 6px; border: 1px solid rgba(0,0,0,.08); display: flex; align-items: center; justify-content: center; }
.ds-scheme-check { position: absolute; right: -4px; top: -4px; width: 16px; height: 16px; background: #165dff; color: #fff; border-radius: 50%; font-size: 11px; line-height: 16px; text-align: center; }
.ds-scheme-name { font-size: 12px; color: #4e5969; }
.ds-custom-swatch { background: #f7f8fa; border-style: dashed; }
.ds-custom-plus { font-size: 20px; color: #86909c; line-height: 1; }
.ds-custom-box { margin-top: 16px; padding-top: 4px; border-top: 1px dashed #e5e6eb; }
/* 系统风格页：菜鸟云式左右排版（左侧配置 + 右侧手机预览区；三窗横排，预览区可横向滚动） */
.ds-layout { display: flex; gap: 28px; align-items: flex-start; }
.ds-config { flex: 0 0 460px; min-width: 0; }
.ds-preview-panel { flex: 1; min-width: 0; }
@media (max-width: 1100px) {
  .ds-layout { flex-direction: column; }
  .ds-config, .ds-preview-panel { flex: none; width: 100%; }
}
/* 预览三窗（1:1 菜鸟云 choose_style_single：250×466 / 圆角22 / 紫调阴影） */
.ds-preview-row { display: flex; gap: 40px; overflow-x: auto; padding: 10px 6px 14px; }
/* 每台手机独立轻投影（克制，三窗并排不连成整体） */
.ds-preview { position: relative; flex: 0 0 250px; width: 250px; height: 466px; border-radius: 22px; overflow: hidden; background: #fff; box-shadow: 0 3px 10px rgba(76, 66, 188, 0.1), 0 1px 2px rgba(76, 66, 188, 0.06); }
/* 头部状态栏/胶囊图（透明素材，背景图头部透明处透出） */
.ds-preview-top { position: absolute; left: 0; top: 0; width: 100%; height: 52px; z-index: 2; display: block; }
/* 页面静态背景图（头部区域透明，透出 head 底色） */
.ds-preview-bg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: 2; display: block; }
/* 标题条：背景=头部色（跟随主色/白色头部），文字=头部文字色；在背景图之下由透明区透出 */
.ds-preview-head { position: absolute; left: 0; top: 0; width: 100%; height: 52px; z-index: 1; text-align: center; line-height: 78px; font-size: 12px; }
/* 动态覆盖层（颜色随主题/渐变/辅助） */
.ds-preview-ov { position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: 0; }
.ds-preview-ov .ds-ov { position: absolute; display: block; box-sizing: border-box; }
/* 邀请区头像组：一排圆形人物头像（菜鸟云 stylediy 同款，1:1） */
.ds-av-row { position: absolute; z-index: 3; display: flex; gap: 3px; align-items: center; }
.ds-av { width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.9); box-sizing: border-box; display: block; object-fit: cover; }
/* 背景图不透明区上的动态元素：覆盖层(z0)在其之下会被遮住，一律独立 z3 置于背景图(z2)之上 */
/* 邀请好友一起抢：浅青渐变胶囊（与头像组同行右侧，菜鸟云胶囊形态 1:1） */
.ds-invite { position: absolute; z-index: 3; bottom: 52px; right: 14px; height: 20px; padding: 0 10px; border-radius: 20px; font-size: 11px; line-height: 20px; text-align: center; white-space: nowrap; box-sizing: border-box; }
/* 已售300份：纯文字 + 主色火焰图标在文字上方（无胶囊背景，菜鸟云 1:1） */
.ds-sale { position: absolute; z-index: 3; left: 172px; top: 262px; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 10px; line-height: 1; box-sizing: border-box; }
.ds-sale svg { flex: none; }
.ds-sale b { font-weight: 400; }
/* 标签行：推荐/新品/热卖/促销/限量（白底浅青描边圆角，商品名下方） */
.ds-tag-row { position: absolute; z-index: 3; top: 313px; left: 19px; display: flex; gap: 4px; }
.ds-tag { width: 22px; height: 14px; border: 1px solid; border-radius: 7px; font-size: 9px; font-weight: 400; line-height: 12px; text-align: center; background: #fff; box-sizing: border-box; }
/* 底部操作：加入购物车（浅青）+ 立即购买（主色渐变）左右无缝合成一个整体胶囊；右移避开素材底部图标（菜鸟云 1:1） */
.ds-btns { position: absolute; z-index: 3; bottom: 14px; right: 6px; display: flex; overflow: hidden; border-radius: 11px; }
.ds-cart { height: 22px; padding: 0 4px; font-size: 9px; font-weight: 400; line-height: 22px; text-align: center; white-space: nowrap; box-sizing: border-box; }
.ds-buy { height: 22px; padding: 0 4px; font-size: 9px; font-weight: 400; line-height: 22px; text-align: center; white-space: nowrap; box-sizing: border-box; }
/* 上门自提文字：主色、居中于素材自带半透明 tab（无背景，不另套 tab；菜鸟云 1:1） */
.ds-ziti {
  position: absolute; z-index: 3;
  left: 50%; width: 50%;
  top: 60px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  box-sizing: border-box;
  font-size: 11px; line-height: 26px;
  text-align: center;
  white-space: nowrap;
}
/* 提交订单：主色实底圆角按钮（底部右部，菜鸟云距右 ~39px） */
.ds-submit { position: absolute; z-index: 3; bottom: 14px; right: 30px; width: 80px; height: 24px; border-radius: 8px; font-size: 12px; line-height: 24px; text-align: center; box-sizing: border-box; }
.bg-picker { display: flex; align-items: center; gap: 12px; }
/* 数字调节框窄化（系统风格 Tab 全局圆角滑杆，72px 容纳三位数字） */
.form-card :deep(.el-slider__input) { width: 72px; }
.form-card :deep(.el-slider__input .el-input__wrapper) { padding: 0 4px; }
.form-card :deep(.el-slider__input .el-input-number__decrease), .form-card :deep(.el-slider__input .el-input-number__increase) { width: 18px; }
.bg-preview { position: relative; width: 120px; height: 68px; border-radius: 8px; overflow: hidden; border: 1px solid #e5e6eb; }
.bg-preview img { width: 100%; height: 100%; object-fit: cover; }
.bg-del { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,.5); color: #fff; border-radius: 50%; padding: 2px; cursor: pointer; }

.media-layout { display: grid; grid-template-columns: 200px 1fr; gap: 16px; align-items: start; }
.media-side { background: #fff; border-radius: 8px; padding: 12px; }
.media-cat { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 8px; cursor: pointer; color: #4e5969; font-size: 13px; margin-bottom: 4px; }
.media-cat:hover { background: #f2f3f5; }
.media-cat.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.cat-n { font-size: 12px; color: #86909c; }
.cat-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-ops { display: none; gap: 4px; color: #86909c; }
.media-cat:hover .cat-ops { display: inline-flex; }
.media-main { background: #fff; border-radius: 8px; padding: 16px; }
.media-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.media-count { font-size: 12px; color: #86909c; }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; min-height: 120px; }
.media-card { border: 1px solid #e5e6eb; border-radius: 8px; overflow: hidden; cursor: default; position: relative; transition: border-color .2s; }
.media-card.selected { border-color: #165dff; box-shadow: 0 0 0 2px rgba(22,93,255,.15); }
.media-thumb { position: relative; height: 110px; background: #f7f8fa; }
.media-thumb img { width: 100%; height: 100%; object-fit: contain; cursor: zoom-in; }
.media-thumb .media-video-thumb { width: 100%; height: 100%; object-fit: contain; cursor: zoom-in; }
.video-tag { position: absolute; top: 6px; right: 6px; font-size: 11px; padding: 1px 8px; border-radius: 10px; color: #fff; background: rgba(22,93,255,.85); }
.ref-tag, .free-tag { position: absolute; top: 6px; left: 6px; font-size: 11px; padding: 1px 8px; border-radius: 10px; color: #fff; }
.ref-tag { background: rgba(245,63,63,.85); }
.free-tag { background: rgba(134,144,156,.75); }
.media-info { padding: 8px 10px; }
.media-name { font-size: 12px; color: #1d2129; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.media-meta { font-size: 11px; color: #86909c; margin-top: 2px; }
.media-ops { display: none; padding: 6px 8px; border-top: 1px solid #f2f3f5; gap: 2px; flex-wrap: wrap; }
.media-card:hover .media-ops { display: flex; }
.media-empty { grid-column: 1 / -1; text-align: center; color: #86909c; padding: 40px 0; font-size: 13px; }
.preview-img { width: 100%; max-height: 420px; object-fit: contain; background: #f7f8fa; border-radius: 8px; }
.preview-path { font-size: 12px; color: #86909c; word-break: break-all; margin-top: 8px; }

.tab-items { display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px; }
.tab-item-row { display: flex; gap: 10px; align-items: center; }
.tab-icon-img { width: 32px; height: 32px; object-fit: contain; border: 1px dashed #c9cdd4; border-radius: 6px; cursor: pointer; }
.tab-icon-empty { width: 32px; height: 32px; border: 1px dashed #c9cdd4; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: #86909c; cursor: pointer; }

.tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.tpl-card { border: 1px solid #e5e6eb; border-radius: 10px; background: #fff; padding-bottom: 4px; }
.tpl-phone { position: relative; background: #1d2129; border-radius: 18px; padding: 5px; margin: 10px auto 0; width: 140px; aspect-ratio: 9 / 19; }
.tpl-phone-notch { position: absolute; top: 7px; left: 50%; transform: translateX(-50%); width: 34px; height: 4px; background: #1d2129; border-radius: 2px; z-index: 2; }
.tpl-phone-screen { background: #fff; border-radius: 13px; height: 100%; overflow: hidden; position: relative; }
.tpl-screen-inner { padding-top: 10px; }
.tpl-hover { position: absolute; inset: 0; border-radius: 18px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; opacity: 0; transition: opacity .2s; z-index: 3; }
.tpl-mask { position: absolute; inset: 0; border-radius: 18px; background: rgba(0,0,0,.5); }
.tpl-use { position: relative; z-index: 1; background: #165dff; color: #fff; border: none; padding: 10px 30px; border-radius: 24px; font-size: 14px; cursor: pointer; }
.tpl-use:hover { background: #4080ff; }
.tpl-hover-btns { position: relative; z-index: 1; display: flex; gap: 16px; }
.tpl-hover-btns span { color: rgba(255,255,255,.9); font-size: 12px; cursor: pointer; }
.tpl-hover-btns span:hover { color: #fff; }
.tpl-hover-btns .tpl-del { color: #ff9c9e; }
.tpl-phone:hover .tpl-hover, .tpl-card:hover .tpl-hover { opacity: 1; }
.tpl-card { transition: transform .2s, box-shadow .2s; }
.tpl-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.1); }
.tpl-badge { margin-left: 6px; font-size: 11px; color: #86909c; background: #f2f3f5; border-radius: 4px; padding: 1px 6px; vertical-align: 1px; }
.tpl-cat-group { margin-left: 12px; }
.ind-desc { font-size: 12px; color: #86909c; margin-bottom: 12px; line-height: 1.6; }
.ind-list { display: flex; flex-direction: column; gap: 8px; }
.ind-item { display: flex; align-items: center; justify-content: space-between; border: 1px solid #e5e6eb; border-radius: 8px; padding: 10px 14px; }
.ind-name { font-size: 14px; color: #1d2129; }
.tpl-name { padding: 10px 12px 4px; font-size: 13px; color: #1d2129; font-weight: 500; }

.img-sel { display: grid; grid-template-columns: 160px 1fr; gap: 16px; min-height: 360px; }
.img-sel-side { border-right: 1px solid #f2f3f5; padding-right: 12px; }
.img-sel-main { overflow-y: auto; max-height: 400px; }
.sel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 10px; }
.sel-item { position: relative; border: 1px solid #e5e6eb; border-radius: 6px; overflow: hidden; cursor: pointer; aspect-ratio: 1; }
.sel-item img { width: 100%; height: 100%; object-fit: cover; }
.sel-item.picked { border-color: #165dff; box-shadow: 0 0 0 2px rgba(22,93,255,.15); }
.sel-check { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; background: #165dff; color: #fff; border-radius: 50%; font-size: 12px; display: flex; align-items: center; justify-content: center; }

/* 首页跳转页面选择器 */
.home-app-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid #f2f3f5; }
.home-app-row:last-of-type { border-bottom: none; }
.home-app-name { display: flex; align-items: center; gap: 8px; width: 110px; flex-shrink: 0; font-size: 14px; font-weight: 600; color: #1d2129; }
.home-link-row { display: flex; align-items: center; gap: 10px; }
.link-pre { font-size: 12px; color: #165dff; }
.home-picker { max-height: 480px; overflow-y: auto; }
.picker-group { margin-bottom: 18px; }
.picker-group:last-child { margin-bottom: 0; }
.picker-group-title { font-size: 13px; font-weight: 600; color: #1d2129; margin-bottom: 10px; }
.picker-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.picker-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}
.picker-item:hover { border-color: #165dff; }
.picker-item.active { border-color: #165dff; background: #f7fbff; }
.picker-name { font-size: 13px; color: #1d2129; }
.picker-item.active .picker-name { color: #165dff; font-weight: 500; }
.picker-desc { font-size: 11px; color: #86909c; margin-left: auto; }
.picker-check { position: absolute; top: -1px; right: -1px; width: 18px; height: 18px; background: #165dff; color: #fff; border-radius: 0 8px 0 8px; font-size: 11px; display: flex; align-items: center; justify-content: center; }
</style>
