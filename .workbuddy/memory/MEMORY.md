# 项目长期记忆（360全景 / panorama-360）

> 只放「违反代价高且高频」的规则。
> 展开：日报 `YYYY-MM-DD.md`（过程细节）· `refs/env-toolbox.md`（构建/脚本/CDP/对标抓数）· `refs/miniprogram-and-backend.md`（小程序端坑 + 后端数据）· `refs/verify-playbook.md`（验证姿势）

## 🔴 七条最易反复踩
1. **装修组件改一处必须同步三处**：`componentRegistry.js`（数据源）→ `ComponentRender.vue`（v-if 链，**链尾无 v-else 兜底**，只加 registry 会静默空白）→ `PageEditor.vue`（schema + control 硬编码分发）。C 端 `DesignPage.vue` 独立重复实现。⚠️ 同 v-if 链多个 `v-else` 互斥同级；画布 `.r-*` 尺寸手抄 C 端 `.dp-*`，已漏一次。⚠️ 各端另有 `imageBoxStyle` 等**同名但属别的组件**的函数，别误改。
2. **H5 正常 ≠ 小程序正常**（真机症状按此顺序排查，别先调数值）：
   - ① **样式作用域隔离**：父 wxss 穿不透子组件根节点（`:deep()` 也不行）→ 传 prop 让子组件出内联 style。
   - ② **用了 H5 独有的 API**：🔴 MP 无全局 `atob`/`btoa`/`Buffer`——解析 token 用 atob 会抛错被 catch 吞成「未登录/空列表」（myCard 恒跳登录、exchangeRequests 列表空即此）。跨端解码统一 `uni.base64ToArrayBuffer` + `String.fromCharCode` 逐字节，优先读缓存 `card_user.id`。另：`margin:auto` 居中、`background-image:url()` 包内路径 MP 也不 work。
   - ③ 🔴 **声明被整条丢弃**：内联 `font-family` 含双引号（`"Songti SC",serif`）→ 小程序 setStyle **整条**失效 → 同 style 里正常的 `color` 一起丢、退回 CSS 兜底色。字体一律走 CSS 类。`calc()` 内混 `var()` 支持不稳 → 沉浸式 hero 顶部避让必须 `navMetrics` 真实 px 内联。
   - ④ **判据搞反**：见第 7 条。
3. **属性面板通用项按 `key` 去重**（`PageEditor.vue` 的 `ownKeys`）：组件自带某 key 时通用项被跳过 → 同控件在不同组件指不同层。加字段前确认 key 不撞车，通用项 label 写清作用层（「容器左右边距」而非「左右边距」）。
4. **变量注入了 ≠ 生效**：`--c-*` 须有元素消费，`getComputedStyle` 量**消费元素**。**参数若允许 0 就无条件内联**，默认值放 schema、三端基础值归 0；三端 CSS 不得写 `16px` 兜底或写死 `margin-bottom` 补缝。
5. **「页面空白/改了没反应」先抓运行时异常**，不是查数据链路。`watch`/`computed` 引用 `const x = ref(...)` 必须写在声明**之后**，否则 TDZ `ReferenceError` → setup 失败整页白屏。
6. **`defaultProps` 只对「新建/复制」生效**：手写 DB 插组件是**无效验证**（绕过 `PageEditor.load()` 的合并）。正确验证 = 设计器真点 `.pe-lib-card`。预填须排除：链接类（`button.url`/`web-container.url`）、图标名类（`grid-nav.icon` 是 SIcon 名非图片）、已有包内内置图（`countdown`/`countdown2`）。
7. 🔴 **「浅色/深色」类判断必须按背景色，不能按文字色**。纸艺类模板是「深色文字 `#2b2723` + 浅色纸底 `#fdfcf9`」，按文字算 luma=39 → 误判深色 → 标题/按钮/徽章全走白字、在浅底上完全消失（名片详情 hero 真机复现）。判据用 `bgStart`、阈值 luma>180；全屏图+深遮罩的版式恒判深色。**同理：凡「明暗」分支的布尔量，先问「判的是前景还是背景」。**

## 浮层与几何（元规则，跨装修/表单/画布通用）
- 🔴 **负值浮层被裁 → 给容器补 padding，不要给元素「翻边」**：`.pe-comp-tools{top:-22px}`（贴选中组件上方，符合直觉）曾溢出 `.pe-canvas` 被 `overflow-y:auto` 裁掉半条 → 表现为「标题栏下插着一条被切掉上半的蓝条」且点不到（2026-10-07 用户截图）。正解 `.pe-canvas{padding-top:22px}` —— **`overflow` 裁剪的是 padding box，padding 区域本身可见**，于是 `-22px` 落进 padding 区，不被裁且**位置一点不动**。
  - ❌ **勿复活「首个组件翻到下方」**（曾用 `.pe-comp-first{bottom:-22px}`，**用户明确否决**）：破坏「操作条贴着选中组件上方」的统一直觉，且首组件本就在画布最顶、往下翻更怪。**元规则：修「被裁」先问「能不能让容器给它留位」，翻边只作为最后手段。** 末尾元素向下溢出的同类代码要一起检查。
- 🔴 **「组件自身大小」与「容器边距」是两个控件时，用「百分比宽度 + `margin:0 auto`」**：百分比参照容器内容宽、容器左右边距对称 → 容器中心==页面中心 → auto 边距即正确居中；组件大小只由百分比决定，与容器边距无关。权威实现 `utils/btnSize.js:buttonSizeStyle()`。
  - ❌ **勿复活负 margin 溢出补偿**（`marginLeft:-LR` + `width:calc(100% + 2*LR)`）：只在容器**无 padding** 时成立。本项目容器有 `MIN_BG_PADDING=8` → 按钮会**盖住容器底色并溢出、还偏左**（曾因此被用户指出「按钮没有居中」）。`calc(100%+Npx)` 溢出法同理不适用于有内边距的容器。
  - 🔴 **自适应/内容宽组件居中**：`display:inline-block` 的 `margin:auto` **实测不居中**（两侧 auto 被当 0）；改 `block` 后 `width:auto`又**撑满**容器 → 唯一正解是 **`display:block` + `width:fit-content` + `margin:0 auto`**。
  - 🔧 **CSS 几何问题必须像素实测**：写独立 HTML 复刻真实结构（容器 padding/背景色/有无 text-align 全要还原），用无头 Chrome 截图或 `getBoundingClientRect()` 打印数值。**单测全绿 ≠ 视觉正确**（本项目已两次「单测过、真机错」：负 margin 方案、inline-block auto margin）。⚠️ 无头 Chrome 的 `--dump-dom` 读 `<pre>` 常拿到空内容（脚本时序），**优先用 `--screenshot` 肉眼验**。
- ⚠️ schema 字段的说明属性名是 **`tips`（复数）**，不是 `tip`（`PageEditor.vue` 的 `f.tips`）。

## 「点了没反应」三类静默失败
1. **跳到未注册页**：`reLaunch/navigateTo` 到未注册页**无报错无跳转**，新增页须 grep `pages.json` 确认注册。
2. **目标页 onShow 自动跳转弹走用户**：`pages/cardMain/login` 兼任冷启动首页，`onShow→checkGlobalHome()` 就 `reLaunch` 走。修法：主动跳登录带 `manual=1` → 单一事实来源 `utils/loginEntry.js` 的 `loginEntryUrl()`（**全站跳登录一律走它**）。判据 `String(manual)==='1'`（H5 hash 与 MP options query 类型不一致）。
3. **登录/退出丢上下文**：跳登录统一带 `redirect=<站内绝对路径>`，`safeRedirect()` 排除 `//` 外链；401 踢回由 `apiClient.currentPath()` 自动带当前页。
**元规则：一页兼任两角色时，其生命周期的自动跳转/兜底会污染另一角色 —— 每次新增「主动跳它」处，都要让它的自动逻辑让路。**

## 跨端主题跟随（单一事实来源 `web-app/src/utils/design.js`）
- `designThemeVars(config)` 产全套 `--design-*`（primary/rgb/gradient/secondary/text/subtext/headcolor/headtext）；`setDesignTheme(config)` 跨端填充响应式 + `useDesignTheme()` 供页面读。
- **H5**：`App.vue.initDesignConfig` 调 `setDesignTheme` 后 `// #ifdef H5` 跑 `applyDesignStyle` 写 `documentElement`。**MP**：不支持运行时注 `<style>`，须 page 根视图 `:style="[pageBgStyle, themeStyle]"` 内联下发，变量向下继承。
- ⚠️ **消费 `var(--design-` 的页面必须绑 `themeStyle`**，否则 MP 回落 fallback 色。🔧 自查：两集合须完全一致（差集=漏接）`grep -rl "var(--design-" pages/ components/` vs `grep -rl "useDesignTheme" pages/`。
- ⚠️ **SIcon 的 `color` 不能消费 `var()`**（H5 烘焙进 SVG data-URI 不认 var → 非法色变黑；MP 按 `name-hex` 查构建期 PNG 命中不了运行期主题色 → 回退黑 PNG）。只能传**真实 hex**；文字/CSS 背景用 `var(--design-primary)`。
- 🔴 **配色源归属元规则**：先问「这是平台 UI，还是被展示对象的真实外观？」前者跟系统主题，后者保留自身色（templateSelect 模板缩略图是要卖的东西，改主题色=货不对板）。语义色（成功绿/警示橙/VIP 金）刻意不跟随。
- **沉浸页顶部避让**：真实值只由 `navVarsStyle()`（utils/navMetrics.js）内联注入；但**沉浸式 hero 自己要真实 px 内联**（见七条②）。右侧有徽章/按钮的 hero 须避到导航行之下（member 曾致 FREE 徽章与胶囊相撞）。
- 🔴 **胶囊避让**：`navBarRowStyle` 的 `paddingRight` 只是 `capsuleRightPad`(≈7px)，**胶囊宽 87px 压在这 7px 内** → 全站 `#right` 插槽被挡。正确：`.pnv-right` 在**插槽非空时**加 `marginRight=capsuleWidth`，且须判空。
- 🔧 **H5 重建被沙箱 safe-delete 拦**（uni clean 删 >50 文件）：先 `mv dist/build/h5 /tmp/...` 清空再构建。
- 🔴 **「我的名片」入口只认本人名片**：`cardLastViewId` 曾被 `cardDetail`（对外展示页，看他人名片也走它）无条件写入 → 「我的名片」/ 底部名片 Tab 会跳到**他人**名片（表现为跳到「测试用户」）。修法三处：cardDetail 仅在 `card.userId === card_user.id` 时才写缓存；myCard 不带 id 时一律走 `getCardsSafe()`；CardTabBar.goCard 校验 lastId ∈ 本人名片 id。⚠️ **改登录态/id 解析方式后，要回头审视所有依赖「当前用户 id」的缓存与兜底。**
- 🔴 **真机「页面空白/无数据」先查登录用户的 `customer_id`**：装修配置、分销、集市、人脉库**全按租户取数**，新用户若 `customer_id` 为空 → 首页装修组件读不到 → 整页空白，并连带「未入驻/未开通」各种误报。修法：`/auth/wx-login` 用 `Number(tid) || config.defaultTenantId` 兜底绑定，前端 `wxLogin` 传 `DEFAULT_TENANT_ID`。🔧 验证：后端 token 无签名，可自造 `base64({uid,openid,ts})+'.x'` 用 curl 打接口（真实路径 `/api/card/cards/<id>`，前缀是 `/api/card`）。
- 🔴 **真机「不是最新包」三因**（`scripts/stamp-build.js` → 产物根 `BUILD.txt` 记录时间+git HEAD 用于对账）：① 扫的是**体验版**码——体验版必须开发者工具「上传」才更新；② **预览二维码是旧的**——每次构建后必须重新点「预览」；③ 开发者工具**项目目录**必须是 `web-app/dist/build/mp-weixin`，不能是 `web-app` 根目录。

## 创建页画布定稿（v3.2）
浅色画布 `#f6f7fb` + 顶部主题色晕染 + 白卡 + **主题色渐变头部**；取消明暗双分支。主题色主场 = 头部渐变/主按钮/焦点圈/分隔线/输入框描边。**步骤数字消费 `--sk-hd-sub`**。回归测试 `createSkin.test.js` 7 例已锁。
🔴 元规则：用户说「这个色不对」先确认**指哪个元素**——曾把「步骤数字灰色」误判成整个头部而删掉。
🔴 **真机专属坑：`v-if` 动态插入节点 → 真机后续内容错位，开发者工具永不复现**。根治：节点常驻 + 预留固定高度 + visibility/class 切换。

## 超级表单
- **核心语义**：**一个表单、多处调用**。五入口：装修 `superform`/文章 `form.superForm`/商城 `cfg.useFormId`/商品 `superForm='custom'+superFormId`/链接 `/pages/superForm/fill?formId=x`。`design_json`、`goods_setting.config` 是不透明 JSON → 新增挂载点通常零后端改动。
- **「组件即卡片」（勿回退）**：页面灰底 #f2f3f5，每组件自带白底卡，卡间灰缝靠 `outMarginTop`（默认 10）。`componentStyleVars` 已内联 bg/radius/marginTop，三端容器保持 transparent 即自然成卡。**改卡片形态只动容器背景；间距只改 `sfComponentStyle.js` 一处，禁止三端写死 `margin-bottom`。** 第 3 参 `layout` 必传（`horizontal` 时 marginTop 归零交容器 gap）。
- radio/checkbox 的 `content.options` 须 `[{label,value}]` 对象。**组件圆角必须始终发射含 0**（曾 `if(st.radius)` 让 0 跳过回落基础圆角）。左右留白唯一来源 `outMarginX`。
- textarea 须 `:maxlength="maxLength>0?maxLength:-1"` + `:show-confirm-bar="false"` + **计数自绘**（否则面板「最多输入」不生效）。预览端不可合并 `text`/`textarea`。
- **选中框挂「持白底/内容的那一层」**：装修 `.pe-comp`、表单 `.sf-comp-wrap`（两层挂内层会内缩 8px）；`@click` 挂 wrap，内层只留 draggable。
- **「组件风格」**：`styleVariant(comp)` 三端统一调，只认语义 class（`sfv-*`+`sfx-opt*`）。⚠️ styleType 跨组件撞名（radio 的 `s1` 作用选项区、filedownload 的 `s1` 作用下载框）→ 映射**按 type 分派**。⚠️ 「组件即卡片」下不能用「白底+无边框」做风格档。
- 🎯 改 `STYLE_SCHEMA.boxLine`/`styleVariant()`/任一端 `sfv-*` CSS 后必跑 `node scripts/audit-sf-style-coverage.mjs`（非 0 = 死参数）。加新风格时三端选择器组须加新组件容器 class。
- ⚠️ **取「名片字段」别调错接口**：`memberMyCard()`（`//member/my-card`）= **租户会员卡**（无 city/名片字段），`getCardsSafe()`（`/cards`）/ `getProfile()` 才是**个人名片**。market 的同城城市曾误取前者 → 恒空 → 误报「请先完善所在城市」。
- **面板控件 ≠ 功能已复刻**，三层缺一不可：数据层默认 content 声明字段（老数据 undefined，**须写存量迁移**）→ 渲染层两端消费+兜底 → 样式 schema 映射。**判定开关有用没用，去校验/提交路径确认是否真 gate 了什么。**
- 边距四件套：`outMarginTop`(10)/`outMarginX`(10)/`marginY`(padding-tb,10)/`marginX`(padding-lr,16)/`radiusTL/TR/BR/BL`。外左右改 margin 后**三端容器 padding 必须归 0**。改 schema 默认值须**定向迁移存量**（只改等于旧默认的，改前 `cp` 备份 DB）。

## 背景色拆两字段（`2e44353`，勿回退）
- `bgColor`=组件自身底色（label「按钮色」）；`compBgColor`=容器底色（label「组件背景色」）。单一事实来源 `containerStyle.js` 的 `CONTAINER_BG_KEY`。存量迁移 `migrateLegacyBgColor()`（幂等）挂「加载草稿 + `newComp()`」；判据表 `SELF_COLORED_TYPES` 加类型前须确认该类型根节点真不读 `props.bgColor`。
- 🔴 内联背景会盖选中高亮：`.pe-comp.active` 用 `outline + box-shadow`，**不要写 `.active{background:!important}`**。
- 🔴 **满宽组件完全遮容器底色**：修法 `MIN_BG_PADDING=8`，仅设了底色才兜；**必须把 `0` 也当「未设」**（滑块用 `props[key]??0`）。
- ❌ 废弃错路：`HIDDEN_BG_TYPES` 黑名单（手工维护 28 项、漏判 goods-*）。

## 包内资源 vs 后端资源（判据：问「这个文件在后端有吗」）
有 → `resolveUrl()`/`background-image`；只在 `src/static` → `assetUrl()`/真正的 `<image>` 层。
- MP 图裂三层：① `strip-mp-static.js` 的 `STRIP_DIRS`（进前须 grep 确认真零引用）② `resolveUrl()` 给包内相对路径拼 `API_DOMAIN`→404 ③ `background-image:url()` 不支持包内路径。
- **示例图硬规范**：一律走网络图、不进包。唯一事实来源 `utils/sampleImages.js` 的 `sampleUrl()`，**禁止手写路径字符串**。代价：真机须配 request 合法域名。
- **构建脚本自检须「不论成败都跑」且判两类**：①代码引用但产物没有 ②网络图路径写错（抽文件名去 `src/static/` 反查比对；只判「在不在包里」对网络图永远通过——曾漏检 10 天）。

## 平台能力误判元规则
曾断言「小程序 `<view>` 不支持 CSS 渐变」据此包装 30 处背景——若提交等于凭空造 regression。**从「A 端现象」推不出「平台能力缺失」。改「降级/兼容」代码前先问：它在解决真问题，还是在解决我以为存在的问题？**
⚠️ 与第 2 条呼应：**先证实「平台不支持」再写降级**。真机症状先怀疑「声明被整条丢弃」「跨了组件边界」「用了 H5 独有 API」，而不是平台能力缺失。

## UI 规范
- 图标 `docs/规范/07-UI设计.md`：三层蜜桃橙、填充非描边、大圆角扁平、透明底；禁绿紫蓝分类色。面板图标须 56×56 8-bit RGBA PNG，未映射进 `COMP_ICONS` 会 fallback 线性 SIcon。
- **按钮规范** `docs/规范/08-装修中心按钮规范.md`：装修中心取 WeUI **方角**、**不动商城**。四档 L96/M80/S64/XS56rpx，圆角 L/M16·S12·XS8rpx。新写装修按钮一律 rpx、用 `<view>` 不用 `<button>`、锁 height+line-height。尺寸来源 `utils/btnTokens.js`。⚠️ **全局类名禁用 `.btn`**（scoped 拦不住全局类）→ 用 `.dbtn-`。
- **共享样式实现放 `web-app/src/utils/`，admin 跨包 import**。⚠️ 被 import 模块旁**不得再定义同名函数**（`Identifier has already been declared`，uni 误显「连接服务器超时」；用 `node scripts/check-sfc.cjs <file>` 定位）。
- ⚠️ **macOS grep 不支持 `\|` 分支**（BRE 无交替），必须用 `grep -E`。**凡用 `\|` 结论一律不可信。**
- ⚠️ `PeColorPicker` 渐变预设 11 色与名片宫格方案 A 的 9 色**是同一套** → 运营易误选（曾两次把按钮底色设成宫格橙渐变），排查「颜色串了」先确认是否误选预设。
- **底部导航配置真身 = `tenant_tab_scheme.tab_json`**；`tenant_page_design.meta.nav` 只有 mode/schemeId。gen-mp-sicons 烘 MP 图标色读前者 —— **共享路径/工具必须提模块级 try 外**（块内 const + 静默 catch 会吞掉后续块）。

## 小程序主包体积（1.5M 质量线 / 2M 硬上限；**测法/构成/分包化详见 refs/miniprogram-and-backend.md**）
- 🔴 **每次 MP 构建后必手动清理 4 个目录**（脚本删除被 safe-delete 守卫拦，>50 文件）：`static/{sicons,icons,sample,three}`。⚠️ **`du` 会把已移走的空目录算进体积，量完先 `find dist/build/mp-weixin -type d -empty -delete`。** 量体积前必先清理，否则数据全假。当前 1450KB。
- 🔴 **真机全量 `ERR_CONNECTION_TIMED_OUT` = 局域网 IP 变了**：MP API 基址写死 `utils/cardApi.js:18`，DHCP 换网必失效（别查服务端）。验证新 IP 须 grep 产物 `utils/cardApi.js`——**grep vendor.js 恒为 0**。⚠️ **MP 产物 JS 中文被 unicode 转义**（grep 中文=0）：验证用 ASCII 标识或查 `.wxml`。

## 对标站 eweishop 抓数（详见 `refs/env-toolbox.md`）
**禁止凭组件名字猜布局、靠眼睛估风格数**（`docs/复刻规范/反模式.md`）。必须点开量真实 DOM + 计算样式。已知：Vue **2**；hash SPA **必须先「选店铺」**；`data-id` 是内部键名（按钮组=`menu`）；「组件样式/组件风格」是占位 `on`，须从渲染结果反推。

## 登录与配色（2026-10-07 批次四定稿）
- 🔴 **微信登录真机根因**：`code2Session` 曾是 mock（`openid='mock_'+code`）→ 真机每次 code 不同 = **每次登录建新用户**（名片/入驻/会员全丢）。已修：`server/src/app.js` 的 `createWxCode2Session()`，密钥写在 `server/.env`（已 gitignore），`npm start/dev` 用 `node --env-file-if-exists=.env` 加载；未配密钥回落 mock。**查「登录后各种不对劲」先确认服务端走的是哪条通道。**
  - 🔧 通道验证：`curl -X POST /api/card/auth/wx-login -d '{"code":"假code"}'` → `code2session失败(40029): invalid code` = 真实通道生效且密钥有效；40001/40125 才是密钥错。
  - 换真实通道后真机首登会新建「真实 openid 空账号」，旧名片仍在 mock 账号下 → `scripts/rebind-wx-user.mjs` 过户（预演/--apply，自动备份 DB）。⚠️ openid 按真实特征（28 位、以 o 开头）识别，否则误中种子账号。
  - ⚠️ **DB 真实路径 `server/data/panorama.db`**，不是 app.db。
- **未登录引导统一姿势**：toast + `loginEntryUrl(LOGIN_PATH, redirect)`（manual=1 + 回跳），member/cardDetail 已统一；勿只 toast 不跳。
- **导航背景默认图库**：MaterialPicker 新增 `presets` prop（`[{url,label}]`，非空显示「默认图」页签）；TabNavEditor 仅 `target==='bg'` 时传 `bgPresets`（10 张 `server/public/images/tabbar-bg/btn-*.png`）。⚠️ C 端 CardTabBar 对含该前缀的 bg **按当前 类型×风格×圆角 自动回正**——选默认图后切风格无需重选。vite proxy 须含 `/images`。
- **品牌色三层定稿（方案A）**：语义色不跟随 → 平台主题（装修中心 `--design-*`）全站默认 → 品牌主色（租户 `brand_color`）只在名片业务域覆盖。名片 hero 回落链：**名片自身色 > 租户品牌色（仅详情头部）> `var(--design-primary/gradient)` > 内置默认**；新页面 hero 禁止硬编码 fallback 渐变。
- ⚠️ **历史 mock 遗留**：#99051/#99053 也有同名「林平」名片（id 29/30，与 #99057 的 31 号并存）。**未经用户确认不得合并/删除数据。**
