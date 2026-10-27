# 360全景 元规则（长期记忆）
> 只放判据与坑，细节在每日日志。⚠️ 改本文件须在 deploy 往返 checkout 后**当即提交**（checkout -f deploy 还原工作区会吞未提交修改）。目标 ≤ 9K 字符，涨了就合并删减而非加行。

## 0 排查第一直觉
- 工具坑：grep `\|` 是字面量（不报错、0 匹配）→ 用 `grep -E`；压缩 JS `grep -c` 恒 1 → `grep -o|wc -l`；查文件用 Glob/Grep 不用 shell 管道；`cmd|tail` 丢退出码 → `echo $?`。
- API 搜索别拼全路径（路由挂 /api/customer，页面写 get('/billing/plan') → 恒 0）→ grep 末段或封装名。整页没数据多为请求级失败。
- 写值播种须留痕：ADD COLUMN 幂等 ≠ UPDATE 幂等（"当前是 0 就播种"会被管理员关后重启重开）→ schema_marks 标记。
- **整批约束校验必须整批传入**：`list.map(x => normalize([x]))` 逐个调 → 每次只看 1 个 → 上限永不触发（真事故：展示位「最多 8 个」形同虚设）。纯函数单测全绿也照漏，路由层测试才拦得住。
- `node --test $FILES` 多文件被当单路径 → `$(cat list.txt | tr '\n' ' ')` 展开。node:sqlite run() 返回 **lastInsertRowid（小写 d）**。

## 1 测试
- node:test 三坑：① before() 已跑种子打 mark → 测"未迁移"须 beforeEach 重置；② beforeEach 传 const 函数引用 TDZ → 包箭头；③ ESM after() 写 require → hookFailed 但 test 全过（看 suite 行）。
- 基线比对禁 git stash（含 server/test 回退旧版→假失败）→ 全量 stash 基线 + 逐个对照。钉子测试钉语义不钉写法。改用户可见串前必 grep 所有 *.test.js。
- server 全量 node --test 易 OOM(137) → awk 分 4 批（`awk '{n=int((NR-1)/20)+1; print > ("/tmp/srv-b" n ".txt")}'`）；vitest 与 node --test 不并发跑（假失败）。
- 配色回归锁锁元素名：删/改页面元素须同步改 memberColorSystem 等锁 + 加「已迁走元素不得残留」反向锁。themeColor 别删（brandCoverage.test.js 逐页扫 = 品牌色口径）。
- vitest 不编译 SFC（setup 重名声明只有 uni build 照得出）；"no tests" 非通过。supertest 按字节签名须 .send(rawString)；node:sqlite 用 DatabaseSync；card token 非 JWT：base64(JSON{uid,openid,ts}).randhex → split('.')[0]。mock wx-login 按 defaultTenantId 兜底 → 测"无租户"设 0。

## 2 构建与部署
- 源码落 main（不带产物）；deploy = merge --no-ff main + 重建产物；push -f deploy；部署后 checkout main。产物必须 `git add -f`（限 server/public/{card,mall,admin}、server/mini-template/mp-weixin，禁 -A）——普通 add 静默跳过新 chunk → 白屏。白屏判据查暂存集：新 chunk 已暂存 + 旧 hash=0（磁盘有 ≠ 暂存有）。源码按路径显式 add，`diff --cached --name-only` 复核零产物混入。
- main 跟踪陈旧产物：mv 新产物到 /tmp → checkout -f deploy → merge → 旧版 cp -a 铺回（防 card/card 嵌套）→ add -f；回 main 后 `git checkout --` 恢复。往返吞未提交修改（含 memory）。
- safe-delete 拦 >50 文件删除：uni build / build:admin 清目录会被拦 → 先 mv 目标目录到 /tmp 再构建。H5 要 mv `assets` + `static` 两处（只 mv assets 不够）。
- 只验 MP 编译不产跟踪产物：`npx uni build -p mp-weixin`（不带 strip/gen-sicons/stamp/sync）→ 产物留 gitignore 的 web-app/dist，main 零污染。
- build:h5 不含同步：从仓库根跑 `node scripts/sync-mobile-dist.mjs` 才进 server/public/{card,mall}。MP 是第四产物面：新分包须跑 `build:mp-weixin -w web-app`（stamp @提交）才进小程序；只跑 build:h5 只覆盖 card/mall。提交前 grep 特征串验证；push 后 `git ls-remote origin <branch>` 校验。

## 3 真机与跨端
- MP 滚动必须 scroll-view。定高：①显式 height ②max-height 封顶且父级 auto 非 flex ③父级确定 height 时 flex:1。
- 跳转路径写错 = 静默失败 → 走常量/工具函数。
- MP scroll-view 弹窗：sheet 块级堆叠 + body max-height:Nvh + :scroll-top 回顶；内容增高时主动回顶（scroll-top 只在值变化时生效，0/0.1 交替）。
- MP 模板禁 `x?.[0]`（编译降级成整体值），首字符放下标 computed；禁裸标签 + 禁标签选择器（uni MP 收编成无类名 view → wxss 静默失效）。样式一律类名；wxss 有规则 ≠ 生效。
- 服务端图片路径（/uploads/ 相对）MP 全断：展示点过 absUrl（含 canvas.createImage）；新上传先换 URL 再入库。服务端时间 UTC：datetime('now') 产 UTC 串，前端解析补 'Z'（dynTime.js 共用）。
- H5≠MP：父 wxss 穿不透子组件根 → 传 prop 出内联；MP 无 atob/Buffer → uni.base64ToArrayBuffer；用 var(--design- 的页必绑 themeStyle；uni image 无内在尺寸 → 显式盒高。

## 4 装修组件
- 改一处同步三处：componentRegistry.js → ComponentRender.vue → PageEditor.vue（schema+control）；C 端 DesignPage.vue 独立重复；server COMP_TYPES 白名单。间距由 marginTop 决定 →「不真实」先数壳层数删壳。
- 链接模型单一事实来源 utils/compLinkModel.js：'internal' 一等类型；schema default = options[0].value。对齐+偏移 = 基准+叠加：偏移用 position:relative+left（禁 margin-left 覆盖 auto、禁 transform 造层叠上下文）。
- canvas 变换跨轮累积：每轮 setTransform(1,0,0,1,0,0)→clearRect→setTransform(dpr…)，否则第 2 张起只剩底色（H5 免疫）。横向 scroll-view 内 canvas 不跟手 → 导出 <image>；屏外 canvas 用 fixed+left:-9999px。禁解构 computed()。
- swiper 塞进 position:fixed 弹层 = 真机触摸失效（devtools 正常）→ 自实现 @touchstart/@touchend + dx 阈值；previous/next-margin 太小裁竖图，须 ≈(屏宽−卡宽)/2。

## 5 身份与入驻
- 身份四值 cardIdentity.js：individual 认证个人 / personal 未认证 / employee 员工 / enterprise 企业。能力判据只读名册（tenant_individuals / tenant_enterprise_employees 的 status='active'），不读 identity。
- 入驻模式 individual_join_mode 只有两值：code 兑换码+审核 / purchase 买会员套餐自动获得场席和认证。入口统一在名片管理（双主 Tab）。
- 一行控三能力：status='active' 同时决定 ①集市上架 ②被交换资格（/exchange/request 要求对方名册 active）③身份徽章。认证是入驻结果不是第三种入驻方式。
- 两口令别混：projects.invite_code（P 开头）= 租户绑定；tenant_enterprises.config.invite_code（ENT######）= 员工凭码加入。名片归属 TENANT_CARD_SCOPE_SQL。
- 空头权益 = 后台有表单、C 端有入口、服务端零消费点 → grep services/routes 0 命中即空头。雷达配额数 = "已占真实通道数"非 status='sent'。
- 插件开关是真门控：sys_tenant_plugin(is_install,is_enable)，5 码 dist/partner/share-all/share-cat/share-area。两层消费：① computeOrderSplit 的 active = plugins.filter(is_enable)，无 active 直接 return → 关掉不参与分钱；② C 端 distribution.vue 读 summary.isEnable* 做 v-if。第28轮「安装/启用」合并为单一启用：is_install 由 is_enable 派生；GET /plugins 只吐 enabled。

## 6 租户会员套餐
- 单一事实来源：benefit_catalog（平台目录）+ member_level_app_benefits（套餐×应用矩阵）+ member_user。member_package 退化为套餐模板库；旧 member_levels.benefits JSON 死数据。
- 购买唯一路径 = 租户会员等级（productType=member_card → openCardByOrder）。场席授予只认矩阵 market.market_subject（无行=不授予）。播种 ensureTenantDefaultLevels 模板驱动（name 锚点、price×100→buy_price）。建租户 POST /projects 即时播种。
- discount 语义=百分比（0 无/10 九折/80 二折），旧折率×10。HARD_CAPS 读取截断 + 写入拒绝互补。积分 ⌊元×point_rate⌋+⌊元×rebate%⌋，note 带订单号幂等。后台矩阵编辑器 = 目录默认⊕矩阵覆盖，保存只 PUT 变化应用（快照脏比对）。
- 等级名唯一口径 resolveLevelName()：member_user→member_levels.name 优先 → 旧镜像回落 TIER_PKG → 永不返回空串。前端禁 {free,silver,gold,diamond} 映射表。
- 签到是租户级日常动作非会员卡附属：signSummary() 独立出 signed/canSign/score/reason；不可用 v-if="memberCard" 藏入口（score_sign 默认 'all' = 全员可签）。签到卡在个人中心，会员中心只留等级/权益/购买。
- benefit_catalog 双名：label=后台口径 / display_label=C 端展示名（benefitLabel() 优先后者）。

## 7 配色 / 令牌
- 明暗唯一裁决口 templateTheme.js 的 heroForeground，禁多判据并行。cardDetail 全文件禁 --primary 漂移令牌（注释里也不能写）；品牌色一律 var(--design-primary) 不带兜底。
- 新页面必过 tokenAudit：破基线靠映射既有令牌、不许上调；去掉 var(--primary,#hex) 裸 fallback。z-index 只用 --z-content/--z-sticky/--z-popup。
- 两端各写 CSS = 必然漂移：parity 三纪律（正则提取/剥注释/比生效值）；单测全绿≠视觉正确。

## 8 登录与跳转
- 登录跳两次通解：进入流程抽成可重入函数，未登录当页放登录浮层，登录成功原地重入 → 0 次跳转；只有新用户/没名片才跳 create。动作守卫返回 Promise。
- 守卫与浮层共享基建禁再抄：utils/loginGate.js useInlineLogin + components/LoginGateModal.vue。card 包全部页面零登录跳转；退出原地翻态不 reLaunch。
- 登录请求唯一出处 utils/inlineLogin.js（两侧都不许再出现 cardApi.wxLogin(）。易漏：H5 模拟码分支、默认租户兜底、resetBrandCache。
- 登录页仍是冷启动首页（onShow 按装修首页 reLaunch，人为进入带 manual=1）；reLaunch 延到 onReady 之后。onShow 只在"内容已加载且登录态掉了"才补弹。
- 模板 ref 不带 .value。getCurrentInstance() 只能在 setup 顶层调（await 后一律 null → 真机 MP 炸）。整页空数据常是 computed 用了未 import 函数。

## 9 微信开放接口
- 真小程序码前提：小程序上传过代码，否则一律 41030（release/trial/develop 全拒）→ 回落网页码。排查：①先拿 token ②再对候选 page 发码。wxa/get_page 只限第三方平台 → 候选 page 逐个发码试探。
- 三级通道：第三方平台已授权→WxComponentService；自运营→standalone；都没有→H5 兜底。渠道查询不得过滤 auth_status。访客码必须 release。
- getwxacodeunlimit 的 check_path 对已发布账号整体失灵：首轮照常；全 41030 后用"真实 scene + 无 page + 校验"探测是否真已发布，通过才 check_path:false 补一枪。getwxacode 不校验 path。

## 10 密钥与支付
- 密钥落库分界线是归属非类型：租户自己的（AppSecret/upload_key/商户号）→ 后台填 + encryptSecret + maskSecretValue 回显；平台自己的 → 只走 env/服务器文件。
- 嵌套字段加密盲区：encryptConfigSecrets 只扫 section 顶层 → payment.wechat.apiV3Key 明文落库。读密钥必 readSecret()（不用脱敏串当密钥）。
- 金额全链路单位分：建单 yuan2fen()（调微信前不得再 ×100）。回调 URL 只 https://域名/api/payment/notify/wechat（一层 notify）；验签基于 rawBody。只有压根没配才回落 mock；配了真实 mchId 不全 → 报错。

## 11 线上通道 / 主包 / 生产库
- 服务器 /opt/app（deploy 分支），systemd panorama.service，cwd /opt/app/server，命令 `node --env-file-if-exists=.env src/index.js`。Lighthouse lhins-bvw7p0gb（**地域 ap-guangzhou**，非 beijing/shanghai）。admin 线上路径 `/admin-assets/assets/*`（非 `/admin/assets/*`）；card/mall H5 `/card/assets/*`。路径错时 SPA 兜底返 200 而 body 空 → grep 全 0。
- 远程部署：git fetch → reset --hard origin/deploy（校验 HEAD）→ systemctl restart panorama。TAT 禁含外网域名/IP；describe_instances 用 InstanceIds 数组，execute_command 用单数。
- 主包规则：主包内不应有主包未用的 JS = 只有分包用的模块进了主包 → 源文件挪进分包目录连带改 import。挪文件必查：①分包专属依赖一起挪 ②生成脚本 OUT_FILE 写死旧路径 ③测试断言钉旧路径。主包体积排除分包目录再算。
- 🔴 TAT 直写生产库被平台 AccessDeny（DELETE/UPDATE、node 直连 sqlite 全拦；git reset / systemctl / cp / sqlite3 -readonly 单条 SELECT 可过）。平台语义级拦截（拆串/base64 绕过无效，勿尝试）。✅ 合规替代 = db.js 启动期一次性迁移：服务自身进程写库，TAT 只需 reset+restart 即触发，落点 migrate() 内、必须在建表种子之后。
  - ⚠️ 测试坑：createDb() 内部已跑 migrate() → 已留痕，插脏数据不会被清，须先 `DELETE FROM schema_marks WHERE key=?`。构造数据前先查表结构：dist_share_all/share_cat/partner 有 UNIQUE(tenant_id,user_id)；dist_user_relation 上级字段名 pid1；dist_wallet 二次插入撞主键（改用 UPDATE 模拟重播）。
  - 只读排查：一条命令只能带一条 SELECT（多语句被拦）→ 逐条查。仅单表简单 SELECT 通过；sqlite_master 内省/子查询/for+curl 全 Deny → 查表结构直接查业务表。ls/cat/git/systemctl/ps/journalctl 正常。改库前先 `cp data/panorama.db data/panorama.db.bak_<日期>_<用途>`。

## 12 行业应用接入（trace 模式）
- 规范唯一权威：`docs/规范/09-行业应用开发接入标准.md`，§10 是常见交付缺陷速查表。整合前先按速查表扫交付物一次性列全问题再改。
- 对标基准要核实是不是真源：开发文档/*deliverable* 常是上一份 AI 整合交付物（里面是我们自己栈路径）不是原系统 → 不能当基准；真源要么一手源码、要么对标站截图（后台页多登录墙拿不到 → 向用户要源码/账号/截图）。配置项归属层级必须跟对标站对齐（同名"奖品"在对标站是租户级、我们做成批次级 → 层级就不同，补出来也不像）。
- import.meta.env 只能直接访问，禁 `typeof import.meta !== 'undefined' &&` 防御写法 —— vite 在 MP(CJS) 下把裸 import.meta 垫成 require("url") → app.js 启动即崩。
- 本项目口径：ESM（禁 require）；SQLite 禁 MySQL COMMENT 等专有语法；租户标识唯一来源 = JWT 载荷 req.user.customerId（不存在 req.user.tenant_id/tenantId → 恒 0）；后台 API 走 customerApiCall（baseURL /api/customer，禁裸 fetch）；C 端基址单一来源 utils/apiBase.js + createApiClient（禁硬编码 /api/xxx）。app_menus.app_id 用 `SELECT id FROM apps WHERE code=?` 子查询禁硬编码 id；solution_apps 必须给可执行 INSERT（只给注释示例 = 看得见开不通）。
- 🔴 复刻对标系统两条硬规则（用户明令，不可违背）：① 只复刻行为与字段语义，不搬一行它的代码；② 代码与文档不得出现对标系统的名称/缩写/简称（含模块名、框架名）——范围含注释、变量/函数名、测试用例名、db.js 的 SQL 注释、方案文档。交付前全项目 Grep 扫禁用词确认 0 命中（外部交付物目录属参考材料不扫不改不入库）。
- 🔴 数量上限类参数别照抄对标系统固定值：先查当前平台/接口实际口径（展示位上限 8 = 公众号当前「上传图文消息素材」一个消息 1~8 条图文；对标系统固定 10 位对应早期接口 → 不跟）。
- 🔴 公开接口下发含密钥配置前必须剥 keyCipher：`.map(({keyCipher, ...rest}) => rest)`。回显只给 maskSecretValue（前 4 + **** + 后 4）。后台保存顺序：先轮密文再归一化（反了=明文落库）；保存后回读一次，否则输入框留明文与库里脱敏态不一致。
