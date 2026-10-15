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
  - 🔴 **`containerChildSizeStyle()` 会内联下发 `display:block`+`textAlign:center`（按钮在块级流需要）**：凡自身需要内部布局的调用方（搜索框需 flex 行布局）合并后**必须恢复** `display:flex`，否则图标/文案被压成两行（2026-10-14 真机+H5 双端复现；admin 靠 inline 子元素侥幸未显形）。两端调用方必须同步改，回归 `nativeSearchParity.test.js`。
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
- 🔴 **主题化强调色只能用 `--design-primary` / `--design-primary-rgb`**；`--primary` 是 token.scss `$primary=#165dff` 编译期固定蓝（不随主题），`--theme-tint` 全仓无定义（写它必回落硬编码蓝）——二者是配色漂移陷阱，禁用于跟随主题处。回归 `cardEntryThemeConsistency.test.js`。
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

## 两个入口 & 构建（验证修复前必看）
- 设计中心有两个入口：**dev `http://localhost:5173/admin-assets/customer.html#/design/edit`**（vite，改完即生效）｜**生产 `http://localhost:3000/admin`**（`server/public/admin` 构建产物，**必须重建才含新代码**）。
- 🔴 **用户说「修完还是老问题」先问/确认他访问的是哪个入口**——曾因跑 3000 旧产物（22:23 构建 < 23:20 修复）而误判「还有第二路径」，白查一轮。
- ⚠️ `npm run build:admin` 的 `rm -rf` 会被 safe-delete 拦(>50 文件) → 先 `mv` 旧产物到 /tmp，再 `npm run build -w web-admin`；改完让用户**硬刷新**绕开旧 html 缓存。
- 启动服务：`npm run dev -w server`(3000) + `npm run dev -w web-admin`(5173)；admin 的 `/api` 已 vite proxy 到 3000。查库用 `node:sqlite` + `server/data/panorama.db`（⚠️ 不是 `server/src/data/` 旧库）。

## 背景色拆两字段（`2e44353`）
`bgColor`=组件自身底色(label「按钮色」)；`compBgColor`=容器底色(label「组件背景色」)。单一来源 `containerStyle.js` 的 `CONTAINER_BG_KEY`；存量迁移 `migrateLegacyBgColor()`(幂等，挂加载草稿+`newComp()`)。
- 🔴 内联背景盖选中高亮：`.pe-comp.active` 用 `outline+box-shadow`，勿写 `.active{background:!important}`。
- 🔴 满宽组件完全遮容器底色：修法 `MIN_BG_PADDING=8`，仅设底色才兜；**0 也当「未设」**(滑块 `props[key]??0`)。
- 🔴 **某状态下无效的控件优先「条件隐藏」，不要删**（删=作废存量数据+堵死真实场景）。面板新增 `whenHas`（`when` 只支持精确值匹配，`whenHas` 表达「字段有实值」，如 compBgColor 非空非透明才显示「容器圆角」b5641ce）。面板控件只做引导，**不动渲染层消费、不动存量数据**。
- 🔴 **「清空/透明」类控件绝不能 emit 空串表示透明**——空串已被「未设置→默认兜底」占用，透明意图永远无法表达(9166359「设了透明还是白色」)。颜色控件三态：`''`=未设(默认白卡)、`'transparent'`=显式透明(照常输出 background 盖 CSS 白底，但不算「设了底色」不触发 MIN_BG_PADDING)、有色值。
- 🔴 **「保存/发布后预览才变」⇒ 病根在「重新加载」路径(迁移/合并)，不在渲染函数**。先查库(`server/data/panorama.db`，⚠️ 非 `server/src/data/` 旧库)区分「数据坏了」vs「内存被改」。
- 🔴 **新增组件族必须审 `SELF_COLORED_TYPES`**：bgColor=自身色的组件漏加白名单 → 迁移把它搬进 compBgColor 污染容器；再保存即写库、C 端跟着坏。native-* 出生即新范式，已整体 `startsWith('native-')` 跳过迁移(a296b27)。

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
- 🔴 **CSS token 单一事实来源=`web-app/src/styles/token.scss`**（`:root,page` 暴露 CSS 变量）。⚠️ **页面级 inline 会覆盖全局**：`pages/card/utils/createSkin.js`(创建页浅色皮肤) 曾 `v['--t3']='#86909c'`/`v['--border-strong']='#c9cdd4'` 回退旧值，架空全局 token 修复 → **改 token 后须 grep 全仓同名 `--t3`/`--border-strong`/`--ink-3` 等下发点一并改**。
- 🔴 **新增测试须先确认 vitest include 覆盖该目录**：原 `vitest.config.js` include 只含 `utils/components/pages`，`src/styles/**` 的测试从未执行（静默全绿却没跑）。加测试改完顺手把目录加进 include。

## 小程序主包体积（1.5M 质量线/2M 硬上限）
- 🔴 每次 MP 构建后手动清 4 目录(脚本删被 safe-delete 拦>50)：`static/{sicons,icons,sample,three}`(three 704KB 只服务 H5)。⚠️ `du` 会把已移空目录算进体积 → 量完先 `find dist/build/mp-weixin -type d -empty -delete`。
- 🔴 真机全量 `ERR_CONNECTION_TIMED_OUT`=局域网 IP 变：MP API 基址写死 `utils/cardApi.js:18`，DHCP 换网必失效。

## 对标站 eweishop 抓数
禁止凭组件名猜布局、靠眼睛估风格数。必须点开量真实 DOM+计算样式。

## 登录与配色
- 🔴 微信登录真机根因：`code2Session` 曾 mock(`openid='mock_'+code`)→ 真机每次 code 不同=每次建新用户。已修 `server/src/app.js` 的 `createWxCode2Session()`，密钥 `server/.env`。
- 未登录引导：toast + `loginEntryUrl(LOGIN_PATH, redirect)`(manual=1+回跳)。
- 品牌色三层(方案A)：语义色不跟随 → 平台主题全站默认 → 品牌主色仅在名片业务域覆盖。名片 hero 回落：自身色>租户品牌色(仅详情头)>var(--design-primary/gradient)>内置默认。
- 🔴 **品牌主色优先级铁律（2026-10-15 两度修正）**：用户语义＝「后台品牌外观设了就要在名片相关页生效」＝**品牌色覆盖模板配色、保留模板布局**（不是简单排队）。C 端实现：有品牌主色时 `resolvedTheme = { ...templateTheme, bgStart:brand.primary, bgEnd:brand.gradient||shadeHex(primary,-0.3), textColor:brand.text||t.text, text2Color:brand.subText||t.text2, accent:brand.secondary||t.accent, borderColor:品牌辅色||t.border }`；布局字段（heroLayout/bgType/texture/radius/guide 开关）仍取自模板。cardDetail 走 `resolvedTheme`；myCard 头像走 `b.primary || templateTheme?.primary`。**🔴 反例（曾两度踩，是「设了不生效」的真因）：把品牌色排在「自选模板」之后（即 `if (templateTheme) return 模板` 永命中）→ 真实名片几乎都带 `template_id` → `templateTheme` 恒非空 → 品牌色被盖死。凡「品牌色不显示」先查 C 端 `heroStyle` 等是否仍在 `if (heroTheme) return 模板` 分支、未先与 `brandPalette` 合并。** 另：`toCard` 的模板兜底只应在「无品牌色且未自选模板」时挡道；任何让 `templateTheme` 恒非空的逻辑都会把 brandColor 变死代码。
- 🔴 **品牌色已扩为 5 色**（与设计中心 STYLE_SCHEMES 同源：primary/gradient/secondary/text/subText）：存 `projects.config` 五键（brand_color/brand_gradient/brand_secondary/brand_text/brand_subtext）；toCard 出口 `brandColors`(5 色)+`brandColor`(后向兼容 primary)；admin BrandAppearance.vue 14 套 STYLE_SCHEMES 预设 + hero 预览；C 端消费经 `web-app/src/utils/color.js` 的 `brandPalette()` 归一化 + `utils/brand.js` 的 `fetchBrandPalette()`（单一加载来源，**新增消费点禁止各页各写一份**）。`heroGradient(primary, gradient, fallback)` 三参签名，调用方必须显式传 fallback（第二参作渐变色，旧两参会把 fallback 误当渐变）。无 tenant 行的名片靠 `card_profile.customer_id` 进 projects join。
- 🔴 **宫格配色是例外（用户 2026-10-14 明确「可自己配，不跟随租户」）**：首页 native-grid 九项底色收敛为 4 业务域默认色（身份 #3b6ef7→#6a4bf5 / 关系 #0a9f8f→#10b981 / 经营 #e8590c→#f59e0b / 工具 #5c6470→#3d424b），**只落默认值**，items.bg 取色器保留、渲染逻辑零改。副本五处必须对齐：home.vue features / componentRegistry 默认项 / ComponentRender.nativeGridItems（后台预览兜底）/ PeColorPicker 渐变预设 / DB tenant_page_design（迁移 `scripts/migrate-grid-domain-colors.mjs`，只迁历史默认色板命中项）。回归 `gridDomainPalette.test.js`。白图标对比度底线 3:1（浅金 #ffb300 1.79:1、旧橙 #ff6b35 2.1:1 禁回潮）。
- **P0 五页配色收敛已完成**（myCard f83d02a / home 宫格 0c699b5 / cardDetail 16c4f22 / market 6a3f06e / member a562291），每页一个 `*ColorSystem.test.js` 回归。判定框架：平台 UI→`--design-primary`；被展示对象（名片模板 hero、租户 levelBgColor、brandColor）保留自身色；语义色（绿=成功/琥珀=待审/红=危险/必填）只用于真实状态。**SIcon/switch 的 color 是 prop 不吃 var()** → 页面备 `themeColor` computed（**吃 `--design-primary`，勿吃 `--design-subtext`**——租户可配文字辅色，会与他页图标漂移；create.vue 文字色用 subtext 合理）。收敛 SIcon 颜色的提交**必须连 `web-app/src/utils/sicons-base64.js` 一起 add**（MP 构建按源码实际 (name,color) 重新生成的字典，前几轮漏交）。
- **P1 六批也已完成**（distribution f4a816a / visitors 6d27683 / messages+customers 2625dfb / connections 8796de8 / create 0610d8a / mall 20ccb07；profile 审计已收敛零改动）。全站 web-app 测试 347→559 例。补充判定先例：①「不动商城」= **按钮规范**（WeUI 方角/尺寸/结构），商城配色照常收敛；② 订单/客户**状态机**（pending/paid/shipped/done/closed…）是真实状态，色相保留不跟随主题；③ **头像个体识别色**（connections 五色板、后端 tagColor）保留；④ canvas 不认 var()（distribution 海报）；showModal confirmColor / swiper indicator-active-color 等同理喂 themeColor；⑤ 消费**无定义 CSS 变量且无兜底**（如 create 的 `var(--gold)`）= 声明静默无效，审计时要查变量定义；⑥ 🔴 **色值审计 grep 用 `grep -nE '#[0-9a-fA-F]{3,8}|rgba?\('` 全列再筛**，勿用带 `\b` 的 pattern 或 `-c` 计数（BSD grep 下漏过色）。

## 集市两套状态体系（2026-10-15 修复，防再踩）
- 「公开状态」`card_profile.is_public` ≠ 「集市状态」`card_market_items`：前者服务端仅 admin 客户列表消费；后者才是 myCard 集市状态/market 列表的唯一数据源。旧代码开关只写前者 → 空头支票（myCard 恒「未上架」）。
- 模型：**开关=集市场上架控制，is_public=可见性派生 flag**。单一来源 `web-app/src/utils/marketLink.js` 的 `syncMarketWithIsPublic(api, isPublic)`（displaySettings/create 共用）；主体解析必须与 myCard 同源（active 个体优先）。服务端 `/market/toggle`、`/market/force-remove` 增删记录时 `syncCardsPublic` 反向同步 is_public（防 market.vue 下架被展示设置页 heal 复活）；**PUT /cards/:id 不代建 item**（联动归 C 端，带审核/配额语义）。
- 存量自愈在 displaySettings `load()` 的 `healMarketLink()`：只补「开着却没上架」方向，无主体/硬失败回滚开关。回归 `marketLinkSync.test.js`(29) + server `market-ispublic-sync.test.js`(5)。
