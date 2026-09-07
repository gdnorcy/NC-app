const Database = require('better-sqlite3');
const db = new Database('data/panorama.db');
const rows = db.prepare("SELECT p.id, p.title, (SELECT COUNT(*) FROM scenes s WHERE s.plan_id=p.id) c FROM plans p ORDER BY p.id DESC LIMIT 5").all();
console.log('plans:', JSON.stringify(rows));
const scenes = db.prepare('SELECT id, plan_id, title, image_path FROM scenes ORDER BY plan_id LIMIT 8').all();
console.log('scenes:', JSON.stringify(scenes.map(s=>({id:s.id,planId:s.plan_id,title:s.title,img:(s.image_path||'').slice(0,50)}))));
