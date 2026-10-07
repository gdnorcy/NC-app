# 装修组件 / 超级表单 细节（MEMORY.md 的展开，勿在 MEMORY.md 里重复写）

## 超级表单 · 细节
- radio/checkbox 的 `content.options` 须 `[{label,value}]` 对象（填字符串数组→「圆点有字没有」）。左右留白唯一来源 `outMarginX`。
- textarea 须 `:maxlength="maxLength>0?maxLength:-1"` + `:show-confirm-bar="false"` + **计数自绘**（否则 uni H5 走内置 140、面板「最多输入」不生效；MP 固定 140 → 三端不一致）。预览端不可合并 `text`/`textarea` 渲染。
- **组件圆角必须始终发射含 0**（曾 `if(st.radius)` 让 0 跳过回落基础圆角）。
- ⚠️ **取「名片字段」别调错接口**：`memberMyCard()`（`//member/my-card`）= **租户会员卡**（无 city/名片字段）；`getCardsSafe()`（`/cards`）/ `getProfile()` 才是**个人名片**。market 的同城城市曾误取前者 → 恒空 → 误报「请先完善所在城市」。
- 🎯 改 `STYLE_SCHEMA.boxLine` / `styleVariant()` / 任一端 `sfv-*` CSS 后**必跑** `node scripts/audit-sf-style-coverage.mjs`（在仓库根跑）。非 0 = 有死参数。加新风格时三端选择器组必须同时加新组件容器 class（曾漏 pay/realtime/sf-opts/sf-image-h/sf-id-box）。现状 15 类/36 值/42 映射全通过。
- ⚠️ 「组件风格」映射**按 type 分派**：styleType 取值按组件各自命名、跨组件撞名（radio 的 `s1` 作用选项区、filedownload 的 `s1` 作用下载框）。非选择类 s1/s2 不能当选项区（两档同 `sfv-box` = 死参数）。
- ⚠️ 装修嵌入表单**不显示表单名头**；模板名占位「未命名表单」时后台列表仍显示 → 改模板名。
- 改 schema 默认值须**定向迁移存量**（只改等于旧默认的，改前 `cp` 备份 DB）。

## 背景色拆两字段（`2e44353`，勿回退）· 细节
- 存量迁移 `migrateLegacyBgColor()`（幂等）挂两处：加载草稿 + `newComp()`。
- 判据表 `SELF_COLORED_TYPES` —— **加类型前须 grep 确认该类型根节点真的不读 `props.bgColor`**。
- `PageEditor.compBoxStyle` 的 `withPadding:false` 须去掉（否则 MIN_BG_PADDING 兜不住）。
- ❌ **已废弃错路（勿复活）**：`HIDDEN_BG_TYPES` 黑名单「让容器不上色」——手工维护 28 项、漏判 goods-*、本质把「满宽组件遮底色」问题藏起来。

## 包内资源 · 细节
- MP 图裂三层（缺一层照样裂）：① `strip-mp-static.js` 的 `STRIP_DIRS` 误含被引用目录（`static/images` 被 countdown defaultProps 引用，**不可剔除**；`static/sample` 确认 `server/public/` 已托管**可**剔除）② `resolveUrl()` 给包内相对路径拼 `API_DOMAIN`→404 ③ `background-image:url()` 不支持包内路径。
- ⚠️ 走网络图代价：**真机须在小程序后台配 request 合法域名**。
- 示例图唯一事实来源 `utils/sampleImages.js` 的 `sampleUrl()`（banner 710×388 / square 400×400 / portrait 600×800）。
- 构建脚本自检须「**不论成败都跑**」且判两类：①「代码引用但产物没有」②「网络图路径写错」（抽文件名去 `src/static/` 反查真实相对路径比对；只判「在不在包里」对网络图永远通过——漏检 10 天原因）。

## UI 规范 · 细节
- 图标 `docs/规范/07-UI设计.md`：三层蜜桃橙、填充非描边、大圆角扁平、透明底；禁绿紫蓝分类色。面板图标须 56×56 8-bit RGBA PNG，未映射进 `COMP_ICONS` 会 fallback 线性 `SIcon`（违反规范）。
- 按钮规范 `docs/规范/08-装修中心按钮规范.md`：四档 L96/M80/S64/XS56rpx，圆角 L/M16·S12·XS8rpx（能命中 `$radius-sm/md`）。尺寸单一事实来源 `web-app/src/utils/btnTokens.js`。
- 名片宫格 v5 定稿（权威 `名片宫格图标方案.html`）：46px 方块(r=14)+32px 描边图标(gap:10px)；会员中心＝**对勾圆**非皇冠；「更多」底色 `#78909c→#546e7a`；方案 A/B/C 只差底色、用户选 **A**。
- ⚠️ `PeColorPicker` 渐变预设 11 色与宫格方案 A 的 9 色**是同一套** → 运营易误选（曾两次把按钮底色设成宫格橙渐变）。排查「颜色串了」先确认是否误选预设。
- **底部导航配置真身 = `tenant_tab_scheme.tab_json`**；`tenant_page_design.meta.nav` 只有 mode/schemeId。gen-mp-sicons 烘 MP 图标色读前者 —— **共享路径/工具必须提模块级 try 外**（块内 const + 静默 catch 会吞掉后续块）。

## 登录 / 后端 · 细节
- 🔧 `code2Session` 通道验证：`curl -X POST /api/card/auth/wx-login -d '{"code":"假code"}'` → `code2session失败(40029): invalid code` = 真实通道生效且密钥有效；40001/40125 才是密钥错。
- 换真实通道后真机首登会新建「真实 openid 空账号」，旧名片仍在 mock 账号下 → `scripts/rebind-wx-user.mjs` 过户（预演 / `--apply`，自动备份 DB）。⚠️ openid 按真实特征（28 位、以 o 开头）识别，否则误中种子账号。
- ⚠️ **DB 真实路径 `server/data/panorama.db`**，不是 app.db。
- **导航背景默认图库**：MaterialPicker 的 `presets` prop（`[{url,label}]`，非空显示「默认图」页签）；TabNavEditor 仅 `target==='bg'` 时传 `bgPresets`（10 张 `server/public/images/tabbar-bg/btn-*.png`）。⚠️ C 端 CardTabBar 对含该前缀的 bg **按当前 类型×风格×圆角 自动回正**；vite proxy 须含 `/images`。
