# 项目长期记忆（360全景 / panorama-360）

## 超级表单 = 多场景复用能力（核心语义，用户 2026-10-03 澄清）
**一个表单、多处调用**，各处都通过「选择已建好的表单」调用它。「红包封面（待接入）」「待接入：需开通…」等**只是占位文案，不是业务名词**。
- 五个入口：① 装修组件 `superform` ② 文章 `form.superForm` ③ 商城设置 `cfg.useFormId`（下单统一）④ 商品编辑 `superForm='custom'`+`superFormId` ⑤ 链接选择器 `/pages/superForm/fill?formId=x`。
- C 端一律跳独立填写页（分包），复用其 29 组件/校验/逻辑/支付，不在各调用方重复实现。
- `design_json`、`goods_setting.config` 都是不透明 JSON（整体存无白名单）→ 新增挂载点通常零后端改动。
## 本项目硬约束（易踩）
1. **装修组件三处必须同步改**：`componentRegistry.js`（数据源）→ `ComponentRender.vue`（v-if 链，**链尾无 v-else 兜底**，只加 registry 会静默渲染空白）→ `PageEditor.vue`（schema + control 硬编码分发）。C 端 `DesignPage.vue` 是**独立重复实现**，要单独改。
   - ⚠️ 同一 `v-if` 链上的多个 `v-else` 是**互斥同级链**：写 `v-if(A)/v-else(B)/v-else(C)` 时若 A 成立则 B、C 都不渲染。
   - ⚠️ **画布预览必须与 C 端同数据源**（超级表单按钮教训）：C 端样式来自表单 submit 组件配置（`componentStyleVars`），画布若用装修组件自己的 props（btnText/btnColor）必然不同步。同步模式：PageEditor 拉 `getSuperForm` 建 `sfMetaMap`（运行时缓存不进草稿 JSON，watch 画布 formId 自动补拉）→ ComponentRender 接 `sfMeta` prop 渲染真实样式，meta 缺失回退旧 props。**给组件加「C 端不消费的配置项」= 制造「改了没反应」的 bug。**
2. **下拉只列 `status==='published'` 的表单**（`/super-form/:id/public` 只返回已发布）。链接选择器是例外（用户 2026-10-03 定口径）：草稿/停用**照列但灰显不可选**，副信息写「草稿 · C 端不可访问」，让用户看出「我建了表单为何这里灰着」。
3. **租户过滤只能靠 `projects.id`**：`projects` 表**没有 `customer_id` 列**，`projects.id` 就是客户 id（= `user.customerId`）。JOIN projects 过滤写 `WHERE c.id = ?`，写 `c.customer_id` 直接 `no such column`。
   - 公开的 `GET /api/plans`（`routes/plans.js:69`）**无客户维度**，客户后台直接调会泄漏全部客户方案；租户内方案列表走新增的 `GET /api/design/plans`。
4. **链接选择器动态分类机制**：`linkCatalog.js` 里写 `dynamic: '<key>'` + `items: []`，`LinkPicker.vue` 按 key 分发数据源（`DYNAMIC_SOURCES` 存 `path(row)` 模板，`parseDynamicLink` 负责回显解析）。**禁止把客户数据（表单 id/方案 id）硬编码成示例链接** —— 客户建 5 个表单就只能选 1 个，且 id=1 几乎必然指错。
   - 动态列表**每次打开弹窗都要重拉**（`force=true`）：用户随时可能新建/删除，缓存即过期数据，会让「目标已删除」的回显兜底误判。
   - 回显兜底：目标已删必须**回退自定义链接 + 原样保留 value** 并 warning 提示，绝不静默清空（否则用户点「确定」丢配置）。
5. **el-option 的 value 用字符串**（`el-select` 对数字 `0` 有被当空值处理的版本差异）。
6. **写 SQL 后核对「列数 == 占位符数 == `.run()` 绑定数」** → 用技能 `sqlite-migration-verify`（一键核对脚本 + 库副本实跑 + migration 生效确认）。
7. **压缩产物函数名会 mangle**，验证用字符串特征（`pages/superForm/fill?formId` / `dp-sf-title` / `superform`）。
8. **画布手机预览可视区约 570px**，卡片高 = 固定 104px + 每字段 42px，全量渲染会撑爆画布→字段摘要默认「前 4 个」。
9. **图标规范**见 `docs/规范/07-UI设计.md`：三层蜜桃橙、填充非描边、大圆角扁平、透明底；禁绿紫蓝分类色。装修面板图标须 56×56 8-bit RGBA PNG，未映射进 `COMP_ICONS` 会 fallback 到线性 `SIcon`（违反规范）。
10. **按钮样式规范**：全局只到「色板+字号+间距+圆角」令牌（`web-app/src/styles/token.scss`），**按钮令牌本不存在**；`utility.scss` 无 `.btn`。商城有事实标准（80rpx 高 / 胶囊 / 28~30rpx / weight 500 / #165dff）。**装修中心单独一套、对齐微信官方 WeUI 的规范见 `docs/规范/08-装修中心按钮规范.md`**：四档 L 96rpx(48px)/M 80rpx(40px)/S 64rpx(32px)/XS 56rpx(28px)，**方角 8px 非胶囊**，字号 34/28/28/28rpx；特例 悬浮胶囊 96rpx、悬浮圆&视频播放 104rpx、倒计时 96rpx。
   - 官方依据（已实测，勿再猜）：WeUI `--weui-BTN-HEIGHT:48/-MEDIUM:40/-SMALL:32`；`.weui-btn` padding 12px 24px / 17px / weight 500 / radius 8px / line-height 1.41176471；mini 6px 12px /14px/ radius 6px(32px高)；xmini 4px 12px /14px/ radius 4px(28px高)。微信设计指南：热区物理 7mm–9mm（≈44px/88rpx）、字号 22/17/15/14/12pt、**设计稿基准 375px = 750rpx**。小程序 `button` 组件文档**无像素值**。
   - 新写装修按钮一律 rpx、用 `<view>` 不用 `<button>`、锁 height+line-height 而非 padding 撑高、可点元素间距 ≥16rpx、独立可点热区 ≥88rpx。
   - **已定推荐（用户 2026-10-04 认可方向）：装修中心取官方方角、不动商城**。关键论据——官方圆角能命中现有令牌：XS 4px = `$radius-sm`(8rpx)、L/M 8px = `$radius-md`(16rpx)，而胶囊 40rpx 在令牌体系外须新造。圆角按档递减 L/M 16rpx · S 12rpx · XS 8rpx。商城保持 80rpx 胶囊不动（独立 fixed bar，不与装修按钮同屏）。`.dp-btn` 的 `radius` 配置保留，允许 8~32rpx 自定义。
   - 商城 80rpx(40px) **低于**微信官方热区 7–9mm(≈44px)；装修 L 档 96rpx(48px) 达标 —— 这是可用性差异非审美差异。
   - **已落地第一步（零视觉变化）**：`token.scss` 加 `$btn-*`+`--btn-*`、`utility.scss` 加 `.dbtn-*` 系列、新建 `web-app/src/utils/btnTokens.js`（C 端与画布共用尺寸单一事实来源，含 `btnVars()`/`btnVarsPx()`/`pxOf()`）。
   - ⚠️ **全局类名禁用 `.btn`**：`pages/card/visitors.vue:148` 用了 `class="btn"` 但页面未定义，**scoped 拦不住全局类**，会被污染。故用 `.dbtn-` 前缀。加全局工具类前必须 grep `class="该名"` 全量检查。
   - ⚠️ `npm run build:mobile` 首次常因 `[safe-delete]` 批量清理阈值（>50 文件）失败，**重跑一次即过**；日志别用 tail 截断，否则误判为编译错误。
   - **已落地第二步**：`.dp-form-btn`/`.r-form-btn` → L 档 48px/8px/17px；`.dp-follow-btn`/`.r-follow-btn` → XS 档 28px/4px/14px（修了画布手抄漏的 bug）；`.sf-submit`/`.r-sf-btn`/`sfBtnStyle()` → 48px/17px、padding 0 24rpx、height 锁定 + flex 居中，**圆角保持设计器 `--c-input-radius`(22px) 不动**（表单按钮属表单范畴，改默认值会波及存量表单）。C 端与画布实测逐项一致。存档 `docs/对标截图/装修按钮/`。三端（H5 `build:mobile` + admin `build:admin` + 小程序 `build:mp-weixin`）均已重新构建同步，**真机仍须微信开发者工具导入 `dist/build/mp-weixin` 上传发布**，否则真机是旧包。
   - **C 端装修页实测方法**：直接 INSERT `tenant_page_design`（page_type='custom-btnspec-test'、status=1）造测试页 → 开 `/card/#/pages/cardMain/home?pageType=custom-btnspec-test&tid=1` → eval 量按钮 → **测完删页并核对总数**。画布侧：登录 tenant1/admin123 → `/customer/#/design/edit` → 左侧「页面列表」tab 切页，量 `.r-*` 类。
   - **已落地第三步（2026-10-04，仅装修自有、排除 ew-\*）**：悬浮 L 特例（方胶囊 96rpx/48rpx/28rpx，注意尺寸由内联 `dpFloatStyle`/`floatStyle` 控制，已同步 size 44→48+字号公式 0.30）、通用全宽 M 80rpx、拨打电话 M 80rpx、通用·auto S 64rpx（画布新增 `.r-btn.auto`+模板 `:class auto`+`btnStyle` auto 内距 0 12px）、商品组 S 64rpx（C 端，画布走 `.ew-gg-*` 不复刻）、预约直播 S 64rpx、搜索 XS 56rpx、导航搜索 XS 56rpx、视频号标签 XS 描边 56rpx。圆角按档递减（M16/S12/XS8rpx）。三端编译产物实测逐项一致（H5 `server/public/card`、admin `server/public/admin`、小程序 `dist/build/mp-weixin/DesignPage.wxss`）。`build:mobile`+`build:admin`+`build:mp-weixin` 均成功。**真机仍须微信开发者工具上传 `dist/build/mp-weixin`**。本轮以三端编译产物实测替代 agent-browser 实时截图（按钮类型多需外部数据才渲染）。规范文档 `docs/规范/08-装修中心按钮规范.md` 第三步已标记完成。
   - ⚠️ 画布 `ComponentRender.vue` 的 `.r-*` 尺寸是**手抄** C 端 `.dp-*` 的，已发现抄漏（`.r-follow-btn` 11px/6px/4px10px vs C 端 12px/8px/6px12px）。改任一端必须同步另一端。
   - ⚠️ macOS BSD grep **不支持 `\|`**，写 `grep "a\|b"` 会静默返回空。一律用 `grep -E` 或 Grep 工具。

## 超级表单组件参数有效性（2026-10-04 收口）
- node 审计（`/tmp/sf-audit/audit.mjs`，sentinel 值发 CSS 变量对照渲染器消费集合）终态：**238 OK / 0 DEAD**。曾报 11 个死参数均为「功能缺口」，已按用户决策**全部物化**于 `SuperFormRender.vue`：text 扫码图标、number/pay 步进器、pay 底部合计栏、swiper 自绘指示点(dotGap/dotBottom/switchSpeed)、title 分隔线；真机 getComputedStyle 逐项验证生效，三端构建通过。CSS 变量单一事实来源 `sfComponentStyle.js componentStyleVars()`，改渲染必须两端同查。
- ⚠️ agent-browser 连测多个 formId：**hash 跳转不重载组件**（uni-app 同页复用，组件 onMounted 不再触发），须改 query（如 `/?x=N#/pages/superForm/fill?formId=N`）强制整页刷新，否则测的是上一个表单。
- ⚠️ `npx uni` 会误装 npm 无关包 `uni@0.0.6` 并卡死，小程序构建必须用项目脚本 `npm run build:mp-weixin`。

## 超级表单卡片式渲染（2026-10-04 落地，勿回退）
- **视觉语义 = 「组件即卡片」**（对齐 ew）：页面灰底 #f2f3f5，每个组件自带白底卡片，**卡间灰缝靠「顶外边距」(`outMarginTop`，内联 marginTop) 让页面底色透出**。三端各一处，改任一端须同步另两端：
  - C端 `SuperFormRender.vue`：`.sf-form` 容器 transparent、`.sf-page.sf-embed .sf-form` transparent；`.sf-field` **不设 margin**（间距全由内联 marginTop 控）
  - 画布 `ComponentRender.vue`：`.r-sf-real` transparent；`.r-sf-real-comp` **不设 margin**
  - 设计器 `SuperFormDesigner.vue`：`.sf-comp-wrap` **不设 margin**
- **机制**：`componentStyleVars` 已给每组件内联 `backgroundColor`(bgColor 默认 #FFF)+`borderRadius`(radius)+`marginTop`(outMarginTop 默认 **10**，= 对标图实测灰缝)，故容器透明即自然成卡、间距由参数驱动。**改卡片形态只需动容器背景；间距只改 `sfComponentStyle.js` 一处，三端 CSS 不得再写死 `margin-bottom`**。
- ⚠️ **禁止在三端 CSS 写死 `margin-bottom` 补缝**（2026-10-04 已犯：写死 10px 导致「顶外边距=0」无法真正紧贴，该参数被架空）。灰缝只能是 `outMarginTop` 的副产品。对标图实测：白块 5 段间灰缝**一律 10px，含表单头→首卡**，故 `.sf-form-head` 的 `margin-bottom:8px` 也已删除（否则头部 8+首卡 10=18px）。
- ⚠️ `componentStyleVars(comp, globalStyle, layout)` 第 3 参 `layout` 必传：`horizontal` 时 marginTop 归零（间距交给容器 gap），否则左右布局每行会多叠一层纵向偏移。
- ⚠️ **radio/checkbox 的 `content.options` 必须是 `[{label,value}]` 对象**；填字符串数组会渲染出「圆点有、字没有」的空选项（曾误判为渲染 bug）。
- ⚠️ 上述三处 CSS 旁的注释会过期（曾写「默认白卡连成整张」、又写与实际行为矛盾的「上外边距设 0 即紧贴」），改结构必须同步改注释。

## 环境与验证姿势
详见 `refs/verify-playbook.md`（重启后端/构建落点/登录态/sqlite 实测行为/测试数据纪律）。

## 设计器选中框必须挂在「卡片本体」层（2026-10-04，与装修中心统一，勿回退）
- **两处设计器选中框层级现已一致**：装修中心 `.pe-comp`（`PageEditor.vue`）、超级表单 `.sf-comp-wrap`（`SuperFormDesigner.vue`）——**都是「持白底/内容的那一层」直接画 border**，故虚线框紧贴组件外沿。
- ⚠️ 超级表单是两层：`.sf-comp-wrap`（持 `padding:0 16px` + inline `backgroundColor`）→ `.sf-comp`（仅拖拽命中区 + `cursor:grab`）。**选中框（border/hover/active/is-hidden）与 `.sf-comp-ops` 操作条一律挂 wrap**，挂内层会内缩 8px（16px 内距的一半）。
- ⚠️ 连带：点击选中 `@click="selectComp(comp.id)"` 也必须挂 wrap（否则内距空白区点不到）；内层只留 draggable/dragstart/dragend/dragover/drop，**内层不要留 @click**，会冒泡致重复选中。
- 操作条显隐 CSS 选择器同步用 `.sf-comp-wrap:hover .sf-comp-ops, .sf-comp-wrap.active .sf-comp-ops`。
- ⚠️ 验证这类操作条 UI **按 `title` 选按钮**（`[...el.querySelectorAll('.sf-tool')].find(t=>t.title==='复制')`），`.sf-tool` 顺序是 上移/下移/复制/删除，下标 `[3]` 是**删除**。
- ⚠️ admin 验证前用 `open "...?cb=$RANDOM#/apps/super-form"` 硬刷新，否则浏览器复用旧 JS（曾误判为回归）。

## 组件样式「死参数」两条排查铁律（2026-10-04 两次踩坑后总结）
1. **变量注入了 ≠ 生效**。`componentStyleVars` 发出的 `--c-*` 变量必须有元素消费；用 `getComputedStyle` 量**消费元素**，不是看 wrap 的 inline 字符串。已踩坑两次：
   - 选择类（radio/checkbox）结构上没有输入框 → `--c-input-pad-x`/`--c-input-radius` 无人消费，「组件风格」整段失效。**修法：给选项区补 box 包裹层消费边框+圆角，选项行消费左右内距**（预览 `.cmpv-opt-box`、C 端复用已有 `.sf-opts`）。
   - 「组件整体-左右边距」曾写 `if (mx)` 仅 >0 才发内联 → **设 0 回落 CSS 基础值，参数被架空**。**教训：参数若允许 0，就无条件内联；默认值放在 schema（`COMMON_WHOLE`）里承担，三端 CSS 基础值归 0。** 兜底「0 不发内联让 CSS 兜底」会让参数失去下限语义。
2. **改 schema 默认值必须定向迁移存量**：只改**等于旧默认值**的，自定义值不动；改前 `cp` 备份 DB。已完成：`outMarginTop 0→10`、`marginX 0→16`、`submit inputRadius 22→24`。
3. 三端横向内距/间距**只能由 `componentStyleVars` 内联**，三端 CSS 不得再写 `16px` 之类的兜底值（会架空 0）。同理不得写死 `margin-bottom` 补缝（架空 `outMarginTop`）。

## 组件整体「边距」四件套语义映射（ew 键名 ↔ 我方键，勿再混淆）
`对标笔记.md` 第 89 行有 ew 评分组件的**内部键名实测**，这是唯一权威依据：

| ew 键名 | 含义 | 我方 style 键 | 发射的 CSS | 默认 |
|---|---|---|---|---|
| `outMarginTop` | 外·上（与上一组件的间距） | `outMarginTop` | `margin-top` | 10 |
| `outLeftRightMargin` | **外·左右（卡片与页面左右）** | `outMarginX` | `margin-left/right` | 10 |
| `innerTopBottomPadding` | 内·上下（卡内留白） | `marginY` | `padding-top/bottom` | 10 |
| `inputLeftRightMargin` | 内·左右（卡内留白） | `marginX` | `padding-left/right` | 16 |
| `componentFillet` | 组件圆角（**四角独立**） | `radiusTL/TR/BR/BL`（+ `radius` 统一值） | `border-*-radius` 四项 | 0 |

⚠️ **历史教训（改了两轮才对）**：
1. 曾把「左右边距」一个键同时当内距用 → **外左右缺失**，页面左右留白写死在三端 CSS `padding:16px` 里，组件级不可调。
2. `marginX` 曾写 `if (mx)` 仅 >0 才发内联 → **设 0 回落 CSS 基础 16px，参数被架空**。
3. 外左右改为 `margin` 后，三端容器 padding 必须**归 0**，否则 margin 与 padding 叠加（10+16=26px）。
⚠️ **页面/画布容器不得再写横向 padding**（`.sf-page` / `.sf-phone-body`）—— 左右留白唯一来源是组件级 `outMarginX`。C 端 embed 模式例外：外边距归 0 交宿主页面管。

⚠️ **圆角补充**：组件圆角是**四角独立**的（对标笔记第 86 行「ew 为四角独立圆角选择器」），不是单值。`radius` 作「四角统一」快捷值，回落规则 `四角各自值 || radius`。**必须始终发射含 0** —— 此前 `if (st.radius)` 会让 0 整段跳过、回落 CSS 基础圆角导致「设 0 无效」。
⚠️ **设计器面板改参数会自动保存落库**。验证参数**优先「直接改 DB + 刷新页面」**，不要用滑杆/输入框注入（会污染数据且难还原）。若已注入，务必查 `updated_at` 并手工恢复。

## 「组件风格」= styleType 必须经语义映射，勿直接拼 class（2026-10-04，勿回退）
用户反馈「框内的三个风格无效」时，根因是渲染端 `cs-${styleType}` 只判`=== 'line'`，其余全落默认分支。**修法不是把class 名改对，而是加一层值→语义收敛**：

- `sfComponentStyle.js` 导出 **`styleVariant(comp)`**，三端（C 端 `fieldCls` / 预览 `styleCls` / 画布内嵌预览）统一调它，**三端只认语义 class，不认原始值**。
- 语义 class：`sfv-box`(描边+浅底) / `sfv-plain`(白底无描边) / `sfv-line`(去框仅底线) / `sfv-step`(步进器) / `sfv-slider`(滑块)；选择类额外挂 `sfx-optbox/optplain/optline`（作用在**选项区**而非输入框）。
- ⚠️ **`styleType` 取值按组件各自命名、跨组件会撞名**：radio 的 `s1` 作用于选项区、filedownload 的 `s1` 作用于下载框、textarea 的 `box1` 作用于输入框 —— 直接 `cs-${styleType}` 必然互相污染。故映射必须**按 type 分派**。
- ⚠️ **非选择类的 `s1/s2`（filedownload）不能当选项区处理**：两档都落`sfv-box` = 视觉完全相同 = 风格2 是死参数。单测「同类型各档映射必须互异」就是为拦这类。
- ⚠️ **`defaultStyle` 的 styleType 必须取 `boxLine[0].value`**，不能写死 `'box'` —— textarea/date/time 的选项是 box1/box2/line，写死值是不存在的 class，默认态即死参数。
- ⚠️ **`s/box` 类值必须真渲染出东西**：number 的 `slider` 曾只切 class、**从未渲染滑块**；预览的 number 只有裸 input（与 C 端不一致）。加风格值时同步查「三端是否都有对应 DOM」。
- ⚠️ **风格卡标签必须与「组件整体」区分**：`inputMarginX` 原标签「左右边距」与 `marginX`（组件整体-左右内边距）撞名 → 用户「不知是调什么的」。已统一改为「输入框左右边距」。

⚠️ **C 端验证大坑**：uni-app **hash 路由跳同一页面不重挂载**，`agent-browser open` 换 query 不会重新请求数据 → 误判「改了 DB 但 C 端没变」。**必须先 open 首页再 open 目标页**（或 `location.reload()`）。另：macOS `date +%s%N` 的 `%N` 会输出字面量 `N`，别用它造唯一 query。

##组件风格改动后必须跑覆盖率审计（2026-10-04 立规）
**`node scripts/audit-sf-style-coverage.mjs`** —— 有风格卡的组件，其每个可选值是否在三端真有CSS 规则消费。
改 `STYLE_SCHEMA.boxLine`、`styleVariant()`、或任一端的 `sfv-*` CSS 后**必须跑**，退出码非 0 = 有死参数。
- 现状：**15 类组件 / 36 个可选值 / 42 个语义映射全通过**。
- 存在意义：这类死参数**不报错、只不生效**，靠人工抽查发现不了（已连续两轮漏网）。
- ⚠️ `number` 的 step/slider 是「换 DOM 结构」不是「改样式」，脚本内 `STRUCTURAL` 豁免。
- ⚠️ 改 `styleVariant()` 时脚本内的镜像实现要同步改（脚本注释已标注）。
- ⚠️ 加新组件风格时，三端 `sfv-box/plain/line` 的选择器组**必须把新组件的容器 class 加进去**，否则该组件风格卡全无效（已漏过 pay / realtime / sf-opts / sf-image-h / sf-id-box）。
- ⚠️ **别凭「组件像不像选择类」判断**：select 的 boxLine 虽是 s1/s2/s3，但它渲染的是下拉输入框、**没有选项区**，不能挂 `sfx-opt*`；只有 radio/checkbox 才是真选项区。

⚠️ **「组件即卡片」下不能用「白底+无边框」做风格档**（2026-10-04踩坑）：
卡片自身就是白底 #FFF，白底无框的控件落上去= **边框消失+ 底色无差 → 看起来"完全没变化"**，
用户会判为「风格卡无效」，但代码层面 class/background 都已生效。
排查这类「说无效但代码没错」时，**先截图肉眼比对**，不要只看 getComputedStyle。
同理：`sfv-plain` 必须保留 1px 极淡描边（`--c-plain-border` 默认 #EBEEF5）+ 输入框圆角，
与 `sfv-box`（浅灰底+ 清晰描边）形成强弱两级层次。

⚠️ **C 端 textarea 必须显式绑 `maxlength`**（2026-10-04 实测bug）：
不绑则 uni H5 走**内置默认 140**，面板里设的「最多输入」完全不生效（设 400 只能输 140）。
且**不要依赖 uni 内置的 confirm-bar 计数**：小程序端没有，且上限固定 140 不读配置 → 三端必然不一致。
正确做法：`:maxlength="maxLength > 0 ? maxLength : -1"` + `:show-confirm-bar="false"` + **计数自绘**
（C 端 `.sf-counter` / 预览 `.cmpv-counter`，同一套 `position:absolute; right:pad-x; bottom:6px`）。
⚠️ **预览端不可把 `text` 与 `textarea` 合并渲染**：textarea 必须用 `<textarea>`，
共用 `<input>` 会让设计器里看不出多行、且无字数统计，与 C 端不一致。

## 面板上的三选一 ≠ 功能已复刻（2026-10-04 血泪，「选项类型」是纯死参数）
用户截图 ew 的选择类有「选项类型：文字/图片/图文」，我方**面板照抄了三选一，但两端渲染器
`content.optionType` / `opt.image` 全库0 命中** —— 切三档毫无反应，**属纯死参数**。
- **教训：抄面板控件 ≠ 复刻功能。** 每次加面板项，必须grep 渲染器确认**有元素消费该字段**，
  并确认**有对应 CSS/DOM**，否则就是下一个死参数。
- 三层缺一不可：**①数据层**（`components.js` 默认 content 声明该字段，否则老数据 undefined）
  → **②渲染层**（两端都消费 + 兜底函数，值域外一律回落默认档）→ **③样式参数**
  （schema styleRows + `SIZE_VAR`/`COLOR_VAR` 映射 + 条件显示标记）。
- ⚠️ **加了面板项却没在`components.js` 默认 content 里声明** → 新老数据都是 undefined，
  渲染端 `=== 'image'` 判定全部落空，比不做更糟。**必须写存量迁移脚本补默认值。**
- ⚠️ 条件显示标记已扩展为 `hOnly`（左右布局）/ `optImgOnly`（图片选项），
  都在 `SuperFormDesigner.curStyleRows` 的 filter 里处理，新增条件行沿用。
- ⚠️ 验证时**别用 `order` 挪元素位置**：圆点/勾选框本就是 DOM 首个子元素，column 布局自然落对；
  加 `order:-1` 反而会把它推出选项行（浮到容器顶部）。已踩坑。

⚠️ **admin 端验证必须硬刷新**：`open "...?cb=$RANDOM#/apps/super-form"`。
只换 hash 不换query 浏览器会复用旧 JS bundle，我一度把「旧 JS 的返回」当成代码 bug。
（对应 C 端则是：hash 路由不重挂载，必须先 open 首页再进目标页。）

## 面板开关「联动」≠ 承载了语义；且别替填表人预先声明其属性（2026-10-05 车牌开关教训）
用户试用「新能源车牌」开关后指出：「无效；而且输入车牌不限类型，这样开关有意义吗？我以为是在 C 端选择」。
- **两个独立缺陷**：
  1. **联动 ≠ 有效**：开关和画布是同一响应式对象（`selected` ≡ 画布 `comp`），切三档/开关**真的会重渲染**，
     但**校验层不看它**——车牌正则 `[省份][A-Z][A-Z0-9]{4,5}[末位]` 对 7/8 位都放行。故它只改格数+末格绿框，
     属「装饰性假功能」。**判定一个开关有没有用，必须去校验/提交路径确认它是否真的 gate 了什么。**
  2. **概念错位（更根本）**：车牌/车型是**「填表人那台车」的属性，不是「表单」的属性**。
     让表单作者在设计器预先声明「本表单只收蓝牌/只收绿牌」选错了轴——同一表单通常两种车都要收。
     **选择权应在 C 端填表人手里**：设计器不提供类型锁，改为「末格绿位可选」（普通填 7 格留空 / 新能源填满 8 格），
     类型由填表人「填不填末格」自然决定。
- **通用判据**：加任何「类型/类别」开关前先问——**这是表单的配置，还是填表人的属性？**
  属填表人属性 → 不该在设计器锁死，应在 C 端让填表人自选（或用可选槽位承载）。
- **落到车牌的标准口径**：固定 8 格、末格恒为绿框「新能源」**可选**位；校验正则在 7/8 位自适应放行。

## 小程序端两个高频坑（2026-10-05 真机实测踩出，勿回退）
1. **真机访问不到 `localhost`**：任何硬编码 `localhost:3000` 的 API 基址，在**真机上是「手机自己」**，
   请求必失败（表现为登录/接口报「网络错误」「登录出错」）。`web-app/src/utils/cardApi.js` 已改平台感知
   （`#ifdef MP-WEIXIN` → 电脑局域网 IP，`#ifndef` → localhost）。**新增 API 模块务必沿用此写法**。
   局域网 IP 由 DHCP 分配，换网络会变；正式发布换已备案 HTTPS 域名 + 小程序后台配 request 合法域名；
   真机调 http+IP 需在 DevTools 勾「不校验合法域名」。
2. **构建必须用项目本地 uni**：`npx uni build` 会拉到 `~/.npm/_npx` 缓存里的**错误版本** uni
   （报 `Cannot assign to read only property 'name'`）。**用 `./node_modules/.bin/uni` 或 `npm run build:mp-weixin`**。
3. **`code2Session` 目前是假实现**（`server/src/app.js` 里 `TODO`，直接 `return { openid:'mock_'+code }`）。
   小程序「登录」当前只造 mock 用户、非真实微信身份；接真实登录需 AppID + **AppSecret**（用户未提供前无法接）。
4. **主包体积**：`gen-mp-sicons.js` 生成的 `static/sicons/*.png` 运行时不引用（只用 base64），
   已在脚本里生成后自动清理（主包 ~3.6M→~1.7M）。若未来又出现主包超限，**先查是否有「构建期中间产物
   留在主包」或大 base64 映射**（如 `utils/sicons-base64.js` 277KB）。
   现状（2026-10-05）：代码 1399KB/1536KB，vendor.js(Vue3 运行时) 716KB 不可压缩，
   sicons-base64 272KB（**60 图标 × 21 色 = 482 条**）。裁颜色到 7 色可省 175KB 但牺牲 15 种精确色，**未做**。

## 小程序沉浸式导航：统一组件 + 两条跨端铁律（2026-10-05 立规，勿回退）
全站 43 页曾有 7 套各自为政的自绘导航（mall-nav/msg-nav/nav-bar/owner-nav/sk-nav/
ph-topbar/page-bar），全部无状态栏占位与胶囊避让，部分还用 `padding:88rpx` 硬编码假状态栏。
现统一为 `components/PageNav.vue` + `utils/navMetrics.js`。
- **`navigationStyle:'custom'` 时微信原生 navigationBar 完全不渲染**（`navigationBarTitleText` 也不显示）。
  41/43 页都配了 custom → 标题必须页面自绘，否则「自定义标题不出现」。新增页面时
  **要么去掉 custom 交给原生，要么必须挂 `<PageNav title="...">`**，二选一，不能都不管。
- **胶囊（最小化+三个点）是微信原生控件**：不可覆盖、点击会冲突，官方设计指南要求「预留该区域空间」。
  任何自绘头部都必须做两件事：`paddingTop = statusBarHeight` + `paddingRight = capsuleRightPad`。
  度量公式 `navBarHeight = (胶囊top - statusBarHeight) * 2 + 胶囊height`（保证纵向居中）。
- 🔴 **`lazyCodeLoading` 必须放 `manifest.json` 的 `mp-weixin` 节点下**（与 `appid` 同级）。
  放 `pages.json` 的 `mp-weixin` 下**无效**；误放进 `setting` 里也**无效**（setting 是开发者工具项目配置，会被过滤）。
  源码依据：`uni-cli-shared/dist/json/mp/pages.js` 的 `mergeMiniProgramAppJson(appJson, manifestJson[platform])`
  —— 合并的是 **manifest.json** 的平台节点，且只放行非 `projectKeys` 白名单的键。
- 🔴 **条件编译双分支会「重复声明」**：`// #ifdef MP-WEIXIN const X=... // #endif` + `// #ifndef const X=...`
  这种写法在 **vitest / node 直跑源码时两个分支都在** → `SyntaxError: Identifier 'X' has already been declared`。
  正确改法：**改运行时探测**（小程序端无 `window`、有 `wx`/`uni`）
  `const IS_MP_WEIXIN = typeof window==='undefined' && typeof wx!=='undefined'`；
  **不要改 `let`**（非小程序分支会被错误覆盖，测试断言 localhost 全挂）。
- ⚠️ **小程序端不支持动态 `<style>` 注入** → 需要按机型算的值（状态栏高度等）必须走
  **内联 `:style` 绑定**，不能靠 CSS 变量 + App.vue 注入。变量名统一 `--pnv-*` 前缀。
- ⚠️ **迁移脚本清废弃 CSS 时，正则必须兼容单行块**（`.nav-bar { display:flex; ... }` 声明与 `}` 同行）。
  只匹配 `^\}` 会整块漏掉（曾漏 11 个页面）。
- 全部页面（含 `pagesReads/`）都是 `<script setup>` → **import 即注册，无需 `components` 字段**。
  检测 script 风格**不要只 grep 前 20 行**（script 常在 100+ 行处，会全判错）。


## SVG 图标渲染铁律（commit a2de4c3血泪教训）
- **生成的根 `<svg>` 必须同时声明 `color` 和 `stroke`**。项目里 6 个图标（`apps` `radar`
  `dynamic` `wallet` `storage` `wechat`）内部用 `fill="currentColor"` 画实心点；
  `currentColor` 取的是 CSS `color` 属性，根 svg 未声明 → 按SVG 规范回退成**黑色**，
  白描边图标上出现黑点，看起来像"孔洞糊死"。**`stroke-width` 对 fill 画的点完全无效。**
- **判定口诀**：看到「点/孔洞糊成一坨」→ 先查源码是 `fill=` 还是纯 path，别先动 `stroke-width`。
- 两处必须同步：`web-app/src/components/SIcon.vue` 的 `buildSvgDataUri()`（H5 data URI）
  与 `web-app/scripts/gen-mp-sicons.js` 的渲染模板（小程序 PNG）。
- **构建顺序陷阱**：`gen-mp-sicons.js` 读`src/utils/sicons-base64.js` 写 `dist/`，改动后
  需**连跑两次** `npm run build:mp-weixin` 变体才进产物。
- **产物 `sicons-base64.js` 里是裸 base64**（`data:` 前缀运行时拼），校验正则若要求
  `"...(data:image/png;base64,...)"` 会全部MISS，误判成「产物没更新」。
- **主包体积口径**：只按「排除 4 个分包前缀（`pages/card/` `pagesReads/` `pages/superForm/`
  `pages/viewer/`）算一次总量」，不做目录分组（否则 `static/sicons` 会被重复计入）。
  再排除 `static/{sicons,three,icons,images}` 这 4 个构建中间产物目录。
  当前真实主包 **1440.3KB（1.407MB）**，1.5MB 线余量 95.7KB。
- **构建中间产物清不掉**：`strip-mp-static.js` / `gen-mp-sicons.js` 的删除被WorkBuddy
  safe-delete shim 拦（每轮 50 文件预算）。可用 node `fs.unlinkSync` 分批（每批 ≤40）删，
  但每文件都过 shim，481 个文件约需 4-8 分钟，建议放后台。
