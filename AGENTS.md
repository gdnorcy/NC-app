# 注意事项

- 每次改动完成后，都必须创建一个对应的 git commit，以便后续追踪和回滚。
- 每次改动后，都必须编写或更新相关测试，并在交付给用户前，确保所有测试和验证全部通过。

# 构建部署规范（强制）

## 前端修改后必须执行

1. **清理旧产物并重新构建**：`npm run build:admin`
   - 该命令会自动删除 `server/public/admin/assets` 和 HTML 文件，再执行 vite build
   - 禁止直接 `npm run build` 而不清理，否则旧 chunk 文件残留会导致浏览器缓存问题

2. **验证构建产物**：`npm run verify`
   - 检查 HTML 文件存在
   - 检查 HTML 引用的所有 JS/CSS 文件存在
   - 检查关键功能代码已打包（全端渠道、小程序管理等）
   - 检查是否有重复旧版本 chunk

3. **重启服务器**（仅后端修改时需要）：`npm run restart`

4. **浏览器端验证**：强制刷新（`Cmd+Shift+R`）或用无痕模式验证功能

## 缓存策略

- HTML 文件：`Cache-Control: no-cache`（每次重新验证）
- JS/CSS 资源：`Cache-Control: public, max-age=31536000`（1年强缓存，文件名带内容哈希）
- 因为 JS 文件名带哈希，每次构建内容变化时文件名自动变化，浏览器会加载新文件
- **关键**：必须确保 HTML 引用的是最新的 JS 文件名，所以构建前必须清理旧产物

## 常用命令

```bash
# 构建管理后台（清理+构建）
npm run build:admin

# 构建移动端H5
npm run build:mobile
# 注意：智能名片H5产物需同步到 server/public/card（uni-app 构建输出在 web-app/dist/build/h5）：
#   cp web-app/dist/build/h5/index.html server/public/card/index.html
#   cp -R web-app/dist/build/h5/assets/* server/public/card/assets/

# 构建全部
npm run build:all

# 验证构建产物
npm run verify

# 重启服务器
npm run restart

# 运行测试
npm test
```

## 交付前检查清单

- [ ] 前端代码已重新构建（`npm run build:admin`）
- [ ] 构建产物验证通过（`npm run verify`）
- [ ] 后端测试通过（`npm test`）
- [ ] 服务器已重启（如有后端修改）
- [ ] 浏览器端功能验证通过（无痕模式）
- [ ] 已创建 git commit

# 历史问题与预防规范

## 问题1：旧版本HTML文件残留导致用户访问旧版本（2026-09-06）

**现象**：新增功能（全端渠道）在开发者浏览器正常，但用户浏览器看不到，换浏览器也不行。

**根因**：`web/dist/` 下存在旧版本的 `admin.html`、`customer.html`（早期原生JS版本），`express.static` 静态中间件优先返回旧文件，用户访问 `/customer.html` 得到旧版本。

**预防规范**：
1. 页面迁移到新框架后，**必须删除旧入口文件**（源文件和构建产物）
2. **必须从vite配置中移除旧入口**，避免重新构建时生成旧文件
3. **必须添加301重定向**：旧URL → 新URL（如 `/customer.html` → `/customer`）
4. 交付前用 `curl` 验证所有入口URL返回的是最新版本

## 问题2：Service Worker缓存管理后台页面（2026-09-06）

**现象**：服务器设置了no-cache，但浏览器仍返回旧版本。

**根因**：Service Worker使用 `stale-while-revalidate` 策略缓存了所有页面，绕过HTTP缓存头。

**预防规范**：
1. Service Worker的缓存策略**必须排除管理后台路径**（`/admin`、`/customer`）
2. 修改SW策略后**必须升级版本号**，触发旧缓存清理
3. 管理后台类页面**不应该被Service Worker缓存**

# UI设计规范（强制）

## 设计令牌

| 令牌 | 值 | 用途 |
|------|-----|------|
| 主色 | `#165DFF` | 品牌主色、选中态、按钮、链接 |
| 成功色 | `#00B42A` | 成功状态、通过 |
| 警告色 | `#FF7D00` | 警告、待处理 |
| 危险色 | `#F53F3F` | 错误、删除、危险操作 |
| 页面背景 | `#F7F8FA` | 页面主背景 |
| 卡片背景 | `#FFFFFF` | 卡片、弹窗、面板 |
| 主文字 | `#1D2129` | 标题、正文 |
| 次文字 | `#4E5969` | 次要信息 |
| 辅助文字 | `#86909C` | 说明、占位、禁用 |
| 边框色 | `#E5E6EB` | 分割线、边框 |
| 圆角 | `8px` | 卡片、按钮、输入框、菜单背景块 |
| 卡片内边距 | `20px` | 标准卡片padding |
| 卡片间距 | `16px` | 卡片之间gap |

## 侧边栏菜单规范（图2风格）

所有后台（总后台/客户后台）菜单必须统一使用圆角背景块风格：

- **菜单项高度**：44px，行高44px
- **菜单项圆角**：8px
- **菜单项间距**：margin-bottom: 4px
- **侧边栏内边距**：padding: 8px 12px
- **默认态**：文字 `#4E5969`，无背景
- **Hover态**：背景 `#F2F3F5`，文字 `#1D2129`
- **选中态**：背景 `#E8F3FF`，文字 `#165DFF`，font-weight: 500
- **子菜单项**：高度40px，padding-left: 48px，字号13px
- **图标尺寸**：18px，图标与文字间距10px
- **分组标题**：字号11px，颜色 `#909399`，大写，padding: 12px 12px 6px

**禁止**：纯文字变色无背景块的传统菜单样式。

## 图标规范

### 基础标准

- **图标库**：统一使用项目专属SVG图标库（`web-admin/src/assets/icons/svg/`）
- **画布**：24×24px，2px安全边距
- **描边**：统一2px，禁止粗细不一
- **圆角**：统一3px，圆角端点，禁止直角端点
- **色彩**：全部使用 `currentColor`，禁止硬编码色值
- **状态**：常态（线性灰色）/ 激活态（主色）/ 禁用态（40%透明度）
- **PC端组件**：`SIcon.vue`，尺寸：small 16px / default 18px / large 20px / xlarge 32px
- **小程序端组件**：`SIcon.vue`，base64 SVG支持动态变色，尺寸：small 18 / default 20 / large 24 / xlarge 32
- **双端统一**：同一业务语义必须使用同一图标，禁止PC和小程序用不同图标
- **禁止**：emoji当图标、混用多个图标库、彩色/渐变/立体图标

### 场景使用标准

| 场景 | 尺寸 | 背景块 | 颜色 | 示例 |
|------|------|--------|------|------|
| 侧边栏菜单 | 18px (default) | 无 | 默认`#4E5969`，选中`#165DFF` | 工作台、应用中心 |
| 应用卡片（应用中心/解决方案） | 32px (xlarge) | 56×56px，14px圆角，主色6% | 默认`#4E5969`，hover`#165DFF` | 360全景、智能名片 |
| 渠道卡片（全端渠道） | 32px (xlarge) | 56×56px，14px圆角，主色6% | 默认`#4E5969`，hover`#165DFF` | 微信小程序、H5 |
| 统计卡片（工作台） | 18px (default) | 44×44px，10px圆角，语义色10% | 对应语义色 | 成员(绿)、消费(橙) |
| 列表/表格行内 | 16px (small) | 无 | `#86909C`或主色 | 操作按钮、状态 |
| 按钮内图标 | 16px (small) | 无 | 继承按钮文字色 | 新建、编辑 |
| 弹窗/表单图标选择器 | 18px (default) | 40×40px，8px圆角 | 默认`#4E5969`，选中`#165DFF` | 解决方案图标选择 |

### 背景块规范

- **应用/渠道卡片**：56×56px，14px圆角，背景`rgba(22,93,255,0.06)`，hover时`rgba(22,93,255,0.12)`
- **统计卡片**：44×44px，10px圆角，背景为语义色10%透明度（蓝/紫/绿/橙）
- **列表项**：28×28px，6px圆角，背景`rgba(22,93,255,0.06)`
- **hover交互**：背景块加深 + 图标颜色切换为主色，过渡0.2s

### 已有图标库（36个）

**业务语义（14个）**：user入驻个人、building入驻企业、team员工团队、market人脉集市、exchange名片交换、pool公海客户、radar访客雷达、customer客户管理、audit审核管理、key绑定口令、chart数据统计、settings系统设置、template模板管理、dynamic内容动态

**功能图标（22个）**：dashboard工作台、apps应用中心、orders账单、wallet钱包、storage存储、sms短信、panorama全景、card名片、channel渠道、devices多设备、solutions方案、users用户、logs日志、crown皇冠、no-ads无广告、badge徽章、analytics分析、palette调色板、wechat微信、mobile手机、official公众号、pc电脑

### 新增图标流程

1. 在`web-admin/src/assets/icons/svg/`创建SVG文件（24×24画布，2px描边，3px圆角，currentColor）
2. 复制到`web-app/src/static/icons/`
3. 在小程序端`SIcon.vue`的`svgMap`中添加path映射
4. 在上方"已有图标库"清单中登记
5. 构建验证：`npm run build:admin` + `npm run build:h5`

## 弹窗/表单规范

- **新建/编辑页面**：优先使用整页表单，不使用弹窗（字段较多时）
- **简单确认操作**：使用弹窗（删除确认、重置密码等）
- **弹窗宽度**：最小400px，最大600px
- **弹窗圆角**：8px，头部padding 20px，底部操作栏右对齐
- **表单标签**：宽度140px，右对齐
- **必填项**：红色星号标记
- **按钮**：主按钮 `#165DFF`，次按钮白底灰边，危险按钮 `#F53F3F`

## 页面布局规范

- **布局结构**：左侧可折叠侧边栏 + 顶部Header（面包屑）+ 主内容卡片
- **主内容区**：padding: 20px，背景 `#F7F8FA`
- **卡片**：白色背景，8px圆角，20px内边距，柔和低透明度阴影
- **表格**：细边框，行高48px，hover底色 `#F7F8FA`
- **空状态**：友好提示文字 + 引导操作按钮
- **动效**：仅保留hover、弹窗淡入过渡，禁止花哨动画
