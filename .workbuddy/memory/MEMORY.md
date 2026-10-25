# 360全景 长期记忆（元规则）
> 只放元规则与判据，细节在每日日志。⚠️ 改本文件必须在 deploy 往返 checkout 之后做并当即提交——checkout -f deploy 会还原工作区，未提交修改被静默吞掉。

## 0 排查第一直觉（最高频坑）
- 先看 grep 再说：BSD grep `\|` 交替被当字面量（0 匹配且不报错，伪装成"产物没构建进去"）→ 必须 `grep -E`；压缩 JS 单行 `grep -c` 恒 1 → `grep -o|wc -l`；查文件存在用 Glob/Grep 不用 shell 管道；zsh `--include=*.vue` 要加引号。
- API 搜索别用"挂载点+路径"全串（路由挂 /api/customer，页面写 get('/billing/plan') → 恒 0）→ grep 路径末段或封装名。
- 测量工具先证伪：zsh 双引号里 `$_` 会展开进正则（正则一律单引号）、`cmd|tail` 丢退出码（用 `echo $?`）、tail/cat 截断会伪装成 push 失败。
- 「整页没数据」多为请求级失败，不是渲染问题（见"渠道/小程序"节）。
- 写值播种必须留痕：ADD COLUMN 报错幂等 ≠ UPDATE 写值幂等（"当前是 0 就播种"会被管理员关后重启重开）→ schema_marks + markApplied/setMark。

## 1 测试纪律
- node:test 三坑：① before() createDb 已跑完整种子打 mark → 测"未迁移"须 beforeEach 重置 mark；② beforeEach 传 const 函数引用 TDZ（声明在后）→ 包箭头；③ ESM after() 写 require → "require is not defined"，表现为 suite 级 hookFailed 但 test 全过——看 suite 行别只看汇总。
- 基线比对禁 git stash（含 server/test 会回退旧版→假失败；只 stash src 全挂 + OOM 137）→ 全量 stash 基线 + 逐个对照。
- 源码钉子测试别钉写法（一收敛红一片），钉语义（工厂内容 + 被哪几处调用）；新字段连带 INSERT/UPDATE 列串与表单初值，改前 grep 所有 *.test.js。
- mock wx-login 按 config.defaultTenantId 兜底绑租户 → 测"无租户"分支必须显式设 0。
- supertest 按字节签名须 .send(rawString)；node:sqlite 用 DatabaseSync；card 端 token 非 JWT：base64(JSON{uid,openid,ts}).randhex，解析 split('.')[0]。
- server 全量 node --test 易 OOM(137) → awk 分 4 批；**vitest 与 node --test 不并发跑**（资源竞争假失败，单独复跑必过）。
- vitest 不编译 SFC（setup 内同标识符声明两次只有 uni build 照得出）；"no tests" 非通过（文件用 it 却导 test 会静默跳过）。

## 2 构建与部署
- 源码落 main（不带产物）；deploy = merge --no-ff main + 重建产物；push -f origin deploy；部署后 checkout main。产物必须 `git add -f`（限 server/public/{card,mall,admin}、server/mini-template/mp-weixin，禁 -A）——普通 add 静默跳过新 chunk → 主 chunk 404 白屏；SPA 兜底 404 返 200 → 验证比 md5 不能只看状态码。
- 🔴 main 跟踪陈旧产物：切 deploy 前 mv 新产物到 /tmp → checkout -f deploy → merge → 旧版 mv 开再 cp -a 铺回（防 card/card/ 嵌套）→ add -f。不能从 main 移除跟踪（未来 merge 冲突破坏产物）；回 main 后 `git checkout --` 恢复。**checkout 往返吞一切未提交修改（.workbuddy/memory 同样还原）**。
- 🔴 备份≠本轮产物：提交前 grep 本轮特征串验证（曾险把旧备份当新产物上线）。压缩产物函数名被 minify 消失属正常，用"用户可见串/API 名/wxml 结构"三重交叉。
- 🔴 uni build 清 dist/build 触发 safe-delete（chunk>50 被拦整链失败）→ 构建前把 dist/build/{h5,mp-weixin} mv 到 /tmp。**同理 `npm run build:admin` 内的 `rm -rf server/public/admin/*` 也会被拦（count 301）**→ 先把 admin/{assets,admin.html,customer.html} mv 到 /tmp 再跑 `npm run build -w web-admin`（顺便避免陈旧 chunk 堆积：干净集合应恒为 198 个 assets 文件）。
- 🔴 build:h5 不含同步：只产出 web-app/dist/build/h5，必须再从仓库根跑 `node scripts/sync-mobile-dist.mjs`（脚本在**根** scripts/，不在 web-app/scripts/）才进 server/public/{card,mall}（build:mp-weixin 内联 sync-mini-template）；漏跑＝构建 OK 但线上没变，特征串全 0 是判据。
- push 网络抖动会假失败 → push 后必须 `git ls-remote origin <branch>` 校验远程 HEAD。加页面必跑 `node web-app/scripts/gen-mini-pages.js`（漏跑＝装修页页面选择框缺项）。
- 🔴 web-app/dist/build/mp-weixin（uni 原始产物）与 server/mini-template/mp-weixin（自运营工程）应同源，但后者常被部署末尾 checkout -- 还原成陈旧版（sync 只 cpSync 不清旧文件）。**交付包一律从 dist 取**，用 BUILD.txt built at + git HEAD 验新鲜度。

## 3 真机与跨端
- 🔴 MP 滚动必须 scroll-view（普通 view overflow-y:auto 真机滚不动）。定高三条路：①显式 height ②max-height 封顶且父级 auto 非 flex ③父级确定 height 时 flex:1；flex:1+height:0 赌父级 max-height = 两次证伪。动前先 grep 项目内其他弹窗写法。
- 🔴 MP scroll-view 弹窗最终形态：sheet 普通块级堆叠（不用 flex column）+ body max-height:Nvh + :scroll-top 回顶；内容动态增高等中段 → 展开/开关变化时主动回顶（scroll-top 只在值变化时生效，0/0.1 交替；watch flush:'post'）。
- 🔴 MP 模板禁 `x?.[0]`（编译降级成整体值，曾把昵称塞进头像圆），首字符放下标 computed；禁裸 b/h4/p/span + 禁标签选择器（uni MP 收编成无类名 view → wxss 静默失效，H5 正常）。样式一律类名；验证要配对验证（wxss 有规则 ≠ 生效）。
- 🔴 跳转路径写错 = 静默失败（不报错不跳，体感"只 toast 不跳转"）→ 跳转走常量/工具函数。
- 🔴 MP 产物验证口径：变量名 mangle 成单字母、v-if→wx:if、公共模块抽到 common/vendor.js、局部函数名消失。验证用"用户可见串 + DOM 结构 + vendor 间接确认"；app.json 分包 pages 是纯字符串数组；跳转路径在 page.js 不在 wxml。
- 🔴 服务端图片路径（/uploads/ 相对）MP 全链路断：H5 同源能显示、MP 当包内路径→空白。展示点一律过 absUrl（utils/apiBase.js）；canvas.createImage 同样不吃相对路径；新上传入口"先换 URL 再入库"。
- 🔴 服务端时间是 UTC：datetime('now') 产出 UTC 串，前端 `new Date(t.replace(' ','T'))` 按本地时区 → 东八区多 8 小时。解析必须补 'Z'（dynTime.js 两端共用）。
- H5 正常≠MP 正常：父 wxss 穿不透子组件根 → 传 prop 出内联；MP 无 atob/Buffer → uni.base64ToArrayBuffer；消费 var(--design- 的页必绑 themeStyle，SIcon/canvas 喂真实 hex。
- WXSS 不支持 `*`；SIcon MP 端用真实 view 画、禁 ::before/after；uni image 无内在尺寸 → 限高给显式盒高；导航栏右侧被胶囊吃宽度 → 单条主操作改右下角 FAB。

## 4 装修组件
- 改一处同步三处：componentRegistry.js → ComponentRender.vue → PageEditor.vue（schema+control）；C 端 DesignPage.vue 独立重复；server COMP_TYPES 白名单。间距由组件 marginTop 决定 →「不真实」先数壳层数删壳；选中环独立绝对定位 + pointer-events:none。
- 链接模型单一事实来源 utils/compLinkModel.js：'internal' 是一等类型；schema default = options[0].value。「对齐+偏移」=基准+叠加：偏移用 position:relative+left（禁 margin-left 覆盖 auto、禁 transform 造层叠上下文）；boxOffsetX/offsetX 两 key 都认。
- 🔴 canvas 变换矩阵跨轮累积：循环外只设一次 width/height 不重置上下文，每轮 ctx.scale(dpr,dpr) 叠成 dpr² 把内容顶出画布（第 2 张起只剩底色）。每轮 setTransform(1,0,0,1,0,0)→clearRect→setTransform(dpr…)。H5 分支每轮 createElement 天然免疫，两端排查别混。
- 🔴 swiper 塞进 position:fixed 弹层 = 真机触摸失效（devtools 正常）→ 弹层内横滑自实现 @touchstart/@touchend + dx 阈值；previous/next-margin 太小 → slide≈满屏 + aspectFill 裁竖图，须 ≈(屏宽−卡宽)/2。
- canvas 显示尺寸≠位图；横向 scroll-view 内 canvas 不跟手 → 导出 <image>；屏外 canvas 用 fixed+left:-9999px。禁解构 computed()；新字段串同一条 v-else-if 链。

## 5 业务口径
- 「空头权益」= 后台有表单、C 端有入口、服务端零消费点（配了等于没配）→ 对每个权益列 grep services/routes 消费点，0 命中即空头。雷达推送配额数＝"已占真实通道(1/2)条数"非 status='sent'。
- 访客标签口径（2026-10-18 起）：标签只表行为（已交换名片>观看视频>回访客>新访客），意向强弱唯一看 score/level，互不越界。
- 名片归属 TENANT_CARD_SCOPE_SQL 6 通道；身份四值 services/cardIdentity.js（individual 认证个人 / personal 未认证 / employee 员工 / enterprise 企业名片），**能力判据只读名册 `tenant_individuals`/`tenant_enterprise_employees` 的 status='active'，不读 identity**。
- 两口令别混：projects.invite_code（P 开头）= 租户绑定；tenant_enterprises.config.invite_code（ENT######）= 企业员工凭码加入。
- **一行控三能力**：tenant_individuals.status='active' 同时决定 ①集市上架 ②被交换资格（cardMarket.js /exchange/request 要求对方名册 active）③身份徽章——这是"认证≠集市"认知错位的根源。

## 6 租户会员套餐（权益矩阵模型）
- 单一事实来源：`benefit_catalog`（平台目录 20 项：type/app_scope/kind/unit/default/label，租户只能配已有 type）+ `member_level_app_benefits`（套餐×应用矩阵，UNIQUE(tenant_id,level_id,app_code)）+ `member_user` 身份。`member_package` 已退化为**套餐模板库**（总后台只管 name/price/duration_days/market_subject/enabled；运行时仅作新租户播种模板）；旧 `member_levels.benefits` JSON 是死数据（禁再消费/禁回写）。
- **购买唯一路径 = 租户会员等级**（productType=member_card → openCardByOrder）；老 A 路已下线。场席授予只认矩阵 `market.market_subject`（无行=不授予）；未入驻租户用户降级为引导文案。
- 播种：`ensureTenantDefaultLevels` 模板驱动（readPackageTemplate：name 作档位身份锚点、price×100 → buy_price、market_subject 进矩阵；缺失回落 TIER_PKG；enabled=0 不向新租户播种；存量不覆盖）。建租户 POST /projects 即时播种（try/catch 不阻断）。
- discount 归属=**租户定**（后台按档位×应用配）；语义=**百分比**（0=无折扣/10=九折/80=二折），旧折率×10 换算。HARD_CAPS（works500/videos50/collect500/lead1000/push5000）读取侧静默截断 + 写入侧 validateAppBenefits 整体拒绝，两层互补。积分公式 awardOrderPoints：⌊金额元×point_rate⌋+⌊金额元×rebate%⌋（单位分）；note 带订单号幂等；refundOrder 同步 clawback。
- 后台矩阵编辑器：编辑器=目录默认⊕矩阵覆盖，保存时**只 PUT 相对打开时有变化的应用**（快照脏比对），未动过的应用不物化覆盖。C 端 /member/status 的 appBenefits 按应用分组（'*' 挂所有应用；应用名取 solutions.name，无行回落 APP_NAME_FALLBACK）。

## 7 个人认证 / 入驻集市（2026-10 第26轮）
- 入驻模式 `card_market_settings.individual_join_mode` ∈ **code / purchase 两项**：code=兑换码成为租户成员；purchase=买会员套餐同时获得场席+认证（grantMarketSubjectByPurchase），会员过期只删集市条目+回落 is_public，不动 status。**曾误加第三项 apply（自助申请）后被用户否决，已回退**。
- 管理端直操作三端点（customer.js）：`POST /card/manage/:id/certify`（跨租户 403、双配额、platform_user 绑 tenant + identity_type='individual'，source='admin'）、`POST /card/manage/:id/market`（必须先认证；无 settings 行=开启；audit_mode=manual→pending 否则 approved；同步 is_public）、`GET /card/manage/:id/oplogs`（target_type='card_manage'）。
- 认证/入驻入口统一落在**名片管理**（页面级双主 Tab：名片 / 企业入驻；兑换码按钮在 tab 行右侧），"入驻管理"页已下线（路由改 redirect）。
- `/api/customer/*` 走 requireAuth+requireTenant（JWT，租户后台）；`/api/card-market/*` 走 comboAuth（JWT 或 card_token）；两域不可混用，用错一律 401/403。租户 ID 只来自认证上下文，禁客户端传参。

## 8 配色 / 几何 / 令牌
- 明暗唯一裁决口 templateTheme.js 的 heroForeground，禁多判据并行。cardDetail 全文件禁 --primary 漂移令牌（注释里也不能写，测试按整文件文本扫描）；品牌色一律 var(--design-primary) 不带兜底。
- 新页面必过 tokenAudit：破基线靠映射既有令牌、不许上调；去掉 var(--primary,#hex) 裸 fallback；按"写法种类"计数，rgba 计 occurrences。常用映射：rgba(0,0,0,.55)→--bg-mask、z-index 裸值→--z-popup、#fff→--white。z-index 分层 --z-content(10)/--z-sticky(100)/--z-popup(1000)，卡片内浮层误用 --z-popup 会盖过全屏弹窗。
- 两端各写 CSS = 必然漂移：parity 三纪律（正则提取/剥注释/比实际生效值）；单测全绿≠视觉正确，CSS 几何须无头实测。

## 9 登录与跳转
- 🔴「登录跳两次」通用解法：进入流程抽成可重入函数，未登录当页放登录浮层，登录成功原地重入 → 0 次跳转；只有新用户/没名片才跳一次 create。动作类守卫返回 Promise，登录成功自动继续原动作。
- 🔴 #312-18c 起守卫与浮层是共享基建禁页面再抄：utils/loginGate.js useInlineLogin + components/LoginGateModal.vue。card 包全部页面零登录跳转；退出登录原地翻态不 reLaunch。myCard 未登录态例外：整页空态内联 <LoginGate>。
- 登录请求唯一出处 utils/inlineLogin.js（fetchLoginCode/performWxLogin/mustCreateCard），两侧都不许再出现 cardApi.wxLogin(。三条易漏：H5 模拟码分支、默认租户兜底、登录后 resetBrandCache。
- 登录页仍是冷启动首页（onShow 按装修首页 reLaunch，人为进入带 manual=1）；reLaunch 延到 onReady 之后。onShow 别无脑弹走：只在"已加载过内容且登录态掉了"才补弹浮层。模板 ref 不带 .value；MP 新组件查齐 components/X.{js,json,wxml,wxss} + 页面 json usingComponents + wxml 标签三处。

## 10 需求解读 / 静默失败
- 「取消 A 的实现方式」≠「取消 A 的概念」→ 先确认 X 是做法还是概念。「置灰」先问灰的是哪个字段语义；存量空值用"显示归一"不改数据。用户提示常含答案；"测量会过期"先证伪再下药。
- getCurrentInstance() 只能在 setup 顶层调（事件处理器/await 后一律 null → 真机 MP 炸）。整页空数据：computed 用了未 import 函数（setup 抛错 → 静态模板在、数据全灭、themeStyle 失效露 fallback 色）。audit:imports 已覆盖 vue 具名导出。

## 11 微信开放接口（小程序码 / 登录）
- 🔴 真小程序码前提：小程序必须上传过代码，否则一律 41030（release/trial/develop 全拒）→ 回落网页码。排查两步：①先拿 token（appid+secret 对不对）②再对候选 page 发码。
- 三级通道（与 code2session 同口径）：第三方平台已授权→WxComponentService；自运营（仅 AppID+AppSecret）→standalone；都没有→H5 兜底。**渠道查询不得过滤 auth_status**。env 级联 release→trial→develop；访客码必须 release。失败必须打日志并透出 reason（no_page/no_channel/failed），弹层要告诉租户"没上传代码"。
- 🔴 TAT 连 base64 编码的外网域名也拦 → TAT 只取密钥/状态，网络请求放沙箱本地发。wxa/get_page 只限第三方平台（自运营得 86000）→ 用"候选 page 逐个发码"试探法替代。
- 🔴 getwxacodeunlimit 的 check_path 对已发布账号整体失灵（显式 page 全 41030，无 page 默认主页却能过校验）。两段式：首轮照常；全 41030 后用"真实 scene + 无 page + 校验"探测是否真已发布（不过=真没代码→回落 H5 不发死码），通过才 check_path:false 补一枪 release。getwxacode 不校验 path，不能用来验证页面存在；scene 必填非空（空→40169）。
- 🔴「devtools 模拟器空白、真机有内容」= 请求级失败（/api/channel/init 拿不到 tenant 就整页没数据）。排查：① devtools 勾"不校验合法域名/web-view/TLS/HTTPS 证书"（MP 端 API_HOST 硬编 https://zero.nshop.mobi）② project AppID 别用测试号（touristappid → configured:false）。curl /api/channel/init?appid= 真 appid 应回 customerId>0。

## 12 密钥与支付（安全红线）
- 密钥落库分界线是「归属」非「类型」：租户自己的（AppSecret/upload_key RSA 私钥/商户号）→ 后台填 + encryptSecret + maskSecretValue 回显；平台自己的 → 只走 env/服务器文件永不入库。STORAGE_KEY 首部署固定并备份。
- 嵌套字段加密盲区：encryptConfigSecrets 只扫 section 顶层 → payment.wechat.apiV3Key 会明文落库。脱敏占位符用 includes('\*\*\*\*') 非 startsWith；语义统一 crypto.js mergeSecretInput，读密钥必 readSecret()。
- 金额全链路单位「分」：建单 yuan2fen()，调微信前不得再 ×100。回调 URL 只 https://域名/api/payment/notify/wechat（一层 notify）；验签基于 rawBody。只有压根没配才回落 mock；配了真实 mchId 不全 → 直接报错，/mock-pay 必 403。

## 13 线上排查通道 / 主包质检
- 服务器 /opt/app（deploy 分支），systemd panorama.service，cwd /opt/app/server，实际命令 `node --env-file-if-exists=.env src/index.js`（旧 grep 模式 'server/src/index.js' 恒 0 匹配害误判过）。Lighthouse lhins-bvw7p0gb（ap-guangzhou）。
- 沙箱直连 HTTPS zero.nshop.mobi(443) 校验；:3000 直连被拦。远程部署：fetch → reset --hard origin/deploy（校验 HEAD）→ 重启。TAT AccessDeny：命令含外网域名/IP 被拦 → 服务器侧运维用 TAT（git/systemctl/ps），HTTP 校验走沙箱 HTTPS。describe_instances 用 InstanceIds 数组；execute_command 用 InstanceId 单数。
- 🔴 **admin 线上资源路径是 `/admin-assets/assets/*` 不是 `/admin/assets/*`**（app.js `app.use('/admin-assets', express.static(publicDir/admin))`）。用错路径 SPA 兜底仍返 200、body 为空 → grep 全 0，伪装成"产物没上线"。card/mall H5 才是 `/card/assets/*`。
- C 端 /api/card/* 用租户后台 token 一律 401（鉴权不同域）；公开只读免登录：GET /api/card/cards/:id。验接口用正确 HTTP 方法，拿真不存在路由确认 404 基准。
- 「主包内不应有主包未用的 JS」= 只有分包用的模块进了主包 → 源文件挪进分包目录连带改 import。挪文件必查：①分包专属依赖一起挪 ②生成脚本 OUT_FILE 写死旧路径 ③测试断言钉死旧路径。查依赖别只 grep ^import → audit:imports。主包体积排除分包目录再算。
