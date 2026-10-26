function safeJson(text, fallback) {
  try { return JSON.parse(text || ''); } catch { return fallback; }
}

function randInt(min, max) {
  const a = Math.ceil(Number(min));
  const b = Math.floor(Number(max));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return a >= b ? a : Math.floor(Math.random() * (b - a + 1)) + a;
}

function normalizeRedAmountCents(amount, adapters) {
  if (adapters?.normalizeRedAmountCents) return adapters.normalizeRedAmountCents(amount);
  return Math.max(100, Math.round(Number(amount) || 0));
}

function memberMatched(ruleValue, actual) {
  return ruleValue === undefined || ruleValue === null || ruleValue === '' || String(ruleValue) === String(actual);
}

function passBlackWhite(cl, member) {
  if (!cl || !cl.cl) return true;
  const hit = (memberMatched(cl.hy, member.groupid) || memberMatched(cl.fs, member.fansGroupid) || (cl.vip && member.isvip));
  if (String(cl.cl) === '1') return !hit;
  if (String(cl.cl) === '2') return hit;
  return true;
}

function splitLines(text) {
  return String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

export function applyTraceReward({ db, tenantId, settings, batch, record, req, adapters = {} }) {
  const hd = safeJson(batch.caid_json, {});
  const member = adapters.getMemberContext?.(req) || {
    uid: Number(req.body?.userId || req.user?.id || 0),
    groupid: req.body?.groupid,
    fansGroupid: req.body?.fansGroupid,
    isvip: Boolean(req.body?.isvip),
    openid: String(req.body?.openid || ''),
  };
  if (!member.uid || Number(record.is_rewarded || 0) !== 0) return { rewarded: false, reason: 'not_first_or_no_user', record };
  if (Number(batch.inttype) === 88) return { rewarded: false, reason: 'goods_link_no_reward', record };
  if (!passBlackWhite(hd?.cl?.db, member) || !passBlackWhite(hd?.cl?.dw, member)) {
    return { rewarded: false, reason: 'black_white_blocked', record };
  }

  let tp = String(batch.inttype || '0');
  let text = '';
  let values = [];
  if (record.credit_type && Number(record.fnum || 0) > 0) {
    tp = String(record.credit_type).slice(-1);
    values = tp === '9' ? [Number(record.fnum), Number(record.fnum)] : [Number(record.fnum), Number(record.fnum)];
  } else if (String(batch.inttype) === '99') {
    let ticket = randInt(1, 10000);
    const cj = hd.cj || {};
    for (let i = 1; i < 6; i += 1) {
      const item = cj[i] || cj[String(i)];
      if (!item || Number(item.gl || 0) <= 0) continue;
      if (ticket <= Number(item.gl)) {
        values = String(item.zz || '').split('#');
        text = item.tx || '';
        tp = String(item.is || '0');
        break;
      }
      ticket -= Number(item.gl || 0);
    }
    if (!values.length) {
      values = String(cj[0]?.zz || cj['0']?.zz || '').split('#');
      text = cj[0]?.tx || cj['0']?.tx || '';
      tp = String(cj[0]?.is || cj['0']?.is || '0');
    }
  } else if (String(batch.inttype) === '8') {
    tp = '8';
    values = splitLines(hd.caid);
  } else {
    tp = String(batch.inttype || '0');
    if (String(hd?.jf?.tp || '') === '1') values = [hd?.jf?.do, hd?.jf?.up];
    else values = [hd?.jf?.gd ?? batch.integral ?? 0, hd?.jf?.gd ?? batch.integral ?? 0];
  }

  const updateRecord = (fields) => {
    db.prepare(`UPDATE trace_codes SET credit_type = ?, fnum = ?, is_rewarded = ?, tx = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?`)
      .run(fields.credit_type || '', Number(fields.fnum || 0), Number(fields.is_rewarded || 0), String(fields.tx || ''), tenantId, record.id);
    return db.prepare('SELECT * FROM trace_codes WHERE tenant_id = ? AND id = ?').get(tenantId, record.id);
  };

  if (tp === '9') {
    let amountCents = randInt(values[0], values[1]);
    amountCents = normalizeRedAmountCents(amountCents, adapters);
    const budget = Number(batch.red_budget_cents ?? -1);
    if (budget !== -1 && budget < amountCents) {
      const next = updateRecord({ credit_type: 'credit9', fnum: amountCents, is_rewarded: 0, tx: '红包预算不足' });
      return { rewarded: false, type: 'credit9', amountCents, reason: 'budget_not_enough', record: next };
    }
    if (String(settings.isred ?? '') !== '1') {
      const next = updateRecord({ credit_type: 'credit9', fnum: amountCents, is_rewarded: 0, tx: settings.rednotx || '系统关闭红包发放功能' });
      return { rewarded: false, type: 'credit9', amountCents, reason: 'red_disabled', record: next };
    }
    if (budget !== -1) {
      db.prepare('UPDATE trace_batches SET red_budget_cents = red_budget_cents - ?, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(amountCents, tenantId, batch.id);
    }
    const result = adapters.sendRedPacket
      ? adapters.sendRedPacket({ openid: member.openid, amountCents, recordId: record.id, settings, batch, config: hd.red || {} })
      : { ok: false, message: '目标平台未配置 sendRedPacket 适配器' };
    const next = updateRecord({ credit_type: 'credit9', fnum: amountCents, is_rewarded: result.ok ? 1 : 0, tx: result.ok ? (text || '红包发放成功') : (result.message || '红包发放失败') });
    return { rewarded: Boolean(result.ok), type: 'credit9', amountCents, message: result.message || '', record: next };
  }

  if (tp === '8') {
    const card = splitLines(hd.caid).sort(() => Math.random() - 0.5).find((s) => s.length > 20);
    const result = adapters.sendWxcard
      ? adapters.sendWxcard({ openid: member.openid, card, recordId: record.id, settings, batch })
      : { ok: false, message: '目标平台未配置 sendWxcard 适配器' };
    const next = updateRecord({ credit_type: 'credit8', fnum: 1, is_rewarded: result.ok ? 1 : 0, tx: result.ok ? (text || '卡券发放成功') : (result.message || '卡券发放失败') });
    return { rewarded: Boolean(result.ok), type: 'credit8', message: result.message || '', record: next };
  }

  if (tp === '7' || tp === '11') {
    const goodsId = Math.max(0, Number(values[0] || 0));
    const result = adapters.sendGoods
      ? adapters.sendGoods({ openid: member.openid, goodsId, mode: tp === '7' ? 'mail' : 'writeoff', recordId: record.id, settings, batch })
      : { ok: false, message: '目标平台未配置 sendGoods 适配器' };
    const next = updateRecord({ credit_type: 'credit7', fnum: goodsId, is_rewarded: result.ok ? 1 : 0, tx: result.message || text || '' });
    return { rewarded: Boolean(result.ok), type: 'credit7', goodsId, message: result.message || '', record: next };
  }

  const creditTypeNo = Number(tp);
  if (creditTypeNo >= 1 && creditTypeNo <= 5 && Number(values[0] || 0) > 0) {
    let amount = randInt(values[0], values[1]);
    if (creditTypeNo === 2) amount = Math.round(amount * 100) / 100;
    const result = adapters.grantCredit
      ? adapters.grantCredit({ userId: member.uid, creditType: `credit${creditTypeNo}`, amount, remark: `防伪查询奖励 ${record.code}`, recordId: record.id })
      : { ok: false, message: '目标平台未配置 grantCredit 适配器' };
    const next = updateRecord({ credit_type: `credit${creditTypeNo}`, fnum: amount, is_rewarded: result.ok ? 1 : 0, tx: result.ok ? (text || '积分发放成功') : (result.message || '积分发放失败') });
    return { rewarded: Boolean(result.ok), type: `credit${creditTypeNo}`, amount, message: result.message || '', record: next };
  }

  return { rewarded: false, reason: 'no_reward_rule', record };
}
