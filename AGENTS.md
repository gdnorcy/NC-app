# 注意事项

- 每次改动完成后，都必须创建一个对应的 git commit，以便后续追踪和回滚。
- 每次改动后，都必须编写或更新相关测试，并在交付给用户前，确保所有测试和验证全部通过。

# 统一账号体系（2026-09-18 确认，方案 docs/账号体系重建方案.md）

## 数据模型（accounts + tenant_members 分离）

- **accounts**：平台级登录账号（username/phone + password_hash/password_salt/status），一人一号，跨租户复用；不存明文密码。
- **tenant_members**：租户成员（tenant_id + account_id 关联），携带 name/nickname/status/identities(JSON)/enterprise_id 等租户侧属性；同一账号可加入多个租户成为不同成员。
- 登录入口：`POST /api/auth/login` 支持 `{username|phone, password}`，登录态返回 member_id（角色与权限以成员为准）。
- 权限模型：`roles`（内置 tenant_id=0 的租户管理员/普通成员/门店管理员 + 租户自定义）+ `member_roles`（成员-角色绑定）+ `role_permissions`（角色-权限点）。
- 内置角色不可删除；自定义角色可分配权限点；`GET /api/customer/roles` 返回 `perms:[{app_code,menu_key}]` 数组供分配权限弹窗回显。

## 侧边栏菜单归属（2026-09-18 确认）

- **成员管理 / 角色管理已从一级菜单移入「系统设置」二级菜单**（仅租户管理员可见）；侧边栏只保留顶层模块（工作台/设计中心/应用中心/商品管理/内容管理/套餐与续费/我的账单/会员/系统设置）。
- **坑（必读）**：侧边栏渲染源是 `web-admin/src/layouts/CustomerLayout.vue` 写死的 `<el-menu>`（不是 buildSidebarMenus）；`menuPermissions.js buildSidebarMenus` 只服务路由守卫/断言/测试。**改菜单必须三处同步**：CustomerLayout.vue（渲染）+ menuPermissions.js（守卫）+ menuPermissions.test.js（断言），否则出现「路由能进、菜单不显示」或反之。
- 应用内 Tab 类页面（CardTabs 等）顶部选项卡栏必须常驻（见「选项卡栏常驻规范」）。

## 分配权限弹窗按应用分组（2026-09-18 修复，通用强制）

- **permission-tree 分组依据 = `app_menus.app_id` → `apps.id`，禁止用 `module` 匹配 app code**：`app_menus.module` 是中文分组名（总览/方案管理/名片管理…），不是应用 code。曾用 `menus.filter(m => m.module === a.code || a.code === 'panorama')` 导致**所有菜单全部塞进「360全景」分组**（截图即此现象），已改为按 app_id 分组。
- **menu_key 本身含冒号前缀**（`card:overview`、`pano:overview`、`share-all:config`）；前端勾选标识格式 = `${app_code}:${menu_key}`（如 `card:card:overview`）。**保存切分必须按第一个冒号 `k.indexOf(':')`**，禁止 `k.split(':')` 解构（会把 `card:overview` 截断成 `card`，回显全部丢失）。
- 同名权限点（如「数据洞察」在 360全景/智能名片/全端渠道都有）靠**分组归属**区分，不拼接应用名到 label。
- 回归测试：`server/test/store-owner.test.js` 的「permission-tree 按应用分组」用例——每个分组菜单必须与 apps.id 登记的 app_menus 一一对应（不串组、不缺失），且 360全景 分组不得出现 card:/goods:/live: 等其它应用前缀。

## 门店负责人 = 统一账号（2026-09-18 实施，P0.5）

- 创建/编辑门店负责人**二选一**（`ownerMode`）：`new` = 新建账号（ownerName + ownerPhone=登录账号 + ownerPassword≥6 位）；`existing` = 复用本租户已有成员（ownerMemberId）。
- 后端 `server/src/routes/store.js resolveStoreOwner`：新建自动 INSERT accounts + tenant_members，并统一绑定内置 `store_admin` 角色（INSERT OR IGNORE 幂等）；store 表仅存 `owner_member_id` + `owner_name/owner_account`（展示用），**不再存 owner_password**。
- 校验：existing 必须属于本租户（否则 400「不属于本租户」）；new 手机号须 `/^1\d{10}$/`、密码 ≥6 位。
- 前端 `StoreManage.vue`：负责人步骤「负责人来源」radio 切换（new 显示姓名/手机号/密码；existing 显示成员下拉，数据来自 `GET /api/customer/members`）；`GET /store/categories`、`/store/tag-groups`、`/store/quota`、`/members` 并行加载。
- 测试：`server/test/store-owner.test.js`（4 项：roles perms 回显 / new 全链路 / existing 复用补绑 / 越权与非法手机号 400）。

## 我的账号移入右上角个人中心（2026-09-18 实施，方案A）

- **「账号设置」→「我的账号」，从系统设置二级菜单移入右上角个人中心**：CustomerLayout 右上角 el-dropdown「个人中心」command=profile → `router.push('/settings/account')`（原为空动作）；系统设置 children 移除 set-account；`/settings/account` 路由保留 + allowedPaths 白名单（buildSidebarMenus 不再含它）。
- **「我的账号」定位 = 个人自助**：个人信息（账号只读 + 手机号自助修改，附说明「修改后将同步更新该账号的登录手机号」）+ 修改密码（验旧）+ **新增「我的角色与权限」只读卡片**（`GET /api/customer/members/me` → roles/perms/isTenantAdmin；管理员显示「租户管理员 + 默认全部权限」，普通成员显示角色 tags + 权限点文案）。
- **权限点文案映射**：PERM_LABELS 集中维护（如 `system:set-members` → 「系统设置 · 成员管理」），未知 key 兜底显示 `app_code:menu_key`。
- **与「成员与权限」的分工**：我的账号 = 当前登录人自助（本人手机号/密码/角色查看）；成员与权限 = 管理员治理全体成员（含代改他人手机号、重置他人密码、分配角色）。手机号为同一数据源（accounts.phone），两处入口均加同步说明。
- 测试：menuPermissions.test.js 断言 `setCodes` not.toContain('set-account')。

## 账单并入套餐与续费 + 会员菜单改名（2026-09-18 实施）

- **「我的账单」合并进「套餐与续费」**（Billing.vue 内 el-tabs：「套餐与续费」tab = 原内容（当前方案/用量/续费/发票），「我的账单」tab = `<Orders embedded />`）；侧边栏删除「我的账单」项，只保留「套餐与续费」。
- Orders.vue 增加 `embedded` prop（隐藏页头）；`/orders` 旧路由保留兼容（Orders.vue 独立可访问），并加入路由守卫 allowedPaths 基线白名单（因 buildSidebarMenus 不再含 orders）。
- **「会员」菜单改名「会员管理」**：CustomerLayout.vue + menuPermissions.js（label）+ customer.js 路由 meta title + breadcrumbs 同步。
- 菜单三处同步不变：CustomerLayout.vue + menuPermissions.js + menuPermissions.test.js（断言：billing 存在、orders 不存在、member 存在）。

## 成员与权限合并（2026-09-18 实施，方案A）

- **系统设置二级菜单「成员管理」「角色管理」合并为「成员与权限」**（path `/access`，MemberAccess.vue）：页内 el-tabs 承载「成员管理」tab（复用 Members.vue embedded 模式）与「角色管理」tab（仅租户管理员可见，复用 Roles.vue embedded 模式）；旧路由 `/members`、`/roles` 保留兼容（不在菜单出现）。
- **embedded 模式约定**：被合并页内嵌的子页面组件（Members/Roles）声明 `defineProps({ embedded: Boolean })`，`embedded` 时隐藏自身 `.page-header`（标题/描述/右上主按钮），操作按钮移至 `.page-card` 顶部 toolbar 右侧；合并页统一用 AppPageHeader。
- **菜单三处同步**：CustomerLayout.vue（`/access` 一项，`v-if="canManageMembers"`）+ menuPermissions.js（settings children 只保留 `set-access`，条件 isTenantAdmin || hasPerm('set-members')）+ menuPermissions.test.js（断言 set-access 存在、set-members/set-roles 不存在）。
- 权限语义不变：`set-members` 权限点成员可进合并页但只看得到「成员管理」tab；「角色管理」tab 由 MemberAccess.vue 内 `isTenantAdmin` 控制，普通成员不可见。

## 成员/角色权限加固（2026-09-18 实施，A+B）

- **最后管理员保护（方案A，通用强制）**：`PUT /members/:id/roles` 与 `DELETE /members/:id` 均须保证该租户至少保留 1 名 tenant_admin（countTenantAdmins ≤1 且移除 → 400「至少保留一名租户管理员」/403）；DELETE 另有「不能删除自己」。前端 Members.vue 同步禁用（最后一个管理员移除按钮 disabled + saveRoles 预校验）。
- **成员管理可授权（方案B）**：新增权限点 `system:set-members`（「系统设置」分组下的「成员管理」），自定义角色被勾选后，其成员可进入**成员管理**（列表/新建/编辑/角色分配/重置密码/停用），**角色管理仍仅租户管理员**（避免提权环：有 set-members 者不能改角色、不能分配 tenant_admin）。
- **后端中间件**：`requireMemberManage`（customer.js）= tenant_admin 放行，或 `req.user.memberId` 实时查 `member_roles JOIN role_permissions` 含 set-members（每次请求查库，角色变更即时生效，不依赖 JWT 快照）；`GET /members/me` 保持 requireTenant。旧 users（memberId=null）只认 tenant_admin。
- **前端链路**：登录时 findLoginUser（auth.js）为成员汇总 `perms`（DISTINCT menu_key 数组）→ 登录响应 `user.perms`（toUser 透传，db.js）；`menuPermissions.js hasPerm(user, key)`（tenant_admin 天然 true）；CustomerLayout 成员管理 `v-if="canManageMembers"`（isTenantAdmin || hasPerm('set-members')），角色管理仍 isTenantAdmin。
- **system 应用（hidden 系统级应用，通用机制）**：apps 表新增 `hidden` 列；`system` 应用（code='system', enabled=0, hidden=1）为权限点容器，**不出现在总后台应用中心**（appsAdmin 列表 WHERE hidden=0）与租户应用中心/演示方案（demo 覆盖全部应用改为 WHERE enabled=1 AND hidden=0），但**必须出现在分配权限弹窗分组**（permission-tree 不加 hidden 过滤）；appsAdmin 对 hidden=1 应用的编辑/改分类返回 403。新增系统级权限点：apps 表加 hidden 应用 + app_menus 登记，勿塞入真实业务应用。
- 测试：`server/test/store-owner.test.js`（+2：set-members 成员可 GET /members 且 /roles 403；移除唯一 tenant_admin → 400 且数据未变）；`menuPermissions.test.js`（+hasPerm 3 用例）。


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

### 选项卡栏常驻规范（2026-09-12 新增，通用强制）

- **只要页面属于"顶部 Tab 应用内页面"，必须渲染对应应用内 Tabs 组件（CardTabs / PanoramaTabs / GoodsHome 顶部横向分类等），选项卡栏常驻不消失**；禁止出现"打开某个 Tab 页面后顶部选项卡栏消失"的情况。
- **新增/修改应用内 Tab 页面时，Tabs 组件挂载是必检项**：每个页面模板顶部都要有对应的 `<CardTabs />`（智能名片）等 Tabs 组件，与其它 Tab 页面打开方式完全一致（点击各 Tab 在应用内切换，不新开窗口/标签页）。
- **踩坑案例**：品牌外观页曾漏挂 `<CardTabs />`，导致打开时选项卡栏消失；补挂后与其它页面一致。
- **交付前检查**：逐一打开该应用内每个 Tab 页面，确认选项卡栏均常驻显示、激活态正确、点击可切换。

## 前端 API 调用规范（防重复踩坑）

- `adminApi` baseURL=`/api/admin`、`customerApiCall` baseURL=`/api/customer`，调用时 **URL 不得重复前缀**（写 `/card/templates` 而不是 `/api/admin/card/templates`）。
- 响应拦截器已解包（返回 `res.data`），组件内直接取 `res.xxx`，**禁止再写 `res.data.xxx`**。
- 错误处理：拦截器已 reject 为字符串，`catch (e)` 直接 `ElMessage.error(e || '默认提示')`，**禁止** `e.response?.data?.error`。
- 新增页面调用前先确认所用 API 实例的 baseURL 与拦截器行为，参照现有页面（如 Analytics.vue、TemplateLibrary.vue）。

# 复刻新组件/新功能强制流程（2026-09-19）

**复刻任何新组件/新页面/新功能前，必须先读 `docs/复刻检查清单.md`，逐条打勾后才允许写代码。**
截图存 `docs/对标截图/<组件名>/`，没有截图就不动笔。这是硬规则，不是建议。

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

## 问题4：组件内联 template 字符串在 vite runtime-only 构建下不编译导致渲染为空（2026-09-17）

**现象**：商城设置页（GoodsSettings.vue）自封装 `OnOff`（开启/关闭 radio 组）与 `LinkInput` 组件，以 `template: '...'` 字符串定义，页面正常构建但组件渲染为空（表单行只剩说明文字、radio/输入框全部消失）。

**根因**：vite 的 vue 插件默认使用 runtime-only 构建（无模板编译器），组件选项中的 `template` 字符串无法编译成 render 函数 → 渲染结果为空，且不报错，排查极难（console 无任何 Vue 警告）。

**预防规范**：
1. **自定义展示组件禁止用 `template:` 字符串定义**；优先把结构直接内联写进页面模板（重复 12 次也比渲染为空好排查），或使用 `h()`/JSX render 函数（`defineComponent({ setup() { return () => h(ElRadioGroup, {...}, () => [...]) } })`）
2. 渲染空的问题排查顺序：先确认构建产物是否最新（`navigate('reload')` 强制刷新，SPA hash 路由 navigate 到同 URL 不会自动 reload）→ 再看 console → 最后查组件定义方式
3. 复刻字段类页面时，字段全集/默认值/联动条件（v-if 显示）以对标页 DOM 实测为准，保存后必须 reload 验证持久化，不能只验证「保存成功」提示

## 问题5：接口返回结构假设错误 + catch 静默吞错，导致 UI 静默变空（2026-09-17）

**现象**：商城设置「商品推荐 → 关联分类」下拉永远为空。接口实际返回 `{list, tree, total}` 对象，代码却按数组 `(cats || []).map(...)` 取值，抛 TypeError 后被 `catch (e) { /* 分类加载失败不阻断 */ }` 静默吞掉 → 页面正常渲染、无任何报错，但选项缺失。

**根因**：① 未对照后端实际响应结构（res.json 的字段形状）就假设返回是数组；② catch 无痕吞错，异常既不 console 留痕也不给用户提示，静默降级为空态。

**预防规范（通用，不限于本页）**：
1. **接口返回结构以真实响应为准**：新接/改接接口前，先 curl 或 Network 面板确认后端 `res.json` 的字段形状（数组？对象？`list/tree/total` 哪个字段），再决定取值方式；禁止凭"应该是数组/应该是 data.xxx"假设写 `.map`/解构。
2. **catch 禁止静默吞错**：
   - 数据直接决定用户可操作内容（下拉选项、级联、联动表单、模板、列表）时，失败必须可见——`ElMessage.error` 或页面兜底态（如"XX加载失败，请重试"），禁止空注释吞掉。
   - 非关键路径（角标、次要计数）确需吞错时，catch 内至少 `console.warn` 留痕，便于事后定位。
   - `catch (e) { /* ... */ }` 空注释兜底视为红线。
3. **"加载成功但界面为空"排查顺序**：先核对接口返回结构是否取对字段 → 再查 catch 是否吞异常（临时在 catch 里 console.error 或删掉 catch 复现）→ 最后查 v-if/v-show/联动条件。
4. **交付前自查**：涉及"接口数据 → 渲染选项/列表/联动"的改动，浏览器实测确认有数据时选项出现、无数据时有可见空态；不要把"页面没报错"当验证通过。

## 问题6：二级菜单 key 与组件映射键不一致，导致页面误挂「开发中」占位（2026-09-17）

**现象**：商品订单（GoodsOrders.vue 已实现 335 行）在订单配送菜单下长期显示「功能开发中」，用户误以为未开发。

**根因**：`GoodsHome.vue` 的 `subDefs.order` 用 `key: 'order'`，而 `compMap` 映射键是 `goodsOrders`（组件名），key 与映射键不匹配 → `compMap['order']` 为 undefined → 落入「开发中」占位分支；同页 afterSale/returns 键一致故正常。

**预防规范（通用，不限于本页）**：
1. **二级菜单 key 必须与 compMap 映射键严格一致**：新增/调整菜单时，检查 `subDefs[top].key` 与 `compMap` 键、组件名三者一致；以组件名为准，禁用"语义相同但键不同"的写法。
2. **交付前逐一打开每个二级菜单实测**：确认渲染的是真实组件而非「功能开发中/敬请期待」占位；「页面有标题」不等于组件已挂载（占位页也有标题）。
3. 排查顺序：点菜单看内容 → 比对 subDefs.key 与 compMap 键 → 检查 `s.disabled` 占位标记 → 检查 build 是否最新（reload）。

## 问题7：对标字段级联数据缺失时擅自降级（省/市/区县三级漏成两级）（2026-09-17）

**现象**：退货地址对标菜鸟云是省/市/区县**三个下拉**，我方因 `AREA_DATA` 只有省/市两级数据，未补数据也未先询问，**自行降级为两个下拉**交付，用户验收时发现不符合 1:1 规范。

**根因**：① 复刻时明知对标为三级，却以"本地数据不足"为由静默降级，没有先向用户说明差异与补数方案；② 未检查项目内是否存在更全数据源或可引入的公开区划数据。

**预防规范（通用）**：
1. **对标层级/选项数量必须 1:1 还原**：对标是几个下拉/几级联动，我方就必须几个；本地数据缺失不是降级理由——先补齐数据（公开行政区划等）或向用户说明差异并取得确认，二选一，禁止静默降级。
2. **全国省/市/区县三级数据已入库**：`web-admin/src/views/customer/goods/area-data-full.js` 导出 `AREA_DATA_FULL`（31 省/3056 区县，来源 modood/Administrative-divisions-of-China pca.json）；需要区县级选择的新页面直接引用，禁止再只用两级数据。
3. 交付前逐级点开联动下拉实测：省→市→区县逐级可选、切换上级清空下级、保存值与回显一致。
4. 旧数据兼容：存储格式升级（如"省 市 详细"→"省 市 区县 详细"）时，回显必须兼容旧数据（按区县表匹配第3段是否为区县）。

## 问题8：`<script setup>` 使用 Vue API 漏 import，构建不报错但运行期页面静默降级（2026-09-18）

**现象**：设计中心首页装修预览（?preview=1）只显示名片默认首页、装修 DIY 块完全不出现；管理端草稿数据（design_json）与接口返回（/api/card/design/config?preview=1 返回 8 组件含 article-list source=content）均正确，但 C 端 `DesignPage` 未挂载。排查两天最终定位：`DesignPage.vue` 使用 `computed()` 但 `<script setup>` 的 `import { reactive, ref, onMounted, onUnmounted } from 'vue'` 漏了 `computed`。

**根因**：vite/uni 构建时未导入的标识符被当作 undefined 编译进产物，构建/verify 全绿、无编译报错；运行期 `setup` 抛 `ReferenceError: computed is not defined`，被 home.vue 外层 `catch (e) {}` 静默吞掉 → designComps 赋值未执行 → `v-if="designComps.length"` 为 false → 整块装修区不渲染、无任何错误提示。顺带发现 `DesignNav.vue` 选项式子组件用 Vue2 风格 `render(h)`，Vue3 不注入 h 参数，同样报 `TypeError: e is not a function` 导致设计头部不渲染。

**预防规范（通用，含小程序端）**：
1. **`<script setup>` 组合式 API 用到什么必须显式 import 什么**：`ref/computed/watch/onMounted/onUnmounted/nextTick/reactive` 等全部从 'vue' 显式导入；禁止依赖任何"全局可用"的错觉（uni-app 只全局提供 uni 与 @dcloudio/uni-app 生命周期）。
2. **选项式 `render(h)` 是 Vue2 写法**：Vue3 中选项式 render 不传 h 参数，必须 `import { h } from 'vue'` 并写 `render()`（无参），内部用 `h('view'/'text'/'image')` 创建元素。
3. **"数据对、接口对、页面不渲染"排查顺序**：①浏览器 console 抓 `ReferenceError/TypeError at setup/render`（先给外层 catch 临时加 `console.error` 暴露被吞异常）；②按报错 chunk 对照源码 import 完整性；③再查 v-if 条件与响应式赋值。**禁止**在 catch 静默吞错（红线，见问题5）。
4. **交付前自查**：新增/修改 C 端组件后，先扫一遍 `grep -n "computed\|watch\|nextTick" 文件` 对照 `import { ... } from 'vue'`；改完构建后必须浏览器实测真实页面（含装修预览路径），不能只看构建通过。

## 问题9：C 端验证被 Service Worker / HTTP 强缓存旧 chunk 蒙蔽（2026-09-18）

**现象**：清 SW 重载后 script src 仍是旧哈希（index-VukaJ0H_.js），新构建（index-CWxy2DC-.js）不生效；即使 reload 也复用旧 index.html + 旧 chunk，导致改了代码但行为不变、白排查。

**根因**：① server/public/card/assets 采用 1 年强缓存（`Cache-Control: public, max-age=31536000`），旧哈希文件残留在目录时浏览器直接命中缓存；② 同 URL 导航（hash 路由）被浏览器复用不重新请求 HTML；③ Service Worker 曾用 stale-while-revalidate 缓存页面。

**预防规范**：
1. **同步产物必须删旧再拷**：`rm -rf server/public/card/assets/* server/public/card/index.html` 后 `cp -R` 新产物，禁止 `cp -R` 直接叠加（旧 chunk 残留会污染验证）。
2. **验证前清 SW + 缓存破坏参数**：`navigator.serviceWorker.getRegistrations()→unregister` + `caches.keys()→delete`；刷新用带 `&v=随机` 的 URL 强制重新请求 HTML，并核对 `document.querySelectorAll('script')` 的 src 是否为新哈希。
3. **判断"代码改了没生效"**：先看 script src 哈希是否等于最新构建产物，不等 = 缓存问题，先清缓存再排查逻辑。

## 问题10：API 响应 ETag/304 导致 uni.request 拿到空 body，页面数据静默为空（2026-09-18）

**现象**：商城 C 端购物车/门店列表：curl 接口 200 返回 1 条，页面却显示「购物车还是空的/暂无可用门店」；服务端日志同 URL 交替出现 `200` 与 `304`。页面加载的 chunk 哈希是最新的，排查半天无果。

**根因**：express 默认对所有响应生成 ETag，GET 接口第二次被浏览器带 `If-None-Match` 请求 → 返回 304（无 body）；uni.request（H5 为 XHR）对 304 处理不完整，`res.data` 为空且 statusCode 判定走非 2xx 分支或静默空，页面 `res.list || []` 得到空数组——接口「成功」但数据为空，且无任何报错。

**预防规范（通用）**：
1. **API 响应必须禁用 ETag**：`createApp` 内 `app.disable('etag')`（已实施于 server/src/app.js）。API 数据频繁变更，不应走协商缓存；静态资源另有 Cache-Control 不受影响。
2. **「接口 200 但页面空」排查顺序**：先 curl 二次确认是否出现 `304` → 再核对页面加载 chunk 哈希（问题9）→ 再查响应结构/catch 吞错（问题5）。
3. **uni.request 对 304 的不信任**：任何「服务端 curl 有数据、页面无数据」的组合，先怀疑 304/缓存，再怀疑取数逻辑。

## 问题11：uni H5 storage 与 localStorage 直写不同步，页面模块读不到登录态（2026-09-18）

**现象**：用 `localStorage.setItem('card_token', token)` 注入登录态后，页面 ensureLogin 仍判未登录、不发请求（服务端日志无该请求）；同一浏览器上下文内直接 `fetch` 却 200 有数据。

**根因**：uni-app H5 的 `uni.getStorageSync` 内部对 localStorage 有内存缓存/包装，绕过 uni API 直接写 localStorage 时页面模块读到的仍是旧值或空；反之 uni 写入后直读 localStorage 也可能是包装格式。

**预防规范（通用）**：
1. **读登录态统一走 `getToken()`（mallUtil.js）**：H5 端 `localStorage.getItem('card_token')` 直读优先（token 就是原始字符串），小程序端 fallback `uni.getStorageSync`。禁止页面再裸写 `uni.getStorageSync('card_token')` 判断登录态（小程序可用但 H5 埋雷）。
2. **调试注入登录态**：`localStorage.setItem('card_token', token)` 后必须整页刷新（location.href）让页面重新加载；同 tab hash 导航页面模块不重新初始化 storage 缓存。
3. **「登录态判断失败但 fetch 正常」= storage 不同步**，先换成 getToken() 直读再排查业务逻辑。

## 问题12：uni 装修组件「内层 height:100%、外层漏设高」导致 DOM 渲染但视觉塌陷（2026-09-18）

**现象**：商城首页轮播图（swiper）接口正确返回、DOM 元素也在（.dp-swiper 节点存在），但页面上完全看不到——`getBoundingClientRect().height = 0`。

**根因**：DesignPage.vue 中 `dpSwiperBoxStyle` 返回 `height:'100%'`，而外层 `.dp-swiper` 容器 style（`dpSwiperStyle`）只设了 borderRadius/shadow，**漏设高度**；父容器高度 auto → 100% 解算为 0 → 内层 swiper 高度 0。uni H5 不会报错，页面「数据对、DOM 在、就是看不见」。

**预防规范（通用，不限于 swiper）**：
1. **任何内层用 `height:'100%'` 的组件，外层容器 style 必须显式设高度**（`p.height+'px'` 或 aspect-ratio）；二者缺一必塌陷。全文件 `grep "height: '100%'"` 必须逐个核对外层。
2. **uni-app H5 中 `<swiper>` 是特殊组件**：不设高度时 H5 端按 0/默认 150px 计算，必须由 props.height（设计稿 px）显式撑外层；image 类组件靠 mode（widthFix/aspectRatio）或内容撑高，不受此影响。
3. **「组件 DOM 存在但看不见」排查顺序**：先 `getBoundingClientRect().height` 量外层/内层 → 若为 0 即高度塌陷，查外层 style 是否漏高 → 再查图片 404/接口字段。不要只看接口数据正确就以为渲染正常。
4. **新增装修组件时自查**：style 函数必须覆盖「尺寸从哪来」——是内容撑开、aspect-ratio、还是 props.height；三选一必须有答案。

## 问题13：复刻组件图标擅自自创 SVG，风格与原版 PNG 不统一（2026-09-19）

**现象**：复刻 ew 8 个商城装修组件时，组件库图标一开始全用占位 `image`，后来又自作主张配了 SIcon 黑色线性 SVG，结果与设计器里其它组件（ew 原版彩色 PNG，橙色/粉色系）风格完全割裂。用户明确要求"直接复刻 ew 对应图标，重复的才重制"。

**根因**：① 没先确认对标站该组件图标用的是什么素材、长什么样，就凭"语义接近"从本地 SVG 图标库里挑；② 组件库图标渲染机制是 `<img :src="COMP_ICONS[c.icon]">`（PNG 映射表），icon 字段本应指向 ew 原版 PNG 的 key，我却填了 SVG 名 → 既破图又风格不搭。

**预防规范（通用，不限于组件图标）**：
1. **复刻任何带视觉素材的组件，图标/缩略图必须先用对标站原图**：在对标站组件库上，读卡片的 computed `background-image` 或 `img.src`，下载原版 PNG 到 `web-admin/src/assets/comp-icons/`，再在 `componentRegistry.js` 的 `COMP_ICONS` 登记映射。**禁止**凭语义从本地 SVG 图标库挑一个顶替，除非该图标在对标站不存在或与已有图标重复。
2. **组件库图标 = ew 原版 PNG（彩色）**：icon 字段值必须是 `COMP_ICONS` 里已有的 key，或新增 import 后登记；PageEditor 的 SIcon fallback 只是兜底，不是默认方案。
3. **「重复图标才重制」原则**：ew 原版多个组件共用同一张图（如 goods/group 与 goods/all 共用 goods.png、轮播与展播共用 bannerGoods.png）是正常的，直接复用；只有对标站确实没有对应图标时才用 SIcon 兜底。
4. **交付前视觉对照**：新组件图标与同组其它组件并排截图看——色彩风格、图标大小是否一致；出现黑/灰线性图标混入彩色 PNG 组时立即停下。

## 商城装修页固定头部规则（2026-09-18）

- `/pages/mall/index` 页面级固定头（「商城」标题+购物车）仅在**无装修组件兜底**时显示；`designComps.length > 0`（装修首页/行业首页）时必须隐藏固定头（`v-if="!designComps.length"`），让装修内容（轮播图等）顶到页面最顶部，与真实 C 端访问一致。
- **预览 URL 必须走真实 C 端入口**（mall-home → `/mall/#/pages/mall/index`），禁止用通用装修容器代替——通用容器自带头部栏会造成预览与真实页面不一致。

# 商城 C 端一期口径（2026-09-18）

- **金额口径（强制）**：商品列表/详情接口 price=元；购物车 cart 接口 price=分（`Math.round((sku|goods 单价)*100)`）；订单/支付 amount=分。前端统一 `fen2yuan`（分→元）/`yuanFmt`（元→元字符串），禁止混用。
- **下单后清购物车**：checkout 提交订单 + mockPay 成功后，按 `cartIds`（URL 参数）逐条 `DELETE /api/mall/cart/:id`（直接购买路径 cartIds 为空跳过）。
- **配送方式取第一个商品详情 delivery**：checkout 购物车路径下单后需 `getGoodsDetail(items[0].goodsId)` 拉取配送设置（express/citySend/takeSelf），自提模式自动切 `deliveryMode='pickup'`，与商品详情展示一致。
- **自提门店数据源 = store 表**（customer_id + status=1），非 goods_store；演示租户 tid=1 已建「东莞同城通·旗舰店」（id=3）。
- **演示数据**：goods id=11 普通（¥19.9）、id=12 多规格（sku1 大份 ¥129 / sku2 小份 ¥88）；mock 登录 code `h5_mall_e2e_1789730119908` 命中 uid 99007（customer_id=1）。
- **C 端验证前必做**：清 SW + 缓存破坏参数（问题9）+ 确认 script 哈希最新 + 确认接口无 304（问题10），否则白排查。

## 设计中心首页跳转按应用维度化（2026-09-18 新增，通用强制）

- **存储**：`tenant_home_config` 的 `home_pages`（TEXT JSON，`{appCode: 启动页路径}`）按应用维度存各行业应用启动页；旧 `home_page` 列保留并同步 = `homePages.card`（C 端旧字段兼容）。`'card'`/空值键不落库 = 该应用展示默认首页（名片默认 DIY 装修首页「首页」开关生效）。
- **接口契约**：`GET /api/customer/design/home/get` → `{homePages:{appCode:path}}`；`POST /api/customer/design/home/save` body = `{homePages:{...}}`（新）或 `{homePage:'x'}`（旧单值，兼容字符串→card）；`GET /api/card/design/config` → 同时返回 `homePage`（=homePages.card）与 `homePages`。
- **管理端 UI**（DesignHome.vue「首页跳转」tab）：按 `HOME_APPS` 清单（card/panorama…）每应用一行「已选/未设置 + 选择链接 + 清除」；选择器弹窗按当前编辑应用过滤（card = 名片页+装修页面，panorama = 全景页），标题带「选择「XX」启动页」。新增行业应用时：HOME_APPS 加行 + groupsFor 加分组。
- **C 端消费**（web-app/src/utils/design.js）：`normalizeDesignConfig` 取 `homePages.card ?? homePage`（旧字段兜底），`resolveHomePath` 不变；home.vue onShow 按 card 应用配置 reLaunch。
- **系统模板**：模板 JSON 存 `homePages` 对象（旧模板 `homePage` 单值兼容，应用模板时 `cfg.homePages` 优先）。
- **交付前检查**：每个应用行单独配置保存 → reload 后回显；旧单值配置迁移后仍生效；C 端名片启动跳转路径与保存一致。

## 后端测试全量验证规范（2026-09-18 补充）

- `npm test`（`node --test` 默认文件级并发）共享 HTTP 端口时**偶发 `HPE_INVALID_CONSTANT` 连接污染失败**（非逻辑失败，单文件/串行全过）；全量验证以**串行**为准：`node --test --test-concurrency=1 server/test/*.test.js`，344/344 全绿才算通过。
- 单文件调试：`node --test --test-concurrency=1 server/test/<file>.test.js`。

## 装修组件联动内容管理（2026-09-18 打通）

- **管理端注册**（`web-admin/src/views/customer/apps/design/componentRegistry.js`）：article-list 增加 `source` 字段（radio：manual 手动编辑 / content 内容管理文章）；新增 `pic-list`（组图列表）与 `video-list`（视频列表）两个营销组件，数据源固定内容管理（无手动模式），schema 含内容/样式/会员权限（板块标题、显示日期/封面/简介、每行几个、背景色、圆角、下边距、会员等级浏览权限）。
- **C 端渲染**（`web-app/src/components/DesignPage.vue`）：article-list source=content 分支拉 `contentArticles`（cardApi.contentArticles({tid, page:1, pageSize:20})）渲染真实文章（thumb/title/created_at），点击 `openContentArticle` 跳 `/pagesReads/showArt/showArt?id=&tid=`；pic-list 拉 `contentPics` 跳 showPictures；video-list 拉 `contentVideos` 跳 videoList 列表页（无视频详情页）；空态显示"暂无文章/组图/视频"。
- **数据链路**：管理端保存草稿 → `tenant_page_design`（status=0）→ C 端 `/api/card/design/config?preview=1` 返回草稿 components → home.vue `fetchDesignConfig(true,true,pageType)` → designComps → DesignPage 渲染。预览 URL 需带 tid/exp/sig 签名（cardApi.designConfig 自动从 hash 透传）。

## 首页跳转按应用维度化（2026-09-18 实施）

**背景**：设计中心「首页跳转」原为单值 `tenant_home_config.home_page`（只配名片小程序启动页）。按应用维度化后，每个行业应用（card 智能名片 / panorama 360全景 / 未来 mall/content 等）可单独配置启动页。

**存储与契约**：
- `tenant_home_config` 新增 `home_pages TEXT DEFAULT '{}'`（JSON：`{"card":"路径","panorama":"路径"}`）；`home_page` 保留 = `homePages.card` 同步镜像（兼容旧 C 端）。
- `GET /api/customer/design/home/get` → `{ homePages: {appCode: path} }`（home_pages 为空时从旧 home_page 迁移出 card）。
- `POST /home/save` body：新 `{homePages:{...}}` 或旧 `{homePage:'x'}`（字符串→card）；`'card'`/空值 = 该应用不跳转（展示应用默认首页），**不落库**。
- `GET /api/card/design/config` → 返回 `homePage`（兼容，= `homePages.card || home_page || 'card'`）+ `homePages` 全量。
- 系统模板 JSON 存 `homePages` 对象（旧模板 `homePage` 兼容读取，applyTemplate 优先 homePages）。

**前端**（`web-admin/src/views/customer/apps/design/DesignHome.vue` 首页跳转 tab）：
- 每应用一行（`HOME_APPS`：card/panorama…）：应用名 + 启动页 label + 「选择链接/清除」；选择器弹窗按当前应用过滤（card 含名片页+装修页面，panorama 只含全景页）；保存提交整组 `{homePages}`。
- C 端 `web-app/src/utils/design.js`：`normalizeDesignConfig` 取 `homePages.card ?? homePage`（homePages 优先），home.vue 消费不变。

**新增应用规则**：新行业应用接入时，在 `HOME_APPS` 登记 appCode+可选页面，后端无需改（home_pages 按 key 存取）。

## 测试并发模式提示（2026-09-18）

`npm test`（node --test 默认并发跑文件）偶发 `HPE_INVALID_CONSTANT`（共享 HTTP 端口连接污染），非逻辑失败。**全量验证用串行模式**：`node --test --test-concurrency=1 server/test/*.test.js`（344/344 稳定全过）；单文件 `node --test --test-concurrency=1 server/test/xxx.test.js`。

## 待接入能力清单（2026-09-17，商城设置字段全集 1:1 复刻后确认）商城设置中下列字段来自菜鸟云生态能力，我方尚未接入；**字段保留（保持 1:1）**，前端已加橙色「待接入」提示，禁止删除：



- **超级表单「红包封面」**（`useFormId=1`）：需新建「超级表单」应用（表单设计器 + 商品下单按 useFormId 收集信息）后生效；当前 C 端无读取逻辑
- **客服选择「小东」**（`cusId=1`）：需接入微信客服（详情页生成客服会话）后生效；「小东」是菜鸟云微信客服账号，接入后应改为可配置客服账号列表；当前 C 端无读取逻辑

**接入时**：必须先提醒用户确认再实施（用户已明确要求），且接入后更新本条清单状态。

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

### 已有图标库（39个）

**业务语义（15个）**：user入驻个人、building入驻企业、team员工团队、market人脉集市、exchange名片交换、pool公海客户、radar访客雷达、customer客户管理、audit审核管理、key绑定口令、chart数据统计、settings系统设置、template模板管理、dynamic内容动态、verify核销

**功能图标（24个）**：dashboard工作台、apps应用中心、orders账单、wallet钱包、storage存储、sms短信、panorama全景、card名片、channel渠道、devices多设备、solutions方案、users用户、logs日志、crown皇冠、no-ads无广告、badge徽章、analytics分析、palette调色板、wechat微信、mobile手机、official公众号、pc电脑、delivery配送、show展示

### 新增图标流程

1. 在`web-admin/src/assets/icons/svg/`创建SVG文件（24×24画布，2px描边，3px圆角，currentColor）
2. 复制到`web-app/src/static/icons/`
3. 在小程序端`SIcon.vue`的`svgMap`中添加path映射
4. 在上方"已有图标库"清单中登记
5. 构建验证：`npm run build:admin` + `npm run build:h5`

## 弹窗/表单规范

- **新建/编辑页面**：优先使用整页表单，不使用弹窗（字段较多时）
- **简单确认操作**：使用弹窗（删除确认、重置密码等）
- **弹窗宽度**：最小400px，最大600px（卡密数据等特殊场景可到860px）
- **弹窗圆角**：8px，头部padding 20px，底部操作栏右对齐
- **必填项**：红色星号标记
- **按钮**：主按钮 `#165DFF`，次按钮白底灰边，危险按钮 `#F53F3F`

### 表单标签度量规范（2026-09-17 新增，全系统强制）

**根因**：标签换行 = `标签视觉宽度 + 必填星号(14px) + 内边距(~10px)` 超过 `label-width`。

**视觉宽度计算**：中文字符/全角标点（（）×·）= 14px，半角英文数字 = 8px。例："供应商名称"=70px、"轮播图（750×750）"=132px、"第三方平台AppSecret"=142px。

**硬规则**：
1. **标签字号统一 14px**（el-form 默认），禁止为迁就宽度把个别表单标签调小字号——全系统字号必须统一。
2. **label-width 必须 ≥ 最长标签视觉宽度 + 24**，向上取整到 10px。参考表：4字→90px、5字→110px、6字→120px、7字→130px、8字→140px、9~10字→150~170px；含英文标签按视觉宽度公式实测（如"AppSecret"9字符≈4字宽、"AccessKey Secret"16字符≈9字宽→160px）。
3. **弹窗内容区 = 弹窗宽 − 64px（左右padding）− label-width ≥ 280px**；不满足时加宽弹窗（440→480/520/560），禁止压缩字段。
4. **标签文案优先精简**（≤6字）：超长先尝试缩短（如"轮播图（750×750）"→"轮播图"，尺寸放 placeholder/提示）；必须完整保留时按第 2 条配足 label-width。
5. **禁止**：手动 `<br>` 拆行、调小字号迁就、`white-space: normal` 导致意外拆行（全局 `.el-form-item__label { white-space: nowrap }` 已内置防御，短标签永不被拆行）。
6. **交付前检查**：逐一打开每个弹窗/表单，标签单行、不溢出、不与输入框重叠；对照视觉宽度公式核对 label-width；弹窗内容区 ≥280px。
7. **排查脚本**（全量扫描不达标表单）：按"label-width vs 标签视觉宽度+24"扫描 `web-admin/src/**/*.vue`，修复后复扫至 0 项。


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
- **2026-09-18 补充（同类复发）**：customer.js 6 处 `datetime("now")` 漏网，导致成员管理「停用/启用/编辑资料/重置密码」与角色改名全部 500（`no such column: "now"`）。**新增/修改任何含 SQL 的代码后，必须全仓 grep `datetime("now")` 确认 0 残留**（`grep -rn 'datetime("now")' server/src/`），修复时注意 SQL 外层引号与内层 `datetime('now')` 单引号的配对（外层改用双引号），改完 `node -c` + curl 实测受影响接口。

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

# ⭐ 1:1 细读复刻总纲（2026-09-17 全局强制，适用于整个项目任何部分）

> **适用范围声明（用户原话级要求）**：本总纲**不限于复刻任务本身**，凡涉及实现、修改、修复、新增任何功能/组件/页面/交互/素材，一律适用。用户要求「1:1 细读复刻的规范必须贯彻于整个项目的任何部分」——即：对标或参照任何已有系统/图片/规范实现时，一律按本总纲细读执行，禁止想当然、禁止私自省略、禁止自创替代。若与早期「功能 > 外观 / UI 仅用户明确要求才复刻」等旧规则冲突，**以本总纲及最新规范为准**（用户已多次声明"如有冲突以此为准"）。

## 四条铁律（违反任一条 = 返工，用户历次批评均为这些）

1. **禁想当然**：任何结论必须有对标实测证据（DOM / 真实渲染 / 用户红框 / 截图 OCR+放大核对），禁止"我以为应该有/应该是"；凡「我以为有」的字段/元素/联动，先回对标找证据，找不到就不加，找到再按实际形态复刻。
2. **禁私自省略**：默认值、默认素材、每个菜单/风格/变体/参数、每个联动、每个显示条件（含授权后显示）都必须复刻，**不因"我觉得没用/不重要"跳过**；"所有要求复刻的都要按这个规范"（用户原话）。
3. **禁自绘替代**：对标有真实图片/素材/缩略图的地方，**必须直接复制对标原图**（抓 src → 下载 → 验证 → 入 static → 引用），禁止自绘 CSS 方块/示意卡代替；本系统只允许自绘无对标参照的抽象结构。
4. **禁以绑定推断渲染**：代码绑定写对 ≠ 渲染对；必须真实键入/切换/上传后观察浏览器实际渲染结果，字段→渲染映射逐值核对（含关闭态/边界值/取消参数后的回退分支）。

## 细读动作清单（复刻/实现任何目标前强制，逐项执行）

1. **逐菜单点击**：目标所有一级/二级/三级菜单、Tab、入口都要实际点开，确认每页真实内容（曾漏「基础设置」菜单、送礼物分享样式、商品类型差异化表单）。
2. **逐字段滚读**：属性面板/表单完整滚读，字段全集以实测为准；每个字段验证「字段→渲染映射」（真实键入/切换值后预览是否即时变化且位置正确）。
3. **逐变体点开**：N 个风格/变体必须**逐一**点选，抓每个变体真实 DOM（class/元素顺序/装饰图 src/内联样式/计算值）与联动（曾漏标题栏风格4-9、商城风格详情风格三只做2个）。
4. **逐联动验证**：radio/开关/下拉切换后，①预览/渲染变化 ②嵌套参数区显隐 ③隐藏选项是否出现/消失 ④radio 值是否被强改——全部记录为「联动矩阵」。
5. **默认值与默认素材**：默认选中项、默认图片/文案/开关状态逐项与对标核对并复刻。
6. **显示条件/授权逻辑**：功能是否默认显示、是否需后台授权/总后台勾选后才出现（卡密商品/虚拟商品/礼品卡券等）——必须细读并在应用中心/菜单/表单中复刻对应显隐与授权关联。
7. **差异化表单**：同一入口按类型/条件切换不同表单（普通商品/卡密商品/虚拟商品参数不同）——必须逐类型点开细读并复刻差异化字段。

## 图片类复刻标准流程（直接复制对标原图，禁止自绘示意）

1. 浏览器 `bu.js` 抓目标 img 的 `src` + `naturalWidth/Height`（含按风格/变体矩阵的素材命名规律，如 `main_bg_{style}_{card}.jpg`、`share_{share}_{card}.png`）。
2. `curl -sL -o` 下载到 `docs/<模块>/` → `Read` 本地验证内容与映射关系。
3. 复制到 `server/public/<子目录>/`，**必须**在 `server/src/app.js` 显式 `app.use('/<子目录>', express.static(...))`（server/public 不是根静态目录，不挂载会被 SPA fallback 吞掉）。
4. 前端用真图（图卡/背景/缩略图），**禁止**用自绘 CSS 模拟；Vite 中静态 URL 必须 `:src` 绑定变量（const/computed），直接写 `src="/path"` 会被 Vite 当模块解析报 rollup 错误。

## 素材入库完整性铁律（2026-09-17 全局强制，适用于任何含素材/图片/资源的复刻）

> 从商城风格「少一张图」（price_show.png 漏复制）教训提炼，**不限于商城风格**：任何下载素材入库的任务都必须执行。

1. **下载 ≠ 入库，三步缺一不可**：①`curl -sL` 下载到 `docs/<模块>/` 备份 → ②**全量 `cp` 到 `server/public/<对应目录>/`** → ③`find server/public` 与 `find docs` **逐文件 diff 完整性**（`[ -f "server/public/$f" ] || echo MISSING`）。缺一步即前端 img 404 显示空白，且**页面无任何报错**——文件级 diff 是唯一防线，禁止以「ls 过目录」代替验证。
2. **下载失败的残件必须识别剔除**：404/拦截返回的 HTML 残件（几字节~几百字节）用 `file` 命令识别（HTML document 而非图片），不得混入素材目录。
3. **透明底白字图不能直接 Read 验证**：白字在透明/白底上肉眼不可见，Read 会误判「纯白无内容」（曾据此误判素材缺失绕弯路）。必须用 PIL 统计**白色不透明像素**（`a>200 and r>240 and g>240 and b>240` 计数 >0 即有白字内容）或**深色底合成后 Read**（`bg.paste(im, (0,0), im)`）。此类图设计为叠在彩色/渐变底上显示白字（如「年货节大促」= 蓝渐变底上的白字）。
4. **叠加层渲染缺层即视觉缺失**：由多层图/渐变叠加的效果（如价格条=渐变底+背景图+主题图+价格卡四层），验收必须**逐层断言** `img.complete && img.naturalWidth > 0`，不能只看整体截图「大概像」。
5. **「开发中」占位/页面无反应排查顺序**：代码已提交但页面显示旧内容/占位 = ①旧构建（assets 哈希未更新，需 `build:admin`）②Service Worker 缓存旧 chunk（清 SW：`getRegistrations→unregister` + `caches.keys→delete`，再强刷）。先清 SW + 重建再判断，**不要误判为路由缺失或功能未做**。

## 控件绑定与选中态规范（2026-09-17 全局强制，适用于任何表单/选项控件）

> 从商城风格分类风格「右上角打勾、下方 radio 不选中」教训提炼，**不限于商城风格**。

1. **radio/checkbox 选中态必须 `v-model` + `:value` 驱动**（或 model-value 传当前选中值）；**禁止 `:model-value` 传布尔表达式**（如 `:model-value="form.x === v"`）——el-radio 内部 value 与布尔永不相等，选中态恒失效，只剩其它视觉提示在显示，造成「点了没选中」的错乱。
2. **禁止私自添加对标没有的选中元素/状态**（右上角打勾、自定义角标、渐变遮罩等）：对标以真实渲染为准，选中态 = 对标真实的 radio/勾选/高亮形态；「增强」只能在确定不影响 1:1 且用户认可时保留（如卡片主色边框）。
3. **「控件不响应」排查顺序**：先查绑定（v-model/value/事件），再查显隐条件（v-if 链），再查样式覆盖；禁止一上来就怀疑渲染或环境。

## 交付前对比验证（复刻完成后强制）

- **属性区完整对比**：我方 vs 对标面板逐字段、逐默认值、逐控件形态并排核对（含图形化选项）。
- **预览图与对标组件对比**：同一参数组合下我方预览 vs 对标真实渲染并排截图对比（用户红框/截图即验收依据）。
- **真实页面逐操作对比**：双方执行同一操作序列，读 `getComputedStyle` 具体值逐值比对；截图仅作辅助，不作验收依据（详见下文「1:1 复刻验证规范」）。
- **需要传图实测的必须传图**：默认图、上传后预览反馈、覆盖范围、C 端真实渲染，禁止想当然假设。

## 本次商城风格教训（2026-09-17 用户批评点，已修正并沉淀）

1. 分类风格/详情风格预览曾是**自绘 CSS 方块示意**（mini-cate/mini-detail-img），被用户否决 → 已改为直接复制对标真图（style1/2/3.jpg + main_bg/share/price_bg/price_theme 全套素材，见下文「商城风格 1:1 复刻规范」）。
2. 详情风格**漏做第 3 个**（对标 3 个只复刻 2 个）→ 根因：没逐个点开细读变体数量 → 已补齐 3 个并验证全部联动矩阵。
3. 素材命名规律（main_bg_{风格}_{卡片} 等）必须抓全抓准，联动位置（分享图 top 矩阵、价格条 top=250px）以对标 CSS 实测为准。

---

# 复刻开发规范（2026-09-10 新增）

- **复刻链接（功能参考）**：用户指定复刻某链接的功能时，默认 **1:1 还原其交互行为与业务逻辑**（点击/切换/条件联动/状态流转/数据流/校验等），**不承诺复刻外观 UI**——除非用户专门指定"1:1 还原页面 UI"，才按原页面外观复刻。否则界面统一按本系统 UI 规范（设计令牌、组件库、页面布局规范）实现。
- **发图片复刻**：用户以图片（截图/原型/竞品图）传达功能要求时，按资深程序员视角提炼专业业务逻辑构建功能（交互闭环、边界状态、数据校验、空态/异常态），图片仅作功能与布局参考，UI 遵循系统风格。
- **判定顺序**：先确认复刻目标是「功能」还是「UI」——功能复刻 = 行为逻辑 1:1 + 系统 UI；UI 复刻（仅当用户明确要求 1:1 还原页面 UI）才做外观 1:1。两类复刻均必须补全组件库缺失配置项（如 eweishop 视频号视频的「视频样式」比例 16:9/4:3/1:1/9:16），不允许因 UI 简化而丢失功能配置。

## 复刻执行强制动作（2026-09-10 补充）

- **逐项点击核对**：复刻链接/图片功能时，**对标页面上的每一个按钮、下拉、开关、单选都要实际点击触发一遍**，确认各自功能与业务逻辑，不得只读面板文本、只看静态截图就下结论。
- **应用级菜单门禁（2026-09-17 新增，漏菜单三次教训沉淀；适用范围 = 所有复刻任务）**：凡复刻**任何目标**——应用（含侧边栏或页内导航的多页面模块，如卡密库/礼品卡券/送礼物/商品/会员）、单页面、组件、功能入口——交付前必须通过三道门禁，任一不过不得提交：
  ① **全量抓结构**：进入对标目标入口后，先用浏览器把**完整导航结构全量抓出**（侧边栏菜单/页内 Tab/分区入口及其 URL），形成「结构核对清单」——禁止凭印象/凭入口页判断有多少个页面或模块；
  ② **结构数对齐**：我方实现的页面/Tab/入口数量必须 ≥ 对标结构数（对标每个菜单项/Tab/入口在我方都必须有对应实现），数量不一致直接判定漏项，先补后交付；
  ③ **逐项实测**：清单上**每一项都必须实际点开**，抓取该页字段（列表列/表单字段/设置项/弹窗），禁止只测主入口页就交付——「基础设置」「订单」「记录」「日志」等非列表页最易漏。
  此门禁与「逐项点击核对」并行：逐项点击覆盖页内控件，结构门禁覆盖页面层级；**漏任何一层都视为未执行规范**。
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

## 五、渲染差异兜底复刻规范（2026-09-11 新增，强制）

> 触发场景：**任何 1:1 复刻组件交付前**。仅测默认态 + 联动出现路径，无法发现「字段取消/关闭后预览样式与对标不同」类差异——关闭态是独立的 v-if/v-show/回退分支。本节七条手段组合使用，无重复工作（与细读/实施/验收各条互补，不复述对方已要求的内容）。

1. **关闭态必测矩阵**：每个开关/单选字段在对标侧**逐个切到「否/关闭/不启用」态**，记录真实渲染变化（元素移除还是 v-show 隐藏？标题是否重新居中？间距/颜色是否回退？），逐字段记录成表（字段 → 对标关闭态渲染行为）；实现后逐条断言**关闭后的布局形态**，不只断言"能关掉"。教训来源：标题栏子标题/更多/图片启用=否的渲染行为曾与 ew 不同。
2. **差分对照法（含中间态）**：同一字段在**对标与我方两侧同步操作、同步截图**并排对比——不止比最终态，也比变化过程/中间态（关闭、切换、输入的中间帧布局）。复用验收第 2 条截图并排方法，但必须**同步操作**而非各自操作后拼图。
3. **DOM 快照结构化 diff**：对每个字段状态，抓对标与我方组件**完整 outerHTML + computed style**（元素存在性/class/inline style/字号/颜色/间距像素），做字段级 diff 产出差异清单；抓取方法复用细读清单第 5 条（getBoundingClientRect）与第 12 条（outerHTML）；截图肉眼对比只作辅助，**差异判定以结构化 diff 为准**。
4. **边界值测试**：每个 slider 测 min / max 两端；每个输入框测**超长文本与空文本**——对标对空值的行为（隐藏？显示默认文案？报错？）常与猜测不同；空值 + 关闭态组合必测。
5. **联动矩阵（防组合爆炸）**：必测组合 = **每个开关关闭 × 每个风格**（同一开关在不同风格下的关闭行为可能不同：S1 关子标题 vs S7 无子标题字段，行为分别实测）；其余组合按细读清单第 13 条联动探测覆盖，不强行全组合。
6. **发布态反向验证**：管理端画布是简化渲染，**保存草稿→发布→C 端预览**必须实际打开验证画布与 C 端真实渲染一致（含关闭态/边界值效果）；机制复用设计中心「P2 保存并预览」（`?nc=preview` 预览 URL），本条是复刻验收动作不是实现机制。
7. **渲染行为契约表**：每个组件复刻时产出一张契约表 `字段 × 取值（默认/开启/关闭/极值/各风格）→ 对标渲染行为（DOM/CSS 证据）`；实现与验收**全部对着契约表逐行打勾**，禁止对着截图"看着像"判定通过。契约表随组件交付存档，作为回归测试基线。

## 六、属性面板控件链完整性规范（2026-09-11 标题栏图片上传缺失经验沉淀，强制）

> 触发场景：**任何属性面板复刻/修改后**。教训：标题栏风格1 图片字段**只有 label 与提示文字可见，图片上传/选择控件整体未渲染**（`f.tips` 的 v-if 插在 v-else-if 控件链中间切断链，其后的所有控件分支失效），用户截图对比才发现——字段 label 与提示是普通文本节点，控件缺失时它们仍然显示，**肉眼/OCR 看到字段名 ≠ 控件已渲染**。

1. **label/提示可见 ≠ 控件已渲染**：面板字段的 label、tips、占位文字是静态文本，控件（input/选择器/上传预览/滑杆/开关）因渲染链 bug 缺失时它们照常显示。验收必须以**控件 DOM 存在性**为准：图片字段断言 `.pe-img-main/.pe-img-empty`、文本字段断言 `input`、滑杆断言 `.el-slider`、单选断言 `.el-radio-group` 等，禁止只断言字段 label 文本存在。
2. **控件链禁止中间插入独立 v-if**：`v-if / v-else-if` 控件链中**不得**插入独立的 `v-if`（如字段提示 tips、帮助文案）——独立 v-if 会重新成组，切断后面的 `v-else-if` 链，链内控件整体不渲染。字段级提示必须放在控件链**末尾**作为独立 `v-if`（或链外），并保留根因注释防回退（PageEditor.vue 已有示例注释）。
3. **带 tips 字段必查控件**：历史上 tips 断链影响面 = 所有带 tips 的字段（标题栏图片、视频号ID输入框）。复刻或改动后必须逐字段验证这些控件真实渲染且可交互，不能只看面板文本。
4. **defaultProps 默认素材禁止留空**：对标面板图片字段**有默认图**时（如 ew 标题栏默认红心图 title3.png），defaultProps 必须写入该默认图（如 `/static/design-styles/title/title3.png`）；渲染端兜底默认图 ≠ 面板默认值，两处都要与对标一致。图片/素材字段默认值一律对照对标面板实测值填写，禁止 `''` 留空。
5. **help 与 tips 不叠加**：图片选择器等控件的帮助文案优先取对标原文案（如「建议尺寸：80*80像素」）；同字段 help 与 tips 只保留对标显示的那一处，禁止默认文案与自定义提示双行叠显（PeImagePicker help 优先 `f.help`，未设时不得再叠默认「建议图片宽度750…」）。
6. **改模板控件链必须全字段回归**：改动表单控件渲染模板（增删 v-if/v-else-if、移动控件位置、加字段）后，必须浏览器实测面板**全部字段控件**渲染存在且可交互（重点复查带 tips/help 字段），不能只验证本次改动的字段。


## 七、两层容器渲染语义规范（2026-09-11 标题栏/富文本底层颜色重叠教训，强制）

> 触发场景：对标组件面板同时存在「底部背景/底部颜色」与「组件背景/背景色」两个字段。ew 实测真实语义为**两层容器**，曾因第一版把边距/圆角挂在错误层导致「底部颜色与组件背景区域重叠」返工。

1. **底部颜色=外层容器全宽底色，组件背景=内层容器底色**：外层 `.r-tb-box/.dp-tb-box`（富文本 `.r-rt-box/.dp-rt-box`）只承载底部颜色 + 上下边距；内层 `.r-titlebar/.r-richtext` 承载组件背景（色/图）+ 左右边距（左右内缩，ew 实测 375→343）+ 上/下圆角（ew 实测 elBR=9px 仅内层）。两层禁止合一层。
2. **验证方法（DOM 断言，非截图）**：设底部颜色 #F53F3F 后断言外层 computed backgroundColor 为 rgb(245,63,63) 且内层为组件背景色（默认 #fff）；设左右边距 16 断言**内层** marginLeft/Right=16px 而外层仍全宽；设上圆角断言内层 borderTopLeftRadius 生效、外层为 0。
3. **逐层归位检查**：任何「背景/边距/圆角」字段改动后，逐字段确认挂载层（外层 or 内层）与对标一致——边距中「上/下边距」在外层、「左右边距」在内层；圆角只在内层。

## 八、富文本组件复刻规范（2026-09-11 新增，强制）

> 对标 ew「富文本」= **可视化富文本编辑器**（wangEditor 特征：段落格式/字号/加粗/斜体/下划线/删除线/文字颜色/背景色/表格/插图+超链接/元素路径/字数统计），不是 textarea 输 HTML。

1. **编辑器必须可视化**：管理端用 wangEditor5（`@wangeditor/editor` + `@wangeditor/editor-for-vue@next`，web-admin 工作区安装），工具栏默认字体/加粗/斜体/下划线/删除线/文字颜色/背景色/表格/图片/链接；excludeKeys 排除 video/image 组与 fullScreen（保留表格，ew 默认内容含表格）。
2. **面板字段族（ew 1:1）**：内容(richtext 编辑器) / 底部背景(transparent) / 组件背景(#ffffff) / 样式(默认|投影|描边 + graphic) / 描边颜色(when 描边) / 上边距 / 下边距 / 左右边距 / 上圆角 / 下圆角 / 会员等级浏览权限(允许访问|禁止访问|全部允许)。**无内边距字段**（padding 已废弃，ew 无此项）。
3. **默认内容=ew 模板**：defaultProps.html 用 ew 默认模板（「点此编辑『富文本』内容 ——>」+ 加粗/斜体/下划线/删除线/文字颜色/背景色说明 + 表格示例 中奖客户/发放奖品/备注 猪猪/内测码/已经发放 大麦/积分/领取地址 + 插图超链接说明）。
4. **编辑器集成要点**：customUpload 走 `designCall.post('/material/upload', fd)`（baseURL=/api，URL 不带 /api 前缀，拦截器已解包取 res.url）；onChange 同步 html + 字数统计（getText 去空白 length）；onCreated 挂 selectionchange 显示元素路径；卸载必须 editor.destroy()。
5. **两层渲染与标题栏同构**：外层底部背景+上下边距，内层组件背景+左右边距+圆角+样式(投影 boxShadow/描边 border)；C 端 DesignPage 用 uni-app `<rich-text :nodes>` 同构实现 `.dp-rt-box/.dp-richtext`。

## 九、颜色选择器系统标准（2026-09-11 用户选方案A，强制）

> 用户对比三案后选「方案A = 1:1 复刻 ew（iView ColorPicker 风格）」为全网颜色选择器标准（PeColorPicker.vue）。

1. **形态**：触发器（色块+值文本+小箭头）点开**下拉浮层**（跟随定位，非居中弹窗）；浮层 = SV 饱和度方形面板（白→色相渐变 + 下→上黑渐变，圆点指针可拖）+ 色相横条（红→紫渐变 + 指针）+ hex 可编辑输入 + 「清空」「确定」按钮。
2. **交互**：SV/色相条 pointerdown+pointermove 拖拽实时更新（pointerup 释放）；hex 输入 Enter 提交；清空=置空（transparent）；确定=emit 提交并关闭；点击外部关闭不提交。transparent/空值保留（显示 transparent、色块透明格纹）。
3. **纯函数**：hsvToHex/hexToHsv/normalizeHex 内置组件（支持 3 位/6 位 hex）；SV 背景用 `linear-gradient(to top,#000,transparent) + linear-gradient(to right,#fff,hsla(H,100%,50%,0)) + hsl(H,100%,50%)` 组合；色相圆点 background 必须内联 `hsl(h,100%,50%)`（禁止用未设置的 CSS 变量，曾致圆点恒红）。
4. **应用范围**：所有组件属性面板颜色字段（颜色/描边颜色/底部颜色/组件背景等）统一走 PeColorPicker，禁止混用原生 input[type=color] 或旧弹窗色板。

# 1:1 复刻验证规范（2026-09-17 更新：以真实操作对比为准，废止像素 diff）

> 用户已两次明确否定"像素相似度/diff 截图"作为验收流程（"你这个流程是不对的"），确认的正解是**真实页面逐操作对比**：在双方真实页面上执行同一操作序列，逐一抓取双方真实渲染结果（计算样式/联动/隐藏选项），逐项比对。截图只作辅助证据，不作验收依据。

## 真实页面逐操作对比流程（复刻完成后强制）

1. **对照页实测定案**：先在对标系统真实页面（如菜鸟云 stylediy）用 `bu.js` 读取控件结构（`input[name=...]`/`.checked`，不靠截图猜）与初始计算样式；**每一个按钮/radio/开关都要点到**，记录完整操作序列下的真实渲染（含联动、隐藏选项、被强制覆盖的字段）。
2. **真实渲染抓取**：`getComputedStyle` 读双方关键元素（头部背景/文字色/top 状态栏图 src/覆盖层类名等）的**具体值**，与对标逐值比对（如 `rgb(13,162,157)` 逐值一致），不依赖肉眼。
3. **同序列双端比对**：把同一操作序列（如：跟随主色+白字 → 切白色头部 → 点白字 → 回跟随主色）在**双方**各执行一遍，读每次操作后的真实状态（含 radio checked 是否联动改动），逐行比对输出。任何一步不一致即修复后重跑。
4. **隐藏/联动项专项检查**：切换每个开关/选项，确认是否有新选项出现/消失、radio 值是否被强改、渲染是否被强制覆盖（如菜鸟云"白色头部瞬间文字强制黑但 radio 值不动，点过文字选项后按 radio 渲染"）。
5. **截图仅作辅助**：截图存档防覆盖（固定 shot.png 需立即 cp 存档）、元素可见性检查（rect 不超视口）仍执行，但截图不参与差异判定；判定只以第 3 步双方真实值比对为准。
6. **默认素材/传图实测**：复刻含图片上传的组件必须**用真实图片上传实测**（默认图、上传后预览反馈、覆盖范围），禁止"想当然"假设渲染结果。

## 透明 PNG 素材机制（菜鸟云系统风格预览）

- 三张背景图是**透明挖空 PNG**：主题色应出现的区域在 PNG 里是透明的（alpha=0），手机壳/页面背景层填充选定配色，**切换配色时透明处透出填充色**（有色的地方是透明的）。
- 我方等价实现：背景图（透明挖空）+ 动态覆盖层 div 填充当前主题色 → 视觉一致（已实测青蓝/玫红/白色头部联动）。
- **层级硬规则（2026-09-17 菜鸟云 DOM 实测）**：覆盖层 z-index 必须**低于**背景图（菜鸟云 con_div z-index=auto < img z-index=2）——img 不透明处显示原图、仅透明区透出覆盖层。**禁止**把覆盖层设 z-index=3 平铺在背景图之上（曾导致"色块在图片上面"：W1 块区被主色块盖住）。判定标准：截双方像素比对——W1 块区应为白色原图、头部为主色透出、W2 头部为 img 自带灰白状态栏（W2 无 top/head 层）。
- 主题色区域禁止用半透明覆盖层平铺（会盖住背景文字），必须精确挖空或按菜鸟云 CSS 的 con_div 覆盖层几何落位。

## 系统风格头部联动（2026-09-17 菜鸟云 stylediy 实测定案）

- 头部文字 radio **始终显示**（白色头部时也显示，禁止 v-if 隐藏）；radio 值独立存储。
- 渲染规则：跟随主色 → 主色底 + radio 文字色；切到白色头部**瞬间** → 白底 + 文字强制黑（radio 值不动）；之后点击文字选项 → 按 radio 渲染（白头部+白字可生效）；切回跟随主色按 radio 渲染。
- top 状态栏图按**最终渲染的文字颜色**切换（黑→top2，白→top1），与头部颜色无关。
- 实现：`headPreviewStyle(style, forceBlack)` 纯函数（designStyle.js）+ DesignHome.vue `headTextTouched` 状态（头部颜色 change 时重置、文字 radio click 时置 true）。

## 系统风格三窗红框差异排查（2026-09-17 用户青绿截图 8 处红框定案；09-17 二轮 5 处红框证伪更正；09-17 三轮 4 点形态纠正）

- **红框截图 = 权威验收依据**：用户上传带红框的截图，红框圈出的每一处都必须**逐区裁图放大比对**（Python PIL 裁框 + Read 放大 8 倍看 Description/OCR），禁止只凭整图 Description 判断；红框内"看似背景自带"的内容（如商品实景图）也要裁开确认为素材自带还是动态元素，不能想当然。
- **背景图素材与动态元素分离**：W2 **邀请区圆形人物头像组**、W2 **已售300份**（纯主色文字 + 主色火焰图标在文字**上方**，无胶囊背景）、W2 **推荐/新品/热卖/促销/限量 标签行**（白底浅青描边圆角）、W2 **加入购物车/立即购买左右无缝合成一个整体胶囊**（左半 `rgba(primaryColor,0.25)` 浅青底 + 主色字，右半主色渐变底 + 白字，整体 `border-radius` 胶囊、`overflow:hidden`）、W2 **邀请好友一起抢**（浅青渐变胶囊 `linear-gradient(90deg, rgba(primary,0.25), rgba(primary,0.5))` + 主色字）、W3 **上门自提**（**纯主色文字，无胶囊背景**，与「快递配送」素材灰字同水平）、W3 **提交订单按钮**（主色实底圆角）均为菜鸟云**动态覆盖元素**（不在 PNG 素材内）——定位必须查对标 DOM/截图实测（`.choose_*` 类名/rect 或 PIL 采样色值），素材裁剪区为空白/原文字即证明是动态层。
- **❌ 已证伪（勿再犯）**：① 菜鸟云 **W1 商品列表没有「+」加购按钮**（商品卡只有名称/描述/价格，无任何加购按钮）；上一版误加 `.ds-add` 主色圆+白加号（窗内 308,218）属想当然添加，用户红框圈出即为多余元素，**已删除**。任何动态元素是否存在于对标系统，必须先在对标真实页面/截图中证实，禁止按"电商商品卡应有加购"的常识推断。② **已售300份不是浅青标签**、**上门自提不是浅青选中胶囊**（上上轮 PIL 采样误判为 `rgba(primary,0.25)` 底 + 主色字，用户 4 红框纠正：两者均**无背景纯文字/图标**形态）——采样式结论必须再经**用户红框验收**交叉确认，不能只信单次 PIL 采样。
- **层级规则补充**：覆盖层在背景图**之下**（z0），但**盖在背景图不透明区之上的动态元素**（头像组、已售300份、标签行、合成双按钮、邀请胶囊、上门自提、提交订单）必须独立 `z-index: 3`，不能放进 z0 覆盖层（会被背景图盖住而"看不见"——本轮 5 处红框缺内容的根因正是这些元素误放 z0）。
- **颜色实测色值（菜鸟云 stylediy 用户图 4 红框定案 + 用户三轮配色角色纠正 + 上门自提 tab 纠正）**：上门自提 = **素材自带半透明挖空 tab**（右半 y180-258 素材=窗内 60-86px，`z0` 层补 `rgba(primary,0.25)` 浅青圆角底由素材透出，**不另套 tab 形状**——用户纠正"底图是有选项卡透明度的，你是加多了一个选项卡套上去了吧"）+ **主色文字居中**（`.ds-ziti` 纯文字无背景，窗内 top60/高26/flex center），与素材「快递配送」左半 tab 同行并排；加入购物车 = **辅助颜色 `secondaryColor` 实色底 + 文字辅色 `subTextColor` 字**（非半透明浅青，用户纠正"辅助颜色"）；立即购买 = **主题颜色 `primaryColor` 纯色底 + 白字**（非渐变，用户纠正"主题颜色"）；邀请胶囊 = **主题色→渐变 `linear-gradient(90deg, primaryColor, gradientColor)` 实色渐变底 + 白字**（非浅青半透明渐变，用户纠正"主题颜色和渐变颜色组成的"）；提交订单 = 主色实底 + 白字圆角；已售300份 = **纯主色文字 + 主色火焰图标在文字上方（flex column）**；标签行 = 白底 + 主色浅青描边 + 主色文字。
- **配色验收防呆（用户要求）**：浏览器实测/对比图验收时**必须切自定义高对比配色**（如 主题 #FF4D00/渐变 #B3123E/辅助 #FFE066），不要用青蓝等色相相近的预设——半透明浅青与渐变在主色系相近时肉眼难辨，容易误判"改了没用/用错角色"，高对比下三处角色（辅助色/纯主题/渐变）一目了然。改色走 UI：点「自定义」→ 逐个 `.pc-hex-input` 填 hex（native setter + input 事件）→ 点 `.pc-btn-primary` 确定。
- **合成按钮防重叠**：W2 素材底部导航图标（返回首页/购物车/收藏）窗内 x ≈ 45-143，动态合成胶囊必须右移贴窗右缘（right 6px、字号 9px、每半 padding 0 4px，整体宽约 97px）避开收藏图标（x 129-143），否则文字会盖住素材图标（用户红框 4：加入购物车文字与前面图重叠）。
- **位置换算防呆**：OCR 输出的 box 是独立坐标系，**不能直接按千分比换算回原图像素**（曾据此误判按钮位置）；以浏览器 DOM getBoundingClientRect（真实像素）+ 并排缩放对比图（我方 vs 对标裁窗缩到同高）逐区核对为准；动态元素是否贴窗右缘以**实测素材图标边界 + 用户红框验收**为准，不写死固定值。

# 系统风格/装修组件 1:1 复刻方法论（2026-09-17 用户要求沉淀，避免低效与返工）

按以下顺序执行，缺一不可；每条都是历轮用户红框纠正血的教训，不是建议。

## 1. 复刻前：对标实测（不靠截图猜）
- **必须打开对标真实页面逐元素操作**（点击每个按钮/开关，记录联动项是否隐藏出现、真实渲染行为、独立规则、变体真实 DOM），不能只看截图 Description/OCR 就下结论；截图只做用户红框验收与补充证据。
- **读 DOM 而非猜结构**：拿对标元素 `getBoundingClientRect`（真实像素）+ `getComputedStyle`（背景色/渐变/边框/圆角/居中方式），记录每个动态元素在窗内坐标与颜色。
- **每个字段都要验证字段→渲染映射**：改了某参数，真实键入/拖动后在预览里逐值核对是否生效；取消参数后预览是否与对标一致（曾有"参数取消后样式与对标不同"）。
- **截图不能证明颜色/形态**：OCR 无色值、AI Description 会臆测（曾把"浅青圆角 tab"描述成"纯文字"）。放大裁图（PIL 裁框 + 8x 放大 Read）必须与真实 DOM computed style 交叉验证。
- **默认素材/默认值必须与对标一致**：组件默认图片、默认文案、默认开关状态逐项核对（曾漏默认背景图）。
- **配色角色以用户口径为准**：用户说"辅助颜色/主题颜色/主题+渐变组成"就按字面映射到 `secondaryColor`/`primaryColor`/`linear-gradient(primary,gradient)`，不自行翻译成半透明浅青等近似方案。

## 2. 实施后：浏览器实测（先于截图）
- 构建后**先清 Service Worker**（unregister + caches.delete），再强刷，确认加载的是新 hash 产物。
- 用 JS 逐元素断言：`getBoundingClientRect()`（坐标/宽高/是否窗内、同行对齐、centerOk）+ `getComputedStyle()`（background/backgroundImage 是否为期望渐变、color、borderRadius、justifyContent 居中）——**颜色/位置以 DOM 实测为准，OCR 千分比只是线索**。
- 元素是否盖在素材不透明区：必须 `z-index:3`（z0 会被背景 PNG 盖住）。
- 验收配色**必须切自定义高对比配色**（主题 #FF4D00/渐变 #B3123E/辅助 #FFE066），青蓝等相近色相会肉眼难辨误判。

## 3. 验收交付：逐区裁图并排对比
- 用户红框截图 = 权威验收依据：每个红框逐区裁图放大比对（Python PIL + Read），禁止只凭整图 Description。
- 对比图格式：我方 vs 对标（菜鸟云/ew/人人）同窗区域裁出、缩到同高并排，标注「我方/对标」，交付 docs/design-preview/。
- 交付后把每次用户纠正与定案结论**同步更正 AGENTS.md 对应旧结论**（旧结论不删会误导后续）。

## 4. 改码定位与防呆
- 配色字段：`web-admin/src/utils/designStyle.js` STYLE_SCHEMES（primary/gradient/secondary/text/subText），自定义配色绑定同字段。
- 浏览器改自定义色走 UI：点「自定义」→ 逐个 `.pc-hex-input` 填 hex（`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set` + `dispatchEvent(new Event('input',{bubbles:true}))`）→ 点 `.pc-btn-primary` 确定；浮层 transition 渲染有延迟，改前先查 `.pc-hex-input` 数量。
- 三窗素材为透明挖空 PNG（主题色处 alpha=0，运行时由窗底填充色透出）——判断"色块盖在图片上"问题时先查层级与背景填充方式。
- 交付链：`npm run build:admin` → `npm run verify` → `npm run test:frontend` → 浏览器实测 → 对比图 → `git commit`（AGENTS.md 同步）。

## 5. 页面整体排版对齐（2026-09-17 新增）
- **整体排版必须与菜鸟云一致，不能只对齐元素样式**：系统风格页 = **左侧配置区 + 右侧手机预览区**（`.ds-layout` flex row：`.ds-config` 固定 460px、`.ds-preview-panel` flex:1、三窗横排 `overflow-x:auto`；`max-width:1100px` 时纵向回退属预期）。**禁止**把预览区放在配置下方竖排。
- **素材自带 UI 三层 alpha 分析法（PIL 权威定位，替代截图猜测）**：三张预览 PNG 是透明挖空图。定位"素材自带 UI"（如上门自提选中 tab）用 `px[x,y][3]` 逐行统计 alpha 分布：`alpha0`=挖空（透出底层色）、`alpha153`=半透明底（素材自带选中态，叠底层色混合）、`alpha255`=不透明（盖住底层）。素材自带形状（如 tab 圆角）**禁止再叠同形状 div 套娃**——只需在 z0 底层补色由素材透出 + 文字独立 z3 居中。
- **先看整体布局再逐元素**：复刻某页面前先确认页面整体布局（左右分栏/上下分栏/预览区位置/宽窄屏断点），再逐元素比对；改布局后在真实宽窗口（≥1100px）验证左右分栏。

# 商品管理复刻经验（2026-09-17 新增，云菜鸟「东莞同城通」一级菜单「商品」）

## 1. Express 路由顺序：通配 /:id 必须排在具体路径之后
- 症状：`GET /goods/params`、`/goods/licenses`、`/goods/settings` 返回 404「商品不存在」（被 `GET /:id` 抢注，id='params'）。
- 规范：`/:id` 系（GET/PUT/DELETE /:id、POST /:id/copy）必须注册在所有具体路径（/categories、/params、/settings、/licenses、/batch）**之后**；同类问题扩展检查所有 router 文件。

## 2. Express ETag 304 + axios reject 陷阱（数据静默丢失，重要）
- 症状：编辑页反复导航后，licenses 授权 Tab/分类级联消失，接口日志显示 304。
- 根因：Express 默认给 API 响应加 ETag，浏览器对同 URL 再次请求发条件请求 → 服务器返回 304；axios 默认 `validateStatus` 只认 2xx，**304 会 reject**，Promise.all 全挂，catch 吞错 → 页面数据静默为空。
- 修复：`web-admin/src/api/index.js` customerApi 请求拦截器统一加 `config.headers['Cache-Control'] = 'no-store'`（根治所有客户后台 API 的同类隐患）。

## 3. 浏览器 memory cache 旧 chunk（比 SW 更隐蔽）
- 症状：服务器产物已更新（新 hash 存在、旧 hash 404），但**同一 tab 反复 navigate 仍加载旧 hash chunk**（performance 列表可见 index-DIl-7oGu.js 等旧名）。
- 根因：Chrome memory cache 对已加载过的 JS 直接复用，不查服务器；SW 清了也没用。
- 规范：验证前端改动必须**开新 tab**（或无痕）加载，不能在同一 tab 内反复刷新判断。

## 4. 授权驱动显示（功能类型按应用授权动态出现）
- 商品类型 Tab（普通/卡密/虚拟）由 `GET /goods/licenses` 返回的应用 code 驱动：`card-carmi`（电子卡密）、`card-gift`（送礼物）；演示方案 is_demo 自动全勾，普通方案经 solution_apps 授权，未授权不渲染 Tab 并提示「应用中心可开通」。
- 新建应用时同步：INSERT apps + app_menus + seedGoods 演示方案纳入（参照 goods 5 表 seedGoods）。

## 5. 商品管理布局（用户确认的「设计中心+应用中心」混合样式）
- 三栏：顶部横向分类（GoodsHome topTabs，设计中心 CardTabs 风格）+ 左侧竖向二级菜单（cat-sidebar 复用应用中心圆角块+角标，12 子项）+ 右侧内容区（默认页=商品列表首页）。**明确否决**应用中心卡片式 grid。
- 用户叮嘱：复刻时「功能类型的显示/隐藏条件」也要细读复刻（如卡密/虚拟靠应用授权，不止这两种，普遍化处理）；边做边把经验写入 AGENTS.md。

# 新功能与现有系统对接规范（2026-09-17 新增，用户强调）

新增任何功能（含商品管理及其二期），**实施前必须完成与现有系统的对接梳理**，不得做成孤岛。以商品管理为例的对接清单：

## 1. 分销体系
- 商品订单支付成功 → 触发 computeOrderSplit 分账（佣金/合伙人/股东），幂等 tenant_id+order_id；退款走 rollbackOrderSplit。
- 商品「分销设置」页签配置的分佣比例与 dist 体系打通（普通商品/卡密/虚拟各自可配）。
- 入口：`server/src/routes/payment.js` handlePaymentSuccess → `services/distribution.js`。

## 2. 设计中心/页面装修
- 装修组件需新增商品类组件（商品列表/商品详情/商品分类导航/商品卡片），在 `web-admin/src/views/customer/apps/design/componentRegistry.js` 登记；装修页（web/web-app）渲染真实商品数据，属性面板遵循既有组件规范（1:1 对标、属性-预览-交互三面对比）。

## 3. 会员体系
- 商品「会员设置」页签（会员价/会员专享/会员折扣）对接会员等级与用户标签/用户组；C 端按会员身份展示对应价格。

## 4. 支付与订单
- 商品下单 → payment 创建支付订单 → 支付回调 → 扣库存 + 分销分账 + 消费流水；退款反向。二期订单管理承接。

## 5. 消息通知
- 下单/发货/退款/库存预警写入 card_message（type=system，含金额/单号，link 指向商品/订单页），C 端消息中心展示。

## 6. 小程序端（web-app）
- 商品列表/详情/购物车/下单/支付链路；装修商品组件同源渲染。

## 7. 工作台/应用中心
- 应用指标映射（商品数/出售中/库存预警等）接入工作台「我的应用」卡片；授权驱动（卡密/虚拟等类型应用）接入应用中心与解决方案权限（solution_apps/menus）。

## 8. 实施顺序
- 对接梳理文档先于编码；每项对接在交付前实测闭环（下单→分账→消息→C 端展示）；二期项（订单/评论/采集/导入导出/运费/同城配送）逐项补对接并更新本清单。

# 功能修改/移除联动规范（2026-09-17 新增，用户强调）

**修改功能、移除功能或参数时，必须同步调整所有相关联的逻辑**，禁止只改表面（前端隐藏/删除一个字段而服务端仍读写、或服务端移除而前端仍引用）。改动前先做联动盘点，改动后逐项验证：

## 1. 联动盘点清单（改动前）
- **数据层**：字段被哪些表/服务/查询/索引引用；移除字段是否涉及迁移（ALTER/DROP）、旧数据兼容。
- **服务层**：读写的服务函数、触发链（如支付回调/分账/扣库存/消息通知）是否依赖被改参数。
- **路由/接口**：请求体与响应体是否含该参数；C 端与后台是否共用同一字段名。
- **前端**：列表/表单/详情/属性面板/预览渲染各处的引用；camelCase/snake_case 命名是否一致（本系统服务返回自定义追加字段用 camelCase，DB 行字段为 snake_case，混用必查）。
- **测试**：单测/端到端断言是否引用被改参数；移除功能对应测试是否同步删除或改写。
- **文档/规范**：AGENTS.md 相关段落是否已过时。

## 2. 联动执行要求（改动中/后）
- 字段或参数一经移除/改名，**所有读写它的代码路径同步清理**，不留死代码与残留引用（参考 ETag 304 / memory cache 旧 chunk 教训：改完必须新 tab 实测）。
- 功能语义变化时，调用方行为同步调整（如「订单状态新增 refunding」→ 前端状态映射/操作按钮条件/服务状态机一起改）。
- 前端移除某入口/参数时，后端对应路由/字段同步下线或标注废弃，禁止前后端状态不一致。
- 涉及对外契约（接口返回结构）变化时，同步更新调用方（C 端小程序、H5、后台）与测试断言。

## 3. 交付前验证
- `grep` 全仓搜索被改参数名/功能关键词，确认无残留引用（源码 + 测试 + 模板）。
- 相关单测全绿；浏览器实测被改动功能及其相邻功能（含被移除项不再出现）。
- 每项修改/移除在交付说明中列出「联动了哪些逻辑」。

# 商品类型差异化表单复刻规范（2026-09-17 新增）

## 根因（踩坑记录）
复刻菜鸟云商品添加页（add.html）时，只实测了**默认态（普通商品）**，未逐类型切换验证 `changeTopType` 的差异化区域（`proType3_not/proType3_have/proType4_not`），把添加页当单一表单复刻 → 规格/库存/物流/手机号填写/卡密库等字段未按类型区分配置，且漏掉两个类型专属字段。

## 菜鸟云三类型表单差异（实测定稿）
| 字段/区域 | 普通 | 卡密 | 虚拟 |
|---|---|---|---|
| 取货方式 / 运费方式 / 售卖(线上销售·价格面议) | ✅ | ❌ | ❌ |
| 规格(单/多) / 库存 / 起购数量 / 重量 / 货号 | ✅ | ❌ | ✅ |
| 手机号填写（不展示/必填/选填） | ❌ | ✅ | ✅ |
| 卡密库（选择卡密库 + 去设置） | ❌ | ✅ | ❌ |

- 类型显示条件：普通=默认；卡密=授权「电子卡密」应用；虚拟=默认开通（不绑定应用授权）。
- 商品功能本身=总后台（平台）授权，走方案授权体系（goods 应用）。
- 卡密商品 use_more 强制=2；虚拟商品隐藏物流与售卖选择（proType4_not）。

## 强制流程（复刻带"类型/变体/样式切换"的表单或组件）
1. **逐变体实测对标目标**：切换每个类型/变体，抓取真实 DOM 差异（可见/隐藏字段、专属字段、联动逻辑、默认值），禁止只测默认态或凭截图猜。
2. **专属字段全链路落地**：新增类型专属字段必须先建表迁移（幂等）→ 后端读写 → 前端表单/保存/回显 → 测试断言，禁止只做 UI。
3. **交付前逐类型实测**：切三类型验证表单渲染、保存、回显；新增字段在列表/详情/订单链路无残留。
4. 联动：类型字段变化同步 type 白名单、订单明细快照、C 端渲染（二期）。

# 商品管理实页化 + 商品采集独立应用 + 首页跳转选择器规范（2026-09-17 新增）

## 商品管理 12 子项全量实页（对标菜鸟云 duoproducts）
- 商品管理 GoodsHome 五分类 12 子项全部真实页面，禁止 disabled 占位：数据洞察 / 商品列表 / 商品分类 / 商品参数 / 商品订单 / 售后订单 / 退货地址(GoodsReturnAddr) / 评论管理(GoodsComment) / 品牌标签(GoodsBrandTag) / 标题标签(GoodsTitleTag) / 服务保障(GoodsServiceTag) / 供应厂商(GoodsSupplier) / 商城设置 / 商城风格(GoodsStyle)。
- 通用标签组件 GoodsTagList.vue（hasContent/hasIcon 开关复用品牌/标题/服务保障三页）；退货地址/供应商/评论/风格各自独立组件。
- 数据表：goods_return_addr / goods_supplier / goods_brand_tag / goods_title_tag / goods_service_tag / goods_comment / goods_cate_style（db.js seedGoods 尾部幂等创建）。
- 路由顺序：新 REST 路由（return-addresses/suppliers/brand-tags/title-tags/service-tags/comments/category-style）必须定义在 `router.get('/:id')` 之前，否则被参数路由吞掉。
- 评论管理级别语义：level 1=好评/2=中评/3=差评，status show=显示/hide=隐藏，支持批量删除。

## 独立应用与授权独立性
- 商品采集独立应用 goods-collect（营销引流），不从属商品管理；其 API（/goods/collects）**禁止挂 requireGoodsApp**，只 requireTenant——独立应用只依赖自身授权（演示方案自动全勾）。
- 从商品管理移出的功能必须同步：GoodsHome subDefs 移除菜单 + 应用中心注册新应用 + 路由注册 + C 端无引用残留。
- 新增应用涉及差异化表单/类型切换时必须逐变体实测（见「商品类型差异化表单复刻规范」）。

## 首页跳转页面选择器（对标菜鸟云）
- 设计中心「首页跳转」= 页面选择器弹窗，三组：智能名片（11 项）/ 行业应用（360全景首页/浏览）/ 装修页面（pageList 动态，值 `/pages/cardMain/home?pageType=xxx`）。
- home_page 存储**完整路径字符串**（如 `/pages/index/index`、`/pages/cardMain/home?pageType=product`），无白名单；存量旧 key（card/market/radar/member/distribution）读时兼容转路径，写时转路径。
- 旧默认值 `card` = 不跳转（展示 DIY 首页）；`saveHomeConfig` 空值兜底存 'card'。
- C 端设计.js 三处联动：HOME_PAGE_MAP 扩展（行业应用+更多名片页）→ resolveHomePath 支持 `/` 开头路径直通 → normalizeDesignConfig homePage 保留路径（禁止把路径降级为 card）。
- fetchDesignConfig/readDesignConfig 支持 pageType 独立缓存 key（`STORAGE_KEY:pageType`）；cardApi.designConfig(preview, pageType) 透传 query。
- /design/config 支持 ?pageType=：优先已发布、回退草稿；未指定按 is_home。home.vue onLoad 读 options.pageType 渲染指定 DIY 页面。
- 跳转目标为 home 自身时靠 JUMP_DONE_KEY 防死循环（reLaunch 后新实例 onShow 检查已设即停）。

## 浏览器实测前必须清 Service Worker（再次踩坑强化）
- 现象：build:admin 后浏览器打开仍显示旧页面（菜单缺失/功能不变），URL 已变但内容没变——根因是 SW 缓存旧哈希 customer-*.js。
- 实测前置：`bu.js` 清除 `navigator.serviceWorker.getRegistrations()` + `caches.keys()` 再 reload；否则一切「页面没反应」的排查都是浪费时间。
- 交付前检查清单追加：浏览器实测前先清 SW 再验证（不只强刷）。

# 送礼物分享样式复刻规范（2026-09-17 新增）

## 对标（菜鸟云 giftForYou setView）实测结论
- 分享样式 = 3 张完整分享模板图（750×1334，含动态文字层：昵称的礼物/赠言/立即打开按钮），后台只做「选图」：图卡缩略预览 + 样式标签 + 选中态，不提供自定义合成参数。
- 样式↔素材映射（菜鸟云 DOM 顺序与编号相反，以视觉为准）：样式一=gift3.jpg（深蓝金丝带）、样式二=gift2.jpg（橙红礼盒+星星）、样式三=gift1.jpg（黑金蝴蝶结）。
- 图卡布局：手机比例缩略图（约 200×398 等比），下方样式标签，原生 radio 选中；我们实现用主色描边+右上✓角标增强选中辨识。

## 落地规范
- 素材入 static 目录：`server/public/gift-share/`（gift1/2/3.jpg），并**必须**在 server/src/app.js 显式挂载 `/gift-share` 静态路由（server/public 不是根静态目录，不挂载会被 SPA fallback 吞掉返回 index.html），maxAge '1y'。
- 分享样式选择 UI 一律用图卡（img 缩略 + 标签 + 选中态），禁止纯文字卡；新增其它带「样式/模板图」选择的组件沿用此形态。
- 保存字段 shareStyle 1/2/3 后端已支持（gift_config.share_style），前端仅需映射图片 URL，无需改表。
- 复刻对标图片类功能流程：浏览器抓 img src 与 naturalWidth/Height → curl 下载本地 Read 验证内容与映射 → 入 static → 前端图卡化 → 实测选中与落库。

# 商城风格 1:1 复刻规范（2026-09-17 新增）

## 对标页
云菜鸟 `https://cloud.xincainiao.cc/index/duoproducts/cateset?appletid=10`（商品模块 → 商城设置 → 商城风格）。

## 页面结构（1:1）
- 顶部 Tab：**分类风格 / 详情风格**（先选层级，再显示该层级风格）。
- **分类风格**：2 个真实手机屏截图预览（style1.jpg=左侧一级分类+右侧二级分类；style2.jpg=左侧一级分类+右侧二级分类+商品卡），带说明文字 + 单选。
- **详情风格**：左侧 250px 手机预览（背景 main_bg_{详情风格}_{卡片样式}.jpg 750×2000 + 价格条 + 分享图叠加）+ 右侧参数区：
  - 详情风格：风格一/风格二/风格三（radio，无缩略图，联动切换背景）
  - 卡片样式：开启/关闭（联动背景 main_bg_{s}_{c} 与价格条圆角）
  - 分享样式：样式一/样式二（联动 share_{分享样式}_{卡片样式}.png，top 位置矩阵：share1_1=453 share1_2=446 share2_1=483 share2_2=474 share3_1=443 share3_2=437）
  - 价格样式：主题色/主题色+背景图（**详情风格三不显示价格区**；主题色=渐变底白字 base_text=#FFFFFF；主题色+背景图=显示 price_bg{详情风格}_{背景序号}.png 覆盖 + 裁剪/填充模式）
  - 价格样式=背景图 时嵌套显示「背景图片 样式一~十三+自定义上传」+「背景图样式 裁剪/填充」
  - 详情风格=风格二 时额外显示「主题样式 样式一~十三+自定义上传」（price_theme_{序号}.png）

## 素材清单（已入库 server/public/goods-style/，静态路由 /goods-style）
- style1.jpg / style2.jpg / style3.jpg（分类/详情风格手机截图缩略图，213×376）
- main_bg/main_bg_{1|2|3}_{1|2}.jpg（详情页背景，750×2000，6 张）
- share/share_{1|2}_{1|2}.png（分享图，4 张）
- price_bg/price_bg{1|2}_{1..13}.png（价格背景图，26 张）
- price_theme/price_theme_{1..13}.png（主题图，13 张）
- price_show.png（详情风格2 底部价格条图）

## 后端字段（goods_cate_style 表扩展）
cate_style(1/2) / detail_style(1/2/3) / goods_iscard(1开2关) / share_style(1/2) / pbg_style(1主题色2背景图) / pbg_img(0自定义1-13) / pbg_mode(1裁剪2填充) / pbg_theme(0自定义1-13) / pbg_img_custom / pbg_theme_custom。旧库迁移用 colExists+ALTER（TEXT 字段单独类型处理，不能统一 INTEGER）。

## 经验教训（用户批评点）
1. **图片展示类禁止自绘 CSS 示意**：凡是标的有真实预览图/素材的，必须按「图片类复刻流程」直接复制对标原图（浏览器抓 img src + naturalWidth/Height → curl 下载 → Read 验证 → 入 server/public 子目录 + 挂 express.static 路由 → 前端图卡/背景引用真图）。曾用自绘 mini-cate/mini-detail-img 方块示意被用户否决。
2. **复刻前必须逐个点开每个风格/子项细读差异与联动**：不能只看结构数量就动手。详情风格有 3 个（我方曾只做 2 个）；且必须点开每个 radio/开关验证 ①预览背景切换 ②嵌套参数区显隐（价格样式=2 显示背景图片区、详情风格=2 显示主题样式区、详情风格=3 隐藏价格区）③图片素材随参数矩阵变化。
3. **详情风格 radio 对标本身无缩略图**（风格一无图，风格二/三空 img），1:1 复刻时不做缩略图，靠左侧预览联动体现差异。
4. **Vite 静态资源坑**：img src 直接写 `/goods-style/xxx.png` 会被 Vite 当模块解析报 rollup resolve 失败；必须以 `:src` 绑定变量（const 字符串或 computed）绕过静态分析。
5. **自定义上传**：pbgImg/pbgTheme=0 时显示上传，调 `POST /api/customer/upload`（FormData file），返回 res.url 存 pbgImgCustom/pbgThemeCustom。
6. **分类风格选中态 1:1**（2026-09-17 修）：菜鸟云分类风格**无右上角打勾、无选中角标**，选择态=下方 radio 圆点选中；我方曾私自加 `.style-check` 右上角打勾 + radio 用 `:model-value="form.cateStyle===c.value"` 传布尔（el-radio 无 value 时选中判定恒 false → radio 永不选中，仅打勾可见）。修复：删打勾，radio 用 `el-radio-group v-model` + `el-radio :value`；图卡可保留主色边框高亮（增强），但**禁止添加对标没有的选中元素**。
7. **radio/checkbox 绑定规范**：组件选中态必须用 `v-model` + `:value`（或 model-value 传当前选中值）驱动；**禁止 `:model-value` 传布尔表达式**模拟选中（内部 value 与布尔永不相等 → 选中态失效）。此类「控件不响应」先查绑定，再怀疑渲染。

## 价格条渲染契约（实测权威 DOM，2026-09-17 补）
详情风格1/2 价格条（.pricebg_box，box1 高 36 / box2 高 97，卡片开=padding 7px 7px 0 + box1 圆角 5px5px0 0 / box2 圆角 13px）为**四层叠加**，缺一层即视觉缺失（曾漏 price_show.png 导致价格卡不显示）：
1. `.price_bg_show` 渐变底：`linear-gradient(90deg,#70b0ff,#4491F1)` + color #fff（主题色模式）；
2. `.bg_imgOn` 背景图（仅 pbg_style=2 时 display:block）：src=`price_bg{详情风格}_{pbg_img}.png`，object-fit: cover（裁剪）/ fill（填充），绝对定位盖满；
3. `.price_theme` 主题图（透明底白字促销文案，pbg_theme 1-13 + 自定义）：`price_theme_{N}.png`，**「年货节大促」= price_theme_1.png**（400×72 透明底白字，蓝渐变底上即蓝底白字 banner）；显示 CSS top:8px left:8px height:12px width:auto；
4. `.price_in` 价格卡：`price_show.png`（750×202 白卡：¥249.00/件 + 划线¥499.00/件 + 🔥已售21件 + 爆款大牌好物 + 商品名两行），显示 CSS bottom:3px height:67px width:100%。
素材真实 URL 前缀：`/image/static/goods_detail/`（price_theme/price_bg）与 `/image/goods_detail/`（price_show）。验收时四层逐一断言 img `complete && naturalWidth>0`，并切 pbg_style/卡片/主题样式验证联动。

## 素材完整性铁律（2026-09-17 补，用户红框「少了一张图片」根因）
- **下载素材入库三步缺一不可**：①curl 下载到 docs/ 备份 → ②**全量 `cp` 到 server/public/对应目录** → ③`find server/public` 与 `find docs` **逐文件 diff 完整性**（`[ -f server/public/$f ] || echo MISSING`），缺一即前端 img 404 显示空白。
- 本次漏复制 `price_show.png`（价格卡）与 `share_1_2.png`（分享图），页面无任何报错、仅预览缺图——**文件级完整性检查是唯一防线**；不要把「server 目录 ls 过」当验证。
- 下载失败的文件（如 HTML 404 残件 146B）要识别剔除（file 命令看类型），不得混入素材目录。
- **透明底白字图（如 price_theme_*.png）不能直接 Read 验证**：白字在白底/透明底上肉眼不可见，Read 会误判「纯白无内容」（曾据此误判素材缺失，绕弯路）。必须用 PIL 统计**白色不透明像素**（`a>200 and r>240 and g>240 and b>240` 计数>0 即有白字内容）或**深色底合成后 Read**（`bg.paste(im, (0,0), im)`，如深蓝底 90,160,248）。此类图设计为叠在彩色/渐变底上显示白字（「年货节大促」=蓝渐变底上的白字 banner）。
- 交付前浏览器实测：清 SW + 强刷 → 切详情风格2 → 断言价格条四层 img 全部 naturalWidth>0。
- **「开发中」占位页排查**：代码已提交但页面显示占位 = 运行的是旧构建（build:admin 后 assets 哈希更新）或 SW 缓存旧 chunk；先清 SW + 重新 build:admin 再判断，不要误判为路由缺失。

## 问题10：复刻时漏掉「主字段切换 → 从属字段显示/单位切换」的联动逻辑（2026-09-18）

**现象**：内容管理「编辑文章 → 分销设置」只有「分销规则」radio（关闭/默认设置/单独配置），选「单独配置」后**没有出现对应的佣金配置项**（佣金类型/佣金设置）；对标是 fx_uni=1 时 `.fx_set` 显示，0/2 时隐藏。

**根因**：① 复刻时只复刻了「主字段」（radio 本身），没有实测对标的**联动源码**（`$('input[type=radio][name=fx_uni]').change(...)` 显示/隐藏 `.fx_set`）并复刻从属字段；② 表结构只建了 dist_rule 一列，没有为从属字段建列（commission_type / commission_levels），数据模型本身就不完整。

**预防规范（通用，不限于内容管理）**：
1. **复刻联动类配置（radio/select/switch 控制其它字段显示、隐藏、单位切换、级联）时，必须实测对标的联动 JS 源码**：在页面脚本里搜 `$('input[name=...]').change()` / `.click()` 及 `show()/hide()/text()` 逻辑，记录「哪个值 → 显示/隐藏哪组字段、单位怎么变」，再 1:1 实现（我方用 v-if/v-show/计算单位）。禁止只复刻主字段、把从属字段平铺或漏掉。
2. **联动字段必须落库**：从属字段要建表列 + 前端 form 字段 + 后端 INSERT/UPDATE/duplicate 透传 + loadDetail 回显，四端齐全；缺一不可（本次即缺表列导致无法保存）。
3. **回显兜底**：JSON 数组字段回显时做空值兜底（如佣金等级为空 → 补「默认等级」默认行），老数据兼容。
4. **排查顺序**：对每个「带 tab/分组 + radio/select 配置」的编辑页，逐个 tab 点开，逐字段检查对标是否有联动；检查对标脚本 `grep -n "change\|show()\|hide()"` 找联动点。
5. **交付前自查**：浏览器实测每个联动分支——主字段每个取值都点一遍，确认从属字段的显示/隐藏/单位符合对标；保存后 reload 验证回显。

# 行业应用公开入口分发规范（2026-09-18 新增，独立首页方案）

## 架构：登记表驱动（server/src/app.js）

- **appEntries 登记表**：`{ prefix, code, name, dist, index }`，每个行业应用一个 URL 前缀。当前已登记：`/card`（智能名片，server/public/card）、`/pano`（360全景，项目 web/dist，vite `base:'/pano/'`，SW 注册 `/pano/sw.js`）。**未来新增行业应用只需登记 + 产物就位**，无需改中间件。
- **统一校验中间件**（注册于**所有 express.static 之前**，顺序关键）：GET + 前缀命中 + 非 assets/static + 无预览签名(exp+sig) + **顶层 query 带 tid** → 租户不可判定（missing/expired）或 `!hasSolution(tid, entry.code)` → 403「未开通」提示页（含前往应用中心链接 `/customer#/apps`）。
- **放行契约**：无 tid（兼容 hash 内 tid 旧链接，SPA 自行兜底）/ 预览签名 / 静态资源一律放行。
- **静态资源**：`{prefix}/assets`、`{prefix}/static` 强缓存 1y；其余（sw.js 等）static + HTML no-cache。
- **旧地址兼容 301**：`/`、`/index.html` → `/pano`（**原 query 透传**，如 `?plan=1&scene=3`）；`/sw.js` → `/pano/sw.js`。
- **租户解析演进**：一期顶层 `?tid=`；二期按子域名 Host 解析（演进式，接口契约不变）。

## 测试

- `server/test/app-entry.test.js` 11 用例（根 301 透传 query / sw.js 301 / SPA fallback / assets 放行 / tid 已开通 200 / 未开通 403 文案 / 不存在 403 / /card 无 tid 200 / /card 未开通 403 / 预览签名放行 / 非入口不拦截）。
- 测试构造：临时 dist（webDistDir 指向 temp，含 index.html+assets）、临时 DB（projects 行开通 demo 方案=全应用 vs 未开通）。
- **node --test 下 before 挂起的两个坑**：① 固定端口可能被占 → 用 `app.listen(0, '127.0.0.1', resolve)` + `server.on('error', reject)` 随机端口；② fetch 默认**跟随 301**，断言重定向必须 `{ redirect: 'manual' }` 否则看到的是跟随后的 200、location 为 null（曾误判"重定向没生效"）。

## 问题11：colExists 对不存在表执行 PRAGMA 抛错，导致迁移崩溃 + 后端测试 207 个预存失败（2026-09-18）

**现象**：任意新库 `createDb()` 崩溃 `no such table: content_comment`，后端全量测试 207 个失败（全部 hookFailed，表面看"环境挂了"）。

**根因**：`migrate(db)` 在 `seedContent(db)`（content_* 建表，含 content_comment）**之前**执行；`colExists` 直接 `PRAGMA table_info(表)`，对不存在的表 node:sqlite 抛错，且错误发生在每个测试的 before → 大面积 cancelled。

**预防规范（通用）**：
1. **`colExists` 表不存在时按「列已存在」处理（返回 true）**：迁移语义是"若列缺失则补列"，表未建时该表的建表语句（SCHEMA 或后置 seed）已含目标列，无需 ALTER；返回 false 反而会触发 `ALTER TABLE` 对不存在表执行再次崩溃。禁止直接对不存在表 PRAGMA/ALTER。
2. **建表顺序**：`db.exec(SCHEMA)` → migrate → 后置 seed 建表（seedContent 等）。migrate 引用的表若由后置 seed 建，必须走幂等防御（colExists 表不存在跳过），不得假设"表一定已建"。
3. **全量测试大面积 hookFailed/cancelled 时**：先看单个 before 的真实错误（`grep -A8 hookFailed`），同类失败（同一错误码/同一条 SQL）多为共享根因，逐个文件修根因而不是当环境问题跳过。

## 小程序直播复刻核对清单与经验（2026-09-18，排序字段补齐）

**现状**：小程序直播（apps code=live，客群维护分类）已 1:1 复刻，三 Tab 结构完整：直播列表（LiveRooms）/ 商品同步（LiveGoods）/ 商品审核（LiveAudit），后端 `server/src/routes/live.js` 10 接口，装修组件 `live-list`（直播列表）+ `channel-live`（视频号直播），C 端 DesignPage 渲染直播卡片网格点击 `openChannel('live')`。

**完整度核对方法（对标菜鸟云 liveshow 实测）**：
1. 列表页：创建直播间/同步直播列表按钮、8 状态筛选（全部/直播中/未开始/已结束/禁播/暂停中/异常/已过期）、搜索、列（房间号/直播名称/主播名称/开播时间/直播状态/直播类型/显示位置/直播数据/操作）、两条提示文案、复制直播间链接/查看商品
2. 创建弹窗 16 字段：直播名称(3字起)/背景图(1080×1920≤2M)/开始时间(当前+10min~6月)/结束时间(30min~24h)/主播昵称(2-15字)/主播微信(实名)/分享图(800×640≤1M)/封面图(800×800≤100K)/直播类型(手机|推流)/点赞/货架/评论/回放/分享/客服
3. 编辑弹窗（**易漏**）：排序(数字越大越靠前)/直播名称/直播间ID/主播名称/缩略图(≤200K)/直播时间(仅展示)/来源(禁用)/列表显示/设为推荐/直播类型/推流地址/推流码/功能开关
4. 商品同步页：同步审核状态/同步商品列表按钮，提示"审核通过仅允许更新价格类型与价格，审核中的商品不允许更新"，更新弹窗仅价格类型+价格
5. 商品审核页：本地商品提交微信审核，审核失败显示重新提交

**本轮缺漏与修复**：编辑弹窗缺「排序」字段（菜鸟云 edit.html 首位）→ `live_rooms` 加 `sort` 列（幂等迁移默认0）、GET /rooms 改 `ORDER BY sort DESC, id DESC`、PUT /rooms/:id 收 sort、编辑弹窗首位加 el-input-number「排序 数字越大越靠前」。**注意：rooms/sync 的 upsert 不含 sort，同步微信列表不会覆盖用户本地排序。**

**预防（通用）**：1:1 复刻核对时，**创建表单与编辑表单都要逐字段对照**（此前多次只核创建/列表，漏编辑弹窗字段）；编辑弹窗往往含排序/显示控制等本地字段，需单独点开编辑实测；数据不足时用 SQL 插入测试行验证编辑弹窗字段与保存回显，测完清理。

## 商城 C 端公开 API 规范（2026-09-18，/api/mall）

- **登录中间件必须自行解析 token**：mall.js 的 `auth` 不得依赖 `authOptional` 先跑设置 `req.user`（Express 路由级中间件按挂载顺序执行，`router.post('/cart', auth, ...)` 里 authOptional 不会自动执行）——`auth` 必须自己 `resolveUser(req)` + `attachUser`，否则所有登录接口**永远 401**（本次已踩坑修复）。规律：**每个需要登录的路由中间件，要么显式挂 authOptional+auth 两个，要么 auth 内部自足解析**。
- **测试 headers 必须在 before 之后构造**：node:test 中 `describe` 回调同步执行，模块顶层 `const authHeaders = { Authorization: \`Bearer ${token}\` }` 会在 `before` 给 token 赋值**之前**求值 → 请求带 `Bearer undefined` → 全 401 且难排查。正确写法：`const auth = () => ({ Authorization: \`Bearer ${token}\` })` 函数式生成。
- **service 层保持向后兼容，新约束放路由层**：goodsOrder.createOrder 的 pickup 在 `storeId>0` 时校验门店并生成核销码，`storeId=0` 保持旧契约（管理端历史调用不传门店）；C 端严格校验（pickup 必须带 storeId）放在 mall.js 路由层。改既有 service 时先跑其既有测试，防止契约冲突回归。
- 测试串行基线：`node --test --test-concurrency=1 server/test/*.test.js` 当前 **362/362**（mall.test.js 新增 7 用例）。

## ew 8 个商品组件复刻（2026-09-19 启动）

对标 ew（vipuser3.eweishop.com）商品类组件 8 个：商品组/全部商品/选项卡/商品排行/轮播商品/猜你喜欢/商品展播/精品推荐。已逐个点开实测参数。

**已落地**：goods-list 已有骨架（全部/分类/手动 + 双列/单列/横向）。
**新增 type**：goods-group / goods-all / goods-tabs / goods-rank / goods-swiper / goods-like / goods-show / goods-featured。

### 一期未做 / 待接入（备忘，后续补齐）
- **"选择分组"数据源**：ew 的分组=商户/店铺分组，我方无商户体系，参数位保留但禁用，待商户体系接入。
- **猜你喜欢真个性化**：一期按"最新上架"固定规则，待推荐算法接入。
- **精品推荐"适用界面"**（购物车/会员中心/支付成功/商品详情/优惠券/礼物清单）：一期只做首页展示，多界面投放后续铺。
- **选项卡"滑动置顶"**、**商品排行"关键字/价格区间过滤"**、**购物车按钮"商品加购"**（vs 进详情页）：一期先做基础版，高级交互后补。
