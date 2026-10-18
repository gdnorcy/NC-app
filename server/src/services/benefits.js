/**
 * 会员分级权益服务（作品/视频号数量 + 自定义作品标签名）——单一事实来源
 *
 * 背景：quota.js 的 collect/lead/push 三件套口径是「套餐列数值 + free 不限」，
 *   面向运营可调的后台配额；而作品/视频是重资源位，免费用户也必须有上限
 *   （否则一名片可传无限图），故本服务用**中心化代码配置**并服务端强制：
 *   - worksLimit：作品图上限（跨该用户名下所有名片累计，防建多名片绕过）
 *   - videosLimit：视频号条目上限（card_videos 纯元数据：封面+标题+时长）
 *   - customWorksLabel：是否允许自定义作品标签名（card_profile.works_label）
 *
 * 🔴 与 quota.js 的分层：quota=运营后台可调配额（member_package 列）；
 *    本服务=产品阶梯策略（代码常量，改需发版）。两者不互相读取，避免双源漂移。
 * 🔴 等级口径与 quota.planOf 一致：member_level 无效/过期 → free。
 */

const LEVELS = ['free', 'silver', 'gold', 'diamond'];

/** 四级权益阶梯（方案A规划值；调整必须同步 C 端展示文案与测试基线） */
const BENEFITS = {
  free:    { worksLimit: 3,   videosLimit: 0,  customWorksLabel: false },
  silver:  { worksLimit: 15,  videosLimit: 2,  customWorksLabel: true },
  gold:    { worksLimit: 40,  videosLimit: 6,  customWorksLabel: true },
  diamond: { worksLimit: 120, videosLimit: 20, customWorksLabel: true },
};

/** 自定义标签名长度上限（tab 窄，超长必溢出） */
export const WORKS_LABEL_MAX = 6;

export function createBenefitsService(db) {
  const svc = {};

  /** 用户当前有效等级：非会员/过期/异常值 → free（与 quota.planOf 同口径） */
  svc.levelOf = (userId) => {
    if (!userId) return 'free';
    const user = db.prepare('SELECT member_level, member_expire_at FROM platform_user WHERE id = ?').get(userId);
    if (!user || !user.member_level || !LEVELS.includes(user.member_level)) return 'free';
    if (user.member_expire_at && user.member_expire_at !== '') {
      const exp = new Date(String(user.member_expire_at).replace(' ', 'T'));
      if (Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) return 'free';
    }
    return user.member_level;
  };

  /** 权益配置（level → BENEFITS 项） */
  svc.benefitsOf = (userId) => BENEFITS[svc.levelOf(userId)] || BENEFITS.free;

  /** 已用作品数：跨用户名下所有未删除名片累计（card_works ⋈ card_profile.user_id） */
  svc.worksUsed = (userId) => db.prepare(
    `SELECT COUNT(*) AS c FROM card_works w
     JOIN card_profile cp ON cp.id = w.card_id
     WHERE cp.user_id = ? AND (cp.status IS NULL OR cp.status != 'deleted')`
  ).get(userId).c || 0;

  /** 已用视频条目数：同上口径 */
  svc.videosUsed = (userId) => db.prepare(
    `SELECT COUNT(*) AS c FROM card_videos v
     JOIN card_profile cp ON cp.id = v.card_id
     WHERE cp.user_id = ? AND (cp.status IS NULL OR cp.status != 'deleted')`
  ).get(userId).c || 0;

  /** 能否新增作品：{ ok, used, limit }（limit 已达 → ok=false，调用方 403 + 引导升级） */
  svc.canAddWork = (userId) => {
    const b = svc.benefitsOf(userId);
    const used = svc.worksUsed(userId);
    return { ok: used < b.worksLimit, used, limit: b.worksLimit };
  };

  /** 能否新增视频条目：同上 */
  svc.canAddVideo = (userId) => {
    const b = svc.benefitsOf(userId);
    const used = svc.videosUsed(userId);
    return { ok: used < b.videosLimit, used, limit: b.videosLimit };
  };

  /** 是否允许自定义作品标签名（白银+） */
  svc.canCustomWorksLabel = (userId) => !!svc.benefitsOf(userId).customWorksLabel;

  /** 前端展示用：当前用户权益快照（/member/status 消费） */
  svc.snapshot = (userId) => {
    const level = svc.levelOf(userId);
    const b = BENEFITS[level] || BENEFITS.free;
    return {
      level,
      worksLimit: b.worksLimit,
      worksUsed: svc.worksUsed(userId),
      videosLimit: b.videosLimit,
      videosUsed: svc.videosUsed(userId),
      customWorksLabel: b.customWorksLabel,
    };
  };

  return svc;
}
