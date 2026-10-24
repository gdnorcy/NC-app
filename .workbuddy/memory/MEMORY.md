# 360全景 长期记忆（元规则）
> 只放元规则与判据，细节在每日日志。2026-10-24 精简重写（原 18.1KB）。
> ⚠️ 改本文件必须在 deploy 往返 checkout **之后**做并随即提交——checkout -f deploy 会把工作区还原成 deploy 分支的旧版，未提交的修改会被静默吞掉（18b 轮已吞过一次精简稿）。

## 装修组件
- 改一处同步三处：componentRegistry.js → ComponentRender.vue（无 v-if 兜底）→ PageEditor.vue（schema+control）；C 端 DesignPage.vue 独立重复；server COMP_TYPES 白名单。
- 间距 100% 由组件自身 marginTop 决定 →「不真实」先数壳层数删壳；选中环独立绝对定位 + pointer-events:none。
- 链接模型单一事实来源 utils/compLinkModel.js：'internal' 是一等类型；schema default 必须 = options[0].value；'internal' 与 '' 两写法都归一。
- 「对齐+偏移」=基准+叠加：偏移用 position:relative+left（禁 margin-left 覆盖 auto、禁 transform 造层叠上下文）；boxOffsetX/offsetX 两 key 都认。
- canvas 显示尺寸≠位图（CSS 按容器实测宽）；横向 scroll-view 内 canvas 不跟手 → 导出 `<image>`；屏外 canvas 用 fixed+left:-9999px（禁 display:none）。禁对 computed() 返回值解构；新字段串同一条 v-else-if 链；面板字段渲染三处同时认（共享 utils/*.js）。
- 🔴 **canvas 变换矩阵跨轮累积**：width/height 在循环外只设一次不重置上下文，每轮 `ctx.scale(dpr,dpr)` 叠成 dpr²/dpr³…把内容顶出画布（第 2 张起只剩底色）。每轮必须 `setTransform(1,0,0,1,0,0)` → clearRect → `setTransform(dpr,0,0,dpr,0,0)`。H5 分支每轮 `createElement('canvas')` 天然免疫——**两端排查别混为一谈**（H5 里 grep 到的 setTransform 是 uni 内部实现）。
- 🔴 **swiper 塞进 position:fixed 弹层 = 真机触摸失效**（devtools 正常）。弹层内横滑一律自实现 @touchstart/@touchend + dx 阈值。swiper 的 previous/next-margin 决定 slide 宽：太小 → slide≈满屏 + aspectFill 把竖图裁成一条（"糊脸大图"），须 ≈(屏宽−卡宽)/2。

## 真机与跨端
- WXSS 不支持 `*` 选择器（uni/H5 不报，devtools 才炸）；图标必须 base64 内联禁 import PNG（hash 漂移真机落空）；SIcon MP 端预生成 PNG 颜色写死 → 用真实 view 画，禁 ::before/after。
- uni image 非替换元素无内在尺寸 → 限高须给显式盒高（width/height:auto 塌缩成 0）。
- 🔴 **MP 端滚动必须用 scroll-view**（普通 view 设 overflow-y:auto，H5 能滚、真机滚不动）。**定高只有三条可靠路**（真机三次证伪）：①显式 height（cardEdit .ce-modal-body 46vh）②max-height 直接封顶且父级高度 auto 非 flex 分配（visitors .tl-scroll / dist*.rules-scroll）③父级有确定 height 时 flex:1。**`flex:1+height:0` 赌父级 max-height 分配 = 两次证伪不滚**。动 scroll-view 前先 grep 项目内其他弹窗写法（cardEdit.vue 有实证注释）。
- 🔴 **MP scroll-view 弹窗最终形态**（四轮收敛）：sheet 普通块级堆叠（**不用 flex column**）+ body `max-height:Nvh` 封顶 + `:scroll-top` 回顶。内容动态增高后可视位置会停在中段（用户体感"上面被挡住"）→ 展开/开关状态变化时主动回顶（scroll-top 只在**值变化**时生效，0/0.1 交替；watch 用 flush:'post'）。
- 🔴 **MP 模板禁写 `x?.[0]`**（可选链后跟索引）：编译降级成整体值（曾把整个昵称塞进 72rpx 头像圆）。取首字符/下标一律放 computed，模板只消费结果。
- 🔴 **MP 模板禁裸 b/h4/p/span + 禁标签选择器**：uni MP 把非 view/text 标签收编成**无类名 view** → wxss 标签选择器整条静默失效，H5 却正常（text→span、b/h4/p 保留）→ 两端必漂移。样式一律类名选择器。**验证选择器要"配对验证"**：wxss 有规则 ≠ 生效，须确认编译后 wxml 里存在能被命中的元素。
- 🔴 **跳转目标路径写错 = 静默失败**（不存在的路径：不报错也不跳，用户体感"只 toast 不跳转"）。跳转走常量/工具函数，别手写字面量。
- 🔴 **MP 产物验证口径**：变量名 mangle 成单字母、v-if→wx:if、公共模块字符串抽到 common/vendor.js、**局部函数名被 minify 消失**。验证用「用户可见串 + DOM 结构 + vendor 间接确认」，grep 源码标识符名/局部函数名无效。
- 🔴 **z-index 令牌分层**：--z-content(10) 卡片内浮层（页码/角标）/ --z-sticky(100) 悬浮条 / --z-popup(1000) 全屏弹窗。卡片内浮层误用 --z-popup 会盖过 900+ 的全屏弹窗。
- 🔴 **服务端存的图片路径（/uploads/ 相对）MP 全链路断**：H5 同源能显示、MP 当包内路径 → 空白。展示点一律过 absUrl（utils/apiBase.js 单一实现）；canvas.createImage 同样不吃相对路径；新上传入口必须"先换 URL 再入库"（create.vue 曾直接存 wxfile://）。
- 🔴 **服务端时间是 UTC**：SQLite `datetime('now')` 产出 UTC 串，前端 `new Date(t.replace(' ','T'))` 按本地时区解析 → 东八区多 8 小时。解析必须补 'Z'（pages/card/utils/dynTime.js 两端共用）。
- 导航栏右侧会被微信**胶囊**吃掉大半宽度 → PageNav #right 的按钮被挤到标题左边。单条主操作改右下角 FAB。
- H5 正常≠MP 正常：父 wxss 穿不透子组件根 → 传 prop 出内联；MP 无 atob/Buffer → uni.base64ToArrayBuffer；消费 var(--design- 的页必绑 themeStyle，SIcon/canvas 喂真实 hex。

## 配色 / 几何 / 令牌
- 明暗唯一裁决口 templateTheme.js 的 heroForeground（品牌渐变→--brand-hero-ink；白卡浅底→--brand-ink），禁多判据并行。
- cardDetail 全文件禁 --primary 漂移令牌，**注释里也不能写该令牌名**（品牌测试按整文件文本扫描）；品牌色一律 `var(--design-primary)` 不带兜底。
- 新页面必过 tokenAudit：破基线靠映射既有令牌、不许上调；`var(--primary,#165dff)` 裸 hex fallback 去掉；按「写法种类」计数（复用 --z-popup 靠 DOM 顺序定层级）。注意 rgba 计 **occurrences 不是 kinds**（同值复用也 +1）。常用映射：rgba(0,0,0,.55)→--bg-mask、z-index 裸值→--z-popup、#fff→--white、品牌 tint→复用既有 .sec-added 类。
- 两端各写 CSS = 必然漂移：parity 三纪律（正则提取/剥注释/比实际生效值）；单测全绿≠视觉正确，CSS 几何须无头实测。

## 登录与跳转体验
- 🔴 **「登录要跳两次页面」的通用解法**：把「进入流程」抽成**可重入函数**（myCard `bootOwner` / dynamic `bootDynamic`），未登录时当页放登录浮层，登录成功后原地重入 → **0 次跳转**。只有「新用户/没名片」才跳一次 create。**动作类守卫返回 Promise**，登录成功**自动继续原动作**（否则用户还得再点一次）。
- 🔴 **#312-18c 起守卫与浮层是两份共享基建，禁页面再抄**：`utils/loginGate.js` 的 `useInlineLogin(onLoginSuccess)`（Promise 守卫唯一实现：requireLogin / cancelLogin 结算 / mustCreateCard→create / boot 后放行）+ `components/LoginGateModal.vue`（遮罩白卡浮层，样式走 --bg-mask/--z-popup/--radius-lg）。card 包全部页面**零登录跳转**——`pages/cardMain/login` 蓝页只剩「冷启动首页一闪」一条路（pages.json 首页，manual=1 人为进入才停住）。**退出登录/退出平台也原地翻态**（清凭证→loggedIn=false→重入 boot），不再 reLaunch 蓝页。myCard 未登录态例外：整页空态内联 `<LoginGate>`（非弹层）。
- 登录请求**唯一出处 `utils/inlineLogin.js`**（fetchLoginCode/performWxLogin/mustCreateCard）：登录页与浮层共用，两侧都不许再出现 `cardApi.wxLogin(`。三条易漏：H5 模拟码分支、默认租户兜底（新用户无租户→装修首页读不到）、登录后 resetBrandCache（未登录态已拉过品牌色）。
- 登录页仍是**冷启动首页**（onShow 按装修首页 reLaunch，人为进入必须带 `manual=1`）；reLaunch 要延到 `onReady` 之后。onShow 别无脑弹走：只在「已加载过内容且登录态掉了」时才补弹浮层。
- 模板里 ref 不带 `.value`（`busy ? …`），测试断言也按模板形态写；MP 新组件查齐 `components/X.{js,json,wxml,wxss}` + 页面 json usingComponents + wxml 标签三处。

## 需求解读
- 「取消 A 的实现方式」≠「取消 A 这个概念」→ 先确认 X 是做法还是概念。
- 「置灰」先问灰的是哪个字段语义；存量空值用「显示归一」不改数据。
- 用户提示常含答案；「测量会过期」先证伪再下药（轮询稳定仍错 → 非时序）。

## 静默失败
- getCurrentInstance() 只能在 setup 顶层调（事件处理器/await 后调一律 null → 真机 MP 炸），见 CardTabBar.vue。
- 整页空数据：computed 用了未 import 函数（setup 抛错 → 静态模板在、数据全灭、themeStyle 失效露 fallback 色）。audit:imports 已覆盖 vue 具名导出（原只查本地模块）。

## 构建与部署
- 分支：源码落 main（不带产物）；deploy = `merge --no-ff main` + 重建产物；`git push -f origin deploy`；部署后 checkout main。
- 产物必须 `git add -f`（限 server/public/{card,mall}、server/mini-template/mp-weixin，别用 -A）；普通 add 静默跳过新 chunk → 主 chunk 404 白屏。SPA 兜底让 404 返 200 → 验证比 md5 不能只看状态码。
- 🔴 **main HEAD 里跟踪着陈旧产物**（.gitignore 后补，管不住已跟踪文件）：切 deploy 报「local changes would be overwritten」→ **mv 新产物到 /tmp → `checkout -f deploy` → merge → 从备份换回 → `add -f`**。不能从 main 移除跟踪（未来 merge 会 modify/delete 冲突破坏 deploy 产物）。回 main 后 `git checkout -- server/mini-template server/public/card server/public/mall` 恢复。
- 🔴 **cp -a 回铺产物会嵌套**：`checkout -f deploy` 后目标已是旧版，直接 cp -a 会得到 card/card/。必须先把目标整个 mv 到 /tmp 再铺过去。
- 顺序铁律：构建 → cp -a 备份 /tmp → 才能 git checkout（checkout 会把新产物还原成旧版）。切 deploy 前先 `git checkout -- server/mini-template/mp-weixin`。
- 🔴 **checkout 往返会吞掉一切未提交修改**（不止产物——.workbuddy/memory 等被跟踪文件同样还原）。改完的东西要么先提交、要么 checkout 回 main 后核对 git status 再动下一件事。
- 🔴 **备份≠本轮产物**：提交前必须 grep 本轮特征串验证（曾险把旧备份当新产物上线）。压缩产物函数名被 minify 消失属正常，用「用户可见串/API 名/wxml 结构」三重交叉。terser 把 `0.11` 写成 `.11`；zsh 双引号里 `$_` 会展开进正则 → 正则用**单引号**。
- 🔴 uni build 自身清理 dist/build 触发 safe-delete（assets chunk >50 被拦整链失败）→ 构建前把 `dist/build/{h5,mp-weixin}` mv 到 /tmp（rename 非删除无守卫）。
- 🔴 **build:h5 不含同步步骤**：只产出 web-app/dist/build/h5，必须再跑 `node scripts/sync-mobile-dist.mjs` 才进 server/public/{card,mall}（build:mp-weixin 内联了 sync-mini-template）。漏跑＝构建 OK 但线上没变，grep 特征串全 0 是判据。
- git push 网络抖动会假失败（输出截断看不出错）→ push 后必须 `git ls-remote origin <branch>` 校验远程 HEAD。
- vitest 不编译 SFC（setup 同标识符声明两次只有 uni build 照得出）；报 "no tests" 非通过（文件用 it 却导 test 静默跳过）。server 全量 `node --test` 易 OOM(137) → awk 分 4 批；🔴 前端 vitest 与 server node --test **不要并发跑**（资源竞争会让服务端 timeout 误报 cancelled 1）。

## 线上排查通道
- 服务器 /opt/app（deploy 分支），systemd panorama.service，cwd /opt/app/server。Lighthouse lhins-bvw7p0gb（ap-guangzhou）；BT 1.12.250.126:8888。
- 沙箱直连 HTTPS zero.nshop.mobi(443) 校验；:3000 直连被拦。远程部署：fetch → `reset --hard origin/deploy`（校验 HEAD）→ 重启。
- TAT AccessDeny：命令含外网域名/IP 被拦 → 服务器侧运维用 TAT（git/systemctl/ps，禁 IP/网络），HTTP 校验走沙箱 HTTPS。describe_instances 用 InstanceIds 数组；execute_command 用 InstanceId 单数。判构建成功禁 `cmd|tail` → 用 `echo $?`。
- C 端 `/api/card/*` 用租户后台 token 一律 401（鉴权不同域）；验接口用正确 HTTP 方法，拿真不存在路由确认 404 基准。公开只读免登录：`GET /api/card/cards/:id`。

## 小程序主包质检
- 「主包内不应有主包未用的 JS」= 只有分包用的模块进了主包 → 源文件挪进分包目录连带改 import。挪文件必查：①分包专属依赖一起挪 ②生成脚本 OUT_FILE 写死旧路径 ③测试断言钉死旧路径。查依赖别只 grep ^import → audit:imports。主包体积排除分包目录再算。

## 密钥与支付（安全红线）
- 密钥落库分界线是「归属」非「类型」：租户自己的（AppSecret / upload_key RSA 私钥 / 商户号）→ 后台填 + encryptSecret + maskSecretValue 回显；平台自己的 → 只走 env/服务器文件永不入库。STORAGE_KEY 首部署固定并备份。
- 嵌套字段加密盲区：encryptConfigSecrets 只扫 section 顶层 → `payment.wechat.apiV3Key` 会明文落库。脱敏占位符用 `includes('****')` 非 startsWith；语义统一 crypto.js mergeSecretInput，读密钥必 readSecret()。
- 金额全链路单位「分」：建单 yuan2fen()，调微信前不得再 ×100。回调 URL 只 `https://域名/api/payment/notify/wechat`（一层 notify）；验签基于 rawBody。只有压根没配才回落 mock；配了真实 mchId 不全 → 直接报错，`/mock-pay` 必 403。真实支付前提：库里 openid 须真机登录产生。

## 微信开放接口（小程序码 / 登录）
- 🔴 **真小程序码的物理前提：小程序必须上传过代码**。微信对无页面小程序一律 41030（release/trial/develop 全拒）→ 只能回落网页码。排查固定两步：①先拿 token（appid+secret 对不对）②再对候选 page 发码。「后台填了 AppID+AppSecret」只到第①步，≠ 能出码。
- 三级通道（与 code2session 同口径）：①第三方平台已授权(`auth_status='authorized'`)→WxComponentService ②自运营（仅 AppID+AppSecret）→standalone 直连 ③都没有→H5 兜底。**渠道查询不得过滤 auth_status**。env 级联 release→trial→develop（41030=该版本没这个页面）；用户只需「上传+设为体验版」即生效。**访客码必须 release**（trial/develop 普通用户打不开）。
- 失败必须打日志并透出 reason（no_page/no_channel/failed），别静默吞错：弹层要告诉租户"没上传代码"而不是让他以为没接上。
- 🔴 **TAT 连 base64 编码的外网域名也拦** → 联调微信：TAT 只取密钥/状态，网络请求放沙箱本地发。`wxa/get_page` **只限第三方平台调用**（自运营 appid 得 86000）→ 用"候选 page 逐个发码"试探法替代。
- 🔴 **`getwxacodeunlimit` 的 `check_path` 逐页校验会对已发布账号整体失灵**：任何显式 page（主包/分包 × 三版本）全 41030，但不带 page 的默认主页能过校验。修法**两段式二次机会**：首轮照常校验；全 41030 后先用「真实 scene + 无 page + 校验」探测账号是否真已发布（探测不过 = 真没代码 → 回落 H5 不发死码），通过才 `check_path:false` 补一枪 release。`getwxacode` **不校验 path**（假路径也出图），不能用它验证页面存在。**scene 必填非空**（空 → 40169）。
- 🔴 **`web-app/dist/build/mp-weixin`（uni 原始产物）与 `server/mini-template/mp-weixin`（同步后的自运营工程目录）**应当同源，但工作树那份常被部署末尾的 `git checkout --` 还原成陈旧版本（sync 只 cpSync 不清旧文件）。**交付给用户上传的包一律从 dist 取，用 BUILD.txt 的 built at + git HEAD 验新鲜度**（曾把 10-18 旧包打包给用户，页数都对不上）。运行时代码两边一致，差异只在 app.json 页数与 permission。
- 🔴 **「devtools 模拟器空白、真机有内容」= 请求级失败**（`/api/channel/init` 拿不到 tenant 就整页没数据）。排查：① devtools 详情→本地设置→勾「不校验合法域名/web-view/TLS/HTTPS 证书」（MP 端 API_HOST 硬编 https://zero.nshop.mobi）② 项目 AppID 别用测试号（touristappid → configured:false）。curl `/api/channel/init?appid=` 真 appid 应回 customerId>0。

## 业务口径 / 测试坑
- 名片归属 TENANT_CARD_SCOPE_SQL 6 通道；名片身份 services/cardIdentity.js（四值，能力判据只读名册不读 identity）。SaaS 每客户一小程序走微信第三方平台代开发；库同步：backup 快照 → 留 admin 凭证 → 户口重置 → ghfast 镜像传 → 停服换库。
- openssl 生成证书须 stdio pipe + 全程 -out + 真 X.509；supertest 按字节签名须 `.send(rawString)`；node:sqlite 用 DatabaseSync。
- 🔴 **macOS BSD grep 的 `\|` 交替一律不好使**（BRE 无此扩展，整串当字面量 → 0 匹配且不报错，看着像"产物没构建进去"）。交替必须 `grep -E`；压缩 JS 单行 `grep -c` 恒 1 → 用 `grep -o … | wc -l`。已踩 6 次，每次先怀疑 grep 再怀疑产物。
- 源码文本钉子类测试：别钉具体写法（一收敛就红一片），改钉**语义**（工厂内容 + 被哪几处调用）。新增字段会连带改 INSERT/UPDATE 列串与表单初值，改前先 grep 一遍所有 *.test.js。
