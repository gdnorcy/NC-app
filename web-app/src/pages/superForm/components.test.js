import { describe, it, expect } from 'vitest';
import { defaultContent } from '../../../../web-admin/src/views/customer/apps/superForm/components.js';

// 内容默认值与面板/校验字段一致性回归（防止隐性 bug 复发）
describe('defaultContent 与校验/面板字段对齐', () => {
  it('checkbox 用 minSelect/maxSelect（校验与面板实际绑定字段），不再用 min/max', () => {
    const c = defaultContent('checkbox');
    expect(c.options.length).toBe(2);
    expect(c.minSelect).toBe(0);
    expect(c.maxSelect).toBe(0);
    expect(c.min).toBeUndefined();
    expect(c.max).toBeUndefined();
  });

  it('radio 只含 options，无 minSelect/maxSelect', () => {
    const c = defaultContent('radio');
    expect(c.options.length).toBe(2);
    expect(c.minSelect).toBeUndefined();
    expect(c.maxSelect).toBeUndefined();
  });

  it('number 含 step 默认值，C 端 step 校验才会生效', () => {
    const c = defaultContent('number');
    expect(c.step).toBe(1);
    expect(c.defaultValue).toBe('');
    expect(c.readonly).toBe(false);
    expect(c.verifyRepeat).toBe(false);
  });

  it('text 含 syncPhone（面板有「同步手机号」）', () => {
    const c = defaultContent('text');
    expect(c.syncPhone).toBe(false);
    expect(c.syncName).toBe(false);
    expect(c.inputType).toEqual([]);
  });

  it('date 含 syncBirthday/defaultRange/readonly/verifyRepeat', () => {
    const c = defaultContent('date');
    expect(c.syncBirthday).toBe(false);
    expect(c.defaultRange).toEqual([]);
    expect(c.readonly).toBe(false);
    expect(c.verifyRepeat).toBe(false);
    expect(c.dateType).toBe('date');
  });

  it('time/location/attachment/rate/phoneauth/sms 均补齐 readonly/verifyRepeat', () => {
    for (const t of ['time', 'location', 'attachment', 'rate', 'phoneauth', 'sms']) {
      const c = defaultContent(t);
      expect(c.readonly).toBe(false);
      expect(c.verifyRepeat).toBe(false);
    }
  });

  it('text/textarea 预填文字 prefill 默认空串', () => {
    expect(defaultContent('text').prefill).toBe('');
    expect(defaultContent('textarea').prefill).toBe('');
  });

  it('checkbox P1：排他项/其他选项默认值（对齐 ew）', () => {
    const c = defaultContent('checkbox');
    expect(c.exclusive).toBe(false);
    expect(c.exclusiveValue).toBe('');
    expect(c.allowOther).toBe(false);
  });

  it('select P1：预设类型 + 下拉框级数（省市区/日期走级联，默认三级）', () => {
    const c = defaultContent('select');
    expect(c.presetType).toBe('normal');
    expect(c.level).toBe(3);
  });

  it('location P1：内容类型（定位点/路线）默认定位点', () => {
    const c = defaultContent('location');
    expect(c.contentType).toBe('point');
  });

  it('attachment P1：上传类型白名单 + 大小限制默认空', () => {
    const c = defaultContent('attachment');
    expect(c.accept).toEqual([]);
    expect(c.maxSize).toBe(0);
  });

  it('pay P2：规格类型 + 库存/退款/核销/限购/日期/优惠券等支付能力字段默认', () => {
    const c = defaultContent('pay');
    expect(c.specType).toBe('single');
    expect(c.showStock).toBe(false);
    expect(c.stock).toBe(0);
    expect(c.refundType).toBe('none');
    expect(c.verify).toBe(false);
    expect(c.limitBuy).toBe(0);
    expect(c.dateSelect).toBe(false);
    expect(c.coupon).toBe(false);
    expect(c.points).toBe(false);
    expect(c.memberDiscount).toBe(false);
    expect(c.distribute).toBe(false);
  });

  it('realtime P2：虚拟人数 + 倒计时字段默认', () => {
    const c = defaultContent('realtime');
    expect(c.fakeCount).toBe(0);
    expect(c.countdown).toBe(false);
    expect(c.countdownTime).toBe('');
  });

  it('submit P2：上下文提示 + 跳转链接默认', () => {
    const c = defaultContent('submit');
    expect(c.context).toBe('general');
    expect(c.jumpLink).toBe('');
  });

  it('pagebreak P2：禁止返回 + 上一步/下一步按钮文字默认', () => {
    const c = defaultContent('pagebreak');
    expect(c.noReturn).toBe(false);
    expect(c.prevText).toBe('上一步');
    expect(c.nextText).toBe('下一页');
  });

  it('agreement P3：勾选文案 + 协议正文 + 显示方式（直接勾选/看完勾选） + 链接默认', () => {
    const c = defaultContent('agreement');
    expect(c.label).toBe('我已阅读并同意');
    expect(c.content).toBe('');
    expect(c.showMode).toBe('direct');
    expect(c.required).toBe(true);
    expect(c.linkText).toBe('《用户协议》');
    expect(c.linkUrl).toBe('');
  });

  it('filedownload P3：文件名称/地址 + 示例文件 + 提示文字默认', () => {
    const c = defaultContent('filedownload');
    expect(c.fileName).toBe('');
    expect(c.fileUrl).toBe('');
    expect(c.sampleFile).toBe('');
    expect(c.tip).toBe('');
  });

  it('swiper P3：图片列表 + 描述 + 链接 + 高度默认', () => {
    const c = defaultContent('swiper');
    expect(c.images).toEqual([]);
    expect(c.desc).toBe('');
    expect(c.link).toBe('');
    expect(c.height).toBe(160);
  });

  it('bigimage P3：图片地址 + 描述 + 链接默认', () => {
    const c = defaultContent('bigimage');
    expect(c.image).toBe('');
    expect(c.desc).toBe('');
    expect(c.link).toBe('');
  });

  it('title P3：主/副标题 + 提示文字 + 标题链接 + 大小/对齐/颜色默认', () => {
    const c = defaultContent('title');
    expect(c.text).toBe('标题文字');
    expect(c.subtitle).toBe('');
    expect(c.tip).toBe('');
    expect(c.link).toBe('');
    expect(c.size).toBe(18);
    expect(c.align).toBe('left');
    expect(c.color).toBe('#303133');
  });

  it('blank P3：空白高度默认', () => {
    const c = defaultContent('blank');
    expect(c.height).toBe(20);
  });

  it('line P3：线条样式 + 颜色 + 高度默认', () => {
    const c = defaultContent('line');
    expect(c.style).toBe('solid');
    expect(c.color).toBe('#dcdfe6');
    expect(c.height).toBe(1);
  });

  it('video P3：视频显示方式（直接/弹出）+ 自动播放 + 封面默认', () => {
    const c = defaultContent('video');
    expect(c.src).toBe('');
    expect(c.poster).toBe('');
    expect(c.display).toBe('direct');
    expect(c.autoplay).toBe(false);
  });
});
