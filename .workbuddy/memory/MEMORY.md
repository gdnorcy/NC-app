# 项目长期记忆（360全景 / panorama-360）

> 详细验证姿势见 `refs/verify-playbook.md`；日报见 `.workbuddy/memory/YYYY-MM-DD.md`。

## A. 超级表单核心语义（用户 2026-10-03 澄清）
**一个表单、多处调用**，各处通过「选择已建好的表单」调用；「红包封面（待接入）」等**只是占位文案**。
- 五入口：装修组件 `superform` / 文章 `form.superForm` / 商城 `cfg.useFormId` / 商品编辑 `superForm='custom'`+`superFormId` / 链接选择器 `/pages/superForm/fill?formId=x`。C 端一律跳独立填写页（分包）复用其组件/校验/支付。
- `design_json`、`goods_setting.config` 是不透明 JSON（整体存无白名单）→ 新增挂载点通常零后端改动。
- 装修页嵌入的超级表单**不显示表单名头**（两端已删 DOM）；模板名为占位「未命名表单」时后台列表仍显示 → 改模板名。

## B. 改代码前的硬约束
1. **装修组件改一处必须同步三处**：`componentRegistry.js`（数据源）→ `ComponentRender.vue`（v-if 链，**链尾无 v-else 兜底**，只加 registry 会静默渲染空白）→ `PageEditor.vue`（schema + control 硬编码分发）。C 端 `DesignPage.vue` 是**独立重复实现**，要单独改。⚠️ 同一 v-if 链上的多个 v-else 是**互斥同级链**。⚠️ 画布 `.r-*` 尺寸是**手抄** C 端 `.dp-*` 的，已漏过一次。
2. **画布预览必须与 C 端同数据源**：C 端样式来自表单 submit 配置（`componentStyleVars`），画布用自己 props 必然不同步 → PageEditor 拉 `getSuperForm` 建 `sfMetaMap`（运行时缓存不进草稿 JSON）→ ComponentRender 接 `sfMeta`。**给组件加「C 端不消费的配置项」= 制造「改了没反应」的 bug。**
3. **共享样式实现放 `web-app/src/utils/`，admin 跨包 import**（先例 `sfComponentStyle.js`/`containerStyle.js`）。曾有组件私藏副本导致 admin 预览与真机不一致。⚠️ 被 import 模块旁**不得再定义同名函数**（`Identifier has already been declared`，uni 显示成极具误导的「连接服务器超时」；定位 `node scripts/check-sfc.cjs <file>`）。
4. 下拉只列 `status==='published'` 的表单；链接选择器例外（用户定口径）：草稿/停用**照列但灰显不可选**，副信息「草稿 · C 端不可访问」。链接选择器**禁止把客户数据硬编码成示例链接**；动态列表每次打开重拉（`force=true`）；目标已删必须**回退自定义链接 + 原样保留 value** + warning，绝不静默清空。
5. **租户过滤只能靠 `projects.id`**（`projects` 表**没有 `customer_id` 列**）→ 写 `c.customer_id` 直接 `no such column`。公开 `GET /api/plans` 无客户维度，租户内走 `GET /api/design/plans`。
6. `el-option` 的 `value` 用字符串。写 SQL 后核对「列数 == 占位符数 == 绑定数」（技能 `sqlite-migration-verify`）。
7. **全局类名禁用 `.btn`**（`pages/card/visitors.vue` 用了但未定义，scoped 拦不住全局类）→ 用 `.dbtn-` 前缀。
8. 图标规范见 `docs/规范/07-UI设计.md`：三层蜜桃橙、填充非描边、大圆角扁平、透明底；禁绿紫蓝分类色。面板图标须 56×56 8-bit RGBA PNG，未映射进 `COMP_ICONS` 会 fallback 线性 `SIcon`。
9. 工具坑：macOS BSD grep **不支持 `\|`**（静默返回空）→ 用 `grep -E`/Grep 工具，中文路径下 Grep 可能静默空 → node fs 逐行 `includes` 复核；`sed -i` 在本仓库中文路径不可靠 → 用 Write/Edit；压缩产物函数名 mangle，验证靠字符串特征。

## C. 🔴 属性面板「按 key 去重」是隐形陷阱
`PageEditor.vue` 用 `ownKeys` 过滤 `commonStyleSchema`：**组件自带某 key 的项，通用项就被跳过**。故 button 的「背景色」指向按钮自身，superform 的同一控件指向容器 —— **同一控件在不同组件上指向不同层，用户完全无法预期**。新增面板字段前必须确认 key 不会撞车。

## D. 🔴 背景色必须拆成两个独立字段（commit `2e44353`，勿回退）
- `bgColor` = 组件**自身**底色（button 的 label =「按钮色」）；`compBgColor` = 组件**容器**底色（`commonStyleSchema` label =「组件背景色」）。单一事实来源 `containerStyle.js` 的 `CONTAINER_BG_KEY`，跨端三处共用。
- 存量迁移 `migrateLegacyBgColor()`（幂等），挂载点两处：加载草稿 + `newComp()`。判据表 `SELF_COLORED_TYPES`——加类型前**必须确认该类型根节点真的不读 props.bgColor**。
- 🔴 **内联背景会盖掉选中态高亮**：`.pe-comp.active` 用 `outline + box-shadow`（都不吃背景色）。**不要用 `.active { background: !important }`**。
- ❌ **已废弃的错路（勿复活）**：`HIDDEN_BG_TYPES` 黑名单「让容器不上色」——手工维护 28 项、漏判 goods-*、让多数单测依赖它，本质是把上面的 key 撞车问题藏起来。

## E. 🔴 包内资源 vs 后端资源（2026-10-05 立规）
**判据口诀：问「这个文件在后端有吗」——有就用 `resolveUrl`/background-image，只在 `src/static` 里就用 `assetUrl`/`<image>`。**

小程序端图裂的三层原因（缺一层都照样裂）：
1. **构建脚本剔除**：`strip-mp-static.js` 的 `STRIP_DIRS` 曾含 `static/images`，注释写「无源码引用」——**但 registry 的 countdown defaultProps 就引用它们**。任何目录进 `STRIP_DIRS` 前必须 grep 确认**真的零引用**（defaultProps 里的引用也算）。
2. **路径解析器用错**：`resolveUrl()` 会给相对路径拼 `API_DOMAIN` → 404（哪怕文件在包里）。`assetUrl()`：`/static/`、`/card/static/` 开头 → 小程序端原样返回，H5 端拼 origin；网络图走 `resolveUrl()`。
3. **`background-image: url()` 不支持包内路径**（只认网络图/base64）→ 包内图必须用真正的 `<image>` 层（`position:absolute;z-index:0` + 文字 `z-index:1`）。⚠️ 网络图（`/uploads/`）用 background-image 是**对的**，别一起改。

**`STRIP_DIRS` 有两条相反的规矩（极易混）**：被**包内路径**引用 → 剔除即真机图裂（`static/images`，**不可剔除**）；**刻意走网络** → 仅少冗余备份（`static/sample`，确认已在后端 `server/public/` 托管后**可剔除**）。两份清单（代码侧 `NETWORK_ASSET_DIRS` / 脚本侧 `NETWORK_PREFIXES`）注释互指，改一处须同步另一处。⚠️ 走网络图的固有代价：**真机需在小程序后台配 request 合法域名**（开发可勾「不校验合法域名」）。

**构建脚本自检必须「不论成败都跑」**：判定条件是「代码引用了但产物里没有」，不是「删除有没有报错」（原先只在失败时触发，静默 10 天）。通用做法：写完构建脚本加「产物完整性自检」，扫产物代码里的静态资源引用逐个 `fs.existsSync` 断言。

## F. 🔴 小程序自定义组件：父组件 CSS 穿不透子组件根节点
底部菜单图标不居中，用户**连报两轮**我都没修好——一直在父组件写 `.mtb :deep(.s-icon){...}`，全是无效功。产物实证：WXSS 是 `.mtb.data-v-x .s-icon`（后代选择器），WXML 是 `<s-icon class="data-v-x">`（直接子元素 + 独立样式作用域）。双重失效：① `:deep()` 要求 `.s-icon` 是后代，而它是直接子元素 ② 小程序自定义组件**样式作用域隔离**，父组件 wxss 跨不过组件边界（H5 能过 → 又一次「H5 正常 ≠ 小程序正常」）。

**两条正确写法**：① **改布局/居中 → 传 prop 让组件自己出内联 style**（内联是唯一能穿透组件边界的手段，如 `SIcon` 的 `block` prop）② **加 class 效果 → 模板显式加 class + 父组件直接选该 class，不写 `:deep()`**（子组件未设 `inheritAttrs:false` 时 Vue 把父传 class 合并到根节点，跨端通用）。

**排查口诀**：小程序端「H5 上写了这行却没效果」→ 先问这行选择器**有没有跨组件边界**，别急着调数值。⚠️ 另：**小程序原生组件不吃 `margin:auto`**（`SIcon` 根节点 `flex:0 0 auto`，H5 算出偏移 0、小程序不居中）→ 居中交回父容器 `align-items:center`，图标自身只写 `display:block;flex:none;align-self:center;margin:0`。

## G. 🔴 平台能力误判：先找项目内反例
我曾断言「小程序 `<view>` 不支持 CSS 渐变」据此批量包装 30 处背景 —— 若提交等于凭空制造 regression。证伪三条：同一项目另一处同特性正常（宫格 9 图标渐变从未包降级）/ `normalizeStyle({background:'linear-gradient(...)'})` 逗号原样保留 / 产物 WXSS 本来就有 8 条该规则。**元规则：从「A 端现象」推不出「平台能力缺失」。** 改「降级/兼容」类代码前先问：**它是在解决真问题，还是在解决我以为存在的问题？**

## H. 🔴 TDZ 铁律
`watch(() => selectedComp.value?.props, ...)` 写在文件前部、`const selectedComp = ref(null)` 声明在 300+ 行之后 → watch 立即执行 getter 触发 TDZ `ReferenceError` → **setup 失败整个设计器白屏**（用户表现为「改了参数预览完全没变化」，本次绕大圈查数据链路全正常）。
- 规则：setup 内 `watch`/`computed`/`onMounted` 引用 `const x = ref(...)` 必须写在声明**之后**（`function` 声明会提升，不受影响）。
- ⚠️ **「页面空白/改了没反应」第一件事是抓运行时异常**，不是查数据存取链路。

## I. 组件样式「死参数」铁律
1. **变量注入了 ≠ 生效**：`--c-*` 必须有元素消费；用 `getComputedStyle` 量**消费元素**，不是看 wrap 的 inline 串。踩坑两次：选择类结构上没有输入框 → `--c-input-pad-x/radius` 无人消费，「组件风格」整段失效（修法：补选项区 box 包裹层消费边框+圆角）；`if (mx)` 仅 >0 才发内联 → **设 0 回落 CSS 基础值，参数被架空**。
   - **教训：参数若允许 0 就无条件内联；默认值放 schema（`COMMON_WHOLE`）承担，三端 CSS 基础值归 0。**
2. **改 schema 默认值必须定向迁移存量**：只改等于旧默认值的，自定义值不动；改前 `cp` 备份 DB。已完成 `outMarginTop 0→10`、`marginX 0→16`、`submit inputRadius 22→24`。
3. **三端横向内距/间距只能由 `componentStyleVars` 内联**，三端 CSS 不得写 `16px` 之类兜底值，也不得写死 `margin-bottom` 补缝（会架空 `outMarginTop`）。

## J. 超级表单「组件即卡片」（2026-10-04 落地，勿回退）
页面灰底 #f2f3f5，每组件自带白底卡片，**卡间灰缝靠顶外边距 `outMarginTop`（默认 10）让页面底色透出**。
- 三端各一处：C 端 `SuperFormRender.vue`（`.sf-form` transparent、`.sf-field` 不设 margin）/ 画布 `ComponentRender.vue`（`.r-sf-real` transparent、`.r-sf-real-comp` 不设 margin）/ 设计器 `SuperFormDesigner.vue`（`.sf-comp-wrap` 不设 margin）。
- `componentStyleVars` 已内联 `backgroundColor`(默认 #FFF)+`borderRadius`+`marginTop`，故容器透明即自然成卡。**改卡片形态只动容器背景；间距只改 `sfComponentStyle.js` 一处。**
- ⚠️ **禁止在三端 CSS 写死 `margin-bottom` 补缝**（曾犯 → `outMarginTop=0` 无法真正紧贴、参数被架空）。对标图实测灰缝**一律 10px 含表单头→首卡**（故 `.sf-form-head` 的 `margin-bottom:8px` 已删）。
- ⚠️ `componentStyleVars(comp, globalStyle, layout)` 第 3 参必传：`horizontal` 时 marginTop 归零（间距交给容器 gap）。
- ⚠️ radio/checkbox 的 `content.options` 必须是 `[{label,value}]` 对象；填字符串数组会渲染出「圆点有、字没有」（曾误判为渲染 bug）。
- 参数有效性审计终态 **238 OK / 0 DEAD**。CSS 变量单一事实来源 `componentStyleVars()`，改渲染必须两端同查。
- textarea 必须 `:maxlength="maxLength > 0 ? maxLength : -1"` + `:show-confirm-bar="false"` + **计数自绘**（否则 uni H5 走内置默认 140、面板「最多输入」不生效；小程序端无 confirm-bar 且固定 140 → 三端必然不一致）。⚠️ 预览端不可把 `text`/`textarea` 合并渲染。
- ⚠️ hash 路由跳同页**不重挂载**，连测多个 formId 须改 query（`/?x=N#/...`）强制刷新；macOS `date +%s%N` 的 `%N` 是字面量 `N`。
- ⚠️ admin 验证前 `open "...?cb=$RANDOM#/apps/super-form"` 硬刷新，否则复用旧 JS bundle（曾误判为回归）。
- 设计器选中框必须挂「卡片本体」层：装修 `.pe-comp`、表单 `.sf-comp-wrap`（两层结构挂内层会内缩 8px；`@click` 也必须挂 wrap，**内层不要留 @click** 会冒泡重复选中）。验证工具条**按 `title` 选按钮**（`.sf-tool` 顺序 上移/下移/复制/删除，下标 `[3]` 是删除）。
- 画布手机预览可视区约 570px，卡片高 = 104px + 每字段 42px → 字段摘要默认「前 4 个」。

## K. 组件「边距」四件套语义映射（ew 键名 ↔ 我方键，勿混淆）
权威依据：`对标笔记.md` 第 89 行 ew 评分组件**内部键名实测**。

| ew 键名 | 含义 | 我方键 | 发射 CSS | 默认 |
|---|---|---|---|---|
| `outMarginTop` | 外·上 | `outMarginTop` | `margin-top` | 10 |
| `outLeftRightMargin` | **外·左右** | `outMarginX` | `margin-left/right` | 10 |
| `innerTopBottomPadding` | 内·上下 | `marginY` | `padding-top/bottom` | 10 |
| `inputLeftRightMargin` | 内·左右 | `marginX` | `padding-left/right` | 16 |
| `componentFillet` | 圆角（**四角独立**） | `radiusTL/TR/BR/BL`(+`radius`) | `border-*-radius` 四项 | 0 |

三条教训：① 一个键不能同时当内距用（曾致外左右缺失、留白写死在三端 CSS）② `if (mx)` 架空 0 ③ 外左右改 margin 后**三端容器 padding 必须归 0**（否则 10+16 叠加）。⚠️ **页面/画布容器不得写横向 padding**（`.sf-page`/`.sf-phone-body`）——左右留白唯一来源是 `outMarginX`；C 端 embed 例外。⚠️ 圆角**必须始终发射含 0**（曾 `if (st.radius)` 让 0 整段跳过、回落基础圆角）。
⚠️ 设计器面板改参数会自动落库，验证**优先「改 DB + 刷新页面」**。

## L. 「组件风格」styleType 必须经语义映射 + 覆盖率审计
- `sfComponentStyle.js` 导出 **`styleVariant(comp)`**，三端（C 端 `fieldCls`/预览 `styleCls`/画布内嵌）统一调它，**三端只认语义 class**：`sfv-box/plain/line/step/slider`；选择类额外挂 `sfx-optbox/optplain/optline`（作用在**选项区**）。
- ⚠️ **styleType 取值按组件各自命名、跨组件撞名**（radio 的 `s1` 作用选项区、filedownload 的 `s1` 作用下载框）→ 映射必须**按 type 分派**。⚠️ 非选择类的 s1/s2 不能当选项区处理（两档都落 `sfv-box` = 视觉相同 = 死参数）。⚠️ `defaultStyle` 的 styleType 必须取 `boxLine[0].value`。
- ⚠️ **「组件即卡片」下不能用「白底+无边框」做风格档**：卡片本身就是白底，落上去边框消失+底色无差 =「看起来完全没变化」。`sfv-plain` 必须保留 1px 极淡描边。**排查这类「说无效但代码没错」先截图肉眼比对。**
- ⚠️ 风格卡标签须与「组件整体」区分（`inputMarginX` 曾与 `marginX` 同叫「左右边距」）→ 已统一为「输入框左右边距」。
- 🎯 **`node scripts/audit-sf-style-coverage.mjs`**：有风格卡的组件，每个可选值是否三端真有 CSS 消费。改 `STYLE_SCHEMA.boxLine`/`styleVariant()`/任一端 `sfv-*` CSS 后**必须跑**，非 0 = 有死参数。现状 **15 类组件/36 值/42 映射全通过**。脚本内 `STRUCTURAL` 豁免；改 `styleVariant()` 时脚本内镜像实现要同步改；加新组件风格时三端 `sfv-*` 选择器组**必须加入新组件容器 class**（已漏过 pay/realtime/sf-opts/sf-image-h/sf-id-box）。**别凭「像不像选择类」判断**：select 渲染下拉输入框、无选项区，不能挂 `sfx-opt*`。

## M. 面板控件 ≠ 功能已复刻
ew 选择类有「选项类型：文字/图片/图文」，我方照抄三选一但渲染器 0 命中 = 纯死参数。
- **教训：抄面板控件 ≠ 复刻功能。** 加面板项必须 grep 渲染器确认**有元素消费该字段** + 有对应 CSS/DOM。
- 三层缺一不可：① 数据层（`components.js` 默认 content 声明字段，否则老数据 undefined，比不做更糟，**必须写存量迁移脚本**）② 渲染层（两端都消费 + 兜底，值域外回落默认档）③ 样式参数（schema styleRows + 映射 + 条件显示标记 `hOnly`/`optImgOnly`）。
- ⚠️ 验证时**别用 `order` 挪元素位置**（圆点/勾选框本就是 DOM 首个子元素，`order:-1` 会把它推出选项行）。
- ⚠️ **判定开关有没有用，必须去校验/提交路径确认它是否真的 gate 了什么**（车牌开关只改格数不参与校验 = 装饰性假功能）。
- ⚠️ **别替填表人预先声明其属性**：车牌/车型是「填表人那台车」的属性而非「表单」的属性 → 固定 8 格、末格恒为绿框**可选**位，校验正则 7/8 位自适应。**通用判据：加「类型/类别」开关前先问——这是表单的配置，还是填表人的属性？**

## N. 小程序端高频坑
1. **真机访问不到 `localhost`**（指「手机自己」）→ `cardApi.js` 已平台感知（`#ifdef MP-WEIXIN` → 局域网 IP），**新增 API 模块务必沿用**。正式发布需备案 HTTPS 域名 + 后台配 request 合法域名。
2. **构建必须用 `npm run build:mp-weixin`**（`npx uni` 会拉到错误版本并卡死）。
3. **`code2Session` 是假实现**（`server/src/app.js` 里 `TODO`，直接 `return { openid:'mock_'+code }`）。接真实登录需 AppID + **AppSecret**（用户未提供）。
4. **主包体积**：口径 = 排除 4 个分包前缀（`pages/card/` `pagesReads/` `pages/superForm/` `pages/viewer/`）算总量，再排除构建中间产物 `static/{sicons,three,icons,images,sample}`。现状 **1467.8KB（1.433MB）**，2MB 余量 580.2KB。vendor.js(Vue3) 716KB 不可压缩；`utils/sicons-base64.js` 272KB（60 图标×21 色=482 条），裁到 7 色可省 175KB 但牺牲 15 种精确色，**未做**。base64 内联注意 36.7KB JPEG→48.9KB（膨胀 33%）反而更大。⚠️ 主包页面**无法引用分包资源**（`pages/cardMain/home` 与 `DesignPage.vue` 都在主包），但可以「不进包」（走网络）。
5. **沉浸式导航**已统一 `components/PageNav.vue` + `utils/navMetrics.js`（曾有 7 套自绘导航）。`navigationStyle:'custom'` 时**原生 navigationBar 完全不渲染**（含 titleText）→ 新增页面要么去掉 custom，要么挂 `<PageNav>`。胶囊是原生控件不可覆盖，必须 `paddingTop=statusBarHeight` + `paddingRight=capsuleRightPad`，`navBarHeight=(胶囊top-statusBarHeight)*2+胶囊height`。
   - 🔴 `lazyCodeLoading` 必须放 **`manifest.json` 的 `mp-weixin` 节点**（与 appid 同级）；放 `pages.json` 下无效、误放 `setting` 里也无效（`mergeMiniProgramAppJson` 只合并 manifest 平台节点且有 projectKeys 白名单）。
   - 🔴 **条件编译双分支会「重复声明」**（vitest/node 直跑源码时两分支都在 → `SyntaxError: Identifier 'X' has already been declared`）。改法：**改运行时探测**（`typeof window==='undefined' && typeof wx!=='undefined'`），**不要改 `let`**。
   - ⚠️ 小程序不支持动态 `<style>` 注入 → 需按机型算的值（状态栏高度）必须走**内联 `:style`**，前缀 `--pnv-*`。
   - ⚠️ 迁移脚本清废弃 CSS 时**正则必须兼容单行块**（声明与 `}` 同行），只匹配 `^\}` 会整块漏掉（曾漏 11 页）。全部页面 `<script setup>` → import 即注册，**检测 script 风格不要只 grep 前 20 行**。
6. **SVG 图标**：根 `<svg>` 必须**同时声明 `color` 和 `stroke`**（6 图标内部用 `fill="currentColor"` 画实心点，根未声明 color → 回退黑色，白描边图标出现黑点）。**`stroke-width` 对 fill 画的点完全无效。** 口诀：「点/孔洞糊成一坨」→ 先查源码是 `fill=` 还是纯 path。`SIcon.vue buildSvgDataUri()` 与 `scripts/gen-mp-sicons.js` 模板**两处同步**；改后**连跑两次 `build:mp-weixin` 才进产物**。产物 `sicons-base64.js` 是**裸 base64**（`data:` 运行时拼），校验正则要求 `"...(data:...)"` 会全 MISS 误判「没更新」。
7. **`/uploads` MIME 兜底**：`express.static` 靠扩展名推断 MIME，前端丢后缀 → 无扩展名文件 → `octet-stream` → 小程序 `<image>` 不显示（开发者工具可能侥幸显示）。双保险：① 上传时 `ensureExtension(name, mime, buffer)`（MIME 映射 + **内容嗅探兜底**：PNG `89 50 4E 47`/JPEG `FF D8 FF`/GIF `47 49 46`/WEBP `RIFF….WEBP`）② 静态中间件给存量兜底。🔴 **中间件必须注册在 `express.static` 之前**。⚠️ **`curl -I`(HEAD) 对 express.static 无响应**，验 MIME 用 `curl -D -o /dev/null`(GET)。
8. **装修配置真机不更新**三处：`design.js` 的 `TTL=5*60*1000` 缓存命中即 return（**重启/reLaunch 无法绕过**，唯一解是下拉强刷新 `loadHomeData(force)` 或等 5 分钟）；页面级配置在产物里位于 `pages/xxx/xxx.json` 而非 `app.json`；`onPullDownRefresh` 现仅 `pages/cardMain/home` 开启。

## O. 跨端 CSS 缺失：对扫设计器侧 vs C 端同类选择器
图片组件未配图的占位块，设计器有 `.r-image-empty { height:88px }` 而 **C 端 `.dp-image-empty` 一条规则都没有** → 高度塌成 0，「后台看得到、C 端什么都看不到」。
- 手法：拿设计器侧选择器名（`r-*`）到 C 端搜同名（`dp-*`），**搜不到定义就是缺失**。
- 占位高度优先 `aspect-ratio`（如 `710/388`）与真图 `widthFix` 高度对齐，避免换图跳动；多列布局要覆盖 `height:100%` 否则高低不齐。⚠️ **admin 画布与 C 端必须同时改**（画布曾写死 `height:88px`，用户看到「和真机不一样」却查不出原因）。
- 静态示例图必须压缩：PNG 93KB → JPEG(q45) 36.7KB，`sips -s format jpeg -s formatOptions 45 in.png --out out.jpg`。⚠️ 用 `sips -g pixelWidth` 读尺寸，不要手搓二进制偏移。

## P. 调试姿势（详见 `refs/verify-playbook.md`）
- **「页面空白」先抓异常再查数据**。CDP 无头浏览器（Node 22 内置 `WebSocket`，**无需装 ws**）：`/json/new` 必须 **PUT**；赋值 input 用 `Object.getPrototypeOf(el)` 取原生 setter；**先注入 `window.__errs` 收集 error/unhandledrejection/console.error 再操作**；admin 路由跳转必须用 `document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(...)`，**改 `location.hash` 不重挂载**。
- ⚠️ **测 uni H5 的 `<image>`**：uni 渲染成 `<uni-image>` 包裹，**没有** `complete`/`naturalWidth`/`src` → 必须取内部 `e.querySelector('img')`，否则全 undefined 易误判「图没加载」。
- ⚠️ **沙箱里 `nohup ... &` 起 Chrome 会被回收** → 必须用后台任务方式。沙箱内 `curl localhost` 可能 502（代理）→ `HTTP_PROXY= HTTPS_PROXY= curl http://127.0.0.1:3000`。
- ⚠️ **跑单测用 `npm run test:unit`（vitest），别用 `node --test`**（不解析路径别名，11 文件全挂，易误判「代码坏了」）。
- ⚠️ `build:mobile` 首次常因 `[safe-delete]` 阈值失败（每轮 50 文件预算、**是每轮总量**），**重跑一次即过**；日志别用 tail 截断。shell `/bin/rm -rf` 可绕过 node 侧 shim。
- C 端装修页实测：INSERT `tenant_page_design`（page_type='custom-btnspec-test'、status=1）→ 开 `/card/#/pages/cardMain/home?pageType=...&tid=1` → eval 量 → **测完删页并核对总数**。画布侧：tenant1/admin123 → `/customer/#/design/edit` → 左侧「页面列表」tab。
- **DB（`server/data/panorama.db`）在 .gitignore 里**，改装修配置只本地生效，改前 `cp` 备份；`tenant_page_design.is_home=1` 是名片首页。
- 三端构建落点：H5 `server/public/card`+`mall`、admin `server/public/admin`、小程序 `dist/build/mp-weixin`。**真机须在微信开发者工具重新导入/上传，否则是旧包。**

## Q. 按钮样式规范（`docs/规范/08-装修中心按钮规范.md`）
全局按钮令牌**本不存在**（`token.scss` 只到色板/字号/间距/圆角），已新建 `web-app/src/utils/btnTokens.js`（C 端与画布共用尺寸单一事实来源）。
- **已定（用户 2026-10-04 认可）：装修中心取微信官方 WeUI 方角、不动商城**。四档 L 96rpx(48px)/M 80rpx(40px)/S 64rpx(32px)/XS 56rpx(28px)，**方角 8px 非胶囊**，字号 34/28/28/28rpx，圆角按档递减 L/M 16rpx · S 12rpx · XS 8rpx。特例：悬浮胶囊 96rpx、悬浮圆&视频播放 104rpx、倒计时 96rpx。
- 关键论据：官方圆角**命中现有令牌**（XS 4px=`$radius-sm`、L/M 8px=`$radius-md`），胶囊 40rpx 在令牌体系外须新造。商城保持 80rpx 胶囊（独立 fixed bar，不同屏）。`.dp-btn` 的 `radius` 配置保留允许 8~32rpx 自定义。商城 80rpx(40px) **低于**官方热区 44px，装修 L 档 48px 达标 —— 可用性差异非审美差异。
- 官方依据（已实测，勿再猜）：WeUI `--weui-BTN-HEIGHT:48/-MEDIUM:40/-SMALL:32`；`.weui-btn` padding 12px 24px/17px、weight 500、radius 8px；mini 6px 12px/14px/radius 6px；xmini 4px 12px/14px/radius 4px。热区 7mm–9mm（≈44px/88rpx）；**设计稿基准 375px = 750rpx**。小程序 `button` 文档**无像素值**。
- 新写装修按钮一律 rpx、用 `<view>` 不用 `<button>`、锁 height+line-height、可点元素间距 ≥16rpx、独立热区 ≥88rpx。
- 已落地：`.dp-form-btn`/`.r-form-btn`→L 档；`.dp-follow-btn`/`.r-follow-btn`→XS 档（修了画布手抄漏的 bug）；`.sf-submit`/`.r-sf-btn`→48px/17px、height 锁定 + flex 居中（**圆角保持 `--c-input-radius`(22px) 不动**，属表单范畴）；通用全宽 M 80rpx、拨打电话 M 80rpx、通用·auto S 64rpx（画布新增 `.r-btn.auto`）、商品组 S 64rpx（C 端）、预约直播 S 64rpx、搜索 XS 56rpx、导航搜索 XS 56rpx、视频号标签 XS 描边 56rpx。存档 `docs/对标截图/装修按钮/`，三端编译产物实测逐项一致。

## R. 图标/宫格规格
- **名片宫格 v5 定稿**（权威原文：仓库根 `名片宫格图标方案.html`）：46px 圆角方块（r=14）+ 内含 32px 描边图标（占框 69.6%），`stroke-width:2`，`gap:10px`；会员中心＝**对勾圆**不是皇冠（曾误改成皇冠已回归）；「更多」底色 `#78909c→#546e7a` 灰蓝；方案 A/B/C 只差底色、9 图标路径相同，用户选 **A（品牌多彩渐变）**；`iconSize` 只控方块，图标按 `GRID_ICON_RATIO=32/46` 内缩（两者必须解耦）。
- ⚠️ `PeColorPicker` 的**渐变预设 11 色与名片宫格方案 A 的 9 色是同一套** —— 运营易误选（曾出现按钮底色 = 宫格「会员中心」橙色渐变，**短期内复发两次**）。排查「颜色串了」先确认是否误选预设。
- 验证方案类 HTML 直接用无头 Chrome 截图，不要正则抽 svg 路径（原文是残缺 HTML）。