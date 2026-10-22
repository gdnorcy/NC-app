# 360全景 长期记忆（元规则）
> 只放元规则。细节在每日日志与 refs/。

## 装修组件
- 改一处同步三处：componentRegistry.js→ComponentRender.vue(无 v-if 兜底)→PageEditor.vue(schema+control)；C 端 DesignPage.vue 独立重复；server COMP_TYPES 白名单。
- 间距 100% 由组件自身 marginTop 决定→「不真实」先数壳层数删壳；选中环独立绝对定位+pointer-events:none。
- 链接模型单一事实来源 utils/compLinkModel.js：'internal' 是一等类型；schema default 须=options[0].value；'internal' 与 '' 两写法都归一。
- 「对齐+偏移」=基准+叠加：偏移用 position:relative+left（禁 margin-left 覆盖 auto、禁 transform 造层叠上下文）；boxOffsetX/offsetX 两 key 都认。
- canvas 显示尺寸≠位图（CSS 按容器实测宽）；横向 scroll-view 内 canvas 不跟手→导出 <image>，屏外 canvas 用 fixed+left:-9999px（禁 display:none）。禁对 computed() 返回值解构；新字段串同一条 v-else-if 链；面板字段渲染三处同时认（共享 utils/*.js）。

## 真机与跨端
- WXSS 不支持 * 选择器（uni/H5 不报，微信开发者工具才炸）；图标必须 base64 内联禁 import PNG（hash 漂移真机落空）；SIcon MP 端预生成 PNG 颜色写死→用真实 view 画，禁 ::before/after。
- uni image 非替换元素无内在尺寸→限高须给显式盒高（width/height:auto 塌缩成0）。
- H5 正常≠MP 正常：父 wxss 穿不透子组件根→传 prop 出内联；MP 无 atob/Buffer→uni.base64ToArrayBuffer；消费 var(--design- 的页必绑 themeStyle，SIcon/canvas 喂真实 hex。

## 配色/几何/令牌
- 明暗唯一裁决口 templateTheme.js 的 heroForeground（品牌渐变→--brand-hero-ink；白卡浅底→--brand-ink），禁多判据并行。
- 新页面必过 tokenAudit：破基线靠映射既有令牌、不许上调；var(--primary,#165dff) 裸 hex fallback 去掉；tokenAudit 按「写法种类」计数（复用 --z-popup 靠 DOM 顺序定层级）。
- 两端各写 CSS=必然漂移：parity 三纪律（正则提取/剥注释/比实际生效值）；单测全绿≠视觉正确，CSS 几何须无头实测。

## 需求解读
- 「取消 A 的实现方式」≠「取消 A 这个概念」→先确认 X 是做法还是概念。
- 「置灰」先问灰的是哪个字段语义；存量空值用「显示归一」不改数据。
- 用户提示常含答案；「测量会过期」先证伪再下药（轮询稳定仍错→非时序）。

## 静默失败
- getCurrentInstance() 只能在 setup 顶层调（事件处理器/await 后调一律 null→真机 MP 炸），见 CardTabBar.vue。
- 整页空数据：computed 用了未 import 函数（setup 抛错→静态模板在、数据全灭、themeStyle 失效露 fallback 色）→ audit:imports 现已覆盖 vue 具名导出（原只查本地模块）。冷启动 reLaunch 竞态：onShow 跳转须等 onReady。

## 构建与部署
- 分支：源码落 main（不带产物）；deploy = merge --no-ff main + 重建产物；git push -f origin deploy；部署后 checkout main。
- 产物必须 git add -f（限 server/public/{card,mall}、server/mini-template/mp-weixin，别用 -A）；普通 add 静默跳过新 chunk→主 chunk 404 白屏。SPA 兜底让 404 返 200→验证比 md5 不能只看状态码。
- 🔴 **main HEAD 里跟踪着陈旧产物**（.gitignore 后补，管不住已跟踪文件；669 个，历次既有状态）：切 deploy 报「local changes would be overwritten」阻塞 → **mv 新产物到 /tmp → `checkout -f deploy` → merge → 从备份换回 → `add -f`**；不能从 main 移除跟踪（未来 merge 会 modify/delete 冲突破坏 deploy 产物）。回 main 后 `git checkout -- server/mini-template server/public/card server/public/mall` 恢复陈旧产物保持干净。
- 顺序铁律：构建→cp -a 备份 /tmp→才能 git checkout（checkout 会把新产物还原成旧版，致 card/card/ 嵌套）。切 deploy 前先 git checkout -- server/mini-template/mp-weixin。
- vitest 不编译 SFC（setup 同标识符声明两次只有 uni build 照得出）；报 "no tests" 非通过（文件用 it 却导 test 静默跳过）。server 全量 node --test 易 OOM(137)→awk 分 4 批。

## 线上排查通道
- 服务器 /opt/app（deploy 分支），systemd panorama.service，cwd /opt/app/server。Lighthouse lhins-bvw7p0gb（ap-guangzhou）；BT 1.12.250.126:8888。
- 沙箱直连 HTTPS zero.nshop.mobi(443) 校验；:3000 直连被拦。远程部署：fetch→reset --hard origin/deploy(校验 HEAD)→重启。
- TAT AccessDeny：命令含外网域名/IP(curl 127.0.0.1)被拦→服务器侧运维用 TAT（git/systemctl/ps，禁 IP/网络），HTTP 校验走沙箱 HTTPS。describe_instances 用 InstanceIds 数组；execute_command 用 InstanceId 单数。判构建成功禁 cmd|tail→用 echo $?。
- C 端 /api/card/* 用租户后台 token 一律 401（鉴权不同域）；验接口用正确 HTTP 方法，拿真不存在路由确认 404 基准。公开只读免登录：GET /api/card/cards/:id。

## 小程序主包质检
- 「主包内不应有主包未用的 JS」=只有分包用的模块进了主包→源文件挪进分包目录连带改 import。挪文件必查：①分包专属依赖一起挪 ②生成脚本 OUT_FILE 写死旧路径 ③测试断言钉死旧路径。查依赖别只 grep ^import→audit:imports。主包体积排除分包目录再算。

## 密钥与支付（安全红线）
- 密钥落库分界线是「归属」非「类型」：租户自己的(AppSecret/upload_key RSA 私钥/商户号)→后台填+encryptSecret+maskSecretValue 回显；平台自己的→只走 env/服务器文件永不入库。STORAGE_KEY 首部署固定并备份。
- 嵌套字段加密盲区：encryptConfigSecrets 只扫 section 顶层→payment.wechat.apiV3Key 会明文落库。脱敏占位符用 includes('****') 非 startsWith；语义统一 crypto.js mergeSecretInput，读密钥必 readSecret()。
- 金额全链路单位「分」：建单 yuan2fen()，调微信前不得再×100。回调 URL 只 https://域名/api/payment/notify/wechat（一层 notify）；验签基于 rawBody。只有压根没配才回落 mock，配了真实 mchId 不全→直接报错，/mock-pay 必 403。真实支付前提：库里 openid 须真机登录产生。

## 业务口径 / 测试坑
- 名片归属 TENANT_CARD_SCOPE_SQL 6 通道；名片身份 services/cardIdentity.js（四值，能力判据只读名册不读 identity）。SaaS 每客户一小程序走微信第三方平台代开发；库同步：backup 快照→留 admin 凭证→户口重置→ghfast 镜像传→停服换库。
- openssl 生成证书须 stdio pipe+全程 -out+真 X.509；supertest 按字节签名须 .send(rawString)；node:sqlite 用 DatabaseSync。macOS grep BSD -E 裸 |、压缩 JS 单行 grep -c 恒1→grep -o|wc -l。
