# 360 全景浏览器

H5 / Web 同步的 360 全景浏览系统：前台全景查看器 + 管理后台 + Node 后端。

## 功能

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
- **侧边栏布局 + 面包屑**：客户项目（卡片式首页）→ 方案 → 场景，三级导航
- **客户项目管理**：新建/编辑/删除（方案自动归默认客户）/ 置顶 / 有效期设置 / Logo 上传 / 状态（正常/停用）/ 续费；卡片显示剩余天数、方案数、场景数
- **方案管理**：新建/编辑/删除（场景自动归默认方案）/ 封面上传 / 上架下架 / 排序 / 分享
- **场景管理**：新增 / 编辑 / 删除 / 上架下架，归属到具体方案、可单独开启分享
- **分享管理弹窗**：方案级与场景级共用——复制分享链接、生成二维码（手机扫码直达）、刷新令牌（作废旧链接）、一键开启/关闭
- 全景图上传（JPG / PNG / WebP，≤50MB），**服务端自动转码压缩**：转为两档 WebP（主图默认限长边 4096 + 低清预览默认长边 1024），手机端大幅减载
- **金字塔切片**：宽 >= 2048 的全景图上传时自动生成多层级瓦片（1024×512 WebP，层级逐级减半），展示端按视角只加载可见瓦片
- **存储设置**：本地 / 阿里云 OSS / 七牛云**分厂商独立配置**，支持 OSS Region、七牛**所属区域**、**文件夹前缀**、CDN 域名；密钥 AES 加密存储，一键测试连接

**后端**
- Node + Express + SQLite（`node:sqlite`，零原生依赖）+ sharp 图片转码
- 存储抽象层：本地存储（`server/data/uploads/`）、阿里云 OSS、七牛云 Kodo 可插拔

## 目录结构

```
├── server/            # 后端（Express API + SQLite）
│   ├── src/           # 入口、路由、认证、数据库
│   └── test/          # API 测试（node:test + supertest）
├── web/               # 前端（Vite + Three.js）
│   ├── index.html     # 展示端
│   ├── admin.html     # 管理后台
│   └── test/          # 单元测试（vitest）
└── demo/              # 演示全景图
```

## 本地开发

```bash
npm install                 # 安装全部依赖（workspaces）
npm run dev -w server       # 启动后端（http://localhost:3000，含构建产物托管）
npm run dev -w web          # 前端热更新开发服务器（代理 /api 与 /uploads）
npm test                    # 运行全部测试
npm run build -w web        # 构建前端到 web/dist
```

生产运行：先 `npm run build` 构建前端，再 `npm start`（后端自动托管构建产物）。

## 默认账号

- 后台地址：`http://localhost:3000/admin`
- 用户名 / 密码：`admin / admin123`

**部署前必须修改**，通过环境变量配置：

```bash
ADMIN_USER=yourname ADMIN_PASS=yourpass JWT_SECRET=<随机长字符串> PORT=3000 npm start
```

## 手机端加载优化配置

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

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/api/auth/login` | 账号密码登录，返回 token + user | 否 |
| POST | `/api/auth/sms-code` | 发送短信验证码（purpose: register/login），60秒限频 | 否 |
| POST | `/api/auth/register` | 手机号+验证码注册，默认 editor 角色 | 否 |
| POST | `/api/auth/login-phone` | 手机号+验证码登录 | 否 |
| GET | `/api/scenes` | 上架场景列表 | 否 |
| GET | `/api/plans` | 公开方案列表（已上架且开启分享） | 否 |
| GET | `/api/plans/:id` | 方案详情（方案 + 上架场景） | 否 |
| GET | `/api/s/:token` | 分享令牌解析（方案级 / 场景级） | 否 |
| GET | `/api/s/:token/qr` | 分享二维码 PNG | 否 |
| GET | `/api/admin/projects` | 全部客户项目（含方案数/场景数） | Bearer |
| GET | `/api/admin/projects/:id` | 客户项目详情（含方案列表） | Bearer |
| POST | `/api/admin/projects` | 新建客户项目（名称/有效期/置顶等） | Bearer |
| PUT | `/api/admin/projects/:id` | 更新客户项目 | Bearer |
| DELETE | `/api/admin/projects/:id` | 删除客户项目（方案自动归默认客户） | Bearer |
| POST | `/api/admin/projects/logo` | 上传客户 Logo（自动压缩 WebP） | Bearer |
| GET | `/api/admin/users` | 用户列表（仅 admin） | Bearer |
| POST | `/api/admin/users` | 创建子账号（仅 admin） | Bearer |
| PUT | `/api/admin/users/:id` | 编辑用户（角色/状态/用户名/手机号） | Bearer |
| DELETE | `/api/admin/users/:id` | 删除用户（不能删自己、不能删最后一个 admin） | Bearer |
| POST | `/api/admin/users/:id/reset-password` | 重置密码 | Bearer |
| GET | `/api/admin/plans` | 全部方案 | Bearer |
| POST | `/api/admin/plans` | 新建方案（自动生成分享令牌） | Bearer |
| PUT | `/api/admin/plans/:id` | 更新方案（`regenerateShareToken:true` 刷新令牌） | Bearer |
| DELETE | `/api/admin/plans/:id` | 删除方案（场景自动归默认方案） | Bearer |
| POST | `/api/admin/plans/cover` | 上传方案封面（自动压缩 WebP） | Bearer |
| GET | `/api/admin/scenes` | 全部场景 | Bearer |
| POST | `/api/admin/scenes` | 新建场景（支持 planId / shareEnabled） | Bearer |
| PUT | `/api/admin/scenes/:id` | 更新场景 | Bearer |
| DELETE | `/api/admin/scenes/:id` | 删除场景 | Bearer |
| POST | `/api/admin/upload` | 上传全景图 | Bearer |
| GET | `/api/admin/storage` | 读取存储配置（不回传密钥） | Bearer |
| PUT | `/api/admin/storage` | 保存存储配置（密钥留空保持不变） | Bearer |
| POST | `/api/admin/storage/test` | 测试存储连接（可传表单配置） | Bearer |

## 数据与存储

- 数据库：`server/data/panorama.db`（SQLite，自动创建）
- 图片：本地模式存于 `server/data/uploads/`，云端模式直传对象存储（删除场景时同步清理对应对象）
- 以上目录已被 gitignore，不进入版本库
