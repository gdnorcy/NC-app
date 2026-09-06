// 填充智能名片演示资料（对齐demo原型"我的名片"页 + "访客雷达"页）
// 用法：node src/seed-card-demo.js （幂等：各阶段独立，缺失才填充）
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'panorama.db');
const db = new DatabaseSync(dbPath);

const DEMO_OPENID = 'mock_demo_chenchen';
const IMG = {
  avatar: 'https://aka.doubaocdn.com/s/ko3kWgT9e9', // 陈晨头像
  gallery: 'https://aka.doubaocdn.com/s/Up5ObhvvM7',
  studio: 'https://aka.doubaocdn.com/s/c08ZNEXSsl',
  team: 'https://aka.doubaocdn.com/s/hWJf2cAUeV',
  building: 'https://aka.doubaocdn.com/s/9W3Yzv4QVa',
  office: 'https://aka.doubaocdn.com/s/zQwSCBgeXw',
};
const now = new Date().toISOString();

// ============ 1. 演示用户（陈晨）============
let user = db.prepare('SELECT id FROM platform_user WHERE openid = ?').get(DEMO_OPENID);
if (!user) {
  const r = db.prepare(
    `INSERT INTO platform_user (openid, nickname, avatar, member_level, member_expire_at, created_at, updated_at)
     VALUES (?, ?, ?, 'gold', '2027-12-31 23:59:59', ?, ?)`
  ).run(DEMO_OPENID, '陈晨', IMG.avatar, now, now);
  user = { id: Number(r.lastInsertRowid) };
  console.log('+ 演示用户（陈晨）#' + user.id);
}
const userId = user.id;

// ============ 2. 演示名片 ============
let card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
if (!card) {
  const r = db.prepare(
    `INSERT INTO card_profile (user_id, card_type, name, position, city, phone, wechat, email, bio, business_field, avatar, slogan, tags, is_public, video_channel, status)
     VALUES (?, 'personal', '陈晨', '独立摄影师 / 品牌视觉顾问', '东莞', '13900006688', 'chenchen2026', 'chenchen@demo.com',
     '6 年商业摄影经验，专注品牌视觉、人像写真与产品拍摄。',
     '商业摄影 · 人像写真 · 视频创作', ?, '约拍·商业摄影', '约拍,品牌视觉,视频,商业合作', 1, '陈晨摄影工作室', 'active')`
  ).run(userId, IMG.avatar);
  card = { id: Number(r.lastInsertRowid) };
  console.log('+ 演示名片 #' + card.id);
}
const cardId = card.id;

// ============ 3. 作品集（demo gall 5张）============
const workCount = db.prepare('SELECT COUNT(*) as c FROM card_works WHERE card_id=?').get(cardId).c;
if (workCount === 0) {
  const works = [
    { img: IMG.gallery, title: '作品集 · 摄影展', sort: 1 },
    { img: IMG.studio, title: '工作室日常', sort: 2 },
    { img: IMG.team, title: '团队合影', sort: 3 },
    { img: IMG.building, title: '建筑空间', sort: 4 },
    { img: IMG.office, title: '品牌案例', sort: 5 },
  ];
  for (const w of works) {
    db.prepare('INSERT INTO card_works (card_id, image_url, title, sort_order) VALUES (?,?,?,?)')
      .run(cardId, w.img, w.title, w.sort);
  }
  console.log('+ 作品集 5张');
}

// ============ 4. 动态（demo dyns 2条）============
const dynCount = db.prepare('SELECT COUNT(*) as c FROM card_dynamic WHERE card_id=?').get(cardId).c;
if (dynCount === 0) {
  const dyns = [
    { title: '新一季作品集上线了', content: '最近整理了一批商业摄影作品，欢迎约拍与品牌合作。', img: IMG.gallery, like: 24, com: 6 },
    { title: '工作室的一天', content: '从选片到修图，记录一支片子的诞生过程。', img: IMG.studio, like: 15, com: 3 },
  ];
  for (const d of dyns) {
    db.prepare(
      `INSERT INTO card_dynamic (user_id, card_id, title, content, images, like_count, comment_count, visibility, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'public', 'active')`
    ).run(userId, cardId, d.title, d.content, JSON.stringify([d.img]), d.like, d.com);
  }
  console.log('+ 动态 2条');
}

// ============ 5. 视频（demo vids 2条）============
const vidCount = db.prepare('SELECT COUNT(*) as c FROM card_videos WHERE card_id=?').get(cardId).c;
if (vidCount === 0) {
  const vids = [
    { title: '我的工作室 · 日常', cover: IMG.studio, dur: '01:12', sort: 1 },
    { title: '作品集 · 摄影展', cover: IMG.gallery, dur: '00:48', sort: 2 },
  ];
  for (const v of vids) {
    db.prepare('INSERT INTO card_videos (card_id, title, cover_url, duration, sort_order) VALUES (?,?,?,?,?)')
      .run(cardId, v.title, v.cover, v.dur, v.sort);
  }
  console.log('+ 视频 2条');
}

// ============ 6. 演示访客（demo radar seeds 5人）============
const demoVisitorCount = db.prepare("SELECT COUNT(*) as c FROM card_visitor WHERE card_id=? AND visitor_openid LIKE 'mock_demo_visitor%'").get(cardId).c;
if (demoVisitorCount === 0) {
  const seeds = [
    { name: '张先生', visits: 3, dur: 42, action: 'view', detail: '访问了你的名片' },
    { name: '李女士', visits: 1, dur: 18, action: 'exchange', detail: '浏览作品《品牌案例》' },
    { name: '王总', visits: 1, dur: 56, action: 'video', detail: '观看视频《作品集》·56秒' },
    { name: '刘老师', visits: 2, dur: 28, action: 'view', detail: '查看简介 · 浏览作品' },
    { name: '赵先生', visits: 1, dur: 12, action: 'view', detail: '查看简介' },
  ];
  const nowMs = Date.now();
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const vOpenid = 'mock_demo_visitor' + (i + 1);
    const vu = db.prepare('INSERT INTO platform_user (openid, nickname, created_at, updated_at) VALUES (?,?,?,?)')
      .run(vOpenid, s.name, now, now);
    const vUserId = Number(vu.lastInsertRowid);
    const vTime = new Date(nowMs - (i + 1) * 50 * 60 * 1000).toISOString();
    const vDate = vTime.slice(0, 10);
    db.prepare(`INSERT INTO card_visitor (card_id, visitor_openid, visitor_user_id, visit_date, visit_count, duration, pages, last_visit_at)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(cardId, vOpenid, vUserId, vDate, s.visits, s.dur, JSON.stringify(['profile']), vTime.replace('T', ' ').slice(0, 19));
    db.prepare('INSERT INTO card_visitor_action (card_id, visitor_openid, action_type, action_detail, created_at) VALUES (?,?,?,?,?)')
      .run(cardId, vOpenid, s.action, s.detail, vTime.replace('T', ' ').slice(0, 19));
  }
  console.log('+ 演示访客 5人');
}

console.log('演示资料检查完成: 名片#' + cardId);
db.close();
