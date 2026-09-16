#!/usr/bin/env python3
"""
系统风格预览 1:1 外观精细对比工具（流程固化）
用法：
  python3 scripts/design-preview-diff.py --ref <菜鸟云原版截图> --mine <我方全屏截图> [--out 对比图.png]

流程：
  1. 按千分比坐标从两张截图裁剪 3 个预览窗（商品列表/商品详情/商品订单），统一 250x466
  2. 可选 --remap：把菜鸟云主题色系映射为我方当前配色，排除「配色不同」的干扰，
     暴露真正的结构/布局/细节差异（复刻质量只看结构差异）
  3. 输出三窗并排对比图 + 差异热图，并打印量化差异报告（差异像素占比 + 10x10 区域定位）
  4. 差异网格中持续出现的大块区域 = 需要人工核对的外观问题

坐标（截图千分比 0-1000）：
  ref（菜鸟云 Retina 2x 截图）：窗1 x[17,180] 窗2 x[206,341] 窗3 x[386,521] y[60,950]
  mine（我方后台 1280x960 截图）：窗1 x[189,384] 窗2 x[408,603] 窗3 x[627,822] y[616,948]
"""
import argparse
from PIL import Image, ImageChops, ImageDraw

# 菜鸟云主题色系 -> 我方当前青蓝配置（--remap 时使用；若当前配置不同，改这组映射）
REMAP = {
    (105, 84, 240): (13, 162, 157),    # #6954F0 主色 -> #0DA29D
    (64, 104, 249): (15, 187, 181),    # #4068F9 渐变 -> #0FBBB5
    (219, 213, 255): (207, 236, 235),  # #DBD5FF 辅助 -> #CFECEB
}


def crop_pct(im, x1, y1, x2, y2):
    w, h = im.size
    return im.crop((int(x1 * w), int(y1 * h), int(x2 * w), int(y2 * h)))


def detect_windows(im):
    """自动检测截图中 3 个预览窗边界（千分比）：
    列扫描找非白连续段（窗 x 范围），行扫描找非白连续段（窗 y 范围）。
    返回 [[x1,y1,x2,y2] x3]（按 x 中心排序）。"""
    W, H = im.size
    px = im.convert("RGB").load()

    def nonwhite(x, y):
        r, g, b = px[x, y]
        return not (r > 244 and g > 244 and b > 244)

    # 列扫描：多取几行采样（窗内内容行），统计每列非白比例
    sample_ys = [int(H * v) for v in (0.2, 0.35, 0.5, 0.65, 0.8)]
    col_hit = []
    for x in range(W):
        hits = sum(1 for y in sample_ys if nonwhite(x, y))
        col_hit.append(hits >= 2)
    # 连续段（窗间白色间隙 ~46px，窗内白色内容段可能更大——用"间隙≥25px"断开）
    segs, start = [], None
    gap = 0
    for x in range(W):
        if col_hit[x]:
            if start is None:
                start = x
            gap = 0
        else:
            if start is not None:
                gap += 1
                if gap >= 25:
                    if x - start - gap >= 150:
                        segs.append((start, x - gap))
                    start = None
                    gap = 0
    if start is not None and W - start >= 150:
        segs.append((start, W - 1))
    # 取最宽的 3 段（窗），按左缘排序
    segs.sort(key=lambda s: s[1] - s[0], reverse=True)
    wins = sorted(segs[:3])

    # 行扫描：在每窗 x 范围内找 y 非白连续段（窗高）
    out = []
    for x1, x2 in wins:
        row_hit = []
        for y in range(H):
            hits = sum(1 for x in range(x1, x2, 8) if nonwhite(x, y))
            row_hit.append(hits > 0)
        segs_y, start = [], None
        for y in range(H):
            if row_hit[y] and start is None:
                start = y
            elif not row_hit[y] and start is not None:
                if y - start >= 300:  # 窗高至少 ~300px
                    segs_y.append((start, y - 1))
                start = None
        if start is not None and H - start >= 300:
            segs_y.append((start, H - 1))
        if not segs_y:
            continue
        segs_y.sort(key=lambda s: s[1] - s[0], reverse=True)
        y1, y2 = segs_y[0]
        out.append([x1 / W, y1 / H, x2 / W, y2 / H])
    # 转千分比显示并返回
    return out


def remap_colors(im, tol=40):
    im = im.convert("RGB")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            for (mr, mg, mb), (tr, tg, tb) in REMAP.items():
                if abs(r - mr) <= tol and abs(g - mg) <= tol and abs(b - mb) <= tol:
                    px[x, y] = (tr, tg, tb)
                    break
    return im


def strip_theme(im, centers, tol=60):
    """把接近主题色系的像素挖成白色，只留静态背景"""
    im = im.convert("RGB")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            for (mr, mg, mb) in centers:
                if abs(r - mr) <= tol and abs(g - mg) <= tol and abs(b - mb) <= tol:
                    px[x, y] = (255, 255, 255)
                    break
    return im


def diff_report(r, m, title):
    diff = ImageChops.difference(r, m).convert("L")
    mask = diff.point(lambda p: 255 if p > 30 else 0)
    hist = mask.histogram()
    ndiff = sum(hist[128:])
    total = mask.width * mask.height
    pct = ndiff / total * 100
    print(f"{title}: 差异像素 {ndiff}/{total} = {pct:.1f}%")
    grid = []
    gw, gh = mask.width // 10, mask.height // 10
    for gy in range(10):
        row = []
        for gx in range(10):
            c = mask.crop((gx * gw, gy * gh, (gx + 1) * gw, (gy + 1) * gh))
            cnt = sum(c.histogram()[128:])
            row.append("#" if cnt > gw * gh * 0.08 else ".")
        grid.append("".join(row))
    for row in grid:
        print("   ", row)
    # 差异热图
    heat = Image.new("RGB", (250, 466), (245, 245, 245))
    heat.paste(Image.new("RGB", (250, 466), (255, 60, 60)), (0, 0), mask)
    blended = Image.blend(r.convert("RGBA"), heat.convert("RGBA"), 0.55)
    return blended


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True)
    ap.add_argument("--mine", required=True)
    ap.add_argument("--out", default="design-preview-diff.png")
    ap.add_argument("--remap", action="store_true", help="把菜鸟云主色映射为我方配色后再对比")
    ap.add_argument("--strip", action="store_true", help="挖除双方主题色覆盖层，只对比静态背景（推荐）")
    ap.add_argument("--ref-windows", default="17,60,180,950|206,60,341,950|386,60,521,950")
    ap.add_argument("--mine-windows", default="189,616,384,948|408,616,603,948|627,616,822,948")
    ap.add_argument("--auto", action="store_true", help="对 ref 自动检测窗边界（列/行扫描），消除坐标误差")
    args = ap.parse_args()

    ref = Image.open(args.ref).convert("RGB")
    mine = Image.open(args.mine).convert("RGB")
    if args.auto:
        rw = detect_windows(ref)
        print("自动检测到的 ref 窗边界（千分比）:", rw)
    else:
        rw = [[v / 1000.0 for v in map(int, s.split(","))] for s in args.ref_windows.split("|")]
    mw = [[v / 1000.0 for v in map(int, s.split(","))] for s in args.mine_windows.split("|")]
    names = ["商品列表", "商品详情", "商品订单"]

    cols = []
    # 双方主题色系（菜鸟云紫 / 我方青蓝；若当前配置不同改这里）
    ref_theme = [(105, 84, 240), (64, 104, 249), (219, 213, 255), (254, 1, 55)]
    mine_theme = [(13, 162, 157), (15, 187, 181), (207, 236, 235)]
    for i in range(3):
        r = crop_pct(ref, *rw[i]).resize((250, 466))
        m = crop_pct(mine, *mw[i]).resize((250, 466))
        if args.strip:
            r = strip_theme(r, ref_theme)
            m = strip_theme(m, mine_theme)
        elif args.remap:
            r = remap_colors(r)
        h = diff_report(r, m, names[i])
        canvas = Image.new("RGB", (250 * 3 + 40, 466 + 40), (255, 255, 255))
        d = ImageDraw.Draw(canvas)
        d.text((10, 10), f"[{names[i]}] 菜鸟云 | 我方 | 差异", fill=(0, 0, 0))
        canvas.paste(r, (10, 30))
        canvas.paste(m, (280, 30))
        canvas.paste(h, (550, 30))
        cols.append(canvas)

    total_h = sum(c.height for c in cols) + 20
    out = Image.new("RGB", (cols[0].width, total_h), (255, 255, 255))
    y = 10
    for c in cols:
        out.paste(c, (0, y))
        y += c.height
    out.save(args.out)
    print("saved:", args.out, out.size)


if __name__ == "__main__":
    main()
