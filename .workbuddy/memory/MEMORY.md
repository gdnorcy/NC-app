# 项目长期记忆（360全景 / panorama-360）

> 只放「违反代价高且高频」的规则 / 元规则。过程细节见 `YYYY-MM-DD.md` 与各 `refs/*.md`。

## 🔴 七条最易反复踩（装修组件通用）
1. **改一处必须同步三处**：`componentRegistry.js`(数据源) → `ComponentRender.vue`(v-if 链，**链尾无 v-else 兜底**，只加 registry 会静默空白) → `PageEditor.vue`(schema+control 硬编码分发)。C 端 `DesignPage.vue` 独立重复。⚠️ 同链多 `v-else` 互斥同级；`.r-*` 尺寸手抄 C 端 `.dp-*`(曾漏一次)；`imageBoxStyle` 等**同名异组件**函数别误改。
2. **H5 正常 ≠ 小程序正常**，真机症状按顺序查：① 父 wxss 穿不透子组件根(`:deep()` 也不行)→ 传 prop 让子组件出内联；② MP 无 `atob/btoa/Buffer`→ 跨端解码用 `uni.base64ToArrayBuffer`+`String.fromCharCode`(用 atob 会被 catch 吞成未登录/空列表)；③ 🔴 内联 `font-family` 含双引号 → setStyle **整条丢弃**(同 style 的 color 一起丢)→ 字体走 CSS 类；`calc()` 混 `var()` 不稳 → hero 避让用真实 px 内联；④ 判据搞反(见第 7 条)。
3. **通用项按 `key` 去重**(`ownKeys`)：组件自带某 key 时通用项被跳过 → 同控件在不同组件指不同层，label 写清作用层(「容器左右边距」非「左右边距」)。
4. **变量注入 ≠ 生效**：`--c-*` 须有元素消费，量**消费元素**。**参数允许 0 就无条件内联**，默认放 schema、三端基础值归 0，三端 CSS 不得写 `16px` 兜底或写死 `margin-bottom` 补缝。
5. **「空白/没反应」先抓运行时异常**：`watch/computed` 引用 `const x=ref()` 须在声明**之后**，否则 TDZ `ReferenceError` → setup 失败白屏。
6. **`defaultProps` 只对新建/复制生效**：手写 DB 插组件是**无效验证**(绕过 `PageEditor.load()` 合并)。正确验证＝设计器真点 `.pe-lib-card`。预填排除：链接类(`button.url`)、图标名类(`grid-nav.icon`)、内置图(`countdown`)。
7. 🔴 **明暗判断必须按背景色非文字色**：纸艺模板「深字+浅纸底」按文字算误判深色 → 标题/按钮/徽章走白字在浅底消失。判据用 `bgStart`、luma>180；全屏图+深遮罩恒判深色。**凡「明暗」布尔量先问判的是前景还是背景。**

## 浮层与几何（元规则）
- 🔴 **越界浮层被 overflow 裁 → 移出滚动容器 + JS 定位，不靠容器 padding**。裁剪边界是滚动容器(`.pe-canvas{overflow-y:auto}`)，祖先加 padding 不生效(实测 `.pe-phone{padding-top}` 工具条仍被裁)。✅ `.pe-tools-layer`(画布平级兄弟,`absolute/inset:0/pointer-events:none/z-index:60`)+`positionCompTools()` 按 `getBoundingClientRect()` 定位。回归 `compToolsLayer.test.js`(8例)。❌ 勿复活 `.pe-comp-first{bottom:-22px}`(用户否决)。
- 🔴 **「组件大小」与「容器边距」是两控件时，宽度用视口单位(vw/设计稿px)，绝不用百分比**：百分比永远参照容器内容宽 → 容器一变窄子组件必变窄，两控件缠死(实测 60% 在 marginLR=0/20/40 → 225/201/177px)。C 端发 `60vw`、admin 按 375 设计稿发 `225px`。权威 `utils/containerChildSize.js`(button/search 共用，`btnSize.js` 只转发)。回归 `containerChildSize.test.js`(17例)。
  - 🔴🔴 **`max-width:100%` 也是耦合源**(参照容器)→ 用 `max-width:100vw`/`375px`。
  - ❌ 勿复活负 margin 溢出补偿(容器有 `MIN_BG_PADDING=8` → 盖底色/溢出/偏左)。
  - 🔴 `margin:auto` 居中必须 `display:block`：基础类 `.r-btn`/`.dp-btn` 是 inline-block → auto 边距静默失效。
  - 🔴 flex 子项必须 `flex:none`+`width`+`margin`+`max-width`，否则 `flex:1` 压掉宽度。
  - 🔴 兄弟有剩余空间要求时不两侧 auto(搜索框右侧铃铛 → `marginLeft:0`+`marginRight:auto`)。
  - 🔴 **文字垂直居中根因是行盒**：`align-items:center` 居中的是行盒，行盒高=line-height。`line-height:1`→顶出框外(最偏)；=框高→✅(内联下发，勿写死 CSS 兜底覆盖内联)。
- 🔴 **同一功能两端各写一份 CSS/样式函数＝必然漂移**。判据「两端不同步」先逐项比对量再改。`nativeSearchParity.test.js`(8例) 用 `rpx÷2===px` 比对盒模型/gap/padding/兜底高，曾抓到 gap 8vs6、兜底 38vs36。
  - 🔧 写这类测试三纪律：① 函数从 `.vue` 源码正则提取+`new Function`(抄副本锁不住)；② 取 CSS **先剥注释、只取 `<style>` 块**(否则匹到 JS 注释里的 CSS 片段)；③ 比对**实际生效值**(高特异性选择器覆盖兜底)。
- 🔧 **CSS 几何必须像素实测**：独立 HTML 复刻真实结构 + 无头 Chrome(`--headless=new --no-sandbox`；`:hover` 不触发改用 `.active`；`--dump-dom` 读 `<pre>` 常空 → 写 `document.title` 再抓 title)。**单测全绿 ≠ 视觉正确**(已四次单测过真机错)。
- 🔴 **用户提示常含答案**：「A 可 B 不可」⇒ 病根在两分支差异，先读代码。同一函数两分支写法不一＝高危。「还是之前的坑」=方案选错，别在同一错方案上加声明(本项目百分比宽度连错两轮，第三次换视口单位才对)。
- ⚠️ schema 说明属性名是 **`tips`(复数)** 非 `tip`。

## 「点了没反应」三类静默失败
1. 跳未注册页 → 无报错无跳转，新增页须 grep `pages.json` 注册。
2. 目标页 onShow 自动跳转弹走用户 → 跳登录统一带 `manual=1`，单一来源 `utils/loginEntry.js` 的 `loginEntryUrl()`。
3. 登录/退出丢上下文 → 跳登录带 `redirect=<站内绝对路径>`，`safeRedirect()` 排除 `//` 外链。
元规则：一页兼任两角色时，生命周期自动跳转会污染另一角色。

## 跨端主题跟随（单一事实来源 `web-app/src/utils/design.js`）
- `setDesignTheme(config)` + `useDesignTheme()` 供页面读。H5 写 `documentElement`；MP 须 page 根 `:style="[pageBgStyle,themeStyle]"` 内联下发。
- 🔴 消费 `var(--design-` 的页面**必须绑 `themeStyle`**，否则 MP 回落 fallback。自查两集合差集。
- 🔴 SIcon 的 `color` 不能消费 `var()`(H5 烘焙 data-URI 不认 var→黑；MP 按 name-hex 查构建期 PNG→回退黑)→ 只传真实 hex。
- 🔴 **「一端有边距一端没有」先查存量数据异类**：病根常是特例组件不走共享样式函数。`native-*` 在 `home.vue` 边距由 `nativeMargin()` 显式下发，**曾只输出上下漏 marginLR** → 小程序贴边；admin 因 `.pe-comp` 内缩掩盖。元规则：**画布看起来对 ≠ C 端对**，跨端须看真机截图。
- 🔴 补 marginLR 用 `??` 非 `||`(0=故意通栏)。
- 🔴 配色源归属：平台 UI 跟系统主题；被展示对象保留自身色(templateSelect 缩略图是要卖的，改色=货不对板)。语义色(绿/橙/金)不跟随。
- 🔴 胶囊避让：`navBarRowStyle` 的 `paddingRight` 仅 `capsuleRightPad`(~7px)，胶囊宽 87px 压在内 → 全站 `#right` 插槽被挡。正解 `.pnv-right` 插槽非空时加 `marginRight=capsuleWidth` 且判空。
- 🔴 「我的名片」只认本人：`cardLastViewId` 曾被 `cardDetail`(看他人也走) 无条件写 → 跳他人名片。修法：cardDetail 仅 `card.userId===card_user.id` 时写；myCard 不带 id 走 `getCardsSafe()`；CardTabBar.goCard 校验 lastId∈本人 id。
- 🔴 真机「空白/无数据」先查登录用户 `customer_id`：装修/分销/集市/人脉全按租户取数，新用户空 → 整页空白。修法：`/auth/wx-login` 用 `Number(tid)||config.defaultTenantId`。
- 🔴 真机「不是最新包」三因：① 扫体验版码须「上传」才更新；② 预览二维码旧，须重新点预览；③ 目录须 `web-app/dist/build/mp-weixin`。
- 🔧 H5 重建被 safe-delete 拦(uni clean 删>50)→ 先 `mv dist/build/h5 /tmp/...` 再构建。

## 创建页画布（v3.2）
浅色 `#f6f7fb` + 顶部主题色晕染 + 白卡 + 主题色渐变头部；主题色主场=头部渐变/主按钮/焦点圈/分隔线/输入框描边。回归 `createSkin.test.js`(7例)。
🔴 用户说「色不对」先确认指哪个元素(曾把步骤数字灰误判成整个头部删掉)。
🔴 真机坑：`v-if` 动态插入节点 → 真机后续内容错位，devtools 不复现。根治：节点常驻+预留固定高度+visibility/class 切换。

## 超级表单（详见 `refs/decoration-form.md`）
- 核心语义：**一个表单、多处调用**(装修/文章/商城/商品/链接五入口，`design_json` 等不透明 JSON → 新挂载点常零后端改动)。
- 「组件即卡片」(勿回退)：页面灰底，每组件自带白底卡，卡间灰缝 `outMarginTop`(10)。`componentStyleVars` 内联 bg/radius/marginTop，容器保持 transparent 即成卡。**改卡片只动容器背景；间距只改 `sfComponentStyle.js` 一处，禁止三端写死 margin-bottom。**
- 选中框挂「持白底/内容那层」；`@click` 挂 wrap，内层只 draggable。
- 「组件风格」`styleVariant(comp)` 按 type 分派，只认语义 class(`sfv-*`+`sfx-opt*`)。改后必跑 `node scripts/audit-sf-style-coverage.mjs`(非0=死参数)。
- 面板控件 ≠ 功能复刻：数据层默认 content 声明字段(老数据须存量迁移)→ 渲染层消费+兜底 → schema 映射。**判定开关是否有用，去校验/提交路径确认是否真 gate。**
- 边距四件套：`outMarginTop(10)/outMarginX(10)/marginY(10)/marginX(16)/radiusTL/TR/BR/BL`。外左右改 margin 后三端容器 padding 归 0。

## 背景色拆两字段（`2e44353`）
`bgColor`=组件自身底色(label「按钮色」)；`compBgColor`=容器底色(label「组件背景色」)。单一来源 `containerStyle.js` 的 `CONTAINER_BG_KEY`；存量迁移 `migrateLegacyBgColor()`(幂等，挂加载草稿+`newComp()`)。
- 🔴 内联背景盖选中高亮：`.pe-comp.active` 用 `outline+box-shadow`，勿写 `.active{background:!important}`。
- 🔴 满宽组件完全遮容器底色：修法 `MIN_BG_PADDING=8`，仅设底色才兜；**0 也当「未设」**(滑块 `props[key]??0`)。

## 包内 vs 后端资源（判据：文件在后端有吗）
有 → `resolveUrl()`/`background-image`；只在 `src/static` → `assetUrl()`/真 `<image>`。
- 示例图硬规范：一律网络图不进包，唯一来源 `utils/sampleImages.js` 的 `sampleUrl()`，禁止手写路径(曾漏 `/card` 前缀 → 404 且构建零提示)。
- 构建自检须「不论成败都跑」且判两类：①代码引用但产物没有 ②网络图路径写错。

## 平台能力误判元规则
曾断言「小程序 `<view>` 不支持渐变」据此包装 30 处 → 提交=凭空造 regression。**从「A 端现象」推不出「平台能力缺失」。改降级/兼容前先问：解决真问题，还是我以为存在的问题？** 真机症状先疑「声明被整条丢弃」「跨组件边界」「用 H5 独有 API」。

## UI 规范
- 按钮规范：装修中心取 WeUI 方角、不动商城；新按钮一律 rpx、`<view>` 非 `<button>`、锁 height+line-height，尺寸来源 `utils/btnTokens.js`。⚠️ 全局类名禁用 `.btn`(scoped 拦不住)→ 用 `.dbtn-`。
- 共享样式放 `web-app/src/utils/`，admin 跨包 import。⚠️ 被 import 模块旁不得再定义同名函数(`Identifier has already been declared`；`node scripts/check-sfc.cjs <file>` 定位)。
- ⚠️ macOS grep 不支持 `\|`(BRE 无交替)→ 用 `grep -E`。

## 小程序主包体积（1.5M 质量线/2M 硬上限）
- 🔴 每次 MP 构建后手动清 4 目录(脚本删被 safe-delete 拦>50)：`static/{sicons,icons,sample,three}`(three 704KB 只服务 H5)。⚠️ `du` 会把已移空目录算进体积 → 量完先 `find dist/build/mp-weixin -type d -empty -delete`。
- 🔴 真机全量 `ERR_CONNECTION_TIMED_OUT`=局域网 IP 变：MP API 基址写死 `utils/cardApi.js:18`，DHCP 换网必失效。

## 对标站 eweishop 抓数
禁止凭组件名猜布局、靠眼睛估风格数。必须点开量真实 DOM+计算样式。

## 登录与配色
- 🔴 微信登录真机根因：`code2Session` 曾 mock(`openid='mock_'+code`)→ 真机每次 code 不同=每次建新用户。已修 `server/src/app.js` 的 `createWxCode2Session()`，密钥 `server/.env`。
- 未登录引导：toast + `loginEntryUrl(LOGIN_PATH, redirect)`(manual=1+回跳)。
- 品牌色三层(方案A)：语义色不跟随 → 平台主题全站默认 → 品牌主色仅在名片业务域覆盖。名片 hero 回落：自身色>租户品牌色(仅详情头)>var(--design-primary/gradient)>内置默认。
