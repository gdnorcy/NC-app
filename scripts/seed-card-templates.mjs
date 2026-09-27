#!/usr/bin/env node
// 名片模板库种子脚本：幂等补种 6 个新模板（A/D/E/G/H/I → 精致商务/实时光效/沉浸展示/黑金奢华/暗夜科技/纸艺雅致）
// 用法：node scripts/seed-card-templates.mjs   （DB 默认 server/data/panorama.db，可传 DB 路径参数）
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.argv[2] || path.join(__dirname, '..', 'server', 'data', 'panorama.db');
const db = new DatabaseSync(dbPath);

const templates = [
  {
    name: '精致商务', layout: 'card',
    theme_config: {
      primary: '#165dff', heroLayout: 'cls', bgType: 'gradient',
      bgStart: '#0e2a4e', bgEnd: '#3b7bd4', bgAngle: 160,
      textColor: '#ffffff', text2Color: 'rgba(255,255,255,.85)',
      accent: '#7cc0ff', fontFamily: 'sans', border: 'none',
      texture: 'spots', radius: 18, barTop: false,
    },
  },
  {
    name: '实时光效', layout: 'card',
    theme_config: {
      primary: '#165dff', heroLayout: 'cls', bgType: 'gradient',
      bgStart: '#0e2a4e', bgEnd: '#7cc0ff', bgAngle: 165,
      textColor: '#ffffff', text2Color: 'rgba(255,255,255,.85)',
      accent: '#a8d4ff', fontFamily: 'sans', border: 'none',
      texture: 'spots', radius: 18, barTop: false,
    },
  },
  {
    name: '沉浸展示', layout: 'card',
    theme_config: {
      primary: '#0e9bd4', heroLayout: 'ctr', bgType: 'solid',
      bgStart: '#fdfcfb', bgEnd: '#eef1f8', bgAngle: 165,
      textColor: '#1d2129', text2Color: 'rgba(29,33,41,.7)',
      accent: '#0e9bd4', fontFamily: 'sans', border: 'none',
      texture: 'none', radius: 18, barTop: true,
    },
  },
  {
    name: '黑金奢华', layout: 'card',
    theme_config: {
      primary: '#c9a25e', heroLayout: 'ctr', bgType: 'gradient',
      bgStart: '#1c1812', bgEnd: '#2a241c', bgAngle: 160,
      textColor: '#f0ead9', text2Color: 'rgba(240,234,217,.8)',
      accent: '#c9a25e', fontFamily: 'serif', border: 'gold',
      borderColor: '#c9a25e', texture: 'none', radius: 14, barTop: false,
    },
  },
  {
    name: '暗夜科技', layout: 'card',
    theme_config: {
      primary: '#4d8dff', heroLayout: 'mag', bgType: 'glass',
      bgStart: '#1a2f5c', bgEnd: '#3a2a5c', bgAngle: 160,
      textColor: '#e8ecff', text2Color: 'rgba(232,236,255,.75)',
      accent: '#4d8dff', fontFamily: 'sans', border: 'glow',
      borderColor: '#4d8dff', texture: 'none', radius: 16, barTop: false,
    },
  },
  {
    name: '纸艺雅致', layout: 'card',
    theme_config: {
      primary: '#c9a25e', heroLayout: 'mag', bgType: 'paper',
      bgStart: '#fdfcf9', bgEnd: '#f4f1ea', bgAngle: 160,
      textColor: '#2b2723', text2Color: 'rgba(43,39,35,.75)',
      accent: '#c9a25e', fontFamily: 'serif', border: 'gold',
      borderColor: '#c9a25e', texture: 'dots', radius: 8, barTop: false,
    },
  },
];

let inserted = 0;
let skipped = 0;
for (const t of templates) {
  const exist = db.prepare('SELECT id FROM card_templates WHERE name = ? AND enabled = 1').get(t.name);
  if (exist) { skipped++; continue; }
  db.prepare(
    'INSERT INTO card_templates (name, price, layout, theme_config, enabled, sort_order) VALUES (?, 0, ?, ?, 1, 100)'
  ).run(t.name, t.layout, JSON.stringify(t.theme_config));
  inserted++;
  console.log('插入:', t.name);
}
console.log(`完成：插入 ${inserted}，跳过已存在 ${skipped}。DB=${dbPath}`);
