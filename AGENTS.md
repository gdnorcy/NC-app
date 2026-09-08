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
