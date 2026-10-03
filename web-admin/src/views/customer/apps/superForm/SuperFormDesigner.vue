<template>
  <div class="sf-designer">
    <!-- 顶栏（对齐 ew：深色横条 + 基础布局按钮组点亮 + 右侧图标动作） -->
    <div class="sf-topbar">
      <button class="sf-tb-btn sf-tb-back" @click="$emit('close')">← 返回</button>
      <span class="sf-title">超级表单设计器</span>
      <div class="sf-tb-group">
        <span class="sf-tb-label">基础布局：</span>
        <button class="sf-tb-btn" :class="{ on: settings.layout === 'vertical' }" @click="settings.layout = 'vertical'">上下布局</button>
        <button class="sf-tb-btn" :class="{ on: settings.layout === 'horizontal' }" @click="settings.layout = 'horizontal'">左右布局</button>
        <button class="sf-tb-btn" :class="{ on: panelMode === 'style' }" @click="openPanel('style')">样式设置</button>
      </div>
      <div class="sf-tb-right">
        <button class="sf-tb-link" :class="{ on: panelMode === 'settings' }" @click="openPanel('settings')"><span class="sf-tb-ico">⊙</span> 表单设置</button>
        <button class="sf-tb-link" @click="save(false)"><span class="sf-tb-ico">💾</span> 保存页面</button>
        <button class="sf-tb-link" @click="save(true)"><span class="sf-tb-ico">💾</span> 保存并发布</button>
      </div>
    </div>

    <div class="sf-body">
      <!-- 左：组件库（对齐 ew：灰色分组条 + 3 列彩色图标卡片网格） -->
      <div class="sf-palette">
        <div v-for="group in palette" :key="group.category" class="sf-pal-group">
          <div class="sf-pal-cat">{{ group.category }}</div>
          <div class="sf-pal-items">
            <div
              v-for="item in group.items"
              :key="item.type"
              class="sf-pal-item"
              draggable="true"
              :title="item.label + '（点击或拖入画布）'"
              @click="addComponent(item.type)"
              @dragstart="onPaletteDrag(item.type, $event)"
            >
              <span class="sf-pal-icon">
                <svg viewBox="0 0 24 24" v-html="ICONS[item.type] || ''" />
              </span>
              <span class="sf-pal-label">{{ item.label }}</span>
            </div>
            <!-- 补齐网格空位，保证边框闭合（对齐原版表格线） -->
            <div v-if="group.items.length % 3" class="sf-pal-fill" :style="{ gridColumn: 'span ' + (3 - (group.items.length % 3)) }" />
          </div>
        </div>
      </div>

      <!-- 中：手机预览 -->
      <div class="sf-canvas">
        <div class="sf-phone">
          <div class="sf-phone-status">
            <span class="sf-phone-time">10:18</span>
            <span class="sf-phone-icons">
              <svg width="16" height="10" viewBox="0 0 16 10" fill="#303133"><rect x="0" y="6" width="2" height="4" rx="0.5"/><rect x="3.5" y="4" width="2" height="6" rx="0.5"/><rect x="7" y="2" width="2" height="8" rx="0.5"/><rect x="10.5" y="0" width="2" height="10" rx="0.5"/></svg>
              <svg width="15" height="11" viewBox="0 0 15 11" fill="none" stroke="#303133" stroke-width="1"><path d="M1.5 4.5a8 8 0 0 1 12 0M3.5 7a5.5 5.5 0 0 1 8 0M6 9.5a2 2 0 0 1 3 0" stroke-linecap="round"/></svg>
              <svg width="22" height="10" viewBox="0 0 25 11" fill="none"><rect x="0.5" y="0.5" width="20" height="10" rx="2.5" stroke="#303133" opacity="0.4"/><rect x="2" y="2" width="16" height="7" rx="1" fill="#303133"/><rect x="22.5" y="3" width="2" height="5" rx="1" fill="#303133" opacity="0.4"/></svg>
            </span>
          </div>
          <div class="sf-phone-nav"><span class="sf-phone-nav-title">表单</span><span class="sf-phone-capsule">⋯ ◎</span></div>
          <div
            class="sf-phone-body"
            :class="settings.layout"
            :style="phoneStyle"
            @dragover.prevent="dragOverIdx = components.length"
            @drop="onDrop(components.length, $event)"
          >
            <div v-for="(comp, idx) in components" :key="comp.id" class="sf-comp-wrap"
                 :class="{ 'cs-line': comp.style && comp.style.styleType === 'line' }" :style="compWrapStyle(comp)">
              <div v-if="dragOverIdx === idx" class="sf-drop-line" />
              <div
                class="sf-comp"
                :class="{ active: comp.id === selectedId, 'is-hidden': !compVisible(comp) }"
                draggable="true"
                @click="selectComp(comp.id)"
                @dragstart="onCompDrag(comp.id, $event)"
                @dragend="resetDrag"
                @dragover.prevent.stop="dragOverIdx = idx"
                @drop.stop="onDrop(idx, $event)"
              >
                <div class="sf-comp-ops" v-if="comp.id === selectedId">
                  <span @click.stop="remove(idx)">✕</span>
                </div>
                <ComponentPreview :comp="comp" :layout="settings.layout" />
              </div>
              <div v-if="!compVisible(comp)" class="sf-hidden-badge">已隐藏</div>
            </div>
            <div v-if="dragOverIdx === components.length" class="sf-drop-line" />
            <div v-if="!components.length" class="sf-empty">请从左侧列表中选择一个组件，然后用鼠标拖动组件放置于此处.</div>
          </div>
        </div>
      </div>

      <!-- 右：属性面板（对齐 ew：组件属性 / 全局样式 / 表单设置 三模式） -->
      <div class="sf-props">
        <!-- 选中组件：内容/样式 -->
        <template v-if="panelMode === 'props' && selected">
          <div class="sf-panel-head">{{ COMPONENT_LABEL[selected.type] || '组件' }}</div>
          <div class="sf-seg">
            <div class="sf-seg-item" :class="{ on: propTab === 'content' }" @click="propTab = 'content'">内容设置</div>
            <div class="sf-seg-item" :class="{ on: propTab === 'style' }" @click="propTab = 'style'">样式设置</div>
          </div>
          <div v-if="propTab === 'content'" class="sf-prop-form">
            <el-form label-width="92px" size="small">
              <!-- P0：ew 在全部 29 组件渲染「是否显示」+「是否必填」。是否显示恒定渲染；是否必填避开自带必填控件的组件（radio/checkbox/select/date/number/time/location/attachment/phoneauth/sms/carplate/rate/agreement）与提交按钮（submit），其余 12 装修/特殊组件保留 ew 同款「是否必填」开关 -->
              <el-form-item label="是否显示">
                <el-radio-group v-model="selected.content.visible">
                  <el-radio :value="true">显示</el-radio>
                  <el-radio :value="false">隐藏</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="是否必填" v-if="selected.type !== 'submit' && !['radio','checkbox','select','date','number','time','location','attachment','phoneauth','sms','carplate','rate','agreement'].includes(selected.type)">
                <el-radio-group v-model="selected.content.required">
                  <el-radio :value="true">必填</el-radio>
                  <el-radio :value="false">非必填</el-radio>
                </el-radio-group>
              </el-form-item>

              <template v-if="selected.type === 'text'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
                <el-form-item label="预填文字"><el-input v-model="selected.content.prefill" /></el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则仅显示"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容类型">
                  <el-radio-group v-model="selected.content.contentType">
                    <el-radio value="normal">普通</el-radio>
                    <el-radio value="phone">手机号码</el-radio>
                    <el-radio value="email">邮箱</el-radio>
                    <el-radio value="idcard">身份证</el-radio>
                    <el-radio value="scan">扫码识别<span class="sf-hint">（暂不支持H5端）</span></el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item v-if="selected.content.contentType === 'normal'" label="同步姓名">
                  <el-radio-group v-model="selected.content.syncName">
                    <el-radio :value="false">关闭</el-radio>
                    <el-radio :value="true">开启</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item v-if="selected.content.contentType === 'phone'" label="同步手机号">
                  <el-radio-group v-model="selected.content.syncName">
                    <el-radio :value="false">关闭</el-radio>
                    <el-radio :value="true">开启</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item v-if="selected.content.contentType === 'normal'" label="输入类型">
                  <el-checkbox-group v-model="selected.content.inputType">
                    <el-checkbox value="chinese">中文</el-checkbox>
                    <el-checkbox value="english">英文</el-checkbox>
                    <el-checkbox value="number">数字</el-checkbox>
                    <el-checkbox value="symbol">符号</el-checkbox>
                  </el-checkbox-group>
                </el-form-item>
                <el-form-item v-if="selected.content.contentType === 'normal'" label="最少输入">
                  <el-slider v-model="selected.content.minLength" :min="0" :max="200" style="flex:1" />
                  <el-input-number v-model="selected.content.minLength" :min="0" :max="200" size="small" style="width:90px;margin-left:10px" />
                </el-form-item>
                <el-form-item v-if="selected.content.contentType === 'normal'" label="最多输入">
                  <el-slider v-model="selected.content.maxLength" :min="0" :max="3000" style="flex:1" />
                  <el-input-number v-model="selected.content.maxLength" :min="0" :max="3000" size="small" style="width:90px;margin-left:10px" />
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" active-text="相同内容不可重复提交" />
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'textarea'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
                <el-form-item label="预填文字"><el-input v-model="selected.content.prefill" /></el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则必填"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" />
                  <span class="sf-hint">开启校验则相同内容无法重复提交</span>
                </el-form-item>
                <el-form-item label="最少输入">
                  <el-slider v-model="selected.content.minLength" :min="0" :max="200" style="flex:1" />
                  <el-input-number v-model="selected.content.minLength" :min="0" :max="200" size="small" style="width:90px;margin-left:10px" />
                </el-form-item>
                <el-form-item label="最多输入">
                  <el-slider v-model="selected.content.maxLength" :min="0" :max="3000" style="flex:1" />
                  <el-input-number v-model="selected.content.maxLength" :min="0" :max="3000" size="small" style="width:90px;margin-left:10px" />
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'image'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
                <el-form-item label="图片类型">
                  <!-- ew imgType-editor.handler：切类型会联动 标题/提示文字/数量限制（身份證/營業執照固定 0 张） -->
                  <el-radio-group v-model="selected.content.imageType" @change="onImgTypeChange">
                    <el-radio value="normal">普通</el-radio>
                    <el-radio value="idcard">身份证</el-radio>
                    <el-radio value="license">营业执照</el-radio>
                  </el-radio-group>
                </el-form-item>
                <!-- ew 联动：示例图 / 输入限制 仅「普通」显示 -->
                <template v-if="selected.content.imageType === 'normal'">
                  <el-form-item label="示例图">
                    <div class="sf-sample-img">
                      <span class="sf-sample-box" @click="imgPickerTarget = 'sampleImg'; imgPickerShow = true">
                        <img v-if="selected.content.sampleImg" :src="selected.content.sampleImg" />
                        <i v-else class="sf-camera-icon" />
                      </span>
                      <span class="sf-hint" style="margin-left:10px">示例图可引导用户上传规定模式的图片</span>
                    </div>
                  </el-form-item>
                  <!-- ew 示例引导卡：上传-示例 / 未上传-示例 双卡预览（普通类型；左卡随示例图联动） -->
                  <el-form-item label="">
                    <div class="sf-img-demo">
                      <div class="sf-img-demo-card">
                        <div class="sf-img-demo-head">上传-示例</div>
                        <div class="sf-img-demo-body">
                          <div class="sf-img-demo-box">
                            <img v-if="selected.content.sampleImg" :src="selected.content.sampleImg" />
                            <div v-else class="sf-img-demo-ph">
                              <span class="sf-img-demo-photo">
                                <span class="sf-img-demo-line" />
                                <span class="sf-img-demo-line short" />
                              </span>
                              <span class="sf-img-demo-badge"><i class="sf-camera-icon sf-img-demo-cam"></i></span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div class="sf-img-demo-card">
                        <div class="sf-img-demo-head">未上传-示例</div>
                        <div class="sf-img-demo-body">
                          <div class="sf-img-demo-box"><i class="sf-camera-icon sf-img-demo-cam-lg"></i></div>
                        </div>
                      </div>
                    </div>
                  </el-form-item>
                  <el-form-item label="输入限制">
                    <div class="sf-limit-row">
                      <span class="sf-limit-label">最少上传</span>
                      <el-slider v-model="selected.content.minCount" :min="0" :max="10" show-input :show-input-controls="false" class="sf-limit-slider" />
                      <span>张</span>
                    </div>
                  </el-form-item>
                  <el-form-item label="">
                    <div class="sf-limit-row">
                      <span class="sf-limit-label">最多上传</span>
                      <el-slider v-model="selected.content.maxCount" :min="0" :max="10" show-input :show-input-controls="false" class="sf-limit-slider" />
                      <span>张</span>
                    </div>
                  </el-form-item>
                </template>
              </template>

              <template v-else-if="['radio', 'checkbox', 'select'].includes(selected.type)">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则必填"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" />
                  <span class="sf-hint">开启校验则相同内容无法重复提交</span>
                </el-form-item>
                <el-form-item v-if="selected.type === 'radio' || selected.type === 'checkbox'" label="选项类型">
                  <el-radio-group v-model="selected.content.optionType">
                    <el-radio value="text">文字选项</el-radio>
                    <el-radio value="image">图片选项</el-radio>
                    <el-radio value="imageText">图文选项</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item v-if="selected.type !== 'select' || selected.content.presetType === 'normal'" label="选项">
                  <div v-for="(opt, oi) in selected.content.options" :key="oi" class="sf-opt-row">
                    <template v-if="selected.content.optionType === 'image'">
                      <el-input v-model="opt.image" placeholder="图片URL" style="width: 200px" />
                    </template>
                    <template v-else>
                      <el-input v-model="opt.label" placeholder="选项文案" style="width: 160px" />
                    </template>
                    <el-button text type="danger" @click="selected.content.options.splice(oi, 1)">删</el-button>
                  </div>
                  <el-button size="small" @click="selected.content.options.push({ label: '新选项', value: String(selected.content.options.length + 1), image: '' })">+ 添加选项</el-button>
                </el-form-item>
                <template v-if="selected.type === 'select'">
                  <el-form-item label="预设类型">
                    <el-radio-group v-model="selected.content.presetType">
                      <el-radio value="normal">普通</el-radio>
                      <el-radio value="region">省市区</el-radio>
                      <el-radio value="date">日期</el-radio>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item v-if="selected.content.presetType !== 'normal'" label="下拉框级数">
                    <el-radio-group v-model="selected.content.level">
                      <el-radio :value="1">一级</el-radio><el-radio :value="2">二级</el-radio><el-radio :value="3">三级</el-radio>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item v-if="selected.content.presetType !== 'normal'" label="说明">
                    <span class="sf-hint">{{ selected.content.presetType === 'region' ? '省市区三级联动；如仅需省/市请下调级数' : '年 / 月 / 日 分级联动；如需选择三级级数请直接使用日期组件' }}</span>
                  </el-form-item>
                </template>
                <el-form-item v-if="selected.type === 'checkbox'" label="最少选择">
                  <el-input-number v-model="selected.content.minSelect" :min="0" size="small" />
                </el-form-item>
                <el-form-item v-if="selected.type === 'checkbox'" label="最多选择">
                  <el-input-number v-model="selected.content.maxSelect" :min="0" size="small" />
                </el-form-item>
                <el-form-item v-if="selected.type === 'checkbox'" label="排他选项">
                  <el-switch v-model="selected.content.exclusive" />
                  <span class="sf-hint">开启后，选中排他项将清空其他选择（如"以上都不是"）</span>
                </el-form-item>
                <el-form-item v-if="selected.type === 'checkbox' && selected.content.exclusive" label="排他项">
                  <el-select v-model="selected.content.exclusiveValue" style="width: 160px">
                    <el-option v-for="(opt, oi) in selected.content.options" :key="oi" :label="opt.label" :value="opt.value" />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="selected.type === 'checkbox'" label="添加其他选项">
                  <el-switch v-model="selected.content.allowOther" />
                  <span class="sf-hint">允许用户填写其他选项</span>
                </el-form-item>
                <el-form-item v-if="selected.type === 'checkbox' || (selected.type === 'select' && selected.content.presetType === 'normal')" label="批量添加">
                  <el-input type="textarea" :rows="2" v-model="batchOptionsText" placeholder="每行一个选项，回车分隔" />
                  <el-button size="small" @click="batchAddOptions">批量添加</el-button>
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'date'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则必填"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" />
                  <span class="sf-hint">开启校验则相同内容无法重复提交</span>
                </el-form-item>
                <el-form-item label="预填文字"><el-input v-model="selected.content.prefill" /></el-form-item>
                <el-form-item label="内容类型">
                  <el-radio-group v-model="selected.content.dateType">
                    <el-radio value="date">单个日期</el-radio>
                    <el-radio value="range">日期范围</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="同步生日">
                  <el-radio-group v-model="selected.content.syncBirthday">
                    <el-radio :value="false">关闭</el-radio>
                    <el-radio :value="true">开启</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item v-if="selected.content.dateType === 'range'" label="日期范围">
                  <el-date-picker v-model="selected.content.defaultRange" type="daterange" size="small" />
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'number'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则必填"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" />
                  <span class="sf-hint">开启校验则相同内容无法重复提交</span>
                </el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
                <el-form-item label="大小限制">
                  <el-input-number v-model="selected.content.min" :min="0" size="small" /> ~
                  <el-input-number v-model="selected.content.max" :min="0" size="small" />
                </el-form-item>
                <el-form-item label="间隔"><el-input-number v-model="selected.content.step" :min="1" size="small" /> <span class="sf-hint">每次增减步进</span></el-form-item>
                <el-form-item label="默认值"><el-input v-model="selected.content.defaultValue" placeholder="选填" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'time'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则必填"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" />
                  <span class="sf-hint">开启校验则相同内容无法重复提交</span>
                </el-form-item>
                <el-form-item label="内容类型">
                  <el-radio-group v-model="selected.content.dateType">
                    <el-radio value="time">单个时间</el-radio>
                    <el-radio value="timerange">时间段</el-radio>
                  </el-radio-group>
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'location'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则必填"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" />
                  <span class="sf-hint">开启校验则相同内容无法重复提交</span>
                </el-form-item>
                <el-form-item label="按钮文案"><el-input v-model="selected.content.tipText" /></el-form-item>
                <el-form-item label="内容类型">
                  <el-radio-group v-model="selected.content.contentType">
                    <el-radio value="point">定位点</el-radio>
                    <el-radio value="route">点到点</el-radio>
                  </el-radio-group>
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'attachment'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则必填"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" />
                  <span class="sf-hint">开启校验则相同内容无法重复提交</span>
                </el-form-item>
                <el-form-item label="输入限制">
                  <!-- ew insertLimit-editor：附件为「最少/最多上传 … 个」，滑杆上限 10 -->
                  <div class="sf-limit-row">
                    <span class="sf-limit-label">最少上传</span>
                    <el-slider v-model="selected.content.minCount" :min="0" :max="10" show-input :show-input-controls="false" class="sf-limit-slider" />
                    <span>个</span>
                  </div>
                </el-form-item>
                <el-form-item label="">
                  <div class="sf-limit-row">
                    <span class="sf-limit-label">最多上传</span>
                    <el-slider v-model="selected.content.maxCount" :min="0" :max="10" show-input :show-input-controls="false" class="sf-limit-slider" />
                    <span>个</span>
                  </div>
                </el-form-item>
                <el-form-item label="上传类型">
                  <el-checkbox-group v-model="selected.content.accept">
                    <el-checkbox v-for="ext in ATTACH_EXTS" :key="ext" :value="ext">{{ ext }}</el-checkbox>
                  </el-checkbox-group>
                  <span class="sf-hint">不选则允许所有类型</span>
                </el-form-item>
                <el-form-item label="大小限制">
                  <el-input-number v-model="selected.content.maxSize" :min="0" :max="102400" /> KB
                  <span class="sf-hint">0 表示不限</span>
                </el-form-item>
                <el-form-item label="">
                  <span class="sf-hint">该组件适用于 H5 / 微信小程序 / 头条小程序 / 百度小程序 / 支付宝小程序，暂不支持其他端</span>
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'agreement'">
                <el-form-item label="勾选文案"><el-input v-model="selected.content.label" placeholder="如：我已阅读并同意" /></el-form-item>
                <el-form-item label="协议正文"><el-input v-model="selected.content.content" type="textarea" :rows="3" placeholder="协议全文，看完模式将展示供阅读" /></el-form-item>
                <el-form-item label="显示方式">
                  <el-radio-group v-model="selected.content.showMode">
                    <el-radio value="direct">直接勾选</el-radio>
                    <el-radio value="view">看完勾选</el-radio>
                  </el-radio-group>
                  <span class="sf-hint">看完勾选：需阅读完协议正文方可勾选</span>
                </el-form-item>
                <el-form-item label="必须勾选">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">是</el-radio><el-radio :value="false">否</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="链接文案"><el-input v-model="selected.content.linkText" /></el-form-item>
                <el-form-item label="链接地址"><el-input v-model="selected.content.linkUrl" placeholder="https://" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'rate'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则必填"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" />
                  <span class="sf-hint">开启校验则相同内容无法重复提交</span>
                </el-form-item>
                <el-form-item label="描述文字"><el-input v-model="selected.content.desc" placeholder="请输入描述文字" /></el-form-item>
                <el-form-item label="允许半选"><el-switch v-model="selected.content.allowHalf" /></el-form-item>
                <el-form-item label="最高量级">
                  <el-select v-model="selected.content.max" style="width: 120px">
                    <el-option v-for="n in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]" :key="n" :label="n" :value="n" />
                  </el-select>
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'filedownload'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="文件名称"><el-input v-model="selected.content.fileName" /></el-form-item>
                <el-form-item label="文件地址"><el-input v-model="selected.content.fileUrl" placeholder="https://" /></el-form-item>
                <el-form-item label="示例文件"><el-input v-model="selected.content.sampleFile" placeholder="选填，示例文件地址" /></el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.tip" placeholder="选填，如下载说明" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'phoneauth'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则必填"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" />
                  <span class="sf-hint">开启校验则相同内容无法重复提交</span>
                </el-form-item>
                <el-form-item label="按钮文案"><el-input v-model="selected.content.placeholder" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'sms'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则必填"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" />
                  <span class="sf-hint">开启校验则相同内容无法重复提交</span>
                </el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
                <el-form-item label="按钮文案"><el-input v-model="selected.content.buttonText" /></el-form-item>
                <el-form-item label="说明"><span class="sf-hint">实际下发短信验证码需接入短信服务，当前为演示交互。</span></el-form-item>
              </template>

              <template v-else-if="selected.type === 'carplate'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'title'">
                <el-form-item label="标题文字"><el-input v-model="selected.content.text" placeholder="主标题" /></el-form-item>
                <el-form-item label="副标题文字"><el-input v-model="selected.content.subtitle" placeholder="选填，主标题下方的副标题" /></el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.tip" placeholder="选填，标题下方灰色提示" /></el-form-item>
                <el-form-item label="标题链接"><el-input v-model="selected.content.link" placeholder="选填，点击标题跳转" /></el-form-item>
                <el-form-item label="文字大小"><el-input-number v-model="selected.content.size" :min="12" :max="40" /> px</el-form-item>
                <el-form-item label="对齐方式">
                  <el-radio-group v-model="selected.content.align">
                    <el-radio value="left">左</el-radio><el-radio value="center">中</el-radio><el-radio value="right">右</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="文字颜色"><el-color-picker v-model="selected.content.color" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'richtext'">
                <el-form-item label="富文本"><el-input v-model="selected.content.html" type="textarea" :rows="4" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'blank'">
                <el-form-item label="高度"><el-input-number v-model="selected.content.height" :min="1" :max="200" /> px</el-form-item>
              </template>

              <template v-else-if="selected.type === 'line'">
                <el-form-item label="线条样式">
                  <el-select v-model="selected.content.style">
                    <el-option label="实线" value="solid" />
                    <el-option label="虚线" value="dashed" />
                    <el-option label="点线" value="dotted" />
                  </el-select>
                </el-form-item>
                <el-form-item label="线条颜色"><el-color-picker v-model="selected.content.color" /></el-form-item>
                <el-form-item label="线条高度"><el-input-number v-model="selected.content.height" :min="1" :max="20" /> px</el-form-item>
              </template>

              <template v-else-if="selected.type === 'swiper'">
                <el-form-item label="图片地址">
                  <div v-for="(img, si) in selected.content.images" :key="si" class="sf-opt-row">
                    <el-input v-model="selected.content.images[si]" placeholder="图片 URL" style="width: 220px" />
                    <el-button text type="danger" @click="selected.content.images.splice(si, 1)">删</el-button>
                  </div>
                  <el-button size="small" @click="selected.content.images.push('')">+ 添加图片</el-button>
                </el-form-item>
                <el-form-item label="图片描述"><el-input v-model="selected.content.desc" placeholder="选填，轮播图下方说明文字" /></el-form-item>
                <el-form-item label="点击链接"><el-input v-model="selected.content.link" placeholder="选填，点击轮播图跳转" /></el-form-item>
                <el-form-item label="高度"><el-input-number v-model="selected.content.height" :min="60" :max="400" /> px</el-form-item>
              </template>

              <template v-else-if="selected.type === 'bigimage'">
                <el-form-item label="图片地址"><el-input v-model="selected.content.image" placeholder="图片 URL" /></el-form-item>
                <el-form-item label="图片描述"><el-input v-model="selected.content.desc" placeholder="选填，大图下方说明文字" /></el-form-item>
                <el-form-item label="跳转链接"><el-input v-model="selected.content.link" placeholder="选填，点击大图跳转" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'video'">
                <el-form-item label="视频地址"><el-input v-model="selected.content.src" placeholder="视频 URL" /></el-form-item>
                <el-form-item label="封面图"><el-input v-model="selected.content.poster" placeholder="选填" /></el-form-item>
                <el-form-item label="显示方式">
                  <el-radio-group v-model="selected.content.display">
                    <el-radio value="direct">直接显示</el-radio>
                    <el-radio value="popup">弹出显示</el-radio>
                  </el-radio-group>
                  <span class="sf-hint">弹出显示：仅展示封面与播放按钮，点击后弹出播放</span>
                </el-form-item>
                <el-form-item label="自动播放">
                  <el-switch v-model="selected.content.autoplay" />
                  <span class="sf-hint">开启后视频进入页面即自动播放（直接显示模式生效）</span>
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'backdesc'">
                <el-form-item label="描述文字"><el-input v-model="selected.content.text" type="textarea" :rows="3" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'realtime'">
                <el-form-item label="模块标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="动态文案"><el-input v-model="selected.content.title" placeholder="如：已有 0 人参与" /></el-form-item>
                <el-form-item label="虚拟人数">
                  <el-input-number v-model="selected.content.fakeCount" :min="0" />
                  <span class="sf-hint">叠加到真实参与数上展示，营造热度</span>
                </el-form-item>
                <el-form-item label="开启倒计时">
                  <el-switch v-model="selected.content.countdown" />
                </el-form-item>
                <el-form-item v-if="selected.content.countdown" label="倒计时时间">
                  <el-date-picker v-model="selected.content.countdownTime" type="datetime" placeholder="选择结束时间" value-format="YYYY-MM-DD HH:mm:ss" />
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'pagebreak'">
                <el-form-item label="禁止返回上一步">
                  <el-switch v-model="selected.content.noReturn" />
                  <span class="sf-hint">开启后填写者无法返回上一页</span>
                </el-form-item>
                <el-form-item label="上一步按钮文字"><el-input v-model="selected.content.prevText" placeholder="上一步" /></el-form-item>
                <el-form-item label="下一步按钮文字"><el-input v-model="selected.content.nextText" placeholder="下一页" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'pay'">
                <el-form-item label="支付标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="规格类型">
                  <el-radio-group v-model="selected.content.specType">
                    <el-radio value="single">单规格</el-radio>
                    <el-radio value="multi">多规格</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item v-if="selected.content.specType !== 'multi'" label="固定金额"><el-input-number v-model="selected.content.amount" :min="0" :precision="2" /> 元</el-form-item>
                <el-form-item v-else label="支付规格">
                  <div v-for="(sp, spi) in selected.content.specs" :key="spi" class="sf-opt-row">
                    <el-input v-model="sp.name" placeholder="规格名" style="width: 110px" />
                    <el-input-number v-model="sp.price" :min="0" :precision="2" />
                    <el-button text type="danger" @click="selected.content.specs.splice(spi, 1)">删</el-button>
                  </div>
                  <el-button size="small" @click="selected.content.specs.push({ name: '新规格', price: 0 })">+ 添加规格</el-button>
                </el-form-item>
                <el-form-item label="库存展示">
                  <el-switch v-model="selected.content.showStock" />
                  <span v-if="selected.content.showStock" style="margin-left:8px">
                    库存 <el-input-number v-model="selected.content.stock" :min="0" style="width:120px" /> 件
                  </span>
                </el-form-item>
                <el-form-item label="支付退款">
                  <el-select v-model="selected.content.refundType" style="width:160px">
                    <el-option label="不支持退款" value="none" />
                    <el-option label="随时退款" value="anytime" />
                    <el-option label="条件退款" value="condition" />
                  </el-select>
                </el-form-item>
                <el-form-item label="支付核销"><el-switch v-model="selected.content.verify" /><span class="sf-hint">开启后支付成功需核销使用</span></el-form-item>
                <el-form-item label="支付限购">
                  <el-input-number v-model="selected.content.limitBuy" :min="0" /> 件/人
                  <span class="sf-hint">0 表示不限制</span>
                </el-form-item>
                <el-form-item label="日期选择">
                  <el-switch v-model="selected.content.dateSelect" />
                  <span class="sf-hint">开启后填写者需选择参与日期</span>
                </el-form-item>
                <el-form-item label="优惠券"><el-switch v-model="selected.content.coupon" /></el-form-item>
                <el-form-item label="积分抵扣"><el-switch v-model="selected.content.points" /></el-form-item>
                <el-form-item label="会员折扣"><el-switch v-model="selected.content.memberDiscount" /></el-form-item>
                <el-form-item label="支付分销"><el-switch v-model="selected.content.distribute" /><span class="sf-hint">开启后推广员可得佣金</span></el-form-item>
                <el-form-item label="支付方式">
                  <el-radio-group v-model="selected.content.payType">
                    <el-radio value="wechat">微信支付</el-radio>
                    <el-radio value="alipay">支付宝</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="说明"><span class="sf-hint">实际微信/支付宝支付、退款/核销/分销等能力将在发布后接入，当前仅记录配置。</span></el-form-item>
              </template>

              <template v-else-if="selected.type === 'submit'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="上下文提示">
                  <el-select v-model="selected.content.context" style="width:160px">
                    <el-option label="通用" value="general" />
                    <el-option label="商品表单" value="goods" />
                    <el-option label="活动表单" value="activity" />
                    <el-option label="会员表单" value="member" />
                    <el-option label="文章表单" value="article" />
                    <el-option label="视频表单" value="video" />
                    <el-option label="音频表单" value="audio" />
                  </el-select>
                  <span class="sf-hint">{{ submitContextHint }}</span>
                </el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.tipText" placeholder="提交成功后显示的提示信息" /></el-form-item>
                <el-form-item label="轻提示">
                  <el-switch v-model="selected.content.lightTip" />
                  <span class="sf-hint">默认关闭，弹出提示文字，需点击确认按钮再跳转</span>
                </el-form-item>
                <el-form-item label="跳转指定页面">
                  <el-input v-model="selected.content.jumpLink" placeholder="如 /pages/webview?src=... 或外部链接（留空不跳转）" />
                </el-form-item>
              </template>
            </el-form>
          </div>

          <!-- 组件样式（对齐 ew：组件背景 + 组件整体 + 组件风格 + 组件颜色，按组件类型驱动） -->
          <div v-else class="sf-prop-form">
            <el-form label-width="92px" size="small">
              <div class="sf-sec">组件背景</div>
              <el-form-item label="背景类型">
                <el-radio-group v-model="selected.style.bgType">
                  <el-radio value="color">颜色</el-radio>
                  <el-radio value="imgcolor">图片+颜色</el-radio>
                </el-radio-group>
              </el-form-item>
              <template v-if="selected.style.bgType === 'imgcolor'">
                <el-form-item label="背景图片">
                  <el-input v-model="selected.style.bgImage" placeholder="图片地址" />
                  <el-button style="margin-left: 8px" @click="imgPickerTarget = 'compBg'; imgPickerShow = true">选择图片</el-button>
                </el-form-item>
                <el-form-item label="平铺方式">
                  <el-radio-group v-model="selected.style.bgRepeat">
                    <el-radio value="repeat-x">左右重复</el-radio>
                    <el-radio value="repeat-y">上下平铺</el-radio>
                    <el-radio value="repeat">都平铺</el-radio>
                    <el-radio value="no-repeat">不平铺</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="左右位置">
                  <el-radio-group v-model="selected.style.bgPosX">
                    <el-radio value="left">左</el-radio><el-radio value="center">中</el-radio><el-radio value="right">右</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="上下位置">
                  <el-radio-group v-model="selected.style.bgPosY">
                    <el-radio value="top">上</el-radio><el-radio value="center">中</el-radio><el-radio value="bottom">下</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="图片样式">
                  <el-radio-group v-model="selected.style.bgImgStyle">
                    <el-radio value="custom">自定义</el-radio>
                    <el-radio value="fill">填充</el-radio>
                    <el-radio value="fixed">图片固定比例</el-radio>
                  </el-radio-group>
                </el-form-item>
                <template v-if="selected.style.bgImgStyle === 'custom'">
                  <el-form-item label="背景图宽">
                    <el-slider v-model="selected.style.bgImgW" :min="0" :max="100" class="sf-inline-slider" />
                    <el-input-number v-model="selected.style.bgImgW" :min="0" :max="100" size="small" style="width: 96px" /> %
                  </el-form-item>
                  <el-form-item label="背景图高">
                    <el-slider v-model="selected.style.bgImgH" :min="0" :max="100" class="sf-inline-slider" />
                    <el-input-number v-model="selected.style.bgImgH" :min="0" :max="100" size="small" style="width: 96px" /> %
                  </el-form-item>
                </template>
              </template>
              <el-form-item label="背景颜色">
                <el-color-picker v-model="selected.style.bgColor" size="small" />
                <el-input v-model="selected.style.bgColor" size="small" style="width: 96px; margin-left: 8px" />
                <el-button size="small" style="margin-left: 8px" @click="selected.style.bgColor = '#FFFFFF'">重置</el-button>
              </el-form-item>

              <div class="sf-sec">组件整体</div>
              <el-form-item label="顶外边距">
                <el-slider v-model="selected.style.outMarginTop" :min="0" :max="100" class="sf-inline-slider" />
                <el-input-number v-model="selected.style.outMarginTop" :min="0" :max="100" size="small" style="width: 96px" /> px
              </el-form-item>
              <el-form-item label="上下边距">
                <el-slider v-model="selected.style.marginY" :min="0" :max="100" class="sf-inline-slider" />
                <el-input-number v-model="selected.style.marginY" :min="0" :max="100" size="small" style="width: 96px" /> px
              </el-form-item>
              <el-form-item label="左右边距">
                <el-slider v-model="selected.style.marginX" :min="0" :max="100" class="sf-inline-slider" />
                <el-input-number v-model="selected.style.marginX" :min="0" :max="100" size="small" style="width: 96px" /> px
              </el-form-item>
              <el-form-item label="组件圆角"><el-input-number v-model="selected.style.radius" :min="0" :max="40" /> px</el-form-item>

              <div class="sf-sec">组件风格</div>
              <template v-if="selected.type === 'swiper'">
                <el-form-item label="风格">
                  <div class="sf-style-cards">
                    <div class="sf-style-card" :class="{ on: selected.style.swiperStyle === 'full' }" @click="selected.style.swiperStyle = 'full'">
                      <div class="sf-style-demo" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
                        <div style="width:70%;height:50%;background:#cfe4f7;border-radius:2px" />
                        <div style="display:flex;gap:3px"><span style="width:4px;height:4px;border-radius:50%;background:#999" /><span style="width:4px;height:4px;border-radius:50%;background:#ccc" /><span style="width:4px;height:4px;border-radius:50%;background:#ccc" /></div>
                      </div>
                      <div class="sf-style-card-name">全屏风格</div>
                    </div>
                    <div class="sf-style-card" :class="{ on: selected.style.swiperStyle === 'triple' }" @click="selected.style.swiperStyle = 'triple'">
                      <div class="sf-style-demo" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
                        <div style="width:80%;height:50%;display:flex;gap:2px;align-items:center"><div style="flex:1;height:70%;background:#cfe4f7;border-radius:1px" /><div style="flex:1.5;height:90%;background:#cfe4f7;border-radius:1px" /><div style="flex:1;height:70%;background:#cfe4f7;border-radius:1px" /></div>
                        <div style="display:flex;gap:3px"><span style="width:4px;height:4px;border-radius:50%;background:#999" /><span style="width:4px;height:4px;border-radius:50%;background:#ccc" /><span style="width:4px;height:4px;border-radius:50%;background:#ccc" /></div>
                      </div>
                      <div class="sf-style-card-name">三联风格</div>
                    </div>
                  </div>
                </el-form-item>
                <el-form-item label="指示点样式">
                  <el-radio-group v-model="selected.style.dotStyle">
                    <el-radio value="dot">圆点</el-radio>
                    <el-radio value="num">数字+文字</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="选中透明度">
                  <el-slider v-model="selected.style.activeOpacity" :min="0" :max="1" :step="0.1" style="flex:1" />
                  <span class="sf-hint" style="margin-left:8px">最大是1</span>
                </el-form-item>
              </template>
              <template v-if="selected.type === 'title'">
                <el-form-item label="对齐方式">
                  <el-radio-group v-model="selected.style.align">
                    <el-radio value="left">左对齐</el-radio>
                    <el-radio value="center">居中对齐</el-radio>
                    <el-radio value="right">右对齐</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="线条风格">
                  <el-radio-group v-model="selected.style.lineStyle">
                    <el-radio value="vline">垂直分割线</el-radio>
                    <el-radio value="hline">水平分割线</el-radio>
                    <el-radio value="none">无</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="主标题加粗">
                  <el-switch v-model="selected.style.bold" />
                </el-form-item>
              </template>
              <template v-if="selected.type === 'video'">
                <el-form-item label="视频样式">
                  <el-radio-group v-model="selected.style.videoRatio">
                    <el-radio value="16:9">16:9</el-radio>
                    <el-radio value="4:3">4:3</el-radio>
                    <el-radio value="1:1">1:1</el-radio>
                  </el-radio-group>
                </el-form-item>
              </template>
              <template v-if="selected.type === 'image'">
                <!-- ew 实测：单行展示仅上下布局显示（rowsShow 2/3/4张）；左右布局由下方框/线风格卡代替 -->
                <el-form-item v-if="settings.layout !== 'horizontal'" label="单行展示">
                  <el-radio-group v-model="selected.style.rowsShow">
                    <el-radio :value="2">2张</el-radio>
                    <el-radio :value="3">3张</el-radio>
                    <el-radio :value="4">4张</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="上传边框">
                  <el-radio-group v-model="selected.style.borderType">
                    <el-radio value="solid">直线</el-radio>
                    <el-radio value="dashed">虚线</el-radio>
                  </el-radio-group>
                </el-form-item>
              </template>
              <template v-if="Array.isArray(curStyleSchema.boxLine) && curStyleSchema.boxLine.length && (!curStyleSchema.hOnlyBoxLine || settings.layout === 'horizontal')">
                <div class="sf-style-cards">
                  <div v-for="bl in curStyleSchema.boxLine" :key="bl.value" class="sf-style-card" :class="{ on: selected.style.styleType === bl.value }" @click="selected.style.styleType = bl.value">
                    <div class="sf-style-demo">
                      <span v-if="bl.value === 'box' || bl.value === 'box1' || bl.value === 's1'" class="sd-bar sd-long" />
                      <template v-else-if="bl.value === 'box2' || bl.value === 's2'">
                        <span class="sd-bar sd-sm" />
                        <span class="sd-line" />
                      </template>
                      <template v-else-if="bl.value === 's3'">
                        <span class="sd-bar sd-sm" />
                        <span class="sd-line" />
                      </template>
                      <template v-else-if="bl.value === 'step'">
                        <span class="sd-bar sd-sm" />
                        <span class="sd-bar sd-sm" />
                      </template>
                      <template v-else-if="bl.value === 'slider'">
                        <span class="sd-slider" />
                      </template>
                      <span v-else class="sd-line" />
                    </div>
                    <div class="sf-style-card-name">{{ bl.label }}</div>
                  </div>
                </div>
              </template>
              <template v-if="curStyleSchema.icons">
                <div class="sf-style-cards">
                  <div v-for="ic in styleIcons" :key="ic.value" class="sf-style-card" :class="{ on: selected.style.icon === ic.value }" @click="selected.style.icon = ic.value">
                    <div class="sf-style-demo sf-icon-demo">{{ ic.glyph }}</div>
                  </div>
                </div>
              </template>
              <el-form-item v-for="row in curStyleRows" :key="row.key" :label="row.label">
                <el-slider v-model="selected.style[row.key]" :min="0" :max="row.max" class="sf-inline-slider" />
                <el-input-number v-model="selected.style[row.key]" :min="0" :max="row.max" size="small" style="width: 96px" /> px
              </el-form-item>

              <template v-if="curColorRows.length">
                <div class="sf-sec">组件颜色</div>
                <el-form-item v-for="row in curColorRows" :key="row.key" :label="row.label">
                  <el-color-picker v-model="selected.style[row.key]" size="small" />
                  <el-input v-model="selected.style[row.key]" size="small" style="width: 96px; margin-left: 8px" />
                  <el-button size="small" style="margin-left: 8px" @click="selected.style[row.key] = row.def">重置</el-button>
                </el-form-item>
              </template>
            </el-form>
          </div>
        </template>

        <!-- 全局样式（对齐 ew：右栏面板，非弹窗） -->
        <template v-else-if="panelMode === 'style'">
          <div class="sf-panel-head">全局样式</div>
          <div class="sf-sec">基础布局</div>
          <el-radio-group v-model="settings.layout">
            <el-radio-button value="vertical">上下布局</el-radio-button>
            <el-radio-button value="horizontal">左右布局</el-radio-button>
          </el-radio-group>
          <div class="sf-sec">距离属性</div>
          <div class="sf-dist-rows">
            <div v-for="row in distRows" :key="row.key" class="sf-dist-row">
              <span class="sf-dist-label">{{ row.label }}：</span>
              <el-slider v-if="!row.noSlider" v-model="settings.globalStyle[row.key]" :min="0" :max="row.max" class="sf-dist-slider" />
              <el-input-number v-model="settings.globalStyle[row.key]" :min="0" :max="row.max" size="small" style="width: 96px" />
              <span class="sf-dist-unit">px</span>
            </div>
          </div>
          <div class="sf-sec">页面背景 <span class="sf-sec-note">（嵌入式表单不生效）</span></div>
          <div class="sf-color-row">
            <span class="sf-color-label">背景类型：</span>
            <el-radio-group v-model="settings.globalStyle.pageBgType">
              <el-radio value="color">颜色</el-radio>
              <el-radio value="imgcolor">图片+颜色</el-radio>
            </el-radio-group>
          </div>
          <template v-if="settings.globalStyle.pageBgType === 'imgcolor'">
            <div class="sf-color-row">
              <span class="sf-color-label">背景图片：</span>
              <el-input v-model="settings.globalStyle.pageBgImage" size="small" style="flex: 1" placeholder="图片地址" />
              <el-button size="small" @click="imgPickerTarget = 'pageBg'; imgPickerShow = true">选择图片</el-button>
            </div>
            <div class="sf-color-row">
              <span class="sf-color-label">平铺方式：</span>
              <el-radio-group v-model="settings.globalStyle.bgRepeat">
                <el-radio value="repeat-x">左右重复</el-radio>
                <el-radio value="repeat-y">上下平铺</el-radio>
                <el-radio value="repeat">都平铺</el-radio>
                <el-radio value="no-repeat">不平铺</el-radio>
              </el-radio-group>
            </div>
            <div class="sf-color-row">
              <span class="sf-color-label">左右位置：</span>
              <el-radio-group v-model="settings.globalStyle.bgPosX">
                <el-radio value="left">左</el-radio>
                <el-radio value="center">中</el-radio>
                <el-radio value="right">右</el-radio>
              </el-radio-group>
            </div>
            <div class="sf-color-row">
              <span class="sf-color-label">上下位置：</span>
              <el-radio-group v-model="settings.globalStyle.bgPosY">
                <el-radio value="top">上</el-radio>
                <el-radio value="center">中</el-radio>
                <el-radio value="bottom">下</el-radio>
              </el-radio-group>
            </div>
            <div class="sf-color-row">
              <span class="sf-color-label">图片样式：</span>
              <el-radio-group v-model="settings.globalStyle.bgImgStyle">
                <el-radio value="custom">自定义</el-radio>
                <el-radio value="fill">填充</el-radio>
                <el-radio value="fixed">图片固定比例</el-radio>
              </el-radio-group>
            </div>
            <template v-if="settings.globalStyle.bgImgStyle === 'custom'">
              <div class="sf-color-row">
                <span class="sf-color-label">背景图宽：</span>
                <el-slider v-model="settings.globalStyle.bgImgW" :min="0" :max="100" class="sf-dist-slider" />
                <el-input-number v-model="settings.globalStyle.bgImgW" :min="0" :max="100" size="small" style="width: 96px" />
                <span class="sf-dist-unit">%</span>
              </div>
              <div class="sf-color-row">
                <span class="sf-color-label">背景图高：</span>
                <el-slider v-model="settings.globalStyle.bgImgH" :min="0" :max="100" class="sf-dist-slider" />
                <el-input-number v-model="settings.globalStyle.bgImgH" :min="0" :max="100" size="small" style="width: 96px" />
                <span class="sf-dist-unit">%</span>
              </div>
            </template>
          </template>
          <div class="sf-color-row">
            <span class="sf-color-label">背景颜色：</span>
            <el-color-picker v-model="settings.globalStyle.pageBgColor" size="small" />
            <el-input v-model="settings.globalStyle.pageBgColor" size="small" style="width: 96px" />
            <el-button size="small" @click="settings.globalStyle.pageBgColor = '#f3f3f3'">重置</el-button>
          </div>
          <div class="sf-sec">组件颜色</div>
          <div class="sf-color-grid">
            <div v-for="row in colorRows" :key="row.key" class="sf-color-row">
              <span class="sf-color-label">{{ row.label }}：</span>
              <el-color-picker v-model="settings.globalStyle[row.key]" size="small" />
              <el-input v-model="settings.globalStyle[row.key]" size="small" style="width: 88px" />
              <el-button size="small" @click="settings.globalStyle[row.key] = row.def">重置</el-button>
            </div>
          </div>
        </template>

        <!-- 表单设置 -->
        <template v-else>
          <div class="sf-panel-head">表单设置</div>
          <div class="sf-seg">
            <div class="sf-seg-item" :class="{ on: formSettingsTab === 'basic' }" @click="formSettingsTab = 'basic'">基础设置</div>
            <div class="sf-seg-item" :class="{ on: formSettingsTab === 'logic' }" @click="formSettingsTab = 'logic'">逻辑设置</div>
          </div>
          <div v-if="formSettingsTab === 'basic'" class="sf-prop-form">
            <el-form label-width="92px" size="small">
              <div class="sf-sec">基础信息</div>
              <el-form-item label="表单名称"><el-input v-model="settings.basic.name" /></el-form-item>
              <el-form-item label="收集时间">
                <el-date-picker v-model="settings.basic.collectStart" type="datetime" placeholder="开始日期" value-format="YYYY-MM-DD HH:mm" style="width: 170px" />
                <span style="margin: 0 6px">至</span>
                <el-date-picker v-model="settings.basic.collectEnd" type="datetime" placeholder="结束日期" value-format="YYYY-MM-DD HH:mm" style="width: 170px" />
                <div class="sf-hint sf-hint-block">(*注：嵌入式表单不生效)</div>
              </el-form-item>
              <el-form-item label="收集份数">
                <el-input-number v-model="settings.basic.collectLimit" :min="0" />
                <span class="sf-hint" style="margin-left: 8px">0 为不限制（*注：嵌入式表单不生效）</span>
              </el-form-item>
              <el-form-item label="允许修改"><el-switch v-model="settings.basic.allowModify" /></el-form-item>
              <div class="sf-sec">填写设置 <span class="sf-sec-note">（*注：该模块嵌入式表单不生效）</span></div>
              <el-form-item label="填表人群">
                <el-radio-group v-model="settings.basic.fillCrowd">
                  <el-radio value="all">全部（包含游客）</el-radio>
                  <el-radio value="auth">授权用户</el-radio>
                  <el-radio value="level">指定等级</el-radio>
                  <el-radio value="pwd">密码</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item v-if="settings.basic.fillCrowd === 'level'" label=" ">
                <el-select v-model="settings.basic.crowdLevels" multiple placeholder="请选择等级（可多选）" style="width: 220px">
                  <el-option v-for="lv in levelOptions" :key="lv.value" :label="lv.label" :value="lv.value" />
                </el-select>
              </el-form-item>
              <el-form-item v-if="settings.basic.fillCrowd === 'pwd'" label=" ">
                <el-input v-model="settings.basic.crowdPwd" :maxlength="20" placeholder="密码最多20位" style="width: 220px" />
              </el-form-item>
              <el-form-item label="提交周期">
                <el-radio-group v-model="settings.basic.submitCycle">
                  <el-radio-button value="permanent">永久</el-radio-button>
                  <el-radio-button value="day">每天</el-radio-button>
                  <el-radio-button value="week">每周</el-radio-button>
                  <el-radio-button value="month">每月</el-radio-button>
                  <el-radio-button value="year">每年</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="次数">
                <el-input-number v-model="settings.basic.submitTimes" :min="0" />
                <span style="margin-left: 6px">次</span>
                <div class="sf-hint sf-hint-block">{{ settings.basic.fillCrowd === 'all' ? '0为不限制（游客填写时不受次数限制）' : '0 为不限制' }}</div>
              </el-form-item>
              <el-form-item label="分享标题"><el-input v-model="settings.basic.shareTitle" placeholder="请输入分享标题" /></el-form-item>
              <el-form-item label="分享图片">
                <el-input v-model="settings.basic.shareImage" placeholder="请选择图片">
                  <template #append><el-button @click="imgPickerTarget = 'share'; imgPickerShow = true">选择图片</el-button></template>
                </el-input>
              </el-form-item>
              <div class="sf-sec">提交设置 <span class="sf-sec-note">（*注：该模块嵌入式表单不生效）</span></div>
              <el-form-item label="二次确认"><el-switch v-model="settings.submit.secondConfirm" /></el-form-item>
              <el-form-item label="跳转页面">
                <el-input v-model="settings.submit.jumpLink" placeholder="请选择链接或输入链接地址" />
                <div class="sf-hint sf-hint-block">不选则停留当前页面不进行跳转</div>
              </el-form-item>
            </el-form>
          </div>
          <div v-else class="sf-prop-form">
            <div class="sf-logic-tip">提示：请添加完所有组件之后再设置该逻辑部分（分页以及提交按钮不参与逻辑部分设置）。你可以为选择类字段（单项选择、多项选择、评分、下拉选择）设定规则，填写者选择某字段的某选项后，显示该字段之后的其他字段。操作文档：点击跳转</div>
            <div v-for="(rule, ri) in settings.logic" :key="ri" class="sf-rule">
              <div class="sf-rule-title" @click="toggleRule(ri)">
                <span>规则 {{ ri + 1 }}</span>
                <span class="sf-rule-arrow" :class="{ open: ruleOpen(ri) }">⌄</span>
                <el-button text type="danger" @click.stop="settings.logic.splice(ri, 1)">删除</el-button>
              </div>
              <template v-if="ruleOpen(ri)">
                <div class="sf-rule-cond-label">当满足以下条件时</div>
                <div class="sf-rule-box">
                  <div v-for="(cond, ci) in rule.conditions" :key="ci" class="sf-rule-cond">
                    <el-select
                      v-if="ci === 0 && rule.conditions.length > 1"
                      v-model="rule.operator" class="sf-rule-op" size="small">
                      <el-option label="或" value="or" />
                      <el-option label="且" value="and" />
                    </el-select>
                    <span v-else-if="ci > 0" class="sf-rule-op-text">{{ rule.operator === 'and' ? '且' : '或' }}</span>
                    在
                    <el-select v-model="cond.compId" placeholder="请选择" style="width: 140px" @change="onCondCompChange(cond)">
                      <el-option v-for="c in choiceComponents" :key="c.id" :label="c.content.label" :value="c.id" />
                    </el-select>
                    <span v-if="cond.compId" class="sf-rule-cmp">{{ comparatorLabel(cond) }}</span>
                    <!-- 单选/多选：选择了任一（可多选选项） -->
                    <el-select v-if="condType(cond.compId) === 'radio' || condType(cond.compId) === 'checkbox'" v-model="cond.option" multiple placeholder="请选择" style="width: 140px" :disabled="!cond.compId">
                      <el-option v-for="opt in optionsOf(cond.compId)" :key="opt.value" :label="opt.label" :value="opt.value" />
                    </el-select>
                    <!-- 下拉：选择了（单选） -->
                    <el-select v-else-if="condType(cond.compId) === 'select'" :model-value="cond.option[0]" placeholder="请选择" style="width: 140px" :disabled="!cond.compId" @update:model-value="cond.option = [$event]">
                      <el-option v-for="opt in optionsOf(cond.compId)" :key="opt.value" :label="opt.label" :value="opt.value" />
                    </el-select>
                    <!-- 评分：介于 min ~ max -->
                    <template v-else-if="condType(cond.compId) === 'rate'">
                      <el-select :model-value="cond.option[0]" placeholder="最低" style="width: 84px" :disabled="!cond.compId" @update:model-value="cond.option[0] = $event">
                        <el-option v-for="n in rateMaxOf(cond.compId)" :key="'min'+n" :label="n" :value="n" />
                      </el-select>
                      <span style="margin: 0 4px">~</span>
                      <el-select :model-value="cond.option[1]" placeholder="最高" style="width: 84px" :disabled="!cond.compId" @update:model-value="cond.option[1] = $event">
                        <el-option v-for="n in rateMaxOf(cond.compId)" :key="'max'+n" :label="n" :value="n" />
                      </el-select>
                    </template>
                    <el-button link type="danger" @click="removeCondition(rule, ci)">删除</el-button>
                  </div>
                  <el-button link type="primary" @click="addCondition(rule)">添加条件</el-button>
                </div>
                <div class="sf-rule-cond">
                  <el-radio-group v-model="rule.action">
                    <el-radio value="show">则显示字段</el-radio>
                    <el-radio value="end">则结束表单</el-radio>
                  </el-radio-group>
                </div>
                <div v-if="rule.action === 'show'" class="sf-rule-cond">
                  显示：
                  <el-select v-model="rule.showIds" multiple placeholder="选择要显示的字段" style="width: 280px">
                    <el-option v-for="c in showCandidate(rule)" :key="c.id" :label="c.content.label" :value="c.id" />
                  </el-select>
                </div>
              </template>
            </div>
            <div class="sf-rule-actions">
              <el-button type="primary" @click="addRule">+ 添加规则</el-button>
              <el-button type="primary" @click="confirmLogic">确定</el-button>
              <span class="sf-hint">请点击确认按钮完成逻辑设置部分</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <MaterialPicker v-model="imgPickerShow" @confirm="onPickImg" />
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { getSuperForm, updateSuperForm } from '../../../../api/index.js';
import {
  COMPONENT_PALETTE, COMPONENT_ICONS, createComponent, defaultSettings, styleSchema, migrateStyle, migrateContent, componentStyleVars, COMPONENT_LABEL,
} from './components.js';
import ComponentPreview from './ComponentPreview.vue';
import MaterialPicker from '../design/MaterialPicker.vue';

const props = defineProps({ formId: [Number, String], formName: String });
const emit = defineEmits(['close']);

const palette = COMPONENT_PALETTE;
const ICONS = COMPONENT_ICONS;
const components = ref([]);
const settings = reactive(defaultSettings());
const selectedId = ref(null);
// 右栏三模式：props=组件属性 / style=全局样式 / settings=表单设置（对齐 ew）
const panelMode = ref('settings');
const propTab = ref('content');
const formSettingsTab = ref('basic');
// 批量添加选项（textarea 逐行 → options）
const batchOptionsText = ref('');
// 填表人群「指定等级」候选项（对齐 ew「请选择等级（可多选）」；等级体系待接入，先空态）
const levelOptions = ref([]);
const saving = ref(false);
const imgPickerShow = ref(false);
const imgPickerTarget = ref('share'); // share=分享图片 / pageBg=页面背景图片 / compBg=组件背景图片
function onPickImg(url) {
  if (!url) return;
  if (imgPickerTarget.value === 'pageBg') settings.globalStyle.pageBgImage = url;
  else if (imgPickerTarget.value === 'compBg' && selected.value) selected.value.style.bgImage = url;
  else if (imgPickerTarget.value === 'sampleImg' && selected.value) selected.value.content.sampleImg = url;
  else settings.basic.shareImage = url;
}

// 图片上传「图片类型」联动 —— 1:1 复刻 ew imgType-editor.handler（含默认文案判断的怪癖）
// 注：'图片上传' 是本项目旧默认标题，与 ew 的 '上传图片' 同样视为「未改过」参与联动
function onImgTypeChange(t) {
  const c = selected.value.content;
  const untouched = !c.label || c.label === '上传图片' || c.label === '图片上传';
  if (t === 'idcard') {
    if (untouched) c.label = '上传身份证照片';
    if (!c.placeholder) c.placeholder = '身份证照片仅用于实名认证';
    c.minCount = 0; c.maxCount = 0;
  } else if (t === 'license') {
    if (untouched) c.label = '上传营业执照';
    if (!c.placeholder) c.placeholder = '营业执照仅用于实名认证';
    c.minCount = 0; c.maxCount = 0;
  } else {
    if (!c.label || c.label === '上传身份证照片' || c.label === '上传营业执照') c.label = '上传图片';
    if (c.placeholder === '身份证照片仅用于实名认证' || c.placeholder === '营业执照仅用于实名认证') c.placeholder = '';
  }
}

const selected = computed(() => components.value.find((c) => c.id === selectedId.value) || null);
// 当前组件类型的样式 schema（ew 每种组件都有独立的 组件风格 / 组件颜色 行，不可共用一套）
const curStyleSchema = computed(() => styleSchema(selected.value?.type));
// ew 部分行仅左右布局显示（如图片上传的 上传框大小/图片圆角/图片背景/图片边框），按当前布局过滤
const curStyleRows = computed(() => (curStyleSchema.value.styleRows || []).filter((r) => !r.hOnly || settings.layout === 'horizontal'));
const curColorRows = computed(() => (curStyleSchema.value.colorRows || []).filter((r) => !r.hOnly || settings.layout === 'horizontal'));
// 选择类字段（对齐 ew：含评分）
const choiceComponents = computed(() => components.value.filter((c) => ['radio', 'checkbox', 'select', 'rate'].includes(c.type)));
// 提交按钮上下文提示（对齐 ew：不同业务场景按钮功能说明）
const SUBMIT_CONTEXT_HINTS = {
  general: '通用表单，提交即完成',
  goods: '商品表单：提交后通常进入下单/购买流程',
  activity: '活动表单：提交即报名/参与活动',
  member: '会员表单：提交即开通/绑定会员',
  article: '文章表单：提交即订阅/收藏文章',
  video: '视频表单：提交即观看/互动视频',
  audio: '音频表单：提交即收听/互动音频',
};
const submitContextHint = computed(() => SUBMIT_CONTEXT_HINTS[selected.value?.content?.context] || SUBMIT_CONTEXT_HINTS.general);
// 附件可上传的扩展名白名单（不选 = 不限）
const ATTACH_EXTS = ['doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'pdf', '7z', 'zip', 'rar', 'mp4', 'mov', 'mkv', 'avi'];
// 全局样式距离属性行（对齐 ew：两个「左右边距」分别为页面级 / 组件级；圆角行无滑杆）
const distRows = [
  { key: 'marginTop', label: '顶外边距', max: 100 },
  { key: 'marginY', label: '上下边距', max: 100 },
  { key: 'marginX', label: '左右边距', max: 100 },
  { key: 'radius', label: '组件圆角', max: 40, noSlider: true },
  { key: 'compMarginX', label: '左右边距', max: 100 },
  { key: 'inputRadius', label: '输入框圆角', max: 40, noSlider: true },
];
// 组件颜色行（对齐 ew：底框边框/标题颜色/输入文本/错误提示，两列 + 重置）
const colorRows = [
  { key: 'cBorder', label: '底框边框', def: '#F5F2F2' },
  { key: 'cTitle', label: '标题颜色', def: '#000000' },
  { key: 'cInput', label: '输入文本', def: '#333333' },
  { key: 'cError', label: '错误提示', def: '#ED4F4F' },
];
// 组件风格图标卡（评分等组件：对齐 ew 24~26-*.png）
const styleIcons = [
  { value: 'smile', glyph: '☺' },
  { value: 'heart', glyph: '♥' },
  { value: 'star', glyph: '★' },
];

// 设计器手机预览应用全局样式（此前预览完全不生效）
const phoneStyle = computed(() => {
  const g = settings.globalStyle || {};
  const s = {
    marginTop: (g.marginTop || 0) + 'px',
    paddingTop: (g.marginY || 0) + 'px',
    paddingBottom: (g.marginY || 0) + 'px',
    paddingLeft: (g.marginX || 0) + 'px',
    paddingRight: (g.marginX || 0) + 'px',
    // 全局圆角（组件圆角 / 输入框圆角），供预览内组件经 CSS 变量消费
    '--g-radius': (g.radius || 0) + 'px',
    '--g-input-radius': (g.inputRadius != null ? g.inputRadius : 3) + 'px',
    // 组件颜色（对齐 ew）
    '--c-border-color': g.cBorder || '#F5F2F2',
    '--c-title-color': g.cTitle || '#000000',
    '--c-input-color': g.cInput || '#333333',
    '--c-error-color': g.cError || '#ED4F4F',
  };
  // 页面背景：颜色 / 图片+颜色（平铺/位置/图片样式对齐 ew）
  if (g.pageBgColor) s.backgroundColor = g.pageBgColor;
  if (g.pageBgType === 'imgcolor' && g.pageBgImage) {
    s.backgroundImage = 'url("' + g.pageBgImage + '")';
    s.backgroundRepeat = g.bgRepeat || 'repeat-x';
    s.backgroundPosition = (g.bgPosX || 'left') + ' ' + (g.bgPosY || 'top');
    if (g.bgImgStyle === 'fill') s.backgroundSize = 'cover';
    else if (g.bgImgStyle === 'fixed') s.backgroundSize = 'contain';
    else s.backgroundSize = (g.bgImgW != null ? g.bgImgW : 20) + '% ' + (g.bgImgH != null ? g.bgImgH : 20) + '%';
  }
  return s;
});
// 组件级样式：对齐 ew 四段（组件背景 / 组件整体 / 组件风格 / 组件颜色），按类型 schema 逐组件生效
function compWrapStyle(comp) {
  const s = componentStyleVars(comp, settings.globalStyle || {});
  // 评分额外别名（预览沿用旧变量名）
  const st = comp.style || {};
  if (comp.type === 'rate') {
    s['--rate-active'] = st.activeColor || '#F7BA2A';
    s['--rate-inactive'] = st.inactiveColor || '#C6D1DE';
    s['--rate-desc'] = st.descColor || '#999999';
    s['--rate-title'] = st.labelColor || '#000000';
  }
  return s;
}

function openPanel(mode) { panelMode.value = mode; }
function selectComp(id) { selectedId.value = id; panelMode.value = 'props'; }
// 组件是否在 C 端显示：设计器「是否显示=隐藏」(content.visible === false) 即隐藏；缺省按显示，与 ew 一致。
// 设计器画布里仍保留（半透明 + 虚线 + 角标），保证可点选改回显示，不直接消失。
function compVisible(c) { return !(c && c.content && c.content.visible === false); }
function optionsOf(compId) {
  const c = components.value.find((x) => x.id === compId);
  if (!c) return [];
  if (c.type === 'rate') {
    const max = c.content.max || 5;
    return Array.from({ length: max }, (_, i) => ({ label: `${i + 1} 分`, value: String(i + 1) }));
  }
  return c.content?.options || [];
}
function showCandidate(rule) {
  const condIds = (rule.conditions || []).map((c) => c.compId);
  return components.value.filter((c) => !condIds.includes(c.id) && c.type !== 'submit');
}

// —— 逻辑规则：对齐 ew（选择类字段 radio/checkbox/select/rate；多条件且/或；评分介于；结束表单需提交按钮） ——
const ruleCollapse = ref({});
function ruleOpen(i) { return ruleCollapse.value[i] !== false; }
function toggleRule(i) { ruleCollapse.value[i] = !ruleOpen(i); }
function condType(compId) {
  const c = components.value.find((x) => x.id === compId);
  return c ? c.type : '';
}
function comparatorLabel(cond) {
  const t = condType(cond.compId);
  if (t === 'radio' || t === 'checkbox') return '选择了任一';
  if (t === 'select') return '选择了';
  if (t === 'rate') return '介于';
  return '';
}
function rateMaxOf(compId) {
  const c = components.value.find((x) => x.id === compId);
  return (c && c.content && c.content.max) || 5;
}
function emptyCondition() { return { compId: '', comparator: '', option: [] }; }
function onCondCompChange(cond) {
  cond.comparator = comparatorLabel(cond) ? { radio: 'select_any', checkbox: 'select_any', select: 'equal', rate: 'between' }[condType(cond.compId)] || '' : '';
  cond.option = condType(cond.compId) === 'rate' ? ['', ''] : [];
}
function addRule() { settings.logic.push({ operator: 'or', conditions: [emptyCondition()], action: 'show', showIds: [] }); }
function addCondition(rule) { rule.conditions.push(emptyCondition()); }
function removeCondition(rule, i) { if (rule.conditions.length > 1) rule.conditions.splice(i, 1); }
function confirmLogic() {
  // 校验1：则结束表单必须有提交按钮（对齐 ew 文案）
  const hasSubmit = components.value.some((c) => c.type === 'submit');
  if (settings.logic.some((r) => r.action === 'end') && !hasSubmit) {
    ElMessage.error('请确保DIY表单中存在提交按钮！');
    return;
  }
  // 校验2：不允许重复条件（同字段+同选项）
  const seen = new Set();
  for (const r of settings.logic) {
    for (const c of r.conditions) {
      if (!c.compId || !c.option || (Array.isArray(c.option) ? c.option.length === 0 : c.option === '')) continue;
      const key = c.compId + '|' + (Array.isArray(c.option) ? c.option.join(',') : c.option);
      if (seen.has(key)) {
        ElMessage.error('逻辑条件设置中存在相同项，请修改后再保存！');
        return;
      }
      seen.add(key);
    }
  }
  ElMessage.success('逻辑设置已应用，保存页面后生效');
}

function setLayout(v) { settings.layout = v; }
function addComponent(type) {
  components.value.push(createComponent(type));
  selectedId.value = components.value[components.value.length - 1].id;
  panelMode.value = 'props'; // 添加后右栏自动切到该组件属性（对齐 ew）
}
// 批量添加选项：逐行解析，追加到当前选中组件的 options（radio/checkbox/select）
function batchAddOptions() {
  const comp = selected.value;
  if (!comp) return;
  const lines = (batchOptionsText.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return;
  const opts = comp.content.options || (comp.content.options = []);
  let n = opts.length;
  for (const line of lines) {
    n += 1;
    opts.push({ label: line, value: String(n), image: '' });
  }
  batchOptionsText.value = '';
}
function remove(idx) {
  const id = components.value[idx].id;
  components.value.splice(idx, 1);
  if (selectedId.value === id) {
    selectedId.value = null;
    if (panelMode.value === 'props') panelMode.value = 'settings';
  }
}

// ——— 真·拖拽：组件库拖入画布 / 画布内重排 ———
const dragType = ref(null); // 从组件库拖入的类型
const dragId = ref(null);   // 画布内拖动的组件 id
const dragOverIdx = ref(-1); // 当前悬停插入位置

function onPaletteDrag(type, ev) {
  dragType.value = type;
  dragId.value = null;
  ev.dataTransfer.effectAllowed = 'copy';
  ev.dataTransfer.setData('text/plain', type);
}
function onCompDrag(id, ev) {
  dragId.value = id;
  dragType.value = null;
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.setData('text/plain', id);
}
function onDrop(targetIdx, ev) {
  ev.preventDefault();
  if (dragType.value) {
    const comp = createComponent(dragType.value);
    const i = Math.min(targetIdx, components.value.length);
    components.value.splice(i, 0, comp);
    selectedId.value = comp.id;
    panelMode.value = 'props';
  } else if (dragId.value) {
    const from = components.value.findIndex((c) => c.id === dragId.value);
    if (from === -1) return resetDrag();
    const [moved] = components.value.splice(from, 1);
    let to = targetIdx;
    if (from < targetIdx) to = targetIdx - 1;
    components.value.splice(to, 0, moved);
  }
  resetDrag();
}
function resetDrag() {
  dragType.value = null;
  dragId.value = null;
  dragOverIdx.value = -1;
}

async function load() {
  try {
    const f = await getSuperForm(props.formId);
    const cfg = f.config || {};
    const def = defaultSettings();
    components.value = Array.isArray(cfg.components) ? cfg.components : [];
    // 组件样式迁移：旧数据用通用样式，按类型补齐 ew 各组件专用字段
    components.value.forEach((c) => migrateStyle(c));
    // 组件内容迁移：旧数据缺图片上传的 图片类型/示例图/最少上传 等字段时补齐
    components.value.forEach((c) => migrateContent(c));
    Object.assign(settings, def, cfg.settings || {});
    // 分组深合并，避免旧数据缺字段时面板绑定 undefined
    settings.basic = { ...def.basic, ...(cfg.settings?.basic || {}) };
    settings.submit = { ...def.submit, ...(cfg.settings?.submit || {}) };
    settings.globalStyle = { ...def.globalStyle, ...(cfg.settings?.globalStyle || {}) };
    // 逻辑规则统一为多条件结构（旧数据 compId/option → conditions[0]；option 统一数组；补 operator）
    settings.logic = (Array.isArray(cfg.settings?.logic) ? cfg.settings.logic : []).map((r) => ({
      ...r,
      operator: r.operator || 'or',
      action: r.action || 'show',
      showIds: r.showIds || [],
      conditions: (r.conditions && r.conditions.length) ? r.conditions : [{ compId: r.compId || '', comparator: '', option: [] }],
    }));
    settings.logic.forEach((r) => r.conditions.forEach((c) => {
      if (!Array.isArray(c.option)) c.option = c.option === '' || c.option == null ? [] : [c.option];
      if (!c.comparator) c.comparator = { radio: 'select_any', checkbox: 'select_any', select: 'equal', rate: 'between' }[condType(c.compId)] || '';
    }));
    // 填写设置旧值迁移（once→permanent / daily→day；fillCrowd 非法值回 all）
    if (settings.basic.submitCycle === 'once') settings.basic.submitCycle = 'permanent';
    if (settings.basic.submitCycle === 'daily') settings.basic.submitCycle = 'day';
    if (!['all', 'auth', 'level', 'pwd'].includes(settings.basic.fillCrowd)) settings.basic.fillCrowd = 'all';
  } catch (e) { ElMessage.error(e.message || '加载失败'); }
}

async function save(publish) {
  saving.value = true;
  // 首条件回写 compId/option，兼容旧版 C 端渲染
  const logicCompat = settings.logic.map((r) => ({
    ...r,
    compId: r.conditions?.[0]?.compId || '',
    option: r.conditions?.[0]?.option || '',
  }));
  const payload = {
    name: settings.basic.name || '未命名表单',
    status: publish ? 'published' : undefined,
    config: { components: components.value, settings: JSON.parse(JSON.stringify({ ...settings, logic: logicCompat })) },
  };
  try {
    await updateSuperForm(props.formId, payload);
    ElMessage.success(publish ? '已保存并发布' : '已保存草稿');
    if (publish) emit('close');
  } catch (e) { ElMessage.error(e.message || '保存失败'); }
  finally { saving.value = false; }
}

onMounted(load);
</script>

<style scoped>
.sf-designer { height: 100%; display: flex; flex-direction: column; background: #f5f6f8; }
/* —— 顶栏：对齐 ew 深色横条 —— */
.sf-topbar { display: flex; align-items: center; gap: 14px; padding: 0 16px; height: 48px; background: #fff; border-bottom: 1px solid #ebedf0; flex-shrink: 0; }
.sf-title { font-weight: 600; color: #303133; font-size: 15px; }
.sf-tb-group { display: flex; gap: 8px; align-items: center; }
.sf-tb-label { color: #606266; font-size: 13px; }
.sf-tb-btn { border: 1px solid #dcdfe6; background: #fff; color: #303133; font-size: 13px; padding: 5px 14px; border-radius: 4px; cursor: pointer; transition: all .15s; }
.sf-tb-btn:hover { color: #409eff; border-color: #c6e2ff; background: #ecf5ff; }
.sf-tb-btn.on, .sf-tb-btn.on:hover { background: #409eff; border-color: #409eff; color: #fff; }
.sf-tb-back { background: transparent; border: none; color: #409eff; padding: 5px 8px; }
.sf-tb-right { margin-left: auto; display: flex; gap: 20px; align-items: center; }
.sf-tb-link { border: none; background: transparent; color: #606266; font-size: 13px; cursor: pointer; padding: 14px 2px; border-bottom: 2px solid transparent; }
.sf-tb-link:hover { color: #409eff; }
.sf-tb-link.on { color: #409eff; border-bottom-color: #409eff; }
.sf-tb-ico { font-size: 12px; margin-right: 2px; }
.sf-body { flex: 1; display: grid; grid-template-columns: 252px 1fr 360px; min-height: 0; }
/* —— 组件库：对齐 ew 原版（灰色分组条 + 3 列图标卡片 + 表格线网格） —— */
.sf-palette { background: #fff; border-right: 1px solid #ebedf0; overflow: auto; padding: 0; }
.sf-pal-group { margin-bottom: 0; }
.sf-pal-cat { background: #f5f6f8; border-bottom: 1px solid #ebedf0; padding: 9px 12px; font-size: 13px; color: #333; font-weight: 500; position: sticky; top: 0; z-index: 1; }
.sf-pal-items { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #f0f1f3; }
.sf-pal-item { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 8px; padding: 14px 4px 12px; cursor: pointer; background: #fff; user-select: none; transition: background .15s; }
.sf-pal-item:hover { background: #f7fbf9; }
.sf-pal-item:hover .sf-pal-label { color: #165dff; }
.sf-pal-fill { background: #fff; }
.sf-pal-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sf-pal-icon svg { width: 26px; height: 26px; display: block; }
.sf-pal-label { font-size: 12px; color: #333; line-height: 1.2; text-align: center; }
.sf-canvas { overflow: auto; display: flex; justify-content: center; align-items: flex-start; padding: 24px; }
.sf-phone { width: 375px; min-height: 640px; background: #f2f3f5; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.08); display: flex; flex-direction: column; overflow: hidden; }
/* 状态栏（浅色，对齐页面装修预览）+ 标题栏（白，含小程序胶囊） */
.sf-phone-status { height: 28px; background: #fff; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; flex-shrink: 0; }
.sf-phone-time { font-size: 14px; font-weight: 600; color: #1d1d1f; }
.sf-phone-icons { display: flex; align-items: center; gap: 5px; }
.sf-phone-nav { height: 36px; background: #fff; display: flex; align-items: center; justify-content: center; position: relative; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
.sf-phone-nav-title { font-size: 14px; font-weight: 500; color: #303133; }
.sf-phone-capsule { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 11px; color: #606266; border: 1px solid #e8e8e8; border-radius: 10px; padding: 1px 8px; background: #fafafa; }
.sf-phone-body { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 14px; align-content: flex-start; background: #f2f3f5; }
.sf-phone-body.horizontal { flex-direction: row; flex-wrap: wrap; align-content: flex-start; align-items: flex-start; }
/* 左右布局：每个字段约占半行（对齐 C 端 .sf-field 的 flex:1 1 45%） */
.sf-phone-body.horizontal .sf-comp-wrap { flex: 1 1 45%; box-sizing: border-box; min-width: 0; }
/* 线风格：输入类控件去边框，仅保留底线（对齐 ew 组件风格） */
.sf-comp-wrap.cs-line :deep(.cmpv-input),
.sf-comp-wrap.cs-line :deep(.cmpv-select),
.sf-comp-wrap.cs-line :deep(.cmpv-loc),
.sf-comp-wrap.cs-line :deep(.cmpv-auth),
.sf-comp-wrap.cs-line :deep(.cmpv-download),
.sf-comp-wrap.cs-line :deep(.cmpv-upload) { border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); border-radius: 0; background: transparent; }
.sf-comp-wrap { position: relative; }
.sf-drop-line { height: 0; border-top: 2px solid #409eff; margin: 3px 2px; }
.sf-comp { position: relative; border: 1px solid transparent; border-radius:8px; padding: 8px; cursor: grab; transition: opacity .15s; }
.sf-comp:active { cursor: grabbing; }
.sf-comp.active { border-color: #409eff; }
/* 设计器画布：是否显示=隐藏 的组件半透明 + 虚线框（保留仍可点选改回显示） */
.sf-comp.is-hidden { opacity: .32; border: 1px dashed #c0c4cc; outline: 1px dashed #c0c4cc; outline-offset: 2px; }
.sf-comp.is-hidden.active { opacity: 1; }
.sf-hidden-badge { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(144,147,153,.92); color: #fff; font-size: 12px; padding: 2px 10px; border-radius: 10px; pointer-events: none; z-index: 3; white-space: nowrap; }
.sf-comp-ops { position: absolute; top: -12px; right: 6px; display: flex; gap: 6px; background: #409eff; color: #fff; border-radius: 4px; padding: 2px 6px; font-size: 12px; z-index: 2; }
.sf-comp-ops span { cursor: pointer; }
.sf-empty { color: #c0c4cc; font-size: 13px; text-align: center; margin-top: 60px; }
.sf-props { background: #fff; border-left: 1px solid #ebeef5; overflow: auto; padding: 14px; }
.sf-prop-form { margin-top: 8px; }
.sf-hint { color: #909399; font-size: 12px; margin-left: 6px; }
.sf-hint-block { margin-left: 0; margin-top: 4px; display: block; }
.sf-sample-img { display: flex; align-items: center; }
/* ew 相机图标（iconfont \e6e7，字体取自 ew 原包 fonts/iconfont.2d166a51.woff2） */
@font-face { font-family: 'SfIconfont'; src: url('../../../../assets/superform/iconfont.woff2') format('woff2'); }
.sf-camera-icon { font-family: 'SfIconfont'; font-style: normal; color: #ADBAC6; font-size: 26px; }
.sf-camera-icon::before { content: '\e6e7'; }
.sf-sample-box { width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; border: 1px solid #ebeef5; border-radius: 4px; background: #f7f9fa; overflow: hidden; cursor: pointer; }
.sf-sample-box img { width: 100%; height: 100%; object-fit: cover; }
.sf-limit-row { display: flex; align-items: center; gap: 10px; width: 100%; }
.sf-limit-label { font-size: 13px; color: #606266; white-space: nowrap; }
.sf-limit-slider { flex: 1; }
.sf-limit-slider .el-slider__input { width: 60px; }
/* —— 图片上传「上传-示例 / 未上传-示例」引导卡（对齐 ew 内容面板普通类型） —— */
.sf-img-demo { display: flex; gap: 10px; width: 100%; }
.sf-img-demo-card { flex: 1; min-width: 0; border: 1px solid #e4e7ed; background: #fff; }
.sf-img-demo-head { height: 30px; line-height: 30px; text-align: center; background: #909399; color: #fff; font-size: 13px; font-weight: 600; letter-spacing: 1px; }
.sf-img-demo-body { padding: 12px; display: flex; align-items: center; justify-content: center; }
.sf-img-demo-box { width: 100%; max-width: 110px; aspect-ratio: 1 / 1; border: 1px dashed #d3d8de; background: #fafbfc; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.sf-img-demo-box img { width: 100%; height: 100%; object-fit: cover; }
.sf-img-demo-ph { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.sf-img-demo-photo { position: relative; width: 72%; height: 54%; border-radius: 6px; background: linear-gradient(180deg, #e9ecf0 0%, #d9dee4 100%); overflow: hidden; }
.sf-img-demo-line { position: absolute; left: 14%; right: 14%; bottom: 16%; height: 4px; border-radius: 2px; background: #c3cad2; }
.sf-img-demo-line.short { right: 32%; bottom: 32%; background: #cdd4db; }
.sf-img-demo-badge { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 34px; height: 34px; border-radius: 50%; background: rgba(96, 98, 102, 0.78); display: flex; align-items: center; justify-content: center; }
.sf-img-demo-cam { color: #fff; font-size: 14px; }
.sf-img-demo-cam-lg { font-size: 26px; }
/* —— 右栏面板（对齐 ew：蓝条标题 + 大块分段 tab + 灰色分区条） —— */
.sf-panel-head { font-size: 16px; font-weight: 600; color: #303133; padding: 2px 0 8px 10px; border-left: 3px solid #409eff; margin-bottom: 12px; }
.sf-seg { display: flex; border-radius: 6px; overflow: hidden; margin-bottom: 14px; }
.sf-seg-item { flex: 1; text-align: center; padding: 10px 0; font-size: 14px; color: #606266; cursor: pointer; background: #f5f7fa; user-select: none; }
.sf-seg-item + .sf-seg-item { border-left: 1px solid #fff; }
.sf-seg-item.on { background: #409eff; color: #fff; }
.sf-sec { background: #f5f6f8; border-radius: 4px; padding: 8px 12px; font-size: 13px; color: #303133; font-weight: 500; margin: 12px 0; }
.sf-sec-note { font-weight: 400; color: #909399; font-size: 12px; }
.sf-dist-rows { padding: 2px 0; }
.sf-dist-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.sf-dist-label { width: 84px; font-size: 13px; color: #606266; text-align: right; flex-shrink: 0; }
.sf-dist-slider { flex: 1; }
.sf-dist-unit { font-size: 12px; color: #909399; }
.sf-inline-slider { flex: 1; margin-right: 10px; }
/* —— 颜色属性行（对齐 ew：色板 + 色值输入 + 重置） —— */
.sf-color-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; }
.sf-color-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.sf-color-label { width: 74px; font-size: 13px; color: #606266; text-align: right; flex-shrink: 0; }
/* —— 组件风格卡片（对齐 ew 框/线风格示意卡） —— */
.sf-style-cards { display: flex; gap: 12px; margin-bottom: 4px; }
.sf-icon-demo { font-size: 30px; color: #F7BA2A; }
.sf-style-card { width: 96px; border: 1px solid #dcdfe6; border-radius: 8px; padding: 10px; text-align: center; cursor: pointer; background: #fff; }
.sf-style-card.on { border-color: #409eff; box-shadow: 0 0 0 1px #409eff inset; }
.sf-style-demo { height: 44px; border-radius: 4px; border: 1px solid #ebeef5; display: flex; flex-direction: column; gap: 5px; align-items: flex-start; padding: 8px; }
.sd-bar { display: block; width: 40%; height: 6px; border-radius: 2px; background: #d9e4ff; }
.sd-long { width: 80%; }
.sd-sm { width: 25%; height: 5px; }
.sd-line { display: block; width: 100%; height: 1px; background: #c0c4cc; margin-top: 8px; }
.sd-slider { display: block; width: 100%; height: 4px; border-radius: 2px; background: linear-gradient(to right, #d9e4ff 60%, #e4e7ed 60%); margin-top: 4px; }
.sf-style-card-name { font-size: 12px; color: #606266; margin-top: 6px; }
/* —— 逻辑规则 —— */
.sf-logic-tip { font-size: 12px; color: #909399; margin-bottom: 10px; line-height: 1.7; }
.sf-rule { border: 1px solid #ebeef5; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
.sf-rule-title { font-weight: 600; display: flex; align-items: center; gap: 4px; margin-bottom: 8px; cursor: pointer; }
.sf-rule-title .el-button { margin-left: auto; }
.sf-rule-arrow { display: inline-block; color: #909399; transition: transform .2s; }
.sf-rule-arrow.open { transform: rotate(180deg); }
.sf-rule-cond-label { font-size: 13px; color: #303133; margin: 4px 0 8px; }
.sf-rule-box { border: 1px solid #ebeef5; border-radius: 6px; padding: 10px; margin-bottom: 8px; }
.sf-rule-cond { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 13px; color: #606266; flex-wrap: wrap; }
.sf-rule-op { width: 64px; }
.sf-rule-op-text { color: #409eff; font-weight: 500; }
.sf-rule-cmp { color: #909399; }
.sf-rule-actions { display: flex; align-items: center; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.sf-opt-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
</style>
