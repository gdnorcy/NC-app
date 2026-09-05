import { describe, it, expect } from 'vitest';
import { parseViewPath } from '../src/routing.js';

describe('parseViewPath 展示端路由解析', () => {
  it('根路径 → 项目列表首页', () => {
    expect(parseViewPath('/')).toEqual({ type: 'home' });
    expect(parseViewPath('')).toEqual({ type: 'home' });
    expect(parseViewPath('/?p1=2')).toEqual({ type: 'home' });
  });

  it('/s/{token} → 分享直达', () => {
    expect(parseViewPath('/s/abc123')).toEqual({ type: 'share', token: 'abc123' });
    expect(parseViewPath('/s/AbC_-123')).toEqual({ type: 'share', token: 'AbC_-123' });
    expect(parseViewPath('/s/abc123/')).toEqual({ type: 'share', token: 'abc123' });
  });

  it('非法分享路径 → 回首页', () => {
    expect(parseViewPath('/s/')).toEqual({ type: 'home' });
    expect(parseViewPath('/s/abc/extra')).toEqual({ type: 'home' });
    expect(parseViewPath('/s/中文')).toEqual({ type: 'home' });
    expect(parseViewPath('/admin')).toEqual({ type: 'home' });
    expect(parseViewPath('/admin?x=1')).toEqual({ type: 'home' });
  });
});
