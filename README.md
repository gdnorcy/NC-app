# NC-app — 三系统统一仓库

360 全景浏览器 / 智能名片 / 商城 三系统一体的电商与内容平台：统一 Node 后端，多端前端（Web / H5 / uni-app），管理端集中托管。

## 系统概览

| 系统 | C 端/展示端 | 管理后台 | 后端路由 |
|---|---|---|---|
| **360 全景浏览器** | `web`（Three.js 桌面端）+ `web-app/pages/panorama`（H5/小程序多端） | `/admin` | `server/src/routes/`（plans/scenes/storage/tiling 等） |
| **智能名片** | `web-app/pages/card*`（uni-app，名片/访客/客户/分销/会员） | `web-admin` admin 端 | `server/src/routes/card.js` 等 |
| **商城** | `web-app/pages/mall`（uni-app，分类/商品/购物车/订单） | `web-admin` customer 端（装修设计器） | `server/src/routes/mall.js / goods.js / store.js / design.js` 等 |

---

## 一、360 全景浏览器

H5 / Web 同步的 360 全景浏览系统：前台全景查看器 + 管理后台 + Node 后端。

**三层模型**：客户项目（每个客户一个，可设有效期）→ 方案（原"项目"，一个客户可建多个）→ 场景（全景图，一个方案可建多个）

**展示端（H5 + Web）**
- equirectangular 全景图浏览（Three.js）
- 桌面：鼠标拖拽旋转、滚轮缩放；移动端：单指拖拽、双指捏合
- 陀螺仪沉浸模式（移动端）、自动旋转、全屏
- **方案卡片列表**（首页，公开方案）→ 方案页 → 场景切换、加载进度、响应式适配
- **分享链接**：方案级与场景级双分享——`/s/{token}` 直达，无需登录；关闭分享即失效

**管理后台（/admin）**
- 登录认证（JWT），支持**账号密码**和**手机号验证码**双模式登录
- **多用户与角色权限**：4 种角色（admin 管理员 / manager 运营 / editor 编辑 / viewer 只读），admin 可创建/编辑/删除子账号、重置密码、启用停用；非 admin 自动隐藏用户管理和存储设置
- **手机号注册**：前端发送验证码 → 注册自动创建 editor 角色账号；短信 provider 抽象（开发环境 Mock，预留阿里云/腾讯云接入）
- **客户项目管理**：新建/编辑/删除（方案自动归默认客户）/ 置顶 / 有效期设置 / Logo 上传 / 状态（正常/停用）/ 续费；卡片显示剩余天数、方案数、场景数
- **方案管理**：新建/编辑/删除（场景自动归默认方案）/ 封面上传 / 上架下架 / 排序 / 分享
- **场景管理**：新增 / 编辑 / 删除 / 上架下架，归属到具体方案、可单独开启分享
- **分享管理弹窗**：方案级与场景级共用——复制分享链接、生成二维码（手机扫码直达）、刷新令牌（作废旧链接）、一键开启/关闭
- 全景图上传（JPG / PNG / WebP，≤50MB），**服务端自动转码压缩**：转为两档 WebP（主图默认限长边 4096 + 低清预览默认长边 1024），手机端大幅减载
- **金字塔切片**：宽 >= 2048 的全景图上传时自动生成多层级瓦片（1024×512 WebP，层级逐级减半），展示端按视角只加载可见瓦片
- **存储设置**：本地 / 阿里云 OSS / 七牛云**分厂商独立配置**，支持 OSS Region、七牛**所属区域**、**文件夹前缀**、CDN 域名；密钥 AES 加密存储，一键测试连接

---

## 二、智能名片

基于 uni-app 的电子名片系统（C 端在 `web-app/src/pages/card*`），后端 `server/src/routes/card.js` 等。

- **登录**：微信登录（`/auth/wx-login`）；`cardMain` 提供独立登录/首页入口
- **名片管理**：模板列表、创建（含"创建并申请"）、编辑、删除、名片作品集；个人资料
- **访客跟踪**：访客浏览轨迹记录（`/visitor/track`）、访客列表/摘要、单访客时间线、已读标记
- **客户管理**：客户列表、编辑、跟进（follow）、跟进记录
- **分销体系**：分销伙伴（distPartner）、区域/分类/全场分享页（distShareArea/distShareCat/distShareAll）、分销钱包（distWallet）、分销申请
- **名片市场**：市场列表（`/market`）、兑换申请（`/exchange`）
- **会员体系**：会员套餐（`/member/packages`）、等级（`/member/levels`）、状态查询、我的名片、会员申请、签到
- **内容**：动态（dynamics）、视频（videos）、消息（messages）

---

## 三、商城

**管理后台（web-admin / customer 端，装修设计器）**
- 组件化**页面装修**：拖拽/点击添加组件到画布，右侧属性面板实时配置（样式/风格/数据源/颜色/边距/圆角等），支持 when 条件联动（如"全部商品"组件 st3 风格下才显示卡片轮播、图片比例）
- 已复刻组件（1:1 对标 ewishop）：**商品组**（7 种风格）、**全部商品**（3 种风格 + 卡片轮播）等商品类组件
- **商品管理**（`goods.js`）：商品分类（含批量）、商品增删改查、参数管理、商品设置、授权管理、订单管理（发货/完成/退款）、经营洞察
- 商品价格体系：划线价/会员价/新人价/阶梯定价，显示优先级 新人价 > 会员价 > 划线价

**C 端商城（web-app/pages/mall）**
- 首页装修渲染（`/design-home`）、分类（`/cates`）、商品列表/详情（`/goods`）
- 购物车（增删改/清空）、下单（`/orders`）、订单列表/详情/取消
- 门店（`/stores`）

---

## 目录结构

```
├── server/            # 后端（Express API + SQLite）
│   ├── src/           # 入口、路由（含 card/mall/goods/store/design 等）、认证、数据库
│   └── test/          # API 测试（node:test + supertest）
├── web/               # 360全景 桌面端前端（Vite + Three.js）
│   ├── index.html     # 展示端
│   └── admin.html     # 管理后台
├── web-app/           # uni-app 多端应用（H5/小程序/公众号/PC）：panorama / card* / mall
├── web-admin/         # 管理后台前端（Vite + Vue3）：admin（名片/全景后台）+ customer（商城装修设计器）
├── scripts/           # 构建验证、组件 schema 检查等脚本
├── docs/              # 项目规范（复刻检查清单/复刻规范/商城规范/对标截图等）
└── demo/              # 演示全景图
```

## 本地开发

```bash
npm install                 # 安装全部依赖（workspaces: server/web/web-admin；web-app 独立安装）
npm run dev                 # 启动后端（http://localhost:3000，含构建产物托管）
npm run dev -w web          # 360全景 Web 端热更新（代理 /api 与 /uploads）
npm run dev -w web-admin    # 管理后台热更新
npm run dev:h5 -w web-app   # uni-app H5 开发（名片/商城/全景多端）
npm test                    # 后端测试（全量串行：node --test --test-concurrency=1 server/test/*.test.js）
npm run test:frontend       # 前端单元测试（web-admin + web-app）
```

构建与部署（详见 `docs/规范/02-构建部署.md`）：

```bash
npm run build:admin      # 构建管理后台到 server/public/admin
npm run build:mobile     # 构建移动端 H5（web-app → server/public/card）
npm run build:all        # 两者都构建
npm run verify           # 验证构建产物
npm run restart          # 重启服务器
```

生产运行：先 `npm run build:all` 构建，再 `npm start`（后端自动托管构建产物）。

## 默认账号

- 全景/名片后台地址：`http://localhost:3000/admin`
- 商城装修设计器：`http://localhost:3000/customer`
- 用户名 / 密码：`admin / admin123`

**部署前必须修改**，通过环境变量配置：

```bash
ADMIN_USER=yourname ADMIN_PASS=yourpass JWT_SECRET=<随机长字符串> PORT=3000 npm start
```

## 手机端加载优化配置（全景）

**已内置的加载优化（生产构建自动生效）**
- **两档 WebP 转码**：上传时自动转为 4096 主图 + 1024 低清预览
- **渐进加载**：先渲染低清秒出画面，主图后台静默替换，快速切换不串场
- **Service Worker 缓存**（`/sw.js`）：全景图 cache-first（二次访问零网络）、场景 API network-first（离线可用）、页面/JS/CSS 缓存秒开；升级自动清理旧缓存
- **three.js 独立分包**：vendor 与业务代码分离，首屏只加载必要部分

可通过环境变量调整转码参数：

```bash
IMAGE_MAX_SIZE=4096   # 主图最大长边像素（默认 4096，超出则等比缩小）
IMAGE_QUALITY=80      # 主图 WebP 质量（默认 80）
PREVIEW_SIZE=1024     # 低清预览图长边像素（默认 1024）
```

**CDN 加速（后台一键配置）**：进入管理后台 →「存储设置」→ 选择阿里云 OSS 或七牛云，填入子账号 AK/SK、Bucket/空间名、CDN 域名并「测试连接」后保存。此后上传的图片将转码后直传云端，前台通过 CDN 域名加载；未配置云端时自动使用本地存储。建议给云账号开通**最小权限子账号**（仅该 Bucket 读写）。

密钥以 AES-256-GCM 加密后入库，生产环境必须设置主密钥：

```bash
STORAGE_KEY=<至少 32 字节随机字符串> npm start
```

## API 概览

### 360全景（节选，完整见源码）

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/api/auth/login` | 账号密码登录，返回 token + user | 否 |
| POST | `/api/auth/sms-code` | 发送短信验证码（purpose: register/login），60秒限频 | 否 |
| POST | `/api/auth/register` | 手机号+验证码注册，默认 editor 角色 | 否 |
| GET | `/api/scenes` | 上架场景列表 | 否 |
| GET | `/api/plans` | 公开方案列表（已上架且开启分享） | 否 |
| GET | `/api/s/:token` | 分享令牌解析（方案级 / 场景级） | 否 |
| GET | `/api/admin/projects` | 全部客户项目（含方案数/场景数） | Bearer |
| GET | `/api/admin/plans` | 全部方案 | Bearer |
| GET | `/api/admin/scenes` | 全部场景 | Bearer |
| POST | `/api/admin/upload` | 上传全景图（自动转码/切片） | Bearer |
| GET/PUT | `/api/admin/storage` | 存储配置读写（不回传密钥） | Bearer |

### 智能名片（节选）

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/api/card/auth/wx-login` | 微信登录 | 否 |
| GET | `/api/card/templates` | 名片模板列表 | 否 |
| GET/POST/PUT/DELETE | `/api/card/cards(/:id)` | 名片增删改查 | Bearer |
| POST | `/api/card/visitor/track` | 访客浏览轨迹记录 | 否 |
| GET | `/api/card/visitors/summary` | 访客汇总 | Bearer |
| GET | `/api/card/customers` | 客户列表 | Bearer |
| POST | `/api/card/exchange` | 名片兑换申请 | Bearer |
| GET | `/api/card/market` | 名片市场 | 否 |
| GET/POST | `/api/card/member/*` | 会员套餐/等级/申请/签到 | 混合 |

### 商城（节选）

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| GET | `/api/mall/cates` | 商城分类 | 否 |
| GET | `/api/mall/goods` | 商品列表（支持 ids/分类/关键词过滤） | 否 |
| GET | `/api/mall/goods/:id` | 商品详情 | 否 |
| GET | `/api/mall/design-home` | 装修首页渲染数据 | 否 |
| GET/POST/PUT/DELETE | `/api/mall/cart(/:id)` | 购物车增删改查 | 混合 |
| POST/GET | `/api/mall/orders(/:id)` | 下单 / 订单列表 / 详情 | 混合 |
| POST | `/api/mall/orders/:id/cancel` | 取消订单 | 混合 |
| GET/POST/PUT/DELETE | `/api/goods/categories` | 商品分类管理 | Bearer |
| GET/POST | `/api/goods/` | 商品管理 | Bearer |
| GET/POST | `/api/goods/orders(/:id/ship\|done\|refund)` | 订单发货/完成/退款 | Bearer |
| GET | `/api/goods/insight` | 经营洞察 | Bearer |

## 数据与存储

- 数据库：`server/data/panorama.db`（SQLite，自动创建）
- 图片：本地模式存于 `server/data/uploads/`，云端模式直传对象存储（删除场景时同步清理对应对象）
- 以上目录已被 gitignore，不进入版本库
