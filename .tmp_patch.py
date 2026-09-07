# -*- coding: utf-8 -*-
import re

# ===== myCard.vue 高级工具加"我的人脉库" =====
p = 'web-app/src/pages/card/myCard.vue'
s = open(p, encoding='utf-8').read()
old = """      <view class="os-row" @click="saveCardInfo">
        <view class="osr-icon"><SIcon name="storage" size="default" color="#1d4e8f" /></view>
        <view class="osr-main"><view class="osr-name">保存名片</view><view class="osr-desc">复制名片信息，可保存到手机通讯录</view></view>
        <text class="osr-arrow">›</text>
      </view>"""
new = """      <view class="os-row" @click="goConnections">
        <view class="osr-icon"><SIcon name="market" size="default" color="#1d4e8f" /></view>
        <view class="osr-main"><view class="osr-name">我的人脉库</view><view class="osr-desc">管理交换得来的人脉，可转为客户线索</view></view>
        <text class="osr-arrow">›</text>
      </view>
      <view class="os-row" @click="saveCardInfo">
        <view class="osr-icon"><SIcon name="storage" size="default" color="#1d4e8f" /></view>
        <view class="osr-main"><view class="osr-name">保存名片</view><view class="osr-desc">复制名片信息，可保存到手机通讯录</view></view>
        <text class="osr-arrow">›</text>
      </view>"""
assert old in s, 'mycard row'
s = s.replace(old, new, 1)
old3 = "function leaveTenant"
assert old3 in s, 'leaveTenant'
new3 = "const goConnections = () => uni.navigateTo({ url: '/pages/card/connections' });\nfunction leaveTenant"
s = s.replace(old3, new3, 1)
open(p, 'w', encoding='utf-8').write(s)
print('myCard.vue 完成')

# ===== cardDetail.vue 简介面板补"供需"标签行 =====
p2 = 'web-app/src/pages/card/cardDetail.vue'
t = open(p2, encoding='utf-8').read()
old4 = """        <view class="intro-line" v-if="tagList.length">
          <SIcon name="star" size="small" color="#86909c" />
          <text class="lb">标签</text>
          <view class="skill-tags">
            <view class="skill-tag" v-for="(tag, i) in tagList" :key="i">{{ tag }}</view>
          </view>
        </view>"""
new4 = """        <view class="intro-line" v-if="needTagList.length">
          <SIcon name="exchange" size="small" color="#86909c" />
          <text class="lb">供需</text>
          <view class="skill-tags">
            <view class="skill-tag need" v-for="(tag, i) in needTagList" :key="i">{{ tag }}</view>
          </view>
        </view>
        <view class="intro-line" v-if="tagList.length">
          <SIcon name="star" size="small" color="#86909c" />
          <text class="lb">标签</text>
          <view class="skill-tags">
            <view class="skill-tag" v-for="(tag, i) in tagList" :key="i">{{ tag }}</view>
          </view>
        </view>"""
assert old4 in t, 'cardDetail row'
t = t.replace(old4, new4, 1)

m = re.search(r"const tagList = computed\(\(\) => \{\n  if \(!card\.value\.businessField\) return \[\];\n  return card\.value\.businessField\.split\(\[/[/,，、]\]\)\.map\(\(s\) => s\.trim\(\)\)\.filter\(Boolean\)\.slice\(0, 6\);\n\}\);", t)
assert m, 'tagList computed block'
tagBlock = m.group(0)
needComp = tagBlock + """
const needTagList = computed(() => {
  try {
    const raw = card.value.needTags || '[]';
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter(Boolean).slice(0, 6) : [];
  } catch (e) { return []; }
});"""
t = t.replace(tagBlock, needComp, 1)

old6 = ".skill-tag {"
assert old6 in t, 'skill-tag css'
new6 = ".skill-tag.need { background: rgba(245, 158, 11, 0.12); color: #b45309; }\n.skill-tag {"
t = t.replace(old6, new6, 1)
open(p2, 'w', encoding='utf-8').write(t)
print('cardDetail.vue 完成')
