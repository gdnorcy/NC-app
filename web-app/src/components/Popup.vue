<template>
  <view v-if="visible" class="popup-root">
    <view class="popup-mask" :class="{ 'mask-show': visible }" @click="onMaskClick"></view>
    <view class="popup-panel" :class="['pos-' + position, { 'round': round, 'panel-show': visible }]">
      <slot></slot>
    </view>
  </view>
</template>

<script>
export default {
  name: 'Popup',
  props: {
    show: { type: Boolean, default: false },
    position: { type: String, default: 'bottom' }, // bottom | center | top
    maskClosable: { type: Boolean, default: true },
    round: { type: Boolean, default: false }
  },
  data() {
    return { visible: this.show };
  },
  watch: {
    show(val) {
      this.visible = val;
    }
  },
  methods: {
    onMaskClick() {
      if (this.maskClosable) {
        this.$emit('update:show', false);
        this.$emit('close');
      }
    }
  }
};
</script>

<style scoped>
.popup-root {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 999;
}
.popup-mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: var(--bg-mask);
  opacity: 0;
  transition: opacity 0.25s ease;
}
.mask-show {
  opacity: 1;
}
.popup-panel {
  position: absolute;
  background: #ffffff;
  transition: transform 0.3s ease;
}
.pos-bottom {
  left: 0;
  right: 0;
  bottom: 0;
  transform: translateY(100%);
}
.pos-bottom.panel-show {
  transform: translateY(0);
}
.pos-top {
  left: 0;
  right: 0;
  top: 0;
  transform: translateY(-100%);
}
.pos-top.panel-show {
  transform: translateY(0);
}
.pos-center {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(0.9);
  border-radius: 16rpx;
  min-width: 560rpx;
  max-width: 86%;
}
.pos-center.panel-show {
  transform: translate(-50%, -50%) scale(1);
}
.round {
  border-radius: 24rpx 24rpx 0 0;
}
</style>
