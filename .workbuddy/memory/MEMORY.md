# 项目长期记忆（360全景 / panorama-360）

> 只放「违反代价高且高频」的规则。
> 展开：日报 `YYYY-MM-DD.md`（过程细节）· `refs/env-toolbox.md`（构建/脚本/CDP/对标抓数）· `refs/miniprogram-and-backend.md`（小程序端坑 + 后端数据）· `refs/verify-playbook.md`（验证姿势）

## 🔴 六条最易反复踩
1. **装修组件改一处必须同步三处**：`componentRegistry.js`（数据源）→ `ComponentRender.vue`（v-if 链，**链尾无 v-else 兜底**，只加 registry 会静默渲染空白）→ `PageEditor.vue`（schema + control 硬编码分发）。C 端 `DesignPage.vue` 是**独立重复实现**。⚠️ 同一 v-if 链上多个 `v-else` 是**互斥同级链**。⚠️ 画布 `.r-*` 尺寸是**手抄** C 端 `.dp-*` 的，已漏过一次。
2. **H5 正常 ≠ 小程序正常**。① 自定义组件**样式作用域隔离**，父组件 wxss 穿不透子组件根节点（`:deep()` 也穿不过）→ 传 prop 让组件自己出内联 style；② `margin:auto` 居中、`background-image:url()` 包内路径在小程序端都不 work。凡「H5 写了没效果」→ 先问**跨没跨组件边界**，别调数值。
3. **属性面板通用项按 `key` 去重**（`PageEditor.vue` 的 `ownKeys`）：组件自带某 key 时通用项被跳过 → **同一控件在不同组件上指向不同层**，用户完全无法预期。加面板字段前先确认 key 不撞车。
4. **变量注入了 ≠ 生效**：`--c-*` 必须有元素消费，`getComputedStyle` 要量**消费元素**。`if (mx)` 仅 >0 才发内联会**架空 0 值** → **参数若允许 0 就无条件内联，默认值放 schema，三端 CSS 基础值归 0**。三端 CSS 不得写 `16px` 兜底或写死 `margin-bottom` 补缝。
5. **「页面空白 / 改了没反应」先抓运行时异常**，不是查数据链路。`watch`/`computed` 引用 `const x = ref(...)` 必须写在声明**之后**，否则 TDZ `ReferenceError` → setup 失败整个设计器白屏（曾绕大圈查columns/bg/saveDraft/后端 status 全正常，真因是这一行）。
6. **`defaultProps` 只对「新建/复制」生效**：手写 DB 插组件是**无效验证**（绕过 `PageEditor.load()` 的 `{...commonStyleProps, ...defaultProps, ...c.props}` 合并），存量组件走空态分支是预期行为。正确验证 = 设计器里真点 `.pe-lib-card`。预填时**必须排除三类字段**：链接类（`button.url`、`web-container.url`）、图标名类（`grid-nav.icon`/`native-grid.icon`/`float-btn.icon`，是 SIcon 名不是图片）、已有包内内置图的（`countdown`/`countdown2`）。

## 超级表单核心语义（用户 2026-10-03 澄清）
**一个表单、多处调用**；「红包封面（待接入）」等**只是占位文案**。五入口：装修组件 `superform` / 文章 `form.superForm` / 商城 `cfg.useFormId` / 商品编辑 `superForm='custom'`+`superFormId` / 链接选择器 `/pages/superForm/fill?formId=x`。C 端一律跳独立填写页（分包）复用其组件/校验/支付。`design_json`、`goods_setting.config` 是不透明 JSON（整体存无白名单）→ 新增挂载点通常零后端改动。装修页嵌入的表单**不显示表单名头**，但模板名为占位「未命名表单」时后台列表仍显示 → 改模板名。

## 背景色必须拆成两个独立字段（`2e44353`，勿回退）
- `bgColor` = 组件**自身**底色（label「按钮色」）；`compBgColor` = 组件**容器**底色（label「组件背景色」）。单一事实来源 `containerStyle.js` 的 `CONTAINER_BG_KEY`，三处共用（曾有组件私藏副本导致 admin ≠ 真机）。
- 存量迁移 `migrateLegacyBgColor()`（幂等）挂两处：加载草稿 + `newComp()`。判据表 `SELF_COLORED_TYPES` —— **加类型前必须确认该类型根节点真的不读 `props.bgColor`**。
- 🔴 内联背景会盖掉选中高亮：`.pe-comp.active` 用 `outline + box-shadow`，**不要写 `.active { background: !important }`**。
- 🔴 **满宽组件会完全遮住容器底色**（button `width:100%` + 容器 `padding:0` → 容器宽=按钮宽=756px）。修法 `MIN_BG_PADDING=8`，**仅在设了底色时**兜（改 schema 默认值会让存量页面整体变松散）；**必须把 `0` 也当「未设」**（schema 默认就是 0，只兜 undefined 则永不生效，因为面板滑块用 `props[key] ?? 0`）。`PageEditor.compBoxStyle` 的 `withPadding:false` 必须去掉。
- ❌ **已废弃的错路（勿复活）**：`HIDDEN_BG_TYPES` 黑名单「让容器不上色」——手工维护 28 项、漏判 goods-*、让多数单测依赖它，本质是把第 3 条撞车问题藏起来。

## 包内资源 vs 后端资源（判据：问「这个文件在后端有吗」）
有 → `resolveUrl()`/`background-image`；只在 `src/static` 里 → `assetUrl()`/真正的 `<image>` 层。
- 小程序端图裂三层原因（缺一层照样裂）：① `strip-mp-static.js` 的 `STRIP_DIRS` 曾含 `static/images`——**但 registry 的 countdown defaultProps 就引用它们**（进 STRIP_DIRS 前必须 grep 确认真零引用）；② `resolveUrl()` 给包内相对路径拼 `API_DOMAIN` → 404；③ `background-image: url()` 不支持包内路径。
- **`STRIP_DIRS` 两条相反规矩**：被包内路径引用 → 剔除即真机图裂（`static/images`，**不可剔除**）；**刻意走网络** → 仅少冗余（`static/sample`，确认后端 `server/public/` 已托管后**可剔除**）。两份清单（代码侧 `NETWORK_ASSET_DIRS` / 脚本侧 `NETWORK_PREFIXES`）注释互指。⚠️ 走网络图代价：**真机需在小程序后台配 request 合法域名**。
- **示例图硬规范（2026-10-05 用户定）**：一律走网络图、不进小程序包。唯一事实来源 `web-app/src/utils/sampleImages.js` 的 `sampleUrl()`（banner 710×388 / square 400×400 / portrait 600×800），**禁止手写路径字符串**（曾写 `/static/sample/x.jpg` 漏 `/card` 前缀 → 后端 404 且构建期零提示）。
- **构建脚本自检必须「不论成败都跑」且判两类**：①「代码引用了但产物里没有」②「网络图路径写错」（抽文件名去 `src/static/` 反查真实相对路径比对；只判「在不在包里」对网络图永远通过 —— 这正是漏检 10 天的原因）。

## 平台能力误判：先找项目内反例
我曾断言「小程序 `<view>` 不支持 CSS 渐变」据此包装 30 处背景 —— 若提交等于凭空造 regression。证伪只需：项目内另一处同特性正常（宫格 9 图标渐变从未降级）/ `normalizeStyle({background:'linear-gradient(...)'})` 逗号原样保留 / 产物 WXSS 本来就有。**元规则：从「A 端现象」推不出「平台能力缺失」。改「降级/兼容」代码前先问：它在解决真问题，还是在解决我以为存在的问题？**

## 超级表单「组件即卡片」（勿回退）
页面灰底 #f2f3f5，每组件自带白底卡片，**卡间灰缝靠顶外边距 `outMarginTop`（默认 10）让底色透出**。`componentStyleVars` 已内联 `backgroundColor`(默认 #FFF)+`borderRadius`+`marginTop`，故三端容器保持 transparent 即自然成卡：① C 端 `SuperFormRender.vue` ② 画布 `ComponentRender.vue`（`.r-sf-real` / `.r-sf-real-comp`）③ 设计器 `SuperFormDesigner.vue`（`.sf-comp-wrap`），三者**均不设 margin**。
- **改卡片形态只动容器背景；间距只改 `sfComponentStyle.js` 一处。禁止三端 CSS 写死 `margin-bottom` 补缝**（曾犯→ `outMarginTop=0` 无法真正紧贴、参数被架空）。对标实测灰缝**一律 10px，含表单头→首卡**（故 `.sf-form-head` 的 `margin-bottom:8px` 已删）。
- `componentStyleVars(comp, globalStyle, layout)` 第 3 参必传（`horizontal` 时 marginTop 归零，交容器 gap）。radio/checkbox 的 `content.options` 必须是 `[{label,value}]` 对象（填字符串数组会渲染出「圆点有、字没有」）。参数审计终态 **238 OK / 0 DEAD**。
- 组件圆角**必须始终发射含 0**（曾`if (st.radius)` 让 0 整段跳过、回落基础圆角）。**页面/画布容器不得写横向 padding**，左右留白唯一来源是 `outMarginX`。
- textarea 必须 `:maxlength="maxLength > 0 ? maxLength : -1"` + `:show-confirm-bar="false"` + **计数自绘**（否则 uni H5 走内置 140、面板「最多输入」不生效；小程序端固定 140 → 三端不一致）。预览端不可把 `text`/`textarea` 合并渲染。
- **设计器选中框必须挂在「持白底/内容的那一层」**：装修 `.pe-comp`、表单 `.sf-comp-wrap`（两层结构时挂内层会内缩 8px）。表单 `@click` 也挂 wrap，内层只留 draggable，否则内距空白区点不到。
- ⚠️ 上述三处 CSS 旁的注释会过期（曾写「默认白卡连成整张」又写与实际行为矛盾的「上外边距设 0 即紧贴」），改结构必须同步改注释。

## 「组件风格」+ 边距映射
- `sfComponentStyle.js` 的 **`styleVariant(comp)`** 三端统一调，**三端只认语义 class**（`sfv-box/plain/line/step/slider` + 选择类 `sfx-opt*`）。⚠️ **styleType 取值按组件各自命名、跨组件撞名**（radio 的 `s1` 作用选项区、filedownload 的 `s1` 作用下载框）→ 映射**按 type 分派**；非选择类的 s1/s2 不能当选项区处理（两档同 `sfv-box` = 死参数）。
- ⚠️ **「组件即卡片」下不能用「白底+无边框」做风格档**（卡片本身就是白底 → 边框消失+底色无差=「看起来完全没变化」）。`sfv-plain` 保留 1px 极淡描边。**排查「说无效但代码没错」先截图肉眼比对。**
- 🎯 **改 `STYLE_SCHEMA.boxLine`/`styleVariant()`/任一端 `sfv-*` CSS 后必跑 `node scripts/audit-sf-style-coverage.mjs`**，非 0 = 有死参数。现状 15 类/36 值/42 映射全通过。脚本内镜像实现要同步；加新风格时三端选择器组**必须加入新组件容器 class**（已漏过 pay/realtime/sf-opts/sf-image-h/sf-id-box）。
- **面板控件 ≠ 功能已复刻**，三层缺一不可：数据层 `components.js` 默认 content 声明字段（否则老数据 undefined，**必须写存量迁移**）→ 渲染层两端消费 + 兜底 → 样式 schema 映射。
- **判定开关有没有用，去校验/提交路径确认它是否真 gate 了什么**（车牌开关只改格数不参与校验 = 装饰性假功能）。**别替填表人预先声明其属性。**
- 边距四件套（权威依据 `对标笔记.md` 第 89 行 ew 内部键名实测）：`outMarginTop`→`outMarginTop`(margin-top,10) / `outLeftRightMargin`→`outMarginX`(margin-lr,10) / `innerTopBottomPadding`→`marginY`(padding-tb,10) / `inputLeftRightMargin`→`marginX`(padding-lr,16) / `componentFillet`→`radiusTL/TR/BR/BL`(**四角独立**，非单值)。教训：外左右改 margin 后**三端容器 padding 必须归 0**（否则 10+16 叠加）。
- 改 schema 默认值必须**定向迁移存量**：只改等于旧默认值的，自定义值不动；改前 `cp` 备份 DB。

## UI 规范
- 图标规范 `docs/规范/07-UI设计.md`：三层蜜桃橙、填充非描边、大圆角扁平、透明底；禁绿紫蓝分类色。面板图标须 56×56 8-bit RGBA PNG，未映射进 `COMP_ICONS` 会 fallback 线性 `SIcon`（违反规范）。
- **按钮规范** `docs/规范/08-装修中心按钮规范.md`：装修中心取微信官方 WeUI **方角**、**不动商城**。四档 L 96rpx(48px)/M 80rpx(40px)/S 64rpx(32px)/XS 56rpx(28px)，字号 34/28/28/28rpx，圆角按档递减 L/M 16rpx·S 12rpx·XS 8rpx（**能命中现有令牌** `$radius-sm/md`，胶囊 40rpx 在令牌体系外须新造）。新写装修按钮一律 rpx、用 `<view>` 不用 `<button>`、锁 height+line-height。尺寸单一事实来源 `web-app/src/utils/btnTokens.js`。⚠️ **全局类名禁用 `.btn`**（`pages/card/visitors.vue` 用了但未定义，scoped 拦不住全局类）→ 用 `.dbtn-`；**加全局工具类前必须 grep `class="该名"` 全量检查**。
- **共享样式实现放 `web-app/src/utils/`，admin 跨包 import**。⚠️ 被import 模块旁**不得再定义同名函数**（`Identifier has already been declared`，uni 会显示成极具误导的「连接服务器超时」；定位 `node scripts/check-sfc.cjs <file>`）。
- 名片宫格 v5 定稿（权威原文：仓库根 `名片宫格图标方案.html`）：46px 方块（r=14）+ 32px 描边图标（占框 69.6%）、`stroke-width:2`、`gap:10px`；会员中心＝**对勾圆**不是皇冠；「更多」底色 `#78909c→#546e7a`；方案 A/B/C 只差底色、9 图标路径相同，用户选 **A**。⚠️ `PeColorPicker` 渐变预设 11 色与宫格方案 A 的 9 色**是同一套** → 运营易误选（曾两次把按钮底色设成宫格橙色渐变），排查「颜色串了」先确认是否误选预设。

## 对标站 eweishop 抓数（详见 `refs/env-toolbox.md`）
- **禁止凭组件名字猜布局、靠眼睛估风格数**（`docs/复刻规范/反模式.md` 明确列为反模式）。必须点开对标站量真实 DOM + 计算样式。
- 已知：Vue **2**；hash SPA **必须先「选店铺」**才能进装修页；组件库 `data-id` 是内部键名（按钮组 = `menu`）；属性面板 radio 的 `value` 通常是真实字段值，但「组件样式/组件风格」是占位 `on`，须从渲染结果反推。