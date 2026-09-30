<template>
  <div class="sf-designer">
    <!-- 顶栏 -->
    <div class="sf-topbar">
      <el-button text @click="$emit('close')">← 返回</el-button>
      <span class="sf-title">超级表单设计器</span>
      <div class="sf-top-actions">
        <el-radio-group :model-value="settings.layout" @update:model-value="setLayout">
          <el-radio-button value="vertical">上下布局</el-radio-button>
          <el-radio-button value="horizontal">左右布局</el-radio-button>
        </el-radio-group>
        <el-button @click="styleDialog = true">样式设置</el-button>
        <el-button @click="formSettingsTab = 'basic'; formSettingsVisible = true">表单设置</el-button>
        <el-button @click="save(false)">保存页面</el-button>
        <el-button type="primary" @click="save(true)">保存并发布</el-button>
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
              <span class="sf-pal-icon" :style="{ background: group.color }">
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="ICONS[item.type] || ''" />
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
          <div class="sf-phone-bar"><span>13:32</span><span>表单</span></div>
          <div
            class="sf-phone-body"
            :class="settings.layout"
            @dragover.prevent="dragOverIdx = components.length"
            @drop="onDrop(components.length, $event)"
          >
            <div v-for="(comp, idx) in components" :key="comp.id" class="sf-comp-wrap">
              <div v-if="dragOverIdx === idx" class="sf-drop-line" />
              <div
                class="sf-comp"
                :class="{ active: comp.id === selectedId }"
                draggable="true"
                @click="selectedId = comp.id"
                @dragstart="onCompDrag(comp.id, $event)"
                @dragend="resetDrag"
                @dragover.prevent.stop="dragOverIdx = idx"
                @drop.stop="onDrop(idx, $event)"
              >
                <div class="sf-comp-ops" v-if="comp.id === selectedId">
                  <span @click.stop="remove(idx)">✕</span>
                </div>
                <ComponentPreview :comp="comp" />
              </div>
            </div>
            <div v-if="dragOverIdx === components.length" class="sf-drop-line" />
            <div v-if="!components.length" class="sf-empty">请从左侧拖拽或点击组件，放置于此处。</div>
          </div>
        </div>
      </div>

      <!-- 右：属性面板 -->
      <div class="sf-props">
        <!-- 选中组件：内容/样式 -->
        <template v-if="selected">
          <el-tabs v-model="propTab">
            <el-tab-pane label="内容设置" name="content" />
            <el-tab-pane label="样式设置" name="style" />
          </el-tabs>
          <div v-if="propTab === 'content'" class="sf-prop-form">
            <el-form label-width="92px" size="small">
              <el-form-item label="是否显示" v-if="selected.type !== 'submit' && !noPropTypes.includes(selected.type)">
                <el-radio-group v-model="selected.content.required">
                  <el-radio :value="true">显示</el-radio>
                  <el-radio :value="false">隐藏</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="是否必填" v-if="selected.type !== 'submit' && !noPropTypes.includes(selected.type)">
                <el-radio-group v-model="selected.content.required">
                  <el-radio :value="true">必填</el-radio>
                  <el-radio :value="false">非必填</el-radio>
                </el-radio-group>
              </el-form-item>

              <template v-if="selected.type === 'text' || selected.type === 'textarea'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
                <el-form-item label="预填文字"><el-input v-model="selected.content.prefill" /></el-form-item>
                <el-form-item label="内容类型">
                  <el-select v-model="selected.content.contentType">
                    <el-option label="普通" value="normal" />
                    <el-option label="手机号码" value="phone" />
                    <el-option label="邮箱" value="email" />
                    <el-option label="身份证" value="idcard" />
                  </el-select>
                </el-form-item>
                <el-form-item label="同步姓名">
                  <el-switch v-model="selected.content.syncName" />
                </el-form-item>
                <el-form-item label="输入限制">
                  最少 <el-input-number v-model="selected.content.minLength" :min="0" :max="400" /> 位 ·
                  最多 <el-input-number v-model="selected.content.maxLength" :min="0" :max="400" /> 位
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" active-text="相同内容不可重复提交" />
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'image'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="最多上传">
                  <el-input-number v-model="selected.content.maxCount" :min="1" :max="9" />
                </el-form-item>
              </template>

              <template v-else-if="['radio', 'checkbox', 'select'].includes(selected.type)">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="选项">
                  <div v-for="(opt, oi) in selected.content.options" :key="oi" class="sf-opt-row">
                    <el-input v-model="opt.label" placeholder="选项文案" style="width: 160px" />
                    <el-button text type="danger" @click="selected.content.options.splice(oi, 1)">删</el-button>
                  </div>
                  <el-button size="small" @click="selected.content.options.push({ label: '新选项', value: String(selected.content.options.length + 1) })">+ 添加选项</el-button>
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'date'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="类型">
                  <el-radio-group v-model="selected.content.dateType">
                    <el-radio value="date">日期</el-radio><el-radio value="time">日期+时间</el-radio>
                  </el-radio-group>
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'number'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
                <el-form-item label="数值范围">最小 <el-input-number v-model="selected.content.min" :min="0" /> 最大 <el-input-number v-model="selected.content.max" :min="0" /></el-form-item>
                <el-form-item label="默认值"><el-input v-model="selected.content.defaultValue" placeholder="选填" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'time'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="类型">
                  <el-radio-group v-model="selected.content.dateType">
                    <el-radio value="date">日期</el-radio><el-radio value="time">时间</el-radio><el-radio value="datetime">日期+时间</el-radio>
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
                <el-form-item label="按钮文案"><el-input v-model="selected.content.tipText" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'attachment'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="最多上传"><el-input-number v-model="selected.content.maxCount" :min="1" :max="9" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'agreement'">
                <el-form-item label="协议正文"><el-input v-model="selected.content.label" type="textarea" :rows="2" /></el-form-item>
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
                <el-form-item label="最高分值"><el-input-number v-model="selected.content.max" :min="3" :max="10" /></el-form-item>
                <el-form-item label="默认分值"><el-input-number v-model="selected.content.defaultValue" :min="0" :max="selected.content.max" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'filedownload'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="文件名称"><el-input v-model="selected.content.fileName" /></el-form-item>
                <el-form-item label="文件地址"><el-input v-model="selected.content.fileUrl" placeholder="https://" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'phoneauth'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
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
                <el-form-item label="标题文字"><el-input v-model="selected.content.text" /></el-form-item>
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
              </template>

              <template v-else-if="selected.type === 'swiper'">
                <el-form-item label="图片地址">
                  <div v-for="(img, si) in selected.content.images" :key="si" class="sf-opt-row">
                    <el-input v-model="selected.content.images[si]" placeholder="图片 URL" style="width: 220px" />
                    <el-button text type="danger" @click="selected.content.images.splice(si, 1)">删</el-button>
                  </div>
                  <el-button size="small" @click="selected.content.images.push('')">+ 添加图片</el-button>
                </el-form-item>
                <el-form-item label="高度"><el-input-number v-model="selected.content.height" :min="60" :max="400" /> px</el-form-item>
              </template>

              <template v-else-if="selected.type === 'bigimage'">
                <el-form-item label="图片地址"><el-input v-model="selected.content.image" placeholder="图片 URL" /></el-form-item>
                <el-form-item label="跳转链接"><el-input v-model="selected.content.link" placeholder="选填，点击大图跳转" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'video'">
                <el-form-item label="视频地址"><el-input v-model="selected.content.src" placeholder="视频 URL" /></el-form-item>
                <el-form-item label="封面图"><el-input v-model="selected.content.poster" placeholder="选填" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'backdesc'">
                <el-form-item label="描述文字"><el-input v-model="selected.content.text" type="textarea" :rows="3" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'realtime'">
                <el-form-item label="模块标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="动态文案"><el-input v-model="selected.content.title" placeholder="如：已有 0 人参与" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'pagebreak'">
                <el-form-item label="说明"><span class="sf-hint">分页组件用于把表单拆成多页，填写者需逐页填写后提交。</span></el-form-item>
              </template>

              <template v-else-if="selected.type === 'pay'">
                <el-form-item label="支付标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="固定金额"><el-input-number v-model="selected.content.amount" :min="0" :precision="2" /> 元</el-form-item>
                <el-form-item label="支付规格">
                  <div v-for="(sp, spi) in selected.content.specs" :key="spi" class="sf-opt-row">
                    <el-input v-model="sp.name" placeholder="规格名" style="width: 110px" />
                    <el-input-number v-model="sp.price" :min="0" :precision="2" />
                    <el-button text type="danger" @click="selected.content.specs.splice(spi, 1)">删</el-button>
                  </div>
                  <el-button size="small" @click="selected.content.specs.push({ name: '新规格', price: 0 })">+ 添加规格</el-button>
                </el-form-item>
                <el-form-item label="支付方式">
                  <el-radio-group v-model="selected.content.payType">
                    <el-radio value="wechat">微信支付</el-radio>
                    <el-radio value="alipay">支付宝</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="说明"><span class="sf-hint">实际微信/支付宝支付将在发布后接入，当前仅记录所选规格与金额。</span></el-form-item>
              </template>

              <template v-else-if="selected.type === 'submit'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.tipText" placeholder="提交成功后显示的提示信息" /></el-form-item>
                <el-form-item label="轻提示">
                  <el-switch v-model="selected.content.lightTip" />
                  <span class="sf-hint">默认关闭，弹出提示文字，需点击确认按钮再跳转</span>
                </el-form-item>
              </template>
            </el-form>
          </div>

          <div v-else class="sf-prop-form">
            <el-form label-width="92px" size="small">
              <el-form-item label="组件风格">
                <el-radio-group v-model="selected.style.styleType">
                  <el-radio value="box">框风格</el-radio><el-radio value="line">线风格</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="左右边距"><el-input-number v-model="selected.style.marginX" :min="0" :max="40" /> px</el-form-item>
              <el-form-item label="输入框圆角"><el-input-number v-model="selected.style.radius" :min="0" :max="20" /> px</el-form-item>
              <el-form-item label="标题大小"><el-slider v-model="selected.style.titleSize" :min="12" :max="24" /> px</el-form-item>
              <el-form-item label="输入文本大小"><el-slider v-model="selected.style.inputSize" :min="12" :max="20" /> px</el-form-item>
            </el-form>
          </div>
        </template>

        <!-- 未选中：表单设置 -->
        <template v-else>
          <el-tabs v-model="formSettingsTab">
            <el-tab-pane label="基础设置" name="basic" />
            <el-tab-pane label="逻辑设置" name="logic" />
          </el-tabs>
          <div v-if="formSettingsTab === 'basic'" class="sf-prop-form">
            <el-form label-width="92px" size="small">
              <el-form-item label="表单名称"><el-input v-model="settings.basic.name" /></el-form-item>
              <el-form-item label="收集时间">
                <el-date-picker v-model="settings.basic.collectStart" type="datetime" placeholder="开始" value-format="YYYY-MM-DD HH:mm" style="width: 170px" />
                <span style="margin: 0 6px">至</span>
                <el-date-picker v-model="settings.basic.collectEnd" type="datetime" placeholder="结束" value-format="YYYY-MM-DD HH:mm" style="width: 170px" />
              </el-form-item>
              <el-form-item label="收集份数"><el-input-number v-model="settings.basic.collectLimit" :min="0" /> <span class="sf-hint">0 为不限制</span></el-form-item>
              <el-form-item label="允许修改"><el-switch v-model="settings.basic.allowModify" /></el-form-item>
              <el-form-item label="分享标题"><el-input v-model="settings.basic.shareTitle" /></el-form-item>
              <el-form-item label="分享图片"><el-input v-model="settings.basic.shareImage" placeholder="图片地址" /></el-form-item>
              <el-divider>提交设置</el-divider>
              <el-form-item label="二次确认"><el-switch v-model="settings.submit.secondConfirm" /></el-form-item>
              <el-form-item label="跳转页面"><el-input v-model="settings.submit.jumpLink" placeholder="选择链接或输入地址，不选则停留当前页" /></el-form-item>
            </el-form>
          </div>
          <div v-else class="sf-prop-form">
            <div class="sf-logic-tip">可为选择类字段（单项选择、多项选择、下拉选择）设定规则：填写者选择某选项后，显示该字段之后的其他字段。分页与提交按钮不参与逻辑。</div>
            <div v-for="(rule, ri) in settings.logic" :key="ri" class="sf-rule">
              <div class="sf-rule-title">规则 {{ ri + 1 }}
                <el-button text type="danger" @click="settings.logic.splice(ri, 1)">删除</el-button>
              </div>
              <div class="sf-rule-cond">当满足：字段
                <el-select v-model="rule.compId" placeholder="选择字段" style="width: 150px" @change="rule.option = ''">
                  <el-option v-for="c in choiceComponents" :key="c.id" :label="c.content.label" :value="c.id" />
                </el-select>
                选项
                <el-select v-model="rule.option" placeholder="选择选项" style="width: 130px" :disabled="!rule.compId">
                  <el-option v-for="opt in optionsOf(rule.compId)" :key="opt.value" :label="opt.label" :value="opt.value" />
                </el-select>
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
                  <el-option v-for="c in components.filter(c => c.id !== rule.compId && c.type !== 'submit')" :key="c.id" :label="c.content.label" :value="c.id" />
                </el-select>
              </div>
            </div>
            <el-button size="small" @click="settings.logic.push({ compId: '', option: '', action: 'show', showIds: [] })">+ 添加规则</el-button>
          </div>
        </template>
      </div>
    </div>

    <!-- 全局样式弹窗 -->
    <el-dialog v-model="styleDialog" title="样式设置" width="420px">
      <el-form label-width="100px" size="small">
        <el-form-item label="基础布局">
          <el-radio-group v-model="settings.layout">
            <el-radio value="vertical">上下布局</el-radio><el-radio value="horizontal">左右布局</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="顶外边距"><el-input-number v-model="settings.globalStyle.marginTop" :min="0" :max="100" /> px</el-form-item>
        <el-form-item label="上下边距"><el-input-number v-model="settings.globalStyle.marginY" :min="0" :max="100" /> px</el-form-item>
        <el-form-item label="左右边距"><el-input-number v-model="settings.globalStyle.marginX" :min="0" :max="100" /> px</el-form-item>
        <el-form-item label="组件圆角"><el-input-number v-model="settings.globalStyle.radius" :min="0" :max="40" /> px</el-form-item>
        <el-form-item label="输入框圆角"><el-input-number v-model="settings.globalStyle.inputRadius" :min="0" :max="40" /> px</el-form-item>
      </el-form>
      <template #footer><el-button type="primary" @click="styleDialog = false">确定</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { getSuperForm, updateSuperForm } from '../../../../api/index.js';
import {
  COMPONENT_PALETTE, COMPONENT_ICONS, createComponent, defaultSettings, COMPONENT_LABEL,
} from './components.js';
import ComponentPreview from './ComponentPreview.vue';

const props = defineProps({ formId: [Number, String], formName: String });
const emit = defineEmits(['close']);

const palette = COMPONENT_PALETTE;
const ICONS = COMPONENT_ICONS;
const components = ref([]);
const settings = reactive(defaultSettings());
const selectedId = ref(null);
const propTab = ref('content');
const formSettingsTab = ref('basic');
const styleDialog = ref(false);
const saving = ref(false);

const selected = computed(() => components.value.find((c) => c.id === selectedId.value) || null);
const choiceComponents = computed(() => components.value.filter((c) => ['radio', 'checkbox', 'select'].includes(c.type)));
// 纯展示/特殊组件不显示「是否显示 / 是否必填」表头
const noPropTypes = ['pagebreak', 'backdesc', 'realtime', 'swiper', 'bigimage', 'title', 'richtext', 'blank', 'line', 'video', 'pay'];
function optionsOf(compId) {
  const c = components.value.find((x) => x.id === compId);
  return c?.content?.options || [];
}

function setLayout(v) { settings.layout = v; }
function addComponent(type) {
  components.value.push(createComponent(type));
  selectedId.value = components.value[components.value.length - 1].id;
}
function remove(idx) {
  const id = components.value[idx].id;
  components.value.splice(idx, 1);
  if (selectedId.value === id) selectedId.value = null;
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
    components.value = Array.isArray(cfg.components) ? cfg.components : [];
    Object.assign(settings, defaultSettings(), cfg.settings || {});
    if (!settings.basic) settings.basic = defaultSettings().basic;
    if (!settings.submit) settings.submit = defaultSettings().submit;
    if (!settings.logic) settings.logic = [];
    if (!settings.globalStyle) settings.globalStyle = defaultSettings().globalStyle;
  } catch (e) { ElMessage.error(e.message || '加载失败'); }
}

async function save(publish) {
  saving.value = true;
  const payload = {
    name: settings.basic.name || '未命名表单',
    status: publish ? 'published' : undefined,
    config: { components: components.value, settings: JSON.parse(JSON.stringify(settings)) },
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
.sf-topbar { display: flex; align-items: center; gap: 14px; padding: 10px 16px; background: #fff; border-bottom: 1px solid #ebeef5; }
.sf-title { font-weight: 600; }
.sf-top-actions { margin-left: auto; display: flex; gap: 10px; align-items: center; }
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
.sf-pal-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0, 0, 0, .12); flex-shrink: 0; }
.sf-pal-icon svg { width: 19px; height: 19px; display: block; }
.sf-pal-label { font-size: 12px; color: #333; line-height: 1.2; text-align: center; }
.sf-canvas { overflow: auto; display: flex; justify-content: center; padding: 24px; }
.sf-phone { width: 375px; min-height: 640px; background: #fff; border-radius: 28px; box-shadow: 0 6px 24px rgba(0,0,0,.12); display: flex; flex-direction: column; overflow: hidden; }
.sf-phone-bar { height: 28px; background: #000; color: #fff; display: flex; justify-content: space-between; align-items: center; padding: 0 14px; font-size: 12px; }
.sf-phone-body { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.sf-phone-body.horizontal { flex-direction: row; flex-wrap: wrap; }
.sf-comp-wrap { position: relative; }
.sf-drop-line { height: 0; border-top: 2px solid #409eff; margin: 3px 2px; }
.sf-comp { position: relative; border: 1px solid transparent; border-radius: 8px; padding: 8px; cursor: grab; }
.sf-comp:active { cursor: grabbing; }
.sf-comp.active { border-color: #409eff; }
.sf-comp-ops { position: absolute; top: -12px; right: 6px; display: flex; gap: 6px; background: #409eff; color: #fff; border-radius: 4px; padding: 2px 6px; font-size: 12px; z-index: 2; }
.sf-comp-ops span { cursor: pointer; }
.sf-empty { color: #c0c4cc; font-size: 13px; text-align: center; margin-top: 60px; }
.sf-props { background: #fff; border-left: 1px solid #ebeef5; overflow: auto; padding: 14px; }
.sf-prop-form { margin-top: 8px; }
.sf-hint { color: #909399; font-size: 12px; margin-left: 6px; }
.sf-logic-tip { font-size: 12px; color: #909399; margin-bottom: 10px; }
.sf-rule { border: 1px solid #ebeef5; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
.sf-rule-title { font-weight: 600; display: flex; justify-content: space-between; margin-bottom: 8px; }
.sf-rule-cond { margin: 6px 0; }
.sf-opt-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
</style>
