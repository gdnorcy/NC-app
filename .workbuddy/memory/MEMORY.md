# 项目长期记忆（360全景 / panorama-360）

> 只放「违反代价高且高频」的规则。
> 展开：日报 `YYYY-MM-DD.md`（过程细节）· `refs/env-toolbox.md`（构建/脚本/CDP/对标抓数）· `refs/miniprogram-and-backend.md`（小程序端坑 + 后端数据）· `refs/verify-playbook.md`（验证姿势）

## 🔴 六条最易反复踩
1. **装修组件改一处必须同步三处**：`componentRegistry.js`（数据源）→ `ComponentRender.vue`（v-if 链，**链尾无 v-else 兜底**，只加 registry 会静默空白）→ `PageEditor.vue`（schema + control 硬编码分发）。C 端 `DesignPage.vue` 独立重复实现。⚠️ 同 v-if 链多个 `v-else` 互斥同级；画布 `.r-*` 尺寸手抄 C 端 `.dp-*`，已漏一次。
2. **H5 正常 ≠ 小程序正常**：①组件**样式作用域隔离**，父 wxss 穿不透子根（`:deep()` 也不行）→ 传 prop 让子组件出内联 style；② `margin:auto` 居中、`background-image:url()` 包内路径 MP 不 work；③ 🔴 **MP 无全局 `atob`/`btoa`/`Buffer`**（H5 才有）——解析 token 用 atob 会抛错被 catch 吞成「未登录/空列表」（myCard 恒跳登录、exchangeRequests 列表空即此）。跨端解码统一用 `uni.base64ToArrayBuffer` + 逐字节 `String.fromCharCode`；优先读缓存 `card_user.id`。凡「H5 没效果」→ 先问**跨没跨组件边界**、**用了哪个端才有的 API**，别调数值。
3. **属性面板通用项按 `key` 去重**（`PageEditor.vue` 的 `ownKeys`）：组件自带某 key 时通用项被跳过 → 同控件在不同组件指不同层。加面板字段前先确认 key 不撞车。
4. **变量注入了 ≠ 生效**：`--c-*` 须有元素消费，`getComputedStyle` 量**消费元素**。**参数若允许 0 就无条件内联**，默认值放 schema、三端基础值归 0；三端 CSS 不得写 `16px` 兜底或写死 `margin-bottom` 补缝。
5. **「页面空白/改了没反应」先抓运行时异常**，不是查数据链路。`watch`/`computed` 引用 `const x = ref(...)` 必须写在声明**之后**，否则 TDZ `ReferenceError` → setup 失败整页白屏。
6. **`defaultProps` 只对「新建/复制」生效**：手写 DB 插组件是**无效验证**（绕过 `PageEditor.load()` 的合并）。正确验证 = 设计器真点 `.pe-lib-card`。预填须排除：链接类（`button.url`/`web-container.url`）、图标名类（`grid-nav.icon` 是 SIcon 名非图片）、已有包内内置图（`countdown`/`countdown2`）。

## 「点了没反应」三类静默失败
1. **跳到未注册页**：`reLaunch/navigateTo` 到未注册页**无报错无跳转**，新增页须 grep `pages.json` 确认注册。
2. **目标页 onShow 自动跳转弹走用户**：`pages/cardMain/login` 兼任冷启动首页，`onShow→checkGlobalHome()` 就 `reLaunch` 走。修法：主动跳登录带 `manual=1` → 单一事实来源 `web-app/src/utils/loginEntry.js` 的 `loginEntryUrl()`（**全站跳登录一律走它**）。判据 `String(manual)==='1'`（H5 hash 与 MP options query 类型不一致）。
3. **登录/退出丢上下文**：跳登录统一带 `redirect=<站内绝对路径>`，`safeRedirect()` 排除 `//` 外链；401 踢回由 `apiClient.currentPath()` 自动带当前页。
**元规则：一页兼任两角色时，其生命周期的自动跳转/兜底会污染另一角色 —— 每次新增「主动跳它」处，都要让它的自动逻辑让路。**

## 跨端主题跟随（单一事实来源 `web-app/src/utils/design.js`）
- `designThemeVars(config)` 产全套 `--design-*`（primary/rgb/gradient/secondary/text/subtext/headcolor/headtext）；`setDesignTheme(config)` 跨端填充响应式 + `useDesignTheme()` 供页面读。
- **H5**：`App.vue.initDesignConfig` 调 `setDesignTheme` 后 `// #ifdef H5` 跑 `applyDesignStyle` 写 `documentElement`。**MP**：不支持运行时注 `<style>`，须 page 根视图 `:style="[pageBgStyle, themeStyle]"` 内联下发，变量向下继承。
- ⚠️ **消费 `var(--design-` 的页面必须绑 `themeStyle`**，否则 MP 回落 fallback 色。🔧 自查：两集合须完全一致（差集=漏接）`grep -rl "var(--design-" pages/ components/` vs `grep -rl "useDesignTheme" pages/`。
- ⚠️ **SIcon 的 `color` 不能消费 `var()`**（H5 烘焙进 SVG data-URI 不认 var → 非法色变黑；MP 按 `name-hex` 查构建期 PNG 命中不了运行期主题色 → 回退黑 PNG）。只能传**真实 hex**：`computed(() => designConfig.style.primaryColor)`；文字/CSS 背景用 `var(--design-primary)`。
- 🔴 **配色源归属元规则**：先问「这是平台 UI，还是被展示对象的真实外观？」前者跟系统主题，后者保留自身色（templateSelect 模板缩略图是要卖的东西，改主题色=货不对板）。语义色（成功绿/警示橙/VIP 金）刻意不跟随。
- **沉浸页顶部避让**：PageNav overlay / 自绘 hero 的 padding-top 须消费 `--pnv-status-bar`/`--pnv-nav-h`/`--pnv-capsule-pad`，真实值只由 `navVarsStyle()`（utils/navMetrics.js）内联注入。右侧有徽章/按钮的 hero 须避到导航行之下（member 曾致 FREE 徽章与胶囊相撞）。
- 🔴 **胶囊避让**：`navBarRowStyle` 的 `paddingRight` 只是 `capsuleRightPad`(≈7px)，**胶囊宽 87px 压在这 7px 内** → 全站 `#right` 插槽被挡。正确：`.pnv-right` 在**插槽非空时**加 `marginRight=capsuleWidth`，且须判空。
- 🔧 **H5 重建被沙箱 safe-delete 拦**（uni clean 删 >50 文件）：先 `mv dist/build/h5 /tmp/...` 清空再构建。
- 🔴 **真机「页面空白/无数据」先查登录用户的 `customer_id`**：装修配置、分销、集市、人脉库**全按租户取数**，新用户若 `customer_id` 为空 → 首页装修组件读不到 → 整页空白，并连带「未入驻/未开通」各种误报。修法：`/auth/wx-login` 用 `Number(tid) || config.defaultTenantId` 兜底绑定（多租户平台把 `DEFAULT_TENANT_ID` 设 0 关闭），前端 `wxLogin` 传 `DEFAULT_TENANT_ID`。🔧 验证：后端 token 无签名，可自造 `base64({uid,openid,ts})+'.x'` 用 curl 打 `/api/card/design/config`。
- 🔴 **真机「不是最新包」三因**（新增 `scripts/stamp-build.js` → 产物根 `BUILD.txt` 记录时间+git HEAD 用于对账）：① 扫的是**体验版**码——体验版必须开发者工具「上传」才更新，本地构建永远不更新体验版；② **预览二维码是旧的**——每次构建后必须重新点「预览」生成；③ 开发者工具**项目目录**必须是 `web-app/dist/build/mp-weixin`，不能是 `web-app` 根目录。产物 `project.config.json` 已带正式 appid 且 `urlCheck:false`；开发者工具切「测试号」会导致 code 与 appid 不匹配、登录失败。

## 创建页画布定稿（v3.2）
统一浅色画布 `#f6f7fb` + 顶部主题色晕染 + 白卡 + **主题色渐变头部**；取消明暗双分支。主题色主场 = 头部渐变/主按钮/焦点圈/分隔线/输入框描边。**步骤数字「1/3」消费 `--sk-hd-sub`**，勿用灰 `--t3`。
🔴 **需求理解教训**：用户说「这个色不对」先确认指哪个元素——曾把「1/3 步骤数字灰色」误判成整个红色渐变头部而删成透明（v3.1），用户复核才回退（v3.2）。回归测试 `createSkin.test.js` 7 例已锁。
🔴 **真机专属坑：动态插入节点（`v-if`）→ 真机后续内容错位，开发者工具永不复现**。唯一根治：**节点常驻 + 预留固定高度 + visibility/class 切换**（`.error-tip{height:34rpx;visibility:hidden}` + `:class="{on:...}"`）。⚠️ **删容器 `transition` 治不住（已实测无效）**。

## 超级表单
- **核心语义**：**一个表单、多处调用**。五入口：装修 `superform`/文章 `form.superForm`/商城 `cfg.useFormId`/商品 `superForm='custom'+superFormId`/链接 `/pages/superForm/fill?formId=x`。`design_json`、`goods_setting.config` 是不透明 JSON → 新增挂载点通常零后端改动。
- **「组件即卡片」（勿回退）**：页面灰底 #f2f3f5，每组件自带白底卡，卡间灰缝靠 `outMarginTop`（默认 10）。`componentStyleVars` 已内联 bg/radius/marginTop，三端容器保持 transparent 即自然成卡。**改卡片形态只动容器背景；间距只改 `sfComponentStyle.js` 一处，禁止三端写死 `margin-bottom`。** 第 3 参 `layout` 必传（`horizontal` 时 marginTop 归零交容器 gap）。
- radio/checkbox 的 `content.options` 须 `[{label,value}]` 对象。**组件圆角必须始终发射含 0**。左右留白唯一来源 `outMarginX`。
- textarea 须 `:maxlength="maxLength>0?maxLength:-1"` + `:show-confirm-bar="false"` + **计数自绘**（否则 H5 走内置 140、MP 固定 140）。预览端不可合并 `text`/`textarea`。
- **设计器选中框挂「持白底/内容的那一层」**：装修 `.pe-comp`、表单 `.sf-comp-wrap`；`@click` 挂 wrap，内层只留 draggable。
- **「组件风格」**：`styleVariant(comp)` 三端统一调，只认语义 class（`sfv-box/plain/line/step/slider`+`sfx-opt*`）。⚠️ styleType 跨组件撞名（radio 的 `s1` 作用选项区、filedownload 的 `s1` 作用下载框）→ 映射**按 type 分派**。⚠️ 「组件即卡片」下不能用「白底+无边框」做风格档。
- 🎯 改 `STYLE_SCHEMA.boxLine`/`styleVariant()`/任一端 `sfv-*` CSS 后必跑 `node scripts/audit-sf-style-coverage.mjs`（非 0 = 死参数）。加新风格时三端选择器组须加新组件容器 class。
- ⚠️ **取「名片字段」别调错接口**：`memberMyCard()`（`//member/my-card`）= **租户会员卡**（无 city/名片字段），`getCardsSafe()`（`/cards`）/ `getProfile()` 才是**个人名片**（toCard 带 city）。market 的同城城市曾误取前者 → 恒空 → 误报「请先完善所在城市」。
- **面板控件 ≠ 功能已复刻**，三层缺一不可：数据层默认 content 声明字段（老数据 undefined，**须写存量迁移**）→ 渲染层两端消费+兜底 → 样式 schema 映射。**判定开关有用没用，去校验/提交路径确认是否真 gate 了什么。**
- 边距四件套：`outMarginTop`(10)/`outMarginX`(10)/`marginY`(padding-tb,10)/`marginX`(padding-lr,16)/`radiusTL/TR/BR/BL`(四角独立)。外左右改 margin 后**三端容器 padding 必须归 0**。改 schema 默认值须**定向迁移存量**（只改等于旧默认的，改前 `cp` 备份 DB）。

## 背景色拆两字段（`2e44353`，勿回退）
- `bgColor`=组件自身底色（label「按钮色」）；`compBgColor`=容器底色（label「组件背景色」）。单一事实来源 `containerStyle.js` 的 `CONTAINER_BG_KEY`。存量迁移 `migrateLegacyBgColor()`（幂等）挂「加载草稿 + `newComp()`」；判据表 `SELF_COLORED_TYPES` 加类型前须确认该类型根节点真不读 `props.bgColor`。
- 🔴 内联背景会盖选中高亮：`.pe-comp.active` 用 `outline + box-shadow`，**不要写 `.active{background:!important}`**。
- 🔴 **满宽组件完全遮容器底色**：修法 `MIN_BG_PADDING=8`，仅设了底色才兜；**必须把 `0` 也当「未设」**（面板滑块用 `props[key]??0`）。
- ❌ 废弃错路：`HIDDEN_BG_TYPES` 黑名单（手工维护 28 项、漏判 goods-*）。

## 包内资源 vs 后端资源（判据：问「这个文件在后端有吗」）
有 → `resolveUrl()`/`background-image`；只在 `src/static` → `assetUrl()`/真正的 `<image>` 层。
- MP 图裂三层：① `strip-mp-static.js` 的 `STRIP_DIRS`（进前须 grep 确认真零引用）② `resolveUrl()` 给包内相对路径拼 `API_DOMAIN`→404 ③ `background-image:url()` 不支持包内路径。
- **示例图硬规范**：一律走网络图、不进小程序包。唯一事实来源 `web-app/src/utils/sampleImages.js` 的 `sampleUrl()`（banner 710×388/square 400×400/portrait 600×800），**禁止手写路径字符串**。代价：真机须配 request 合法域名。
- **构建脚本自检须「不论成败都跑」且判两类**：①代码引用但产物没有 ②网络图路径写错（抽文件名去 `src/static/` 反查比对；只判「在不在包里」对网络图永远通过——曾漏检 10 天）。

## 平台能力误判元规则
曾断言「小程序 `<view>` 不支持 CSS 渐变」据此包装 30 处背景——若提交等于凭空造 regression。**从「A 端现象」推不出「平台能力缺失」。改「降级/兼容」代码前先问：它在解决真问题，还是在解决我以为存在的问题？**

## UI 规范
- 图标 `docs/规范/07-UI设计.md`：三层蜜桃橙、填充非描边、大圆角扁平、透明底；禁绿紫蓝分类色。面板图标须 56×56 8-bit RGBA PNG，未映射进 `COMP_ICONS` 会 fallback 线性 SIcon。
- **按钮规范** `docs/规范/08-装修中心按钮规范.md`：装修中心取 WeUI **方角**、**不动商城**。四档 L96/M80/S64/XS56rpx，圆角 L/M16·S12·XS8rpx。新写装修按钮一律 rpx、用 `<view>` 不用 `<button>`、锁 height+line-height。尺寸来源 `web-app/src/utils/btnTokens.js`。⚠️ **全局类名禁用 `.btn`**（scoped 拦不住全局类）→ 用 `.dbtn-`。
- **共享样式实现放 `web-app/src/utils/`，admin 跨包 import**。⚠️ 被 import 模块旁**不得再定义同名函数**（`Identifier has already been declared`，uni 误显「连接服务器超时」；定位 `node scripts/check-sfc.cjs <file>`）。
- ⚠️ **macOS grep 不支持 `\|` 分支**（BRE 无交替），必须用 `grep -E`。**凡用 `\|` 结论一律不可信。**
- 名片宫格 v5（权威 `名片宫格图标方案.html`）：46px 方块(r=14)+32px 描边图标；会员中心＝**对勾圆**非皇冠；用户选方案 **A**。⚠️ `PeColorPicker` 渐变预设 11 色与宫格 A 的 9 色**是同一套** → 排查「颜色串了」先确认是否误选预设。
- **底部导航配置真身 = `tenant_tab_scheme.tab_json`**（/design/tab/save，/design/config 按 is_default 返回 cfg.tab）；`tenant_page_design.meta.nav` 只有 mode/schemeId。gen-mp-sicons 烘 MP 图标色读前者 —— **共享路径/工具必须提模块级 try 外**（块内 const + 静默 catch 会吞掉后续块、零日志）。

## 小程序主包体积（1.5M 质量线 / 2M 硬上限）
- 🔴 **每次 MP 构建后必手动清理**：`gen-mp-sicons`+`strip-mp-static` 删除被 safe-delete 守卫拦（>50 文件），481 个 sicons PNG≈2MB 留主包计重。构建后 `mv dist/build/mp-weixin/static/sicons /tmp/ && mv .../static/icons /tmp/`。**量体积前必先清理。**
- 瘦身：pages.json 把独立应用移入 subPackages（**root=目录名、页面路径不变、零代码改动**）；仅分包引用的组件/工具放 `<root>/components|utils/`。⚠️ 被**两个及以上分包**共用的 util 必须留主包。
- ⚠️ 移源码后重建，`dist` 旧产物是 emptyOutDir 被守卫拦下的残留（用时间戳分辨），不清掉 devtools 仍报警。
- ❌ **three.js 移不出主包**（已实验）：uni-app vite 的 `optimization.subPackages` **不拆 node_modules**。
- 🔴 **真机全量 `ERR_CONNECTION_TIMED_OUT` = 局域网 IP 变了**：MP API 基址写死 `web-app/src/utils/cardApi.js:18`，DHCP 换网必失效（别查服务端）。验证新 IP 须 grep 产物 `utils/cardApi.js`——**grep vendor.js 恒为 0**（该模块不并入 vendor）。
- ⚠️ **MP 产物 JS 中文被 unicode 转义**（grep 中文=0）：验证用 ASCII 标识（接口路径/变量名）或查 `.wxml`。

## 对标站 eweishop 抓数（详见 `refs/env-toolbox.md`）
**禁止凭组件名字猜布局、靠眼睛估风格数**（`docs/复刻规范/反模式.md`）。必须点开量真实 DOM + 计算样式。
已知：Vue **2**；hash SPA **必须先「选店铺」**才能进装修页；组件库 `data-id` 是内部键名（按钮组=`menu`）；属性面板 radio 的 `value` 通常是真实字段值，但「组件样式/组件风格」是占位 `on`，须从渲染结果反推。

## 登录与配色（2026-10-07 批次四定稿）
- 🔴 **微信登录真机根因**：`code2Session` 曾是 mock（`openid='mock_'+code`）→ 真机每次 code 不同 = **每次登录建新用户**（名片/入驻/会员全丢）。已修：`server/src/app.js` 的 `createWxCode2Session()`，密钥写在 `server/.env`（`WX_APPID`+`WX_APPSECRET`，已 gitignore），`npm start/dev` 用 `node --env-file-if-exists=.env` 加载；未配密钥回落 mock。**查「登录后各种不对劲」先确认服务端走的是哪条通道。**
  - 🔧 通道验证：`curl -X POST /api/card/auth/wx-login -d '{"code":"假code"}'` → `code2session失败(40029): invalid code` = 真实通道生效且密钥有效；40001/40125 才是密钥错。
  - 换真实通道后真机首登会新建「真实 openid 空账号」，旧名片仍在 mock 账号下 → `scripts/rebind-wx-user.mjs` 过户 openid（预演/--apply，自动备份 DB）。⚠️ openid 识别按真实特征（28 位、以 o 开头），否则误中种子账号。
  - ⚠️ **DB 真实路径 `server/data/panorama.db`**（config.js `dbPath`），不是 app.db。
- **未登录引导统一姿势**：toast + `loginEntryUrl(LOGIN_PATH, redirect)`（manual=1 + 回跳），member/cardDetail 已统一；勿只 toast 不跳。
- **导航背景默认图库**：MaterialPicker 新增 `presets` prop（`[{url,label}]`，非空显示「默认图」页签）；TabNavEditor 仅 `target==='bg'` 时传 `bgPresets`（10 张 `server/public/images/tabbar-bg/btn-*.png`）。⚠️ C 端 CardTabBar 对含 `/images/tabbar-bg/btn-` 前缀的 bg **按当前 类型×风格×圆角 自动回正**——选默认图后切风格无需重选。vite proxy 须含 `/images`。
- **品牌色三层定稿（方案A）**：语义色不跟随 → 平台主题（装修中心 `--design-*`）全站默认 → 品牌主色（租户 `brand_color`）只在名片业务域覆盖。名片 hero 回落链：**名片自身色 > 租户品牌色（仅详情头部）> `var(--design-primary/gradient)` > 内置默认**；新页面 hero 禁止硬编码 fallback 渐变。
