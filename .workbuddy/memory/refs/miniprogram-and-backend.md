# 小程序端坑位与后端数据（MEMORY.md 展开，勿重复写）

## 主包体积口径与余量
- 算法：排除 4 个分包前缀（`pages/card/` `pagesReads/` `pages/superForm/` `pages/viewer/`）算总量，再排除构建中间产物 `static/{sicons,three,icons,images,sample}`。
- 现状 **1467.8KB，2MB 余量 580.2KB**。vendor.js(Vue3) 716KB 不可压缩。
- `utils/sicons-base64.js` 272KB（482 条），裁到 7 色可省 175KB 但牺牲 15 种精确色，**未做**（待用户决定）。
- ⚠️ 主包页面**无法引用分包资源**，但可以「不进包」（走网络图）。
- base64 内联注意：36.7KB JPEG → 48.9KB（**膨胀 33%**），不划算。

## 沉浸式导航 / 页面注册
- 统一 `components/PageNav.vue` + `utils/navMetrics.js`。
- `navigationStyle:'custom'` 时**原生 navigationBar 完全不渲染**（含 titleText）→ 新增页面要么去掉 custom，要么挂 `<PageNav>`。
- 胶囊是原生控件不可覆盖，必须 `paddingTop=statusBarHeight` + `paddingRight=capsuleRightPad`。
- 🔴 `lazyCodeLoading` 必须放 **`manifest.json` 的 `mp-weixin` 节点**（放 `pages.json` 或 `setting` 里都无效）。
- 🔴 条件编译双分支会「重复声明」：vitest/node 直跑源码时两个分支都在 → `Identifier 'X' has already been declared` → **改运行时探测，不要改 `let`**。
- ⚠️ 小程序不支持动态 `<style>` 注入 → 按机型算的值必须走**内联 `:style`**。
- 页面级配置在产物里位于 `pages/xxx/xxx.json` 而非 `app.json`。

## SVG 图标（小程序端）
- 根 `<svg>` 必须**同时声明 `color` 和 `stroke`**：6 图标内部用 `fill="currentColor"` 画实心点，根未声明 color → 回退黑色。
- **`stroke-width` 对 fill 画的点完全无效。** 口诀：「点/孔洞糊成一坨」→ 先查源码是 `fill=` 还是纯 path。
- `SIcon.vue buildSvgDataUri()` 与 `scripts/gen-mp-sicons.js` 模板**两处同步**，改后**连跑两次 `build:mp-weixin` 才进产物**。

## 静态资源 / MIME
- **`/uploads` MIME 兜底**：`express.static` 靠扩展名推断，无扩展名文件 → `octet-stream` → 小程序 `<image>` 不显示。
- 修法：上传时 `ensureExtension()`（MIME 映射 + 内容嗅探兜底）+ 静态中间件给存量文件兜底。
- 🔴 **兜底中间件必须注册在 `express.static` 之前**（顺序反了等于没加）。
- ⚠️ `curl -I`(HEAD) 对 express.static 无响应，验 MIME 要用 `curl -D -o /dev/null`(GET)。

## 网络与登录
- **真机访问不到 `localhost`**（指手机自己）→ `cardApi.js` 已做平台感知（`#ifdef MP-WEIXIN` → 局域网 IP），**新增 API 模块务必沿用同一写法**。
- 正式发布需备案 HTTPS 域名 + 小程序后台配合法域名。
- **`code2Session` 是假实现**（`server/src/app.js` 里 `TODO`），接真实登录需 AppID + **AppSecret**（用户未提供）。

## 缓存
- **装修配置真机不更新**：`design.js` 的 `TTL=5*60*1000`，缓存命中即 return，**重启 / reLaunch 都无法绕过**。
- 唯一解：下拉强刷新 `loadHomeData(force)` 或等 5 分钟。

## 后端 / 数据
- **租户过滤只能靠 `projects.id`**：`projects` 表**没有 `customer_id` 列**，`projects.id` 就是客户 id（= `user.customerId`）。JOIN 过滤写 `WHERE c.id = ?`，写 `c.customer_id` 直接 `no such column`。
- 公开 `GET /api/plans`（`routes/plans.js:69`）**无客户维度** → 客户后台直接调会泄漏全部客户方案。租户内方案列表走新增的 `GET /api/design/plans`。
- 下拉只列 `status==='published'` 的表单（`/super-form/:id/public` 只返回已发布）。
- 链接选择器例外（用户 2026-10-03 定口径）：草稿/停用**照列但灰显不可选**，副信息写「草稿 · C 端不可访问」，让用户看出「我建了表单为何这里灰着」。
- **禁止把客户数据硬编码成示例链接**：客户建 5 个表单就只能选 1 个，且 id=1 几乎必然指错。
- 动态列表**每次打开弹窗都要重拉**（`force=true`）：用户随时可能新建/删除，缓存即过期数据，会让「目标已删除」的回显兜底误判。
- 回显兜底：目标已删必须**回退自定义链接 + 原样保留 value** 并 warning 提示，绝不静默清空（否则用户点「确定」丢配置）。
- `el-option` 的 `value` 用**字符串**（`el-select` 对数字 `0` 有被当空值处理的版本差异）。
- **DB（`server/data/panorama.db`）在 .gitignore 里**，改前 `cp` 备份。`tenant_page_design.is_home=1` 是名片首页。
- `tenant_page_design` 真实列：`tenant_id, page_type, page_name, design_json, version, status, created_at, updated_at, is_home, sort_order`。**没有** `project_id` / `published`（曾写这两列直接报错）。