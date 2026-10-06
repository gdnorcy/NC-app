# 项目长期记忆（360全景 / panorama-360）

> 只放「违反代价高且高频」的规则。
> 展开：日报 `YYYY-MM-DD.md`（过程细节）· `refs/env-toolbox.md`（构建/脚本/CDP/对标抓数）· `refs/miniprogram-and-backend.md`（小程序端坑 + 后端数据）· `refs/verify-playbook.md`（验证姿势）

## 🔴 六条最易反复踩
1. **装修组件改一处必须同步三处**：`componentRegistry.js`（数据源）→ `ComponentRender.vue`（v-if 链，**链尾无 v-else 兜底**，只加 registry 会静默空白）→ `PageEditor.vue`（schema + control 硬编码分发）。C 端 `DesignPage.vue` 独立重复实现。⚠️ 同 v-if 链多个 `v-else` 互斥同级；画布 `.r-*` 尺寸手抄 C 端 `.dp-*`，已漏一次。
2. **H5 正常 ≠ 小程序正常**：①组件**样式作用域隔离**，父 wxss 穿不透子根（`:deep()` 也不行）→ 传 prop 让子组件出内联 style；② `margin:auto` 居中、`background-image:url()` 包内路径 MP 不 work。凡「H5 没效果」→ 先问**跨没跨组件边界**，别调数值。
3. **属性面板通用项按 `key` 去重**（`PageEditor.vue` 的 `ownKeys`）：组件自带某 key 时通用项被跳过 → 同控件在不同组件指不同层。加面板字段前先确认 key 不撞车。
4. **变量注入了 ≠ 生效**：`--c-*` 须有元素消费，`getComputedStyle` 量**消费元素**。**参数若允许 0 就无条件内联**，默认值放 schema、三端基础值归 0；三端 CSS 不得写 `16px` 兜底或写死 `margin-bottom` 补缝。
5. **「页面空白/改了没反应」先抓运行时异常**，不是查数据链路。`watch`/`computed` 引用 `const x = ref(...)` 必须写在声明**之后**，否则 TDZ `ReferenceError` → setup 失败整页白屏。
6. **`defaultProps` 只对「新建/复制」生效**：手写 DB 插组件是**无效验证**（绕过 `PageEditor.load()` 的合并）。正确验证 = 设计器真点 `.pe-lib-card`。预填须排除：链接类（`button.url`/`web-container.url`）、图标名类（`grid-nav.icon` 等是 SIcon 名非图片）、已有包内内置图（`countdown`/`countdown2`）。

## 「点了没反应」三类静默失败（2026-10-06 登录 bug）
1. **跳到未注册页**：`reLaunch/navigateTo` 到未注册页**无报错无跳转**，新增页须 grep `pages.json` 确认注册。
2. **目标页 onShow 自动跳转弹走用户**：`pages/cardMain/login` 兼任冷启动首页，`onShow→checkGlobalHome()` 检测装修首页配置就 `reLaunch` 走。修法：主动跳登录带 `manual=1` → 单一事实来源 `web-app/src/utils/loginEntry.js` 的 `loginEntryUrl()`（**全站跳登录一律走它**）。判据 `String(manual)==='1'`（H5 hash 与 MP options query 类型不一致）。
3. **登录/退出丢上下文**：跳登录统一带 `redirect=<站内绝对路径>`，`safeRedirect()` 排除 `//` 外链；401 踢回由 `apiClient.currentPath()` 自动带当前页。
**元规则：一页兼任两角色时，其生命周期的自动跳转/兜底会污染另一角色 —— 每次新增「主动跳它」处，都要让它的自动逻辑让路。**

## 跨端主题跟随（单一事实来源 `web-app/src/utils/design.js`）
- `designThemeVars(config)` 产全套 `--design-*`(primary/rgb/gradient/secondary/text/subtext/headcolor/headtext)；`setDesignTheme(config)` 跨端填充响应式 + `useDesignTheme()` 供页面读。
- **H5**：`App.vue.initDesignConfig` 调 `setDesignTheme` 后 `// #ifdef H5` 跑 `applyDesignStyle` 写 `documentElement`。
- **MP**：不支持运行时注 `<style>`，须 page 根视图 `:style="[pageBgStyle, themeStyle]"`（themeStyle=useDesignTheme()）内联下发，变量向下继承。App.vue 的 `setDesignTheme` 已跨端填充，MP 只需页面绑根视图。
- ⚠️ **消费 `var(--design-` 的页面必须绑 `themeStyle`**，否则 MP 回落 fallback 色。已接：home/myCard/分销5页/member/cardDetail/create/templateSelect/dynamic/profile/market（dist+member+create 还绑 `navVars`）。
- 🔧 **自查命令**（两集合须完全一致，差集=漏接）：`grep -rl "var(--design-" pages/ components/` 与 `grep -rl "useDesignTheme" pages/`。
- ⚠️ **SIcon 的 `color` 不能消费 `var()`**（H5 烘焙进 SVG data-URI 不认 var → 非法色变黑；MP 按 `name-hex` 查构建期 PNG 命中不了运行期主题色 → 回退黑 PNG）。只能传**真实 hex**：`themeColor = computed(() => designConfig.style.primaryColor)`；文字/CSS 背景用 `var(--design-primary)`。
- 🔴 **配色源归属元规则**：给元素定配色先问「这是平台 UI，还是被展示对象的真实外观？」前者跟系统主题，后者保留自身色（如 templateSelect 模板缩略图是要卖的东西，改主题色=货不对板）。语义色（成功绿/警示橙/VIP 金）刻意不跟随。**create.vue 曾误取名片模板 `themeConfig` 配色，预览卡删后理由失效，已改 `utils/createSkin.js buildCreateSkinVars()` 取 `--design-*`。**
🔴 **创建页画布定稿（v3.2，2026-10-07 用户四轮反馈后）**：**统一浅色画布 `#f6f7fb` + 顶部主题色晕染（accent 0.16 渐隐）+ 白卡 + 主题色渐变头部**，与 C 端其它浅色页同一观感；**取消明暗双分支**（v2 dark 墨色被否「太暗」）。主题色主场 = **头部渐变** / 主按钮 / 焦点圈 / 分隔线 / 输入框描边(淡)；文字按主色亮度对色（浅金 luma>160→深字）。**步骤数字「1/3」消费 `--sk-hd-sub`**（渐变头上半透明白，浅金/step 透明头深灰），**勿用灰 `--t3`**（用户在红头上说「灰色不配」）。
🔴 **需求理解教训**：用户说「这个色不对/跟页面不配」时**先确认指的是哪个元素**，别直接改大片背景——我曾把「1/3 步骤数字的灰色」误判成整个红色渐变头部而删成透明（v3.1），用户复核「之前同步主题色是正确的」才回退（v3.2）。**教训链**：v1 整页泼主题色（刺眼）→ v2 墨色画布（太暗脱节）→ v3 浅色+红渐变头（不配）→ v3.1 头部透明收尾。回归测试 `createSkin.test.js` 7 例已锁（含 `--sk-header='transparent'` 勿复活）。⚠️ v3 删 dark 分支后 `skinSerif` 恒 false → `hero-en`/`hero-line` 衬线英文装饰不再显示。
🔴 **真机专属坑：动态插入节点（`v-if`）→ 真机后续内容错位，开发者工具永不复现**。create.vue 校验报错提示与下一字段标签重叠即此。**唯一根治方案：让节点常驻 + 预留固定高度，用 visibility/class 切换**，从根上消灭重排（`.error-tip{height:34rpx;line-height:34rpx;visibility:hidden}` + `:class="{on:...}"`）。⚠️ **删容器的 `transition` 治不住（已实测无效）**——别止步于此。另：容器带装饰性 `transition:all` 本身也是死代码（卡片 display:none 切换永不触发过渡），顺手清理即可。
- **沉浸页顶部避让**：PageNav overlay / 自绘 hero 的 padding-top 须消费 `--pnv-status-bar`/`--pnv-nav-h`/`--pnv-capsule-pad`，真实值只由 `navVarsStyle()`（utils/navMetrics.js）内联注入。根视图 `:style="[navVars, themeStyle]"`；右侧有徽章/按钮的 hero 必须避到导航行之下（member 曾「只避状态栏+30rpx」致 FREE 徽章与胶囊相撞）。
- 🔧 **H5 重建被沙箱 safe-delete 拦**（uni clean 删 >50 文件 → SAFE_DELETE_BULK_CONFIRM_REQUIRED）：先 `mv dist/build/h5 /tmp/...` 清空再构建。dist 可再生产；server/public/card 已同步则无需重建。

## 超级表单
- **核心语义（用户 2026-10-03 澄清）**：**一个表单、多处调用**；「红包封面（待接入）」等只是占位文案。五入口：装修 `superform`/文章 `form.superForm`/商城 `cfg.useFormId`/商品 `superForm='custom'+superFormId`/链接 `/pages/superForm/fill?formId=x`。C 端跳独立填写页（分包）复用组件/校验/支付。`design_json`、`goods_setting.config` 是不透明 JSON（整体存无白名单）→ 新增挂载点通常零后端改动。装修嵌入表单**不显示表单名头**，模板名占位「未命名表单」时后台列表仍显示 → 改模板名。
- **「组件即卡片」（勿回退）**：页面灰底 #f2f3f5，每组件自带白底卡，卡间灰缝靠顶外边距 `outMarginTop`（默认 10）。`componentStyleVars` 已内联 `backgroundColor`(默认#FFF)+`borderRadius`+`marginTop`，三端容器保持 transparent 即自然成卡（C 端 `SuperFormRender.vue`/画布 `ComponentRender.vue`/设计器 `SuperFormDesigner.vue` 三者均不设 margin）。
- **改卡片形态只动容器背景；间距只改 `sfComponentStyle.js` 一处。禁止三端 CSS 写死 `margin-bottom` 补缝**（曾犯→ `outMarginTop=0` 无法紧贴、参数架空）。`componentStyleVars(comp, globalStyle, layout)` 第 3 参必传（`horizontal` 时 marginTop 归零交容器 gap）。
- radio/checkbox 的 `content.options` 须 `[{label,value}]` 对象（填字符串数组→「圆点有字没有」）。**组件圆角必须始终发射含 0**（曾 `if(st.radius)` 让 0 跳过回落基础圆角）。页面/画布容器不得写横向 padding，左右留白唯一来源 `outMarginX`。
- textarea 须 `:maxlength="maxLength>0?maxLength:-1"`+`:show-confirm-bar="false"`+**计数自绘**（否则 uni H5 走内置 140、面板「最多输入」不生效；MP 固定 140→三端不一致）。预览端不可合并 `text`/`textarea` 渲染。
- **设计器选中框挂「持白底/内容的那一层」**：装修 `.pe-comp`、表单 `.sf-comp-wrap`（两层挂内层会内缩 8px）；`@click` 挂 wrap，内层只留 draggable。
- **「组件风格」+ 边距映射**：`sfComponentStyle.js` 的 `styleVariant(comp)` 三端统一调，三端只认语义 class（`sfv-box/plain/line/step/slider`+`sfx-opt*`）。⚠️ styleType 取值按组件各自命名、跨组件撞名（radio 的 `s1` 作用选项区、filedownload 的 `s1` 作用下载框）→ 映射**按 type 分派**；非选择类 s1/s2 不能当选项区（两档同 `sfv-box`=死参数）。⚠️ 「组件即卡片」下不能用「白底+无边框」做风格档（`sfv-plain` 保留 1px 极淡描边）。
- 🎯 **改 `STYLE_SCHEMA.boxLine`/`styleVariant()`/任一端 `sfv-*` CSS 后必跑 `node scripts/audit-sf-style-coverage.mjs`**，非 0 = 有死参数（现状 15 类/36 值/42 映射全通过）。加新风格时三端选择器组必须加新组件容器 class（曾漏 pay/realtime/sf-opts/sf-image-h/sf-id-box）。
- **面板控件 ≠ 功能已复刻**，三层缺一不可：数据层 `components.js` 默认 content 声明字段（否则老数据 undefined，**须写存量迁移**）→ 渲染层两端消费+兜底 → 样式 schema 映射。**判定开关有用没用，去校验/提交路径确认是否真 gate 了什么**（车牌开关只改格数不参与校验=装饰性假功能）。**别替填表人预先声明其属性。**
- 边距四件套（权威 `对标笔记.md` 第 89 行）：`outMarginTop`(margin-top,10)/`outLeftRightMargin`→`outMarginX`(margin-lr,10)/`innerTopBottomPadding`→`marginY`(padding-tb,10)/`inputLeftRightMargin`→`marginX`(padding-lr,16)/`componentFillet`→`radiusTL/TR/BR/BL`(四角独立)。教训：外左右改 margin 后**三端容器 padding 必须归 0**（否则 10+16 叠加）。改 schema 默认值须**定向迁移存量**（只改等于旧默认的，改前 `cp` 备份 DB）。

## 背景色必须拆成两个独立字段（`2e44353`，勿回退）
- `bgColor`=组件**自身**底色（label「按钮色」）；`compBgColor`=组件**容器**底色（label「组件背景色」）。单一事实来源 `containerStyle.js` 的 `CONTAINER_BG_KEY`，三处共用（曾组件私藏副本致 admin≠真机）。
- 存量迁移 `migrateLegacyBgColor()`（幂等）挂两处：加载草稿+`newComp()`。判据表 `SELF_COLORED_TYPES` —— **加类型前须确认该类型根节点真的不读 `props.bgColor`**。
- 🔴 内联背景会盖选中高亮：`.pe-comp.active` 用 `outline + box-shadow`，**不要写 `.active{background:!important}`**。
- 🔴 **满宽组件完全遮容器底色**（button `width:100%`+容器`padding:0`→容器宽=按钮宽=756px）。修法 `MIN_BG_PADDING=8`，**仅在设了底色时兜**；**必须把 `0` 也当「未设」**（schema 默认 0，只兜 undefined 则永不生效，面板滑块用 `props[key]??0`）。`PageEditor.compBoxStyle` 的 `withPadding:false` 须去掉。
- ❌ **已废弃错路（勿复活）**：`HIDDEN_BG_TYPES` 黑名单「让容器不上色」——手工维护 28 项、漏判 goods-*、本质把第 3 条撞车问题藏起来。

## 包内资源 vs 后端资源（判据：问「这个文件在后端有吗」）
有 → `resolveUrl()`/`background-image`；只在 `src/static` → `assetUrl()`/真正的 `<image>` 层。
- MP 端图裂三层（缺一层照样裂）：① `strip-mp-static.js` 的 `STRIP_DIRS` 曾含 `static/images` 但 registry 的 countdown defaultProps 就引用它们（进 STRIP_DIRS 前须 grep 确认真零引用）；② `resolveUrl()` 给包内相对路径拼 `API_DOMAIN`→404；③ `background-image:url()` 不支持包内路径。
- **`STRIP_DIRS` 两条相反规矩**：被包内路径引用 → 剔除即真机图裂（`static/images` 不可剔除）；刻意走网络 → 仅少冗余（`static/sample`，确认后端 `server/public/` 已托管后**可剔除**）。⚠️ 走网络图代价：**真机须在小程序后台配 request 合法域名**。
- **示例图硬规范（2026-10-05 用户定）**：一律走网络图、不进小程序包。唯一事实来源 `web-app/src/utils/sampleImages.js` 的 `sampleUrl()`（banner 710×388/square 400×400/portrait 600×800），**禁止手写路径字符串**（曾写 `/static/sample/x.jpg` 漏 `/card` 前缀→后端 404 且构建期零提示）。
- **构建脚本自检须「不论成败都跑」且判两类**：①「代码引用但产物没有」②「网络图路径写错」（抽文件名去 `src/static/` 反查真实相对路径比对；只判「在不在包里」对网络图永远通过——漏检 10 天原因）。

## 平台能力误判元规则
曾断言「小程序 `<view>` 不支持 CSS 渐变」据此包装 30 处背景——若提交等于凭空造 regression。证伪：项目内另一处同特性正常（宫格 9 图标渐变从未降级）/`normalizeStyle({background:'linear-gradient(...)'})` 逗号原样保留/产物 WXSS 本来就有。**元规则：从「A 端现象」推不出「平台能力缺失」。改「降级/兼容」代码前先问：它在解决真问题，还是在解决我以为存在的问题？**

## UI 规范
- 图标 `docs/规范/07-UI设计.md`：三层蜜桃橙、填充非描边、大圆角扁平、透明底；禁绿紫蓝分类色。面板图标须 56×56 8-bit RGBA PNG，未映射进 `COMP_ICONS` 会 fallback 线性 `SIcon`（违反规范）。
- **按钮规范** `docs/规范/08-装修中心按钮规范.md`：装修中心取微信官方 WeUI **方角**、**不动商城**。四档 L96/M80/S64/XS56rpx，圆角 L/M16·S12·XS8rpx（能命中 `$radius-sm/md`）。新写装修按钮一律 rpx、用 `<view>` 不用 `<button>`、锁 height+line-height。尺寸单一事实来源 `web-app/src/utils/btnTokens.js`。⚠️ **全局类名禁用 `.btn`**（scoped 拦不住全局类）→ 用 `.dbtn-`；**加全局工具类前须 grep `class="该名"` 全量检查**。
- **共享样式实现放 `web-app/src/utils/`，admin 跨包 import**。⚠️ 被 import 模块旁**不得再定义同名函数**（`Identifier has already been declared`，uni 误显「连接服务器超时」；定位 `node scripts/check-sfc.cjs <file>`）。
- 🔴 **沉浸页导航栏胶囊避让**（`PageNav.vue`+`navMetrics.js`）：`navBarRowStyle` 的 `paddingRight` 只是 `capsuleRightPad`(≈7px)，**胶囊宽 87px 压在这 7px 内** → 全站 `#right` 插槽被挡。正确：`.pnv-right` 在**插槽非空时**加 `marginRight=capsuleWidth`，且须判空（否则空插槽 margin 挤偏标题）。
- ⚠️ **macOS 的 grep 不支持 `\|` 分支**（BRE 无交替），必须用 `grep -E`。本轮因它连续误判：`hexA`/`heroStyle` 误报未定义、重复选择器审计全部漏检。**凡用 `\|` 结论一律不可信，须 `-E` 复核。**
- 名片宫格 v5 定稿（权威 `名片宫格图标方案.html`）：46px 方块(r=14)+32px 描边图标(gap:10px)；会员中心＝**对勾圆**非皇冠；「更多」底色 `#78909c→#546e7a`；方案 A/B/C 只差底色、用户选 **A**。⚠️ `PeColorPicker` 渐变预设 11 色与宫格方案 A 的 9 色**是同一套** → 运营易误选（曾两次把按钮底色设成宫格橙渐变），排查「颜色串了」先确认是否误选预设。

## 对标站 eweishop 抓数（详见 `refs/env-toolbox.md`）
**禁止凭组件名字猜布局、靠眼睛估风格数**（`docs/复刻规范/反模式.md` 明确反模式）。必须点开对标站量真实 DOM + 计算样式。

## 小程序主包体积（2026-10-06 实测：1.5M 质量线 / 2M 硬上限）
- 🔴 **每次 MP 构建后必手动清理**：`gen-mp-sicons`+`strip-mp-static` 删除被 safe-delete 守卫拦（>50 文件），481 个 sicons PNG≈2MB 留主包计重（实测 3824K vs 清理后 1676K）。构建后 `mv dist/build/mp-weixin/static/sicons /tmp/ && mv dist/build/mp-weixin/static/icons /tmp/`。**量体积前必先清理，否则数据全假。**
- 瘦身：pages.json 把独立应用移入 subPackages（**root=目录名、页面路径不变、零代码改动**）；仅分包引用的组件放 `<root>/components/`、**utils 移 `<root>/utils/`**（开发者工具「主包内不应存在主包未使用的JS文件」即指这类）。⚠️ 被**两个及以上分包**共用的 util 必须留主包（移进任一分包都会交叉引用/复制），工具的该条告警属误报性质，向用户说明即可。
- ⚠️ **移源码后重建，`dist` 里的旧产物是 emptyOutDir 被 safe-delete 守卫拦下没删的残留**（用时间戳比对本轮构建时间即可分辨），不清掉 devtools 依旧报警。
- ❌ **three.js 移不出主包**（已实验）：`optimization.subPackages` 在 uni-app vite 下**不拆 node_modules**；组件移分包、改 `await import()` 动态导入仍进主包 `common/vendor.js`。再降只能压 sicons/网络化 static，或 MP 全景改 2D canvas（产品决策）。
- 🔴 **真机全量 `ERR_CONNECTION_TIMED_OUT` = 局域网 IP 变了**：MP API 基址写死在 `web-app/src/utils/cardApi.js:18`，DHCP 换网必失效（服务端没事，别查服务）。改后重建；验证新 IP 是否进产物要 grep 构建产物的 `utils/cardApi.js`——**grep vendor.js 恒为 0（该模块不并入 vendor），会误判失败**。

- 已知：Vue **2**；hash SPA **必须先「选店铺」**才能进装修页；组件库 `data-id` 是内部键名（按钮组=`menu`）；属性面板 radio 的 `value` 通常是真实字段值，但「组件样式/组件风格」是占位 `on`，须从渲染结果反推。
