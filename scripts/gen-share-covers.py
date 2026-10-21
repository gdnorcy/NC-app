#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
个性化分享封面风格库 —— 效果图生成脚本

参考菜鸟云「个性化分享」页的封面风格分类（简约/黑色/白色/商务/卡片/炫彩/截图），
但按 360全景 名片域重新设计一套：信息维度是「人 + 身份 + 触达方式」，
不是「点击保存对方名片」的引流卡。

输出：docs/share-styles/cover-{1..6}.png，每张 750×600（微信转发图 5:4 比例）。

约束（来自微信官方文档）：
  - onShareAppMessage 的 imageUrl 支持本地临时文件 / 代码包文件 / 网络图片
  - **显示图片长宽比是 5:4**
所以这里统一 750×600。

配色：跟随租户品牌 5 色（primary/gradient/secondary/text/subText），
未配置时回落系统默认 #165DFF —— 与前端 brandPalette 回落一致。
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'share-styles')
os.makedirs(OUT, exist_ok=True)

W, H = 750, 600  # 5:4

# ---------------- 字体 ----------------
# PingFang.ttc 是 collection：index 0/1 = HK/TC，index 2 = SC Regular，index 5 = SC Medium
TTC = '/System/Library/Fonts/PingFang.ttc'
F = {
    'black':   ImageFont.truetype(TTC, 62, index=9),   # Semibold
    'bold':    ImageFont.truetype(TTC, 46, index=9),
    'medium':  ImageFont.truetype(TTC, 34, index=5),
    'reg':     ImageFont.truetype(TTC, 30, index=2),
    'small':   ImageFont.truetype(TTC, 26, index=2),
    'tiny':    ImageFont.truetype(TTC, 22, index=2),
    'title':   ImageFont.truetype(TTC, 40, index=9),
}

# ---------------- 品牌色（未配置时回落，与 brandPalette 一致） ----------------
PRIMARY = '#165DFF'
GRADIENT = '#0E42D2'
SECONDARY = '#5C8BFF'
INK = '#1D2129'
INK_SUB = '#86909C'
CARD_BG = '#FFFFFF'


def hexrgb(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def to_rgb(c):
    """接受 hex 字符串或 (r,g,b) 元组，统一转 RGB 元组"""
    if isinstance(c, (tuple, list)):
        return tuple(int(v) for v in c[:3])
    return hexrgb(c)


def mix(a, b, t):
    """a,b 可为 hex 或元组；t=0 取 a，t=1 取 b"""
    ra, rb = to_rgb(a), to_rgb(b)
    return tuple(int(ra[i] + (rb[i] - ra[i]) * t) for i in range(3))


def alpha_over(base, color, alpha):
    """在 base 上叠 color 带 alpha → 返回不透明 RGB（base/color 可为 hex 或元组）"""
    b = to_rgb(base)
    c = to_rgb(color)
    return tuple(int(b[i] * (1 - alpha) + c[i] * alpha) for i in range(3))


def translucent_rect(img, box, radius, color, alpha):
    """真正的半透明圆角矩形（先画在独立层再 alpha_composite）。

    🔴 PIL 的 draw.rounded_rectangle(fill=(r,g,b,a)) 是**直接替换像素**，
       不是与底色合成 → 半透明底上再画同色字会「字比底还浅」直接看不见。
       凡是「半透明底 + 文字」，必须走这个函数或用不透明调和色。
    """
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle(box, radius=radius, fill=tuple(to_rgb(color)) + (int(alpha * 255),))
    img.alpha_composite(layer)
    return ImageDraw.Draw(img)


def lerp_grad(img, c0, c1, angle_deg=25):
    """线性渐变填充整图（c0/c1 可为 hex 或 RGB 元组）"""
    c0, c1 = to_rgb(c0), to_rgb(c1)
    w, h = img.size
    rad = math.radians(angle_deg)
    dx, dy = math.cos(rad), math.sin(rad)
    # 投影范围
    proj = [(x * dx + y * dy) for x in (0, w) for y in (0, h)]
    lo, hi = min(proj), max(proj)
    span = hi - lo
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x * dx + y * dy - lo) / span
            px[x, y] = (
                int(c0[0] + (c1[0] - c0[0]) * t),
                int(c0[1] + (c1[1] - c0[1]) * t),
                int(c0[2] + (c1[2] - c0[2]) * t),
            )


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def text_w(draw, s, font):
    return draw.textbbox((0, 0), s, font=font)[2]


def avatar(img, d, cx, cy, r, name, bg, fg, ring=None):
    """品牌色圆 + 姓名首字（头像缺失时的占位）"""
    if ring:
        d.ellipse([cx - r - 5, cy - r - 5, cx + r + 5, cy + r + 5], fill=ring)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=bg)
    ch = name[0] if name else '名'
    f = ImageFont.truetype(TTC, int(r * 1.05), index=5)
    bb = d.textbbox((0, 0), ch, font=f)
    d.text((cx - (bb[2] - bb[0]) / 2 - bb[0], cy - (bb[3] - bb[1]) / 2 - bb[1]), ch, font=f, fill=fg)


def phone_icon(d, x, y, s, color):
    """极简电话听筒图标"""
    w = max(2, s // 7)
    d.rounded_rectangle([x, y + s * 0.18, x + s * 0.30, y + s * 0.5], radius=w, fill=color)
    d.rounded_rectangle([x + s * 0.16, y + s * 0.40, x + s * 0.84, y + s * 0.72], radius=w, fill=color)
    d.rounded_rectangle([x + s * 0.70, y + s * 0.18, x + s, y + s * 0.5], radius=w, fill=color)


def pin_icon(d, x, y, s, color):
    """定位针"""
    w = max(2, s // 7)
    d.ellipse([x, y, x + s, y + s], outline=color, width=w)
    d.ellipse([x + s * 0.36, y + s * 0.36, x + s * 0.64, y + s * 0.64], fill=color)


def qr_placeholder(d, x, y, s, fg, bg):
    """二维码占位（视觉占位，实际由 canvas 绘制真实小程序码）"""
    d.rounded_rectangle([x - 6, y - 6, x + s + 6, y + s + 6], radius=10, fill=bg)
    d.rectangle([x, y, x + s, y + s], fill=fg)
    n = 11
    cell = s / n
    for r in range(n):
        for c in range(n):
            # 三个定位角
            corner = (r < 3 and c < 3) or (r < 3 and c >= n - 3) or (r >= n - 3 and c < 3)
            if corner:
                rr, cc = (r % (n - 3) if r >= n - 3 else r), (c % (n - 3) if c >= n - 3 else c)
                if rr in (0, 2) and cc in (0, 2):
                    d.rectangle([x + c * cell, y + r * cell, x + (c + 1) * cell - 1, y + (r + 1) * cell - 1], fill=bg)
                elif rr == 1 and cc == 1:
                    d.rectangle([x + c * cell, y + r * cell, x + (c + 1) * cell - 1, y + (r + 1) * cell - 1], fill=bg)
            elif (r * 7 + c * 13 + r * c) % 5 < 2:
                d.rectangle([x + c * cell, y + r * cell, x + (c + 1) * cell - 1, y + (r + 1) * cell - 1], fill=bg)


def deco_circles(img, color, alpha=0.10, specs=None):
    """装饰圆（菜鸟云封面上那种大色块弧）"""
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    specs = specs or [(700, 40, 190), (30, 560, 130)]
    for cx, cy, r in specs:
        c = hexrgb(color)
        od.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c + (int(alpha * 255),))
    img.alpha_composite(overlay)


# =========================================================
# 统一名片数据（示例：真实环境取 card_profile）
# =========================================================
NAME = '林平'
POSITION = '副会长'
COMPANY = '东莞市揭阳商会'
PHONE = '13412888000'
CITY = '东莞市'
SLOGAN = '连接湾区资源 · 共创商业价值'
TAGS = ['商会', '资源对接', '会员']


# =========================================================
# 风格 1：品牌主色渐变（最通用，对应菜鸟云「简约封面」的骨架）
# =========================================================
def cover_1():
    img = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    lerp_grad(img, PRIMARY, GRADIENT, 30)
    deco_circles(img, '#FFFFFF', 0.09, [(720, 60, 200), (20, 570, 150)])
    d = ImageDraw.Draw(img)
    # 头像
    avatar(img, d, 92, 120, 46, NAME, '#FFFFFF', PRIMARY)
    d.text((162, 82), NAME, font=F['black'], fill='#FFFFFF')
    d.text((162, 156), POSITION, font=F['reg'], fill=alpha_over(PRIMARY, (255, 255, 255), 0.82))
    # 公司
    d.text((56, 268), COMPANY, font=F['title'], fill='#FFFFFF')
    # 分隔
    d.rectangle([56, 340, 56 + 64, 340 + 5], fill='#FFFFFF')
    # 标签
    # 🔴 PIL 的 rounded_rectangle 带 alpha 的 fill 是「直接替换像素」而非 alpha 合成，
    #    半透明白底 + 白字 = 白字看不见（第一版就是这么翻车的）。
    #    正解：chip 用不透明调和色（底色与白字混合出的浅色），文字才始终可读。
    x = 56
    chip_bg = mix(PRIMARY, '#FFFFFF', 0.22)
    for t in TAGS:
        tw = text_w(d, t, F['tiny'])
        d.rounded_rectangle([x, 372, x + tw + 30, 372 + 40], radius=20, fill=chip_bg)
        d.text((x + 15, 380), t, font=F['tiny'], fill='#FFFFFF')
        x += tw + 42
    # 底部触达条（半透明黑条必须走 overlay 合成，直接 fill 会替换掉底图渐变）
    ov2 = Image.new('RGBA', img.size, (0, 0, 0, 0))
    od2 = ImageDraw.Draw(ov2)
    od2.rectangle([0, H - 118, W, H], fill=(0, 0, 0, 46))
    img.alpha_composite(ov2)
    d = ImageDraw.Draw(img)
    phone_icon(d, 56, H - 92, 26, '#FFFFFF')
    d.text((94, H - 92), PHONE, font=F['reg'], fill='#FFFFFF')
    d.text((94, H - 50), SLOGAN, font=F['tiny'], fill=alpha_over(mix(PRIMARY, '#000000', 0.18), (255, 255, 255), 0.76))
    qr_placeholder(d, W - 132, H - 150, 100, '#FFFFFF', PRIMARY)
    return img


# =========================================================
# 风格 2：名片卡实体（白底 + 悬浮卡，对应菜鸟云「卡片封面」）
# =========================================================
def cover_2():
    img = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    lerp_grad(img, '#F2F5FF', '#E8EEFF', 60)
    deco_circles(img, PRIMARY, 0.07, [(660, 20, 150), (90, 600, 120)])
    d = ImageDraw.Draw(img)
    # 卡片投影
    card = Image.new('RGBA', (W - 120, 400), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, W - 121, 399], radius=28, fill=(255, 255, 255, 255))
    card = card.filter(ImageFilter.GaussianBlur(0.4))
    img.alpha_composite(card, (60, 92))
    # 卡面渐变头
    head = Image.new('RGBA', (W - 120, 150), (0, 0, 0, 0))
    lerp_grad(head, PRIMARY, GRADIENT, 20)
    hm = rounded_mask((W - 120, 150), 28)
    head.putalpha(hm)
    img.alpha_composite(head, (60, 92))
    d = ImageDraw.Draw(img)
    avatar(img, d, 128, 167, 42, NAME, '#FFFFFF', PRIMARY)
    d.text((190, 130), NAME, font=F['black'], fill='#FFFFFF')
    d.text((190, 196), f'{POSITION} · {COMPANY}', font=F['small'], fill=alpha_over(PRIMARY, (255, 255, 255), 0.84))
    # 卡面信息行
    y = 292
    phone_icon(d, 92, y, 22, PRIMARY)
    d.text((128, y - 4), PHONE, font=F['reg'], fill=INK)
    pin_icon(d, 92, y + 48, 22, PRIMARY)
    d.text((128, y + 44), f'{CITY} · {SLOGAN}', font=F['small'], fill=INK_SUB)
    # 二维码放在卡片内右下（不压 CTA）——卡片右边界 x=W-60=690，码 88px 放 566..654
    qr_placeholder(d, W - 60 - 88 - 26, 372, 88, PRIMARY, '#FFFFFF')
    # 底部品牌条（独占一行，右侧留白给视觉呼吸）
    d.rounded_rectangle([60, H - 96, W - 60, H - 44], radius=26, fill=PRIMARY)
    d.text((104, H - 88), '长按识别，查看完整电子名片', font=F['reg'], fill='#FFFFFF')
    return img


# =========================================================
# 风格 3：暗调商务（对应菜鸟云「黑色封面」）
# =========================================================
def cover_3():
    img = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    lerp_grad(img, '#141821', '#232B3A', 35)
    # 细网格纹理
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    for x in range(0, W, 44):
        od.line([(x, 0), (x, H)], fill=(255, 255, 255, 12), width=1)
    for y in range(0, H, 44):
        od.line([(0, y), (W, y)], fill=(255, 255, 255, 12), width=1)
    img.alpha_composite(ov)
    d = ImageDraw.Draw(img)
    # 金色/品牌色细边
    accent = mix(PRIMARY, '#C9A25E', 0.55)
    d.rectangle([26, 26, W - 27, H - 27], outline=accent + (110,), width=2)
    # 顶部小标识
    d.text((60, 62), 'E-CARD', font=F['tiny'], fill=accent)
    d.text((W - 60 - text_w(d, '2026', F['tiny']), 62), '2026', font=F['tiny'], fill=(150, 158, 175))
    d.rectangle([60, 104, 60 + 56, 108], fill=accent)
    # 主信息
    d.text((60, 150), NAME, font=F['black'], fill='#FFFFFF')
    d.text((60, 234), POSITION, font=F['medium'], fill=accent)
    d.text((60, 286), COMPANY, font=F['reg'], fill=alpha_over('#1B212C', (255, 255, 255), 0.76))
    # 分隔
    d.line([(60, 350), (W - 60, 350)], fill=alpha_over('#1B212C', (255, 255, 255), 0.16), width=1)
    # 触达
    phone_icon(d, 60, 384, 24, accent)
    d.text((96, 380), PHONE, font=F['reg'], fill=alpha_over('#1B212C', (255, 255, 255), 0.88))
    d.text((60, 434), CITY, font=F['small'], fill=alpha_over('#1B212C', (255, 255, 255), 0.55))
    # 右下二维码（金边）
    qr_placeholder(d, W - 152, H - 176, 112, '#FFFFFF', '#1B212C')
    d.rectangle([W - 158, H - 182, W - 34, H - 58], outline=accent + (150,), width=2)
    return img


# =========================================================
# 风格 4：全幅人像 + 底部信息（对应菜鸟云「商务封面」）
# =========================================================
def cover_4():
    img = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    # 模拟全幅图（用品牌色几何替代人像）
    lerp_grad(img, mix(PRIMARY, '#0B1B4B', 0.35), mix(SECONDARY, '#0B1B4B', 0.55), 70)
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    # 斜切色带
    od.polygon([(0, 300), (W, 180), (W, 300), (0, 420)], fill=(255, 255, 255, 26))
    od.polygon([(0, 400), (W, 280), (W, 330), (0, 450)], fill=(255, 255, 255, 18))
    # 人像剪影（抽象）
    od.ellipse([W / 2 - 150, 60, W / 2 + 150, 360], fill=(255, 255, 255, 34))
    od.ellipse([W / 2 - 210, 330, W / 2 + 210, 720], fill=(255, 255, 255, 30))
    img.alpha_composite(ov)
    d = ImageDraw.Draw(img)
    # 底部压暗
    grad = Image.new('RGBA', (W, 220), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(220):
        a = int(215 * (y / 220) ** 1.4)
        gd.line([(0, y), (W, y)], fill=(8, 12, 24, a))
    img.alpha_composite(grad, (0, H - 220))
    d = ImageDraw.Draw(img)
    # 文本
    d.text((56, H - 196), NAME, font=F['black'], fill='#FFFFFF')
    d.text((56, H - 122), f'{POSITION} · {COMPANY}', font=F['reg'], fill=alpha_over('#0B1B4B', (255, 255, 255), 0.80))
    # CTA 按钮（独占左下，与二维码分离）
    d.rounded_rectangle([56, H - 80, 56 + 210, H - 28], radius=26, fill='#FFFFFF')
    d.text((56 + 40, H - 70), '保存名片', font=F['reg'], fill=PRIMARY)
    # 二维码（右下，上移避开 CTA 同一水平带）
    qr_placeholder(d, W - 140, H - 218, 100, '#FFFFFF', mix(PRIMARY, '#0B1B4B', 0.5))
    return img


# =========================================================
# 风格 5：极简白（对应菜鸟云「白色封面」）
# =========================================================
def cover_5():
    img = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    # 左侧品牌竖条
    d.rectangle([0, 0, 14, H], fill=PRIMARY)
    # 顶部小标签
    d.rounded_rectangle([56, 62, 56 + 172, 62 + 40], radius=20, fill=mix(PRIMARY, '#FFFFFF', 0.88))
    d.text((72, 70), '电子名片', font=F['tiny'], fill=PRIMARY)
    # 头像
    avatar(img, d, 108, 186, 52, NAME, mix(PRIMARY, '#FFFFFF', 0.86), PRIMARY)
    # 主信息
    d.text((188, 140), NAME, font=F['black'], fill=INK)
    d.text((188, 216), POSITION, font=F['reg'], fill=INK_SUB)
    d.text((56, 300), COMPANY, font=F['title'], fill=INK)
    d.rectangle([56, 358, 56 + 48, 362], fill=PRIMARY)
    # 触达信息（两列）
    phone_icon(d, 56, 396, 22, PRIMARY)
    d.text((92, 392), PHONE, font=F['reg'], fill=INK)
    pin_icon(d, 56, 448, 22, PRIMARY)
    d.text((92, 444), CITY, font=F['small'], fill=INK_SUB)
    # 右下轻二维码
    qr_placeholder(d, W - 132, H - 148, 96, INK, '#FFFFFF')
    d.text((W - 132, H - 40), '扫一扫', font=F['tiny'], fill=INK_SUB)
    return img


# =========================================================
# 风格 6：通知卡（对应菜鸟云「炫彩封面」）—— 有"收到一张新名片"的社交感
# =========================================================
def cover_6():
    img = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    # 顶部彩色通知条（高度 150）
    head = Image.new('RGBA', (W, 150), (0, 0, 0, 0))
    lerp_grad(head, PRIMARY, mix(GRADIENT, SECONDARY, 0.4), 15)
    img.alpha_composite(head, (0, 0))
    d = ImageDraw.Draw(img)
    # 通知图标（名片剪影）
    d.rounded_rectangle([44, 46, 44 + 46, 46 + 46], radius=12, fill=alpha_over(PRIMARY, (255, 255, 255), 0.24))
    d.rounded_rectangle([56, 60, 56 + 22, 60 + 18], radius=4, fill='#FFFFFF')
    d.text((106, 54), '您收到一张新名片', font=F['title'], fill='#FFFFFF')
    d.text((106, 96), '点击查看 · 立即联系', font=F['tiny'], fill=alpha_over(PRIMARY, (255, 255, 255), 0.78))
    # 主体白卡（**顶部必须低于通知条**，否则盖住标题 —— 第一版就是这里翻车的）
    d.rounded_rectangle([40, 130, W - 40, H - 40], radius=24, fill='#FFFFFF')
    d = ImageDraw.Draw(img)
    # 卡内渐变名片
    card = Image.new('RGBA', (W - 200, 300), (0, 0, 0, 0))
    lerp_grad(card, mix(PRIMARY, '#FFFFFF', 0.9), mix(SECONDARY, '#FFFFFF', 0.92), 30)
    card.putalpha(rounded_mask((W - 200, 300), 20))
    img.alpha_composite(card, (80, 168))
    d = ImageDraw.Draw(img)
    avatar(img, d, 148, 236, 40, NAME, PRIMARY, '#FFFFFF')
    d.text((206, 206), NAME, font=F['bold'], fill=INK)
    d.text((206, 256), f'{POSITION} · {COMPANY}', font=F['small'], fill=INK_SUB)
    d.text((106, 326), SLOGAN, font=F['tiny'], fill=INK_SUB)
    # 触达按钮（宽度按文字实测，避免文字溢出按钮）
    btn_text = '保存到通讯录'
    bw = text_w(d, btn_text, F['reg']) + 76
    d.rounded_rectangle([106, 366, 106 + bw, 366 + 56], radius=28, fill=PRIMARY)
    d.text((106 + 38, 378), btn_text, font=F['reg'], fill='#FFFFFF')
    # 二维码（右下，独立位，避开渐变卡与按钮）
    qr_placeholder(d, W - 148, 300, 108, INK, '#FFFFFF')
    return img


def flatten_on_white(img):
    """把 RGBA 正确合成到白底上再转 RGB。

    🔴 img.convert('RGB') 是**直接丢弃 alpha 通道**：半透明色会变成「纯色」，
       于是「半透明白底 + 白字」= 白底白字（隐形）。
       正确做法是 alpha_composite 到白底。
    """
    base = Image.new('RGBA', img.size, (255, 255, 255, 255))
    base.alpha_composite(img)
    return base.convert('RGB')


STYLES = [
    ('cover-1', '品牌渐变', cover_1),
    ('cover-2', '名片卡', cover_2),
    ('cover-3', '暗调商务', cover_3),
    ('cover-4', '全幅人像', cover_4),
    ('cover-5', '极简白', cover_5),
    ('cover-6', '通知卡', cover_6),
]

if __name__ == '__main__':
    for name, label, fn in STYLES:
        im = flatten_on_white(fn())
        p = os.path.join(OUT, f'{name}.png')
        im.save(p)
        print(f'✅ {label:8s} → {p}  {im.size[0]}×{im.size[1]}  {os.path.getsize(p)//1024}KB')
