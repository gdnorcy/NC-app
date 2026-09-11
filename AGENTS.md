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
# 前端单元测试（web-admin 权限矩阵 + web-app 工具/API 层）
npm run test:frontend
```

## 前端测试规范（2026-09-07 新增）

- **范围**：web-admin（`web-admin/src/**/*.test.js`）、web-app（`web-app/src/utils/**/*.test.js`）
- **工具**：vitest@3（node 环境，兼容 vite5）；web-app 测试通过 `vi.stubGlobal('uni', ...)` mock uni 全局
- **高价值测试对象**：多租户权限矩阵（menuPermissions）、品牌色渐变（color）、C 端 API 封装（cardApi：URL 前缀/鉴权头/响应解包/错误 reject/401 跳转）
- **新增纯函数/工具必须配测试**；新增组件逻辑若可提取为纯函数，优先提取并配测试
- **交付前**：`npm run test:frontend` 必须全部通过（当前 23 项基线）

## 交付前检查清单

- [ ] 前端代码已重新构建（`npm run build:admin`）
- [ ] 构建产物验证通过（`npm run verify`）
- [ ] 后端测试通过（`npm test`）
- [ ] 前端单元测试通过（`npm run test:frontend`）
- [ ] 服务器已重启（如有后端修改）
- [ ] 浏览器端功能验证通过（无痕模式）
- [ ] 已创建 git commit

# 解决方案应用架构规范（强制）

## 方案化两级权限模型（2026-09-08 确认）

**方案 = 组合包，不是应用**：

1. **应用（apps 表）是平台级功能单元**：360全景(panorama)、智能名片(card) 已由解决方案沉淀为应用；未来新增应用直接 INSERT apps，并在 app_menus 登记其功能菜单（module/key/label/sort_order）。
2. **解决方案（solutions 表）是组合包**：一个方案可勾选多个应用；内置 panorama/card 方案已下架（status='off'），由「演示试用方案」(code='demo', is_demo=1, status='on') 承接，自动纳入全部应用且菜单全量授权（solutionDetail 动态计算，新增应用/菜单自动生效，无需落库）。
3. **两级权限**：应用级勾选存 `solution_apps`（solution_id, app_id, enabled）；菜单级授权存 `solution_permissions`（含 app_id，按 app_id+key 落库）。
4. **新增应用/菜单规则**：自动出现在所有方案权限配置中；普通方案默认不勾选（solutionDetail 动态补齐 enabled=false）；演示方案自动全勾选。
5. **权限接口契约**：`PUT /:id/permissions` body = `{ apps:[{code,enabled}], menus:[{appCode,key,enabled}], allPermissions }`；solutionDetail 返回 `appPermissions:[{code,name,icon,enabled,menus:[{module,moduleLabel,key,label,enabled}]}]`。
6. **租户授权判定**：`tenant.js hasSolution` 兼容「直接开通 code」与「开通含该应用的组合包方案」（经 solution_apps 查询）。
7. **保存权限时必须传全量 apps+menus**（整体替换）；`allPermissions=true` 表示当前与未来全部应用/菜单开放。

## 应用内 Tab 模式（2026-09-07 确认）

每个解决方案（应用，如智能名片、360全景）的业务管理页面，**统一收敛在应用内 Tab 导航**，侧边栏保持精简：

1. **应用入口 → 应用内首个 Tab（默认页）**：从应用中心点击进入解决方案后，默认展示该应用的核心页（数据洞察或主业务页），不再落在应用列表首页。
2. **应用内 Tab 承载业务子功能**：数据洞察、业务管理、配置等全部作为应用内 Tab（复用 `CardTabs.vue` 模式：圆角块导航、激活态主色、横向滚动）。
3. **侧边栏禁止新增应用级菜单**：客户后台侧边栏只保留顶层模块（工作台、应用中心、套餐与续费、我的账单、成员管理、系统设置）。"XX洞察"、"XX管理"等应用专属入口**一律放应用内 Tab**，不得出现在侧边栏。
4. **未开通应用不显示入口**：应用级页面收敛到应用内后，未开通该解决方案的租户天然看不到相关菜单（入口收敛到应用卡片）。
5. **新增解决方案必须遵循**：开发新解决方案时，先建应用内 Tab 导航结构（默认页 + 业务 Tab），再考虑是否有跨应用的必要才提升到侧边栏；默认不提升。

## 前端 API 调用规范（防重复踩坑）

- `adminApi` baseURL=`/api/admin`、`customerApiCall` baseURL=`/api/customer`，调用时 **URL 不得重复前缀**（写 `/card/templates` 而不是 `/api/admin/card/templates`）。
- 响应拦截器已解包（返回 `res.data`），组件内直接取 `res.xxx`，**禁止再写 `res.data.xxx`**。
- 错误处理：拦截器已 reject 为字符串，`catch (e)` 直接 `ElMessage.error(e || '默认提示')`，**禁止** `e.response?.data?.error`。
- 新增页面调用前先确认所用 API 实例的 baseURL 与拦截器行为，参照现有页面（如 Analytics.vue、TemplateLibrary.vue）。

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

## 问题3：API 前缀重复与响应解包误用导致页面空态/404（2026-09-07）

**现象**：模板库页面请求 404、保存后列表仍显示"暂无数据"。

**根因**：`adminApi`/`customerApiCall` 已内置 `/api/admin`、`/api/customer` 前缀且响应拦截器已解包；新页面按习惯写了完整路径与 `res.data.xxx`，导致 URL 重复前缀 404、列表取值为 undefined。

**预防规范**：
1. 新页面 API 调用前，先看 `web-admin/src/api/index.js` 中对应实例的 baseURL 与拦截器（见"前端 API 调用规范"）
2. 交付前在浏览器 Network 面板确认请求 URL 正确、状态 2xx
3. 页面空态时优先排查取数链路（URL 前缀、响应解包）而非后端

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

## 应用内二级页页头规范（2026-09-08 确认）

所有应用（智能名片、零壹系统云等）的二级 Tab 页面，页头**必须统一**使用共享组件 `web-admin/src/components/AppPageHeader.vue`（图1 标准），禁止各页面自行写 `.page-header/.page-title/.page-desc`：

- **结构**：`<AppPageHeader title="XX" desc="XX">`，右侧操作（筛选/按钮/统计）放默认插槽
- **间距**：页头与上方 CardTabs 间距 16px（margin-bottom: 16px）
- **标题**：20px / font-weight 600 / `#1D2129`，行高 1.4
- **描述**：13px / `#86909C`，与标题间距 4px，行高 1.5
- **右侧操作区**：flex 水平排列，gap 12px，垂直居中
- **新页面必须使用**：新增应用内二级页面时，直接引入 AppPageHeader，不得新建页面级页头样式；CardTabs 只放应用内 Tab 导航，页头由页面组件承载

## 平台默认渠道卡片规范（2026-09-08 更新）

方案/项目「默认平台」渠道选择统一为**图标卡片横排**（参考图2 样式）：

- **布局**：`display: flex; flex-wrap: wrap; gap: 12px`（宽屏单行横排，窄屏自动换行）
- **卡片**：`flex: 1 1 100px; max-width: 112px`，1px `#E5E6EB` 边框，8px 圆角，内边距 14px 10px 12px，flex 纵向居中
- **图标块**：48×48px，12px 圆角，`rgba(22,93,255,0.06)` 背景，图标 `SIcon size="xlarge"`（32px），默认灰 `#4E5969`，选中主色
- **排序**：已开通渠道在前、未开通（开发中）渠道在后
- **选中态**：主色边框 + `#F7FBFF` 背景 + 右上角 18px 圆形主色 ✓ 角标
- **禁用态**：opacity 0.55，灰底，右上角「开发中」el-tag，不可点击
- **说明文字**：`.platform-help` 独立一行在卡片区正下方（margin-top 10px），不与卡片同行、不放在右侧

## 财务菜单规范（2026-09-08 更新）

- 总后台侧边栏统一为「财务管理」单一菜单（`/finance`），页内 el-tabs 页签承载「支付管理」「发票管理」「平台支付配置」；组件 `web-admin/src/views/admin/FinanceAdmin.vue`，平台支付配置独立组件 `PlatformPayConfig.vue`
- 旧路径 `/payment`、`/invoices` 保留兼容（重定向到 FinanceAdmin 对应页签），侧边栏不再出现单独菜单
- 新增财务类子页面时，一律并入 FinanceAdmin 页签，不得新增侧边栏菜单项
- 计费套餐（billing_plans）菜单/路由/页面已删除（2026-09-08）；租户续费走解决方案价格体系（/billing/solution-plan、/billing/solution-purchase），billing_plans 后端 API 兼容保留不参与新流程

# 应用中心与系统设置规范（2026-09-08 确认）

## 总后台应用中心（/apps-center）

- 应用 = apps 表（360全景 panorama / 智能名片 card / 全端渠道 channel / 未来新增应用）；解决方案是组合包，应用才是功能单元。
- 应用分类表 app_categories 预置 8 个分类（默认分类/基础功能/全端渠道/营销引流/客群维护/行业应用/高级功能/管理工具），可编辑、可新增、可删除（分类下有应用时禁止删除）。
- 应用归属用分类**中文名**（apps.category 存分类 name，禁止存英文 code）；未归类的应用兜底显示在「默认分类」。
- 应用卡片操作：修改分类 / 编辑应用 / 拖拽位置（同分类拖拽排序，`PUT /api/admin/apps-center/sort`）；有独立管理页的应用（如 channel）显示「进入管理」。
- 新增应用：INSERT apps（含 category），并登记 app_menus 功能菜单（方案权限模型要求每个应用有菜单），演示方案自动纳入。
- 总后台侧边栏不再有独立「全端渠道」菜单；渠道管理入口 = 应用中心 → 全端渠道卡片 → 进入管理（/channel）。

## 系统设置（/settings，页面内选项卡）

- 总后台「基础设置」菜单已改「系统设置」，8 个页签：基础设置 / 存储设置 / 短信接口 / 支付设置 / 安全设置 / 开放平台 / 第三方平台配置 / 平台默认配置。
- 第三方平台配置（微信 component 表单）与平台默认配置已从全端渠道页迁入；新增设置类子页一律并入 SystemSettings 页签，不得新增侧边栏菜单。
- 旧路由 /settings/basic、/settings/storage、/settings/sms、/settings/payment、/settings/security、/settings/open、/channel/defaults 均重定向到 /settings?tab=xxx。
- 嵌入 tabs 的子组件隐藏自身 .page-header（保存按钮保留在内容区）；ChannelDefaults 支持 embedded prop（隐藏返回按钮，保存按钮置顶右对齐）。

## 租户工作台「我的应用」与应用中心

- 工作台「我的应用」显示真实开通应用：解决方案（组合包）展开为应用清单（demo 演示方案动态纳入全部应用；普通方案经 solution_apps），**demo 方案本身不显示**。
- 应用指标按应用区分：panorama = 方案/场景；card = 企业员工（users.enterprise_id 非空）/企业客户（card_customer）；channel = 渠道配置（channel_apps）。
- 租户应用中心（/apps）由后端 `GET /api/customer/apps` 返回方案展开后的应用清单，前端不再把方案 code 当应用展示；演示方案不出现。
- 租户端侧边栏折叠样式与总后台统一：折叠时图标居中（padding 0、justify-content center、s-icon margin-right 0），el-sub-menu 折叠弹层。

## 租户端应用中心分类与拖拽（2026-09-08 更新）

- 租户应用中心（/apps）与总后台应用中心同构：左侧「功能分类」导航（圆角背景块、选中主色、带数量角标，只显示当前租户有已开通应用的分类，分类顺序与总后台一致）+ 右侧分类应用卡片区（「XX 共 N 个应用」+ 卡片 grid）。
- 应用卡片样式与总后台一致（56×56 图标块 + 名称 + code + 描述），操作仅保留「进入应用」；**不迁移**总后台的管理操作（修改分类/编辑/新建）。
- 租户卡片支持 HTML5 拖拽排序（`:draggable="true"`，必须显式 true，空属性不生效），同分类内拖拽，完成后 `PUT /api/customer/apps/sort`（body `{codes:[...]}`）整体覆盖保存；排序存 `customer_app_sorts`（customer_id, app_code, sort_order）按租户隔离。
- `GET /api/customer/apps` 返回租户方案展开的应用清单（含 category 分类中文名），排序规则：租户自定义顺序优先（未自定义的按平台 apps.sort_order）。
- 总后台应用中心「拖拽位置」与租户端拖拽语义一致：都是同分类内卡片排序（总后台存 app_categories/apps 内顺序，租户存 customer_app_sorts）。

## 租户端侧边栏折叠（2026-09-08 更新）

- 折叠态 64px：顶部 logo 区显示系统名首字（.logo-text-mini，28×28 主色 6% 圆角块，无 logo 图时兜底）；底部「帮助中心」图标与「退出登录」图标水平居中（sidebar-extras/sidebar-footer 折叠态居中布局）。
- 折叠状态持久化：localStorage `customer-sidebar-collapsed`（与总后台 `admin-sidebar-collapsed` 对称），刷新保持。

## 360全景热点3D编辑（2026-09-08 新增）

- 场景编辑页右侧「全景图」区：有图时渲染 3D 球面热点编辑器 `web-admin/src/components/HotspotEditor.vue`（three.js SphereGeometry(500) scale(-1,1,1) 内视球 + 相机球心公转，与 H5 端 PanoramaViewer 同模型）。
- 交互三件套：① 拖动画面旋转视角（lon/lat 相机球坐标，phi=90-lat, theta=lon）；② 点击画面添加热点——Raycaster 球面交点 → 逆运算 hotspotDir 得 yaw/pitch → emit('add-at')，父级弹窗角度自动填充，无需手填；③ 点击/拖动热点标记——标记为球面方向 485 半径上的小球 mesh（type=info 橙色 / type=scene 蓝色），点标记 emit('select') 进入编辑，拖动标记实时更新 yaw/pitch。
- 角度精调：编辑器底部 yaw（0-360°）/pitch（-85~85°）el-slider 滑杆，拖动时相机同步旋转（方案C补充）。
- 角度换算（与 H5 端 projectHotspots/hotspotDir 互逆）：dir=(x,y,z) → pitch=asin(y)，yaw=atan2(-z,-x)（0~360 归正）；渲染标记 dir = hotspotDir(yaw,pitch)*485。
- 新增依赖：web-admin `three@^0.185.1`（npm i three -w web-admin）。
- 三端统一：编辑端与 H5/小程序查看端共享同一 yaw/pitch 坐标模型（yaw 0°=初始视线 -X，绕 Y 右旋；pitch 向上），保证标注所见即所得。

## 360全景热点3D编辑·交互细则（2026-09-08 更新）

- **点击 vs 拖拽区分**：pointerdown 命中标记只进入拖拽模式（不弹窗），pointerup 时位移 <6px 判定为点击（emit select 打开编辑框）、位移大判定为拖动（位置已实时更新）；点击空白（无位移）才 emit add-at 添加热点。
- 标记球体：info 14 / scene 16（460px 画布上视觉约 20px+，便于点选拖拽）；拖动标记实时 raycast 球面更新 yaw/pitch 并重建标记。
- 编辑页右侧栏 520px（grid 1fr 520px），3D 画布 460px 高。

## 全景热点留资表单与线索管理（2026-09-08 新增，P0）

- **热点可挂表单**：info 热点 `hs.form = { enabled, title, fields:[{key,label,required}] }`（key ∈ name/phone/message，自定义字段进 extra）；编辑端 SceneEdit 弹窗「留资表单」开关 + 表单标题 + 收集字段勾选（el-checkbox-group），scene 类型热点暂不挂表单（点击即跳转）。
- **C 端渲染**：`web/index.html` `#hotspot-form`（三个 .hotspot-form-field 按 data-key 渲染，未配置字段加 .hidden）；`web/src/main.js` onHotspotClick info 分支按 hs.form 渲染必填/占位，提交 POST `/api/card/panorama/leads`（body `{sceneId, hotspotTitle, fields}`），成功后 `track('form_submit', {sceneId, hotspotTitle})` 打通全景漏斗第4步。
- **后端链路**：公开提交 `server/src/routes/card.js` POST `/panorama/leads`——sceneId→scenes→plans.project_id 反查租户落库 `panorama_leads`（tenant_id/plan_id/scene_id/hotspot_title/name/phone/message/extra/created_at）；租户端 `server/src/routes/customer.js` GET `/panorama/leads`（requireTenant，join plan/scene 取名，`?planId=` 筛选，`?export=csv` 带 BOM UTF-8，esc 双引号转义）。
- **前端线索页**：全景应用内 Tab「线索管理」（`Leads.vue`，PanoramaTabs 顺序：数据洞察/方案管理/线索管理），列表 + 方案筛选 + 导出 CSV；租户隔离（WHERE tenant_id）。
- **建表在 db.js 迁移**：`panorama_leads` 建表语句必须放 createDb 迁移（幂等），不能只在运行库手动建，否则测试临时库无表报 `no such table`。
- **关键纠正**：`web/` 查看端是 **vite 构建产物部署**（HTML 引用 `/assets/main-*.js` 哈希），**不是源码直出**！改 `web/src/**` 后必须 `npm run build -w web` 重新构建（产物 web/dist 被 gitignore，不入库），否则浏览器加载旧 chunk 看不到新功能（排查特征：`document.querySelectorAll('script')` 的 src 不带新代码、功能缺失但服务端文件已含新代码）。

## 全景跳转点挂表单 + 线索统一汇总 + 小程序表单（2026-09-08 P0 补充）

- **scene 跳转点可挂表单**：编辑端 scene 热点同样显示「留资表单」开关（文案「开启后访客提交线索才可跳转目标场景」）；saveHotspot 组装时 `formEnabled` 为 true 即存 form（**不要求 formFields 非空**，空时默认 `['name','phone']`，否则开关开启但字段未勾选会判空丢表单）。
- **C 端（web）**：`openHotspotPopup(hs, afterSubmit)` 统一渲染标题/内容/表单；scene 分支 `hs.form.enabled` → 弹表单，提交成功后 `afterSubmit()` 调 `jumpScene(targetSceneId)` 跳转；无 form 直接跳转。提交 handler 通过 `formBox._hs.afterSubmit` 回调。
- **小程序端（mp-weixin）**：`web-app/src/components/PanoramaViewer.vue` 热点弹窗内渲染表单（v-for fields + v-model formValues + 提交按钮），`submitHotspotForm` POST `/api/card/panorama/leads` + `track('form_submit')`；scene 热点 `h.form.enabled` 时先弹表单，提交成功 setTimeout 800ms 后 `$emit('scene-hotspot', h)` 跳转；组件新增 `sceneId` prop（viewer.vue 传 `:sceneId="currentScene.id"`），提交 sceneId 用 `h.sceneId || this.sceneId`。
- **线索统一汇总（租户后台）**：card「表单收集」页（`FormCollect.vue`，CardTabs label 已改「线索收集」）页内 el-tabs「名片表单 / 全景留资」——名片表单为原 CRUD，全景留资复用线索表格（customerApiCall `/plans` + `/panorama/leads?planId=` + 导出 CSV），AppPageHeader title「线索收集」desc「名片页表单与全景热点留资的统一线索汇总」；全景应用内「线索管理」Tab 保留（同一数据源）。
- **管理后台构建陷阱**：build:admin 清理旧 chunk 后，**浏览器 Service Worker 可能缓存旧 customer-*.js**（全景老站 sw.js scope 覆盖 /customer），导致「代码改了但页面行为不变」。排查/验证前先清 SW：`navigator.serviceWorker.getRegistrations() → unregister` + `caches.keys() → delete`，再加载；生产排查特征：页面 script src 是旧哈希名（服务端 assets 目录已无该文件）。

## SQLite datetime 写法规范（2026-09-08 新增）

- SQLite 时间函数必须写 `datetime('now')`（**单引号**）；`datetime("now")` 双引号会被 SQLite 解析为列名，报 `no such column: "now"` 导致接口 500。
- 在 JS 单引号字符串里嵌 SQL 时，SQL 内的单引号会与外层冲突：**SQL 字符串外层用双引号**（`db.prepare("UPDATE ... datetime('now') ...")`），禁止用 `sed` 直接替换引号导致 JS 语法错误。
- 历史教训：appsAdmin.js 5 处 + app-registry.js 1 处曾用 `datetime("now")`，导致应用中心「修改分类/编辑应用/拖拽位置」全部 500；修复后须 `node -c` 语法检查 + curl 实测接口。

## 应用中心拖拽排序（2026-09-08 更新）

- **总后台与租户端应用卡片必须 `:draggable="true"` 永久可拖**；禁止用 `:draggable="draggingApp !== null"` 条件拖拽（第一张卡片永远无法开始拖拽，形成死锁，拖拽功能失效）。
- 总后台「拖拽位置」按钮仅为视觉提示（点击提示"直接按住卡片拖动"），不参与拖拽模式控制。
- 同分类内 HTML5 拖拽：dragstart 记录 fromIdx → drop 目标 splice 移动 → `PUT /apps-center/sort {category, ids}`（总后台）/ `PUT /customer/apps/sort {codes}`（租户端）持久化。

## SW 缓存 HTML 导致部署后卡死（2026-09-08 更新）

- **根因**：老全景站 sw.js 曾用 stale-while-revalidate 缓存 HTML，部署后旧 HTML 引用已清理的旧哈希 JS → 404 → SPA fallback 返回 text/html → module 加载失败 → 页面卡死/无响应。
- **规范**：SW 对 **HTML/页面导航一律 network-first（永不缓存）**；只有带内容哈希的静态资源（/assets/*）可用 stale-while-revalidate；图片 /uploads 用 cache-first；/api 用 network-first。
- sw.js install **禁止** `cache.addAll(['/', '/index.html'])` 预缓存 HTML；每次改 sw 策略必须升级 VERSION 触发旧缓存清理。
- 交付前验证：浏览器清 SW 后访问 `/?plan=1&scene=N` 直达正常 + 二次刷新正常。

## 360全景热点指向样式规范（2026-09-08 新增）

- **场景级配置**：场景 meta.hotspotStyle = `{ effect: 'pulse'|'ripple'|'none', theme: 'blue'|'gold'|'orange'|'green', jumpColor, infoColor }`；主题提供双色预设，自定义色值优先。
- **跳转点**（type=scene）：主色渐变圆 + 白描边 + 白色箭头 + 标题气泡（常显，canvas 纹理内置，sprite 16x11.25）；**信息点**（type=info）：主色圆 + 白描边 + 白色「i」+ 标题气泡。
- **方位感知箭头**：跳转点带独立箭头 sprite，每帧 rotation = hotspotArrowAngle(dx,dy)（指向画面中心 v=(-dx,-dy)，`Math.atan2(-dy,-dx)-π/2`）；越靠近视角中心越透明（opacity = clamp(1-dist/0.45, 0.15, 1)）。
- **动效外圈**：独立 fx sprite（canvas 128 圆环，主色描边）：pulse=scale/opacity sin 呼吸（9.2±1.6，2.8Hz）；ripple=scale 7.6→16.6 扩散 + opacity 递减（1.8s 周期）；none=不创建。
- **纯函数三端同构**：`web/src/viewer/hotspot-style.js`、`web-app/src/utils/hotspot-style.js`、`web-admin/src/utils/hotspot-style.js` 必须保持一致（HOTSPOT_THEMES / normalizeHotspotStyle / hotspotColor / themeColors / hotspotArrowAngle），任一改动需同步三处并配测试。
- **拾取隔离**：箭头/fx sprite 归 `_hotspotExtras`，不参与射线拾取（`_hotspotSprites` 只存主 sprite）。
- **dir 必须包装 Vector3**：directionFromYawPitch 返回普通对象，存入 userData 前必须 `new THREE.Vector3(dir.x,dir.y,dir.z)`，否则 `.dot()` 崩溃。
- **小程序端**：DOM 层热点（hotspot-marker + dot + arrow + ring + label），动效用 CSS keyframes（hsPulse/hsRipple），方位角由投影像素计算（`atan2(-dy,-dx)` 转度），`_vpW/_vpH` 在 projectHotspots 记录。

## 全景坐标模型强制规范（2026-09-08 修复确认）

- **唯一权威模型**：yaw 0° = 初始视线 **-X**，绕 Y 轴右旋（yaw 增大 = 视野右转）；pitch 向上为正；dir = `[-cp·cos(yaw), sin(pitch), -cp·sin(yaw)]`。
- **四端必须一致**：web 老站 `controls.js directionFromYawPitch` / applyDrag / gyro、uni-app `panorama.js hotspotDir`、编辑器 HotspotEditor `hotspotDir/dirToAngles`、H5 查看端——任何一端改动必须同步其余端并跑测试。
- **拖拽语义**：向右拖 → yaw 增大（视野右转）；向下拖 → pitch 减小（视野下转）。gyro：gamma 正 → yaw 正；前倾 beta>90 → pitch 负。
- 判断热点位置不对时，第一排查项：目标端是否用了 -Z 旧模型（差 90°）。

## 全景场景编辑页性能规范（2026-09-08 新增）

- 编辑页 3D 预览（HotspotEditor）**禁止直接加载大图**：必须渐进加载——预览图（previewPath，<100KB）秒出可编辑 → 大图后台替换贴图（`loadSceneTextures`）。
- `renderer.setPixelRatio(min(dpr, 1.5))`；纹理宽超 2048 必须 `limitTextureSize` canvas 缩放后上传；球面几何/material 复用（只换 map + needsUpdate）。
- 场景切换（imageUrl/previewUrl 变化）必须 watch 重载纹理，不得只加载首次。
- 验收基准：编辑页从进入页面到可交互（loading 遮罩消失）应 <1s（此前 8.6s）。

## 全景热点编辑所见即所得规范（2026-09-08 更新）

- **编辑器相机必须与 H5 查看端逐字段一致**：相机在球心 (0,0,0) + `lookAt(dir(lon,lat))` + `SphereGeometry(50,64,48)` + `MeshBasicMaterial({side: THREE.BackSide})` + fov 75 + far 200；热点标记位于 `dir * (RADIUS*0.92) = dir*46`，标记球体 info 3.2 / scene 3.6。
- **禁止**编辑器相机置于球面偏移位置（曾用半径 100 绕行 + 球 500 scale(-1,1,1)），与 H5 球心相机存在视差 → 标注"所见非所得"。
- 拖拽旋转：向右拖 lon 增大（视野右转）、向下拖 lat 减小（视野下转），与 H5 applyDrag 一致；lat 语义 = 视线俯仰（正=向上看）。
- 编辑页布局 `grid-template-columns:minmax(0,1fr) 520px`，防止 520px 列把 3D 画布挤出视口。

# 分销体系规范（2026-09-08 新增）

## 插件化分销五应用（方案A）

- 5 个分销能力都是**独立应用**（apps 表，分类「分销体系」）：`dist` 二级推广分销（底座必装）/ `partner` 合伙人分红 / `share-all` 全民股东 / `share-cat` 类目股东 / `share-area` 区域股东；演示方案自动全勾（solution_apps），普通方案经方案配置勾选。
- **方案A**：钱包/提现/数据大盘放 `dist` 应用内 Tab（`/apps/dist`，页面内 el-tabs：分销配置/分销商/佣金明细/溯源记录/钱包提现/数据大盘）；其它 4 个应用各管各的配置与成员（P0 为占位页 `/apps/partner|share-all|share-cat|share-area`，P1 实现）；小程序「分销中心」做全量聚合展示。
- 老简版 distribution_commission 佣金逻辑已废弃删除（不再写入），新绑定走 `POST /api/customer/card/distribution/bind`（静默绑定，parentId + identityType）。
- 溯源绑定从 platform_user.parent_id 无租户维度改为 **(tenant_id + user_id)** 维度（dist_user_relation，首次进入永久锁定、防环向上查 20 层）；钱包 **dist_wallet 三键隔离 (tenant_id, user_id, identity_type)**，identity_type = individual / employee，双身份收益完全隔离。

## P0 落库 7 张表（金额统一「分」整数）

- sys_tenant_plugin / dist_config / dist_user_relation / dist_order_split / dist_user_log / dist_wallet / dist_withdraw（PRD 中 dist_partner/dist_share_all/dist_share_cat/dist_share_area 4 张成员表属 P1，未建）。
- **dist_user_log 无 updated_at 列**（只 created_at）——UPDATE 语句禁止带 updated_at。
- **node:sqlite DatabaseSync 无 .transaction()**——distribution.js 用 `tx(fn)` 手写 BEGIN/COMMIT/ROLLBACK。
- 分账以订单支付成功触发（payment.js handlePaymentSuccess → computeOrderSplit，幂等 tenant_id+order_id 唯一）；退款 refundOrder → rollbackOrderSplit（不删原记录，流水置 charged_back + 负数扣回，余额不足记欠款文案）；T+N 结算 settleDueOrders 由 index.js 每 10 分钟定时 + 管理端手动触发。
- 提现状态机：pending →(approve)→ approved →(done)→ done；reject 退余额带原因。二次回滚/幂等返回必须带 split（return split 而非 undefined，否则调用方解构崩溃）。
- 租户后台路由 `/api/customer/distribution`（本地 tenant 中间件，adminExpireMode=allow 时只读放行）；C 端 `/api/customer/card/distribution/*`。
- 管理端页面 `web-admin/src/views/customer/apps/dist/DistHome.vue`；纯函数抽到 `web-admin/src/utils/distFormat.js`（fen 分转元/来源/类型/状态映射），改动必须同步测试 `distFormat.test.js`。
- 5 个图标：dist/partner/share/category/area.svg（web-admin/src/assets/icons/svg + web-app/src/static/icons + 小程序 SIcon svgMap 三处同步，24 画布/2px 描边/3px 圆角/currentColor）。

## 池式分红 P1（2026-09-08 新增）

- 4 张成员表（均在 db.js seedDistribution 内建，tenant_id 隔离）：dist_partner（ratio 权重 + mode 1团队/2全局）、dist_share_all（weight）、dist_share_cat（category_id 存 card_profile.business_field + ratio + weight）、dist_share_area（area_code 存 card_profile.city + ratio + weight）；同类成员唯一索引 (tenant_id, +维度, user_id)。
- **computeOrderSplit 调度器**：任一插件启用即参与分账（不再以 dist 为总开关）；顺序 dist→partner→share-all→share-cat→share-area；订单买家行业/地区取 `card_profile.business_field / city`；全部收益统一受 dist_config.max_total_ratio 裁剪。
- 合伙人团队判定 `isInTeam`：沿 buyer 的 dist_user_relation.pid1 链向上查 20 层是否命中合伙人。
- **权重分配注意**：partner 表权重列是 `ratio`（非 weight），分配器 allocatePool 须传 weightKey='ratio'；share-* 用 'weight'。
- 插件专属配置存 sys_tenant_plugin.config JSON：partner {mode, poolRatio}、share-all {mode 1均等2权重, poolRatio, requireDist}；setPluginConfig 白名单合并不覆盖。
- 成员管理接口 `/api/customer/distribution/{partners|share-all|share-cat|share-area}`（GET 列表 / POST 添加 / DELETE 移除；share-cat 与 share-area 支持 ?categoryId= / ?areaCode= 过滤，DELETE 路径带维度+userId）；添加校验用户存在、重复拒绝；移除只置 status=0（历史流水与快照保留）。
- C 端 `GET /api/card/distribution/summary` 必须返回 isPartner/shareTags/partnerPending/partnerTotal/sharePending/shareTotal（shareTags 由 getSummary 生成：全局合伙人/团队合伙人/全民股东/行业-XX股东/地区-XX股东）——漏字段会导致小程序分销中心模板 `summary.shareTags.length` 白屏。
- 前端 4 个配置页：web-admin/src/views/customer/apps/dist/{PartnerHome,ShareAllHome,ShareCatHome,ShareAreaHome}.vue（AppPageHeader + 插件开关 + 配置表单 + 成员表格/分组）；数据大盘 stats 新增 bonusByType（partner/share_all/share_cat/share_area）+ 各成员计数卡片。
- 小程序分销中心 distribution.vue：合伙人模块（isPartner 才显示）+ 股东中心（shareTags 标签组 / 无身份提示 + 待分红/累计），收益明细 Tab 已含 partner/share_all/share_cat/share_area。

## 推广二维码 P2（2026-09-08 新增）

- 后端 `GET /api/card/distribution/qrcode`（auth；未入驻返回 `{ok:false, error:'未入驻任何租户，暂无法生成推广码'}` 而非 403）：用 `qrcode` 库（server 已有依赖）生成 dataURL（margin1/320px/M），shareUrl = `buildShareUrl(userId, origin)` = `{origin}/card/#/pages/card/cardDetail?id={userId}&inviter={userId}`；纯函数 `buildShareUrl` 在 services/distribution.js 模块级导出（routes 里要用模块导出，不要用服务实例 svc 访问——曾导致 500）。
- C 端绑定入口不变：`POST /distribution/bind`（sourceType='qrcode'，首次永久锁定/防环/双身份已覆盖）。
- 扫码落地静默绑定：cardDetail.vue onMounted 读 `options.inviter`，已登录且非本人 → distBind；未登录 → 暂存 `pendingInviter`，myCard.vue onMounted 登录态补绑（绑定后即删）。
- 小程序分销中心：推广模块改为「我的推广二维码」弹层（qr-mask 遮罩 + qr-img 二维码 + 复制推广链接 + 关闭）+「复制推广链接」按钮；uni-button 在 H5 端 bu.click ref 可能不触发，浏览器实测用 JS dispatchEvent(MouseEvent('click'))。
- cardApi 新增 `distQrcode: () => request('/distribution/qrcode','GET')`。

## 提现打款登记 P2（2026-09-08 新增）

- dist_withdraw 增 pay_no/pay_remark 列（幂等迁移：**必须放在 db.exec(\`...\`) SQL 模板字符串之外**，用 colExists 检查后单独 ALTER TABLE；误插入 exec 内会报 `near "/": syntax error`）。
- `reviewWithdraw(id, action, reason, payNo, payRemark)`：done 分支必填 payNo（缺流水号返回 `{ok:false,error:'请填写打款流水号'}`），落库 pay_no/pay_remark/paid_at；已 done 不可重复打款。
- 路由 `POST /withdraws/:id/review` body 透传 payNo/payRemark。
- 租户后台 DistHome 钱包提现 Tab：表格加「打款信息」列（done 显示 流水号·备注）；approved 行操作「登记打款」弹窗（流水号必填 + 备注选填）→ submitPay 调 review(done)；payBox reactive 状态管理。
- 测试用例：P2 打款登记（approve→done 落库、缺流水号拒绝、重复打款拒绝），distribution.test.js 23 用例。

## 提现对账导出 + 端到端演示数据（2026-09-08 新增）

- `GET /distribution/withdraws?export=csv`：租户后台提现对账导出（BOM UTF-8 + 12 列：单号/用户/身份/金额/手续费/实到/状态/提交时间/打款时间/流水号/备注/驳回原因）；CSV 生成抽为模块级纯函数 `buildWithdrawCsv(rows)`（services/distribution.js），路由 import 后 `res.send(buildWithdrawCsv(rows))`；金额分转元两位小数、含引号字段 `""` 转义、状态中文化。
- 前端 DistHome 钱包提现 Tab 头部「导出对账」按钮：`customerApiCall.get('/distribution/withdraws', { params:{export:'csv'}, responseType:'blob' })` → Blob 下载 `提现对账-YYYY-MM-DD.csv`。
- **分账入参必须是 toOrder 映射后的 camelCase 对象**（order.payerType/customerId/userId...），直接传 DB snake_case 行会因 `order.payerType` undefined 静默 return null 不产生分账——演示脚本踩坑。
- 端到端演示：`node scripts/dist-demo-seed.mjs`（幂等）——启用 5 插件 + 配 4 类成员（合伙人 user3 ratio0.3 团队 / 全民 user4 / 类目 user5 互联网/SaaS / 区域 user6 东莞）+ 买家 user2 绑 pid1=3 + 造 100 元订单触发全插件分账；验证 dist_order_split/dist_user_log/dist_wallet 三表闭环。
- 测试：buildWithdrawCsv 用例（BOM/表头/分转元/引号转义/状态中文化），distribution.test.js 24 用例。

## 提现批量审核 + 佣金明细导出（2026-09-08 新增）

- `POST /distribution/withdraws/batch-review` body `{ids:[], action:'approve'|'reject', reason}`：租户后台批量审核；reject 必须带 reason；服务层逐笔 reviewWithdraw 循环（部分失败返回 `{okCount, failCount, errors}`）；仅 pending 行可勾选。
- `GET /distribution/logs?export=csv`：佣金/分红明细全量导出（BOM + 7 列：用户/身份/收益类型/金额/状态/订单号/时间；类型与状态中文化 LOG_TYPE_ZH/LOG_STATUS_ZH；负数扣回保留）；纯函数 `buildLogCsv(rows)` 模块级导出。
- 前端 DistHome：钱包提现 Tab 表格加 selection 列（`selectable` 仅 pending）+ 批量操作条（批量通过/批量驳回，驳回用 ElMessageBox.prompt 填原因）；佣金明细 Tab 页头加「导出明细」按钮（Blob 下载 `佣金明细-YYYY-MM-DD.csv`）。
- 测试：批量审核（两笔 approve）+ buildLogCsv（BOM/表头/中文化/负数），distribution.test.js 26 用例。

## 分销关系树 + 月度佣金汇总（2026-09-08 新增）

- `GET /distribution/tree`：租户分销关系树（dist_user_relation 全量 + 身份标签）；纯函数 `buildRelationTree(relations, tagMap)`（模块级导出）——根 = 无 pid1 或 pid1 不在关系集的节点，防环 guard 20 层，children 按 pid1 展开；标签来自 dist_partner（合伙人）/dist_share_all（全民股东）/dist_share_cat（行业股东）/dist_share_area（区域股东）status=1。
- `GET /distribution/logs/summary?month=YYYY-MM&export=csv`：月度佣金/分红汇总（按用户+类型分组 + byType/total/settled/pending）；CSV 纯函数 `buildMonthlyCsv(summary)`——8 列（用户 + 6 类收益 + 合计），末行「合计」；月份取 `substr(created_at,1,7)`。
- 前端 DistHome：溯源记录 Tab 加「绑定列表 / 关系树」切换（el-radio-group + el-tree 默认全展开，节点 = 昵称 + 企业员工/身份标签 + ID）；佣金明细 Tab 加月份选择器 + 「月度汇总」导出按钮（`佣金月度汇总-YYYY-MM.csv`）。
- 测试：buildRelationTree（多层展开/根判定/标签/自环防环）+ monthlySummary（byType/分组/合计）+ buildMonthlyCsv（BOM/表头/末行合计），distribution.test.js 28 用例。

## 分销商排行 + 累计收益修复（2026-09-08 新增）

- `GET /distribution/ranking?limit=N`：分销商 Top 榜——按 dist_wallet.total_income 降序（仅 total_income>0），附可提现 available、直推人数（pid1=userId 计数）、身份标签（合伙人/全民/行业/区域股东，status=1）；纯服务层 svc.ranking，前端数据大盘 Tab「分销商排行」表格（TOP N，前三名蓝色圆标）。
- **累计收益 total_income 语义修复**：分账入账即 `total_income += amount`（累计收益含待结算，与 PRD「包含已提现、待结算、已扣减」一致）；结算只转移 wait_settle→available；退款回滚 `total_income = MAX(0, total_income - deduct)` 才匹配入账。此前入账只加 wait_settle 未加 total_income，导致：①待结算期累计收益显示不全（排行/分销中心）；②待结算期间退款回滚扣减未入账的累计收益（负数语义错误）。
- 演示数据补账（历史待结算同步累计）：`UPDATE dist_wallet SET total_income = total_income + wait_settle WHERE wait_settle > 0`。
- 测试：ranking 降序/标签/直推人数 + 累计收益入账语义（total_income=分账金额、待结算期 wait_settle>=total_income），distribution.test.js 30 用例。

## 本月新增推广用户 + 下级客户列表（2026-09-08 新增）

- `GET /api/card/distribution/subs?level=1|2&page=`：我的下级客户列表（PRD 5.2）——level=1 直推（pid1=me）/ level=2 间推（pid2=me），join platform_user 取昵称/头像，paid 标记 = 该用户存在 status='paid' 的 payment_orders；cardApi 新增 distSubs(level, page)。
- getSummary 新增 monthNew（本月新增推广用户：`(pid1=me OR pid2=me) AND substr(bind_time,1,10) >= 本月1日`）；C 端 summary 路由透传。
- **dist_user_relation 无 created_at 列（只有 bind_time）**——按月统计必须 `substr(bind_time,1,10)`，写 created_at 报 `no such column`。
- 小程序分销中心 distribution.vue：推广统计卡改 4 个（直推/间推/本月新增/本月佣金）；新增「下级客户」区块（直推/间推 Tab + 头像/昵称/已付费标签/绑定时间/点击跳转名片 + 空态文案「还没有通过你的名片带来的客户，多多分享名片即可获得客户」）。
- 测试：getSubs（直推/间推/paid 布尔/总数，注意测试用户可能已被前面用例永久绑定——用全新 user_id 绑定），distribution.test.js 31 用例。

## 分账快照 Tab（2026-09-08 新增）

- `GET /api/customer/distribution/splits?page=&pageSize=&settleStatus=pending|settled|refunded`：逐笔订单完整分账明细（对账与退款回滚唯一数据源）——join platform_user 取买家昵称；字段 order_no/order_amount/commission1/commission2/partner_bonus/share_all_bonus/share_cat_bonus/share_area_bonus/total_bonus/settle_status/created_at；fmt 后下划线转驼峰。
- 租户后台 DistHome 新增「分账快照」Tab（Tab 顺序：分销配置/分销商/佣金明细/分账快照/溯源记录/钱包提现/数据大盘）：13 列表格（订单号/买家/金额/五类分成/总分成/状态/时间）+ 结算状态筛选 + 分页。
- 测试：getSplits（快照存在/金额分/初始 pending/按状态筛选，注意分账前置校验 buyer 必须存在于 platform_user——不存在的用户 computeOrderSplit 直接 return null），distribution.test.js 32 用例。

## 分销商开通门槛 + 提现审核通知（2026-09-08 新增）

- **门槛**：dist_config 加 `distributor_gate`（0 无门槛 / 1 付费用户 / 2 指定名单）；旧库迁移 `ALTER TABLE ... ADD COLUMN distributor_gate INTEGER NOT NULL DEFAULT 0` **必须放在 seedDistribution 建表块之后**（colExists 查不存在的表会报 `no such table`）。
- **资格判定** `distributorQualified(tenantId, userId, identityType, gate)`：gate=1 查 payment_orders 存在 status='paid'；gate=2 查 dist_distributor（tenant_id+user_id+identity_type 唯一，status=1）。computeOrderSplit 的 dist 分支对自购返佣（自己）、pid1、pid2 都校验资格；**无收益订单 total<=0 直接 return null 不写快照**（测试断言 r===null 而非 commission1===0）。
- **白名单**：dist_distributor 表 + `GET/POST/DELETE /distribution/distributors`（addDistributor 重复添加拒绝 / 移除只置 status=0）；DistHome 配置表单「分销商开通门槛」radio + 分销商 Tab gate=2 时显示白名单管理卡片（用户ID+身份添加 / 表格移除）。
- **审核通知**：reviewWithdraw 的 approve/reject/done 三分支写 card_message（type='system'，title 提现审核通过/驳回/打款完成，content 含金额与驳回原因/流水号，link /pages/card/distribution）；写入失败 try/catch 不阻断审核主流程；C 端消息中心 iconOf 未知类型兜底 'dynamic'。
- 测试：gate 三态（付费门槛无订单不返佣→付费后返佣；名单外不返佣→名单内返佣→移除）+ 审核通知三态（通过/打款含流水号/驳回含原因），distribution.test.js 34 用例。

## 全景小程序端 three 渲染接入（2026-09-08 新增）

- **底座**：`threejs-miniprogram@0.0.8`（dist/index.js 自包含 three r125 bundle，导出 `createScopedThreejs(canvas)`）+ `three@0.125.2` 装在 web-app（workspace 下直接 cd web-app && npm i，根 npm -w 在沙箱报 No workspaces found）。
- **条件编译隔离**：PanoramaViewer.vue script 顶部 `// #ifdef MP-WEIXIN` import createScopedThreejs，H5 构建自动排除（产物不含小程序代码）；H5 继续动态加载 static/three r160，互不影响。
- **小程序渲染链路**：`uni.createSelectorQuery().in(this).select('#panorama-canvas-' + sceneId).fields({node:true,size:true})` 拿 canvas node → createScopedThreejs → WebGLRenderer({canvas}) → SphereGeometry(50,64,48) + MeshBasicMaterial({side:BackSide}) → 纹理用 `canvas.createImage()`（小程序原生，src 必须完整 https URL）→ `canvas.requestAnimationFrame` 循环，相机公式与 H5 animate 完全一致（radius 100，lon/lat，lookAt 原点）。
- **相对路径补全**：cardApi.js 导出 `API_DOMAIN`（BASE_URL 去掉 /api 段）；resolveImageUrl 对非 http 开头路径拼 API_DOMAIN（小程序 createImage 不能解析相对路径）。
- **canvas id 带 sceneId 后缀**：页面多场景实例时 selector 不冲突；canvas type="webgl" 同层渲染，.hotspot-layer z-index 5 覆盖其上。
- **构建**：`cd web-app && npm run build:h5` + `npm run build:mp-weixin`（根 npm -w 沙箱不可用）；H5 产物同步 server/public/card 必须**先 rm -rf assets 再 cp -R**（uni build 不清理 server 侧旧 chunk，残留多个 pages-viewer-viewer 旧哈希会让浏览器加载旧代码）。
- **验收**：H5 `/?plan=1&scene=1` 全景渲染/热点/场景切换正常（回归）；小程序产物 components/PanoramaViewer.js 含 createScopedThreejs、vendor.js 731KB（three 打包）；小程序真机/开发者工具需实机验证。

## 分销商申请链路 + 提现待办角标（2026-09-08 新增）

- **申请链路**：门槛=2（指定名单）时 C 端分销中心显示「申请成为分销商」区块（canApply/applyStatus/rejectReason 由 summary 返回）→ `POST /api/card/distribution/apply` 写 dist_distributor_apply（pending 唯一校验：已有 pending/已通过/已在白名单拒绝）→ 租户后台分销商 Tab「分销商申请」卡片（`GET /applies?status=pending` + `POST /applies/:id/review`，approve 自动 INSERT OR IGNORE 入 dist_distributor 白名单，reject 必填原因落 reject_reason）→ C 端刷新显示 审核中/已通过/已驳回（驳回可重新申请）。
- **门槛=1 提示**：C 端显示「完成任意付费订单后自动获得分销资格」，不提供申请按钮；门槛=0 无提示。
- **提现待办角标**：DistHome Tab `wallet` label 右侧红色角标显示 `stats.withdrawPending`（待审核提现数），有 pending 才显示；`/stats` 已有该字段，前端 loadStats 后自动更新。
- **建表**：dist_distributor_apply（tenant_id/user_id/identity_type/status/reject_reason/created_at/reviewed_at）在 db.js 迁移区 5 幂等创建；服务层 getApplyStatus/applyDistributor/getApplies/reviewApply。
- **测试**：distribution.test.js 36 用例（含申请通过自动入白名单、驳回带原因可重提、重复提交拒绝）；cardApi.test.js 29 用例（distApply URL/POST）。
- **前端**：DistHome 申请卡片（通过/驳回，驳回 ElMessageBox.prompt 原因）+ Tab 角标；C 端 apply-box 样式（蓝底申请区 + 申请按钮 + 等待审核/驳回原因态）。

## .gitignore 精确匹配规范（2026-09-08 新增）

- **禁止**在 .gitignore 使用无斜杠前缀的泛化目录名（如 `dist/`、`data/`）——git 的模式会匹配**任意层级**同名目录，曾误伤 `web-admin/src/views/customer/apps/dist/` 源码目录（6 个分销管理页面从未入库，仅存在于工作区）。
- 构建产物目录必须写根级精确路径：`/web/dist/`、`/web-app/dist/`、`/server/public/admin/`、`/server/data/`；根级数据目录 `/data/` 也加斜杠。
- 交付前检查：`git status --short --ignored | grep '^!!'` 列表只能出现 node_modules/构建产物/数据/日志/.DS_Store；发现任何 `src/` 下源码目录被忽略立即修复并 `git add -f` 补录。
- 新增源码目录时用 `git check-ignore <path>` 确认未被误伤。

## 转化漏斗逐步去重规范（2026-09-08 新增）

- 漏斗各层**禁止**独立 COUNT(DISTINCT visitor_key)——直接分享链接进入的访客无曝光事件会导致「浏览方案 3 人 > 页面曝光 2 人」150% 倒挂。
- 正确实现：第 2 层起仅统计「完成过起点至上一环节**全部**事件」的访客（`visitor_key IN (SELECT visitor_key FROM analytics_events WHERE ... AND event_type IN (...) GROUP BY visitor_key HAVING COUNT(DISTINCT event_type)=N)`），漏斗严格单调不增。
- 踩坑：子查询 IN 的条件需补全租户/方案/[日期]+全部事件类型参数（`stepParams.push(...params, ...prevKeys)`），只 push 事件类型会剩 `?` 绑 NULL 查空（表现为全层 0）。
- 验收：浏览器实测漏斗每层 ≤ 上一层（panorama 2→2→2→1、card 1→1→0→0 单调）。

## 工作台应用卡指标映射（2026-09-08 新增）

- 租户工作台「我的应用」卡片指标按应用区分，**禁止 fallback 到全景的「方案/场景」**（曾导致分销应用显示 0方案/0场景）。
- 映射表：panorama=方案/场景；card=企业员工/企业客户；channel=渠道配置/场景；dist=分销商/提现待审；partner=合伙人/分红模式(团队|全局)；share-all=股东/分配方式(均等|权重)；share-cat=类目数/股东数；share-area=地区数/股东数。
- 分销类计数表 status=1（dist_distributor/dist_partner/dist_share_all/dist_share_cat/dist_share_area），提现待审取 dist_withdraw status='pending'；分红模式从 sys_tenant_plugin.config JSON 的 mode 读取。

## 表单控件程序赋值触发 change 规范（2026-09-08 新增）

- **Element Plus 的 el-switch / el-radio-group / el-input-number 在 modelValue 程序赋值变化时也会 emit change**（el-switch 源码 `watch(checked)` 内 emit CHANGE_EVENT），不是仅用户交互触发。任何 `@change="saveXxx"` 绑定，如果对应 modelValue 在 load() 里被赋值，进入页面就会自动调用保存并弹「已保存」通知（曾导致分销 4 插件页进页弹两条通知、updated_at 被刷写）。
- **禁止**用 `:model-value` 单向绑定规避（el-switch 同样触发）；`@click` 方案对 el-input-number 键盘输入不生效。
- **正确方案**：`const loaded = ref(false)` + 保存函数首行 `if (!loaded.value) return;` + load() 内**所有赋值完成后** `setTimeout(() => { loaded.value = true; }, 0);`——watcher 是微任务先于宏任务执行，加载期赋值触发的保存全部跳过，用户后续操作正常保存。
- 排查特征：进入页面自动弹「XX已保存」通知、列表页/配置页 updated_at 被刷写、`@change="save"` 绑定的控件 modelValue 在加载时被赋值。

## 面包屑链接路径规范（2026-09-08 更新）

- 两 Layout 的 CRUMB_LINKS 映射值必须用 **hash 路由内部路径**（router 顶层 path 是 `/`），如 `/apps`、`/dashboard`、`/apps-center`、`/customers`、`/solutions`、`/settings`、`/finance`、`/channel`；**禁止**写成 `/customer/apps`、`/admin/customers` 等带前端挂载前缀的完整路径（会生成 `#/customer/apps` 无匹配路由，被守卫拦截回工作台）。

## 条件渲染链配对规范（2026-09-08 新增）

- 多分支互斥显示必须用 `v-if → v-else-if → v-else` **串联**；两个独立 `v-if` + 一个 `v-else` 时，`v-else` 只配对**最近的前一个兄弟 v-if**，会造成「正常分支 + 空态分支同时渲染」（曾导致套餐与续费页出现两个「方案续费」区块：有方案且自助续费开启时，方案卡正常显示 + 空态「未开通任何解决方案」同时出现）。
- 排查特征：页面同一标题/区块出现两次、一个正常一个空态/提示；改动后 grep 确认 v-if/v-else-if/v-else 数量配平（v-if+v-else-if 总数 = v-else 数+1）。

## 应用卡片样式规范（2026-09-08 更新）

- **卡片必须 flex column**：`.app-card { display:flex; flex-direction:column; align-items:center; }`，描述区 `flex: 1 1 auto` 撑开剩余空间，按钮 `margin-top:16px` 贴卡底——否则描述行数不同导致宽屏多列时按钮不在同一水平线。
- 应用 code（panorama/card/channel 等）颜色**禁止**用 `#c0c4cc`（白底对比度不足、默认态不可读），统一辅助文字色 `#86909C`。
- 总后台 AppCenter 卡片已用 `-webkit-line-clamp: 2` 固定描述 2 行高，无需 flex；租户端 Apps.vue 用 flex column 方案。

## 应用中心全端渠道直开规范（2026-09-08 新增）

- 应用中心（总后台 /apps-center 与租户端 /apps）「全端渠道」分类**不再渲染 channel 应用卡**：分类下含 code='channel' 应用时，直接渲染各端渠道卡片（总后台 8 渠道、租户端 4 渠道），点击卡片直达对应渠道配置页，去掉「进入应用 → 渠道列表」中间层。
- 总后台渠道全集（PLATFORM_CHANNELS）：已开发 mini 微信小程序/h5 H5手机端/mp 微信公众号/pc PC网站（跳 `/channel/{value}`）；未开发 baidu 百度小程序/ali 支付宝小程序/qq QQ小程序/tt 字节跳动小程序（卡片禁用 + 「未开发」el-tag，不可进入）。
- 租户端渠道（CUST_CHANNELS）：mini 跳 `/apps/channel/mini`，其余跳 `/apps/channel/config?type=`。
- 分类计数：含 channel 应用时显示「共 N 个渠道」，否则「共 N 个应用」（computed catCountText）。
- 面包屑进入应用中心可带分类参数：`/apps?cat=分类名`（CustomerLayout CRUMB_LINKS：分销体系→cat=分销体系、360全景/智能名片→cat=行业应用），Apps.vue onMounted 读 route.query.cat 定位分类。
- 应用卡片描述区垂直居中：`.app-desc { display:flex; align-items:center; justify-content:center; flex:1 1 auto; }`，配合卡片 flex column 保证多列时「进入应用」按钮底部对齐。

## projects.solutions 规范化规范（2026-09-09 新增）

- **solutions 只允许存「在售方案 code」**（solutions.status='on'）：应用 code（apps 表）与已下架旧方案 code（status='off'，如 panorama/card 降级前遗留）一律不得写入 projects.solutions，否则 Billing 方案续费/标签会渲染出「智能名片」等幽灵方案卡（同应用两套价格混淆）。
- **数据迁移兜底**：`db.js normalizeProjectSolutions(db)`（createDb 幂等执行）——移除应用 code + off 方案 code，保留 on 方案；清空回填「演示试用方案」(demo)。**新增任何迁移/接口不得绕过**。
- **三处强制过滤**（缺一不可）：
  1. `billing.js solution-plan` 查询 `SELECT * FROM solutions WHERE code = ? AND status = 'on'`（只展示在售方案）；
  2. `customers.js parseCustomerBody(body, db)` 保存时规范化（应用 code/off code 剔除、空回填 demo）——**必须传 db 参数**；
  3. `normalizeProjectSolutions` 存量清理。
- **配额联动**：租户 solutions 含 demo 方案后，checkTenantSolutionQuota 会按 demo 默认配额（入驻企业1/员工10/场景3/集市上架10）拦截超限操作；**测试夹具**（如 card-apply-review）需放开 demo 配额（`UPDATE solution_quotas SET value=100 WHERE solution_id=demo.id AND key IN ('enterpriseCount','employeeCount','memberCount')`）模拟旗舰配额，否则多主体审核流 403。
- 任何新功能若涉及方案/应用授权判定，先确认已过上述三处过滤，禁止在 solutions 里塞非方案 code 作为权宜标记。

# 设计中心·页面装修编辑器规范（2026-09-09 新增）

## P2 营销组件扩展 + 保存并预览

- **营销组件组**：componentRegistry.js `group:'marketing'` 倒计时/表单/视频（badge:'new' 蓝色角标；pro=「高级」红色角标）；图标直接照抄 eweishop 原版 PNG（`web-admin/src/assets/comp-icons/{title,richtext,picture,menu,line,notice,countdown,form,video}.png`，源 `https://vipuser3.eweishop.com/static/dist/shop/image/decorate/icon/{name}.png`，76×76，用户反复强调不接受自绘）。
- **保存并预览（免登录签名预览）**：
  - 管理端 `GET /api/design/previewUrl`（tenant 中间件）→ `{url:'/card/?nc=preview#/pages/cardMain/home?preview=1&tid={tid}&exp={exp}&sig={sig}'}`，sig = sha256(`${tid}:${exp}:${PREVIEW_SECRET}`) 前 32 位，exp = now+1800s；PREVIEW_SECRET 常量在 `server/src/routes/card.js` 与 `design.js` 两处保持一致（'nuok-design-preview-secret-2026'，上线前改环境变量）。
  - 查看端 `GET /api/card/design/config` 改 `authOptional` 中间件：无 token 时校验 `verifyPreviewSig(req.query)`（tid 存在 + exp 未过期 + sig 匹配）放行，返回该租户首页草稿（`?preview=1` 时查 status=0 最新版 design_json 的 components）。
  - **C 端渲染器** `web-app/src/components/DesignPage.vue`：9 种组件渲染（title/text/image/button/divider/notice/countdown/form/video）+ 通用容器样式（padding/radius/bgColor）+ 跳转（http 复制/H5 新窗，页面路径 uni.navigateTo）；home.vue 顶部插入 `<DesignPage :comps>`，preview 模式（isPreviewMode：onLoad options 优先，H5 兜底读 `location.hash.split('?')[1]`）加载草稿、跳过首页跳转（onShow reLaunch 逻辑）。
- **必踩坑**：cardApi.js `request(url, method='GET', data={})` 的 data 直接进 uni.request data（GET 时序列化成 query），**禁止传 options 对象**（`request('/x', {params})` 会变成 `?params[preview]=1` 后端取不到 → 401 静默空态）；拼接 query string：`request('/x' + '?' + new URLSearchParams(params).toString())`。
- **构建**：H5 改动后 `cd web-app && npm run build:h5` + 同步（rm -rf assets 再 cp）；uni-app H5 有构建缓存（node_modules/.vite），产物与源不符时清缓存重建；压缩产物字符串引号会统一（grep 用双引号查）。
- **交付截图**：用户手机端看不到 localhost/本地路径，截图必须 FileBatchUpload 成 aka.doubaocdn.com 链接再 present_files。

## P3 组件库扩展（+6 组件）与 schema 控件

- **新增 6 组件**（commit f0fbbbb）：基础「图文卡片 image-text / 轮播图 swiper」、功能「名片卡 my-card / 宫格导航 grid-nav / 数据统计 stats / 全景方案 panorama」；图标继续照抄 eweishop 原版（bannerGoods/banner/member_inviter/cube/goodsRanking/storeLocation.png → comp-icons/）。**新增组件流程**：componentRegistry.js 加一条（type/name/group/icon/defaultProps/schema）→ ComponentRender.vue（管理端画布）+ DesignPage.vue（C 端）补渲染分支 → 构建/测试/提交。
- **schema 新控件**（PageEditor.vue 属性面板）：
  - `control:'list'`：数组编辑（轮播图 items/宫格 items），`itemFields:[{key,label,control}]` 定义每项字段（input/link/select/image）；支持 ↑↓ 移动、删除、「+ 添加一项」（按 itemFields 生成空项，select 取 options[0]）；列表项图片选择走 openImgSel(idx, si, f)（imgSelListField 记录字段定义，确认时回写 items[listIdx][key]）。
  - `control:'select'`：下拉（宫格项图标，options 来自 ICON_OPTIONS 系统 SVG 图标清单）。
  - `control:'switch'`：布尔开关（数据统计显示项）。
- **数据统计（stats）**：三项语义固定「今日访客/累计访客/名片交换」，C 端数值来自 home.vue 传入的 visitorStats（getVisitorSummary），DesignPage 接收 `stats` prop；管理端画布预览占位 0。**禁止改字段语义**（两端标签必须一致）。
- **宫格导航（grid-nav）**：默认 4 项（我的名片/访客雷达/客户管理/人脉集市），图标必须用 ICON_OPTIONS 里的系统 SVG 图标名（SIcon 双端渲染），禁止 emoji/自定义字符。
- **C 端渲染注意**：swiper 用 uni 原生组件（indicator-dots + circular + autoplay）；全景方案默认跳 `/?plan=1&scene=1`（外部 H5 全景，DesignPage onJump 的 http 分支处理）；名片卡跳 `/pages/card/myCard`。

## P4 内容展示组件（魔方 + 视频号三件套）

- **新增 4 组件**（基础「魔方 cube」、营销「视频号主页 channel-profile / 视频号视频 channel-video / 视频号直播 channel-live」，均带 NEW 角标）：图标照抄 eweishop 原版（cube/followaccount/channelvideo/wxlive.png → comp-icons/）；**宫格导航图标从 cube 换为 listmenu.png**（cube 语义让给魔方）。
- **魔方**：等分图片网格（rows 1~3 × cols 2~4、gap 0~8、radius 0~16），每格图片+跳转；items 复用 list 编辑器；C 端 grid 布局，空格子不渲染。
- **视频号三件套**：
  - schema 字段：主页=finderUserName(必填)+昵称/头像/简介；视频=finderUserName+feedId(均必填)+封面/标题/描述；直播=finderUserName(必填)+封面/标题/状态文字。
  - **C 端双端行为（DesignPage.openChannel）**：`// #ifdef MP-WEIXIN` 调微信原生 API（openChannelsUserProfile / openChannelsActivity / openChannelsLive，基础库 2.20.1+，fail 回调提示「请确认小程序已关联视频号」）；`// #ifndef MP-WEIXIN`（H5/APP）复制视频号ID(+视频ID) + modal 提示在微信中搜索。
  - **硬依赖**：租户微信小程序需在 mp 后台「关联视频号」才能唤起成功；H5/APP 端微信生态外无 API，只能复制引导。此边界必须在组件说明中写明。
- **构建注意**：小程序端 `npm run build:mp-weixin` 必须同时跑（验证条件编译 #ifdef 语法与 wx API 打包）；验证 H5 产物不含 openChannels（grep 应为 0，`#ifdef MP-WEIXIN` 剔除）。
- **测试踩坑**：保存草稿/预览用 `?nc=xxx` 新参数强制加载；预览新组件排在上次组件下方需滚动验证，勿误判未渲染；后端 `datetime('now')` 存 UTC（比本地慢 8h），查库比对时间要换算。

## P1 竞品级通用组件（8 组件批，2026-09-09 新增）

- **新增 8 组件**（基础 5：富文本 rich-text / 组图橱窗 image-gallery / 标题栏 title-bar / 搜索框 search / 选项卡 tabs；营销 1：万能表单 form-pro；功能 2：客服联系 contact / 悬浮按钮 float-btn）：registry 数据驱动 + ComponentRender/DesignPage 双端渲染分支，schema 驱动属性面板，均带 NEW 角标；图标 eweishop 原版（search.png/float.png 新下载，contact 用系统 customer.svg，其余复用已有 PNG）。
- **新 schema 控件 textarea**：PageEditor `control==='textarea'` → el-input type=textarea（rows 默认 4，富文本用 rows 6）；**表单 list 项新增 options 字段**（逗号分隔，供 radio/select/multi 使用）。
- **万能表单（form-pro）**：fields list 编辑器（label/type/placeholder/options/required）；type ∈ input/phone/number/date/radio/select/multi；C 端输入框 input、选择类用 picker（date mode=date、radio/select/multi 用 range + fieldOptions 逗号分隔解析）。
- **C 端提交链路（P0）**：submitForm 校验必填 → `cardApi.designLead({tenantId, formTitle, fields:[{label,value}]})` → `POST /api/card/design/leads`（card.js，租户校验用 **projects 表**，customers 表不存在）→ design_leads 表（db.js 幂等建表，tenant_id/page_type/form_title/fields JSON）。fields≤50 项、label≤64/value≤500 截断、空值剔除。
- **formData 初始化坑（必踩）**：C 端万能表单字段渲染 **必须** `v-if="ensureFormData(i)"` 包 v-for（渲染期初始化 formData[i]={}），input 用 `:value + @input`（勿用 v-model）——否则首渲 formData[i] undefined 使 v-model 取值抛 TypeError，字段渲染成 `<!---->` 注释节点（标题/按钮正常但字段消失），报错 `Cannot read properties of undefined (reading '手机号')`。
- **客服联系（contact）**：title/phone/qr/address/btnText；C 端拨打电话 `uni.makePhoneCall`（phone 空时提示「电话未填写」）。
- **悬浮按钮（float-btn）**：text/link/color/position(right|left)；C 端 fixed 右下/左下（right:12px/left:12px），onFloatClick 判断 link 是否 http(s) 跳外部 / uni URL 跳页面。
- **构建验证**：`rm -rf server/public/card/assets` 再 cp（uni build 不清理旧 chunk）；小程序产物 DesignPage.js 查「留资表单/请输入姓名」标记（class 名会被压缩，勿用 dp-* class 名 grep 判定小程序产物）；浏览器验证前清 SW（regs=0 时 reload 即可，旧 chunk 若已加载需 reload 换新哈希文件）。
- **测试**：cardApi.test.js 新增 designLead 用例（POST /design/leads + data 透传），前端基线 36 passed / 4 files。

## P2 内容展示组件（5 组件批，2026-09-09 新增）

- **新增 5 组件**（营销 2：文章列表 article-list / 短视频瀑布流 video-feed；功能 2：网页容器 web-container / 关注公众号 follow-official；基础 1：辅助间距 spacer）：registry 数据驱动 + ComponentRender/DesignPage 双端渲染分支；图标：doc.svg（文章）/ pc.svg（网页）/ line.png（间距，eweishop 原版）/ official.svg（公众号）/ video.png（短视频复用）。
- **文章列表**：title + items list（title/desc/date/image/link）+ showDate + columns(1|2)；C 端列表卡片（封面/标题/摘要/日期），点击 onJump(link)。
- **网页容器**：url + height(100~1200)；**H5 端 iframe 渲染（sandbox allow-scripts/allow-same-origin/allow-forms），小程序端条件编译占位卡片 + 点击 onJump 打开链接**（web-view 在组件内不可用，不硬接）。
- **辅助间距**：height(1~24) + style(solid|dashed|none) + color + margin(0~48)；C 端 borderTop 内联样式渲染，style=none 时纯空白。
- **关注公众号**：title/desc/qr(image)/btnText；C 端 image 加 `show-menu-by-longpress`（小程序长按识别二维码，H5 同样支持）。
- **短视频瀑布流**：title + items list（title/cover/video/link）+ columns(2|3)；C 端双列瀑布流卡片（封面 3:4 + 播放角标），点击 openFeedItem：**有 video 时 ref feedVideo 打开页内 video 播放层（fixed 居中，ended/error 清空），否则 onJump(link)**；feedVideo 用 `ref('')`（DesignPage 已 import ref）。
- **C 端新增模板函数注意**：openFeedItem 等新函数必须定义在 <script setup> 顶层并 return 到模板（模板调用 `@click="openFeedItem(it)"`），同页多个实例互不干扰。
- **小程序产物判定**：P2 组件 type 字符串（article-list/web-container/follow-official/video-feed）grep 各 ≥2（模板+逻辑）；spacer 无 class 标记（内联 borderTop），用「辅助间距」文案或无标记均属正常。
- **构建验证**：admin build+verify、H5 同步（rm -rf assets 再 cp）、mp-weixin 构建；组件库总数 = 32（基础 15/营销 9/功能 8）。
- **测试**：前端基线保持 36 passed / 4 files（P2 无新纯函数，复用 onJump/resolveUrl，不新增测试）。

## 滑杆/数字参数控件统一规范（2026-09-10 新增，强制）

- **新增组件属性面板若用到数值调节，统一用 `el-slider show-input`**（`f.control === 'slider'`），禁止另写 el-input-number 自绘数值控件（除魔方行内 fontSize/width/radius 既有 70px 例外）。
- **样式全局继承**（PageEditor.vue 已内置，新增组件自动生效，无需逐个处理）：
  - 数字输入框 72px（可显示三位数字，余宽留给滑杆）：`.pe-prop :deep(.el-slider__input)`、`.hp-body :deep(.el-slider__input)`、`.form-card :deep(.el-slider__input)` 三处统一 72px；增减按钮 18px、输入内边距 0 4px。
  - **滑杆必须自适应撑满**：页面设置弹窗内 4 处滑杆（卡片圆角/边距/间距、头部边距）内联 `style="flex:1;min-width:140px"`（禁止固定 px 宽度）；组件属性面板 el-slider 默认 100% 自动撑满。
  - **label 单行**：`.hp-label` 固定 92px + `white-space:nowrap`（"卡片圆角(px)"等长文案不得换行）；组件属性面板用 el-form-item label 天然 nowrap。
- **魔方行内数字框**：el-input-number 70px（fontSize 10-22/width 40-600/radius 0-60），保留现状不缩小。
- **新增组件配置必须用以上控件模板**，交付前浏览器实测：输入框 72px、label 单行、滑杆随面板宽度撑满。

# 复刻开发规范（2026-09-10 新增）

- **复刻链接（功能参考）**：用户指定复刻某链接的功能时，默认 **1:1 还原其交互行为与业务逻辑**（点击/切换/条件联动/状态流转/数据流/校验等），**不承诺复刻外观 UI**——除非用户专门指定"1:1 还原页面 UI"，才按原页面外观复刻。否则界面统一按本系统 UI 规范（设计令牌、组件库、页面布局规范）实现。
- **发图片复刻**：用户以图片（截图/原型/竞品图）传达功能要求时，按资深程序员视角提炼专业业务逻辑构建功能（交互闭环、边界状态、数据校验、空态/异常态），图片仅作功能与布局参考，UI 遵循系统风格。
- **判定顺序**：先确认复刻目标是「功能」还是「UI」——功能复刻 = 行为逻辑 1:1 + 系统 UI；UI 复刻（仅当用户明确要求 1:1 还原页面 UI）才做外观 1:1。两类复刻均必须补全组件库缺失配置项（如 eweishop 视频号视频的「视频样式」比例 16:9/4:3/1:1/9:16），不允许因 UI 简化而丢失功能配置。

## 复刻执行强制动作（2026-09-10 补充）

- **逐项点击核对**：复刻链接/图片功能时，**对标页面上的每一个按钮、下拉、开关、单选都要实际点击触发一遍**，确认各自功能与业务逻辑，不得只读面板文本、只看静态截图就下结论。
- **联动选项必查**：重点排查「选中某选项后是否联动出现/隐藏新选项」（如 eweishop 视频号视频：自动播放=自动 联动出现「是否静音/是否循环」，不自动则不显示）；漏掉隐藏联动选项属于未执行规范，必须补验后实现。
- **默认值必录**：核对联动项及各配置项的**默认值**（如是否静音默认=是、是否循环默认=否），实现时保持一致。
- **功能 > 外观**：交互行为、业务逻辑、联动、默认值、边界状态优先于 UI 观感；UI 仅当用户明确要求 1:1 还原页面 UI 时复刻，否则按系统风格统一。

- **控件级 1:1 还原（2026-09-10 用户强调，如有冲突以此为准）**：为实现功能所必需的**控件**——窗口/弹窗、双击事件、单击事件、事件、拖动、移动、浮层、选中态、步骤引导等——一律 **1:1 还原操作方式、交互效果与功能逻辑**，达到真实的功能和体验，**不因"按系统风格统一 UI"而改变控件外观与手感**。凡控件承担功能（如热区编辑器的 4 步步骤条、黄色热区框+「双击添加链接」、双击弹出链接选择器、添加热区/保存按钮、拖动移动、右上角删除），其布局、样式、触发方式、反馈均照抄对标系统；仅纯装饰性视觉（与功能无关的配色微调等）可遵循本系统 UI 规范。此条优先级高于"功能 1:1 + 系统 UI"与"UI 仅用户明确要求才复刻"的旧规则。
- **属性配置项图形化体现（2026-09-10 用户强调）**：对标系统（eweishop 等）中**以图形/缩略图方式选择配置项**的地方（如「选择风格」用风格缩略图卡片、标题栏「修改风格」图形预设等），复刻时必须同样以图形化控件呈现（图片卡片/缩略图选择），**禁止退化为文字下拉/单选**；图形选项的数量、默认选中项、切换后的效果须逐一确认并还原。
- **组件复刻最终自查（2026-09-10 用户补充，六条必查）**：复刻/重写组件交付前逐项核验，任一不满足视为未完成：
  ① 几何配置方向语义：边距/间距/圆角须与对标一致并先在 C 端预览实测（如 eweishop 图片「左右边距」= 左右两侧对称向中间收缩，禁止做成单侧 padding 导致图片斜向缩小）；
  ② 模式联动字段集合：切换模式（标准/高级热区等）后面板只显示该模式应有的字段，禁止残留（如热区模式下图片不再提供整图跳转，跳转只能通过热区）；
  ③ 图片选择后必须立即在字段旁显示缩略图预览；素材选择器「本地上传/网络提取」必须真实可用（有文件选择入口、能上传成功），禁止只切 Tab 而无上传控件；
  ④ 配置项去重：同一语义只保留一个控件（如「圆角」与「上圆角/下圆角」重复时按对标删除冗余；组件左右边距与通用样式内边距语义重叠时按对标取舍）；
  ⑤ 每个 slider/输入框改动后 C 端预览实时生效且方向正确；
  ⑥ 配置项数量、默认值、可调范围与对标一致。
- **属性面板控件系统标准（2026-09-10 用户指定，颜色/图片选择器）**：复刻对标系统属性字段控件时，以下控件按对标 1:1 复刻并定为系统标准，所有组件属性面板统一使用，禁止混用其它风格：
  ① 颜色选择器：行内 = 字段标签 + 棋盘格透明底纹色块预览 + 当前值文本（transparent / #色值），点击弹出「选择颜色」取色面板；
  ② 图片选择器：字段上方显示对标建议尺寸文字说明（如「建议图片宽度750，高度200-950，支持jpg、png。」，逐字一致）；已选图显示大图预览（按组件建议比例，非小缩略图）+「替换」按钮；空状态为带「+添加」的上传占位区；
  ③ 标签文案、按钮文案、说明文字与对标逐字一致，不得改写或省略。
  ④ **传图控件形态按对标 1:1，不得私自换型**：单图字段用 ② 的单图选择器；**多图组件（主图+多副图，如倒计时02）必须用「多图占位网格」**——每个图片槽位一个占位框（带尺寸标注如 346x380/340x184、当前图缩略图、点击各自替换），与对标完全一致，禁止把多图组件降级成单图替换按钮。
- **装修页测试数据清理规范（2026-09-10 补充）**：在设计中心装修页做浏览器实测后清理测试数据时，只删除本次添加的测试组件，禁止全量清空画布或对模板原有组件做删除/保存草稿操作（曾导致 360 模板首页草稿被清空，C 端预览显示「草稿暂无组件」）。若误删，用历史版本回滚（如 v4 干净模板）恢复草稿再保存；发布版本号不受影响。

## 复刻默认素材与传图类字段强制规范（2026-09-11 补充，倒计时组件三次返工教训沉淀）

### ① 默认图片素材必须复刻（复刻要求 = 功能 + 交互 + 默认值 + 默认素材）
- 对标组件有默认图（如 eweishop 倒计时顶部 default_banner.png、内容条 countdown_bg1.png）→ 我方**必须提供对应默认图并写入 defaultProps 默认值**，禁止「默认无图、让用户自己传」的想当然降级。
- 默认图规格从对标实测取得（DOM img 尺寸 / getComputedStyle / 下载原图量尺寸），按 750 基准换算像素；素材资源放 `web-app/src/static/images/`（三端共用，H5 构建同步 `server/public/card/static/images/`，管理端/C 端引用 `/card/static/images/xxx.png`）。

### ② 静态资源路径与验证（防「找错路径」）
- 默认图/静态图必须放 express.static 托管目录：`/card/static/**`（web-app/src/static 构建同步）或 `/uploads/**`；**禁止放无静态挂载目录**（如 `server/public/design` 下 `/design/*` 会被 SPA fallback 拦截返回 index.html，img complete=true 但 naturalW=0）。
- 资源验证**禁止只看 HTTP 200**（SPA fallback 也返回 200）：必须核对 `Content-Type`（图片应为 image/png 等）+ `Content-Length` 与磁盘字节数一致；浏览器侧验证 `img.naturalWidth > 0`，naturalW=0 且 complete=true 即拿到 HTML/解码失败。

### ③ 传图类字段必须真机实测（防「想当然」）
- 凡涉及选图/上传的字段（主体图/背景图/图标等），交付前必须实际走通全链路：属性面板 → 素材选择器 → 选图/上传 → 确定 → 预览画布**即时反馈**（图片 src 变化、样式生效），禁止凭默认值想当然交付。
- 覆盖范围以对标 getComputedStyle 实测为准（backgroundSize / backgroundPosition / backgroundRepeat + 元素边界：铺整组件 vs 只铺内容条），禁止想当然整块铺满。
- 每个 schema 字段先确认渲染端有模板承接（管理端 `ComponentRender.vue` + C 端 `DesignPage.vue` + 小程序三端同步），禁止出现「面板能改、画布不渲染」。

### ④ 复刻检查单（每次组件复刻交付前逐项勾选）
1. 对标每个控件已实际点击验证（含联动隐藏选项与默认值）——复用 2026-09-10「逐项点击核对」；
2. 默认素材已复刻：有默认图 → 已提供并设为默认；无默认图 → 已在对标确认确实无图；
3. 默认值逐字段核对（radio 选中态/颜色/数字/开关），与对标一致；
4. 传图类字段已真机走通「选图 → 预览即时反馈」，覆盖范围与对标一致；
5. 静态资源路径受托管、Content-Type/字节数核对通过、浏览器 naturalW>0；
6. 渲染端三端（管理端/C 端 H5/小程序）均有模板承接；
7. 构建产物验证 + 前端测试通过 + git commit。

### ⑤ 传图控件形态必须 1:1 复刻（2026-09-11 返工教训补充，倒计时02 图片字段）
- **复刻前必须先实测对标的图片管理方式**（点开图片字段看内部结构），确定是单图缩略图+替换、还是多图占位网格、还是组合块（图片+标题+颜色+链接同块），**再决定我方控件形态**；禁止凭「我以为是个图片字段」私自换成别的传图控件。
- **多图组件（主图+副图）**：图片管理区必须把**每张图都暴露为可管理的占位槽**（主图槽+副图槽，各带尺寸标注、当前缩略图、点击替换），副图不能只在渲染端存在而管理端无法更换；也不能因为「对标面板没单独暴露副图字段」就认为副图不可管理——副图槽就藏在图片占位区里。
- **图片组合块**：若对标的「图片」字段内嵌标题/颜色/链接（同一字段块），复刻时保持同样的组合结构与标签文案（如 主标题4/8 → 颜色 → 副标题5/8 → 颜色 → 链接），逐字一致。
- **逻辑正确**：替换某张图后预览画布对应位置**即时变化**（换的是主图就主图变、副图就副图变）；选图来源（素材中心/本地上传/网络图）与对标一致。
- 新增控件（如多图占位网格 imageGroup）必须在 PageEditor 注册渲染分支，并验证「选中组件 → 面板出现占位区 → 点击某槽替换 → 画布对应图变化」全链路。


# 对标系统细读与 1:1 复刻规范（2026-09-11 新增，强制）

**触发场景**：用户指定「对标某系统/链接/截图，1:1 复刻」某组件、页面或功能时，调研、实施、验收三阶段必须遵循本节。

## 一、细读（调研阶段）强制检查清单

1. **全量滚读属性面板**：面板可能超出一屏。必须从顶部滚动到底部，每 1/4 高度读一次文本，直到连续两次滚动内容完全一致；**禁止只读当前视口**（教训：曾漏读「开始时间/结束时间」两个字段）。
2. **逐控件点击**：面板每个控件（单选/输入/颜色/滑杆/开关/下拉/图片替换/链接选择器/日期选择器）必须逐个点击或操作一遍，记录控件类型、选项值、默认值、占位文案。
3. **联动字段探测**：切换每个选项后必须检查是否有新字段出现/隐藏（如「样式=描边」联动出现「描边颜色」），记录联动条件与默认值；**禁止只看静态文本**。
4. **图形化选项识别**：选项若用图形表达（cube 比例图、样式图、风格图），必须截图记录图形样式与选中态；复刻时同样用图形而非纯文字。
5. **DOM 精确测量**：用 `getBoundingClientRect` 读取组件尺寸、内部区块尺寸、间距（gap/margin/padding）像素值并记录；**禁止靠截图目测**（教训：曾漏掉左图-右图 6px、副图 5px 间隙）。
6. **默认素材下载**：每个图片字段的默认图 URL 必须完整记录并下载保存；标题/颜色/开关等字段默认值逐项记录。
7. **渲染位置确认**：每个面板字段对应画布哪个渲染位置，必须点选画布元素实测确认；无法确认的标注「未验证」，不得臆断。
8. **传图控件形态实测**：点开每个图片字段，记录其内部结构——单图缩略图+替换 / 多图占位网格（几个槽位、各槽位尺寸标注）/ 组合块（图片+标题+颜色+链接同块）；多图组件必须逐一确认每个槽位对应渲染的哪张图（主图/第几张副图）。
9. **面板抓取必须用完整控件单元，禁止只抓 label 摘要**：抓取粒度必须是 `es-form-item` 等**完整表单单元**（label + 控件 + 默认值 + 选项全集 + 单位 + 字数统计 + 占位符），逐项记录控件类型、默认值、maxlength/字数上限、slider 范围与步进、radio/复选默认选中态；**禁止只抓 `.form-label` 一层文本摘要**——那会漏掉字号默认值、字数限制、滑块范围、选项默认选中等控件级细节（教训：标题栏只抓了「标题文字 加粗|倾斜」摘要，漏了字号默认16px、标题 maxlength 8 字，被用户抽查发现）。
10. **字段全集以实测为准，禁止想当然增删字段**：复刻字段必须全部来自对标面板实测滚读结果，**不得凭业务直觉新增字段**（教训：曾给倒计时02 误加「主图比例」三选项图形块——eweishop 面板根本没有该字段，那 3 个带尺寸的图形只是图片字段三图占位区的标注，被当成独立字段误加）。凡是「我以为应该有」的字段，先回对标面板找证据：找不到就不加，找到再按实际形态复刻。
11. **真实映射关系必须从对标实测抓取，禁止推断**：凡存在「选择项 → 实际资源/结构」映射的（风格弹窗图 → 风格文件、选项值 → 组件 class、装饰图 → URL），必须打开对标页面实际点选每个选项，用 DOM/网络抓取真实映射表；**禁止**按文件名、编号顺序、CSS 类名猜测映射（教训：标题栏 9 风格图曾按文件名顺序下载，实际与 ew 弹窗顺序错位，出现「选风格A 出风格B」）。
12. **每个变体必须逐一在画布实测真实渲染 DOM**：复刻组件有 N 个变体/风格时，必须**逐一**点选切换，抓取每个变体的真实 `outerHTML`（class、元素顺序、装饰图 src、内联 style 颜色/字号）与对应 CSS 计算值（尺寸/位置/间距像素）；**禁止**只实测其中几个变体，其余按共享 CSS 规则推断（教训：标题栏只实测了风格1/2/3，风格4-9 按 `.es-title.title4/5/6` CSS 推断成线型，实际风格4-6 是 `es-title2` 装饰图+彩色标题+副标题结构，与推断完全不符，被用户判定「其它风格实际对不上」）。装饰图等资源必须逐一下载保存（URL 模式通常为 `{站点}/static/dist/shop/image/decorate/{name}.png`）。
13. **独立规则必须实测记录**：变体/风格之间的差异独立规则（各自高度、默认文案、默认颜色、联动行为）必须逐项实测记录成表；切风格是否有联动（重置文案/颜色、隐藏/显示字段）必须实际操作验证（教训：ew 标题栏切风格会联动重置标题颜色与默认文案，且 es-title3/es-title2/es-title 三族高度与结构不同）。
14. **真实渲染行为以画布渲染结果为唯一标准**：属性面板字段与画布渲染结果不一致时（如面板字段少但渲染有固定文案/装饰图），以画布真实渲染 DOM 为准复刻；固定文案/硬编码装饰（如「查看更多」「夏日清爽出行必备」）也必须在渲染中 1:1 呈现，即使面板无对应编辑项。

## 二、复刻实施要求

1. 字段链、默认值、控件类型、交互行为、业务逻辑与对标**逐项 1:1**；不得因「我觉得没用/不重要」砍字段或跳功能。
2. 联动逻辑必须实现（如描边→联动描边颜色）；传图字段必须真机走通且预览即时反馈，不得想当然。
3. 属性区 UI 与画布渲染同步实现，三端（管理端画布/H5/小程序）一致。
4. **传图控件形态与对标逐项一致**：单图/多图占位网格/组合块按对标实测结构复刻（细读清单第 8 条），不得私自换型降级。
5. **字段增删以实测为准**：实施时如需调整字段（增/删/改名），必须能指认对标面板的对应证据；找不到证据的一律不加、不改（细读清单第 9 条）。

## 三、验收（交付前强制对比）

1. **属性区完整对比**：我方面板字段 vs 对标面板字段逐项列表对照（顺序/控件/默认值/联动/占位），全部打勾才通过。
2. **预览图与对标组件对比**：我方渲染截图与对标组件截图（同尺寸缩放）并排逐项比对外观、间距、字号；发现差异必须修复后重新对比。
3. **交互实测**：每个联动选项在浏览器实际操作验证；传图字段必须真实上传图片观察预览变化，不能跳过真机验证。
4. **真实键入验证字段→渲染映射（2026-09-11 标题栏复刻补充）**：每个**输入型字段**（文本/数字滑杆/开关/单选/颜色/图片）必须**真实键入或切换值**，观察画布渲染是否即时变化且映射到正确位置（如标题栏：改主标题内容→画布标题文字变；子标题启用=否→画布副标题消失）；**禁止只靠代码绑定推断渲染正确**——绑定写对 ≠ 渲染对，必须以浏览器实际键入/操作后的画布结果为准。

## 四、属性面板「分族」复刻规范（2026-09-11 标题栏复刻经验沉淀，强制）

> 触发场景：对标组件的**属性面板字段集合随「风格/变体」切换而变化**（如 eweishop 标题栏：风格1/4/5/6 是「图片+主标题+子标题+更多按钮+背景设置+边距+圆角」族，风格7/8/9 是「标题文字+颜色选择+边距」族）。此类组件不能只复刻一个风格的面板，必须按族复刻。

1. **面板本身也是"变体"，必须逐风格实测**：对每个风格点选后抓取属性面板完整文本（分组标题/字段名/字段顺序/控件类型/默认值/radio 选中态），形成「风格 → 字段族」映射表；**禁止只实测 1-2 个风格后按"应该都有"推断其余风格面板**（教训：标题栏曾只做 S1 完整字段，切 S7 后面板仍显示图片/主标题等旧字段）。
2. **字段分族记录**：字段按「出现在哪些风格」记录（如 图片/圆角仅 S1；更多箭头仅 S1；子标题 S1/2/4/5/6；背景设置仅 S1；标题文字/标题颜色仅 S7-9；背景颜色 S2-9）；同一字段可在多个族出现（如 bold/italic 同时声明在主标题组与标题文字组，分别配不同 whenStyle）。
3. **组顺序 = schema 数组物理顺序 + whenStyle 裁剪共同决定**：同一 schema 数组需同时满足所有风格的面板顺序（教训：标题文字组原放在背景组之后，S1 顺序正确但 S7 出现「边距→标题文字」倒序；把标题文字组物理前移到背景组之前，才同时满足 S1「…背景→边距→圆角」与 S7「标题文字→颜色选择→边距」）。改任何组的物理位置，必须回放全部风格的顺序验证。
4. **跨风格组与单风格组分工**：「颜色选择」组承载 S2-9 的 bgColor（+S7-9 的 titleColor2），「背景设置」组只服务 S1（底部颜色+组件背景[背景色/背景图]）；风格切换时用 whenStyle/whenNotStyle 精确裁剪，不共用 if/else 拼字段。
5. **默认值以面板实测为准，即使与画布渲染不一致**：ew 风格1 面板「主标题内容=夏日纳凉精选」而画布渲染「商品推荐」（ew 自身面板/画布不一致），我方 defaultProps 取面板值；**切风格不重置用户已编辑文案**，除非对标实测切风格会重置。
6. **切风格颜色联动表必须实测抓取**：逐风格记录切过去后各颜色字段的实际值（标题栏：S3→#F1FF9A、S4→#3B2BE7、S5→#FF95AC、S6→#FF3B3B、其余→#333333），写入联动函数常量表；禁止凭主题色猜测。
7. **schema key 变更必须三端同步 + 存量兼容**：defaultProps/渲染模板 key 改动后，编辑端 ComponentRender 与 C 端 DesignPage 渲染模板同步绑定；旧数据无新 key 时用兜底值渲染（如 S7-9 titleText 缺失回退 '标题栏'），保证已发布页面不崩。
8. **字段 label 逐字对齐**：同族内 label 与对标逐字一致（如 S7-9 标题文字族主字段 label=「文字」，S1-6 主标题族 label=「内容」——同一个语义字段在不同族 label 不同，按对标逐字使用）。
9. **验收**：逐风格切换，抓取我方面板文本与对标面板文本逐项对照（分组/字段/顺序/默认值）；渲染联动（改字段→画布即时变化）逐项浏览器实测；构建 + verify + 前端测试全过；H5 同步先 `rm -rf server/public/card/assets server/public/card/static` 再全量 cp。
