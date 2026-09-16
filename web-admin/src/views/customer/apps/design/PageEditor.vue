<template>
  <div class="page-editor">
    <div class="pe-toolbar">
      <div class="pe-title">
        <span class="pe-page-name">{{ pageName }}</span>
        <el-tag v-if="published" type="success" size="small">已发布 v{{ published.version }}</el-tag>
        <el-tag v-if="draft" type="info" size="small">有草稿</el-tag>
      </div>
    </div>

    <div class="pe-body">
      <!-- 组件库：模块列表 / 页面列表 + 分组折叠 + 模糊搜索 + 3列网格卡片（图标上/名称下，仿 eweishop） -->
      <div class="pe-lib">
        <div class="pe-lib-head">
          <div class="pe-lib-tabs">
            <div class="pe-lib-tab" :class="{ active: libTab === 'modules' }" @click="libTab = 'modules'">模块列表</div>
            <div class="pe-lib-tab" :class="{ active: libTab === 'pages' }" @click="libTab = 'pages'">页面列表</div>
          </div>
          <div v-if="libTab === 'modules'" class="pe-lib-search">
            <el-input v-model="kw" size="small" placeholder="搜索组件" clearable>
              <template #prefix><span class="pe-search-ico">⌕</span></template>
            </el-input>
          </div>
        </div>

        <!-- 模块列表（组件库） -->
        <template v-if="libTab === 'modules'">
          <div v-for="g in visibleGroups" :key="g.key" class="pe-group">
            <div class="pe-group-head" @click="toggleGroup(g.key)">
              <span class="pe-group-caret" :class="{ open: expanded[g.key] !== false }">▸</span>
              <span class="pe-group-name">{{ g.name }}</span>
              <span class="pe-group-n">({{ filteredCount(g.key) }})</span>
            </div>
            <div v-show="expanded[g.key] !== false" class="pe-group-body">
              <div class="pe-lib-grid">
                <div
                  v-for="c in filteredComps(g.key)" :key="c.type"
                  class="pe-lib-card" draggable="true"
                  @dragstart="onLibDragStart($event, c.type)"
                  @click="addComponent(c.type)"
                >
                  <span v-if="c.pro" class="pe-lib-tag">高级</span>
                  <span class="pe-lib-ico"><img :src="COMP_ICONS[c.icon]" :alt="c.name" /></span>
                  <span class="pe-lib-name">{{ c.name }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="!visibleGroups.length" class="pe-lib-tip">未找到匹配组件</div>
          <div v-else class="pe-lib-tip">点击或拖拽到画布</div>
        </template>

        <!-- 页面列表（承载原右上角页面下拉，参考图6：全部页面+搜索+新建+名称/首页/复制/删除） -->
        <template v-else>
          <div class="pe-pages">
            <div class="pe-pages-title">全部页面</div>
            <el-input v-model="pageKw" size="small" placeholder="请输入页面名称搜索" clearable class="pe-pages-search" />
            <el-button size="small" type="primary" class="pe-page-new" @click="createPage">创建新页面</el-button>
            <div class="pe-pages-table">
              <div class="pe-pages-tr pp-th">
                <span class="pp-drag"></span>
                <span class="pp-col-name">名称</span>
                <span class="pp-col-home">首页</span>
                <span class="pp-col-ops">操作</span>
              </div>
              <div v-for="(p, idx) in filteredPages" :key="p.page_type" class="pe-pages-tr" :class="{ current: p.page_type === pageType, dragging: pageDrag && pageDrag.from === idx }" draggable="true" @dragstart="onPageDragStart($event, idx)" @dragover="onPageDragOver($event, idx)" @drop.prevent.stop="onPageDrop" @dragend="onPageDragEnd">
                <span class="pp-drag" title="按住拖动排序">⠿</span>
                <span class="pp-col-name pp-name" :title="p.page_name + (p.status === 1 ? '（已发布）' : '')" @click="switchPage(p.page_type)">{{ p.page_name }}</span>
                <span class="pp-col-home" :class="{ yes: p.isHome }" title="点击切换首页" @click="toggleHome(p)">{{ p.isHome ? '是' : '否' }}</span>
                <span class="pp-col-ops">
                  <el-button size="small" text @click="renamePage(p)">重命名</el-button>
                  <el-button size="small" text type="primary" @click="copyPage(p)">复制</el-button>
                  <el-button size="small" text type="danger" :disabled="['home','card','dynamic','mine'].includes(p.page_type)" @click="deletePage(p)">删除</el-button>
                </span>
              </div>
              <div v-if="!filteredPages.length" class="pe-lib-tip">暂无页面，点击「创建新页面」创建</div>
            </div>
          </div>
        </template>
      </div>

      <!-- 画布（手机预览壳：状态栏固定 + 导航栏按头部设置显示） -->
      <div class="pe-canvas-wrap">
        <div class="pe-phone" :style="phoneStyle">
          <!-- 顶部状态栏：模拟真实小程序顶部（时间/信号/WiFi/电池固定） -->
          <div class="pe-status-bar" title="点击设置头部样式" @click.stop="openHeaderPanel">
            <span class="ps-time">10:18</span>
            <span class="ps-icons">
              <svg class="ps-ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#1d2129" stroke-width="2" stroke-linecap="round"><path d="M2 14h2v4H2zM6 11h2v7H6zM10 8h2v10h-2zM14 5h2v13h-2z"/></svg>
              <svg class="ps-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#1d2129" stroke-width="2" stroke-linecap="round"><path d="M3 9a11 11 0 0 1 18 0M6.5 12.5a6.5 6.5 0 0 1 11 0M9.5 15.5a3 3 0 0 1 5 0"/><circle cx="12" cy="18.5" r="1.2" fill="#1d2129" stroke="none"/></svg>
              <svg class="ps-ico" viewBox="0 0 28 14" width="22" height="12"><rect x="0.5" y="0.5" width="23" height="13" rx="3" fill="none" stroke="#1d2129" stroke-width="1.2"/><rect x="2" y="2" width="16" height="10" rx="1.6" fill="#1d2129"/><rect x="25" y="4.5" width="2.5" height="5" rx="1" fill="#1d2129"/></svg>
            </span>
          </div>
          <!-- 导航栏：方案一（云菜鸟）按头部设置（类型/背景/内容/第一行/第二行内容）渲染；方案二（ew）按 ew 头部结构渲染；点击弹出头部设置 -->
          <div class="pe-phone-nav" :style="headerScheme === 2 ? ewNavStyle : navStyle" title="点击设置头部样式" @click.stop="openHeaderPanel">
            <!-- 模拟微信小程序右上角胶囊按钮（仅视觉，不拦截点击） -->
            <div class="pe-mp-capsule">
              <span class="pmc-dots"><i></i><i></i><i></i></span>
              <span class="pmc-div"></span>
              <span class="pmc-circle"></span>
            </div>
            <template v-if="headerScheme === 2">
              <!-- 方案二（ew）：功能模块=无 → 仅标题+文字颜色；否则按层渲染左/中/右 -->
              <div v-if="ewHeader.funcModule === 'none'" class="pn-line" :style="ewLineStyle">
                <div class="pn-title" :style="{ color: ewTitleColor }">{{ pageName || '首页' }}</div>
              </div>
              <template v-else>
                <div v-for="(layer, li) in ewShownLayers" :key="li" class="pn-line" :class="{ 'pn-line2': ewHeader.funcModule === 'double' && li === 1 }" :style="ewLineStyle">
                  <div class="pn-side pn-left">
                    <img v-if="layer.left.type === 'image' && layer.left.image" :src="resolveUrl(layer.left.image)" class="pe-ew-img45" />
                    <SIcon v-else-if="layer.left.type === 'icon'" :name="layer.left.icon" :color="layer.left.color || '#1d2129'" size="default" />
                    <span v-else-if="layer.left.type === 'store'" class="pe-ew-store" :style="{ color: layer.left.store.color || '#1d2129' }">📍{{ layer.left.store.name || '门店' }}</span>
                    <span v-else-if="layer.left.type === 'city'" class="pe-ew-city" :style="{ color: layer.left.color || '#1d2129' }">●{{ pageName || '首页' }}</span>
                  </div>
                  <div class="pn-title" :style="{ color: ewTitleColor }">
                    <img v-if="layer.middle.type === 'image' && layer.middle.image" :src="resolveUrl(layer.middle.image)" class="pe-ew-img96" />
                    <span v-else-if="layer.middle.type === 'search'" class="pe-ew-search" :style="ewSearchStyle(layer)">
                      <SIcon name="dynamic" :color="layer.middle.search.iconColor || '#3d404d'" size="small" />
                      <span class="pe-ew-search-txt" :style="{ color: layer.middle.search.textColor || '#3d404d' }">{{ layer.middle.search.placeholder || '请输入关键字' }}</span>
                      <span v-if="layer.middle.search.showBtn" class="pe-ew-search-btn" :style="{ background: layer.middle.search.borderBg || '#ffffff', color: layer.middle.search.iconColor || '#3d404d' }">搜索</span>
                    </span>
                    <span v-else>{{ pageName || '首页' }}</span>
                  </div>
                  <div class="pn-side pn-right">
                    <img v-if="layer.right.type === 'image' && layer.right.image" :src="resolveUrl(layer.right.image)" class="pe-ew-img45" />
                    <SIcon v-else-if="layer.right.type === 'icon'" :name="layer.right.icon" :color="layer.right.color || '#1d2129'" size="default" />
                  </div>
                </div>
              </template>
            </template>
            <template v-else>
              <div class="pn-line">
                <div class="pn-side pn-left" v-html="navLeftHtml"></div>
                <div class="pn-title" :style="{ color: navTextColor }" v-html="navCenterHtml1"></div>
                <div class="pn-side pn-right" v-html="navRightHtml"></div>
              </div>
              <div v-if="meta.header.lines === 2 && meta.header.type === 'custom'" class="pn-line pn-line2">
                <div class="pn-side pn-left" v-html="navPosHtml2('left')"></div>
                <div class="pn-title" :style="{ color: navTextColor }" v-html="navCenterHtml2"></div>
                <div class="pn-side pn-right" v-html="navPosHtml2('right')"></div>
              </div>
            </template>
          </div>
          <div class="pe-canvas" @dragover.prevent="onCanvasDragOver" @drop="onCanvasDrop">
            <div
              v-for="(comp, i) in components" :key="comp.id"
              class="pe-comp" :class="{ active: selected === comp.id }"
              draggable="true"
              @click.stop="selectComp(comp)"
              @dragstart="onCompDragStart($event, i)"
              @dragover.prevent="onCompDragOver(i)"
              @drop.stop="onCompDrop(i)"
            >
              <div class="pe-comp-tools">
                <span class="pe-comp-idx">{{ i + 1 }}</span>
                <span class="pe-comp-type">{{ compName(comp.type) }}</span>
                <span class="pe-tool" title="复制" @click.stop="dupComp(comp)">⧉</span>
                <span class="pe-tool pe-tool-del" title="删除" @click.stop="removeComp(comp.id)">✕</span>
              </div>
              <ComponentRender :comp="comp" :global="meta.global" :cube-sel="cubeSel" @cell-select="onCubeCellSelect" />
            </div>
            <div v-if="!components.length" class="pe-empty">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#86909C" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>
              <span>从左侧拖拽组件到此处，或点击组件库添加</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 属性面板：schema 驱动，内容/样式分组 + 通用样式 -->
      <div class="pe-prop">
        <div class="pe-prop-title">{{ selectedComp ? selectedComp.name : '属性' }}</div>
        <div v-if="selectedComp && schemaSections.length" class="pe-prop-body">
          <el-form label-width="auto" size="small">
            <template v-for="sec in schemaSections" :key="sec.key">
              <div v-if="sec.fields.length" class="pe-sec">
                <div v-if="sec.label" class="pe-sec-name">{{ sec.label }}</div>
                <el-form-item v-for="f in sec.fields" :key="f.key" :label="(f.control === 'hint' || (f.control === 'radio' && f.graphic) || f.control === 'richtext') ? '' : f.label" :class="{ required: f.required, 'prop-list': f.control === 'list', 'pe-form-hint': f.control === 'hint' }">
                  <el-alert v-if="f.control === 'hint'" :title="f.label" type="warning" :closable="false" class="pe-hint" />
                  <el-input v-else-if="f.control === 'input'" v-model="selectedComp.props[f.key]" :placeholder="f.placeholder || ''" :maxlength="f.maxlength || undefined" :show-word-limit="!!f.maxlength" />
                  <el-input v-else-if="f.control === 'textarea'" v-model="selectedComp.props[f.key]" type="textarea" :rows="f.rows || 4" :placeholder="f.placeholder || ''" />
                  <RichTextEditor v-else-if="f.control === 'richtext'" v-model="selectedComp.props[f.key]" />
                  <PeColorPicker v-else-if="f.control === 'color'" v-model="selectedComp.props[f.key]" />
                  <el-date-picker
                    v-else-if="f.control === 'datetime'"
                    v-model="selectedComp.props[f.key]"
                    type="datetime"
                    size="small"
                    :placeholder="f.placeholder || '请选择时间'"
                    value-format="YYYY-MM-DD HH:mm"
                    style="width: 100%"
                  />
                  <!-- 魔方：风格选择（对标 eweishop 风格选择器） -->
                  <CubeStylePicker
                    v-else-if="f.control === 'cube-style'"
                    :model-value="selectedComp.props[f.key]"
                    @update:model-value="onCubeStyleChange"
                  />
                  <!-- 魔方：布局网格编辑器（对标 eweishop 魔方布局） -->
                  <CubeLayoutEditor
                    v-else-if="f.control === 'cube-layout'"
                    v-model="selectedComp.props[f.key]"
                    :style-type="selectedComp.props.styleType || 1"
                    @select-cell="onCubeLayoutSelect"
                  />
                  <!-- 图形化单选（选择风格：一列/两列并排，仿 eweishop 图形卡片） -->
                  <div v-else-if="f.control === 'radio' && f.graphic" class="pe-graphic">
                    <div
                      v-for="o in f.options" :key="o.value"
                      class="pe-graphic-item" :class="{ active: String(selectedComp.props[f.key]) === String(o.value) }"
                      @click="selectedComp.props[f.key] = o.value"
                    >
                      <svg v-if="String(o.value) === '1'" class="pe-graphic-svg" viewBox="0 0 44 44">
                        <rect x="2" y="2" width="40" height="40" rx="5" fill="#F2F3F5"/>
                        <rect x="13" y="3" width="18" height="38" rx="3" fill="#C9CDD4"/>
                      </svg>
                      <svg v-else-if="String(o.value) === '2' || String(o.value) === '3'" class="pe-graphic-svg" viewBox="0 0 44 44">
                        <rect x="2" y="2" width="40" height="40" rx="5" fill="#F2F3F5"/>
                        <rect x="3" y="14" width="38" height="16" rx="3" fill="#C9CDD4"/>
                      </svg>
                      <svg v-else-if="o.value === 'single'" class="pe-graphic-svg" viewBox="0 0 88 56">
                        <rect x="4" y="4" width="80" height="48" rx="6" fill="#F2F3F5"/>
                        <rect x="12" y="12" width="64" height="32" rx="4" fill="#C9CDD4"/>
                        <circle cx="44" cy="28" r="6" fill="#fff"/>
                      </svg>
                      <svg v-else-if="ratioShapes[o.value]" class="pe-graphic-svg" viewBox="0 0 44 44">
                        <rect x="2" y="2" width="40" height="40" rx="5" fill="#F2F3F5"/>
                        <rect :x="(44 - ratioShapes[o.value].w) / 2" :y="(44 - ratioShapes[o.value].h) / 2" :width="ratioShapes[o.value].w" :height="ratioShapes[o.value].h" rx="3" fill="#C9CDD4"/>
                      </svg>
                      <svg v-else class="pe-graphic-svg" viewBox="0 0 88 56">
                        <rect x="2" y="4" width="40" height="48" rx="6" fill="#F2F3F5"/>
                        <rect x="46" y="4" width="40" height="48" rx="6" fill="#F2F3F5"/>
                        <rect x="7" y="10" width="30" height="36" rx="4" fill="#C9CDD4"/>
                        <rect x="51" y="10" width="30" height="36" rx="4" fill="#C9CDD4"/>
                        <circle cx="22" cy="28" r="5" fill="#fff"/>
                        <circle cx="66" cy="28" r="5" fill="#fff"/>
                      </svg>
                      <span class="pe-graphic-name">{{ o.label }}</span>
                      <span class="pe-graphic-check">✓</span>
                    </div>
                  </div>
                  <!-- 风格选择器（eweishop 1:1：当前风格 + 修改风格弹窗） -->
                  <div v-else-if="f.control === 'stylePicker'" class="pe-style-picker">
                    <img v-if="f.styleGroup" :src="styleImg(f, selectedComp.props[f.key])" class="pe-style-thumb-img" />
                    <span v-else class="pe-style-cur">当前：{{ styleName(f) }}</span>
                    <el-button size="small" type="primary" plain @click="openStylePicker(f)">修改风格</el-button>
                  </div>
                  <el-radio-group v-else-if="f.control === 'radioButton'" v-model="selectedComp.props[f.key]" size="default">
                    <el-radio-button v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</el-radio-button>
                  </el-radio-group>
                  <el-radio-group v-else-if="f.control === 'radio'" v-model="selectedComp.props[f.key]">
                    <el-radio v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
                  </el-radio-group>
                  <!-- 魔方：格子填充方式（属性区编辑，图形化：裁剪铺满/完整显示/拉伸填满/原尺寸） -->
                  <div v-else-if="f.control === 'cube-cell-fill'" class="pe-cube-fill">
                    <template v-if="cubeCellTarget">
                      <div class="pe-graphic">
                        <div
                          v-for="o in [{ v: 'cover', label: '裁剪铺满' }, { v: 'contain', label: '完整显示' }, { v: 'fill', label: '拉伸填满' }, { v: 'none', label: '原尺寸' }]" :key="o.v"
                          class="pe-graphic-item" :class="{ active: (cubeCellTarget.fill || 'cover') === o.v }"
                          @click="cubeCellTarget.fill = o.v"
                        >
                          <svg class="pe-graphic-svg" viewBox="0 0 44 44">
                            <rect x="2" y="2" width="40" height="40" rx="5" fill="#F2F3F5" stroke="#E5E6EB"/>
                            <template v-if="o.v === 'cover'">
                              <rect x="8" y="-2" width="28" height="48" rx="2" fill="#165DFF" opacity=".75"/>
                            </template>
                            <template v-else-if="o.v === 'contain'">
                              <rect x="14" y="14" width="16" height="16" rx="2" fill="#165DFF" opacity=".75"/>
                            </template>
                            <template v-else-if="o.v === 'fill'">
                              <rect x="8" y="10" width="28" height="24" rx="1" fill="#165DFF" opacity=".75"/>
                            </template>
                            <template v-else>
                              <rect x="18" y="18" width="8" height="8" rx="1" fill="#165DFF" opacity=".75"/>
                            </template>
                          </svg>
                          <span class="pe-graphic-name">{{ o.label }}</span>
                          <span class="pe-graphic-check">✓</span>
                        </div>
                      </div>
                    </template>
                    <span v-else class="pe-cube-cell-tip">{{ f.cellTip }}</span>
                  </div>
                  <!-- 魔方：图片位置（属性区编辑，图形化：顶部/居中/底部） -->
                  <div v-else-if="f.control === 'cube-cell-pos'" class="pe-cube-pos">
                    <template v-if="cubeCellTarget">
                      <div class="pe-graphic">
                        <div
                          v-for="o in [{ v: 'top', label: '顶部' }, { v: 'center', label: '居中' }, { v: 'bottom', label: '底部' }]" :key="o.v"
                          class="pe-graphic-item" :class="{ active: (cubeCellTarget.pos || 'center') === o.v }"
                          @click="cubeCellTarget.pos = o.v"
                        >
                          <svg class="pe-graphic-svg" viewBox="0 0 44 44">
                            <rect x="2" y="2" width="40" height="40" rx="5" fill="#F2F3F5" stroke="#E5E6EB"/>
                            <rect v-if="o.v === 'top'" x="14" y="6" width="16" height="16" rx="2" fill="#165DFF" opacity=".75"/>
                            <rect v-else-if="o.v === 'center'" x="14" y="14" width="16" height="16" rx="2" fill="#165DFF" opacity=".75"/>
                            <rect v-else x="14" y="22" width="16" height="16" rx="2" fill="#165DFF" opacity=".75"/>
                          </svg>
                          <span class="pe-graphic-name">{{ o.label }}</span>
                          <span class="pe-graphic-check">✓</span>
                        </div>
                      </div>
                    </template>
                    <span v-else class="pe-cube-cell-tip">{{ f.cellTip }}</span>
                  </div>
                    <el-slider v-if="cubeCellTarget" :model-value="cubeCellTarget[f.cellKey] ?? (f.cellKey === 'radius' ? 4 : 0)" @update:model-value="cubeCellTarget[f.cellKey] = $event" :min="f.min" :max="f.max" show-input />
                    <span v-else class="pe-cube-cell-tip">{{ f.cellTip }}</span>
                  </template>
                  <el-slider v-else-if="f.control === 'slider'" :model-value="selectedComp.props[f.key] ?? 0" @update:model-value="selectedComp.props[f.key] = $event" :min="f.min" :max="f.max" show-input />
                  <PeImageGroup
                    v-else-if="f.control === 'imageGroup'"
                    :main-image="selectedComp.props[f.mainKey || 'mainImage']"
                    :sub1-image="selectedComp.props[f.sub1Key || 'sub1Image']"
                    :sub2-image="selectedComp.props[f.sub2Key || 'sub2Image']"
                    :main-size="f.mainSize || '346x380'"
                    :sub-size="f.subSize || '340x184'"
                    @update:main-image="selectedComp.props[f.mainKey || 'mainImage'] = $event"
                    @update:sub1-image="selectedComp.props[f.sub1Key || 'sub1Image'] = $event"
                    @update:sub2-image="selectedComp.props[f.sub2Key || 'sub2Image'] = $event"
                  />
                  <PeImagePicker v-else-if="f.control === 'image'" v-model="selectedComp.props[f.key]" :help="f.help || '建议图片宽度750，高度200-950，支持jpg、png。'" />
                  <el-input v-else-if="f.control === 'link'" v-model="selectedComp.props[f.key]" :placeholder="f.placeholder || '如 /pages/card/market'">
                    <template #append><el-button @click="openLinkSel(null, null, f)">选择</el-button></template>
                  </el-input>
                  <el-switch v-else-if="f.control === 'switch'" v-model="selectedComp.props[f.key]" />
                  <el-select v-else-if="f.control === 'select'" v-model="selectedComp.props[f.key]" size="small" style="width:100%">
                    <el-option v-for="o in f.options" :key="o.value" :label="o.label" :value="o.value" />
                  </el-select>
                  <div v-else-if="f.control === 'list'" class="pe-list">
                    <a v-if="f.helpLink" class="pe-list-link" :href="f.helpLink.href" target="_blank" rel="noopener">{{ f.helpLink.text }}</a>
                    <div
                      v-for="(it, idx) in selectedComp.props[f.key] || []" :key="idx"
                      class="pe-list-item" draggable="true"
                      @dragstart="onListItemDragStart($event, f.key, idx)"
                      @dragover.prevent="onListItemDragOver(f.key, idx)"
                      @drop.stop="onListItemDrop(f.key)"
                    >
                      <span class="pe-list-drag" title="按住拖动排序">⠿</span>
                      <div class="pe-list-fields">
                        <div v-for="(sf, si) in visibleItemFields(f, it)" :key="si" class="pe-list-field">
                          <div class="pe-list-label">{{ sf.label }}</div>
                          <el-radio-group v-if="sf.control === 'radio'" :model-value="listVal(it, sf)" @update:model-value="it[sf.key] = $event" size="small">
                            <el-radio v-for="o in sf.options" :key="o.value" :value="o.value" size="small">{{ o.label }}</el-radio>
                          </el-radio-group>
                          <el-input v-else-if="sf.control === 'input'" v-model="it[sf.key]" size="small" />
                          <el-input v-else-if="sf.control === 'link'" v-model="it[sf.key]" size="small" :placeholder="sf.placeholder || '如 /pages/card/market'">
                            <template #append><el-button @click="openLinkSel(idx, si, sf)">选择</el-button></template>
                          </el-input>
                          <el-select v-else-if="sf.control === 'select'" v-model="it[sf.key]" size="small" style="width:100%">
                            <el-option v-for="o in sf.options" :key="o.value" :label="o.label" :value="o.value" />
                          </el-select>
                          <PeImagePicker v-else-if="sf.control === 'image'" v-model="it[sf.key]" :help="sf.help || '建议图片宽度750，高度200-950，支持jpg、png。'" />
                          <div v-else-if="sf.control === 'hotspots'" class="pe-hs-field">
                            <el-button size="small" type="primary" plain @click="openHotspotEditor(f, idx)">管理热区（{{ (it.hotspots || []).length }}）</el-button>
                          </div>
                        </div>
                      </div>
                      <div class="pe-list-ops">
                        <el-button size="small" text type="danger" @click="removeListItem(selectedComp, f.key, idx)">删除</el-button>
                      </div>
                    </div>
                    <el-button size="small" class="pe-list-add" @click="addListItem(selectedComp, f.key, f.itemFields)">+ 添加一项</el-button>
                  </div>
                  <!-- 字段提示（独立 v-if，禁止放在控件链中——曾因 v-if 切断 v-else-if 链导致带 tips 的字段控件不渲染，如图片字段只剩提示文字、上传选择器消失） -->
                  <div v-if="f.tips" class="pe-field-tips">{{ f.tips }}</div>
                  </el-form-item>
              </div>
            </template>
          </el-form>
        </div>
        <div v-else class="pe-prop-empty">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#86909C" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 9.5h8M8 13h5"/></svg>
          <span>选中画布中的组件后在此编辑属性</span>
        </div>
      </div>
    </div>

    <!-- 头部设置面板（点击手机状态栏/导航栏弹出；参考云菜鸟：主题/全局/头部/底部导航/页面跳转 + 第一行内容） -->
    <el-drawer v-model="headerPanel.show" title="页面设置" size="420px" append-to-body>
      <div class="hp-tabs">
        <div v-for="t in headerPanel.tabs" :key="t.key" class="hp-tab" :class="{ active: headerPanel.active === t.key }" @click="headerPanel.active = t.key">{{ t.label }}</div>
      </div>

      <!-- 主题设置 -->
      <div v-if="headerPanel.active === 'theme'" class="hp-body">
        <div class="hp-row">
          <div class="hp-label">页面名称</div>
          <el-input v-model="pageName" size="small" style="width: 220px" />
        </div>
        <div class="hp-row">
          <div class="hp-label">分享标题</div>
          <el-input v-model="meta.theme.shareTitle" size="small" placeholder="默认取页面名称" style="width: 220px" />
        </div>
        <div class="hp-row">
          <div class="hp-label">密码访问</div>
          <el-switch v-model="meta.theme.passwordEnabled" />
          <el-input v-if="meta.theme.passwordEnabled" v-model="meta.theme.password" size="small" placeholder="访问密码" style="width: 140px; margin-left: 8px" />
        </div>
        <div class="hp-row">
          <div class="hp-label">会员访问</div>
          <el-switch v-model="meta.theme.memberOnly" />
          <span class="hp-hint" v-if="meta.theme.memberOnly">仅登录会员可访问</span>
        </div>
      </div>

      <!-- 全局设置 -->
      <div v-if="headerPanel.active === 'global'" class="hp-body">
        <div class="hp-row">
          <div class="hp-label">全局背景色</div>
          <el-color-picker v-model="meta.global.bgColor" />
        </div>
        <div class="hp-row">
          <div class="hp-label">全局背景图</div>
          <el-button size="small" @click="openHeaderImg('global')">选择背景图</el-button>
          <el-button v-if="meta.global.bgImage" size="small" text type="danger" @click="meta.global.bgImage = ''">清除</el-button>
        </div>
        <div class="hp-row">
          <div class="hp-label">卡片圆角(px)</div>
          <el-slider v-model="meta.global.cardRadius" :min="0" :max="24" show-input style="flex: 1; min-width: 140px" />
        </div>
        <div class="hp-row">
          <div class="hp-label">卡片边距(px)</div>
          <el-slider v-model="meta.global.cardPadding" :min="0" :max="24" show-input style="flex: 1; min-width: 140px" />
        </div>
        <div class="hp-row">
          <div class="hp-label">卡片间距(px)</div>
          <el-slider v-model="meta.global.cardGap" :min="0" :max="24" show-input style="flex: 1; min-width: 140px" />
        </div>
        <div class="hp-sec">头部默认值（全局默认，单页可覆盖）</div>
        <div class="hp-row">
          <div class="hp-label">默认头部方案</div>
          <el-radio-group v-model="meta.global.headerDefault.scheme">
            <el-radio :value="1">方案一（云菜鸟）</el-radio>
            <el-radio :value="2">方案二（ew）</el-radio>
          </el-radio-group>
        </div>
        <HeaderEwPanel v-model="meta.global.headerDefault.ew" />
      </div>

      <!-- 头部设置（照抄云菜鸟：头部类型决定可配置菜单——自定义=全部子项 / 沉浸式=仅类型 / 仿官方=类型+页面标题） -->
      <div v-if="headerPanel.active === 'header'" class="hp-body">
        <div class="hp-row">
          <div class="hp-label">头部方案</div>
          <el-radio-group :model-value="headerScheme" @update:model-value="setHeaderScheme">
            <el-radio :value="1">方案一（云菜鸟）</el-radio>
            <el-radio :value="2">方案二（ew）</el-radio>
          </el-radio-group>
        </div>
        <template v-if="headerScheme === 1">
        <div class="hp-row">
          <div class="hp-label">头部类型</div>
          <el-radio-group v-model="meta.header.type">
            <el-radio value="custom">自定义</el-radio>
            <el-radio value="immersive">沉浸式</el-radio>
            <el-radio value="official">仿官方</el-radio>
          </el-radio-group>
        </div>

        <!-- 沉浸式头部：导航栏透明悬浮，无子项配置 -->
        <div v-if="meta.header.type === 'immersive'" class="hp-tip">
          沉浸式头部：导航栏透明悬浮于页面内容之上，文字自动适配为白色，无需配置背景与内容
        </div>

        <!-- 仿官方头部：仅可设置页面标题 -->
        <template v-if="meta.header.type === 'official'">
          <div class="hp-row">
            <div class="hp-label">页面标题</div>
            <el-input v-model="meta.header.titleText" size="small" placeholder="默认取页面名称" style="width: 220px" />
          </div>
          <div class="hp-row">
            <div class="hp-label">文字颜色</div>
            <el-color-picker v-model="meta.header.textColor" />
          </div>
        </template>

        <!-- 自定义头部：完整子项 -->
        <template v-if="meta.header.type === 'custom'">
        <div class="hp-row">
          <div class="hp-label">头部背景</div>
          <el-color-picker v-model="meta.header.bgColor" />
          <el-button size="small" @click="openHeaderImg('header')">背景图</el-button>
          <el-button v-if="meta.header.bgImage" size="small" text type="danger" @click="meta.header.bgImage = ''">清除</el-button>
        </div>
        <div class="hp-row">
          <div class="hp-label">头部动态</div>
          <el-radio-group v-model="meta.header.fixed">
            <el-radio :value="true">固定</el-radio>
            <el-radio :value="false">跟随</el-radio>
          </el-radio-group>
        </div>
        <div class="hp-row">
          <div class="hp-label">头部边距(px)</div>
          <el-slider v-model="meta.header.padding" :min="0" :max="24" show-input style="flex: 1; min-width: 140px" />
        </div>
        <div class="hp-row">
          <div class="hp-label">头部内容</div>
          <el-radio-group v-model="meta.header.lines">
            <el-radio :value="1">一行</el-radio>
            <el-radio :value="2">两行</el-radio>
          </el-radio-group>
        </div>
        <div class="hp-row">
          <div class="hp-label">标题文字</div>
          <el-input v-model="meta.header.titleText" size="small" placeholder="默认取页面名称" style="width: 220px" />
        </div>
        <div class="hp-row">
          <div class="hp-label">文字颜色</div>
          <el-color-picker v-model="meta.header.textColor" />
        </div>

        <!-- 第一行 / 第二行内容（云菜鸟：两行内容时出现第二行配置；左侧含文字加粗/大小/链接，中间含背景/边框/宽度/圆角/字体色/大小/对齐） -->
        <template v-for="(block, bi) in headerBlocks" :key="bi">
          <div class="hp-sec">{{ block.label }}</div>
          <div v-for="pos in ['left', 'center', 'right']" :key="pos" class="hp-row hp-pos">
            <div class="hp-label">{{ { left: '左侧部分', center: '中间部分', right: '右侧部分' }[pos] }}</div>
            <el-select v-model="block.row[pos].type" size="small" style="width: 96px">
              <el-option label="不显示" value="none" />
              <el-option label="文字" value="text" />
              <el-option label="图片" value="image" />
              <el-option label="搜索" value="search" />
              <el-option label="图标" value="iconText" />
            </el-select>
            <template v-if="block.row[pos].type !== 'none'">
              <el-input v-if="['text','search','iconText'].includes(block.row[pos].type)" v-model="block.row[pos].text" size="small" placeholder="内容文字" style="width: 96px" />
              <el-button v-if="block.row[pos].type === 'image'" size="small" @click="openHeaderImg('content', pos, block.row)">选图</el-button>
              <el-input v-model="block.row[pos].link" size="small" placeholder="链接" style="width: 96px">
                <template #append><el-button @click="openHeaderLink(pos, block.row)">选</el-button></template>
              </el-input>
              <el-color-picker v-model="block.row[pos].color" />
              <!-- 文字样式：加粗 + 大小（云菜鸟） -->
              <template v-if="['text','search','iconText'].includes(block.row[pos].type)">
                <div class="hp-sub">
                  <span class="hp-sub-label">加粗</span>
                  <el-radio-group v-model="block.row[pos].bold" size="small">
                    <el-radio-button :value="0">不加粗</el-radio-button>
                    <el-radio-button :value="1">加粗</el-radio-button>
                  </el-radio-group>
                </div>
                <div class="hp-sub">
                  <span class="hp-sub-label">字号</span>
                  <el-input-number v-model="block.row[pos].fontSize" :min="10" :max="22" size="small" style="width: 70px" />
                </div>
              </template>
              <!-- 中间部分额外样式（云菜鸟：背景/边框/宽度/圆角/字体色/对齐） -->
              <template v-if="pos === 'center'">
                <div class="hp-sub">
                  <span class="hp-sub-label">背景色</span>
                  <el-color-picker v-model="block.row[pos].bgColor" />
                  <span class="hp-sub-label">边框色</span>
                  <el-color-picker v-model="block.row[pos].borderColor" />
                </div>
                <div class="hp-sub">
                  <span class="hp-sub-label">宽度px</span>
                  <el-input-number v-model="block.row[pos].width" :min="40" :max="600" size="small" style="width: 70px" />
                  <span class="hp-sub-label">圆角px</span>
                  <el-input-number v-model="block.row[pos].radius" :min="0" :max="60" size="small" style="width: 70px" />
                </div>
                <div class="hp-sub">
                  <span class="hp-sub-label">对齐</span>
                  <el-radio-group v-model="block.row[pos].align" size="small">
                    <el-radio-button value="left">居左</el-radio-button>
                    <el-radio-button value="center">居中</el-radio-button>
                  </el-radio-group>
                </div>
              </template>
            </template>
          </div>
        </template>
        </template>
        </template>
        <template v-else>
          <HeaderEwPanel v-model="meta.header.ew" />
        </template>
      </div>

      <!-- 底部导航 -->
      <div v-if="headerPanel.active === 'nav'" class="hp-body">
        <div class="hp-row">
          <div class="hp-label">底部导航</div>
          <el-radio-group v-model="meta.nav.mode">
            <el-radio value="default">使用默认</el-radio>
            <el-radio value="custom">独立导航</el-radio>
            <el-radio value="none">关闭导航</el-radio>
          </el-radio-group>
        </div>
        <div v-if="meta.nav.mode === 'custom'" class="hp-row">
          <div class="hp-label">独立导航方案</div>
          <el-select v-model="meta.nav.schemeId" size="small" style="width: 200px">
            <el-option v-for="s in tabSchemes" :key="s.id" :label="s.scheme_name" :value="s.id" />
          </el-select>
        </div>
        <div class="hp-row">
          <div class="hp-label">页面跳转</div>
          <el-radio-group v-model="meta.nav.jumpEnabled">
            <el-radio :value="true">开启</el-radio>
            <el-radio :value="false">关闭</el-radio>
          </el-radio-group>
          <span class="hp-hint">开启后点击导航项跳转对应页面</span>
        </div>
      </div>

      <template #footer>
        <el-button size="small" @click="headerPanel.show = false">关闭</el-button>
        <el-button size="small" type="primary" @click="headerPanel.show = false; saveDraft()">保存</el-button>
      </template>
    </el-drawer>

    <!-- 风格选择器（eweishop 1:1：风格1/风格2 缩略图弹窗） -->
    <el-dialog v-model="stylePickerVisible" title="风格选择器" width="500px" append-to-body>
      <div class="pe-style-grid" :class="{ 'pe-style-grid-img': stylePickerField?.styleGroup }">
        <template v-if="stylePickerField?.styleGroup">
          <div
            v-for="n in stylePickerField.styleCount" :key="n"
            class="pe-style-card pe-style-card-img" :class="{ active: Number(selectedComp?.props[stylePickerField?.key]) === n }"
            @click="pickStyleNum(n)"
          >
            <img :src="styleImg(stylePickerField, n)" class="pe-style-thumb-img" />
            <span class="pe-style-name">风格{{ n }}</span>
            <span class="pe-style-check">✓</span>
          </div>
        </template>
        <div
          v-else
          v-for="o in (stylePickerField?.options || [])" :key="o.value"
          class="pe-style-card" :class="{ active: String(selectedComp?.props[stylePickerField?.key]) === String(o.value) }"
          @click="pickStyle(o)"
        >
          <div class="pe-style-thumb" :class="'pe-style-thumb-s' + o.value">
            <span class="th-cd">
              <span class="th-cd-title">距离活动开始还有</span>
              <span v-if="o.value === 1" class="th-cd-row th-s1">
                <b>01</b><i>天</i><b>22</b><i>小时</i><b>18</b><i>分</i>
              </span>
              <span v-else class="th-cd-row th-s2">01天22小时18分</span>
              <span class="th-cd-btn">抢先查看</span>
            </span>
          </div>
          <span class="pe-style-name">{{ o.label }}</span>
          <span class="pe-style-check">✓</span>
        </div>
      </div>
    </el-dialog>

    <!-- 历史版本 -->
    <el-dialog v-model="versionShow" title="历史版本（发布保留最近 3 版）" width="560px" append-to-body>
      <el-table :data="versions" size="small" stripe>
        <el-table-column label="版本" prop="version" width="100">
          <template #default="{ row }">v{{ row.version }}</template>
        </el-table-column>
        <el-table-column label="发布时间" prop="created_at" />
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button size="small" type="primary" text @click="rollback(row)">回滚</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!versions.length" class="pe-empty">暂无历史版本（发布后自动生成）</div>
    </el-dialog>

    <!-- 素材选择（照抄 eweishop/资源选择器：模式/搜索/分类/分页/上传/网络提取） -->
    <MaterialPicker v-model="imgSel.show" @confirm="confirmImgSel" />

    <!-- 系统链接选择器（分类配置驱动） -->
    <LinkPicker v-model="linkSel.show" :model-link="linkSel.current" @confirm="confirmLinkSel" />

    <!-- 热区编辑器（1:1 还原 eweishop：4步步骤条 + 黄色热区框双击添加链接 + 添加热区/保存） -->
    <el-dialog v-model="hsSel.show" title="热区编辑器" width="820px" append-to-body :close-on-click-modal="false">
      <div v-if="hsSel.show">
        <div class="hs-steps">
          <div class="hs-step on"><span class="hs-step-n">1</span><span class="hs-step-t">添加热区</span></div>
          <div class="hs-step"><span class="hs-step-n">2</span><span class="hs-step-t">调整热区大小及位置</span></div>
          <div class="hs-step"><span class="hs-step-n">3</span><span class="hs-step-t">设置热区链接</span></div>
          <div class="hs-step"><span class="hs-step-n">4</span><span class="hs-step-t">保存设置</span></div>
        </div>
        <div class="hs-stage">
          <div
            class="hs-inner"
            @mousedown.self="onHsStageDown"
            @mousemove="onHsMove"
            @mouseup="onHsUp"
            @mouseleave="onHsUp"
          >
            <img v-if="hsSel.imgUrl" :src="resolveUrl(hsSel.imgUrl)" class="hs-img" />
            <div v-else class="hs-noimg">请先为该项选择图片</div>
            <div
              v-for="(h, hi) in hsSel.hotspots" :key="hi"
              class="hs-box" :class="{ selected: hsSel.active === hi }"
              :style="{ left: h.x + '%', top: h.y + '%', width: h.w + '%', height: h.h + '%' }"
              @mousedown.stop.prevent="onHsBoxDown($event, hi)"
              @dblclick.stop.prevent="onHsBoxDbl(hi)"
            >
              <span class="hs-box-text">双击添加链接</span>
              <span class="hs-box-del" title="删除热区" @mousedown.stop.prevent @click.stop="removeHs(hi)">×</span>
            </div>
          </div>
        </div>
        <div class="hs-footer">
          <el-button size="small" type="primary" @click="addHs">添加热区</el-button>
          <el-button size="small" @click="hsSel.show = false">取消</el-button>
          <el-button size="small" type="primary" @click="hsSel.show = false">保存</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { designCall } from '../../../../api';
import { componentRegistry, componentGroups, COMP_ICONS, findComponent, commonStyleSchema, commonStyleProps } from './componentRegistry';
import ComponentRender from './ComponentRender.vue';
import MaterialPicker from './MaterialPicker.vue';
import LinkPicker from './LinkPicker.vue';
import HeaderEwPanel, { mkEwHeader } from './HeaderEwPanel.vue';
import PeColorPicker from './PeColorPicker.vue';
import PeImagePicker from './PeImagePicker.vue';
import PeImageGroup from './PeImageGroup.vue';
import RichTextEditor from './RichTextEditor.vue';
import CubeStylePicker from './CubeStylePicker.vue';
import CubeLayoutEditor from './CubeLayoutEditor.vue';
import SIcon from '../../../../components/SIcon.vue';
import { cubeBlocksForStyle } from './cubeLayouts';
import { mergeEwHeader } from '../../../../utils/designHeader';

const props = defineProps({
  pageType: { type: String, default: 'home' },
});
const emit = defineEmits(['dirty-change', 'page-switch']);
const pageName = ref('首页');
const components = ref([]);
const selected = ref(null);
// 魔方：当前选中的格子（属性面板样式区编辑该格圆角/间隔）
const cubeSel = ref(null);
const cubeCellTarget = computed(() => {
  if (!cubeSel.value) return null;
  const comp = components.value.find((c) => c.id === cubeSel.value.compId);
  if (!comp || comp.type !== 'cube') return null;
  const blocks = comp.props.blocks || [];
  const b = blocks[cubeSel.value.index];
  return b || null;
});
function onCubeCellSelect(comp, index) {
  cubeSel.value = { compId: comp.id, index };
}
function onCubeLayoutSelect(index) {
  if (selected.value) cubeSel.value = { compId: selected.value, index };
}
const draft = ref(null);
const published = ref(null);
const saving = ref(false);
const publishing = ref(false);
const previewing = ref(false);
const versionShow = ref(false);
// 风格选择器（eweishop 1:1：修改风格 → 弹窗选择）
const stylePickerVisible = ref(false);
const stylePickerField = ref(null);
// 风格预览图（eweishop 1:1：design-styles/{group}/style{n}.png）
const styleImgs = import.meta.glob('/src/assets/design-styles/**/*.png', { eager: true, import: 'default' });
function styleImg(f, n) {
  if (!f?.styleGroup) return '';
  const v = Number(n) || 1;
  return styleImgs[`/src/assets/design-styles/${f.styleGroup}/style${v}.png`] || '';
}
// ew 1:1 实测：标题栏切风格联动（主标题族颜色 / 标题文字族颜色；文案字段独立不重置）
const TB_STYLE_COLOR = { 1: '#333333', 2: '#333333', 3: '#F1FF9A', 4: '#3B2BE7', 5: '#FF95AC', 6: '#FF3B3B', 7: '#333333', 8: '#333333', 9: '#333333' };
function pickStyleNum(n) {
  if (!selectedComp.value || !stylePickerField.value) return;
  selectedComp.value.props[stylePickerField.value.key] = n;
  // 标题栏切风格：主标题族（S1-6）重置 titleColor，标题文字族（S7-9）重置 titleColor2（ew 实测）
  if (selectedComp.value.type === 'title-bar' && stylePickerField.value.key === 'styleType') {
    if (n >= 7) {
      selectedComp.value.props.titleColor2 = TB_STYLE_COLOR[n] || '#333333';
    } else {
      selectedComp.value.props.titleColor = TB_STYLE_COLOR[n] || '#333333';
    }
  }
  stylePickerVisible.value = false;
}
function styleName(f) {
  const o = (f.options || []).find((x) => String(x.value) === String(selectedComp.value?.props?.[f.key]));
  return o ? o.label : (f.options?.[0]?.label || '');
}
function openStylePicker(f) {
  stylePickerField.value = f;
  stylePickerVisible.value = true;
}
function pickStyle(o) {
  if (!selectedComp.value || !stylePickerField.value) return;
  selectedComp.value.props[stylePickerField.value.key] = o.value;
  stylePickerVisible.value = false;
}
const versions = ref([]);
const imgSel = reactive({ show: false, pick: null, target: null });
let imgSelListField = null; // 当前 list 字段定义（openImgSel 传入，确认时回写对应 key）
const kw = ref('');
const expanded = reactive({});

// ---- 组件库：模块列表 / 页面列表 ----
const libTab = ref('modules');
const pageKw = ref('');
const pageList = ref([]);
// ---- 页面级 meta（主题/全局/头部/底部导航，随草稿一起保存） ----
const meta = reactive({
  theme: { shareTitle: '', passwordEnabled: false, password: '', memberOnly: false },
  global: { bgColor: '', bgImage: '', cardRadius: 8, cardPadding: 8, cardGap: 12, headerDefault: { scheme: 1, ew: mkEwHeader() } },
  header: { type: 'custom', bgColor: '#ffffff', bgImage: '', fixed: true, padding: 0, lines: 1, titleText: '', textColor: '#1d2129', content: mkHeaderRow(), content2: mkHeaderRow(), scheme: 1, ew: mkEwHeader() },
  nav: { mode: 'default', schemeId: null, jumpEnabled: true },
});

// 头部方案（页面覆盖全局默认）：header.scheme ?? global.headerDefault.scheme ?? 1
const headerScheme = computed(() => meta.header.scheme ?? meta.global.headerDefault.scheme ?? 1);
function setHeaderScheme(v) {
  meta.header.scheme = v;
}

// 手机壳/画布背景 = 全局设置（背景色/背景图），编辑端与 C 端渲染一致
const phoneStyle = computed(() => {
  const s = {};
  const g = meta.global || {};
  if (g.bgImage) {
    s.backgroundImage = `url(${resolveUrl(g.bgImage)})`;
    s.backgroundSize = 'cover';
    s.backgroundPosition = 'center';
  }
  if (g.bgColor) s.backgroundColor = g.bgColor;
  return s;
});
const tabSchemes = ref([]);
const headerPanel = reactive({ show: false, active: 'header', tabs: [
  { key: 'theme', label: '主题设置' },
  { key: 'global', label: '全局设置' },
  { key: 'header', label: '头部设置' },
  { key: 'nav', label: '底部导航' },
] });
// ---- dirty 快照（方案A：保存后快照对比，返回前检测） ----
let baseSnapshot = '';
let dirty = false;
function snapshot() { return JSON.stringify({ components: components.value, meta }); }
function setDirty() {
  const now = snapshot();
  const next = now !== baseSnapshot;
  if (next !== dirty) { dirty = next; emit('dirty-change', dirty); }
}
watch(snapshot, () => setDirty(), { deep: true });

// 视频样式比例卡片的矩形尺寸（eweishop 原版：16:9 / 4:3 / 1:1 / 9:16）
const ratioShapes = {
  '16:9': { w: 38, h: 21.4 },
  '4:3': { w: 32, h: 24 },
  '1:1': { w: 27, h: 27 },
  '9:16': { w: 22, h: 32 },
};
// 导航栏渲染（按头部设置，照抄云菜鸟：custom=按配置 / immersive=透明悬浮 / official=白底深字固定样式）
const navStyle = computed(() => {
  const h = meta.header;
  const style = {};
  if (h.type === 'immersive') style.background = 'transparent';
  else if (h.type === 'official') style.background = '#ffffff';
  else if (h.bgImage) style.background = `url(${resolveUrl(h.bgImage)}) center / cover no-repeat`;
  else style.background = h.bgColor || '#ffffff';
  if (h.padding) style.padding = `0 ${h.padding}px`;
  return style;
});

// ---- 方案二（ew）头部：全局默认 + 单页覆盖合并，编辑端预览渲染（与 C 端 normalizeHeader scheme===2 逻辑一致，合并逻辑在 utils/designHeader.js） ----
const ewHeader = computed(() => mergeEwHeader(meta.global.headerDefault?.ew, meta.header.ew));
const ewShownLayers = computed(() => {
  const ew = ewHeader.value;
  const layers = Array.isArray(ew.layers) ? ew.layers : [];
  if (ew.funcModule === 'none') return [];
  return ew.funcModule === 'double' ? layers : [layers[0] || {}];
});
const ewNavStyle = computed(() => {
  const ew = ewHeader.value;
  const bg = ew.headBg || {};
  if (bg.mode === 'image' && bg.image) {
    return { backgroundImage: `url(${resolveUrl(bg.image)})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return { background: bg.color || '#ffffff' };
});
const ewTitleColor = computed(() => {
  const ew = ewHeader.value;
  if (ew.funcModule === 'none') return ew.textColor === 'white' ? '#ffffff' : '#1d2129';
  return '#1d2129';
});
const ewLineStyle = computed(() => {
  const pad = ewHeader.value.padding || 0;
  return pad ? { paddingLeft: `${pad}px`, paddingRight: `${pad}px` } : {};
});
function ewSearchStyle(layer) {
  const s = layer.middle?.search || {};
  const arr = [];
  if (s.fillBg) arr.push(`background:${s.fillBg}`);
  if (s.borderBg) arr.push(`border:1px solid ${s.borderBg}`);
  return arr.join(';');
}
const navTextColor = computed(() => {
  const t = meta.header.type;
  if (t === 'immersive') return '#ffffff';
  if (t === 'official') return '#1d2129';
  return meta.header.textColor || '#1d2129';
});
function navPosHtml(pos) {
  // 仿官方 / 沉浸式头部为固定样式，不渲染左右自定义内容（与配置菜单一致）
  if (meta.header.type === 'official' || meta.header.type === 'immersive') return '';
  const c = meta.header.content[pos] || {};
  const color = meta.header.type === 'immersive' ? '#ffffff' : (c.color || '#1d2129');
  if (c.type === 'none' || !c.type) return '';
  const weight = c.bold ? 'font-weight:600;' : '';
  if (c.type === 'text') return `<span style="color:${color};font-size:${c.fontSize || 13}px;${weight}line-height:1">${c.text || ''}</span>`;
  if (c.type === 'search') return `<span style="display:inline-flex;align-items:center;gap:4px;color:${color};font-size:${c.fontSize || 12}px;background:rgba(0,0,0,.05);border-radius:12px;padding:2px 10px;line-height:1.4">⌕ ${c.text || '搜索'}</span>`;
  if (c.type === 'image' && c.image) return `<img src="${resolveUrl(c.image)}" style="height:28px;max-width:60px;object-fit:contain" />`;
  if (c.type === 'iconText') return `<span style="display:inline-flex;align-items:center;gap:3px;color:${color};font-size:${c.fontSize || 12}px;${weight}line-height:1">● ${c.text || ''}</span>`;
  return '';
}
// 中间部分：配置了内容则按配置（背景/边框/宽度/圆角/对齐/字体色）渲染，否则回退标题文字
function navCenterHtml(rowKey) {
  if (meta.header.type === 'official') return meta.header.titleText || '首页';
  if (meta.header.type === 'immersive') return meta.header.titleText || '首页';
  const c = (meta.header[rowKey] || meta.header.content)['center'] || {};
  const color = (meta.header.type === 'immersive' ? '#ffffff' : (c.color || meta.header.textColor || '#1d2129'));
  if (c.type && c.type !== 'none' && (c.text || c.image)) {
    let inner = '';
    if (c.type === 'text') inner = `<span style="color:${color};font-size:${c.fontSize || 13}px;${c.bold ? 'font-weight:600;' : ''}line-height:1">${c.text}</span>`;
    else if (c.type === 'image' && c.image) inner = `<img src="${resolveUrl(c.image)}" style="height:26px;max-width:120px;object-fit:contain;display:block" />`;
    else if (c.type === 'search') inner = `<span style="color:${color};font-size:${c.fontSize || 12}px;background:rgba(0,0,0,.05);border-radius:12px;padding:2px 10px">⌕ ${c.text || '搜索'}</span>`;
    const style = [];
    if (c.bgColor) style.push(`background:${c.bgColor}`);
    if (c.borderColor) style.push(`border:1px solid ${c.borderColor}`);
    if (c.width) style.push(`width:${c.width}px`);
    if (c.radius != null) style.push(`border-radius:${c.radius}px`);
    style.push('display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 10px;box-sizing:border-box');
    return `<span style="${style.join(';')}">${inner}</span>`;
  }
  const base = meta.header.type === 'immersive' ? '#ffffff' : (meta.header.textColor || '#1d2129');
  return `<span style="color:${base};font-size:14px;font-weight:600;line-height:1">${meta.header.titleText || '首页'}</span>`;
}
const navLeftHtml = computed(() => navPosHtml('left'));
const navRightHtml = computed(() => navPosHtml('right'));
const navCenterHtml1 = computed(() => navCenterHtml('content'));
const navCenterHtml2 = computed(() => (meta.header.lines === 2 ? navCenterHtml('content2') : ''));
function navPosHtml2(pos) {
  if (meta.header.type !== 'custom' || meta.header.lines !== 2) return '';
  const c = (meta.header.content2 || {})[pos] || {};
  const color = c.color || '#1d2129';
  if (c.type === 'none' || !c.type) return '';
  const weight = c.bold ? 'font-weight:600;' : '';
  if (c.type === 'text') return `<span style="color:${color};font-size:${c.fontSize || 13}px;${weight}line-height:1">${c.text || ''}</span>`;
  if (c.type === 'search') return `<span style="display:inline-flex;align-items:center;gap:4px;color:${color};font-size:12px;background:rgba(0,0,0,.05);border-radius:12px;padding:2px 10px;line-height:1.4">⌕ ${c.text || '搜索'}</span>`;
  if (c.type === 'image' && c.image) return `<img src="${resolveUrl(c.image)}" style="height:28px;max-width:60px;object-fit:contain" />`;
  if (c.type === 'iconText') return `<span style="display:inline-flex;align-items:center;gap:3px;color:${color};font-size:12px;line-height:1">● ${c.text || ''}</span>`;
  return '';
}
function mkHeaderRow() {
  return {
    left: { type: 'none', text: '', image: '', link: '', color: '#1d2129', bold: 0, fontSize: 13 },
    center: { type: 'none', text: '', image: '', link: '', color: '#1d2129', bold: 0, fontSize: 13, bgColor: '', borderColor: '', width: 154, radius: 23, align: 'center' },
    right: { type: 'none', text: '', image: '', link: '', color: '#1d2129', bold: 0, fontSize: 13 },
  };
}
const headerBlocks = computed(() => {
  const blocks = [{ label: '第一行内容', row: meta.header.content }];
  if (meta.header.lines === 2) blocks.push({ label: '第二行内容', row: meta.header.content2 });
  return blocks;
});
function openHeaderPanel() { headerPanel.active = 'header'; headerPanel.show = true; }
function openHeaderImg(target, pos, row) {
  imgSel.target = pos ? { target, pos, row: row || null } : { target };
  imgSel.show = true;
}

// 页面列表（模块列表 tab 之外承载页面切换/新建/复制/删除；同 page_type 合并为一行）
// mergedPages 为响应式数组（loadPageList 时构建），支持拖拽排序直接 splice 重排
const mergedPages = ref([]);
function mergePages(list) {
  const map = new Map();
  for (const p of list || []) {
    const exist = map.get(p.page_type);
    if (!exist || (p.status === 1 && exist.status !== 1)) map.set(p.page_type, p);
  }
  return [...map.values()];
}
const filteredPages = computed(() => {
  const kw2 = pageKw.value.trim();
  if (!kw2) return mergedPages.value;
  return mergedPages.value.filter((p) => (p.page_name || '').includes(kw2));
});
const homePageType = computed(() => mergedPages.value.find((p) => p.isHome)?.page_type || 'home');
// 页面列表拖拽排序：dragstart 记起点 → dragover 重排（splice）→ drop 提交后端
const pageDrag = ref(null);
function onPageDragStart(e, idx) {
  pageDrag.value = { from: idx };
  e.dataTransfer.effectAllowed = 'move';
}
function onPageDragOver(e, idx) {
  e.preventDefault();
  if (!pageDrag.value || pageDrag.value.from === idx) return;
  const arr = mergedPages.value;
  if (idx < 0 || idx >= arr.length) return;
  const [moved] = arr.splice(pageDrag.value.from, 1);
  arr.splice(idx, 0, moved);
  pageDrag.value.from = idx;
}
async function onPageDrop() {
  if (!pageDrag.value) return;
  pageDrag.value = null;
  try {
    await designCall.post('/design/page/sort', { pageTypes: mergedPages.value.map((p) => p.page_type) });
    ElMessage.success('页面顺序已保存');
  } catch (e) { ElMessage.error(e); }
}
function onPageDragEnd() { pageDrag.value = null; }
async function loadPageList() {
  try {
    const res = await designCall.get('/design/page/list');
    pageList.value = res.list || [];
    mergedPages.value = mergePages(pageList.value);
  } catch (e) { /* 页面列表加载失败不阻塞编辑 */ }
}
async function toggleHome(p) {
  if (p.isHome) return;
  try {
    await designCall.post('/design/page/setHome', { id: p.id });
    ElMessage.success(`已切换首页为「${p.page_name}」`);
    await loadPageList();
  } catch (e) { ElMessage.error(e); }
}
function switchPage(type) {
  if (type === props.pageType) return;
  emit('page-switch', type);
}
async function createPage() {
  try {
    const { value } = await ElMessageBox.prompt('请输入页面名称', '新建页面', { inputValue: `新页面 ${pageList.value.length + 1}`, inputPattern: /\S+/, inputErrorMessage: '页面名称不能为空' });
    const res = await designCall.post('/design/page/create', { pageName: value });
    ElMessage.success('页面已创建');
    await loadPageList();
    emit('page-switch', res.pageType);
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}
async function renamePage(p) {
  try {
    const { value } = await ElMessageBox.prompt('请输入新页面名称', '重命名页面', { inputValue: p.page_name, inputPattern: /\S+/, inputErrorMessage: '页面名称不能为空' });
    await designCall.post('/design/page/rename', { pageType: p.page_type, pageName: value });
    ElMessage.success('已重命名');
    await loadPageList();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}
async function copyPage(p) {
  try {
    const res = await designCall.post('/design/page/copy', { pageType: p.page_type });
    ElMessage.success('已复制');
    await loadPageList();
    emit('page-switch', res.pageType);
  } catch (e) { ElMessage.error(e); }
}
async function deletePage(p) {
  try { await ElMessageBox.confirm(`确认删除页面「${p.page_name}」？删除后不可恢复`, '删除确认', { type: 'warning' }); } catch { return; }
  try {
    await designCall.post('/design/page/delete', { pageType: p.page_type });
    ElMessage.success('已删除');
    await loadPageList();
    // 删除的是当前正在编辑的页面 → 切回首页
    if (p.page_type === props.pageType) emit('page-switch', 'home');
  } catch (e) { ElMessage.error(e); }
}

let uid = 1;
const selectedComp = computed(() => {
  const c = components.value.find((c) => c.id === selected.value) || null;
  return c ? { ...c, name: findComponent(c.type)?.name || c.type } : null;
});
// 属性面板分组：内容 / 样式 + 通用样式（跳过组件已有同名 key）；支持 schema 字段 group（ew 1:1 分组面板）
const schemaSections = computed(() => {
  if (!selectedComp.value) return [];
  const def = findComponent(selectedComp.value.type);
  if (!def) return [];
  const ownKeys = def.schema.map((f) => f.key);
  const common = commonStyleSchema.filter((f) => !ownKeys.includes(f.key) && !(f.key === 'padding' && (ownKeys.includes('marginLeft') || ownKeys.includes('marginRight') || ownKeys.includes('marginLR') || (selectedComp.value.type === 'title-bar' && ownKeys.includes('marginTop')))) && !(f.key === 'radius' && (ownKeys.includes('radiusTop') || ownKeys.includes('radiusBottom'))) && !(selectedComp.value.type === 'rich-text' && f.key === 'bgColor'));
  const props = selectedComp.value.props || {};
  const whenOk = (f) => {
    if (f.whenStyle && !f.whenStyle.includes(Number(props.styleType))) return false;
    if (f.whenNotStyle && f.whenNotStyle.includes(Number(props.styleType))) return false;
    return !f.when || Object.entries(f.when).every(([k, v]) => props[k] === v || String(props[k]) === String(v));
  };
  const grpFields = def.schema.filter((f) => f.group && whenOk(f));
  if (grpFields.length) {
    // 按 group 分组（保持 schema 出现顺序），组内字段按 ew 面板顺序
    const groups = [];
    const seen = new Set();
    for (const f of def.schema) {
      if (!f.group || !whenOk(f)) continue;
      if (!seen.has(f.group)) { seen.add(f.group); groups.push({ key: 'g' + groups.length, label: f.group, fields: [] }); }
      groups[groups.length - 1].fields.push(f);
    }
    // 顶部字段（选择风格等）置于分组前；无分组的普通字段（会员等级等）置于分组后，与 ew 面板顺序一致
    const topPlain = def.schema.filter((f) => !f.group && f.control === 'stylePicker' && whenOk(f));
    const bottomPlain = def.schema.filter((f) => !f.group && f.control !== 'stylePicker' && !f.whenStyle && !f.whenNotStyle && whenOk(f));
    const merged = [];
    if (topPlain.length) merged.push({ key: 'plain', label: '', fields: topPlain });
    merged.push(...groups);
    if (bottomPlain.length) merged.push({ key: 'plain2', label: '', fields: bottomPlain });
    if (common.length) merged.push({ key: 'common', label: '通用样式', fields: common });
    return merged;
  }
  return buildSecs(def, whenOk, common);
});

// 通用分组：按 schema 物理顺序动态建组（支持自定义 section，如富文本 bg/style/content/margin/radius/member）
const SEC_LABELS = { content: '内容', style: '样式', bg: '选择颜色', margin: '边距', radius: '圆角设置', member: '' };
function buildSecs(def, whenOk, common) {
  const secs = [];
  const secOrder = [];
  for (const f of def.schema) {
    if (!whenOk(f)) continue;
    const key = f.group || f.section || 'content';
    let idx = secOrder.indexOf(key);
    if (idx === -1) {
      secOrder.push(key);
      idx = secOrder.length - 1;
      secs.push({ key, label: f.group || SEC_LABELS[f.section] || '', fields: [] });
    }
    secs[idx].fields.push(f);
  }
  if (common.length) secs.push({ key: 'common', label: '通用样式', fields: common });
  return secs;
}

// 组件库：搜索 + 分组
const visibleGroups = computed(() => {
  if (!kw.value) return componentGroups.filter((g) => groupCount(g.key) > 0);
  return componentGroups.filter((g) => filteredCount(g.key) > 0);
});
function groupCount(key) {
  return componentRegistry.filter((c) => c.group === key).length;
}
function filteredComps(key) {
  const list = componentRegistry.filter((c) => c.group === key);
  if (!kw.value) return list;
  return list.filter((c) => c.name.includes(kw.value));
}
function filteredCount(key) { return filteredComps(key).length; }
function toggleGroup(key) { expanded[key] = expanded[key] === false ? true : false; }

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}
function compName(t) { return findComponent(t)?.name || t; }

function newComp(type) {
  const def = findComponent(type);
  // 富文本使用专属字段(marginLR/radiusTop/radiusBottom/compBgColor/bottomBg)，不合并通用样式字段
  const base = type === 'rich-text' ? {} : commonStyleProps;
  return { id: `c${Date.now()}-${uid++}`, type, props: { ...base, ...(def?.defaultProps || {}) } };
}
// 魔方存量迁移：旧 items/rows/cols 数据 → blocks/styleType
function migrateCube(c) {
  if (!c || c.type !== 'cube') return;
  const p = c.props;
  if (!p) return;
  if (!p.styleType) p.styleType = 1;
  if (Array.isArray(p.blocks) && p.blocks.length) return;
  if (Array.isArray(p.items) && p.items.length) {
    const cols = p.cols || 3;
    const rows = p.rows || 2;
    const cw = 312 / cols;
    const ch = 312 / rows;
    p.blocks = p.items.map((it, i) => ({
      x: Math.round((i % cols) * cw),
      y: Math.round(Math.floor(i / cols) * ch),
      w: Math.round(cw),
      h: Math.round(ch),
      url: it.url || '',
      link: it.link || '',
    }));
  } else {
    p.blocks = cubeBlocksForStyle(p.styleType);
  }
}
function addComponent(type) {
  const c = newComp(type);
  migrateCube(c);
  // 有选中组件时插入到其之后，否则追加到末尾
  const selIdx = components.value.findIndex((x) => x.id === selected.value);
  if (selIdx >= 0) {
    components.value.splice(selIdx + 1, 0, c);
  } else {
    components.value.push(c);
  }
  selected.value = c.id;
}
function removeComp(id) {
  components.value = components.value.filter((c) => c.id !== id);
  if (selected.value === id) selected.value = null;
}
function dupComp(comp) {
  const c = { ...newComp(comp.type), props: JSON.parse(JSON.stringify(comp.props)), id: `c${Date.now()}-${uid++}` };
  const idx = components.value.findIndex((x) => x.id === comp.id);
  components.value.splice(idx + 1, 0, c);
  selected.value = c.id;
}
function selectComp(comp) { selected.value = comp.id; cubeSel.value = null; const c = components.value.find((x) => x.id === comp.id); migrateCube(c); }
function onLibDragStart(e, type) { e.dataTransfer.setData('text/plain', type); }
function onCanvasDragOver() {}
function onCanvasDrop(e) {
  const type = e.dataTransfer.getData('text/plain');
  if (type && findComponent(type)) addComponent(type);
}
let dragIdx = -1;
function onCompDragStart(e, i) { dragIdx = i; e.dataTransfer.effectAllowed = 'move'; }
function onCompDragOver(i) {
  if (dragIdx >= 0 && dragIdx !== i) {
    const arr = [...components.value];
    const [moved] = arr.splice(dragIdx, 1);
    arr.splice(i, 0, moved);
    components.value = arr;
    dragIdx = i;
  }
}
function onCompDrop() { dragIdx = -1; }

async function load() {
  try {
    const [pubRes, draftRes, tabsRes] = await Promise.all([
      designCall.get('/design/page/detail', { params: { pageType: props.pageType, published: 1 } }),
      designCall.get('/design/page/detail', { params: { pageType: props.pageType, published: 0 } }),
      designCall.get('/design/tab/list'),
    ]);
    published.value = pubRes.page || null;
    draft.value = draftRes.page || null;
    tabSchemes.value = tabsRes.list || [];
    const src = draft.value || published.value;
    if (src) {
      pageName.value = src.page_name || '页面';
      const json = src.design_json || {};
      components.value = (json.components || []).map((c) => {
        const def = findComponent(c.type);
        const base = c.type === 'rich-text' ? {} : commonStyleProps;
        const props = { ...base, ...(def?.defaultProps || {}), ...(c.props || {}) };
        // 富文本旧通用字段(padding/radius/bgColor)已废弃，加载时清除
        if (c.type === 'rich-text') { delete props.padding; delete props.radius; delete props.bgColor; }
        // 旧 marginLeft/marginRight → marginLR 迁移（2026-09-11 边距统一）
        if (props.marginLeft != null || props.marginRight != null) {
          props.marginLR = Math.max(props.marginLeft ?? 0, props.marginRight ?? 0);
          delete props.marginLeft; delete props.marginRight;
        }
        return { ...c, props };
      });
      if (json.meta) Object.assign(meta, deepMerge(defaultMeta(), json.meta));
      else Object.assign(meta, defaultMeta());
    } else {
      Object.assign(meta, defaultMeta());
    }
    baseSnapshot = snapshot();
    dirty = false;
    emit('dirty-change', false);
  } catch (e) { ElMessage.error(e); }
}
function defaultMeta() {
  return {
    theme: { shareTitle: '', passwordEnabled: false, password: '', memberOnly: false },
    global: { bgColor: '', bgImage: '', cardRadius: 8, cardPadding: 8, cardGap: 12, headerDefault: { scheme: 1, ew: mkEwHeader() } },
    header: { type: 'custom', bgColor: '#ffffff', bgImage: '', fixed: true, padding: 0, lines: 1, titleText: '', textColor: '#1d2129', content: mkHeaderRow(), content2: mkHeaderRow(), scheme: 1, ew: mkEwHeader() },
    nav: { mode: 'default', schemeId: null, jumpEnabled: true },
  };
}
function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(patch)) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], patch[k]);
    } else {
      out[k] = patch[k];
    }
  }
  return out;
}
async function saveDraft() {
  saving.value = true;
  try {
    const res = await designCall.post('/design/page/saveDraft', {
      pageType: props.pageType, pageName: pageName.value,
      designJson: { components: components.value, meta: { ...meta } },
      baseVersion: draft.value?.version ?? published.value?.version ?? 1,
    });
    draft.value = { ...draft.value, version: res.version };
    baseSnapshot = snapshot();
    dirty = false;
    emit('dirty-change', false);
    ElMessage.success('草稿已保存');
  } catch (e) {
    if (typeof e === 'string' && e.includes('已被其他成员修改')) {
      try {
        await ElMessageBox.confirm(e + '，是否重新加载最新版本？', '版本冲突', { type: 'warning' });
        await load();
      } catch { /* 用户取消 */ }
    } else ElMessage.error(e);
  } finally { saving.value = false; }
}
async function publish() {
  if (!draft.value) { ElMessage.warning('请先保存草稿再发布'); return; }
  try {
    await ElMessageBox.confirm('发布后小程序端将立即按最新配置渲染，确认发布？', '发布确认', { type: 'warning' });
  } catch { return; }
  publishing.value = true;
  try {
    const res = await designCall.post('/design/page/publish', { pageType: props.pageType });
    ElMessage.success(`已发布 v${res.version}`);
    draft.value = null;
    await load();
  } catch (e) { ElMessage.error(e); } finally { publishing.value = false; }
}
async function loadVersions() {
  try {
    const res = await designCall.get('/design/page/versionList', { params: { pageType: props.pageType } });
    versions.value = res.list || [];
    versionShow.value = true;
  } catch (e) { ElMessage.error(e); }
}
async function rollback(row) {
  try { await ElMessageBox.confirm(`回滚到 v${row.version}？将生成一份草稿，需再次发布生效`, '版本回滚', { type: 'warning' }); } catch { return; }
  try {
    const res = await designCall.post('/design/page/rollback', { pageType: props.pageType, version: row.version });
    if (res.ok) {
      ElMessage.success('已生成回滚草稿');
      versionShow.value = false;
      await load();
    }
  } catch (e) { ElMessage.error(e); }
}
async function saveAndPreview() {
  if (!components.value.length) { ElMessage.warning('画布为空，请先添加组件'); return; }
  previewing.value = true;
  try {
    const res = await designCall.post('/design/page/saveDraft', {
      pageType: props.pageType, pageName: pageName.value,
      designJson: { components: components.value, meta: { ...meta } },
      baseVersion: draft.value?.version ?? published.value?.version ?? 1,
    });
    draft.value = { ...draft.value, version: res.version };
    baseSnapshot = snapshot();
    dirty = false;
    emit('dirty-change', false);
    // 仅首页装修支持 C 端实时预览（后端生成带签名的一次性预览 URL；draft=1 预览草稿）
    if (props.pageType === homePageType.value) {
      const previewRes = await designCall.get('/design/previewUrl', { params: { draft: 1 } });
      if (previewRes?.url) window.open(previewRes.url, '_blank');
      else ElMessage.info('草稿已保存；暂无法打开预览');
    } else {
      ElMessage.info('草稿已保存；当前仅首页支持 C 端预览');
    }
  } catch (e) {
    if (typeof e === 'string' && e.includes('已被其他成员修改')) {
      ElMessage.warning(e + '，请先「保存草稿」处理冲突');
    } else ElMessage.error(e);
  } finally { previewing.value = false; }
}
async function saveAsTemplate() {
  if (!components.value.length) { ElMessage.warning('画布为空，请先添加组件'); return; }
  try {
    const { value } = await ElMessageBox.prompt('请输入模板名称', '另存为模板', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: `${pageName.value}模板`,
      inputValidator: (v) => (v && v.trim() ? true : '模板名称不能为空'),
    });
    const res = await designCall.post('/design/template/saveMy', {
      name: value.trim(),
      templateJson: { pages: { [props.pageType]: { components: components.value } } },
    });
    if (res.ok) ElMessage.success('已另存为私有模板，可在「系统模板」中查看应用');
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e);
  }
}
function openImgSel(listIdx, fieldIdx, listField) {
  imgSel.target = typeof listIdx === 'number' && typeof fieldIdx === 'number' ? { listIdx, fieldIdx } : null;
  imgSelListField = imgSel.target ? (listField || null) : null;
  imgSel.show = true;
}
function confirmImgSel(url, mid) {
  if (url && selectedComp.value) {
    if (imgSel.target && imgSelListField) {
      const items = selectedComp.value.props[imgSelListField.key] || [];
      if (!items[imgSel.target.listIdx]) items[imgSel.target.listIdx] = {};
      items[imgSel.target.listIdx][imgSelListField.itemFields[imgSel.target.fieldIdx].key] = url;
    } else if (imgSel.target?.pos) {
      const row = imgSel.target.row || meta.header.content;
      row[imgSel.target.pos].image = url;
    } else if (imgSel.target?.target === 'header') {
      meta.header.bgImage = url;
    } else if (imgSel.target?.target === 'global') {
      meta.global.bgImage = url;
    } else if (selectedComp.value) {
      selectedComp.value.props.url = url;
      selectedComp.value.props.materialId = mid ?? null;
    }
  }
  imgSel.show = false;
}

// 魔方：切换风格时重置区块为预设布局
function onCubeStyleChange(v) {
  if (!selectedComp.value) return;
  selectedComp.value.props.styleType = v;
  selectedComp.value.props.blocks = cubeBlocksForStyle(v);
}
// 系统链接选择器：link 字段点「选择」弹窗回填
const linkSel = reactive({ show: false, fieldKey: null, listField: null, listIdx: null, fieldIdx: null, headerPos: null, headerRow: null, current: '', hsMode: false });
function openLinkSel(listIdx, fieldIdx, listField) {
  let current = '';
  if (selectedComp.value) {
    if (typeof listIdx === 'number' && typeof fieldIdx === 'number' && listField) {
      const items = selectedComp.value.props[listField.key] || [];
      current = (items[listIdx] || {})[listField.itemFields[fieldIdx].key] || '';
    } else if (listField) {
      current = selectedComp.value.props[listField.key] || '';
    }
  }
  linkSel.fieldKey = listField?.key || null;
  linkSel.listField = listField || null;
  linkSel.listIdx = typeof listIdx === 'number' ? listIdx : null;
  linkSel.fieldIdx = typeof fieldIdx === 'number' ? fieldIdx : null;
  linkSel.headerPos = null;
  linkSel.hsMode = false;
  linkSel.current = current;
  linkSel.show = true;
}
function openHeaderLink(pos, row) {
  linkSel.fieldKey = null;
  linkSel.listField = null;
  linkSel.listIdx = null;
  linkSel.fieldIdx = null;
  linkSel.headerPos = pos;
  linkSel.headerRow = row || null;
  linkSel.hsMode = false;
  linkSel.current = (row || meta.header.content)[pos]?.link || '';
  linkSel.show = true;
}
function confirmLinkSel(link) {
  if (link) {
    if (linkSel.hsMode && hsSel.show && hsSel.active !== null) {
      hsSel.hotspots[hsSel.active].link = link;
    } else if (linkSel.headerPos) {
      const row = linkSel.headerRow || meta.header.content;
      if (!row[linkSel.headerPos]) row[linkSel.headerPos] = {};
      row[linkSel.headerPos].link = link;
    } else if (selectedComp.value) {
      if (linkSel.listField && typeof linkSel.listIdx === 'number' && typeof linkSel.fieldIdx === 'number') {
        const items = selectedComp.value.props[linkSel.listField.key] || [];
        if (!items[linkSel.listIdx]) items[linkSel.listIdx] = {};
        items[linkSel.listIdx][linkSel.listField.itemFields[linkSel.fieldIdx].key] = link;
      } else if (linkSel.fieldKey) {
        selectedComp.value.props[linkSel.fieldKey] = link;
      }
    }
  }
  linkSel.show = false;
}

// ---- 热区编辑器（eweishop 图片(热区) 高级模式）----
const hsSel = reactive({ show: false, listIdx: null, imgUrl: '', hotspots: [], active: null, dragging: null });
function openHotspotEditor(listField, listIdx) {
  const items = selectedComp.value.props[listField.key] || [];
  const it = items[listIdx] || {};
  hsSel.listIdx = listIdx;
  hsSel.imgUrl = it.url || '';
  hsSel.hotspots = it.hotspots || (it.hotspots = []);
  hsSel.active = null;
  hsSel.dragging = null;
  hsSel.show = true;
}
function onHsStageDown() {
  // 点击空白取消选中（添加热区走「添加热区」按钮）
  hsSel.active = null;
}
function addHs() {
  // eweishop：点「添加热区」新增 200×200 默认热区框（相对图片区域换算百分比，居中）
  // 2026-09-11：hs-stage 为滚动容器(max-height 480px)，坐标必须相对 hs-inner（图片实际区域）
  const stage = document.querySelector('.hs-inner');
  const rect = stage ? stage.getBoundingClientRect() : { width: 750, height: 400 };
  const w = Math.min(100, (200 / rect.width) * 100);
  const h = Math.min(100, (200 / rect.height) * 100);
  const hs = { x: Math.max(0, (100 - w) / 2), y: Math.max(0, (100 - h) / 2), w, h, link: '' };
  hsSel.hotspots.push(hs);
  hsSel.active = hsSel.hotspots.length - 1;
}
function onHsBoxDown(e, hi) {
  hsSel.active = hi;
  const stage = e.currentTarget.parentElement;
  const rect = stage.getBoundingClientRect();
  const h = hsSel.hotspots[hi];
  hsSel.dragging = { hi, startX: e.clientX, startY: e.clientY, baseX: h.x, baseY: h.y, w: rect.width, hgt: rect.height };
}
function onHsMove(e) {
  if (!hsSel.dragging) return;
  const d = hsSel.dragging;
  const h = hsSel.hotspots[d.hi];
  const dx = ((e.clientX - d.startX) / d.w) * 100;
  const dy = ((e.clientY - d.startY) / d.hgt) * 100;
  h.x = Math.max(0, Math.min(100 - h.w, d.baseX + dx));
  h.y = Math.max(0, Math.min(100 - h.h, d.baseY + dy));
}
function onHsUp() {
  hsSel.dragging = null;
}
function removeHs(hi) {
  hsSel.hotspots.splice(hi, 1);
  if (hsSel.active === hi) hsSel.active = null;
}
function onHsBoxDbl(hi) {
  // 双击热区框 → 打开链接选择器（1:1 eweishop）
  hsSel.active = hi;
  linkSel.current = hsSel.hotspots[hi].link || '';
  linkSel.hsMode = true;
  linkSel.show = true;
}

// 列表项操作：新增（按 itemFields 生成默认项）/ 拖拽排序（替代原上下箭头）
function addListItem(comp, key, itemFields) {
  const items = comp.props[key] || [];
  const blank = {};
  (itemFields || []).forEach((f) => {
    if (f.default !== undefined) blank[f.key] = f.default;
    else if ((f.control === 'select' || f.control === 'radio') && f.options?.length) blank[f.key] = f.options[0].value;
    else blank[f.key] = '';
  });
  items.push(blank);
}
// 列表项删除（最少保留 1 条）
function removeListItem(comp, key, idx) {
  const items = comp.props[key] || [];
  if (items.length <= 1) {
    ElMessage.warning('最少保留 1 个');
    return;
  }
  items.splice(idx, 1);
}
// 列表项字段条件显示（when 依赖 item 自身值；期望 true 时 undefined 视为 true，兼容旧数据）
function listFieldVisible(sf, it) {
  if (!sf.when) return true;
  return Object.entries(sf.when).every(([k, v]) => {
    if (v === true) return it[k] === true || it[k] === undefined || String(it[k]) === 'true';
    return String(it[k]) === String(v);
  });
}
// 列表项可见字段（按 item 值过滤，避免 v-for+v-if 同元素）
function listVal(it, sf) {
  const v = it[sf.key];
  if (v === undefined || v === null || v === '') {
    if (sf.default !== undefined) return sf.default;
    if (sf.control === 'radio' && sf.options?.length) return sf.options[0].value;
  }
  return v;
}
function visibleItemFields(f, it) {
  return (f.itemFields || []).filter((sf) => listFieldVisible(sf, it));
}
let listDrag = null; // { key, from }
function onListItemDragStart(e, key, idx) {
  listDrag = { key, from: idx };
  e.dataTransfer.effectAllowed = 'move';
}
function onListItemDragOver(key, idx) {
  if (!listDrag || listDrag.key !== key || listDrag.from === idx) return;
  const items = selectedComp.value.props[key] || [];
  if (idx < 0 || idx >= items.length) return;
  const [moved] = items.splice(listDrag.from, 1);
  items.splice(idx, 0, moved);
  listDrag.from = idx;
}
function onListItemDrop() { listDrag = null; }

watch(() => props.pageType, () => { selected.value = null; load(); });
onMounted(() => { load(); loadPageList(); });
defineExpose({ saveDraft, publish, saveAndPreview, loadVersions, saveAsTemplate, load, pageName, components });
</script>

<style scoped>
.pe-field-tips { font-size: 12px; color: #86909C; line-height: 1.5; margin-top: 4px; }
.page-editor { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; }
.pe-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.pe-title { display: flex; align-items: center; gap: 10px; }
.pe-page-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.pe-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.pe-body { display: grid; grid-template-columns: 280px minmax(375px, 1fr) 380px; gap: 12px; flex: 1; min-height: 0; overflow-x: auto; }

/* 组件库：模块/页面列表 Tab + 分组 + 搜索 + 彩色图标（sticky：随页面滚动保持可见，内部滚动） */
.pe-lib { background: #fff; border-radius: 8px; padding: 12px; height: 100%; min-height: 0; overflow-y: auto; }
.pe-lib-head { margin-bottom: 8px; }
.pe-lib-tabs { display: flex; gap: 4px; background: #f2f3f5; border-radius: 8px; padding: 3px; }
.pe-lib-tab { flex: 1; text-align: center; height: 30px; line-height: 30px; border-radius: 6px; font-size: 13px; color: #4e5969; cursor: pointer; transition: all .2s; }
.pe-lib-tab.active { background: #fff; color: #165dff; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.pe-lib-search { margin-top: 8px; }
.pe-search-ico { color: #86909c; font-size: 14px; }
/* 页面列表（承载页面切换/新建/复制/删除） */
.pe-pages { display: flex; flex-direction: column; gap: 4px; }
.pe-page-new { width: 100%; border-style: dashed; margin-bottom: 4px; }
.pe-pages { display: flex; flex-direction: column; gap: 8px; }
.pe-pages-title { font-size: 13px; font-weight: 600; color: #1d2129; }
.pe-pages-search { width: 100%; }
.pe-page-new { width: 100%; }
.pe-pages-table { border: 1px solid #f0f1f3; border-radius: 8px; overflow: hidden; }
.pe-pages-tr { display: flex; align-items: center; padding: 6px 8px; font-size: 12px; transition: background .15s; cursor: grab; }
.pe-pages-tr.pp-th { background: #f7f8fa; color: #86909c; font-weight: 500; border-bottom: 1px solid #f0f1f3; }
.pe-pages-tr + .pe-pages-tr { border-top: 1px solid #f7f8fa; }
.pe-pages-tr:hover { background: #f2f3f5; }
.pe-pages-tr.current { background: #e8f3ff; }
.pe-pages-tr.dragging { opacity: .6; }
.pp-drag { flex: 0 0 18px; color: #c9cdd4; cursor: grab; user-select: none; margin-right: 2px; }
.pp-col-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-col-home { flex: 0 0 32px; text-align: center; color: #86909c; cursor: pointer; user-select: none; }
.pp-col-home:hover { color: #165dff; font-weight: 500; }
.pp-col-home.yes { color: #165dff; font-weight: 600; cursor: default; }
.pp-col-ops { flex: 0 0 106px; display: flex; align-items: center; }
.pp-col-ops .el-button { padding: 0 3px; margin-left: 0; }
.pp-name { cursor: pointer; color: #1d2129; font-weight: 500; }
.pp-name:hover { color: #165dff; }
.pe-page-info { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; }
.pe-page-info { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; overflow: hidden; }
.pe-page-name2 { flex-shrink: 0; max-width: 55%; font-size: 13px; color: #1d2129; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pe-page-info .el-tag { flex-shrink: 1; min-width: 0; overflow: hidden; }
.pe-page-home-tag { flex-shrink: 0; }
.pe-page-ops { display: flex; gap: 0; flex-shrink: 0; opacity: 0; transition: opacity .15s; }
.pe-page-row:hover .pe-page-ops, .pe-page-row.current .pe-page-ops { opacity: 1; }
.pe-page-ops .el-button { padding: 0 4px; }
.pe-group { margin-bottom: 14px; }
.pe-group-head { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 4px; border-radius: 6px; cursor: pointer; font-size: 13px; color: #1d2129; }
.pe-group-head::before { content: ''; width: 3px; height: 14px; border-radius: 2px; background: #165dff; flex-shrink: 0; }
.pe-group-head:hover { background: #f2f3f5; }
.pe-group-caret { font-size: 10px; transition: transform .2s; color: #86909c; }
.pe-group-caret.open { transform: rotate(90deg); }
.pe-group-name { font-weight: 600; }
.pe-group-n { margin-left: 2px; font-size: 11px; color: #86909c; background: #f2f3f5; border-radius: 10px; padding: 0 8px; line-height: 18px; }
.pe-group-body { padding: 2px 0; }
.pe-lib-item {
  display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 10px;
  border-radius: 8px; margin-bottom: 2px; cursor: grab;
  font-size: 13px; color: #1d2129; transition: background .2s;
}
.pe-lib-item:hover { background: #f2f3f5; }
.pe-lib-item:active { cursor: grabbing; }
.pe-lib-icon { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0; }
.pe-lib-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 组件库 3 列网格卡片（仿 eweishop：图标上、名称下） */
.pe-lib-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 2px 0; }
.pe-lib-card {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 4px 6px; border-radius: 8px; cursor: grab;
  border: 1px solid transparent; transition: border-color .15s, background .15s, box-shadow .15s;
}
.pe-lib-card:hover { border-color: #165dff; background: #f7fbff; box-shadow: 0 1px 4px rgba(22,93,255,.12); }
.pe-lib-card:active { cursor: grabbing; }
.pe-lib-ico { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; }
.pe-lib-ico img { width: 32px; height: 32px; object-fit: contain; display: block; }
.pe-lib-card .pe-lib-name {
  font-size: 12px; color: #1d2129; max-width: 100%; line-height: 1.35; text-align: center;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  word-break: break-all; white-space: normal;
}
.pe-lib-tag { position: absolute; top: 2px; right: 2px; font-size: 10px; line-height: 1; color: #f53f3f; background: rgba(245,63,63,.08); border-radius: 4px; padding: 2px 4px; }
.pe-lib-tag-new { color: #165dff; background: rgba(22,93,255,.08); }
.pe-lib-tip { font-size: 11px; color: #86909c; margin-top: 8px; text-align: center; }

/* 画布：手机预览壳 */
.pe-canvas-wrap { background: #f2f3f5; border-radius: 8px; padding: 20px 16px; height: 100%; min-height: 0; overflow-y: auto; display: flex; align-items: flex-start; }
.pe-phone {
  background: #fff; border-radius: 16px; width: 100%; max-width: 375px; margin: 0 auto; min-height: 667px;
  box-shadow: 0 4px 16px rgba(0,0,0,.08), 0 0 0 1px #e5e6eb;
  overflow: hidden;
  flex-shrink: 0;
}
/* 顶部状态栏：模拟真实小程序（时间/信号/WiFi/电池固定，参考图7） */
.pe-status-bar {
  height: 26px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; background: #fff; cursor: pointer;
}
.ps-time { font-size: 12px; font-weight: 600; color: #1d2129; }
.ps-icons { display: flex; align-items: center; gap: 5px; }
.ps-ico { display: block; }
/* 导航栏：按头部设置（类型/背景/内容/第一行/第二行内容）渲染，点击弹出头部设置 */
.pe-phone-nav {
  position: relative;
  display: flex; flex-direction: column;
  padding: 0 12px; font-size: 14px; font-weight: 600; color: #1d2129;
  background: #fff; border-bottom: 1px solid #f0f1f3; cursor: pointer;
}
.pn-line { height: 40px; display: flex; align-items: center; justify-content: space-between; width: 100%; }
.pn-side { min-width: 56px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
.pn-left { justify-content: flex-start; }
.pn-right { justify-content: flex-end; }
/* 仅第一行右侧为胶囊让位（第二行无胶囊） */
.pn-line:not(.pn-line2) .pn-right { margin-right: 34px; }
.pn-title { flex: 1; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
/* 方案二（ew）头部预览 */
.pe-ew-img45 { width: 30px; height: 30px; object-fit: contain; display: block; }
.pe-ew-img96 { height: 24px; max-width: 110px; object-fit: contain; display: block; }
.pe-ew-store, .pe-ew-city { font-size: 11px; white-space: nowrap; display: inline-flex; align-items: center; gap: 3px; max-width: 100%; overflow: hidden; }
.pe-ew-search { display: inline-flex; align-items: center; gap: 4px; border-radius: 12px; padding: 3px 8px; height: 22px; box-sizing: border-box; max-width: 100%; }
.pe-ew-search-txt { font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1; flex: 1; }
.pe-ew-search-btn { font-size: 9px; line-height: 1; padding: 3px 6px; border-radius: 9px; flex-shrink: 0; }
/* 模拟微信小程序胶囊按钮（右上角：三点菜单 + 关闭圆环，仅视觉） */
.pe-mp-capsule {
  position: absolute; top: 20px; right: 8px; transform: translateY(-50%);
  display: flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 9px;
  background: rgba(255, 255, 255, .92);
  border: .5px solid rgba(0, 0, 0, .06);
  border-radius: 13px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .06);
  z-index: 6; pointer-events: none;
}
.pmc-dots { display: flex; gap: 3px; }
.pmc-dots i { width: 3.5px; height: 3.5px; border-radius: 50%; background: #1d2129; }
.pmc-div { width: .5px; height: 12px; background: rgba(0, 0, 0, .1); }
.pmc-circle { width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid #1d2129; box-sizing: border-box; }
.pe-canvas { min-height: 420px; padding: 0; background: transparent; }
.pe-comp { position: relative; border: 1px dashed transparent; border-radius: 8px; margin-bottom: 0; padding: 0; transition: border-color .15s; }
.pe-comp:hover { border-color: #c9cdd4; }
.pe-comp.active { border-color: #165dff; box-shadow: 0 0 0 1px rgba(22,93,255,.25); background: rgba(22,93,255,.02); }
/* hover / 选中即显工具条（仿 eweishop/nshop） */
.pe-comp-tools {
  display: none; position: absolute; top: -22px; right: 4px; background: #165dff; color: #fff;
  border-radius: 6px; font-size: 11px; padding: 2px 8px; z-index: 2; align-items: center; gap: 6px;
  box-shadow: 0 2px 6px rgba(22,93,255,.3); white-space: nowrap;
}
.pe-comp:hover .pe-comp-tools, .pe-comp.active .pe-comp-tools { display: flex; }
.pe-comp-idx { background: rgba(255,255,255,.25); border-radius: 4px; padding: 0 5px; }
.pe-comp-type { color: #fff; }
.pe-tool { cursor: pointer; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; transition: background .15s; font-size: 12px; line-height: 1; }
.pe-tool:hover { background: rgba(255,255,255,.25); }
.pe-tool-del:hover { background: #f53f3f; }

/* 空态 */
.pe-empty { color: #86909c; text-align: center; padding: 80px 0; font-size: 13px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.pe-empty :deep(svg), .pe-empty :deep(img) { opacity: .4; }

/* 属性面板（sticky：随页面滚动保持可见，内部滚动） */
.pe-prop { background: #fff; border-radius: 8px; padding: 12px; height: 100%; min-height: 0; overflow-y: auto; }
.pe-prop-title { font-size: 13px; font-weight: 600; color: #1d2129; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.pe-prop-title::before { content: ''; width: 3px; height: 14px; border-radius: 2px; background: #165dff; }
.pe-sec { margin-bottom: 14px; }
.pe-sec-name { font-size: 12px; font-weight: 600; color: #4e5969; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.pe-sec-name::after { content: ''; flex: 1; height: 1px; background: #f0f1f3; }
.pe-sec .el-form-item :deep(.required label) { color: #f53f3f; }
.pe-sec :deep(.el-form-item.required .el-form-item__label::before) { content: '*'; color: #f53f3f; margin-right: 4px; }
.pe-prop-body :deep(.el-form-item) { margin-bottom: 12px; }
.pe-prop-body :deep(.el-form-item__label) { white-space: nowrap; }
.pe-prop-body :deep(.pe-hint) { width: 100%; padding: 5px 10px; line-height: 1.5; }
.pe-prop-body :deep(.pe-hint .el-alert__title) { font-size: 12px; }
.pe-form-hint :deep(.el-form-item__content) { margin-left: 0 !important; }
.pe-cube-cell-tip { font-size: 12px; color: #86909c; line-height: 1.6; display: block; }
/* 图形化单选（选择风格：一列/两列并排，仿 eweishop） */
.pe-graphic { display: flex; gap: 8px; width: 100%; }
.pe-graphic-item { position: relative; flex: 1; border: 1px solid #e5e6eb; border-radius: 8px; padding: 8px 6px 4px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all .2s; background: #fff; }
.pe-graphic-item:hover { border-color: #c9cdd4; }
.pe-graphic-item.active { border-color: #165dff; background: #f7fbff; box-shadow: 0 0 0 1px #165dff; }
.pe-graphic-svg { width: 100%; height: 44px; display: block; }
.pe-graphic-name { font-size: 12px; color: #4e5969; }
.pe-graphic-item.active .pe-graphic-name { color: #165dff; font-weight: 500; }
.pe-graphic-check { position: absolute; top: 4px; right: 6px; width: 16px; height: 16px; border-radius: 50%; background: #165dff; color: #fff; font-size: 10px; line-height: 16px; text-align: center; display: none; }
.pe-graphic-item.active .pe-graphic-check { display: block; }
/* 风格选择器（eweishop 1:1：修改风格 → 弹窗） */
/* 图片风格选择（eweishop 1:1） */
.pe-style-grid-img { display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.pe-style-card-img { flex-direction: column; }
.pe-style-card-img .pe-style-thumb-img { width: 100%; height: auto; border-radius: 6px; border: 1px solid #E5E6EB; }
.pe-style-card-img.active .pe-style-thumb-img { border-color: #165DFF; }
.pe-style-picker { display: flex; align-items: center; gap: 8px; width: 100%; }
.pe-style-picker .pe-style-thumb-img { width: 84px; height: auto; border-radius: 6px; border: 1px solid #E5E6EB; cursor: pointer; }
.pe-style-cur { font-size: 12px; color: #4e5969; }
.pe-style-grid { display: flex; gap: 14px; }
.pe-style-card { position: relative; flex: 1; border: 1px solid #e5e6eb; border-radius: 8px; padding: 8px; cursor: pointer; background: #fff; transition: all .2s; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.pe-style-card:hover { border-color: #c9cdd4; }
.pe-style-card.active { border-color: #165dff; background: #f7fbff; box-shadow: 0 0 0 1px #165dff; }
.pe-style-thumb { width: 100%; aspect-ratio: 280/220; border-radius: 6px; background: linear-gradient(160deg, #fff7ec, #ffe4c4); display: flex; align-items: center; justify-content: center; }
.pe-style-thumb-s2 { background: linear-gradient(160deg, #eef4ff, #d6e6ff); }
.th-cd { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 6px; }
.th-cd-title { font-size: 11px; color: #ff7d00; }
.pe-style-thumb-s2 .th-cd-title { color: #2f6bff; }
.th-cd-row { display: flex; align-items: center; gap: 3px; font-size: 12px; }
.th-s1 b { background: #165dff; color: #fff; font-weight: 700; border-radius: 4px; padding: 2px 5px; font-size: 12px; min-width: 20px; text-align: center; }
.th-s1 i { font-style: normal; color: #1d2129; font-size: 11px; }
.th-s2 { color: #165dff; font-weight: 600; }
.th-cd-btn { background: #fc5917; color: #fff; font-size: 10px; padding: 2px 10px; border-radius: 10px; }
.pe-style-name { font-size: 12px; color: #4e5969; }
.pe-style-card.active .pe-style-name { color: #165dff; font-weight: 500; }
.pe-style-check { position: absolute; top: 5px; right: 7px; width: 16px; height: 16px; border-radius: 50%; background: #165dff; color: #fff; font-size: 10px; line-height: 16px; text-align: center; display: none; }
.pe-style-card.active .pe-style-check { display: block; }
/* list 类型字段（轮播图/宫格导航 items）：标签置顶一行，内容占整行宽 */
.pe-prop-body :deep(.el-form-item.prop-list) { flex-direction: column; align-items: stretch; }
.pe-prop-body :deep(.el-form-item.prop-list .el-form-item__label) { width: auto !important; justify-content: flex-start; height: auto; line-height: 1.4; margin-bottom: 4px; padding-bottom: 0; }
.pe-prop-body :deep(.el-form-item.prop-list .el-form-item__content) { margin-left: 0 !important; width: 100%; }
.pe-prop-empty { color: #86909c; font-size: 12px; padding: 40px 0; text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.pe-prop-empty :deep(svg), .pe-prop-empty :deep(img) { opacity: .4; }
.pe-img-field { display: flex; gap: 6px; flex-wrap: wrap; }
.pe-img-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pe-img-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid #E5E6EB; background: #F7F8FA; flex-shrink: 0; }

/* 列表编辑器（轮播图/宫格导航 items）：拖拽排序 + 删除 */
.pe-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.pe-list-item { border: 1px solid #e5e6eb; border-radius: 8px; padding: 8px; display: flex; gap: 6px; align-items: flex-start; background: #fafbfc; cursor: grab; }
.pe-list-item:active { cursor: grabbing; }
.pe-list-item.drag-over { border-color: #165dff; box-shadow: 0 0 0 1px rgba(22,93,255,.25); }
.pe-list-drag { color: #c9cdd4; font-size: 16px; line-height: 1.2; cursor: grab; user-select: none; flex-shrink: 0; }
.pe-list-fields { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.pe-list-field { display: flex; flex-direction: column; gap: 2px; }
.pe-list-label { font-size: 11px; color: #86909c; }
.pe-list-ops { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }
.pe-list-link { display: inline-block; font-size: 12px; color: #722ED1; text-decoration: none; margin-bottom: 8px; }
.pe-list-link:hover { text-decoration: underline; }
.pe-list-add { width: 100%; border-style: dashed; }
/* 热区编辑器 */
.pe-hs-field { display: flex; gap: 8px; }
.hs-tip { font-size: 12px; color: #86909C; margin-bottom: 10px; line-height: 1.6; }
/* 热区编辑器 1:1（eweishop）：4步步骤条 + 黄色热区框 */
.hs-steps { display: flex; align-items: center; gap: 26px; padding: 4px 2px 14px; border-bottom: 1px solid #F0F1F3; margin-bottom: 14px; }
.hs-step { display: flex; align-items: center; gap: 7px; color: #C9CDD4; font-size: 13px; }
.hs-step-n { width: 22px; height: 22px; border-radius: 50%; background: #F2F3F5; color: #86909C; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
.hs-step.on { color: #165DFF; }
.hs-step.on .hs-step-n { background: #165DFF; color: #fff; }
.hs-stage { border: 1px solid #E5E6EB; border-radius: 8px; overflow-y: auto; background: #F7F8FA; user-select: none; max-height: 480px; }
.hs-inner { position: relative; }
.hs-img { display: block; width: 100%; }
.hs-noimg { height: 160px; display: flex; align-items: center; justify-content: center; color: #86909C; font-size: 13px; }
.hs-box { position: absolute; border: 1.5px solid #FFB800; background: rgba(255, 184, 0, 0.22); cursor: move; box-sizing: border-box; border-radius: 2px; }
.hs-box.selected { border-color: #165DFF; background: rgba(255, 184, 0, 0.16); box-shadow: 0 0 0 1px rgba(22, 93, 255, 0.5); }
.hs-box-text { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; font-size: 12px; color: #B25E00; pointer-events: none; }
.hs-box-del { position: absolute; right: -8px; top: -8px; width: 18px; height: 18px; line-height: 16px; text-align: center; background: #F53F3F; color: #fff; border-radius: 50%; font-size: 13px; cursor: pointer; font-style: normal; user-select: none; }
.hs-footer { margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px; }
/* 数字调节框窄化（72px 容纳三位数字，余宽留给滑杆）：组件属性面板 .pe-prop 与页面设置面板 .hp-body 全覆盖 */
.pe-prop :deep(.el-slider__input), .hp-body :deep(.el-slider__input) { width: 72px; }
.pe-prop :deep(.el-slider__input .el-input__wrapper), .hp-body :deep(.el-slider__input .el-input__wrapper) { padding: 0 4px; }
.pe-prop :deep(.el-slider__input .el-input-number__decrease), .pe-prop :deep(.el-slider__input .el-input-number__increase),
.hp-body :deep(.el-slider__input .el-input-number__decrease), .hp-body :deep(.el-slider__input .el-input-number__increase) { width: 18px; }

/* 头部设置面板（主题/全局/头部/底部导航 + 第一行内容） */
.hp-tabs { display: flex; gap: 4px; background: #f2f3f5; border-radius: 8px; padding: 3px; margin-bottom: 14px; }
.hp-tab { flex: 1; text-align: center; height: 30px; line-height: 30px; border-radius: 6px; font-size: 13px; color: #4e5969; cursor: pointer; }
.hp-tab.active { background: #fff; color: #165dff; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.hp-body { display: flex; flex-direction: column; gap: 12px; }
.hp-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hp-label { width: 92px; font-size: 13px; color: #4e5969; flex-shrink: 0; white-space: nowrap; }
.hp-hint { font-size: 12px; color: #86909c; }
.hp-sec { font-size: 12px; font-weight: 600; color: #4e5969; border-left: 3px solid #165dff; padding-left: 8px; margin-top: 4px; }
.hp-pos { padding: 8px; background: #fafbfc; border-radius: 8px; }

/* 素材选择 */
.pe-sel { max-height: 360px; overflow-y: auto; }
.sel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 10px; }
.sel-item { position: relative; border: 1px solid #e5e6eb; border-radius: 6px; overflow: hidden; cursor: pointer; aspect-ratio: 1; }
.sel-item img { width: 100%; height: 100%; object-fit: cover; }
.sel-item video { width: 100%; height: 100%; object-fit: cover; }
.sel-video-tag { position: absolute; top: 4px; right: 4px; font-size: 10px; padding: 0 6px; border-radius: 8px; color: #fff; background: rgba(22,93,255,.85); }
.sel-item.picked { border-color: #165dff; box-shadow: 0 0 0 2px rgba(22,93,255,.15); }
.sel-check { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; background: #165dff; color: #fff; border-radius: 50%; font-size: 12px; display: flex; align-items: center; justify-content: center; }
</style>
