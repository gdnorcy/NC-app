# 360全景 项目长期记忆（超精简版）

> 只放元规则；细节在日志与 refs/。勿超 3000 字符。

## 装修组件
- 🔴 改一处同步三处：`componentRegistry.js` → `ComponentRender.vue`(v-if 链尾无兜底) → `PageEditor.vue`(schema+control)；C 端 `DesignPage.vue` 独立重复；`.r-*` 手抄 `.dp-*`。
- 🔴 native-* 三层全跳过（`.pe-comp`/`.comp-render`/组件根都判 `startsWith('native-')`），漏一层=双重生效。
- 背景两字段：bgColor=自身色 / compBgColor=容器色（`containerStyle.js`）。显式 0 必须内联；透明三态 `''`/`'transparent'`/有色值，禁空串表透明。
- 条件隐藏优于删控件（`whenHas`）；`defaultProps` 只对新建生效，验证=真点 `.pe-lib-card`。

## 真机与跨端
- H5 正常≠MP 正常，按序查：① 父 wxss 穿不透子组件根(`:deep()` 也不行)→传 prop 出内联；② MP 无 atob/Buffer→`uni.base64ToArrayBuffer`；③ 内联 font-family 含双引号→setStyle 整条丢弃；④ 明暗判据搞反。
- 主题跟随：消费 `var(--design-` 的页面必绑 themeStyle（MP 内联下发）；强调色只用 `--design-primary`；SIcon/canvas/showModal 不吃 var()→喂真实 hex；补 marginLR 用 `??`；**画布对≠C端对**。
- MP 主包：构建后清 `static/{sicons,icons,sample,three}`（safe-delete 拦就 mv）。
- API 基址单一来源 `utils/apiBase.js`：.env 配，改后须重建；🔴 import.meta.env 直接访问，typeof 防御在 MP 被垫片成 require("url") 崩 app.js。

## 配色元规则
- 🔴 明暗先问「判的是哪一块底」：坐品牌渐变→`--brand-hero-ink`；坐白卡/浅底→`--brand-ink`。唯一裁决口 `utils/templateTheme.js` 的 `heroForeground`；禁多判据并行。
- 品牌色三通道缺一即「一半蓝一半黄」：① 页面根合 `brandVars` ② JS 取色点喂 `brandPrimary` ③ themeColor 与 brandVars 同源。新页面必过 `brandCoverage.test.js`；覆盖模板配色、保留布局。宫格例外（可自配）。
- 创建页 `createSkin.js`：浅色画布 #f6f7fb+顶部晕染+白卡；**v3.3 头部/按钮纯主色**；文字对色仍走 heroForeground 中值口径。

## 几何与浮层
- 越界浮层被裁→移出滚动容器+`.pe-tools-layer` JS 定位，勿靠容器 padding。
- 组件宽度用 vw/设计稿 px，禁百分比；`max-width:100%` 也是耦合源→`100vw`/`375px`；`margin:auto` 须 display:block；文字垂直居中根因是行盒。
- 两端各写一份 CSS=必然漂移：parity 测试三纪律（源码正则提取；剥注释只取 style 块；比实际生效值）；CSS 几何须无头实测，**单测全绿≠视觉正确（已四次）**。
- 🔴 用户提示常含答案：「A可B不可」⇒病根在两分支差异。「还是之前的坑」=方案选错。

## 静默失败
- 跳未注册页（grep `pages.json`）；onShow 自动跳转弹走（跳登录带 `manual=1`）；登录丢上下文（`redirect` 站内绝对路径，`safeRedirect()` 排 `//`）。
- 「空白/没反应」先抓运行时异常：watch/computed 引用须在声明后（TDZ→白屏）。
- 🔴 整页空数据（静态在、数据全灭）：computed 用了未 import 函数→渲染数据函数首字段即抛（shadeHex 事故）。审计 `npm run audit:imports`；单测 toContain 钉 import 会**锁死 bug**（曾钉住错误行）→钉正确形态。
- 🔴 冷启动 reLaunch 竞态：onShow 跳转须等本页 onReady，否则目标页空白首帧、二次进入才好（login/home 双修；`scripts/sim-coldstart.cjs` 实证）。

## 构建与部署
- 两个入口：dev `localhost:5173`｜生产 `localhost:3000/admin`；用户说「没变」先确认他访问哪个。
- 🔴 SaaS 架构（10-17）：每客户一小程序，走微信第三方平台代开发，jscode2session 改 component token 模式；细节见 10-17 日志。
- 部署：推 `deploy` 分支（含 server/public 产物，force-add）→ 服务器 `/opt/app` git pull + `systemctl restart panorama`；DB 不在分支。
- 🔴 构建顺序坑：**勿在 main 构建后切 deploy**（checkout 恢复旧产物→只加新不删旧）；必须切 deploy 再 `npm run build:mobile`。
- H5 运行目录=`server/public/card`；验新旧 curl 比 chunk size。safe-delete 拦 rm>50→mv /tmp。
- 查库：`node:sqlite` + `server/data/panorama.db`（非 `server/src/data/` 旧库）。
- 服务器：Lighthouse `lhins-bvw7p0gb`（TAT 禁 rm-rf/域名入命令）。域名 zero.nshop.mobi 已 SSL；BT 面板 1.12.250.126:8888。
- 🔴 库同步（10-17）：backup API 快照→留 admin 凭证、户口重置 admin123→ghfast 镜像传→停服换库。
- 🔴 「进入客户」报错=数据非代码：新部署只有 admin、种子不建租户口，建号须挂 customer_id。

## 杂项
- schema 说明是 `tips` 复数；macOS grep 用 `-E`；CSS token 源 token.scss。
- 集市两套状态：开关=`card_market_items`，is_public=可见性派生；单一来源 `utils/marketLink.js`。超级表单见 refs/decoration-form.md。
