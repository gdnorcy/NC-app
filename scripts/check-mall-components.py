#!/usr/bin/env python3
"""
商城装修组件复刻自动检查脚本
每次改完componentRegistry.js后必须跑，有输出就不许说"完成"
用法: python3 scripts/check-mall-components.py
"""
import re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG = os.path.join(ROOT, 'web-admin/src/views/customer/apps/design/componentRegistry.js')
RENDER = os.path.join(ROOT, 'web-admin/src/views/customer/apps/design/ComponentRender.vue')

issues = []

def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()

reg = read(REG)
render = read(RENDER)

MALL_COMPS = ['goods-group','goods-all','goods-tabs','goods-rank','goods-like','goods-swiper','goods-show','goods-featured']

# 按行解析，找每个组件的schema块
lines = reg.split('\n')
current_comp = None
in_schema = False
in_defaults = False
schema_fields = {}  # comp_type -> {key: info}
defaults_map = {}   # comp_type -> set of keys

i = 0
while i < len(lines):
    line = lines[i]
    
    # 检测组件开始
    comp_match = re.search(r"type:\s*'(\S+)'", line)
    if comp_match:
        current_comp = comp_match.group(1)
        schema_fields[current_comp] = {}
        defaults_map[current_comp] = set()
        in_schema = False
        in_defaults = False
    
    if current_comp not in MALL_COMPS:
        i += 1
        continue
    
    # 检测defaultProps
    if 'defaultProps:' in line:
        in_defaults = True
        in_schema = False
        # 同一行可能有内容
        for dm in re.finditer(r"(\w+):", line.split('defaultProps:')[1]):
            defaults_map[current_comp].add(dm.group(1))
        i += 1
        continue
    
    if in_defaults:
        for dm in re.finditer(r"(\w+):", line):
            defaults_map[current_comp].add(dm.group(1))
        if '}' in line and 'schema:' not in line:
            in_defaults = False
        i += 1
        continue
    
    # 检测schema开始
    if 'schema:' in line and '[' in line:
        in_schema = True
        i += 1
        continue
    
    # 解析schema字段
    if in_schema and "key:'" in line:
        key_m = re.search(r"key:'(\w+)'", line)
        if key_m:
            fkey = key_m.group(1)
            group_m = re.search(r"group:'([^']+)'", line)
            when_m = re.search(r"when:\{([^}]+)\}", line)
            ctrl_m = re.search(r"control:'(\w+)'", line)
            schema_fields[current_comp][fkey] = {
                'group': group_m.group(1) if group_m else None,
                'when': when_m.group(1) if when_m else None,
                'control': ctrl_m.group(1) if ctrl_m else None,
            }
    
    if in_schema and '],' in line:
        in_schema = False
    
    i += 1

# === 检查1: schema字段在渲染模板里没用 ===
for comp_type in MALL_COMPS:
    if comp_type not in schema_fields:
        continue
    
    # 找渲染模板
    render_pattern = re.compile(
        r"comp\.type === '" + re.escape(comp_type) + r"'.*?(?=comp\.type === '|\Z)",
        re.DOTALL
    )
    rm = render_pattern.search(render)
    render_used = set()
    if rm:
        block = rm.group(0)
        for pm in re.finditer(r"comp\.props\.(\w+)", block):
            render_used.add(pm.group(1))
    
    for fkey, info in schema_fields[comp_type].items():
        if fkey in ('style','styleType','tabs','goodsIds','groupId','catId','bgImage','link','marginX'):
            continue
        if fkey not in render_used:
            issues.append(f"[{comp_type}] schema字段 '{fkey}' (group={info['group']}) 在渲染模板中未使用")

# === 检查2: defaultProps字段在schema里有定义 ===
for comp_type in MALL_COMPS:
    if comp_type not in defaults_map:
        continue
    for dk in defaults_map[comp_type]:
        if dk not in schema_fields.get(comp_type, {}) and dk not in ('tabs','goodsIds','groupId','catId','bgImage','link','marginX'):
            issues.append(f"[{comp_type}] defaultProps字段 '{dk}' 在schema中无定义")

# === 检查3: 图标文件存在 ===
THUMBS = os.path.join(ROOT, 'web-admin/src/assets/design-thumbs')
if os.path.exists(THUMBS):
    thumbs_files = set(os.listdir(THUMBS))
    for btn in ['buyBtn1','buyBtn2','buyBtn3','buyBtn4']:
        found = any(btn.lower() in f.lower() for f in thumbs_files)
        if not found:
            issues.append(f"[图标] {btn} 对应PNG文件不存在")

# === 检查4: graphic thumbSize=36 ===
for gm in re.finditer(r"graphic:true[^}]*thumbSize:(\d+)", reg):
    if int(gm.group(1)) != 36:
        issues.append(f"[图标] graphic thumbSize={gm.group(1)}，应为36")

# === 输出 ===
if issues:
    print(f"\n❌ 发现 {len(issues)} 个问题：")
    for i, issue in enumerate(issues, 1):
        print(f"  {i}. {issue}")
    print(f"\n请修复后再交付。")
    sys.exit(1)
else:
    print("✅ 所有检查通过")
    sys.exit(0)
