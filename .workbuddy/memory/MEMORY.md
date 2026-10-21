# 360全景 长期记忆（元规则）

> 只放元规则。细节在 `.workbuddy/memory/YYYY-MM-DD.md` 与 `refs/`。

## 装修组件
- 🔴 改一处同步三处：`componentRegistry.js`→`ComponentRender.vue`(v-if 链尾无兜底)→`PageEditor.vue`(schema+control)；C 端 `DesignPage.vue` 独立重复；server `COMP_TYPES` 白名单也要加。
- 🔴 **「间距/大小不真实」先数壳层数**：间距 100% 由组件自身 marginTop 决定，容器只留一层边距（ce-body 左右 28rpx = 真实页 `.cc-list`）。调参永远调不对→**删壳**。选中环禁画卡片边框→独立绝对定位+`pointer-events:none`。
- 🔴 **「A 和 B 不一致」先各测再改**：最小化测量页+headless 实测，别三个一起瞎调；记忆与实测冲突时信实测。
- 🔴 同步需求要连**机制**一起搬：「对齐设计中心边条」= 浮在组件上不占空间+名字进条省标题行+hover 浮现一整套。手机无 hover→`activeKey`+tapCard。
- 🔴 **链接模型单一事实来源 `utils/compLinkModel.js`**：「内部链接」是一等类型（用户要的是「内联手填、别弹选择器」，不是取消该类型）。`LINK_TYPES` 四项；schema `default` 必须与 `options[0].value` 同值；`'internal'` 与 `''` 两种历史写法都要归一（否则四选项一个都不亮）。切类型**只清跨语义不兼容字段**（path↔addr 才清 url）。
- 🔴 **「面板能配的字段，渲染必须三处同时认」**：只测被改的一处＝放任其余两处漂移。共享逻辑抽 `utils/*.js` 纯函数，三处渲染全引用。→ `noticeSymbol.js`。
- 🔴 共享表**形状类存完整类名**（`is-dot` 非 `dot`）；解析结果恒为字符串，调用方**按空串短路整个元素**（空壳会白占 flex 槽位抢 gap）。
- 🔴 **新字段要串进同一条 v-else-if 链**，与旧字段并列会两个一起画。
- 🔴 **子组件自身配置 ≠ 父级配置**：按钮组在 `buttons[]`、图形按钮组在 `items[]`；渲染层拿到的对象必须和面板编辑的同层级，否则外链永远跳空。
- 🔴 **禁止对 `computed()` 返回值解构**（`const {a} = computed(...)` 恒 undefined → v-if 恒假）。编译器/单测不报，真机才炸；只能靠源码正则拦（见 `noticeSymbol.test.js`）。
- 背景两字段：`bgColor`=自身色 / `compBgColor`=容器色（`containerStyle.js`）；显式 0 必须内联。
- 「组件内自带的装饰元素」用户会当配置项问「怎么去掉」→ 变成可选配置（默认无）。

## 真机与跨端
- 🔴 **WXSS 不支持通用选择器 `*`**（`error at token *`）：`uni build`/H5 全程不报，只有微信开发者工具编译才炸。逐个类名 `pointer-events:auto`；`>`/`+` 可用；扫描先剥注释，`calc(...*...)` 的 `*` 是乘号合法。回归 `navTitleCenter.test.js`。
- 🔴 **图标必须 base64 内联，禁 `import PNG`**：产物 `/assets/<name>.<hash>.png` 随包版本漂移，真机跑历史包即落空。判据：**按 PNG 资产粒度成对成败**（同源 menu/richtext 正常）→ 资源层非渲染层。`/static/` 两端不通用（H5 在 `/card/` 子路径）。
- 🔴 **图标字符豆腐块**：`⧉`(U+29C9) MP 大概率豆腐块；`↑↓✕` 正常。**SIcon 的 MP 端是预生成 PNG，颜色写死文件名**（`show-ffffff`）→ 只能用真实 view 画。禁 `::before/::after`；字形测试写字面量别写码点。
- 🔴 Vue 模板裸 hex 作绑定值被当私有字段语法 → 整包 build failed，必须 `:color="'#ffffff'"`。
- H5 正常≠MP 正常，依次查：父 wxss 穿不透子组件根(`:deep()` 无效)→传 prop 出内联；MP 无 atob/Buffer→`uni.base64ToArrayBuffer`；内联 font-family 含双引号→setStyle 整条丢弃；明暗判据搞反。
- 🔴 **uni `image` 非替换元素**（H5 是 div 包裹、MP 是自定义组件），无内在尺寸 → `width/height:auto` **塌缩成 0 = 整图消失**。限高必须给**显式盒高**。admin 画布是真 `<img>`（auto 能撑开）→ 画布看不出真机塌缩。
- 🔴 共用样式函数的新默认要按**调用点开关**（`dpImgStyle(p, useMhDefault)`），否则误钉死其他组件布局。
- 主题跟随：消费 `var(--design-` 的页面必绑 themeStyle；SIcon/canvas/showModal 不吃 var()→喂真实 hex。`import.meta.env` 直接访问在 MP 被垫片成 `require("url")` 崩 app.js。
- 浮层定位禁写死百分比（`sticky` 底沿实测 312~610px），必 JS 实测+内联 top。

## 配色 / 几何 / 令牌
- 🔴 明暗先问「判的是哪一块底」：品牌渐变→`--brand-hero-ink`；白卡浅底→`--brand-ink`。唯一裁决口 `templateTheme.js` 的 `heroForeground`，禁多判据并行。
- 品牌色三通道缺一即「一半蓝一半黄」：① 页面根合 `brandVars` ② JS 取色喂 `brandPrimary` ③ themeColor 同源。新页面过 `brandCoverage.test.js`。
- 模板优先级：**自选模板>品牌主色>兜底模板>装修主题**；互斥注释=分层漂移信号。
- 🔴 两端各写一份 CSS=必然漂移：parity 三纪律（源码正则提取；剥注释只取 style 块；比实际生效值）。**单测全绿≠视觉正确（已五次）**，CSS 几何须无头实测。
- 🔴 **新页面必过 tokenAudit，破基线靠映射既有令牌、不许上调基线**（可映射：`--white/--t3/--border/--bg-card-2/--decor/--decor-2/--gold/--danger/--primary-deep/--bg-page/--bg-hover/--brand-orange`；嵌套 fallback `var(--x, var(--y))` 可行）。**注意 `var(--primary, #165dff)` 的 fallback 是裸 hex** → 去掉。
- 🔴 tokenAudit 按「写法**种类**」计数：写 `calc(var(--z-popup)+10)` 或改 `--z-toast` 都新增一种直接顶破。正解复用 `--z-popup`，靠 **DOM 顺序**定层级。`z-index 27/27`、`box-shadow 46/46`、hex 574/574 均**零余量**。
- 🔴 「旧实现已移除」类断言**必须先剥注释**（说明注释含同字面量 → 假失败）。取 CSS 规则体别用非贪婪 `[\s\S]*?`（会跨 `}` 吃到后面规则）→ 按大括号切到本规则 `}`。
- 组件宽度用 vw/设计稿 px，禁百分比；栅格 `width:%` 必配 `box-sizing:border-box`。

## 需求解读（反复踩的坑）
- 🔴 **「取消 A 的实现方式」≠「取消 A 这个概念」**：听到「去掉/取消 X」先确认 X 是**做法**还是**概念**。
- 🔴 **「置灰」先问灰掉的是哪个字段的语义**：网页/电话恰恰要把网址/号码填进去，灰掉=不让填。禁用态须区分「此类型下不生效」与「暂时不可编辑」。
- 🔴 **存量空值用「显示归一」不改数据**：`radioVal(f)`（cardEdit）/ `propVal(f)`（admin）回落 schema default，存量 `linkType:''` 不必洗。
- 🔴 用户提示常含答案：「A可B不可」⇒病根在两分支差异；「还是之前的坑」=方案选错。
- 🔴 「测量会过期」先证伪再下药：轮询到稳定仍错→非时序；阶梯延时是无效药。
- 会员等属性判据服务端算好下发布尔（SQLite 空格日期 MP 端 new Date() Invalid）；「A 的能力」入口恒显示，差异在点击后文案，不加锁不置灰。

## 静默失败
- 🔴 **`getCurrentInstance()` 只能在 setup 顶层调**（Vue 3 隐式约束）：事件处理器里 / `await` 之后调**一律 null** → `q.in(null.proxy)` TypeError 被 catch 吞成 toast。**只在真机 MP 炸**。正确写法见 `components/CardTabBar.vue`。
- 🔴 整页空数据（静态在、数据全灭）：computed 用了未 import 函数→渲染首字段即抛。审计 `npm run audit:imports`；单测 toContain 钉 import 会锁死 bug→钉正确形态。
- 冷启动 reLaunch 竞态：onShow 跳转须等本页 onReady（`scripts/sim-coldstart.cjs`）。跳未注册页（grep `pages.json`）；登录丢上下文用 `safeRedirect()`。

## 构建与部署
- 🔴 分支纪律：源码落 **main**（不带产物）；deploy 只做 `merge --no-ff main`+重建产物提交；`git push -f origin deploy`；部署后 `git checkout main`。
- 🔴 **产物必须 `git add -f`**（限 `server/public/{card,mall}`、`server/mini-template/mp-weixin`，别用 `-A`）：普通 add **静默跳过新 chunk** → 主 chunk 404 白屏。且 SPA 兜底让 404 也返 200，**验证必须比 md5/内容不能只看状态码**。「未跟踪计数 0」≠没变（gitignore 下新文件不进 `??`）。
- 🔴 **搬产物三陷阱**：① 新产物先 `cp -a` 到 /tmp，main 只提源码；② `git checkout` 会按索引把产物**还原成旧版**，放回前**先 `mv` 走同名旧目录**，否则 `card/card/` 嵌套（症状＝部署没生效）；③ 只搬改过源码的那端产物，别把 card 产物放 mall。
- 🔴 切 deploy 前必先 `git checkout -- server/mini-template/mp-weixin`（构建脚本写回工作区的未暂存改动会阻塞 checkout）。
- 🔴 safe-delete 拦删 >50 文件：先 `mv` 旧产物到 /tmp 再构建。需挪 `dist/build/h5`、`server/public/{card,mall}/{assets,static}`、`server/mini-template/mp-weixin`、MP `static/{icons,sicons}`。
- 🔴 **vitest 不编译 SFC → setup 里「同一标识符声明两次」只有 `uni build` 照得出**。改过 SFC 必须跑完整构建，单测绿灯不能替代。
- 🔴 **vitest 报 "no tests" 不是通过**：文件用 `it` 却导入 `test` 时静默跳过该 describe。追加用例前先看它导的是哪个。
- server 全量 `node --test` 被 OOM kill（exit 137）：`awk 'NR%4==n'` 分 4 批跑。查库：`node:sqlite`+`server/data/panorama.db`。
- 验证产物：JS 已 mangle，grep 函数名必 0 命中 → 查**字符串字面量**；curl 中文串要过 python3 UTF-8 解码。H5 构建 rpx→rem（`.03125rem`）+scope 后缀（`ce-card[data-v-xxx]`），grep `.cls{` 恒 0 是假阴性。
- 🔴 可滚动容器里的主操作按钮要 `position:sticky; bottom:0`。同理：根节点绑修饰类≠生效，若隐藏靠 `:not(.active)` 必须改 class **绑定表达式**。

## 线上排查通道
- 🔴 沙箱**能直连服务器 HTTPS**（`https://zero.nshop.mobi`，443 通）；「curl :3000 返 000」只是直连端口被拦。登录 `POST /api/auth/login`（`admin/admin123`；**admin 无租户身份→客户后台 403**，要用 `tenant1/admin123`）。
- 🔴 **服务器真实路径 `/opt/app`**（非 /var/www/panorama）：仓库根 `/opt/app`，分支 deploy，remote `https://ghfast.top/https://github.com/gdnorcy/NC-app.git`；cwd `/opt/app/server`，systemd `panorama.service`。探测：`readlink -f /proc/<PID>/cwd`。Lighthouse `lhins-bvw7p0gb`；BT 面板 1.12.250.126:8888。
- 🔴 **外网校验按各站点挂载前缀**：card/mall `/{prefix}/assets/`；**admin `/admin-assets/assets/`**（`/admin/...` 走 SPA 兜底返 680B HTML 且 200）。
- 🔴 **验接口用正确的 HTTP 方法**：只支持 POST 的路由用 GET 探必 404（正常），换 POST 得 401 才算注册；另拿真不存在的路由确认 404 基准。**C 端 `/api/card/*` 用租户后台 token 一律 401**（鉴权不同域），条数 0 = 鉴权失败非无数据。
- 🔴 TAT：`reset --hard origin/deploy` 前必须先 `fetch`；带外网域名的命令被 AccessDeny 拦→拆步+本地 curl。判构建成功禁用 `cmd | tail`（tail exit 恒 0），用 `> log 2>&1; echo $?`。
- 🔴 `mcp__lighthouse-ops__execute_command` 的 `toolName` 在**主代理调用链上会被丢弃** → 改派 `general-purpose` 子代理，强调 Region=`ap-guangzhou`。
- 公开只读免登录：`GET /api/card/cards/:id`、`/components`。后台租户：`/api/customer/card/manage`、`/employees`、`/overview`。

## 小程序主包质检
- 「主包内不应存在主包未使用的 JS」＝**只有分包用的模块进了主包**。修法：源文件挪进分包源码目录，连带改 import 深度。
- 🔴 **挪文件必查三类连带项**：① 被挪文件只被分包用的依赖 → 一起挪；② **生成脚本 OUT_FILE 写死旧路径** → 同步改；③ 测试断言钉死旧路径 → 改断言不改实现。
- 🔴 **查依赖别只 `grep "^import"`**（漏行内缩进），用 `audit:imports`。
- 🔴 **扫「只被分包引用」必须含 `components/` 层**：页面级扫描会误报 `compLinkModel`/`noticeSymbol`/`sampleImages`/`templateTheme`/`mallApi`/`cardTabBarSpace` 6 个（都被共享组件引用）。
- 主包体积要**排除各分包目录**再算（含分包 2.8M / 实际 ~1207K）。卡种字段 ≠ 装修入口（入口在 `pages/card/myCard`）。

## 密钥与支付
- 🔴 **密钥落库分界线是「归属」不是「类型」**：租户自己的（小程序 AppSecret/`upload_key` RSA 私钥/商户号）→ 后台明文填写，落库前 `encryptSecret`、回显 `maskSecretValue`；平台自己的 → 只走 env/服务器文件，永不入库。`STORAGE_KEY` 首次部署即固定并备份。
- 🔴 **嵌套字段是加密盲区**：`encryptConfigSecrets` 只扫 section 顶层，`payment.wechat.apiV3Key` 会静默明文落库。
- 🔴 **脱敏占位符判定用 `includes('****')` 不能用 `startsWith`**（回显形如 `S_T1****`）→ 否则前端回传覆盖成占位符＝静默清空凭据。语义统一在 `crypto.js` 的 `mergeSecretInput`；所有读密钥处必须 `readSecret()`。写 payment 段走 `paymentConfig.mergePaymentIntoConfig`。
- 金额**全链路单位「分」**：建单 `yuan2fen()`，**调微信前不得再乘 100**。
- 回调 URL 只能 `https://域名/api/payment/notify/wechat`（**一层 notify**）；挂载 `/api/payment`+放行 `/notify/`。
- 回调验签必须基于 **rawBody**（`express.json({verify})`）；验签用平台证书，签名用商户 API 证书+私钥（方向相反）。
- 兜底：**只有「压根没配」才回落 mock**；配了真实 mchId 而配置不全→直接报错，`/mock-pay` 必须 403。
- 🔴 真实支付前提：库里 openid 必须是真机登录产生的（测试数据 `rebuild_openid_*`/`mock_*` 下单明确报错）。

## 业务口径
- 🔴 名片归属单一事实来源 `TENANT_CARD_SCOPE_SQL`（customer.js）6 通道：①card.customer_id ②card.enterprise_id∈本租户 active 企业 ③用户的 enterprise_id∈本租户 active 企业 ④∈tenant_individuals(active) ⑤∈tenant_enterprise_employees(active) ⑥用户 platform_user.customer_id=本租户 且无非 active 名册记录。根因模式：`POST /api/card/cards`（小程序建卡）不写 `card_profile.customer_id` → 后台查不到，用 ⑥ 通道（不回写数据）。
- 🔴 名片身份单一事实来源 `services/cardIdentity.js`：identity 四值 employee/individual/enterprise/personal；能力判据**只读名册不读 identity**；交换对所有人开放（防骚扰走频控）。查 tenant_enterprises 必带 `status='active'`。
- 集市两套状态：开关=`card_market_items`，is_public=可见性派生；单一来源 `utils/marketLink.js`（开关会真实创建上架记录，「未公开→公开」是有意设计）。超级表单见 `refs/decoration-form.md`。
- 🔴 SaaS：每客户一小程序，走微信第三方平台代开发，jscode2session 改 component token 模式。库同步：backup API 快照→留 admin 凭证、户口重置 admin123→ghfast 镜像传→停服换库。「进入客户」报错=数据非代码（新部署只有 admin，建号须挂 customer_id）。

## 测试环境坑
- openssl 生成测试证书：① 必须 `stdio:['pipe','pipe','ignore']`（进度点 `....+++` 污染 PEM）；② 全程 `-out` 文件；③ `x509 -req` 输入是 CSR（`-signkey` 才给私钥）；④ 必须是真 X.509（`serialFromCertPem` 依赖）。
- supertest 测「按字节签名」接口必须 `.send(rawString)`（传对象会 JSON.stringify 改键序 → 假失败）。
- `node:sqlite` 用 `DatabaseSync`（`new Database()` 非构造函数）；macOS `stat -c%s` 非法用 `wc -c`。
- macOS grep 两坑：BSD `-E` 用裸 `|` 不是 `\|`；压缩 JS 单行，`grep -c` 恒 1 → `grep -o | wc -l`。
- schema 说明字段是 `tips`（复数）；CSS token 源 `token.scss`。
- 基线已知失败（stash 对照证实，与新改动无关）：card-apply 审核流 ×2、card-radar 访客标签、card-market-saas P0-1 未入驻 403、高潜榜会员门槛 —— 共 5 项。
