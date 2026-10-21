# 360全景 项目长期记忆（超精简版）

> 只放元规则；细节在日志与 refs/。

## 装修组件
- 🔴 改一处同步三处：`componentRegistry.js`→`ComponentRender.vue`(v-if 链尾无兜底)→`PageEditor.vue`(schema+control)；C 端 `DesignPage.vue` 独立重复。
- 🔴 **「间距/大小不真实」先数壳层数**：装修页曾三层壳（body 12px + card 10px + render 6px）把组件捏窄 32px+白底圆角，像装在盒子里；第四轮又抓出 `.ce-card{padding:4px;margin-bottom:6px}` 把组件间距撑到 20px（真实页 6px）。调参永远调不对，要**删壳**——间距 100% 由组件自身 marginTop 决定，容器只保留一层边距（ce-body 左右 28rpx = 真实页 `.cc-list`）。选中环禁画卡片边框（1rpx 各占 0.5px 破坏像素对齐）→ 独立绝对定位+`pointer-events:none`。**「A 和 B 不一致」先各测再改**：最小化测量页+headless 实测五场景，别三个一起瞎调；spec 记忆与实测冲突时信实测（flex column 子项并不吞子元素 margin）。
- 🔴 同步需求要连机制一起搬：「对齐设计中心边条」= 浮在组件上不占空间+名字进条省标题行+hover 浮现**一整套**，只搬皮会做出更占地方的常驻大条（返工三次）。手机无 hover→`activeKey`+tapCard，选中再点=进配置；锁标记常驻不随浮条隐。
- 背景两字段：bgColor=自身色/compBgColor=容器色（`containerStyle.js`）。显式 0 必须内联。
- 🔴 **链接模型单一事实来源 `utils/compLinkModel.js`**：「内部链接」是**一等类型**（#321 用户原话「类型那里还是增加一个内部链接吧」）——#301 我把它降级成「不是类型而是能力」是**误读用户意图**，用户要的是「内联手填、别弹选择器」而非取消该类型。`LINK_TYPES` 四项，schema `default` 必须与 `options[0].value` 同值；存量 `'internal'` 与 `''` 两种历史写法由 `normalizeLinkType` 全部归一（否则 UI 四选项一个都不亮）。**切类型只清「跨语义不兼容」字段**：web↔phone 同为地址不清，internal↔miniapp 同为路径不清，只有 path↔addr 才清 url。「取消 A 的实现方式」≠「取消 A 这个概念」——用户否的常是手段不是选项。
- 🔴 **「置灰」先问灰掉的是哪个字段的语义**：网页/电话恰恰要把网址/号码填进去，灰掉=不让填（#321 报「输入框都是灰色的」）。别看到「切了类型就整块禁用」的现成写法就套。
- 🔴 **「面板能配的字段，渲染必须三处同时认」**（#321 收尾自查）：symbol 进了两端 registry（面板能配）却只补了名片渲染 → admin 画布配了不显示（所见非所得）+ 首页/mall 配了 C 端不显示，**两端各自「配了不生效」**。正解抽 `utils/noticeSymbol.js` 共享纯函数（符号表+面板选项+解析），三处渲染全引用；禁三处各抄一份。教训：**只测被改的那一处 = 等于放任其余两处漂移**，测试要按渲染点参数化遍历。
- 🔴 共享表里**形状类存完整类名**（`is-dot` 而非 `dot`）：让各端自己拼 `is-` 前缀就是漂移源。解析函数两个字段恒为字符串，调用方**按空串短路整个元素**——渲染空壳会白占一个 flex 槽位并抢走 gap。
- 🔴 **新字段别和旧字段并列，要串进同一条 v-else-if 链**：symbol 与 iconType（公告标签/自定义图）同时存在时，不串起来会两个一起画。
- 🔴 **子组件自身配置 ≠ 父级配置**：按钮组每个按钮有独立链接配置（在 `buttons[]` 里），组件级 props 上没有 `linkType`；渲染时只传组件级 → 外链永远跳空（静默失败）。判据：渲染层拿到的配置对象，必须和配置面板编辑的是同一层级。

## 真机与跨端
- 🔴 **WXSS 不支持通用选择器 `*`**（`error at token *`）：`uni build` 与 H5 全程不报，只有微信开发者工具编译才炸（「构建绿、真机编译红」）。穿透逐个类名 `pointer-events:auto`；`>`/`+` 可用；扫描先剥 CSS 注释，`calc(100% - 2*var(--x))` 的 `*` 是乘号合法。回归 `navTitleCenter.test.js`。
- 🔴 **图标字符豆腐块**：`⧉`(U+29C9) PC 能显示、MP 大概率豆腐块；`↑↓✕` 正常。**SIcon 的 MP 端是预生成 PNG，颜色写死在文件名**（`show-ffffff`）→ 做不出白色变体，只能用真实 view 画（前块背景=容器底色）。禁 `::before/::after`。禁字形测试写**码点** `\u29C9`，写字面量会连注释一起命中。
- 🔴 Vue 模板裸 hex：`:color="#ffffff"` 绑定式被当私有字段语法（`obj.#ffffff`）→ 整包 build failed。绑定传 hex 必须 `:color="'#ffffff'"`。
- 🔴 **装修组件图标必须 base64 内联，禁 `import PNG`**（真机 5 格纯白 8649/8649 = 图片完全未加载，非渲染/裁切/遮挡）：vite 产物 `/assets/<name>.<hash>.png` 路径随包版本漂移，真机跑历史包即落空。判据：**按 PNG 资产粒度成对成败**（同源的 menu 与 richtext 正常）→ 必是资源层不是渲染层；再查服务器是否真上传过包（journal 零命中 + `channel_deploy_logs` 0 行 + `upload_key` 空 = 平台上是历史遗留包）。base64 后与包版本/资源目录/`/card/` 子路径 base 全部解耦。`/static/` 绝对路径方案两端不通用（H5 在 `/card/` 子路径，实测 `/static/x.png` 404 而 `/card/static/x.png` 200）。
- H5 正常≠MP 正常，依次查：父 wxss 穿不透子组件根(`:deep()` 无效)→传 prop 出内联；MP 无 atob/Buffer→`uni.base64ToArrayBuffer`；内联 font-family 含双引号→setStyle 整条丢弃；明暗判据搞反。
- 主题跟随：消费 `var(--design-` 的页面必绑 themeStyle；SIcon/canvas/showModal 不吃 var()→喂真实 hex。`import.meta.env` 直接访问在 MP 被垫片成 `require("url")` 崩 app.js。
- 浮层定位禁写死百分比：`sticky` 元素底沿随版式浮动（实测 312~610px），必 JS 实测+内联 top。

## 配色元规则
- 🔴 明暗先问「判的是哪一块底」：坐品牌渐变→`--brand-hero-ink`；坐白卡/浅底→`--brand-ink`。唯一裁决口 `utils/templateTheme.js` 的 `heroForeground`；禁多判据并行。
- 品牌色三通道缺一即「一半蓝一半黄」：① 页面根合 `brandVars` ② JS 取色点喂 `brandPrimary` ③ themeColor 同源。新页面必过 `brandCoverage.test.js`。
- 模板优先级分层：**自选模板>品牌主色>兜底模板>装修主题**；互斥注释=分层设计漂移信号。

## 几何与浮层
- 两端各写一份 CSS=必然漂移：parity 三纪律（源码正则提取；剥注释只取 style 块；比实际生效值）；CSS 几何须无头实测，**单测全绿≠视觉正确（已五次）**。
- 🔴 **新页面必过 tokenAudit，破了靠映射既有令牌不靠上调基线**（实测新页面 +38 处全可映射：`--white/--t3/--border/--bg-card-2/--decor/--decor-2/--gold/--danger/--primary-deep/--bg-page/--bg-hover/--brand-orange`，嵌套 fallback `var(--x, var(--y))` 可行）。**「旧实现已移除」类断言必须先剥注释**——源码里「原实现如何如何」的说明注释含同样字面量，正则会连注释一起命中。
- 🔴 取 CSS 规则体别用非贪婪 `/\.cls \{[\s\S]*?xxx/`（会跨过 `}` 吃到后面无关规则，通过/失败都是假的）→ 按大括号切到本规则 `}` 为止。
- 🔴 用户提示常含答案：「A可B不可」⇒病根在两分支差异。「还是之前的坑」=方案选错。
- 🔴 **「取消 A 的实现方式」≠「取消 A 这个概念」**：#301 把「内部页面」从跳转类型里删掉，
  #321 用户要回「类型那里还是增加一个内部链接」——他要的只是**别弹选择器**（手填即可），
  不是取消这一类型。听到「去掉/取消 X」先确认 X 是**做法**还是**概念**。
- 🔴 **「置灰」要先问灰掉的是哪个字段的语义**：#301 我按「外链时把跳转框置灰」实现，
  #321 用户报「切到网页/电话后输入框是灰的」——网页/电话恰恰要把网址/号码填进去，
  **灰掉=不让填**。禁用态必须区分「这个字段在此类型下不生效」与「暂时不可编辑」。
- 🔴 **字段值归一化要吸收所有历史写法**（如 `''` 与 `'internal'` 都表示内部页面）：
  只归一其一会让 UI「四个选项一个都不亮」。且 `options[0].value` 必须与 schema `default` 同值。
- 🔴 「组件内自带的装饰元素」（写死的圆点/图标）用户会当成配置项来问「怎么去掉」
  → 把它变成可选配置（默认无），别只解释「这是设计如此」。
- 🔴 「测量会过期」先证伪再下药：轮询到稳定仍错→非时序；对比原生 DOM 与 query 值定位真因。阶梯延时是无效药。
- 会员等属性判据服务端算好下发布尔（SQLite 空格日期 MP 端 new Date() 会 Invalid）；「A 的能力」入口恒显示，差异在点击后文案与引导，不加锁不置灰。
- 组件宽度用 vw/设计稿 px，禁百分比；栅格 `width:%` 必配 `box-sizing:border-box`。

## 静默失败
- 「空白/没反应」先抓运行时异常：watch/computed 引用须在声明后（TDZ→白屏）。
- 🔴 **`getCurrentInstance()` 只能在 setup 顶层调**（Vue 3 隐式约束，靠 setup 栈里的 `currentInstance` 全局量）：在事件处理器里 / `await` 之后调**一律返回 null** → `q.in(null.proxy)` 抛 TypeError → 被外层 catch 吞成 toast（canvas 节点测量类需求全中）。编译器不报、单测不报、H5 分支不报，**只在真机 MP 炸成静默失败**。凡要 `.in(instance)`（canvas / createSelectorQuery / 节点实测）一律顶层取一次，正确写法见 `components/CardTabBar.vue`。
- 🔴 整页空数据（静态在、数据全灭）：computed 用了未 import 函数→渲染函数首字段即抛。审计 `npm run audit:imports`；单测 toContain 钉 import 会锁死 bug→钉正确形态。
- 🔴 冷启动 reLaunch 竞态：onShow 跳转须等本页 onReady（`scripts/sim-coldstart.cjs` 实证）。
- 跳未注册页（grep `pages.json`）；登录丢上下文（`safeRedirect()` 排 `//`）。

## 构建与部署
- 🔴 分支纪律：源码提交落 **main**，deploy 只做 `merge --no-ff main`+重建产物提交；上次部署后记得 `git checkout main`。误提交到 deploy 的纠正：main 上 `git checkout <误提交> -- server/src server/test web-admin/src`（server/test 不在 src 下，易漏）。
- 🔴 **产物必须 `git add -f`**（限 `server/public/{card,mall}` 与 `server/mini-template/mp-weixin` 三目录，别用 `-A`）：普通 add **静默跳过所有新 chunk** → index.html 引用 404 主 chunk，/card/ 白屏。且 SPA 兜底让 404 也返 200，**验证必须比 chunk md5/内容，不能只看状态码**。🔴 **「未跟踪计数为 0」不等于没变**：被 gitignore 的目录下新增文件不出现在 `git status` 的 `??` 里 → 必须 `comm` 对比索引与磁盘清单再 `add -f`。
- 🔴 构建顺序：**勿在 main 构建后切 deploy**（checkout 恢复旧产物→只加新不删旧）。干净做法：新产物先 `cp -a` 到 /tmp，main 只提源码，deploy 上整目录替换。
- 🔴 **「产物挪到 /tmp → checkout main → 放回」这条纪律自带嵌套陷阱**：`git checkout` 会按索引把 `server/public/{card,mall,admin}`、`server/mini-template/mp-weixin` **恢复成旧版**，随后 `mv /tmp/新产物 server/public/card` 因目标已存在 → 变成 `card/card/`（外旧内新），症状像「部署没生效」（只看到旧 `assets/*.png`、新 `utils/compIconsBase64.js` 消失）。**放回前先 `mv` 走同名旧目录**；判据 `ls <产物目录>` 是否出现与自身同名的子目录。
- 🔴 safe-delete 拦删 >50 文件：正解=先把旧产物 `mv` 到 /tmp 再构建；需挪 `dist/build/h5`、`server/public/{card,mall}/{assets,static}`、`server/mini-template/mp-weixin`、MP `static/{icons,sicons}`。推 deploy 用 `git push -f origin deploy`。
- 🔴 **切 deploy 前必先 `git checkout -- server/mini-template/mp-weixin`**：构建脚本会把产物写回工作区（main 上是旧版），这些未暂存改动会直接**阻塞 checkout deploy**（Aborting）。换产物目录时**别把 card 的产物放进 mall**——mall 是另一个应用，本轮无 mall 源码改动就必须还原，否则等于用错产物部署。
- 🔴 TAT：`reset --hard origin/deploy` 前必须先 `fetch`；带外网域名的命令被 AccessDeny 拦→拆步+本地 curl。判构建成功禁用 `cmd | tail`（tail 的 exit 恒 0），用 `> log 2>&1; echo $?`。
- 🔴 **外网校验按各站点自己的挂载前缀走**：card/mall 是 `/{prefix}/assets/`，**admin 是 `/admin-assets/assets/`**（`app.js` 里 admin 另有 `req.path.startsWith('/admin/')`→sendFile(admin.html) 兜底 680B）。用 `/admin/assets/x.js` 探测必得 680B HTML 且 HTTP 200 —— 又一张「SPA 兜底让 404 也返 200」的脸。
- 🔴 **验接口是否上线要用正确的 HTTP 方法**：只支持 POST 的路由用 GET 探必返 404（正常！不是没部署），换 POST 得 401（鉴权生效）才算注册；另拿一个真不存在的路由确认 404 基准。**C 端 `/api/card/*` 用租户后台 token 一律 401**（鉴权不同域），返回条数 0 是鉴权失败不是没数据。
- 🔴 **vitest 不编译 SFC → setup 里「同一标识符声明两次」只有 `uni build` 照得出**（994 例单测全绿 + `audit:imports` 过，`build:mobile` 仍报 "already been declared"）。改过 SFC 就必须跑完整构建，单测绿灯不能替代。
- 🔴 server 全量单进程 `node --test` 会被 OOM kill（exit 137）：`awk 'NR%4==n'` 分 4 批跑。查库：`node:sqlite`+`server/data/panorama.db`。
- 🔴 **vitest 报 "no tests" 不是通过**：`test()` 未导入（文件用的是 `it`）时**静默跳过**该 describe，
  看起来"全绿"实则一条没跑。追加用例到旧文件前先看它导的是 `test` 还是 `it`。

## 令牌与产物
- 🔴 `tokenAudit` 按「写法**种类**」计数（z-index/font-size/radius…），不是次数：写 `calc(var(--z-popup)+10)` 或改 `--z-toast` 都**新增一种写法直接顶破基线**。正解：复用 `--z-popup`，靠 **DOM 顺序**决定谁压谁。box-shadow 同理复用已有字面量（`--shadow-*` token 全工程没人用过，用了也算新写法）。
- 🔴 **hex/rgba 指标按「处数」计数**（与上面按种类不同）：新页面 `<style>` 一把裸 hex 就能顶破几十处，同样靠映射既有令牌压回去，**不许上调基线**。`z-index 27/27`、`box-shadow 46/46` 已**零余量**，任何新增写法直接破。
- 🔴 可滚动容器里的主操作按钮要 `position:sticky; bottom:0`：内容一长按钮滚走，用户会报「没找到保存按钮」。同理，根节点绑个修饰类**不等于**生效——若隐藏靠 `.card:not(.active){display:none}`，必须改 class **绑定表达式**（加 `isEdit ||` 短路），改类无效。
- 验证产物：JS 已压缩+mangle，grep 函数名必 0 命中 → 查**字符串字面量**；curl 出的中文串要过 python3 UTF-8 解码再 count。H5 构建 rpx→rem（`1rpx→.03125rem`）+scope 后缀（`ce-card[data-v-xxx]`），grep `.cls{` 恒 0 是假阴性。

## 线上排查通道
- 🔴 沙箱**能直连服务器 HTTPS**：`https://zero.nshop.mobi`（443 通）→「curl :3000 返 000」只是直连端口被拦。登录口 `POST /api/auth/login`（`admin/admin123`；**admin 无租户身份→客户后台 403**，要用 `tenant1/admin123`）。
- 🔴 **服务器真实路径 = `/opt/app`（不是 /var/www/panorama）**：git 仓库根 `/opt/app`，分支 deploy，remote 走 `https://ghfast.top/https://github.com/gdnorcy/NC-app.git`；服务 cwd `/opt/app/server`，systemd `panorama.service`。探测法：`readlink -f /proc/<PID>/cwd`（PID 从 `systemctl show -p MainPID` 拿）。
- 🔴 `mcp__lighthouse-ops__execute_command` 的 `toolName` 在**主代理调用链上会被丢弃**（报 "missing required parameter(s): toolName"）→ 改派 `general-purpose` 子代理执行，强调 Region=`ap-guangzhou`（写 ap-shanghai 返「暂无数据」）。
- 公开只读免登录：`GET /api/card/cards/:id`、`/components`。后台租户接口：`/api/customer/card/manage`、`/employees`、`/overview`。

## 小程序主包质检
- 「主包内不应存在主包未使用的 JS 文件」＝**只有分包用的模块被放进了主包**。修法：源文件挪进分包源码目录，连带改 import 与相对深度；被挪文件若 import 主包 utils，主包那份仍需有**主包页面在用**，否则换一个文件再报同样告警。
- 🔴 **挪文件必查三类连带项**（#325 实测，漏一个就白干）：① 被挪文件的依赖若也只被分包用 → 一起挪；② **生成脚本的输出路径写死旧位置** → 同步改，否则重跑脚本文件又生成回主包；③ 测试断言钉死旧路径 → 改断言不改编实现。
- 🔴 **查依赖别只`grep "^import"`**（漏行内缩进的 import），用 `audit:imports` 才准。
- 🔴 **扫「哪些模块只被分包引用」必须含 components/ 层**：页面级扫描会误报 `compLinkModel`/`noticeSymbol`/`sampleImages`/`templateTheme`/`mallApi`/`cardTabBarSpace` 等 6 个（都被共享组件引用）→ 照着扫结果挪文件会平白惹出一堆 import 改动。
- 🔴 小程序主包体积要**排除各分包目录**再算（含分包 2.8M / 实际 1205K，别虚高）。
- 小程序的**卡种**字段与「是否有装修入口」是两件事：入口在 `pages/card/myCard` 的跳转里。

## 租户名片归属口径（6 通道）
- `TENANT_CARD_SCOPE_SQL`（customer.js）是后台名片可见性的单一事实来源：①card.customer_id ②card.enterprise_id∈本租户active企业 ③用户的enterprise_id∈本租户active企业 ④用户∈tenant_individuals(active) ⑤用户∈tenant_enterprise_employees(active) ⑥**用户platform_user.customer_id=本租户**且**无任何非active名册记录**（离职status='left'/停用）。
- 🔴 根因模式：`POST /api/card/cards`（小程序建卡）**不写 card_profile.customer_id**（只有「建卡+入驻」create-with-apply 才写）→ 小程序自建卡在后台完全查不到。修法用 ⑥ 通道（不回写数据），别 UPDATE 存量卡。

## 🔴 密钥落库纪律（2026-10-21 定）
**分界线是「归属」，不是「类型」**——用户拿菜鸟云「参数设置」（原始id/AppId/AppSecret/代码上传秘钥四个明文框）质疑过「密钥绝不能进后台」的结论，我认同用户并纠正自己：
- **租户自己的**小程序/商户号密钥 → **后台明文填写**（行业惯例，泄漏影响面仅限该租户）。落库前必须 `encryptSecret`，回显必须 `maskSecretValue`。
- **平台自己的**密钥 → 只走 env / 服务器文件，**永不入库**。
配套：① 🔴 **嵌套字段是加密盲区**：`encryptConfigSecrets` 只扫 section **顶层**，`payment.wechat.apiV3Key` 是嵌套层 → 静默明文落库，必须验证「加密循环真的扫得到」；② 🔴 **脱敏占位符判定用 `includes('****')` 不能用 `startsWith`**：回显形态 `S_T1****`，只判前缀 → 前端原样提交 → 密钥被占位符覆盖（静默清空凭据），语义统一在 `crypto.js` 的 `mergeSecretInput`；③ **所有读密钥处必须 `readSecret()`**（兼容历史明文）；④ 🔴 **`channel_apps.upload_key` 是租户小程序的 RSA 私钥**，权限=可上传任意代码，与 appSecret 同级敏感；⑤ 写 payment 段统一走 `paymentConfig.mergePaymentIntoConfig`；⑥ `STORAGE_KEY`（加密主密钥）**首次部署即固定并备份**，改了所有已存密钥解不开。

## 支付接入约定
- 金额**全链路单位是「分」**：建单 `price*100` 或 `yuan2fen()`，**调用微信前不得再乘 100**（曾写错成 1000 倍多收）。
- 支付回调 URL 只能是 `https://域名/api/payment/notify/wechat`（**一层 notify**）；挂载点必须 `/api/payment`+路径守卫放行 `/notify/`，否则要么多一层 `/notify/notify/`，要么整段 payment 失去鉴权（`/tenant-config` 403→200 裸奔）。
- 回调验签必须基于 **rawBody**（`express.json({verify})` 捕获原始 Buffer），parse 再 stringify 会因键序/空白变化导致验签必失败且极难排查。
- 验签用**平台证书**（验回调），签名用**商户 API 证书+私钥**（发请求）——方向相反，别混。
- 兜底原则：**只有「压根没配」才允许回落 mock**。一旦配了真实商户号而配置不全 → 直接报错，绝不静默 mock（= 点了支付钱没扣订单却成功，资金与权益双错账）。`/mock-pay` 在真实 mchId 下必须 403；判定要用**明文**配置。
- 🔴 **真实支付前提**：库里 openid 必须是真机登录产生的真 openid。测试数据（`rebuild_openid_*`/`mock_*`）下单时会明确报错，不得静默。

## 杂项
- 🔴 macOS grep 两坑：① BSD 正则 `\|` 不是 alternation → 必须 `grep -oE "a|b" | wc -l`；且 `-E` 模式下 `\|` 是字面竖线，alternation 用裸 `|`；② 压缩 JS 是单行，`grep -c` 数的是行（恒 1）→ 用 `grep -o ... | wc -l`。
- schema 说明是 `tips` 复数；CSS token 源 token.scss。
- 集市两套状态：开关=`card_market_items`，is_public=可见性派生；单一来源 `utils/marketLink.js`。超级表单见 refs/decoration-form.md。
- 🔴 名片身份单一事实来源 `services/cardIdentity.js`：identity 四值 employee/individual/enterprise/personal；能力判据只读名册（tenant_individuals/employees active），**不读 identity**；交换对所有人开放（防骚扰走频控）。查 tenant_enterprises 必带 status='active'。
- 🔴 SaaS 架构：每客户一小程序，走微信第三方平台代开发，jscode2session 改 component token 模式。库同步：backup API 快照→留 admin 凭证、户口重置 admin123→ghfast 镜像传→停服换库。「进入客户」报错=数据非代码：新部署只有 admin、种子不建租户口，建号须挂 customer_id。
- 服务器：Lighthouse `lhins-bvw7p0gb`。域名 zero.nshop.mobi 已 SSL；BT 面板 1.12.250.126:8888。

## 测试环境坑
- openssl 生成测试证书：① 必须 `stdio:['pipe','pipe','ignore']`（genpkey 进度点 `....+++` 混入 stdout → PEM 污染）；② 最稳全程 `-out` 文件；③ `x509 -req` 输入是 **CSR**（`-signkey` 才给私钥路径）；④ 必须是真 X.509 证书（`serialFromCertPem` 靠它算 serial），公钥 PEM 会报错。
- supertest 测「按字节签名」的接口（支付回调）必须 `.send(rawString)`：传对象时 supertest 自己 JSON.stringify，键序与签名原文不一致 → 明明实现正确却失败（假象）。
- node:sqlite 用 `DatabaseSync`（`new Database()` 非构造函数）；macOS 上 `stat -c%s` 非法用 `wc -c`。
- 基线已知失败（stash 对照证实，与新改动无关）：card-apply 审核流 ×2、card-radar 访客标签、card-market-saas P0-1 未入驻 403、高潜榜会员门槛 —— 共 5 项。
