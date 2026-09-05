# 360 全景浏览器

H5 / Web 同步的 360 全景浏览系统：前台全景查看器 + 管理后台 + Node 后端。

## 功能

**展示端（H5 + Web）**
- equirectangular 全景图浏览（Three.js）
- 桌面：鼠标拖拽旋转、滚轮缩放；移动端：单指拖拽、双指捏合
- 陀螺仪沉浸模式（移动端）、自动旋转、全屏
- 场景列表切换、加载进度、响应式适配

**管理后台（/admin）**
- 登录认证（JWT）
- 场景新增 / 编辑 / 删除 / 上架下架
- 全景图上传（JPG / PNG / WebP，≤50MB）
- 排序调整（上移 / 下移 / 排序值）

**后端**
- Node + Express + SQLite（`node:sqlite`，零原生依赖）
- 图片本地存储（`server/data/uploads/`）

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

## API 概览

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/api/auth/login` | 登录，返回 token | 否 |
| GET | `/api/scenes` | 上架场景列表 | 否 |
| GET | `/api/admin/scenes` | 全部场景 | Bearer |
| POST | `/api/admin/scenes` | 新建场景 | Bearer |
| PUT | `/api/admin/scenes/:id` | 更新场景 | Bearer |
| DELETE | `/api/admin/scenes/:id` | 删除场景 | Bearer |
| POST | `/api/admin/upload` | 上传全景图 | Bearer |

## 数据与存储

- 数据库：`server/data/panorama.db`（SQLite，自动创建）
- 图片：`server/data/uploads/`（删除场景时同步清理对应文件）
- 以上目录已被 gitignore，不进入版本库
