# 项目长期记忆（360全景 / panorama-360）

> **本文件只放「违反代价高、且高频」的规则。** 展开细节与一次性排查过程在日报 `.workbuddy/memory/YYYY-MM-DD.md`；验证姿势见 `refs/verify-playbook.md`。

## 🔴 五条最容易反复踩的（每条都至少浪费过一轮）
1. **装修组件改一处必须同步三处**：`componentRegistry.js`（数据源）→ `ComponentRender.vue`（v-if 链，**链尾无 v-else 兜底**，只加registry 会静默渲染空白）→ `PageEditor.vue`（schema + control 硬编码分发）。C 端 `DesignPage.vue` 是**独立重复实现**。⚠️ 同一 v-if 链上多个 v-else 是**互斥同级链**。⚠️ 画布 `.r-*` 尺寸是**手抄** C 端 `.dp-*` 的，已漏过一次。
2. **H5 正常 ≠ 小程序正常**。两类高频差异：① 自定义组件**样式作用域隔离**，父组件 wxss 穿不透子组件根节点（`:deep()` 也穿不过）→ 传 prop 让组件自己出内联 style，或模板显式加 class + 父组件直接选该 class；② `margin:auto` 居中、`background-image: url()` 包内路径在小程序端都不work。凡「H5 上写了这行却没效果」→ 先问**跨没跨组件边界**，别调数值。
3. **属性面板通用项按 `key` 去重**（`PageEditor.vue` 的 `ownKeys` 过滤）：组件自带某 key 时通用项被跳过 → **同一个控件在不同组件上指向不同层**，用户完全无法预期。加面板字段前先确认 key 不会撞车。
4. **变量注入了 ≠ 生效**：`--c-*` 必须有元素消费，`getComputedStyle` 要量**消费元素**。且`if (mx)` 仅 >0 才发内联会**架空 0 值** → **参数若允许 0 就无条件内联，默认值放 schema，三端 CSS 基础值归 0**。三端 CSS 不得写 `16px` 兜底值或写死 `margin-bottom` 补缝。
5. **「页面空白 / 改了没反应」第一件事是抓运行时异常**，不是查数据链路。`watch`/`computed` 引用 `const x = ref(...)` 必须写在声明**之后**，否则 TDZ `ReferenceError` → setup 失败整个设计器白屏（曾绕大圈查 columns/bg/saveDraft/后端 status 全正常，真因是这一行）。

## 超级表单核心语义（用户 2026-10-03 澄清）
**一个表单、多处调用**；「红包封面（待接入）」等**只是占位文案**。五入口：装修组件 `superform` / 文章 `form.superForm` / 商城 `cfg.useFormId` / 商品编辑 `superForm='custom'`+`superFormId` / 链接选择器 `/pages/superForm/fill?formId=x`。C 端一律跳独立填写页（分包）复用其组件/校验/支付。`design_json`、`goods_setting.config` 是不透明 JSON（整体存无白名单）→ 新增挂载点通常零后端改动。装修页嵌入的表单**不显示表单名头**（两端已删 DOM），但模板名为占位「未命名表单」时后台列表仍显示 → 改模板名。

## 背景色必须拆成两个独立字段（`2e44353`，勿回退）
- `bgColor` = 组件**自身**底色（button label「按钮色」）；`compBgColor` = 组件**容器**底色（`commonStyleSchema` label「组件背景色」）。单一事实来源 `containerStyle.js` 的 `CONTAINER_BG_KEY`，C 端 / `PageEditor.vue` / `ComponentRender.vue` 三处共用（曾有组件私藏副本导致 admin 与真机不一致）。
- 存量迁移 `migrateLegacyBgColor()`（幂等），挂载点两处：加载草稿 + `newComp()`。判据表 `SELF_COLORED_TYPES` —— **加类型前必须确认该类型根节点真的不读 `props.bgColor`**。
- 🔴 **内联背景会盖掉选中态高亮**：`.pe-comp.active` 用 `outline + box-shadow`（都不吃背景色），**不要写 `.active { background: !important }`**。
- ❌ **已废弃的错路（勿复活）**：`HIDDEN_BG_TYPES` 黑名单「让容器不上色」——手工维护 28 项、漏判 goods-*、让多数单测依赖它，本质是把第3 条的撞车问题藏起来。

## 包内资源 vs 后端资源（判据：问「这个文件在后端有吗」）
有 → `resolveUrl()` / `background-image`；只在 `src/static` 里 → `assetUrl()` / 真正的 `<image>` 层。
- 小程序端图裂三层原因（缺一层照样裂）：① `strip-mp-static.js` 的 `STRIP_DIRS` 曾含 `static/images`，注释写「无源码引用」——**但 registry 的 countdown defaultProps 就引用它们**（进STRIP_DIRS 前必须 grep 确认真零引用）；② `resolveUrl()` 给包内相对路径拼 `API_DOMAIN` → 404；③ `background-image: url()` 不支持包内路径。
- **`STRIP_DIRS` 有两条相反的规矩**：被包内路径引用 → 剔除即真机图裂（`static/images`，**不可剔除**）；**刻意走网络** → 仅少冗余备份（`static/sample`，确认已在后端 `server/public/` 托管后**可剔除**）。两份清单（代码侧 `NETWORK_ASSET_DIRS` / 脚本侧 `NETWORK_PREFIXES`）注释互指，改一处须同步另一处。⚠️ 走网络图的代价：**真机需在小程序后台配 request 合法域名**。
- **构建脚本自检必须「不论成败都跑」**：判定「代码引用了但产物里没有」，不是「删除有没有报错」（原先只在失败时触发，静默 10 天）。

## 平台能力误判：先找项目内反例
我曾断言「小程序 `<view>` 不支持 CSS 渐变」据此包装 30 处背景 —— 若提交等于凭空制造 regression。证伪只需：项目内另一处同特性正常（宫格 9 图标渐变从未包降级）/ `normalizeStyle({background:'linear-gradient(...)'})` 逗号原样保留 / 产物 WXSS 本来就有该规则。**元规则：从「A 端现象」推不出「平台能力缺失」。改「降级/兼容」代码前先问：它在解决真问题，还是在解决我以为存在的问题？**

## 超级表单「组件即卡片」（勿回退）
页面灰底 #f2f3f5，每组件自带白底卡片，**卡间灰缝靠顶外边距 `outMarginTop`（默认 10）让底色透出**。`componentStyleVars` 已内联 `backgroundColor`(默认 #FFF)+`borderRadius`+`marginTop`，故三端容器保持 transparent 即自然成卡：① C 端 `SuperFormRender.vue`（`.sf-form` transparent、`.sf-field` 不设 margin）② 画布 `ComponentRender.vue`（`.r-sf-real` transparent、`.r-sf-real-comp` 不设 margin）③ 设计器 `SuperFormDesigner.vue`（`.sf-comp-wrap` 不设 margin）。
- **改卡片形态只动容器背景；间距只改 `sfComponentStyle.js` 一处。禁止在三端 CSS 写死 `margin-bottom` 补缝**（曾犯→ `outMarginTop=0` 无法真正紧贴、参数被架空）。对标图实测灰缝**一律 10px含表单头→首卡**（故 `.sf-form-head` 的 `margin-bottom:8px` 已删）。
- `componentStyleVars(comp, globalStyle, layout)` 第 3 参必传（`horizontal` 时 marginTop 归零）。radio/checkbox 的 `content.options` 必须是 `[{label,value}]` 对象（填字符串数组会渲染出「圆点有、字没有」）。参数审计终态 **238 OK / 0 DEAD**。
- 组件圆角**必须始终发射含 0**（曾 `if (st.radius)` 让 0 整段跳过、回落基础圆角）。**页面/画布容器不得写横向 padding**，左右留白唯一来源是组件级 `outMarginX`。
- textarea 必须 `:maxlength="maxLength > 0 ? maxLength : -1"` + `:show-confirm-bar="false"` + **计数自绘**（否则 uni H5 走内置 140、面板「最多输入」不生效；小程序端固定 140 → 三端不一致）。预览端不可把 `text`/`textarea` 合并渲染。

## 「组件风格」+ 边距映射
- `sfComponentStyle.js` 的 **`styleVariant(comp)`** 三端统一调，**三端只认语义 class**（`sfv-box/plain/line/step/slider` + 选择类 `sfx-opt*`）。⚠️ **styleType 取值按组件各自命名、跨组件撞名**（radio 的 `s1` 作用选项区、filedownload 的 `s1` 作用下载框）→ 映射必须**按 type 分派**；非选择类的 s1/s2 不能当选项区处理（两档同`sfv-box` = 视觉相同 = 死参数）。
- ⚠️ **「组件即卡片」下不能用「白底+无边框」做风格档**（卡片本身就是白底 → 边框消失+底色无差 =「看起来完全没变化」）。`sfv-plain` 保留 1px 极淡描边。**排查「说无效但代码没错」先截图肉眼比对。**
- 🎯 **`node scripts/audit-sf-style-coverage.mjs`**：改 `STYLE_SCHEMA.boxLine`/`styleVariant()`/任一端 `sfv-*` CSS 后**必须跑**，非 0 = 有死参数。现状 15 类组件/36 值/42 映射全通过。改 `styleVariant()` 时脚本内镜像实现要同步；加新组件风格时三端选择器组**必须加入新组件容器 class**（已漏过 pay/realtime/sf-opts/sf-image-h/sf-id-box）。
- **面板控件 ≠ 功能已复刻**：加面板项必须 grep 渲染器确认**有元素消费该字段**。三层缺一不可：数据层 `components.js` 默认 content 声明字段（否则老数据 undefined，**必须写存量迁移脚本**）→ 渲染层两端都消费 + 兜底 → 样式参数 schema 映射。
- **判定开关有没有用，必须去校验/提交路径确认它是否真的 gate 了什么**（车牌开关只改格数不参与校验 = 装饰性假功能）。**别替填表人预先声明其属性** —— 加「类型/类别」开关前先问：这是表单的配置，还是填表人的属性？
- 边距四件套（权威依据 `对标笔记.md` 第 89 行 ew 内部键名实测）：`outMarginTop`→`outMarginTop`(margin-top,10) / `outLeftRightMargin`→`outMarginX`(margin-lr,10) / `innerTopBottomPadding`→`marginY`(padding-tb,10) / `inputLeftRightMargin`→`marginX`(padding-lr,16) / `componentFillet`→`radiusTL/TR/BR/BL`(**四角独立**)。教训：外左右改 margin 后**三端容器 padding 必须归 0**（否则 10+16 叠加）。

## 小程序端高频坑
- **真机访问不到 `localhost`**（指「手机自己」）→ `cardApi.js` 已平台感知（`#ifdef MP-WEIXIN` → 局域网 IP），**新增 API 模块务必沿用**。正式发布需备案 HTTPS 域名 + 后台配合法域名。
- **构建必须用 `npm run build:mp-weixin`**（`npx uni` 会拉到错误版本并卡死）。**`code2Session` 是假实现**（`server/src/app.js` 里 `TODO`），接真实登录需 AppID + **AppSecret**（用户未提供）。
- **主包体积口径**：排除 4 个分包前缀（`pages/card/` `pagesReads/` `pages/superForm/` `pages/viewer/`）算总量，再排除构建中间产物 `static/{sicons,three,icons,images,sample}`。现状 **1467.8KB，2MB 余量 580.2KB**。vendor.js(Vue3) 716KB 不可压缩；`utils/sicons-base64.js` 272KB（482 条），裁到 7 色可省 175KB 但牺牲 15 种精确色，**未做**。base64 内联注意 36.7KB JPEG→48.9KB（膨胀 33%）反而更大。⚠️ 主包页面**无法引用分包资源**，但可以「不进包」（走网络）。
- **沉浸式导航**已统一 `components/PageNav.vue` + `utils/navMetrics.js`。`navigationStyle:'custom'` 时**原生 navigationBar 完全不渲染**（含 titleText）→ 新增页面要么去掉 custom，要么挂 `<PageNav>`。胶囊是原生控件不可覆盖，必须 `paddingTop=statusBarHeight` + `paddingRight=capsuleRightPad`。🔴 `lazyCodeLoading` 必须放 **`manifest.json` 的 `mp-weixin` 节点**（放 `pages.json` 或 `setting` 里都无效）。🔴 **条件编译双分支会「重复声明」**（vitest/node 直跑源码时两分支都在 → `Identifier 'X' has already been declared`）→ 改**运行时探测**，不要改 `let`。⚠️ 小程序不支持动态 `<style>` 注入 → 按机型算的值必须走**内联 `:style`**。
- **SVG 图标**：根 `<svg>` 必须**同时声明 `color` 和 `stroke`**（6 图标内部用 `fill="currentColor"` 画实心点，根未声明 color → 回退黑色）。**`stroke-width` 对 fill 画的点完全无效。** 口诀：「点/孔洞糊成一坨」→ 先查源码是 `fill=` 还是纯 path。`SIcon.vue buildSvgDataUri()` 与 `scripts/gen-mp-sicons.js` 模板两处同步，改后**连跑两次 `build:mp-weixin` 才进产物**。
- **`/uploads` MIME 兜底**：`express.static` 靠扩展名推断 MIME，无扩展名文件 → `octet-stream` → 小程序 `<image>` 不显示。上传时 `ensureExtension()`（MIME 映射 + 内容嗅探兜底）+ 静态中间件给存量兜底。🔴 **中间件必须注册在 `express.static` 之前**。⚠️ `curl -I`(HEAD) 对 express.static 无响应，验 MIME 用 `curl -D -o /dev/null`(GET)。
- **装修配置真机不更新**：`design.js` 的 `TTL=5*60*1000` 缓存命中即 return，**重启/reLaunch 无法绕过**，唯一解是下拉强刷新 `loadHomeData(force)` 或等 5 分钟。页面级配置在产物里位于 `pages/xxx/xxx.json` 而非 `app.json`。

## 后端 / 数据
- **租户过滤只能靠 `projects.id`**（`projects` 表**没有 `customer_id` 列**）→ 写 `c.customer_id` 直接 `no such column`。公开 `GET /api/plans` 无客户维度，租户内走 `GET /api/design/plans`。
- 下拉只列 `status==='published'` 的表单；链接选择器例外（用户定口径）：草稿/停用**照列但灰显不可选**。**禁止把客户数据硬编码成示例链接**；动态列表每次打开重拉（`force=true`）；目标已删必须**回退自定义链接 + 原样保留 value** + warning。
- 写 SQL 后核对「列数 == 占位符数 == `.run()` 绑定数」（技能 `sqlite-migration-verify`）。**DB（`server/data/panorama.db`）在 .gitignore 里**，改前 `cp` 备份；`tenant_page_design.is_home=1` 是名片首页。

## UI 规范与工具坑
- 图标规范 `docs/规范/07-UI设计.md`：三层蜜桃橙、填充非描边、大圆角扁平、透明底；禁绿紫蓝分类色。面板图标须 56×56 8-bit RGBA PNG，未映射进 `COMP_ICONS` 会 fallback 线性 `SIcon`。
- **按钮规范** `docs/规范/08-装修中心按钮规范.md`：装修中心取微信官方 WeUI **方角**、**不动商城**。四档 L 96rpx(48px)/M 80rpx(40px)/S 64rpx(32px)/XS 56rpx(28px)，字号 34/28/28/28rpx，圆角按档递减 L/M 16rpx · S 12rpx · XS 8rpx。官方依据已实测（WeUI `--weui-BTN-HEIGHT:48/40/32`、热区 7–9mm≈44px、基准 375px=750rpx）。新写装修按钮一律 rpx、用 `<view>` 不用 `<button>`、锁 height+line-height。尺寸单一事实来源 `web-app/src/utils/btnTokens.js`。⚠️ **全局类名禁用 `.btn`**（`pages/card/visitors.vue` 用了但未定义，scoped 拦不住全局类）→ 用 `.dbtn-`。
- **共享样式实现放 `web-app/src/utils/`，admin 跨包 import**。⚠️ 被 import 模块旁**不得再定义同名函数**（`Identifier has already been declared`，uni 会显示成极具误导的「连接服务器超时」；定位 `node scripts/check-sfc.cjs <file>`）。
- **工具坑**：macOS BSD grep **不支持 `\|`**（静默返回空）→ 用 `grep -E`/Grep 工具；中文路径下 Grep 可能静默空 → node fs 逐行 `includes` 复核。`sed -i` 在本仓库中文路径不可靠 → 用 Write/Edit。压缩产物函数名 mangle，验证靠字符串特征。**跑单测用 `npm run test:unit`（vitest），别用 `node --test`**（不解析路径别名，11 文件全挂易误判「代码坏了」）。`build:mobile` 首次常因 `[safe-delete]` 阈值失败（每轮 50 文件预算、**是每轮总量**），**重跑一次即过**；日志别 tail 截断。
- **调试姿势**详见 `refs/verify-playbook.md`。要点：CDP 无头浏览器（Node 22 内置 `WebSocket`，无需装 ws）、`/json/new` 必须 **PUT**、先注入 `window.__errs` 再操作；⚠️ **测 uni H5 的 `<image>` 必须取内部 `e.querySelector('img')`**（外层 `<uni-image>` 没有 `complete`/`naturalWidth`/`src`）；⚠️ 沙箱里 `nohup ... &` 起 Chrome 会被回收，须用后台任务；沙箱内 `curl localhost` 可能 502（代理）→ `HTTP_PROXY= HTTPS_PROXY= curl http://127.0.0.1:3000`。
- 三端构建落点：H5 `server/public/card`+`mall`、admin `server/public/admin`、小程序 `dist/build/mp-weixin`。**真机须在微信开发者工具重新导入/上传，否则是旧包。**
- 名片宫格 v5 定稿（权威原文：仓库根 `名片宫格图标方案.html`）：46px 方块（r=14）+ 32px 描边图标（占框 69.6%）、`stroke-width:2`、`gap:10px`；会员中心＝**对勾圆**不是皇冠；「更多」底色 `#78909c→#546e7a` 灰蓝；方案 A/B/C 只差底色、9 图标路径相同，用户选 **A**。⚠️ `PeColorPicker` 渐变预设 11 色与宫格方案 A 的 9 色**是同一套** → 运营易误选（曾两次把按钮底色设成宫格橙色渐变），排查「颜色串了」先确认是否误选预设。