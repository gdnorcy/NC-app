#!/usr/bin/env bash
# ============================================================================
# capture-mine.sh —— 抓取「我方」超级表单设计器 29 组件属性面板截图
# 依赖：agent-browser（已安装 + Chromium 已下载），daemon 已登录客户后台
#
# 关键机制（实测确认）：
#   1) 设计器不是独立路由！入口是列表页 #/apps/super-form → 点第一行「编辑」
#      → SuperForm.vue 内联切换为 SuperFormDesigner。
#   2) 组件库项支持「点击添加」（@click=addComponent），每项 title =
#      "组件名（点击或拖入画布）"，故用 CSS 属性选择器精准点击：
#         div.sf-pal-item[title="单行文本（点击或拖入画布）"]
#   3) 添加后右栏自动切到该组件属性（panelMode='props'），容器 .sf-props，
#      用 `screenshot ".sf-props" <path>` 定位截图（selector 是位置参数！）。
#   4) 面板可能超过一屏：先 `set viewport 1280 2200` 加高视口再截。
#
# 使用步骤：
#   1) 起本地服务：
#        - vite dev: http://127.0.0.1:5173 （HMR；测试账号 tenant1/admin123）
#        - 或生产:   http://127.0.0.1:3000/customer.html
#   2) 在 agent-browser 会话里登录（daemon 保留登录态）：
#        agent-browser open "http://127.0.0.1:5173/customer.html#/login"
#        agent-browser snapshot -i          # 找到 账号/密码/登录 的 ref
#        agent-browser type @e3 "tenant1"
#        agent-browser type @e4 "admin123"
#        agent-browser click @e2            # 登录按钮（text= 匹配不可靠，用 ref）
#   3) 跑本脚本（复用已登录 daemon；自动进列表→点编辑→逐组件截图）：
#        SF_BASE="http://127.0.0.1:5173" bash capture-mine.sh
#
# 产物：docs/对标截图/超级表单/我方面板/<type>.png  （29 张）
# ============================================================================
set -uo pipefail

if [[ -z "${AGENT_BROWSER_BIN:-}" ]]; then
  if command -v agent-browser >/dev/null 2>&1; then AB=agent-browser
  elif [[ -x /tmp/mediakit/npm-global/bin/agent-browser ]]; then AB=/tmp/mediakit/npm-global/bin/agent-browser
  else AB=agent-browser; fi
else AB="$AGENT_BROWSER_BIN"; fi
BASE="${SF_BASE:-http://127.0.0.1:5173}"
LIST_URL="${SF_LIST_URL:-$BASE/customer.html#/apps/super-form}"
# 注意：agent-browser 的截图路径是相对「daemon 进程 CWD」解析的，必须用绝对路径！
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${SF_OUT_DIR:-$SCRIPT_DIR/我方面板}"
PROPS_SEL="${SF_PROPS_SELECTOR:-.sf-props}"
CLICK_WAIT="${SF_CLICK_WAIT:-0.6}"           # 每次点击后等待(s)，保证面板渲染
VIEW_H="${SF_VIEW_H:-2200}"                  # 视口高度，保证长面板尽量完整

mkdir -p "$OUT_DIR"

# 组件类型 -> 组件库显示名（对应 SuperForm/components.js 的 COMPONENT_LABEL）
# 注意：macOS 自带 bash 3.2 不支持 declare -A，改用 case 函数（可移植）
label_for() {
  case "$1" in
    text) echo '单行文本' ;;        textarea) echo '多行文本' ;;
    image) echo '图片上传' ;;        radio) echo '单项选择' ;;
    checkbox) echo '多项选择' ;;     select) echo '下拉选择' ;;
    date) echo '日期' ;;             number) echo '数字' ;;
    time) echo '时间' ;;             location) echo '定位' ;;
    attachment) echo '附件' ;;       sms) echo '短信认证' ;;
    agreement) echo '协议' ;;        rate) echo '评分' ;;
    filedownload) echo '文件下载' ;; phoneauth) echo '手机号授权' ;;
    carplate) echo '车牌号' ;;       submit) echo '提交按钮' ;;
    pagebreak) echo '分页' ;;        backdesc) echo '后台描述' ;;
    realtime) echo '实时动态' ;;     pay) echo '表单支付' ;;
    swiper) echo '轮播图' ;;         bigimage) echo '大图模块' ;;
    title) echo '标题' ;;            richtext) echo '富文本' ;;
    blank) echo '空白块' ;;          line) echo '辅助线' ;;
    video) echo '视频' ;;            *) echo '' ;;
  esac
}
ORDER=(text textarea image radio checkbox select date number time location attachment sms agreement rate filedownload phoneauth carplate submit pagebreak backdesc realtime pay swiper bigimage title richtext blank line video)

echo ">>> 加高视口到 1280x${VIEW_H}（保证长面板完整）"
"$AB" set viewport 1280 "$VIEW_H" >/dev/null 2>&1 || echo "   (视口设置失败，继续用默认)"

echo ">>> 打开列表页: $LIST_URL"
"$AB" open "about:blank" >/dev/null 2>&1 || true   # 强制真实导航（同 URL open 不会重载，设计器态会残留）
"$AB" open "$LIST_URL" >/dev/null 2>&1 || { echo "打开失败"; exit 1; }
"$AB" wait --load load >/dev/null 2>&1 || true
sleep 2

echo ">>> 点击第一行「编辑」进入设计器"
REF=$("$AB" snapshot -i | grep -m1 'button "编辑"' | sed -E 's/.*\[ref=(e[0-9]+)\].*/\1/')
if [[ -z "${REF:-}" ]]; then echo "!! 未找到「编辑」按钮——请确认 daemon 已登录且列表有表单"; exit 1; fi
"$AB" click "@$REF" >/dev/null 2>&1 || { echo "点击编辑失败"; exit 1; }
sleep 2

# 校验设计器已渲染（找任意组件库项）
if ! "$AB" screenshot ".sf-props" /tmp/_sf_probe.png >/dev/null 2>&1; then
  echo "!! .sf-props 未渲染——设计器未打开或登录态丢失"; exit 1
fi
rm -f /tmp/_sf_probe.png

total=${#ORDER[@]}
ok=0; miss=0
i=0
for t in "${ORDER[@]}"; do
  i=$((i+1))
  label="$(label_for "$t")"
  sel="div.sf-pal-item[title=\"${label}（点击或拖入画布）\"]"
  printf '[%2d/%d] %-8s %s  ' "$i" "$total" "$t" "$label"
  if ! "$AB" click "$sel" >/dev/null 2>&1; then
    echo "✗ 组件库项未找到"; miss=$((miss+1)); continue
  fi
  sleep "$CLICK_WAIT"
  out="$OUT_DIR/$t.png"
  if "$AB" screenshot "$PROPS_SEL" "$out" >/dev/null 2>&1; then
    echo "✓ $out"; ok=$((ok+1))
  else
    echo "✗ 截图失败"; miss=$((miss+1))
  fi
done

echo
echo ">>> 完成：成功 $ok 张 / 失败 $miss 张 -> $OUT_DIR"
echo ">>> 注意：本次点击只在浏览器内存里堆组件，未点「保存页面」，服务端表单不会被污染。"
echo ">>> 如需关闭 daemon：agent-browser close"
