# B 系列设计令牌化 · 摸底报告

> 2026-10-25 摸底。口径与 `src/styles/tokenAudit.test.js` 完全一致：只扫 `.vue` 的 `<style>` 块
> 与 `.scss`（剥注释与 `url()`），JS 与内联 style 不计（SIcon 焙烧链路硬约束不能用 var()）。
> 共扫描 **69 个文件**。基线数据来自 tokenAudit 运行实数（44 测试全过）。

## 0. 结论速览

| 项 | 裸值残留 | 触及文件 | 可机械映射 | 需设计决策 | 风险 |
|---|---|---|---|---|---|
| B-2 灰阶/tint/黑白 hex | **150 处** | 35 | ~150（建映射表后） | 0-2 个新灰令牌 | 低 |
| B-3 font-size | 444 处/41 种 | 64 | 209 处/8 种 | 235 处（30rpx 等） | 低（机械段） |
| B-3 border-radius | 338 处/44 种 | 64 | 28 处/5 种 | 310 处（含 50% 圆×94） | 中 |
| B-3 box-shadow | 66 处/42 种 | 27 | 0 | 全部（一案一议） | 中高 |
| B-3 z-index | 88 处/20 种 | 37 | 0 | 62 处（999/99/30…） | 中高（层叠顺序） |
| B-4 px→rpx | 269 处/34 种 | 30 | 145 处（×2） | 124 处 1px 发丝线 | 中高 |

**建议顺序：B-2 → B-3 机械段（font）→ B-3 决策段（radius/shadow/z，需真机）→ B-4（需真机，先定 1px 策略）。**
每完成一批即下调 tokenAudit 的 BASELINE 常量（测试注释已约定此流程）。

## 1. B-2 灰阶色值收敛（#171）

裸 hex 共 567 处/128 种，但其中 **309 处/38 种是 var() 兜底位**（ sanctioned 模式，如
`var(--design-primary, #165dff)`×124、`var(--white,#fff)`×26）——不计入收敛目标。

扣掉兜底后真正裸值 258 处：

| 类别 | 处数 | 种数 | 代表值 | 处置 |
|---|---|---|---|---|
| 灰阶（max-min≤12） | ~150 | 47 | #f7f9fa×19 #dcdfe6×16 #333333×12 #f0f0f0×10 #999999×9 | 收敛令牌（部分需新增） |
| tint 浅底（≥230 且近白） | 39 | 14 | #e8f3ff×11 #fff8e6×6 #f0f7ff×4 #fdecec×3 | 收敛/并入既有 tint 类 |
| 黑 | 25 | 2 | #000×14 #000000×11 | → --black（新增）或保留 |
| 白 | ~13 | 2 | #fff×33（26 在兜底位） | → --white |
| 品牌彩色 | ~155 | 63 | #165dff #00b42a #2667ec #4080ff | **既定四域 palette，不动** |

集中文件：DesignPage.vue(28)、SuperFormRender.vue(19)、myCard.vue(13)、cardDetail.vue(12)、
panorama/index.vue(6)、cardEdit.vue(5)。

映射表需先定案（哪些灰 → 既有 --t1/--t2/--t3/--decor/--border，哪些值得新令牌），
建议新令牌不超过 2 个（一个中灰、一个深灰），否则失去「收敛」意义。

## 2. B-3 阴影/圆角/字号/间距/z-index（#172）

### font-size（1271 处总量，已令牌化 827）
- 裸 444 处/41 种；其中 **209 处/8 种的值正好等于现有 --fs-\***（纯机械替换）
- 未覆盖 top：30rpx×76、34rpx×23、40rpx×23、18rpx×13、25rpx×12、23rpx×12、48rpx×11、56rpx×9
- 集中：DesignPage(146)、cardDetail(91)、SuperFormRender(65)、distribution(60)、visitors(51)

### border-radius（698 处总量，已令牌化 360）
- 裸 338 处/44 种；仅 28 处/5 种等于现有令牌
- `50%`×94 是圆形（非令牌对象，保留）；20rpx×43、40rpx×18、32rpx×17、6rpx×13 等需并入半径阶梯
- 集中：DesignPage(100)、SuperFormRender(54)、cardDetail(45)、distribution(30)

### box-shadow（74 处总量，已令牌化仅 8）
- 裸 66 处/42 种，**0 处等于现有令牌**——全部是一案一议的自定义阴影
- top：`0 8rpx 28rpx rgba(20,40,70,.08)`×10、`0 4rpx 24rpx rgba(0,0,0,.04)`×9、`0 4rpx 16rpx …`×4
- 另有 `var(--shadow, 0 4rpx 14rpx …)` 兜底写法×6（fallback 值不一，收敛时统一）
- 集中：cardDetail(12)、CardTabBar(6)、DesignPage(6)、create(6)
- 处置建议：先按「 elevations 阶梯」归并少数几款（如卡片/浮层/弹窗三档），逐款肉眼比对后再替

### z-index（114 处总量，已令牌化 26）
- 裸 88 处/20 种：`1`×26、`2`×22 是局部层叠上下文（合法，保留）；
  **`999`×9、`99`×8、`30`×4、`20`×2 等是 legacy 弹层/悬浮值**——候选映射 --z-popup(1000)/--z-sticky(100)
- 🔴 层叠顺序风险：记忆里有「卡片内浮层误用 --z-popup 会盖过 900+ 全屏弹窗」的坑，
  且 999→1000、99→100 会改变既有相对次序——**必须先 grep 每个 999/99 的所在层叠上下文，
  列依赖表再动，不能批量 sed**
- 集中：cardDetail(27)、DesignPage(23)、CardTabBar(8)、cardEdit(8)

## 3. B-4 px→rpx 全量迁移（#173）

- px 合计 269 处/34 种/30 文件
- **124 处是 1px 发丝线**（SuperFormRender 表单控件边框为主）——rpx 是屏幕相对单位，
  1px→2rpx 在窄屏会变粗、`0.5rpx` 部分端不支持。建议策略：边框发丝线保留 1px（业界惯例），
  或全站统一转 rpx 后接受视觉变化，需真机逐屏验
- 145 处非 1px 可机械 ×2（10px→20rpx 等）：top 值 10px×21、3px×18、12px×12、14px×11、8px×9
- 集中：SuperFormRender(133)、DesignPage(37)、member(17)、visitors(9)、cardDetail(8)、utility.scss(7)

## 4. 排期建议

1. **B-2（#171）**：先出映射表（半天）→ 35 文件机械替换 → tokenAudit 基线 574→~430 →
   全量测试。低风险，可立即开工。
2. **B-3 机械段**：font 209 处/8 种 + radius 28 处/5 种，纯值相等替换，随 B-2 同批交付。
3. **B-3 决策段**：radius 阶梯归并、shadow 三档化、z-index 依赖表——需真机回归，单独一轮。
4. **B-4**：先定 1px 策略（保留 or 全转），再机械迁移 145 处——需真机回归，最后一轮。

> 摸底脚本留存：`/tmp/b-series-survey.js`（分类+映射）、`/tmp/b-series-survey3.js`（爆炸半径），
> 改阈值可复跑。
