import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WxMpService } from '../src/services/wx-mp.js';
import { computeTraceCode, DEFAULT_CODESET } from '../src/services/traceCode.js';

/**
 * 动态场景码（验真引导）测试。
 *
 * 🔴 为什么要有这套改造：原「给每个防伪码生成**永久**字符串场景码」的做法，
 *    受微信永久码配额上限约束，且必须为每个码单独出图 —— 大批量印刷不可行，
 *    且永久码谁拿到都能扫（可被转发/重放）。
 *    改为：查询时现场生成**临时**场景码（数字 scene_id）+ 短时效 + 一次有效 + openid 可选绑定。
 */

const TRACE_RULE = { m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 }, k: { ...DEFAULT_CODESET.k } };
const TRACE_BATCH = '0123456';
function traceCodeOf(serial) {
  return computeTraceCode(`FW${TRACE_BATCH}${String(serial).padStart(6, '0')}00000`, TRACE_RULE);
}
const TRACE_CODE = traceCodeOf(1);
const BATCH_ROW = { tenant_id: 7, id: 1, batch: TRACE_BATCH, is_active: 1 };
// auth_status='authorized' → 走组件桩取 token（不额外发 token 请求），与既有 wx-mp 测试口径一致
const CHANNEL = { id: 100, appid: 'wxtrace', app_secret: '', customer_id: 7, auth_status: 'authorized' };
const CARD_SETTINGS = JSON.stringify({ displaySlots: [{ when: 1, title: 'card', cover: '', link: 'https://x.com/p?co={CODE}' }] });

function makeEnv({ settingsJson = CARD_SETTINGS, traceCodes = [] } = {}) {
  const scenes = [];
  const qrCalls = [];
  let seq = 0;
  const utcAfter = (sec) => new Date(Date.now() + sec * 1000).toISOString().replace('T', ' ').slice(0, 19);

  const db = {
    prepare: (sql) => {
      const s = String(sql);
      if (s.includes('FROM trace_code_rules')) return { get: (tid) => (tid === 7 ? { rule_json: JSON.stringify(TRACE_RULE) } : undefined) };
      if (s.includes('FROM trace_batches')) {
        // 🔴 必须与生产 SQL（WHERE tenant_id = ?）口径一致：桩也要按租户过滤，
        //    否则「跨租户取别人的批次」这类安全问题会被假桩放过去。
        return {
          get: (tid, key) => (tid === 7 && (BATCH_ROW.batch === key || BATCH_ROW.id === key) ? BATCH_ROW : undefined),
          all: (tid) => (tid === 7 ? [BATCH_ROW] : []),
        };
      }
      if (s.includes('FROM trace_codes')) return { get: (tid, code) => traceCodes.find((r) => r.tenant_id === tid && r.code === code) };
      if (s.includes('FROM trace_settings')) return { get: () => ({ settings_json: settingsJson }) };
      if (s.includes('FROM trace_activations')) return { get: (tid, bid) => ({ id: 1, tenant_id: tid, batch_id: bid }) };
      if (s.includes('FROM trace_mp_scenes')) {
        return { get: (sceneId, tid) => scenes.find((r) => r.scene_id === sceneId && r.tenant_id === tid) };
      }
      if (s.includes('INSERT INTO trace_mp_scenes')) {
        // 形参顺序须与服务端 SQL 一致：(tenant_id, code, openid, ticket, expires_at)
        return {
          run: (tid, code, openid, ticket, expiresAt) => {
            seq += 1;
            scenes.push({ id: seq, tenant_id: tid, code, scene_id: 0, openid, ticket, expires_at: expiresAt, used_at: null });
            return { lastInsertRowid: seq };
          },
        };
      }
      if (s.includes('UPDATE trace_mp_scenes SET scene_id')) {
        return { run: (sceneId, ticket, id) => { const r = scenes.find((x) => x.id === id); if (r) { r.scene_id = sceneId; r.ticket = ticket; } return { changes: 1 }; } };
      }
      if (s.includes('UPDATE trace_mp_scenes SET used_at')) {
        return { run: (at, id) => { const r = scenes.find((x) => x.id === id); if (r) r.used_at = at; return { changes: 1 }; } };
      }
      return { get: () => undefined, all: () => [], run: () => ({ lastInsertRowid: 0 }) };
    },
  };
  const component = { getAuthorizerAccessToken: async () => 'tok' };
  global.fetch = async (url, opts) => {
    if (String(url).includes('/cgi-bin/qrcode/create')) {
      const body = JSON.parse(opts.body);
      qrCalls.push(body);
      return { json: async () => ({ ticket: `ticket-${qrCalls.length}`, expire_seconds: body.expire_seconds, url: 'https://weixin.qq.com/q/x' }) };
    }
    throw new Error('unexpected fetch ' + url);
  };
  return { scenes, qrCalls, utcAfter, svc: () => new WxMpService(db, component) };
}

afterEach(() => { if (global.fetch && global.fetch.__restore) global.fetch.__restore(); });

test('createTraceSceneQr: 走**临时**场景码 QR_SCENE，且不必为每个码预出图（配额友好）', async () => {
  const env = makeEnv();
  const r = await env.svc().createTraceSceneQr(CHANNEL, TRACE_CODE, '', 1800);
  const call = env.qrCalls[0];
  assert.equal(call.action_name, 'QR_SCENE', '必须是临时码，不能用永久码 QR_LIMIT_STR_SCENE');
  assert.equal(call.expire_seconds, 1800, '必须带短时效');
  assert.ok(Number.isInteger(call.action_info.scene.scene_id), '临时码用数字 scene_id');
  assert.equal(r.sceneId, 100001, 'scene_id = 100000 + 自增 id');
  assert.equal(env.scenes[0].code, TRACE_CODE);
  assert.equal(env.scenes[0].openid, '', '未拿不到 openid 时留空（靠时效+一次有效兜底）');
});

test('createTraceSceneQr: 非法码 / 非本租户批次 → 明确报错，不能出图', async () => {
  const env = makeEnv();
  await assert.rejects(() => env.svc().createTraceSceneQr(CHANNEL, 'FW00000000000000000000', '', 1800), /不合法|不属于/);
  await assert.rejects(() => env.svc().createTraceSceneQr({ ...CHANNEL, customer_id: 999 }, TRACE_CODE, '', 1800), /不合法|不属于/);
  assert.equal(env.qrCalls.length, 0, '校验失败绝不能白调微信接口');
});

test('peekTraceScene: 未过期未使用 → 命中；反过来三种不可用都给明确引导语', async () => {
  const env = makeEnv();
  const svc = env.svc();
  const r = await svc.createTraceSceneQr(CHANNEL, TRACE_CODE, 'openidA', 1800);

  const ok = svc.peekTraceScene(CHANNEL, String(r.sceneId), 'openidA');
  assert.ok(ok.row, '本人未使用应命中');

  const other = svc.peekTraceScene(CHANNEL, String(r.sceneId), 'openidB');
  assert.ok(other.reject && other.reject.includes('不匹配'), '换人扫必须拒绝（防截图转发）');

  env.scenes[0].used_at = env.utcAfter(0);
  const used = svc.peekTraceScene(CHANNEL, String(r.sceneId), 'openidA');
  assert.ok(used.reject && used.reject.includes('已被使用'), '二次扫码必须拒绝（一次有效）');

  env.scenes[0].used_at = null;
  env.scenes[0].expires_at = env.utcAfter(-60);
  const exp = svc.peekTraceScene(CHANNEL, String(r.sceneId), 'openidA');
  assert.ok(exp.reject && exp.reject.includes('已过期'), '过期必须拒绝');
});

test('peekTraceScene: 数字但库里没有 → 返回空对象交回上层走旧路径（不能误报 reject）', () => {
  const env = makeEnv();
  assert.deepEqual(env.svc().peekTraceScene(CHANNEL, '999999', 'o1'), {}, '非本表管辖应回落，不能吞掉其它场景');
});

test('resolveReply: SCAN 收到数字 scene_id → 按映射换成防伪码并弹溯源卡片', async () => {
  const env = makeEnv();
  const svc = env.svc();
  const r = await svc.createTraceSceneQr(CHANNEL, TRACE_CODE, 'openidA', 1800);

  const xml = svc.resolveReply(CHANNEL, { msgType: 'event', event: 'SCAN', eventKey: String(r.sceneId), fromUser: 'openidA', toUser: 'wxtrace' }, { baseUrl: 'https://h.com' });
  assert.ok(xml && xml.includes('<MsgType><![CDATA[news]]>'), '命中动态场景码应弹图文卡片');
  assert.ok(xml.includes(TRACE_CODE), '卡片应落到**映射出来的那个防伪码**');
  assert.ok(env.scenes[0].used_at, '成功出卡后必须标记已用（一次有效）');
});

test('resolveReply: 微信超时重投 SCAN（本次没成卡）不该吃掉这次机会', async () => {
  // 🔴 真实风险：微信在 5 秒内没收到响应会重投 SCAN。若先标记用量，
  //    重投会被判「已使用」→ 消费者永远拿不到卡片。故只在成卡后才落用量。
  //    「不成卡」用**换到另一个租户的渠道**来模拟（同样的码在别人租户下查不到批次 → 返回 null），
  //    而不能用「没配展示位」来模拟 —— 展示位为空时现在会兜底给一张验真结果卡
  //    （否则商户选了公众号推送却什么也收不到，等于哑开关）。
  const env = makeEnv();
  const svc = env.svc();
  const r = await svc.createTraceSceneQr(CHANNEL, TRACE_CODE, 'openidA', 1800);
  const otherTenantChannel = { ...CHANNEL, customer_id: 999 };

  const xml = svc.resolveReply(otherTenantChannel, { msgType: 'event', event: 'SCAN', eventKey: String(r.sceneId), fromUser: 'openidA', toUser: 'wxtrace' }, { baseUrl: 'https://h.com' });
  assert.equal(xml, null, '批次不属于该租户时不成卡');
  assert.equal(env.scenes[0].used_at, null, '没成卡就标记用量会把微信重试挡掉');
});

test('resolveReply: 未配置展示位也必须出卡（否则「公众号推送」方案变哑开关）', async () => {
  const env = makeEnv({ settingsJson: '{}' });
  const svc = env.svc();
  const r = await svc.createTraceSceneQr(CHANNEL, TRACE_CODE, 'openidA', 1800);
  const xml = svc.resolveReply(CHANNEL, { msgType: 'event', event: 'SCAN', eventKey: String(r.sceneId), fromUser: 'openidA', toUser: 'wxtrace' }, { baseUrl: 'https://h.com' });
  assert.ok(xml && xml.includes('<MsgType><![CDATA[news]]>'), '没配展示位也要给出验真结果卡');
  assert.ok(xml.includes(TRACE_CODE), '兜底卡片必须带上防伪码');
  assert.ok(env.scenes[0].used_at, '出卡了就该标记用量');
});

test('resolveReply: 扫码关注（subscribe + qrscene_<数字>）同样走动态场景码', async () => {
  const env = makeEnv();
  const svc = env.svc();
  const r = await svc.createTraceSceneQr(CHANNEL, TRACE_CODE, '', 1800);
  const xml = svc.resolveReply(CHANNEL, { msgType: 'event', event: 'subscribe', eventKey: `qrscene_${r.sceneId}`, fromUser: 'o1', toUser: 'wxtrace' }, { baseUrl: 'https://h.com' });
  assert.ok(xml && xml.includes('<MsgType><![CDATA[news]]>'), '扫码关注也应弹卡片');
});

test('resolveReply: 旧路径不被破坏 —— scene 本身就是防伪码仍然正常弹卡片', async () => {
  const env = makeEnv();
  const xml = env.svc().resolveReply(CHANNEL, { msgType: 'event', event: 'SCAN', eventKey: TRACE_CODE, fromUser: 'o1', toUser: 'wxtrace' }, { baseUrl: 'https://h.com' });
  assert.ok(xml && xml.includes('<MsgType><![CDATA[news]]>'), '已印刷在外的永久码必须继续可用');
});
