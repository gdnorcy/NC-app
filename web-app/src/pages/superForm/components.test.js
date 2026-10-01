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
});
