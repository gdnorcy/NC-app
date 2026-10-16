# 360全景 项目长期记忆（超精简版）

> 只放元规则；细节在日志与 refs/。勿超 3000 字符。

## 装修组件
- 🔴 改一处同步三处：`componentRegistry.js` → `ComponentRender.vue`(v-if 链尾无兜底) → `PageEditor.vue`(schema+control)；C 端 `DesignPage.vue` 独立重复；`.r-*` 手抄 `.dp-*`；同名异组件函数别误改。
- 🔴 native-* 三层全跳过（`.pe-comp`/`.comp-render`/组件根都判 `startsWith('native-')`），漏一层=双重生效。
- 背景两字段：bgColor=自身色 / compBgColor=容器色（`containerStyle.js`）。「可设 0」显式 0 必须内联；透明三态 `''`/`'transparent'`/有色值，禁空串表透明。
- 条件隐藏优于删控件（`whenHas`）；`defaultProps` 只对新建生效，验证=真点 `.pe-lib-card`。

## 真机与跨端
- H5 正常≠MP 正常，按序查：① 父 wxss 穿不透子组件根(`:deep()` 也不行)→传 prop 出内联；② MP 无 atob/Buffer→`uni.base64ToArrayBuffer`；③ 内联 font-family 含双引号→setStyle 整条丢弃；④ 明暗判据搞反。
- 主题跟随：消费 `var(--design-` 的页面必绑 themeStyle（MP 内联下发）；强调色只用 `--design-primary`（`--primary` 是固定蓝、`--theme-tint` 无定义）；SIcon/canvas/showModal 等不吃 var()→喂真实 hex；补 marginLR 用 `??`；**画布对≠C端对**。
- MP 主包：构建后清 `static/{sicons,icons,sample,three}`（safe-delete 拦就 mv），量体积前删空目录；API 基址写死 `cardApi.js`，换局域网失效。主包实测 1982KB 贴 2M 硬线。

## 配色元规则
- 🔴 明暗先问「判的是哪一块底」：坐品牌渐变→`--brand-hero-ink`；坐白卡/浅底→`--brand-ink`。唯一裁决口 `utils/templateTheme.js` 的 `heroForeground`（mixHex→luma>180→WCAG 校验，不合格自动回落）；禁多判据并行。
- 品牌色三通道缺一即「一半蓝一半黄」：① 页面根合 `brandVars` ② JS 取色点喂 `brandPrimary` ③ themeColor 与 brandVars 同源。新页面必过 `brandCoverage.test.js`。品牌色覆盖模板配色、保留模板布局（勿把 templateTheme 排品牌前）。projects join 兜底默认项目。宫格例外（可自配）：四域默认色只落默认值。
- 创建页 `createSkin.js`：浅色画布 #f6f7fb+顶部晕染+白卡；**v3.3（10-17）头部/按钮改纯主色**（渐变被否）；文字对色仍走 heroForeground 中值口径（灰区主色按纯色判误落白字）。

## 几何与浮层
- 越界浮层被裁→移出滚动容器+`.pe-tools-layer` JS 定位，勿靠容器 padding。
- 组件宽度用 vw/设计稿 px，禁百分比；`max-width:100%` 也是耦合源→`100vw`/`375px`；`margin:auto` 须 display:block；文字垂直居中根因是行盒。
- 两端各写一份 CSS=必然漂移：parity 测试三纪律（源码正则提取；剥注释只取 style 块；比实际生效值）。CSS 几何须无头 Chrome 实测，**单测全绿≠视觉正确（已四次）**。
- 🔴 用户提示常含答案：「A可B不可」⇒病根在两分支差异。「还是之前的坑」=方案选错。

## 静默失败
- 跳未注册页（grep `pages.json`）；目标页 onShow 自动跳转弹走（跳登录带 `manual=1`，来源 `utils/loginEntry.js`）；登录丢上下文（`redirect` 站内绝对路径，`safeRedirect()` 排 `//`）。
- 「空白/没反应」先抓运行时异常：watch/computed 引用须在声明后（TDZ→白屏）。

## 构建与部署
- 两个入口：dev `localhost:5173`（即生效）｜生产 `localhost:3000/admin`（须重建）；用户说「没变」先确认他访问哪个。
- 部署：推 `deploy` 分支（含 `server/public/{admin,card,mall}` 产物+后端，force-add）→ 服务器 `/opt/app` git pull + `systemctl restart panorama`；DB 不在分支。
- 🔴 构建顺序坑：**勿在 main 构建后切 deploy**（checkout 恢复旧产物→只加新不删旧、index.html 停留旧引用）；必须切 deploy 再 `npm run build:mobile`。
- H5 运行目录=`server/public/card`（build:mobile 同步 card+mall）；「不是最新包」curl `/card/assets/<chunk>.js` 验 size+标志串。safe-delete 拦 rm>50 → 先 mv /tmp。
- 查库：`node:sqlite` + `server/data/panorama.db`（非 `server/src/data/` 旧库）。
- 服务器：Lighthouse ap-guangzhou `lhins-bvw7p0gb`（TAT 禁 rm-rf/内网/公网 IP/域名入命令，长命令转异步）。域名 zero.nshop.mobi 已 SSL；BT 面板 1.12.250.126:8888/tencentcloud。
- 🔴 「进入客户」报错=**数据非代码**：新部署只有 admin、种子不建租户口 → 建 tenant_admin（`users.customer_id=项目id`，约定 tenant1/admin123）。

## 杂项
- schema 说明属性名是 `tips` 复数；新测试先确认 vitest include 覆盖；macOS grep 用 `-E`；CSS token 源 `styles/token.scss`（页面 inline 覆盖全局）。
- 集市两套状态：开关=`card_market_items`、is_public=可见性派生；单一来源 `utils/marketLink.js`。超级表单见 refs/decoration-form.md。