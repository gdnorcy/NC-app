/**
 * 消息服务器配置（Token / EncodingAESKey）契约单测
 *
 * 为什么测：这两个密钥有**硬约束** —— Token 必须是英文或数字且 3-32 位，
 * EncodingAESKey 必须是 43 位 A-Za-z0-9。手写极易写错位数或掺进非法字符，
 * 而微信侧握手失败时报错很含糊（只说"token 验证失败"），排查成本高。
 * 本测试锁住三条约定：
 *   1. 页面提供「生成新的」与「点击复制」（对齐第三方平台的呈现，也堵住手写出错）
 *   2. 生成器只有 utils/mpSecrets.js 一个出口，组件不得自己拼随机串
 *   3. 保存前做本地校验，不把非法值直接发给后端
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, 'WechatHome.vue');
const src = fs.readFileSync(SRC, 'utf8');
const script = src.slice(src.indexOf('<script setup>'), src.indexOf('</script>'));
const tpl = src.slice(src.indexOf('<template>'), src.indexOf('<script setup>'));

describe('消息服务器配置：密钥生成与操作', () => {
  it('Token / EncodingAESKey 都提供「修改 / 生成新的 / 点击复制」', () => {
    for (const field of ['token', 'aesKey']) {
      const m = tpl.match(new RegExp(`startEdit\\('${field}'\\)`));
      expect(m, `${field} 缺少「修改」入口`).toBeTruthy();
      expect(tpl, `${field} 缺少「生成新的」入口`).toContain(`regen('${field}')`);
      expect(tpl, `${field} 缺少「点击复制」入口`).toContain(`copyText(msgCfg.${field})`);
    }
  });

  it('回调 URL 只读且可复制（不接受手改）', () => {
    // URL 由服务端按租户生成，页面只能展示 + 复制
    const m = tpl.match(/callbackUrl[^<]*/);
    expect(m).toBeTruthy();
    expect(tpl).not.toMatch(/v-model="callbackUrl"/);
    expect(tpl).toContain("copyText(callbackUrl)");
  });

  it('生成器统一走 utils/mpSecrets.js，组件内不自己拼随机串', () => {
    expect(script).toContain("from '../../utils/mpSecrets.js'");
    expect(script).not.toMatch(/Math\.random\(\)/);
  });

  it('保存前本地校验（非法值不落到后端）', () => {
    expect(script).toContain('isValidMpToken(msgCfg.token)');
    expect(script).toContain('isValidMpAesKey(msgCfg.aesKey)');
  });

  it('「生成新的」只写本地编辑态，不直接调保存接口（避免公众号后台未同步导致消息中断）', () => {
    const i = script.indexOf('function regen(');
    const body = script.slice(i, script.indexOf('\n}', i));
    expect(body).toContain('genMpToken');
    expect(body).toContain('genMpEncodingAESKey');
    expect(body).not.toContain('mpSaveMessageConfig');
  });
});
