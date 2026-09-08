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
