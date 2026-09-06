// 填充智能名片演示资料（对齐demo原型"我的名片"页）
// 用法：node src/seed-card-demo.js （幂等：已存在演示用户则跳过）
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

const existing = db.prepare('SELECT id FROM platform_user WHERE openid = ?').get(DEMO_OPENID);
if (existing) {
  const hasCard = db.prepare('SELECT id FROM card_profile WHERE user_id = ?').get(existing.id);
  if (hasCard) {
    console.log('演示资料已存在（openid=' + DEMO_OPENID + '），跳过');
    db.close();
    process.exit(0);
  }
  console.log('演示用户已存在但名片未建，继续补建名片…');
}

const now = new Date().toISOString();
let userId;
if (existing) {
  userId = existing.id;
} else {
  const userResult = db.prepare(
    `INSERT INTO platform_user (openid, nickname, avatar, member_level, member_expire_at, created_at, updated_at)
     VALUES (?, ?, ?, 'gold', '2027-12-31 23:59:59', ?, ?)`
  ).run(DEMO_OPENID, '陈晨', IMG.avatar, now, now);
  userId = Number(userResult.lastInsertRowid);
}

const cardResult = db.prepare(
  `INSERT INTO card_profile (user_id, card_type, name, position, city, phone, wechat, email, bio, business_field, avatar, slogan, tags, is_public, video_channel, status)
   VALUES (?, 'personal', '陈晨', '独立摄影师 / 品牌视觉顾问', '东莞', '13900006688', 'chenchen2026', 'chenchen@demo.com',
   '6 年商业摄影经验，专注品牌视觉、人像写真与产品拍摄。',
   '商业摄影 · 人像写真 · 视频创作', ?, '约拍·商业摄影', '约拍,品牌视觉,视频,商业合作', 1, '陈晨摄影工作室', 'active')`
).run(userId, IMG.avatar);
const cardId = Number(cardResult.lastInsertRowid);

// 作品集（demo gall 5张）
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

// 动态（demo dyns 2条）
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

// 视频（demo vids 2条）
const vids = [
  { title: '我的工作室 · 日常', cover: IMG.studio, dur: '01:12', sort: 1 },
  { title: '作品集 · 摄影展', cover: IMG.gallery, dur: '00:48', sort: 2 },
];
for (const v of vids) {
  db.prepare('INSERT INTO card_videos (card_id, title, cover_url, duration, sort_order) VALUES (?,?,?,?,?)')
    .run(cardId, v.title, v.cover, v.dur, v.sort);
}

console.log('演示资料填充完成: 用户#' + userId + ' 名片#' + cardId + ' 作品' + works.length + ' 动态' + dyns.length + ' 视频' + vids.length);
db.close();
