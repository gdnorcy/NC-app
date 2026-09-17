import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

/**
 * 三层数据模型：
 *   projects（客户项目） 1:N  plans（方案，原"项目"） 1:N  scenes（场景）
 * 存量迁移：旧 projects 表（方案）重命名为 plans，scenes.project_id 重命名为 plan_id，
 * 新建 projects（客户）表，所有 plans 自动归入"默认客户"。
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL,
  preview_path TEXT NOT NULL DEFAULT '',
  pyramid TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS storage_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'local',
  providers TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const PLANS_SCHEMA = `
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_path TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  share_token TEXT NOT NULL DEFAULT '',
  share_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CUSTOMERS_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  logo_path TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  valid_from TEXT,
  valid_until TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  remark TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  invite_code TEXT NOT NULL DEFAULT '',
  solutions TEXT NOT NULL DEFAULT '["panorama"]', -- 已开通解决方案（code 数组）
  quota TEXT NOT NULL DEFAULT '{}', -- 套餐额度: max_individuals, max_enterprises, max_employees等
  admin_user_id INTEGER, -- 客户管理员账号（users.id）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const USERS_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const SMS_CODES_SCHEMA = `
CREATE TABLE IF NOT EXISTS sms_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'register',
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_codes(phone, purpose);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_user ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON operation_logs(created_at);

CREATE TABLE IF NOT EXISTS bg_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  run_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON bg_jobs(status, run_at);
`;

/** 生成不可猜的分享令牌（8 字符 base64url） */
export function genShareToken() {
  return randomBytes(6).toString('base64url');
}

export function createDb(dbPath = config.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  db.exec("INSERT OR IGNORE INTO storage_config (id, provider) VALUES (1, 'local')");
  migrate(db);
  return db;
}

function tableExists(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function colExists(db, table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}

/** 方案中心 P0：补齐分类归属 + 默认价格 + 默认权限点（幂等） */
/**
 * 方案化迁移（幂等）：现有解决方案 → 应用清单 + 应用菜单 + 方案-应用关联
 * - apps：从 solutions 沉淀（panorama/card…），此后新增应用直接 INSERT apps
 * - app_menus：从现有 solution_permissions 去重提取（按方案 code 归属应用）
 * - solution_apps：预置方案自动关联自身应用；「演示试用方案」(is_demo) 自动纳入全部应用（含新增）
 * - solution_permissions.app_id：按方案 code 回填归属应用
 */
function ensureDemoSolution(db) {
  const demo = db.prepare("SELECT id, is_demo FROM solutions WHERE code = 'demo' OR is_demo = 1 ORDER BY is_demo DESC LIMIT 1").get();
  if (demo) {
    if (!demo.is_demo) db.prepare("UPDATE solutions SET is_demo = 1, updated_at = datetime('now') WHERE id = ?").run(demo.id);
    return demo.id;
  }
  const r = db.prepare(
    "INSERT INTO solutions (name, code, description, icon, status, sort_order, is_demo) VALUES ('演示试用方案', 'demo', '预置演示方案：包含平台全部应用，新增应用自动纳入', 'apps', 'on', 0, 1)"
  ).run();
  return r.lastInsertRowid;
}

function migrateSolutionApps(db) {
  const demoSolutionId = ensureDemoSolution(db);
  // 演示方案默认配额（2026-09-08 确认）：员工10 / 入驻企业1 / 场景3 / 集市上架10
  // 幂等：仅当该项当前为 0（未设置）时写入默认值，管理员已配置的非 0 值不被覆盖
  if (demoSolutionId) {
    const demoQuotas = [
      ['card', 'enterpriseCount', '入驻企业数', 1],
      ['card', 'employeeCount', '企业员工人数', 10],
      ['card', 'marketItems', '集市上架', 10],
      ['panorama', 'sceneCount', '场景数', 3],
    ];
    for (const [appCode, key, label, value] of demoQuotas) {
      db.prepare(`INSERT INTO solution_quotas (solution_id, app_code, key, label, value, enabled) VALUES (?, ?, ?, ?, ?, 1)
        ON CONFLICT(solution_id, app_code, key) DO UPDATE SET
          value = CASE WHEN solution_quotas.value = 0 THEN excluded.value ELSE solution_quotas.value END,
          enabled = 1`)
        .run(demoSolutionId, appCode, key, label, value);
    }
  }
  // 内置方案降为应用：不再作为可售方案（下架），由「演示试用方案」承接售卖入口
  if (demoSolutionId) {
    const builtin = db.prepare("SELECT id FROM solutions WHERE code IN ('panorama','card') AND status = 'on'").all();
    for (const b of builtin) {
      db.prepare("UPDATE solutions SET status = 'off', updated_at = datetime('now') WHERE id = ?").run(b.id);
    }
  }
  const solutions = db.prepare('SELECT * FROM solutions ORDER BY id ASC').all();
  const appIdByCode = {};
  for (const s of solutions) {
    if (!s.code || s.is_demo) continue; // 演示试用方案是组合包，不沉淀为应用
    let app = db.prepare('SELECT id FROM apps WHERE code = ?').get(s.code);
    if (!app) {
      const r = db.prepare('INSERT INTO apps (code, name, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)')
        .run(s.code, s.name || s.code, s.description || '', s.icon || '', s.sort_order || 0);
      app = { id: r.lastInsertRowid };
    }
    appIdByCode[s.code] = app.id;
    // 方案-应用关联（预置方案自动勾选自身应用；演示方案自动纳入全部应用）
    const targetIds = [s.id];
    if (demoSolutionId && demoSolutionId !== s.id) targetIds.push(demoSolutionId);
    for (const sid of targetIds) {
      if (!db.prepare('SELECT id FROM solution_apps WHERE solution_id = ? AND app_id = ?').get(sid, app.id)) {
        db.prepare('INSERT INTO solution_apps (solution_id, app_id, enabled) VALUES (?, ?, 1)').run(sid, app.id);
      }
    }
  }
  // 演示方案确保覆盖全部应用（含手动新增 apps 但无对应 solution 的情况）
  if (demoSolutionId) {
    const allApps = db.prepare('SELECT id FROM apps ORDER BY id ASC').all();
    for (const a of allApps) {
      if (!db.prepare('SELECT id FROM solution_apps WHERE solution_id = ? AND app_id = ?').get(demoSolutionId, a.id)) {
        db.prepare('INSERT INTO solution_apps (solution_id, app_id, enabled) VALUES (?, ?, 1)').run(demoSolutionId, a.id);
      }
    }
  }
  // 应用菜单：现有 solution_permissions（app_id=0 的存量行）→ app_menus 去重
  const legacyPerms = db.prepare('SELECT * FROM solution_permissions WHERE app_id = 0 ORDER BY id ASC').all();
  for (const p of legacyPerms) {
    const solution = db.prepare('SELECT code FROM solutions WHERE id = ?').get(p.solution_id);
    const appId = (solution && appIdByCode[solution.code]) || 0;
    if (!appId || !p.key) continue;
    if (!db.prepare('SELECT id FROM app_menus WHERE app_id = ? AND key = ?').get(appId, p.key)) {
      db.prepare('INSERT INTO app_menus (app_id, module, module_label, key, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .run(appId, p.module || '', p.module_label || p.module || '', p.key, p.label || p.key, p.sort_order || 0);
    }
    // 回填 app_id
    db.prepare('UPDATE solution_permissions SET app_id = ? WHERE id = ?').run(appId, p.id);
  }
}

function seedSolutionDefaults(db) {
  const solutions = db.prepare('SELECT * FROM solutions').all();
  const catByName = (name) => db.prepare('SELECT id FROM solution_categories WHERE name = ?').get(name)?.id || null;
  const catId = { '名片营销': catByName('名片营销'), '空间展示': catByName('空间展示') };

  const defaultPricing = {
    card: [{ duration_months: 12, agent_price: 999, user_price: 1999, renew_price: 1999 }, { duration_months: 0, agent_price: 9999, user_price: 19999, renew_price: 9999 }],
    panorama: [{ duration_months: 12, agent_price: 499, user_price: 999, renew_price: 999 }, { duration_months: 0, agent_price: 4999, user_price: 9999, renew_price: 4999 }],
  };
  const defaultPermissions = {
    card: [
      ['总览', '数据洞察', 'card:overview'],
      ['名片管理', '名片查看', 'card:view'], ['名片管理', '名片编辑', 'card:edit'], ['名片管理', '名片删除', 'card:delete'],
      ['访客雷达', '访客记录', 'visitor:view'], ['访客雷达', '访客导出', 'visitor:export'],
      ['客户管理', '客户查看', 'customer:view'], ['客户管理', '客户编辑', 'customer:edit'], ['客户管理', '客户分配', 'customer:assign'],
      ['人脉集市', '集市查看', 'market:view'], ['人脉集市', '集市管理', 'market:manage'], ['人脉集市', '名片交换', 'market:exchange'],
      ['公海客户', '公海查看', 'pool:view'], ['公海客户', '公海领取', 'pool:claim'],
      ['模板管理', '模板查看', 'template:view'], ['模板管理', '模板使用', 'template:use'],
      ['成员管理', '成员查看', 'member:view'], ['成员管理', '成员管理', 'member:manage'],
      ['系统设置', '设置查看', 'setting:view'], ['系统设置', '设置编辑', 'setting:edit'],
    ],
    panorama: [
      ['总览', '数据洞察', 'pano:overview'],
      ['方案管理', '方案查看', 'plan:view'], ['方案管理', '方案编辑', 'plan:edit'],
      ['场景管理', '场景查看', 'scene:view'], ['场景管理', '场景编辑', 'scene:edit'], ['场景管理', '场景删除', 'scene:delete'],
      ['分享渠道', '分享查看', 'share:view'], ['分享渠道', '分享配置', 'share:edit'],
      ['系统设置', '设置查看', 'setting:view'], ['系统设置', '设置编辑', 'setting:edit'],
    ],
  };

  const insPrice = db.prepare('INSERT INTO solution_pricing (solution_id, duration_months, agent_price, user_price, renew_price) VALUES (?, ?, ?, ?, ?)');
  const insMenu = db.prepare('INSERT OR IGNORE INTO app_menus (app_id, module, module_label, key, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const insAppPerm = db.prepare('INSERT OR IGNORE INTO solution_permissions (solution_id, app_id, module, module_label, key, label, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)');

  solutions.forEach((s) => {
    // 分类归属
    const cat = s.code === 'card' ? catId['名片营销'] : s.code === 'panorama' ? catId['空间展示'] : null;
    if (cat && !db.prepare('SELECT id FROM solutions WHERE id = ? AND category_id IS NOT NULL').get(s.id)) {
      db.prepare('UPDATE solutions SET category_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(cat, s.id);
    }
    // 默认价格
    const priceCount = db.prepare('SELECT COUNT(*) AS n FROM solution_pricing WHERE solution_id = ?').get(s.id).n;
    if (priceCount === 0 && defaultPricing[s.code]) {
      defaultPricing[s.code].forEach((p) => insPrice.run(s.id, p.duration_months, p.agent_price, p.user_price, p.renew_price));
    }
    // 默认权限：应用菜单定义（app_menus）+ 预置方案授权记录（solution_permissions）
    const app = db.prepare('SELECT id FROM apps WHERE code = ?').get(s.code);
    if (app && defaultPermissions[s.code]) {
      defaultPermissions[s.code].forEach(([module, label, key], idx) => {
        insMenu.run(app.id, module, module, key, label, idx);
      });
      const permCount = db.prepare('SELECT COUNT(*) AS n FROM solution_permissions WHERE solution_id = ?').get(s.id).n;
      if (permCount === 0) {
        defaultPermissions[s.code].forEach(([module, label, key], idx) => {
          insAppPerm.run(s.id, app.id, module, module, key, label, idx);
        });
      }
    }
  });
  // 演示试用方案：已勾选应用的全量菜单授权（装进去即可用；未来新增菜单默认不选）
  const demoSolutions = db.prepare('SELECT id FROM solutions WHERE is_demo = 1').all();
  for (const d of demoSolutions) {
    const demoApps = db.prepare('SELECT app_id FROM solution_apps WHERE solution_id = ? AND enabled = 1').all(d.id);
    for (const a of demoApps) {
      const menus = db.prepare('SELECT * FROM app_menus WHERE app_id = ?').all(a.app_id);
      for (const m of menus) {
        if (!db.prepare('SELECT id FROM solution_permissions WHERE solution_id = ? AND app_id = ? AND key = ?').get(d.id, a.app_id, m.key)) {
          insAppPerm.run(d.id, a.app_id, m.module, m.module_label, m.key, m.label, m.sort_order);
        }
      }
    }
  }
}

/** 存量库迁移（幂等） */
function migrate(db) {
  // —— content_comment 表：补 nickname（C 端评论昵称） ——
  if (!colExists(db, 'content_comment', 'nickname')) {
    db.exec("ALTER TABLE content_comment ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
  }

  // —— scenes 表：补字段 + project_id → plan_id ——
  if (!colExists(db, 'scenes', 'preview_path')) {
    db.exec("ALTER TABLE scenes ADD COLUMN preview_path TEXT NOT NULL DEFAULT ''");
  }
  if (!colExists(db, 'scenes', 'pyramid')) {
    db.exec("ALTER TABLE scenes ADD COLUMN pyramid TEXT NOT NULL DEFAULT ''");
  }
  if (colExists(db, 'scenes', 'project_id') && !colExists(db, 'scenes', 'plan_id')) {
    db.exec('ALTER TABLE scenes RENAME COLUMN project_id TO plan_id');
  }
  if (!colExists(db, 'scenes', 'plan_id')) {
    db.exec('ALTER TABLE scenes ADD COLUMN plan_id INTEGER');
  }
  if (!colExists(db, 'scenes', 'share_token')) {
    db.exec("ALTER TABLE scenes ADD COLUMN share_token TEXT NOT NULL DEFAULT ''");
  }
  if (!colExists(db, 'scenes', 'share_enabled')) {
    db.exec('ALTER TABLE scenes ADD COLUMN share_enabled INTEGER NOT NULL DEFAULT 0');
  }

  // —— 旧 projects（方案）表 → 重命名为 plans ——
  if (tableExists(db, 'projects') && !tableExists(db, 'plans')) {
    // 旧 projects 是方案表（有 name/cover_path/share_token 列），重命名
    const oldCols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
    if (oldCols.includes('name') && oldCols.includes('share_token')) {
      db.exec('ALTER TABLE projects RENAME TO plans');
    }
  }
  db.exec(PLANS_SCHEMA);
  if (!colExists(db, 'plans', 'project_id')) {
    db.exec('ALTER TABLE plans ADD COLUMN project_id INTEGER');
  }

  // —— 新建 projects（客户项目）表 ——
  // 如果上面没重命名（新库或旧 projects 已是客户表），直接建
  if (!tableExists(db, 'projects')) {
    db.exec(CUSTOMERS_SCHEMA);
  } else {
    // 旧库 projects 已被 rename 为 plans，这里补建客户表；若已是客户表则补列
    const cols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
    if (!cols.includes('customer_name')) {
      // 极端情况：projects 表存在但不是客户表结构 → 重命名为 plans_old 后重建
      db.exec('ALTER TABLE projects RENAME TO projects_old');
      db.exec(CUSTOMERS_SCHEMA);
    } else {
      if (!cols.includes('logo_path')) db.exec("ALTER TABLE projects ADD COLUMN logo_path TEXT NOT NULL DEFAULT ''");
      if (!cols.includes('valid_from')) db.exec('ALTER TABLE projects ADD COLUMN valid_from TEXT');
      if (!cols.includes('valid_until')) db.exec('ALTER TABLE projects ADD COLUMN valid_until TEXT');
      if (!cols.includes('is_pinned')) db.exec('ALTER TABLE projects ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0');
      if (!cols.includes('remark')) db.exec("ALTER TABLE projects ADD COLUMN remark TEXT NOT NULL DEFAULT ''");
      if (!cols.includes('status')) db.exec("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
      if (!cols.includes('admin_user_id')) db.exec('ALTER TABLE projects ADD COLUMN admin_user_id INTEGER');
    }
  }

  // —— 默认客户：收纳所有未归属方案 ——
  const custCount = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
  let defaultCustId = null;
  if (custCount === 0) {
    const info = db
      .prepare(`INSERT INTO projects (customer_name, description, status, invite_code, solutions)
        VALUES (?, ?, ?, ?, ?)`)
      .run('默认客户', '自动创建的默认客户，收纳全部存量方案', 'active', '1001', '["panorama","card"]');
    defaultCustId = info.lastInsertRowid;
  } else {
    defaultCustId = db.prepare('SELECT id FROM projects ORDER BY id ASC LIMIT 1').get()?.id || null;
  }
  if (defaultCustId !== null) {
    db.prepare('UPDATE plans SET project_id = ? WHERE project_id IS NULL OR project_id = 0').run(defaultCustId);
  }

  // —— 默认方案：收纳所有未归属场景 ——
  let defaultPlanId = db.prepare('SELECT id FROM plans ORDER BY sort_order ASC, id ASC LIMIT 1').get()?.id || null;
  if (defaultPlanId === null) {
    const info = db
      .prepare(
        'INSERT INTO plans (project_id, name, description, share_token, share_enabled) VALUES (?, ?, ?, ?, 1)'
      )
      .run(defaultCustId, '默认方案', '自动创建的默认方案，收纳全部存量场景', genShareToken());
    defaultPlanId = info.lastInsertRowid;
  }
  if (defaultPlanId !== null) {
    db.prepare('UPDATE scenes SET plan_id = ? WHERE plan_id IS NULL OR plan_id = 0').run(defaultPlanId);
  }

  // —— card_market_items 补 view_count（旧库缺列导致集市统计 500） ——
  if (tableExists(db, 'card_market_items') && !colExists(db, 'card_market_items', 'view_count')) {
    db.exec('ALTER TABLE card_market_items ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0');
  }

  // —— card_connections 人脉库扩展（分组/备注） ——
  if (tableExists(db, 'card_connections') && !colExists(db, 'card_connections', 'group_name')) {
    db.exec("ALTER TABLE card_connections ADD COLUMN group_name TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(db, 'card_connections') && !colExists(db, 'card_connections', 'remark')) {
    db.exec("ALTER TABLE card_connections ADD COLUMN remark TEXT NOT NULL DEFAULT ''");
  }

  // —— storage_config 多厂商升级 ——
  const storageCols = db.prepare('PRAGMA table_info(storage_config)').all().map((c) => c.name);
  if (storageCols.includes('access_key')) {
    const old = db.prepare('SELECT * FROM storage_config WHERE id = 1').get() || {};
    const base = { accessKey: '', secretKey: '', bucket: '', region: '', zone: '', folder: '', cdnDomain: '' };
    const providers = { local: {}, oss: { ...base }, qiniu: { ...base } };
    const target = old.provider === 'oss' ? 'oss' : old.provider === 'qiniu' ? 'qiniu' : null;
    if (target) {
      providers[target] = {
        accessKey: old.access_key || '',
        secretKey: old.secret_key || '',
        bucket: old.bucket || '',
        region: old.region || '',
        zone: '',
        folder: '',
        cdnDomain: old.cdn_domain || '',
      };
    }
    db.exec('DROP TABLE storage_config');
    db.exec(`
      CREATE TABLE storage_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        provider TEXT NOT NULL DEFAULT 'local',
        providers TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.prepare('INSERT INTO storage_config (id, provider, providers) VALUES (1, ?, ?)').run(
      old.provider || 'local',
      JSON.stringify(providers)
    );
  }

  // —— users 表 + 默认 admin ——
  db.exec(USERS_SCHEMA);
  db.exec(SMS_CODES_SCHEMA);
  const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get().n;
  if (adminCount === 0) {
    const { hash, salt } = hashPassword(config.adminPass);
    db.prepare(
      'INSERT INTO users (username, phone, password_hash, password_salt, role, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(config.adminUser, null, hash, salt, 'admin', 'active');
  }

  // —— users 表加 customer_id（租户关联）——
  if (!colExists(db, 'users', 'customer_id')) {
    db.exec('ALTER TABLE users ADD COLUMN customer_id INTEGER');
  }

  // —— users 表加企业绑定（企业管理员后台账号）——
  if (!colExists(db, 'users', 'enterprise_id')) {
    db.exec('ALTER TABLE users ADD COLUMN enterprise_id INTEGER');
  }

  // —— users 表加微信多端字段 ——
  ['wx_openid', 'mp_openid', 'wx_unionid', 'nickname', 'avatar'].forEach(col => {
    if (!colExists(db, 'users', col)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`);
    }
  });

  // —— orders 表（客户账单/订单）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      order_no TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT,
      paid_at TEXT,
      remark TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
  `);

  // —— billing_plans 表（计费套餐：版本×配额×价格）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,          -- 周期价格（元）
      cycle TEXT NOT NULL DEFAULT 'year',     -- year/month
      quotas TEXT NOT NULL DEFAULT '{}',      -- JSON: max_individuals/max_enterprises/max_employees/max_scenes/max_storage_mb/max_sms/max_market_items
      features TEXT NOT NULL DEFAULT '{}',    -- JSON: market_enabled/panorama_enabled/card_enabled/distribution_enabled
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // —— invoices 表（发票申请与记录）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      order_no TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',          -- 发票抬头
      tax_no TEXT NOT NULL DEFAULT '',         -- 税号
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      bank TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',  -- pending/issued/rejected
      remark TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      issued_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
  `);

  // —— projects 表加计费字段（套餐ID/周期）——
  if (!colExists(db, 'projects', 'billing_plan_id')) {
    db.exec('ALTER TABLE projects ADD COLUMN billing_plan_id INTEGER DEFAULT 1');
  }
  if (!colExists(db, 'projects', 'billing_cycle')) {
    db.exec("ALTER TABLE projects ADD COLUMN billing_cycle TEXT DEFAULT 'year'");
  }

  // —— 种子计费套餐（幂等：仅当表空时插入）——
  const planCount = db.prepare('SELECT COUNT(*) AS n FROM billing_plans').get().n;
  if (planCount === 0) {
    const seedPlans = [
      ['free', '体验套餐', '体验基础能力，适合个人试用', 0, 'year',
        JSON.stringify({ max_individuals: 5, max_enterprises: 1, max_employees: 10, max_scenes: 5, max_storage_mb: 512, max_sms: 0, max_market_items: 10 }),
        JSON.stringify({ market_enabled: false, panorama_enabled: true, card_enabled: true, distribution_enabled: false }), 1, 10],
      ['pro', '专业版', '适合中小商户，解锁人脉集市与分销', 999, 'year',
        JSON.stringify({ max_individuals: 50, max_enterprises: 5, max_employees: 100, max_scenes: 50, max_storage_mb: 5120, max_sms: 1000, max_market_items: 200 }),
        JSON.stringify({ market_enabled: true, panorama_enabled: true, card_enabled: true, distribution_enabled: true }), 1, 20],
      ['flagship', '旗舰版', '全功能开放，企业级配额', 2999, 'year',
        JSON.stringify({ max_individuals: 500, max_enterprises: 50, max_employees: 1000, max_scenes: 500, max_storage_mb: 51200, max_sms: 10000, max_market_items: 2000 }),
        JSON.stringify({ market_enabled: true, panorama_enabled: true, card_enabled: true, distribution_enabled: true }), 1, 30],
    ];
    const ins = db.prepare('INSERT INTO billing_plans (code, name, description, price, cycle, quotas, features, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of seedPlans) ins.run(...p);
  }

  // —— solutions 表（解决方案/应用）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // —— solutions 表加 app_config 字段（应用注册中心）——
  if (!colExists(db, 'solutions', 'app_config')) {
    db.exec('ALTER TABLE solutions ADD COLUMN app_config TEXT');
  }
  // —— 方案中心：分类 / 基础设置扩展列（P0）——
  if (!colExists(db, 'solutions', 'category_id')) {
    db.exec('ALTER TABLE solutions ADD COLUMN category_id INTEGER');
  }
  if (!colExists(db, 'solutions', 'is_hot')) {
    db.exec('ALTER TABLE solutions ADD COLUMN is_hot INTEGER NOT NULL DEFAULT 0');
  }
  if (!colExists(db, 'solutions', 'status')) {
    db.exec("ALTER TABLE solutions ADD COLUMN status TEXT NOT NULL DEFAULT 'on'");
  }
  if (!colExists(db, 'solutions', 'default_platform')) {
    db.exec("ALTER TABLE solutions ADD COLUMN default_platform TEXT NOT NULL DEFAULT 'h5'");
  }
  if (!colExists(db, 'solutions', 'preview_images')) {
    db.exec("ALTER TABLE solutions ADD COLUMN preview_images TEXT NOT NULL DEFAULT '[]'");
  }
  if (!colExists(db, 'solutions', 'virtual_use_count')) {
    db.exec('ALTER TABLE solutions ADD COLUMN virtual_use_count INTEGER NOT NULL DEFAULT 0');
  }
  if (!colExists(db, 'solutions', 'all_permissions')) {
    db.exec('ALTER TABLE solutions ADD COLUMN all_permissions INTEGER NOT NULL DEFAULT 0');
  }
  // —— 方案分类表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS solution_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // —— 方案价格表（0 表示永久）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS solution_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solution_id INTEGER NOT NULL,
      duration_months INTEGER NOT NULL DEFAULT 12,
      agent_price REAL NOT NULL DEFAULT 0,
      user_price REAL NOT NULL DEFAULT 0,
      renew_price REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // —— 方案权限点表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS solution_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solution_id INTEGER NOT NULL,
      app_id INTEGER NOT NULL DEFAULT 0,
      module TEXT NOT NULL DEFAULT '',
      module_label TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  // —— 方案化：应用清单 + 应用功能菜单 + 方案-应用授权（两级权限模型）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS app_menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL,
      module TEXT NOT NULL DEFAULT '',
      module_label TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(app_id, key)
    );
    CREATE TABLE IF NOT EXISTS customer_app_sorts (
      customer_id INTEGER NOT NULL,
      app_code TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (customer_id, app_code)
    );
    CREATE TABLE IF NOT EXISTS app_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL DEFAULT 'apps',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS solution_apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solution_id INTEGER NOT NULL,
      app_id INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      UNIQUE(solution_id, app_id)
    );
    CREATE INDEX IF NOT EXISTS idx_solution_apps ON solution_apps(solution_id);
  `);
  // 项目级权限覆盖（总后台客户编辑：应用勾选 + 菜单授权，覆盖方案默认权限）
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      app_code TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      UNIQUE(project_id, app_code)
    );
    CREATE INDEX IF NOT EXISTS idx_project_apps ON project_apps(project_id);
    CREATE TABLE IF NOT EXISTS project_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      app_code TEXT NOT NULL,
      menu_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      UNIQUE(project_id, app_code, menu_key)
    );
    CREATE INDEX IF NOT EXISTS idx_project_permissions ON project_permissions(project_id, app_code);
  `);
  if (colExists(db, 'solution_permissions', 'id') && !colExists(db, 'solution_permissions', 'app_id')) {
    db.exec('ALTER TABLE solution_permissions ADD COLUMN app_id INTEGER NOT NULL DEFAULT 0');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_solution_perm ON solution_permissions(solution_id, app_id)');
  if (!colExists(db, 'solutions', 'is_demo')) {
    db.exec('ALTER TABLE solutions ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0');
  }

  // —— 迁移：现有解决方案沉淀为「应用」（须在预置解决方案之后执行，见文末） ——
  // —— 预置方案分类 ——
  const catCount = db.prepare('SELECT COUNT(*) AS n FROM solution_categories').get().n;
  if (catCount === 0) {
    const insertCat = db.prepare('INSERT INTO solution_categories (name, icon, sort_order) VALUES (?, ?, ?)');
    insertCat.run('名片营销', 'card', 1);
    insertCat.run('空间展示', 'panorama', 2);
  }
  // 预置360全景解决方案
  const exists = db.prepare('SELECT id FROM solutions WHERE code = ?').get('panorama');
  if (!exists) {
    const panoramaConfig = JSON.stringify({
      routes: { customer: '/apps/panorama/plans', admin: '/customers' },
      menu: [
        { key: 'plans', label: '方案管理', path: '/apps/panorama/plans', icon: 'Folder' },
        { key: 'scenes', label: '场景管理', path: '/apps/panorama/scenes', icon: 'Picture' },
      ],
      permissions: ['plan:view', 'plan:edit', 'scene:view', 'scene:edit', 'scene:delete'],
      channels: ['h5', 'pc', 'mini', 'mp'],
      configSchema: [
        { key: 'defaultTransition', label: '默认切换过渡', type: 'select', options: ['none', 'fade', 'slide'], default: 'fade' },
        { key: 'enableVR', label: '启用VR模式', type: 'boolean', default: true },
      ],
    });
    db.prepare("INSERT INTO solutions (name, code, description, icon, enabled, sort_order, app_config) VALUES ('360全景', 'panorama', '沉浸式360度全景展示解决方案', '🌐', 1, 1, ?)").run(panoramaConfig);
  }

  // —— 默认项目补开 card 解决方案（存量老库兼容，保证演示/测试链路可用）——
  const firstProj = db.prepare('SELECT id, solutions FROM projects ORDER BY id ASC LIMIT 1').get();
  if (firstProj) {
    try {
      const arr = JSON.parse(firstProj.solutions || '[]');
      if (Array.isArray(arr) && !arr.includes('card')) {
        arr.push('card');
        db.prepare("UPDATE projects SET solutions = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(arr), firstProj.id);
      }
    } catch {}
  }

  // —— projects（客户）表加 solutions 字段 ——
  if (!colExists(db, 'projects', 'solutions')) {
    db.exec("ALTER TABLE projects ADD COLUMN solutions TEXT NOT NULL DEFAULT '[\"panorama\"]'");
  }

  // —— 角色简化：manager/editor/viewer 合并为 operator ——
  db.exec("UPDATE users SET role = 'operator' WHERE role IN ('manager', 'editor', 'viewer')");

  // —— projects（客户）表加 config 字段（独立配置）——
  if (!colExists(db, 'projects', 'config')) {
    db.exec("ALTER TABLE projects ADD COLUMN config TEXT NOT NULL DEFAULT '{}'");
  }

  // —— scenes 表加 hotspots 字段（热点标注）——
  if (!colExists(db, 'scenes', 'hotspots')) {
    db.exec("ALTER TABLE scenes ADD COLUMN hotspots TEXT NOT NULL DEFAULT '[]'");
  }
  // —— scenes 表加 meta 字段（内容增强：背景音乐/解说/介绍文字等）——
  if (!colExists(db, 'scenes', 'meta')) {
    db.exec("ALTER TABLE scenes ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'");
  }

  // —— 开放平台：第三方应用 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL UNIQUE,
      app_secret TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      owner_user_id INTEGER,
      redirect_uris TEXT NOT NULL DEFAULT '[]',
      ip_whitelist TEXT NOT NULL DEFAULT '[]',
      scopes TEXT NOT NULL DEFAULT '["read"]',
      status TEXT NOT NULL DEFAULT 'active',
      rate_limit INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // —— 开放平台：授权码 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      app_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      scopes TEXT NOT NULL DEFAULT '["read"]',
      redirect_uri TEXT,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // —— 开放平台：访问令牌 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      access_token TEXT NOT NULL UNIQUE,
      refresh_token TEXT NOT NULL UNIQUE,
      app_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      scopes TEXT NOT NULL DEFAULT '["read"]',
      expires_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // —— 开放平台：API调用日志 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT,
      user_id INTEGER,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      ip TEXT,
      response_time INTEGER,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_api_logs_app_id ON api_logs(app_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at)');

  // —— 全端渠道：第三方平台凭证 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_component (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      component_appid TEXT NOT NULL DEFAULT '',
      component_appsecret TEXT NOT NULL DEFAULT '',
      message_token TEXT NOT NULL DEFAULT '',
      encoding_aes_key TEXT NOT NULL DEFAULT '',
      component_access_token TEXT NOT NULL DEFAULT '',
      component_verify_ticket TEXT NOT NULL DEFAULT '',
      token_expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec("INSERT OR IGNORE INTO channel_component (id) VALUES (1)");
  // 幂等添加 verify_ticket 字段
  if (!colExists(db, 'channel_component', 'component_verify_ticket')) {
    db.exec("ALTER TABLE channel_component ADD COLUMN component_verify_ticket TEXT NOT NULL DEFAULT ''");
  }

  // —— 全端渠道：租户渠道配置 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      channel_type TEXT NOT NULL,
      appid TEXT NOT NULL DEFAULT '',
      app_secret TEXT NOT NULL DEFAULT '',
      auth_status TEXT NOT NULL DEFAULT 'none',
      authorizer_access_token TEXT NOT NULL DEFAULT '',
      authorizer_refresh_token TEXT NOT NULL DEFAULT '',
      token_expires_at TEXT,
      version TEXT NOT NULL DEFAULT '',
      template_id TEXT NOT NULL DEFAULT '',
      draft_id INTEGER,
      audit_status TEXT NOT NULL DEFAULT 'none',
      brand_name TEXT NOT NULL DEFAULT '',
      brand_logo TEXT NOT NULL DEFAULT '',
      primary_color TEXT NOT NULL DEFAULT '#165DFF',
      custom_domain TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_channel_apps_customer ON channel_apps(customer_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_channel_apps_appid ON channel_apps(appid)');

  // —— 全端渠道：租户渠道拖拽排序（customer_id + channel_type 唯一） ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_sorts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      channel_type TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(customer_id, channel_type)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_channel_sorts_customer ON channel_sorts(customer_id)');

  // —— 全端渠道：发布日志 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_deploy_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_app_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      template_id TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      operator_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_deploy_logs_channel ON channel_deploy_logs(channel_app_id)');

  // ============================================================
  // 智能名片解决方案（card）
  // ============================================================

  // —— 平台个人用户表（C端用户，微信授权注册）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT UNIQUE,
      unionid TEXT,
      nickname TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      phone TEXT,
      member_level TEXT NOT NULL DEFAULT 'free',
      member_expire_at TEXT,
      enterprise_id INTEGER,
      enterprise_role TEXT DEFAULT 'none',
      parent_id INTEGER,
      grandparent_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_puser_openid ON platform_user(openid);
    CREATE INDEX IF NOT EXISTS idx_puser_enterprise ON platform_user(enterprise_id);
    CREATE INDEX IF NOT EXISTS idx_puser_parent ON platform_user(parent_id);
  `);

  // —— 名片表（个人/企业名片）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      enterprise_id INTEGER,
      card_type TEXT NOT NULL DEFAULT 'personal',
      name TEXT NOT NULL,
      position TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      wechat TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      business_field TEXT NOT NULL DEFAULT '',
      need_tags TEXT NOT NULL DEFAULT '', -- 供需标签 JSON: ["找渠道","求合作",...]
      avatar TEXT NOT NULL DEFAULT '',
      template_id INTEGER,
      video_channel TEXT NOT NULL DEFAULT '',
      is_public INTEGER NOT NULL DEFAULT 1,
      view_count INTEGER NOT NULL DEFAULT 0,
      exchange_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_card_user ON card_profile(user_id);
    CREATE INDEX IF NOT EXISTS idx_card_enterprise ON card_profile(enterprise_id);
    CREATE INDEX IF NOT EXISTS idx_card_public ON card_profile(is_public, status);
  `);

  // —— 访客行为记录表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_visitor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      visitor_openid TEXT,
      visitor_user_id INTEGER,
      visit_date TEXT NOT NULL,
      visit_count INTEGER NOT NULL DEFAULT 1,
      duration INTEGER NOT NULL DEFAULT 0,
      pages TEXT NOT NULL DEFAULT '[]',
      last_visit_at TEXT NOT NULL DEFAULT (datetime('now')),
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_visitor_card ON card_visitor(card_id);
    CREATE INDEX IF NOT EXISTS idx_visitor_date ON card_visitor(card_id, visit_date);
    CREATE INDEX IF NOT EXISTS idx_visitor_openid ON card_visitor(visitor_openid);
  `);

  // 老库迁移：card_visitor 补 read_at 列（已读标记）
  try { db.exec('ALTER TABLE card_visitor ADD COLUMN read_at TEXT'); } catch (e) { /* 已存在则忽略 */ }

  // —— 访客行为详情（时间线）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_visitor_action (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      visitor_openid TEXT,
      action_type TEXT NOT NULL,
      action_detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_visitor_action_card ON card_visitor_action(card_id);
    CREATE INDEX IF NOT EXISTS idx_visitor_action_openid ON card_visitor_action(visitor_openid);
  `);

  // —— 名片作品集表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_works (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_card_works_card ON card_works(card_id);
  `);

  // —— 名片交换记录表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_exchange (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      from_card_id INTEGER,
      to_card_id INTEGER,
      phone_shared INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_exchange_from ON card_exchange(from_user_id);
    CREATE INDEX IF NOT EXISTS idx_exchange_to ON card_exchange(to_user_id);
  `);

  // —— 用户动态表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_dynamic (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_id INTEGER,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      images TEXT NOT NULL DEFAULT '[]',
      like_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'public',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dynamic_user ON card_dynamic(user_id);
    CREATE INDEX IF NOT EXISTS idx_dynamic_visibility ON card_dynamic(visibility, status);

    -- 动态点赞（防重复）
    CREATE TABLE IF NOT EXISTS card_dynamic_like (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dynamic_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dynamic_like_uniq ON card_dynamic_like(dynamic_id, user_id);

    -- 动态评论
    CREATE TABLE IF NOT EXISTS card_dynamic_comment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dynamic_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dynamic_comment_dyn ON card_dynamic_comment(dynamic_id, status);
  `);

  // —— 行为埋点事件表（第三批：漏斗/健康分/增长分析）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 0,
      solution TEXT NOT NULL DEFAULT 'card',
      event_type TEXT NOT NULL,
      page TEXT NOT NULL DEFAULT '',
      card_id INTEGER NOT NULL DEFAULT 0,
      scene_id INTEGER NOT NULL DEFAULT 0,
      visitor_key TEXT NOT NULL DEFAULT '',
      user_id INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      extra TEXT NOT NULL DEFAULT '{}',
      event_date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_tenant_date ON analytics_events(tenant_id, event_date);
    CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type, event_date);
  `);

  // —— 全景热点留资线索（P0：热点挂表单收集）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS panorama_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 0,
      plan_id INTEGER NOT NULL DEFAULT 0,
      scene_id INTEGER NOT NULL DEFAULT 0,
      hotspot_title TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      extra TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pano_leads_tenant ON panorama_leads(tenant_id, id);
  `);

  // —— 设计中心万能表单线索（P1：DIY 页面表单收集）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS design_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 0,
      page_type TEXT NOT NULL DEFAULT 'home',
      form_title TEXT NOT NULL DEFAULT '',
      fields TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_design_leads_tenant ON design_leads(tenant_id, id);
  `);

  // —— 名片模板库（第四批：平台公共 + 租户私有）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 0,        -- 0=平台公共模板
      name TEXT NOT NULL,
      cover TEXT NOT NULL DEFAULT '',
      theme_config TEXT NOT NULL DEFAULT '{}',     -- JSON: {primary, secondary, background, radius...}
      description TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_card_templates_tenant ON card_templates(tenant_id, enabled);
  `);

  // —— 名片视频表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      duration TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_card_videos_card ON card_videos(card_id);
  `);

  // —— 客户资源表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_customer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      enterprise_id INTEGER,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      wechat TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'exchange',
      source_card_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      last_follow_at TEXT,
      next_follow_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ccustomer_owner ON card_customer(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_ccustomer_enterprise ON card_customer(enterprise_id);
  `);

  // —— 客户跟进记录表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_customer_follow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      next_follow_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_follow_customer ON card_customer_follow(customer_id);
  `);

  // —— 会员套餐配置表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_package (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      duration_days INTEGER NOT NULL DEFAULT 30,
      description TEXT NOT NULL DEFAULT '',
      features TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // 预置会员套餐
  const packages = [
    { level: 'free', name: '免费版', price: 0, duration: 0, desc: '基础功能', features: '["basic_card","basic_visitor","basic_customer","free_template"]' },
    { level: 'silver', name: '白银会员', price: 29.9, duration: 30, desc: '高级模板+详细访客分析', features: '["basic_card","advanced_visitor","basic_customer","all_template","no_ads"]' },
    { level: 'gold', name: '黄金会员', price: 99, duration: 365, desc: '全部功能+人脉集市', features: '["basic_card","advanced_visitor","advanced_customer","all_template","market_full","no_ads","badge"]' },
    { level: 'diamond', name: '钻石会员', price: 299, duration: 365, desc: '专属服务+高级数据', features: '["basic_card","advanced_visitor","advanced_customer","all_template","market_full","no_ads","badge","priority_support","advanced_stats"]' },
  ];
  for (const p of packages) {
    const exists = db.prepare('SELECT id FROM member_package WHERE level = ?').get(p.level);
    if (!exists) {
      db.prepare('INSERT INTO member_package (level, name, price, duration_days, description, features, sort_order, enabled) VALUES (?,?,?,?,?,?,?,1)').run(p.level, p.name, p.price, p.duration, p.desc, p.features, ['free','silver','gold','diamond'].indexOf(p.level));
    }
  }

  // —— 名片模板表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_template (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cover TEXT NOT NULL DEFAULT '',
      member_level TEXT NOT NULL DEFAULT 'free',
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // —— 分销佣金记录表 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS distribution_commission (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      from_user_id INTEGER NOT NULL,
      level INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      settled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_commission_user ON distribution_commission(user_id);
    CREATE INDEX IF NOT EXISTS idx_commission_order ON distribution_commission(order_id);

    -- 支付订单表（双层支付：平台级+租户级）
    CREATE TABLE IF NOT EXISTS payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      payer_type TEXT NOT NULL DEFAULT 'tenant',  -- platform=租户向平台付费, tenant=租户客户向租户付费
      customer_id INTEGER NOT NULL DEFAULT 0,      -- 租户ID
      user_id INTEGER NOT NULL DEFAULT 0,          -- 付费用户ID（租户级支付时）
      solution TEXT NOT NULL DEFAULT '',           -- 解决方案标识
      product_type TEXT NOT NULL DEFAULT '',       -- subscription/member/value_added
      product_id TEXT NOT NULL DEFAULT '',         -- 产品ID
      product_name TEXT NOT NULL DEFAULT '',       -- 产品名称
      amount INTEGER NOT NULL DEFAULT 0,           -- 金额（分）
      platform_fee INTEGER NOT NULL DEFAULT 0,     -- 平台手续费（分）
      pay_channel TEXT NOT NULL DEFAULT 'wechat',  -- wechat/alipay
      pay_mode TEXT NOT NULL DEFAULT 'platform',   -- platform=借用平台, independent=自主接入
      status TEXT NOT NULL DEFAULT 'pending',      -- pending/paid/refunded/closed
      transaction_id TEXT NOT NULL DEFAULT '',     -- 第三方支付流水号
      paid_at TEXT,                                -- 支付时间
      remark TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payment_orders_customer ON payment_orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
    CREATE INDEX IF NOT EXISTS idx_payment_orders_payer ON payment_orders(payer_type);

    -- 结算记录表（借用平台模式下，平台代收后结算给租户）
    CREATE TABLE IF NOT EXISTS settlement_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      order_ids TEXT NOT NULL DEFAULT '[]',        -- 关联订单ID列表
      total_amount INTEGER NOT NULL DEFAULT 0,     -- 订单总金额（分）
      platform_fee INTEGER NOT NULL DEFAULT 0,     -- 平台手续费（分）
      settle_amount INTEGER NOT NULL DEFAULT 0,    -- 结算金额（分）
      status TEXT NOT NULL DEFAULT 'pending',      -- pending/settled/rejected
      settled_at TEXT,
      remark TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_settlement_customer ON settlement_records(customer_id);
    CREATE INDEX IF NOT EXISTS idx_settlement_status ON settlement_records(status);
  `);

  // —— 租户级人脉集市相关表 ——
  db.exec(`
    -- 入驻个人
    CREATE TABLE IF NOT EXISTS tenant_individuals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT,
      phone TEXT,
      status TEXT DEFAULT 'active', -- active/disabled
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_individual_customer ON tenant_individuals(customer_id);
    CREATE INDEX IF NOT EXISTS idx_individual_user ON tenant_individuals(user_id);

    -- 入驻企业单位
    CREATE TABLE IF NOT EXISTS tenant_enterprises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      logo TEXT,
      industry TEXT,
      scale TEXT,
      description TEXT,
      admin_user_id INTEGER,
      config TEXT DEFAULT '{}', -- 企业配置: auto_recycle等
      status TEXT DEFAULT 'active', -- active/disabled
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_enterprise_customer ON tenant_enterprises(customer_id);

    -- 企业员工
    CREATE TABLE IF NOT EXISTS tenant_enterprise_employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enterprise_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT,
      position TEXT,
      department TEXT,
      role TEXT DEFAULT 'member', -- admin/member 企业管理员/普通员工
      status TEXT DEFAULT 'active', -- active/left
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_employee_enterprise ON tenant_enterprise_employees(enterprise_id);
    CREATE INDEX IF NOT EXISTS idx_employee_user ON tenant_enterprise_employees(user_id);

    -- 租户全局公海池
    CREATE TABLE IF NOT EXISTS tenant_public_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      source_type TEXT NOT NULL, -- individual/enterprise/employee
      source_id INTEGER,
      name TEXT,
      phone TEXT,
      company TEXT,
      position TEXT,
      remark TEXT,
      status TEXT DEFAULT 'available', -- available/claimed
      claimed_by INTEGER,
      claimed_at TEXT,
      recycled_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pool_customer ON tenant_public_pool(customer_id);
    CREATE INDEX IF NOT EXISTS idx_pool_status ON tenant_public_pool(status);

    -- 企业自有公海池
    CREATE TABLE IF NOT EXISTS enterprise_public_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enterprise_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      source_type TEXT NOT NULL, -- employee/enterprise
      source_id INTEGER,
      name TEXT,
      phone TEXT,
      company TEXT,
      position TEXT,
      remark TEXT,
      status TEXT DEFAULT 'available', -- available/claimed/recycled
      claimed_by INTEGER,
      claimed_at TEXT,
      recycled_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ent_pool_enterprise ON enterprise_public_pool(enterprise_id);
    CREATE INDEX IF NOT EXISTS idx_ent_pool_status ON enterprise_public_pool(status);

    -- 集市配置
    CREATE TABLE IF NOT EXISTS card_market_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL UNIQUE,
      enabled INTEGER DEFAULT 1,
      audit_mode TEXT DEFAULT 'auto', -- auto/manual
      title TEXT DEFAULT '人脉集市',
      cover TEXT,
      show_company INTEGER DEFAULT 1,
      show_industry INTEGER DEFAULT 1,
      show_location INTEGER DEFAULT 1,
      allow_exchange INTEGER DEFAULT 1,
      contact_visible TEXT DEFAULT 'after_exchange', -- after_exchange/direct
      style TEXT NOT NULL DEFAULT 'A', -- A/B/C 集市风格（A角标/B单横滚/C Tab）
      notice TEXT NOT NULL DEFAULT '', -- 租户公告
      pool_float_mode TEXT NOT NULL DEFAULT 'soft', -- 公海上浮方式：soft软上浮(可随时收回)/recover限时收回(7天)/hard直接移交(不可逆)
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 集市上架记录
    CREATE TABLE IF NOT EXISTS card_market_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      subject_type TEXT NOT NULL, -- individual/enterprise/employee
      subject_id INTEGER NOT NULL,
      user_id INTEGER,
      enterprise_id INTEGER,
      audit_status TEXT DEFAULT 'approved', -- pending/approved/rejected
      is_top INTEGER DEFAULT 0,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_market_customer ON card_market_items(customer_id);
    CREATE INDEX IF NOT EXISTS idx_market_status ON card_market_items(audit_status);

    -- 人脉关系（名片交换）
    CREATE TABLE IF NOT EXISTS card_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending', -- pending/accepted/rejected
      message TEXT,
      exchanged_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      snapshot TEXT,
      group_name TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_connection_customer ON card_connections(customer_id);
    CREATE INDEX IF NOT EXISTS idx_connection_from ON card_connections(from_user_id);
    CREATE INDEX IF NOT EXISTS idx_connection_to ON card_connections(to_user_id);

    CREATE TABLE IF NOT EXISTS card_message (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,            -- 接收者
      type TEXT NOT NULL DEFAULT 'system', -- exchange/visitor/system
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',       -- 跳转路径，如 /pages/card/exchangeRequests
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_message_user ON card_message(customer_id, user_id, is_read);

    -- 表单模板
    CREATE TABLE IF NOT EXISTS card_form_template (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      fields TEXT NOT NULL DEFAULT '[]', -- JSON: [{name,label,type,required,options}]
      status TEXT DEFAULT 'active', -- active/disabled
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_form_customer ON card_form_template(customer_id);

    -- 表单提交记录
    CREATE TABLE IF NOT EXISTS card_form_submission (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      user_id INTEGER,
      data TEXT NOT NULL DEFAULT '{}', -- JSON: {field_name: value}
      submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_submission_form ON card_form_submission(form_id);
    CREATE INDEX IF NOT EXISTS idx_submission_customer ON card_form_submission(customer_id);
  `);

  // —— 预置智能名片解决方案 ——
  const cardExists = db.prepare('SELECT id FROM solutions WHERE code = ?').get('card');
  if (!cardExists) {
    const cardConfig = JSON.stringify({
      routes: { customer: '/apps/card', mini: '/pages/card/index' },
      menu: [
        { key: 'cards', label: '名片管理', path: '/apps/card/profiles', icon: 'User' },
        { key: 'visitors', label: '访客分析', path: '/apps/card/visitors', icon: 'DataAnalysis' },
        { key: 'customers', label: '客户管理', path: '/apps/card/customers', icon: 'Connection' },
      ],
      permissions: ['card:view', 'card:edit', 'visitor:view', 'customer:view', 'customer:edit'],
      channels: ['mini', 'h5', 'mp'],
      configSchema: [],
    });
    db.prepare("INSERT INTO solutions (name, code, description, icon, enabled, sort_order, app_config) VALUES ('智能名片', 'card', '平台型智能名片系统，支持个人自主创建+企业租户管理', '💼', 1, 2, ?)").run(cardConfig);
  }

  // —— 企业员工表加 role 字段（企业管理员/普通员工）——
  if (!colExists(db, 'tenant_enterprise_employees', 'role')) {
    db.exec("ALTER TABLE tenant_enterprise_employees ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
  }

  // —— 企业表加 config 字段 ——
  if (!colExists(db, 'tenant_enterprises', 'config')) {
    db.exec("ALTER TABLE tenant_enterprises ADD COLUMN config TEXT NOT NULL DEFAULT '{}'");
  }

  // —— projects表加 quota 字段（套餐额度）——
  if (!colExists(db, 'projects', 'quota')) {
    db.exec("ALTER TABLE projects ADD COLUMN quota TEXT NOT NULL DEFAULT '{}'");
  }

  // —— card_profile表加 city 字段 ——
  if (!colExists(db, 'card_profile', 'city')) {
    db.exec("ALTER TABLE card_profile ADD COLUMN city TEXT NOT NULL DEFAULT ''");
  }
  // —— card_profile表加 slogan/tags 字段 ——
  if (!colExists(db, 'card_profile', 'slogan')) {
    db.exec("ALTER TABLE card_profile ADD COLUMN slogan TEXT NOT NULL DEFAULT ''");
  }
  if (!colExists(db, 'card_profile', 'tags')) {
    db.exec("ALTER TABLE card_profile ADD COLUMN tags TEXT NOT NULL DEFAULT ''");
  }
  // —— card_dynamic表加 title/like_count/comment_count 字段 ——
  if (!colExists(db, 'card_dynamic', 'title')) {
    db.exec("ALTER TABLE card_dynamic ADD COLUMN title TEXT NOT NULL DEFAULT ''");
  }
  if (!colExists(db, 'card_dynamic', 'like_count')) {
    db.exec("ALTER TABLE card_dynamic ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!colExists(db, 'card_dynamic', 'comment_count')) {
    db.exec("ALTER TABLE card_dynamic ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0");
  }

  // —— tenant_individuals表加 position/company 字段（入驻申请）——
  if (!colExists(db, 'tenant_individuals', 'position')) {
    db.exec("ALTER TABLE tenant_individuals ADD COLUMN position TEXT NOT NULL DEFAULT ''");
  }
  if (!colExists(db, 'tenant_individuals', 'company')) {
    db.exec("ALTER TABLE tenant_individuals ADD COLUMN company TEXT NOT NULL DEFAULT ''");
  }

  // —— projects表加 invite_code 字段（入驻口令）——
  if (!colExists(db, 'projects', 'invite_code')) {
    db.exec("ALTER TABLE projects ADD COLUMN invite_code TEXT NOT NULL DEFAULT ''");
    // 存量项目补齐随机口令
    const rows = db.prepare("SELECT id FROM projects WHERE invite_code = ''").all();
    for (const r of rows) {
      const code = 'P' + Math.random().toString(36).slice(2, 8).toUpperCase();
      db.prepare('UPDATE projects SET invite_code = ? WHERE id = ?').run(code, r.id);
    }
  }

  // —— 租户隔离：platform_user 绑定所属客户项目（租户ID）——
  if (!colExists(db, 'platform_user', 'customer_id')) {
    db.exec('ALTER TABLE platform_user ADD COLUMN customer_id INTEGER');
  }
  if (!colExists(db, 'platform_user', 'identity_type')) {
    // individual/employee/both —— 双身份标记
    db.exec("ALTER TABLE platform_user ADD COLUMN identity_type TEXT NOT NULL DEFAULT ''");
  }

  // —— 名片交换快照：accepted 时固化对方名片，人脉库离线保留 ——
  if (!colExists(db, 'card_connections', 'snapshot')) {
    db.exec('ALTER TABLE card_connections ADD COLUMN snapshot TEXT');
  }

  // —— 表单模板挂载名片（可空=全租户展示）——
  if (!colExists(db, 'card_form_template', 'card_id')) {
    db.exec('ALTER TABLE card_form_template ADD COLUMN card_id INTEGER');
  }

  // —— 名片归属租户 ——
  if (!colExists(db, 'card_profile', 'customer_id')) {
    db.exec('ALTER TABLE card_profile ADD COLUMN customer_id INTEGER');
  }

  // —— 客户表租户化与归属模型（owner_type/source_user_id 等）——
  if (!colExists(db, 'card_customer', 'customer_id')) {
    db.exec('ALTER TABLE card_customer ADD COLUMN customer_id INTEGER');
  }
  if (!colExists(db, 'card_customer', 'owner_type')) {
    db.exec("ALTER TABLE card_customer ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'individual'");
  }
  if (!colExists(db, 'card_customer', 'position')) {
    db.exec("ALTER TABLE card_customer ADD COLUMN position TEXT NOT NULL DEFAULT ''");
  }
  if (!colExists(db, 'card_customer', 'source_type')) {
    db.exec('ALTER TABLE card_customer ADD COLUMN source_type TEXT');
  }
  if (!colExists(db, 'card_customer', 'source_id')) {
    db.exec('ALTER TABLE card_customer ADD COLUMN source_id INTEGER');
  }
  if (!colExists(db, 'card_customer', 'source_user_id')) {
    db.exec('ALTER TABLE card_customer ADD COLUMN source_user_id INTEGER');
  }

  // —— 公海超时回收：记录领取后的最近跟进时间 ——
  if (!colExists(db, 'tenant_public_pool', 'last_follow_at')) {
    db.exec('ALTER TABLE tenant_public_pool ADD COLUMN last_follow_at TEXT');
  }
  if (!colExists(db, 'enterprise_public_pool', 'last_follow_at')) {
    db.exec('ALTER TABLE enterprise_public_pool ADD COLUMN last_follow_at TEXT');
  }
  if (!colExists(db, 'enterprise_public_pool', 'floated_at')) {
    db.exec('ALTER TABLE enterprise_public_pool ADD COLUMN floated_at TEXT');
  }

  // —— 应用中心：应用分类 + 应用归分类 + channel 应用 ——
  if (!colExists(db, 'apps', 'category')) {
    db.exec("ALTER TABLE apps ADD COLUMN category TEXT NOT NULL DEFAULT 'industry'");
  }
  const presetCats = [
    ['默认分类', 'apps'], ['基础功能', 'settings'], ['全端渠道', 'channel'], ['营销引流', 'analytics'],
    ['客群维护', 'customer'], ['行业应用', 'apps'], ['高级功能', 'badge'], ['管理工具', 'logs'],
  ];
  const catIns = db.prepare('INSERT OR IGNORE INTO app_categories (name, icon, sort_order) VALUES (?, ?, ?)');
  presetCats.forEach(([n, ic], idx) => catIns.run(n, ic, idx + 1));
  // 应用归分类 + 图标规范化（SVG 图标名，符合 SIcon 体系）
  db.exec("UPDATE apps SET category = '行业应用', icon = 'panorama', updated_at = datetime('now') WHERE code = 'panorama'");
  db.exec("UPDATE apps SET category = '行业应用', icon = 'card', updated_at = datetime('now') WHERE code = 'card'");
  db.exec("INSERT OR IGNORE INTO apps (code, name, description, icon, category, sort_order, enabled) VALUES ('channel', '全端渠道', '管理H5、小程序、公众号、PC网站各端渠道配置与发布', 'channel', '全端渠道', 3, 1)");
  // 兼容历史错误归属（英文 code 写回分类中文名）
  db.exec("UPDATE apps SET category = '行业应用', updated_at = datetime('now') WHERE category IN ('industry','panorama','card')");
  db.exec("UPDATE apps SET category = '全端渠道', updated_at = datetime('now') WHERE category IN ('channel') AND code = 'channel'");
  // channel 应用功能菜单（方案权限模型要求每个应用登记菜单）
  const channelMenu = [
    ['总览', 'channel:overview', '数据洞察'], ['渠道管理', 'channel:view', '渠道查看'], ['渠道管理', 'channel:edit', '渠道配置'],
    ['发布管理', 'channel:publish', '发布管理'], ['系统设置', 'channel:setting', '设置查看'],
  ];
  const chRow = db.prepare("SELECT id FROM apps WHERE code = 'channel'").get();
  if (chRow) {
    const chMenuIns = db.prepare('INSERT OR IGNORE INTO app_menus (app_id, module, module_label, key, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    channelMenu.forEach(([mod, key, label], idx) => chMenuIns.run(chRow.id, mod, mod, key, label, idx + 1));
  }
  // 演示方案自动纳入 channel 应用（demo 动态全量，此处补 solution_apps 保证一致性）
  const demoRow = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
  const chApp = db.prepare("SELECT id FROM apps WHERE code = 'channel'").get();
  if (demoRow && chApp && !db.prepare('SELECT id FROM solution_apps WHERE solution_id = ? AND app_id = ?').get(demoRow.id, chApp.id)) {
    db.prepare('INSERT INTO solution_apps (solution_id, app_id, enabled) VALUES (?, ?, 1)').run(demoRow.id, chApp.id);
  }

  // —— 入驻口令使用审计 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_invite_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      invite_code TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL DEFAULT 'join',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_invite_log_customer ON tenant_invite_log(customer_id);
    CREATE INDEX IF NOT EXISTS idx_invite_log_user ON tenant_invite_log(user_id);
  `);

  // —— 人脉集市三方案：风格/公告 + 名片供需标签（存量迁移，幂等） ——
  if (tableExists(db, 'card_market_items') && !colExists(db, 'card_market_items', 'view_count')) {
    db.exec('ALTER TABLE card_market_items ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0');
  }
  if (colExists(db, 'card_market_settings', 'id') && !colExists(db, 'card_market_settings', 'style')) {
    db.exec("ALTER TABLE card_market_settings ADD COLUMN style TEXT NOT NULL DEFAULT 'A'");
  }
  if (colExists(db, 'card_market_settings', 'id') && !colExists(db, 'card_market_settings', 'notice')) {
    db.exec("ALTER TABLE card_market_settings ADD COLUMN notice TEXT NOT NULL DEFAULT ''");
  }
  if (colExists(db, 'card_market_settings', 'id') && !colExists(db, 'card_market_settings', 'pool_float_mode')) {
    db.exec("ALTER TABLE card_market_settings ADD COLUMN pool_float_mode TEXT NOT NULL DEFAULT 'soft'");
  }
  if (colExists(db, 'card_profile', 'id') && !colExists(db, 'card_profile', 'need_tags')) {
    db.exec("ALTER TABLE card_profile ADD COLUMN need_tags TEXT NOT NULL DEFAULT ''");
  }

  // —— 方案资产 P1：集市风格库 + 租户资产购买记录 + 模板价格 ——
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_styles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      preview TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tenant_asset_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      asset_type TEXT NOT NULL,
      asset_key TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, asset_type, asset_key)
    );
    CREATE INDEX IF NOT EXISTS idx_asset_purchases_tenant ON tenant_asset_purchases(tenant_id, asset_type);
    CREATE TABLE IF NOT EXISTS solution_quotas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solution_id INTEGER NOT NULL,
      app_code TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      value INTEGER NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(solution_id, app_code, key)
    );
  `);
  // 方案配额废弃项清理（2026-09-08：cardCount 名片创建数 / aiCredits AI生成次数 / storageMb 存储空间 已从配额体系移除）
  try {
    db.exec("DELETE FROM solution_quotas WHERE key IN ('cardCount','aiCredits') OR (key = 'storageMb' AND app_code IN ('card','panorama'))");
  } catch {}
  if (colExists(db, 'card_templates', 'id') && !colExists(db, 'card_templates', 'price')) {
    db.exec('ALTER TABLE card_templates ADD COLUMN price REAL NOT NULL DEFAULT 0');
  }
  if (colExists(db, 'card_templates', 'id') && !colExists(db, 'card_templates', 'is_default')) {
    db.exec("ALTER TABLE card_templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0");
  }
  seedMarketStyles(db);

  // —— 分销体系：建表 + 应用注册 + 存量迁移（在 migrateSolutionApps 前执行，保证演示方案覆盖新应用）——
  seedDistribution(db);

  // —— 商品体系（1:1 复刻菜鸟云「东莞同城通」duoproducts：商品/分类/参数/商城设置 + 卡密/虚拟应用注册）——
  seedGoods(db);

  // —— 设计中心：建表 + 应用注册（素材中心/系统风格/底部导航/系统模板/首页跳转/页面装修）——
  seedDesign(db);

  // —— 会员体系（租户级会员，1:1 复刻菜鸟云：等级/开卡/申请/积分/消费/标签/设置）——
  seedMember(db);

  // —— 内容体系（1:1 复刻菜鸟云「东莞同城通」内容：文章/组图/视频/评论/基础设置）——
  seedContent(db);

  // —— dist_config 扩展字段（分销基本设置 + 分销参数，2026-09-09 新增）——
  // 分销商名称/下级名称/申请页顶图/分销推广图/申请页提示/0元订单/显示上级/显示电话/默认等级
  if (tableExists(db, 'dist_config')) {
    const DIST_CFG_COLS = [
      ["dist_name", "TEXT NOT NULL DEFAULT '推广员'"],
      ["sub_name", "TEXT NOT NULL DEFAULT '下级'"],
      ["apply_top_img", "TEXT NOT NULL DEFAULT ''"],
      ["promote_img", "TEXT NOT NULL DEFAULT ''"],
      ["apply_tip", "TEXT NOT NULL DEFAULT ''"],
      ["zero_order", "INTEGER NOT NULL DEFAULT 0"],
      ["show_parent", "INTEGER NOT NULL DEFAULT 0"],
      ["show_phone", "INTEGER NOT NULL DEFAULT 0"],
      ["default_level", "TEXT NOT NULL DEFAULT '默认等级'"],
      // —— 关系设置 / 分享设置 / 申请协议 / 分销须知（2026-09-09 第二批）——
      ["bind_rule", "INTEGER NOT NULL DEFAULT 0"],        // 成为下线：0首次点击 1首次下单 2仅分销商海报
      ["become_rule", "INTEGER NOT NULL DEFAULT 0"],      // 成为分销商：0无条件 1申请即通过 2申请需审核 3总消费金额 4购买商品 5指定商品
      ["become_amount", "REAL NOT NULL DEFAULT 0"],       // 成为分销商-总消费金额门槛（元）
      ["become_products", "TEXT NOT NULL DEFAULT ''"],    // 成为分销商-指定商品（逗号分隔 product_name）
      ["share_title", "TEXT NOT NULL DEFAULT ''"],        // 分享标题
      ["share_img", "TEXT NOT NULL DEFAULT ''"],          // 分享图（5:4 ≤100KB）
      ["apply_agreement", "TEXT NOT NULL DEFAULT ''"],    // 申请协议（富文本 HTML）
      ["dist_notice", "TEXT NOT NULL DEFAULT ''"],        // 分销须知（富文本 HTML）
      ["poster_badge", "INTEGER NOT NULL DEFAULT 1"],     // 分享海报角标（分销商名称+等级）开关
      ["poster_templates", "TEXT NOT NULL DEFAULT '[]'"], // 分享海报模板库 JSON [{id,url}]（promote_img 为当前生效）
    ];
    for (const [col, def] of DIST_CFG_COLS) {
      if (!colExists(db, 'dist_config', col)) db.exec(`ALTER TABLE dist_config ADD COLUMN ${col} ${def}`);
    }
    // 旧「分销商开通门槛」distributor_gate → become_rule 映射（0无门槛→0无条件；1付费用户→4购买商品；2指定名单→2申请需审核）
    db.exec("UPDATE dist_config SET become_rule = CASE distributor_gate WHEN 1 THEN 4 WHEN 2 THEN 2 ELSE become_rule END WHERE become_rule = 0 AND distributor_gate > 0");
  }
  // dist_user_relation.status：成为下线=首次下单模式下的意向绑定（pending → 支付成功结算 bound）
  if (tableExists(db, 'dist_user_relation') && !colExists(db, 'dist_user_relation', 'status')) {
    db.exec("ALTER TABLE dist_user_relation ADD COLUMN status TEXT NOT NULL DEFAULT 'bound'");
  }

  // —— 支付订单补买家身份（分销分账按双身份隔离）——
  if (tableExists(db, 'payment_orders') && !colExists(db, 'payment_orders', 'buyer_identity_type')) {
    db.exec("ALTER TABLE payment_orders ADD COLUMN buyer_identity_type TEXT NOT NULL DEFAULT ''");
  }

  // —— 方案化迁移：现有解决方案沉淀为应用 + 演示试用方案 + 方案-应用关联 ——
  // （必须在全部解决方案预置之后执行，保证全新库/存量库一致）
  migrateSolutionApps(db);

  // —— 方案中心 P0：补齐分类归属 + 默认价格/权限（放在全部方案预置之后，幂等） ——
  seedSolutionDefaults(db);

  // —— 存量租户 solutions 规范化（幂等）：清理已下架旧方案/应用 code 残留 ——
  // 背景：panorama/card 等旧方案已降级为应用（solutions.status='off'），部分租户 projects.solutions
  // 仍残留 ['demo','card'] 之类组合，导致 Billing 方案续费出现「智能名片」幽灵方案卡。
  // 规则：移除应用 code 与已下架方案 code；保留在售方案；清理后为空回填「演示试用方案」(demo)。
  normalizeProjectSolutions(db);
}

/** 存量租户 solutions 规范化（见 createDb 调用处注释） */
function normalizeProjectSolutions(db) {
  const projects = db.prepare("SELECT id, solutions FROM projects WHERE status != 'trashed'").all();
  if (!projects.length) return;
  const appCodes = new Set(db.prepare('SELECT code FROM apps').all().map((r) => r.code));
  const offCodes = new Set(db.prepare("SELECT code FROM solutions WHERE status = 'off'").all().map((r) => r.code));
  const onCodes = db.prepare("SELECT code FROM solutions WHERE status = 'on'").all().map((r) => r.code);
  const demoExists = onCodes.includes('demo');
  let changed = 0;
  for (const p of projects) {
    let codes = [];
    try { codes = JSON.parse(p.solutions || '[]'); } catch { codes = []; }
    if (!Array.isArray(codes)) codes = [];
    const cleaned = [...new Set(
      codes.filter((c) => typeof c === 'string' && c.trim() && !appCodes.has(c) && !offCodes.has(c) && onCodes.includes(c))
    )];
    const normalized = cleaned.length ? cleaned : (demoExists ? ['demo'] : cleaned);
    const json = JSON.stringify(normalized);
    if (json !== p.solutions) {
      db.prepare('UPDATE projects SET solutions = ? WHERE id = ?').run(json, p.id);
      changed++;
    }
  }
  if (changed) console.log(`[migrate] solutions 规范化 ${changed} 个客户项目（清理已下架旧方案/应用 code 残留）`);
}

/**
 * 分销体系：建表 + 应用注册 + 存量迁移（幂等，全新库/存量库一致）
 * - 7 张核心表：sys_tenant_plugin / dist_config / dist_user_relation / dist_order_split / dist_user_log / dist_wallet / dist_withdraw
 * - 应用注册：分销体系分类 + 5 个独立应用（dist/partner/share-all/share-cat/share-area）+ app_menus
 * - 存量迁移：platform_user.parent_id/grandparent_id → dist_user_relation（补租户维度，修复跨租户串号）
 */
/**
 * 商品体系（2026-09-17 新增，1:1 复刻菜鸟云「东莞同城通」duoproducts）
 * 建表：goods_category（二级分类）/ goods（商品全字段）/ goods_sku（多规格）/ goods_param（参数模板）/ goods_setting（商城设置）
 * 应用注册：电子卡密（card-carmi，卡密商品类型授权）、礼品卡券（card-ticket，虚拟商品类型授权）、送礼物（card-gift，实物礼品转赠营销应用）
 * —— 商品类型 Tab 授权驱动（对标菜鸟云）：普通默认；卡密=授权「电子卡密」；虚拟=授权「礼品卡券」；送礼物非类型开关
 */
function seedGoods(db) {
  db.exec(`
    -- 商品分类（支持二级：pid=0 为一级）
    CREATE TABLE IF NOT EXISTS goods_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      pid INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      image TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goods_cat ON goods_category(customer_id, pid);

    -- 商品（字段对齐菜鸟云添加商品 8 页签）
    CREATE TABLE IF NOT EXISTS goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      top_type INTEGER NOT NULL DEFAULT 1,        -- 1普通 3卡密 4虚拟
      type TEXT NOT NULL DEFAULT 'normal',        -- normal普通/carmi卡密/virtual虚拟
      status TEXT NOT NULL DEFAULT 'sell',        -- sell出售中/off未上架/expired已失效
      sort_order INTEGER NOT NULL DEFAULT 0,      -- 排序（数字越大越靠前）
      title TEXT NOT NULL,
      cate_ids TEXT NOT NULL DEFAULT '[]',        -- 所属分类（可多选）
      images TEXT NOT NULL DEFAULT '[]',          -- 轮播图（750×750 ≤100kb）
      thumb TEXT NOT NULL DEFAULT '',             -- 缩略图
      info TEXT NOT NULL DEFAULT '',              -- 商品详情（富文本）
      pickup TEXT NOT NULL DEFAULT 'express',     -- 取货方式：express快递物流
      freight_mode TEXT NOT NULL DEFAULT 'fixed', -- 运费方式：fixed固定运费/template运费模板
      fixed_freight REAL NOT NULL DEFAULT 0,      -- 固定运费（元）
      sale_mode TEXT NOT NULL DEFAULT 'online',   -- 售卖：online线上销售/consult价格面议
      spec_mode TEXT NOT NULL DEFAULT 'single',   -- 规格：single单规格/multi多规格
      stock INTEGER NOT NULL DEFAULT 0,           -- 库存（0 不上架）
      min_buy INTEGER NOT NULL DEFAULT 1,         -- 起购数量
      weight REAL NOT NULL DEFAULT 0,             -- 重量 KG
      price REAL NOT NULL DEFAULT 0,              -- 售价
      market_price REAL NOT NULL DEFAULT 0,       -- 市场价
      cost_price REAL NOT NULL DEFAULT 0,         -- 成本价
      goods_no TEXT NOT NULL DEFAULT '',          -- 货号
      member_price TEXT NOT NULL DEFAULT '{}',    -- 会员价 {mode, list:[{level,type,value}]}
      param TEXT NOT NULL DEFAULT '[]',           -- 商品参数 [{name, content}]
      recommend INTEGER NOT NULL DEFAULT 0,       -- 推荐商品
      unit TEXT NOT NULL DEFAULT '',              -- 商品单位
      views INTEGER NOT NULL DEFAULT 0,           -- 浏览次数
      real_sales INTEGER NOT NULL DEFAULT 0,      -- 真实销量
      fake_sales INTEGER NOT NULL DEFAULT 0,      -- 虚拟销量
      fake_people INTEGER NOT NULL DEFAULT 0,     -- 虚拟人数
      super_form TEXT NOT NULL DEFAULT '',        -- 超级表单：default/单独
      video TEXT NOT NULL DEFAULT '',             -- 商品视频（腾讯网址或mp4）
      video_cover TEXT NOT NULL DEFAULT '',       -- 视频封面（1:1）
      video_play TEXT NOT NULL DEFAULT 'popup',   -- 播放设置：popup弹窗/full全屏
      tags TEXT NOT NULL DEFAULT '',              -- 商品标签（英文逗号隔开）
      brief TEXT NOT NULL DEFAULT '',             -- 商品简介
      brand_tag TEXT NOT NULL DEFAULT '',         -- 品牌标签
      title_tag TEXT NOT NULL DEFAULT '',         -- 标题标签
      service TEXT NOT NULL DEFAULT '[]',         -- 服务保障
      marketing TEXT NOT NULL DEFAULT '{}',       -- 营销设置 {points, buyPoints, buyBalance, coupon, share}
      member TEXT NOT NULL DEFAULT '{}',          -- 会员设置 {priceShow, exclusive}
      distribution TEXT NOT NULL DEFAULT '{}',    -- 分销设置 {rule}
      advanced TEXT NOT NULL DEFAULT '{}',        -- 高级设置 {limitBuy, stockMode, remark, shareTitle, shareImg, buyBtn, cart, promoLinks}
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goods_tenant ON goods(customer_id, status);

    -- 多规格 SKU
    CREATE TABLE IF NOT EXISTS goods_sku (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goods_id INTEGER NOT NULL,
      spec_json TEXT NOT NULL DEFAULT '{}',       -- {规格名: 规格值}
      price REAL NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_goods_sku ON goods_sku(goods_id);

    -- 商品参数模板
    CREATE TABLE IF NOT EXISTS goods_param (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 商城设置（每租户一条 config JSON：价格展示/优惠券/购物车/客服/开票/评价/分享）
    CREATE TABLE IF NOT EXISTS goods_setting (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL UNIQUE,
      config TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 商品订单头（二期-A 订单闭环；业务单与 payment_orders 支付单分离，经 pay_order_id 关联）
    CREATE TABLE IF NOT EXISTS goods_order (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,               -- 租户
      user_id INTEGER NOT NULL DEFAULT 0,          -- 买家（platform_user.id）
      buyer_identity_type TEXT NOT NULL DEFAULT 'individual', -- individual/employee
      status TEXT NOT NULL DEFAULT 'pending',      -- pending待支付/paid已支付/shipped已发货/done已完成/refunding退款中/refunded已退款/closed已关闭
      total_amount INTEGER NOT NULL DEFAULT 0,     -- 商品总额（分）
      freight INTEGER NOT NULL DEFAULT 0,          -- 运费（分）
      pay_amount INTEGER NOT NULL DEFAULT 0,       -- 实付（分）
      pay_order_id INTEGER NOT NULL DEFAULT 0,     -- payment_orders.id（分销分账经此单触发）
      delivery_mode TEXT NOT NULL DEFAULT 'express', -- express快递/pickup自提
      receiver_name TEXT NOT NULL DEFAULT '',
      receiver_phone TEXT NOT NULL DEFAULT '',
      receiver_address TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      paid_at TEXT,
      shipped_at TEXT,
      done_at TEXT,
      refunded_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goods_order_tenant ON goods_order(customer_id, status);
    CREATE INDEX IF NOT EXISTS idx_goods_order_user ON goods_order(user_id);
    CREATE INDEX IF NOT EXISTS idx_goods_order_pay ON goods_order(pay_order_id);

    -- 订单明细（商品快照防改价：title/thumb/spec/price 在下单时落库）
    CREATE TABLE IF NOT EXISTS goods_order_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      goods_id INTEGER NOT NULL,
      sku_id INTEGER NOT NULL DEFAULT 0,
      goods_type TEXT NOT NULL DEFAULT 'normal',   -- normal普通/carmi卡密/virtual虚拟
      title TEXT NOT NULL DEFAULT '',
      thumb TEXT NOT NULL DEFAULT '',
      spec_json TEXT NOT NULL DEFAULT '{}',
      price INTEGER NOT NULL DEFAULT 0,            -- 成交单价（分）
      num INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_goods_order_item ON goods_order_item(order_id);

    -- 订单状态流日志
    CREATE TABLE IF NOT EXISTS goods_order_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      action TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goods_order_log ON goods_order_log(order_id);

    -- 电子卡密（1:1 复刻菜鸟云 card_key：分类/库/数据；租户隔离 customer_id）
    CREATE TABLE IF NOT EXISTS card_key_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type INTEGER NOT NULL DEFAULT 1,             -- 1 单个卡密（售出减库存：激活码/邮箱/充值卡/账号） 2 通用卡密（客户收到内容一致：网盘/视频/教程）
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(customer_id, name)
    );
    CREATE TABLE IF NOT EXISTS card_key_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      cate_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      remark TEXT NOT NULL DEFAULT '',             -- 备注（仅后台可见）
      instruction TEXT NOT NULL DEFAULT '',        -- 使用说明（小程序端购买后订单详情可见）
      can_repetition INTEGER NOT NULL DEFAULT 0,   -- 是否可重复购买（1 是 / 0 否，默认否）
      data_content TEXT NOT NULL DEFAULT '',       -- 通用卡密展示内容（如：网盘地址xxx 提取码xxx）
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS card_key_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      library_id INTEGER NOT NULL,
      code TEXT NOT NULL DEFAULT '',               -- 编号
      pwd TEXT NOT NULL DEFAULT '',                -- 密码/卡密
      status INTEGER NOT NULL DEFAULT 0,           -- 0 未使用 1 已使用
      order_id INTEGER NOT NULL DEFAULT 0,         -- 使用订单（goods_order.id）
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_card_key_data_lib ON card_key_data(library_id, status);
  `);

  // 礼品卡券（1:1 复刻菜鸟云 giftcard：卡券分类 + 卡券 CRUD；用户购买后可自己兑用/转赠他人兑用）
  db.exec(`
    CREATE TABLE IF NOT EXISTS giftcard_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS giftcard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      cate_id INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,                -- 卡券名称
      price INTEGER NOT NULL DEFAULT 0,  -- 卡券价格（分）
      stock INTEGER NOT NULL DEFAULT 0,  -- 卡券库存
      sold INTEGER NOT NULL DEFAULT 0,   -- 已售
      limit_num INTEGER NOT NULL DEFAULT 0, -- 限购数量（0=不限制）
      increase INTEGER NOT NULL DEFAULT 0,  -- 开启转赠（0关 1开；开启后才可以转赠）
      type INTEGER NOT NULL DEFAULT 1,   -- 卡券类型（1充值卡 2实物卡）
      money INTEGER NOT NULL DEFAULT 0,  -- 卡券面额（分）
      use_type INTEGER NOT NULL DEFAULT 1,-- 使用限制（0固定时间有效 1购买当日 2购买次日）
      use_btime TEXT NOT NULL DEFAULT '',-- 固定时间起
      use_etime TEXT NOT NULL DEFAULT '',-- 固定时间止
      today_after INTEGER NOT NULL DEFAULT 0, -- 购买当日 N 天有效
      yes_after INTEGER NOT NULL DEFAULT 0,   -- 购买次日 N 天有效
      thumb TEXT NOT NULL DEFAULT '',    -- 缩略图
      carousel TEXT NOT NULL DEFAULT '[]',-- 轮播图（JSON 数组）
      descs TEXT NOT NULL DEFAULT '',    -- 卡券简介
      share_title TEXT NOT NULL DEFAULT '',
      share_img TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',   -- 卡券详情（富文本）
      sort INTEGER NOT NULL DEFAULT 0,   -- 排序（数字越大越靠前）
      flag INTEGER NOT NULL DEFAULT 1,   -- 状态（1上架 2下架）
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_giftcard_cate ON giftcard(customer_id, cate_id);
    CREATE TABLE IF NOT EXISTS gift_product (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,       -- goods.id
      status INTEGER NOT NULL DEFAULT 1, -- 绑定状态（1开启 0关闭）
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(customer_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS gift_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL UNIQUE,
      status INTEGER NOT NULL DEFAULT 1,   -- 送礼物开关（1开启 0关闭）
      share_style INTEGER NOT NULL DEFAULT 1, -- 分享样式（1/2/3）
      expire_hour INTEGER NOT NULL DEFAULT 0, -- 过期时间（小时，超过未领取退回）
      norm_delivery_fee INTEGER NOT NULL DEFAULT 0, -- 标准运费（分）
      messages TEXT NOT NULL DEFAULT '[]', -- 礼物赠言（JSON 数组）
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS giftcard_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL UNIQUE,
      share_title TEXT NOT NULL DEFAULT '', -- 分享标题
      share_img TEXT NOT NULL DEFAULT '',   -- 分享图
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
  `);

  // 订单来源（2026-09-17 对齐菜鸟云商品订单来源区分：普通商品/礼品卡券实物订单/送礼物订单）
  if (!colExists(db, 'goods_order', 'source')) {
    db.exec("ALTER TABLE goods_order ADD COLUMN source TEXT NOT NULL DEFAULT 'goods'");
  }
  // 售后订单（2026-09-17 1:1 复刻菜鸟云 duoproducts/service：待处理/处理中/退款完成/退款取消）
  db.exec(`
    CREATE TABLE IF NOT EXISTS goods_after_sale (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      after_sale_no TEXT NOT NULL UNIQUE,      -- 售后单号（AS+时间戳）
      customer_id INTEGER NOT NULL,            -- 租户
      order_id INTEGER NOT NULL,               -- goods_order.id
      user_id INTEGER NOT NULL DEFAULT 0,      -- 买家 platform_user.id
      type TEXT NOT NULL DEFAULT 'refund',     -- refund仅退款/return退货退款
      reason TEXT NOT NULL DEFAULT '',         -- 退款理由
      amount INTEGER NOT NULL DEFAULT 0,       -- 退款金额（分）
      status TEXT NOT NULL DEFAULT 'pending',  -- pending待处理/processing处理中/refunded退款完成/cancelled退款取消
      refuse_reason TEXT NOT NULL DEFAULT '',  -- 拒绝原因
      refund_no TEXT NOT NULL DEFAULT '',      -- 退款流水号
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 类型差异化字段（2026-09-17 对齐菜鸟云三类型表单差异）：手机号填写（卡密/虚拟）、卡密库（卡密专属，库表二期）
  // 注意：幂等迁移必须放在 db.exec 模板字符串之外，否则 SQLite 报 near "if" syntax error
  if (!colExists(db, 'goods', 'phone_required')) {
    db.exec("ALTER TABLE goods ADD COLUMN phone_required INTEGER NOT NULL DEFAULT 0");
  }
  if (!colExists(db, 'goods', 'card_key_id')) {
    db.exec("ALTER TABLE goods ADD COLUMN card_key_id INTEGER");
  }

  // —— 应用注册：商品管理（平台授权应用，1:1 复刻菜鸟云「商品=总后台授权」；租户方案勾选后侧边栏「商品管理」才显示；演示方案自动纳入见下方 solution_apps）——
  db.exec("INSERT OR IGNORE INTO app_categories (name, icon, sort_order) VALUES ('基础功能', 'apps', 2)");
  db.prepare("INSERT OR IGNORE INTO apps (code, name, description, icon, category, sort_order, enabled) VALUES ('goods', '商品管理', '商品发布/分类/订单/参数与商城设置（菜鸟云商品一级菜单）', 'template', '基础功能', 1, 1)").run();
  {
    const goodsApp = db.prepare("SELECT id FROM apps WHERE code = 'goods'").get();
    if (goodsApp) {
      const goodsMenus = [
        ['商品列表', 'goods:list', '商品列表管理'],
        ['商品分类', 'goods:cates', '商品分类管理'],
        ['商品订单', 'goods:orders', '商品订单管理'],
        ['商品参数', 'goods:params', '商品参数模板'],
        ['商城设置', 'goods:settings', '商城设置'],
      ];
      const menuIns = db.prepare('INSERT OR IGNORE INTO app_menus (app_id, module, module_label, key, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
      goodsMenus.forEach(([mod, key, label], idx) => menuIns.run(goodsApp.id, mod, mod, key, label, idx + 1));
    }
  }

  // —— 应用注册：电子卡密（卡密类型授权）/ 礼品卡券（营销应用）/ 送礼物（营销应用）（分类=营销引流；演示方案自动纳入见 migrateSolutionApps）——
  db.exec("INSERT OR IGNORE INTO app_categories (name, icon, sort_order) VALUES ('营销引流', 'channel', 4)");
  const goodsApps = [
    ['card-carmi', '电子卡密', '卡密商品，用户付款自动发货', 'badge', 1],
    ['card-ticket', '礼品卡券', '虚品实物，自己兑用转人兑用', 'voucher', 2],
    ['card-gift', '送礼物', '实物礼品，购买商品转赠好友', 'crown', 3],
  ];
  const goodsAppIns = db.prepare('INSERT OR IGNORE INTO apps (code, name, description, icon, category, sort_order, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)');
  for (const [code, name, desc, icon, order] of goodsApps) {
    goodsAppIns.run(code, name, desc, icon, '营销引流', order);
    const app = db.prepare('SELECT id FROM apps WHERE code = ?').get(code);
    if (!app) continue;
    const menus = {
      'card-carmi': [
        ['卡密库', 'carmi:list', '卡密库管理'],
        ['卡密分类', 'carmi:cates', '卡密分类管理'],
      ],
      'card-ticket': [
        ['卡券库', 'ticket:list', '礼品卡券管理'],
      ],
      'card-gift': [
        ['商品列表', 'gift:list', '送礼物商品管理'],
      ],
    }[code] || [];
    const menuIns = db.prepare('INSERT OR IGNORE INTO app_menus (app_id, module, module_label, key, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    menus.forEach(([mod, key, label], idx) => menuIns.run(app.id, mod, mod, key, label, idx + 1));
  }
  // 演示方案纳入（migrateSolutionApps 全量覆盖兜底，此处保证即时一致性）
  try {
    const demoRow = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
    if (demoRow) {
      const apps = db.prepare("SELECT id FROM apps WHERE code IN ('goods','card-carmi','card-ticket','card-gift')").all();
      for (const a of apps) {
        if (!db.prepare('SELECT id FROM solution_apps WHERE solution_id = ? AND app_id = ?').get(demoRow.id, a.id)) {
          db.prepare('INSERT INTO solution_apps (solution_id, app_id, enabled) VALUES (?, ?, 1)').run(demoRow.id, a.id);
        }
      }
    }
  } catch {}

  // —— 应用注册：小程序直播（1:1 复刻菜鸟云「微信直播」：直播列表/商品同步/商品审核；分类=客群维护；演示方案自动纳入）——
  db.exec("INSERT OR IGNORE INTO app_categories (name, icon, sort_order) VALUES ('客群维护', 'users', 5)");
  db.prepare("INSERT OR IGNORE INTO apps (code, name, description, icon, category, sort_order, enabled) VALUES ('live', '小程序直播', '视频直播，手机直播推流直播（菜鸟云微信直播）', 'panorama', '客群维护', 1, 1)").run();
  {
    const liveApp = db.prepare("SELECT id FROM apps WHERE code = 'live'").get();
    if (liveApp) {
      const liveMenus = [
        ['直播列表', 'live:list', '直播列表管理'],
        ['商品同步', 'live:goods', '直播间商品库管理'],
        ['商品审核', 'live:audit', '本地商品提交直播审核'],
      ];
      const menuIns = db.prepare('INSERT OR IGNORE INTO app_menus (app_id, module, module_label, key, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
      liveMenus.forEach(([mod, key, label], idx) => menuIns.run(liveApp.id, mod, mod, key, label, idx + 1));
    }
  }

  // —— 小程序直播数据表（live_rooms 直播间 / live_goods 直播商品库）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS live_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      room_id INTEGER,                      -- 微信直播间ID（同步/创建后回填）
      name TEXT NOT NULL DEFAULT '',
      anchor_name TEXT NOT NULL DEFAULT '',
      anchor_wechat TEXT NOT NULL DEFAULT '',
      background_img TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      share_img TEXT NOT NULL DEFAULT '',
      cover_img TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '未开始',  -- 未开始/直播中/已结束/禁播/暂停中/异常/已过期
      live_type TEXT NOT NULL DEFAULT 'phone', -- phone手机直播 / push推流
      list_display INTEGER NOT NULL DEFAULT 1,  -- 列表显示 1显示 0隐藏
      recommend INTEGER NOT NULL DEFAULT 0,     -- 设为推荐 1开 0关（DIY直播模块区分展示）
      like_enabled INTEGER NOT NULL DEFAULT 1,
      shelf_enabled INTEGER NOT NULL DEFAULT 1,
      comment_enabled INTEGER NOT NULL DEFAULT 1,
      replay_enabled INTEGER NOT NULL DEFAULT 0,
      share_enabled INTEGER NOT NULL DEFAULT 1,
      service_enabled INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT '小程序直播',
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_live_rooms_customer ON live_rooms(customer_id)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS live_goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      goods_id INTEGER NOT NULL,            -- 我方商品表 goods.id
      name TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,     -- 分
      page_path TEXT NOT NULL DEFAULT '',
      audit_id TEXT NOT NULL DEFAULT '',    -- 微信审核单号（同步审核状态用）
      audit_status TEXT NOT NULL DEFAULT 'pending', -- pending待审核 / approved审核通过 / failed审核失败
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(customer_id, goods_id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_live_goods_customer ON live_goods(customer_id)');
  // 幂等迁移：live_goods.thumb（微信商品缩略图，1:1 菜鸟云商品同步列表）
  if (!colExists(db, 'live_goods', 'thumb')) {
    db.exec("ALTER TABLE live_goods ADD COLUMN thumb TEXT NOT NULL DEFAULT ''");
  }

  // 演示方案纳入小程序直播
  try {
    const demoRow = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
    if (demoRow) {
      const liveApp = db.prepare("SELECT id FROM apps WHERE code = 'live'").get();
      if (liveApp && !db.prepare('SELECT id FROM solution_apps WHERE solution_id = ? AND app_id = ?').get(demoRow.id, liveApp.id)) {
        db.prepare('INSERT INTO solution_apps (solution_id, app_id, enabled) VALUES (?, ?, 1)').run(demoRow.id, liveApp.id);
      }
    }
  } catch {}

  // —— 商品管理附属表（1:1 复刻菜鸟云「东莞同城通」商品管理二级菜单：退货地址/供应厂商/品牌标签/标题标签/服务保障/评论管理/商城风格）——
  db.exec(`
    -- 退货地址（订单配送 > 退货地址：新增地址/批量删除）
    CREATE TABLE IF NOT EXISTS goods_return_addr (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',        -- 收件人姓名
      phone TEXT NOT NULL DEFAULT '',       -- 手机号
      address TEXT NOT NULL DEFAULT '',     -- 详细地址
      remark TEXT NOT NULL DEFAULT '',      -- 备注
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goods_return_addr ON goods_return_addr(customer_id);

    -- 供应厂商（营销运营 > 供应厂商：搜索/添加，表格 ID/供应商名称）
    CREATE TABLE IF NOT EXISTS goods_supplier (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',        -- 供应商名称
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goods_supplier ON goods_supplier(customer_id);

    -- 品牌标签（营销运营 > 品牌标签：搜索/新增，表格 ID/排序/标签名称/标签内容/启用情况）
    CREATE TABLE IF NOT EXISTS goods_brand_tag (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL DEFAULT '',        -- 标签名称
      content TEXT NOT NULL DEFAULT '',     -- 标签内容
      enabled INTEGER NOT NULL DEFAULT 1,   -- 启用情况 1启用 0禁用
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goods_brand_tag ON goods_brand_tag(customer_id);

    -- 标题标签（营销运营 > 标题标签：结构同品牌标签）
    CREATE TABLE IF NOT EXISTS goods_title_tag (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goods_title_tag ON goods_title_tag(customer_id);

    -- 服务保障（营销运营 > 服务保障：搜索/创建标签，表格 ID/标签名称/图标/启用情况）
    CREATE TABLE IF NOT EXISTS goods_service_tag (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL DEFAULT '',        -- 标签名称
      icon TEXT NOT NULL DEFAULT '',        -- 图标
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goods_service_tag ON goods_service_tag(customer_id);

    -- 评论管理（营销运营 > 评论管理：筛选 全部/好评/中评/差评 + 关键字；添加评论/批量删除）
    CREATE TABLE IF NOT EXISTS goods_comment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      goods_id INTEGER NOT NULL DEFAULT 0,  -- 产品ID（对应 goods.id）
      goods_name TEXT NOT NULL DEFAULT '',  -- 商品名称
      order_no TEXT NOT NULL DEFAULT '',    -- 订单号
      username TEXT NOT NULL DEFAULT '',    -- 评价人
      level INTEGER NOT NULL DEFAULT 1,     -- 评价级别 1好评 2中评 3差评
      content TEXT NOT NULL DEFAULT '',     -- 评价内容
      images TEXT NOT NULL DEFAULT '[]',    -- 评价图片
      anonymous INTEGER NOT NULL DEFAULT 0, -- 是否匿名 1是 0否
      status TEXT NOT NULL DEFAULT 'show',  -- 状态 show显示 hide隐藏
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goods_comment ON goods_comment(customer_id);

    -- 商城风格（商城设置 > 商城风格：分类风格 1/2 + 详情风格 1/2；每租户一条）
    CREATE TABLE IF NOT EXISTS goods_cate_style (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL UNIQUE,
      cate_style INTEGER NOT NULL DEFAULT 1,  -- 分类风格 1 风格1 2 风格2
      detail_style INTEGER NOT NULL DEFAULT 1,-- 详情风格 1 风格1 2 风格2 3 风格三
      goods_iscard INTEGER NOT NULL DEFAULT 2,-- 卡片样式 1 开启 2 关闭
      share_style INTEGER NOT NULL DEFAULT 1, -- 分享样式 1 样式一 2 样式二
      pbg_style INTEGER NOT NULL DEFAULT 1,   -- 价格样式 1 主题色 2 主题色+背景图
      pbg_img INTEGER NOT NULL DEFAULT 1,     -- 价格背景图 0 自定义 1-13 样式
      pbg_mode INTEGER NOT NULL DEFAULT 1,    -- 价格背景图模式 1 裁剪 2 填充
      pbg_theme INTEGER NOT NULL DEFAULT 1,   -- 主题样式（详情风格2） 0 自定义 1-13 样式
      pbg_img_custom TEXT NOT NULL DEFAULT '',-- 自定义价格背景图 URL
      pbg_theme_custom TEXT NOT NULL DEFAULT '',-- 自定义主题图 URL
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // 旧库迁移：goods_cate_style 补充卡片/分享/价格/主题字段（1:1 复刻菜鸟云 cateset 全参数）
  ['goods_iscard', 'share_style', 'pbg_style', 'pbg_img', 'pbg_mode', 'pbg_theme', 'pbg_img_custom', 'pbg_theme_custom'].forEach((col) => {
    if (!colExists(db, 'goods_cate_style', col)) {
      if (col === 'pbg_img_custom' || col === 'pbg_theme_custom') {
        db.exec(`ALTER TABLE goods_cate_style ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
      } else if (col === 'goods_iscard') {
        db.exec('ALTER TABLE goods_cate_style ADD COLUMN goods_iscard INTEGER NOT NULL DEFAULT 2');
      } else {
        db.exec(`ALTER TABLE goods_cate_style ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 1`);
      }
    }
  });

  // —— 商品采集独立应用（1:1 复刻菜鸟云 goods_collect：商品链接采集/选择分类/状态；从商品管理二级菜单移出，注册为应用）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS goods_collect (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      link TEXT NOT NULL DEFAULT '',          -- 商品链接（支持 ; 分隔多条）
      category_id INTEGER NOT NULL DEFAULT 0, -- 采集后归属分类
      status TEXT NOT NULL DEFAULT 'off',     -- 采集后状态：off暂不上架 / on立即上架
      state TEXT NOT NULL DEFAULT 'pending',  -- 处理状态：pending待处理 / done已完成 / failed失败
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goods_collect ON goods_collect(customer_id);
  `);
  db.prepare("INSERT OR IGNORE INTO apps (code, name, description, icon, category, sort_order, enabled) VALUES ('goods-collect', '商品采集', '批量采集淘宝/天猫商品链接到商品库', 'dynamic', '基础功能', 4, 1)").run();
  {
    const gcApp = db.prepare("SELECT id FROM apps WHERE code = 'goods-collect'").get();
    if (gcApp) {
      const gcMenus = [
        ['采集配置', 'collect:index', '商品采集配置与记录'],
      ];
      const menuIns = db.prepare('INSERT OR IGNORE INTO app_menus (app_id, module, module_label, key, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
      gcMenus.forEach(([mod, key, label], idx) => menuIns.run(gcApp.id, mod, mod, key, label, idx + 1));
    }
  }
  try {
    const demoRow = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
    if (demoRow) {
      const gcApp = db.prepare("SELECT id FROM apps WHERE code = 'goods-collect'").get();
      if (gcApp && !db.prepare('SELECT id FROM solution_apps WHERE solution_id = ? AND app_id = ?').get(demoRow.id, gcApp.id)) {
        db.prepare('INSERT INTO solution_apps (solution_id, app_id, enabled) VALUES (?, ?, 1)').run(demoRow.id, gcApp.id);
      }
    }
  } catch {}
}

function seedDistribution(db) {
  db.exec(`
    -- 租户插件安装/启用表
    CREATE TABLE IF NOT EXISTS sys_tenant_plugin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      plugin_code TEXT NOT NULL,             -- dist/partner/share_all/share_cat/share_area
      is_install INTEGER NOT NULL DEFAULT 0,
      is_enable INTEGER NOT NULL DEFAULT 0,
      config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, plugin_code)
    );
    CREATE INDEX IF NOT EXISTS idx_plugin_tenant ON sys_tenant_plugin(tenant_id);

    -- 二级分销全局配置（每租户一条）
    CREATE TABLE IF NOT EXISTS dist_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL UNIQUE,
      ratio1 REAL NOT NULL DEFAULT 0.20,      -- 一级比例
      ratio2 REAL NOT NULL DEFAULT 0.05,      -- 二级比例
      is_open_level2 INTEGER NOT NULL DEFAULT 1,
      is_self_buy INTEGER NOT NULL DEFAULT 0, -- 自购返佣
      calc_type INTEGER NOT NULL DEFAULT 1,   -- 1实付 2原价
      settle_day INTEGER NOT NULL DEFAULT 7,  -- T+7
      min_withdraw REAL NOT NULL DEFAULT 10,  -- 最低提现（元）
      withdraw_fee_rate REAL NOT NULL DEFAULT 0, -- 提现手续费比例
      max_total_ratio REAL NOT NULL DEFAULT 0.30,-- 订单总让利上限
      distributor_gate INTEGER NOT NULL DEFAULT 0, -- 分销商开通门槛：0无门槛 1付费用户 2指定名单
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 分销商白名单（distributor_gate=2 时有效）
    CREATE TABLE IF NOT EXISTS dist_distributor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      identity_type TEXT NOT NULL DEFAULT 'individual',
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, user_id, identity_type)
    );

    -- 用户分销关系（租户维度永久绑定，双身份隔离）
    CREATE TABLE IF NOT EXISTS dist_user_relation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      identity_type TEXT NOT NULL DEFAULT 'individual', -- individual/employee
      pid1 INTEGER,
      pid2 INTEGER,
      source_type TEXT NOT NULL DEFAULT 'card',  -- card/market/qrcode
      bind_time TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, user_id, identity_type)
    );
    CREATE INDEX IF NOT EXISTS idx_relation_tenant ON dist_user_relation(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_relation_pid1 ON dist_user_relation(tenant_id, pid1);
    CREATE INDEX IF NOT EXISTS idx_relation_pid2 ON dist_user_relation(tenant_id, pid2);

    -- 分账快照（核心对账表，退款/插件关闭均不删除）
    CREATE TABLE IF NOT EXISTS dist_order_split (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      order_no TEXT NOT NULL DEFAULT '',
      order_amount INTEGER NOT NULL DEFAULT 0,
      buyer_user_id INTEGER NOT NULL DEFAULT 0,
      buyer_identity_type TEXT NOT NULL DEFAULT 'individual',
      category_id INTEGER,
      area_code TEXT,
      commission1 INTEGER NOT NULL DEFAULT 0,
      commission2 INTEGER NOT NULL DEFAULT 0,
      partner_bonus INTEGER NOT NULL DEFAULT 0,
      share_all_bonus INTEGER NOT NULL DEFAULT 0,
      share_cat_bonus INTEGER NOT NULL DEFAULT 0,
      share_area_bonus INTEGER NOT NULL DEFAULT 0,
      total_bonus INTEGER NOT NULL DEFAULT 0,
      settle_status TEXT NOT NULL DEFAULT 'pending', -- pending/settled/refunded
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_split_order ON dist_order_split(tenant_id, order_id);

    -- 用户收益流水（单一类型一条）
    CREATE TABLE IF NOT EXISTS dist_user_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      identity_type TEXT NOT NULL DEFAULT 'individual',
      order_id INTEGER NOT NULL DEFAULT 0,
      order_no TEXT NOT NULL DEFAULT '',
      split_id INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT '',  -- level1/level2/partner/share_all/share_cat/share_area
      amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending', -- pending/settled/charged_back
      remark TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_log_user ON dist_user_log(tenant_id, user_id, identity_type);
    CREATE INDEX IF NOT EXISTS idx_log_order ON dist_user_log(tenant_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_log_status ON dist_user_log(tenant_id, status);

    -- 用户钱包（三键隔离：租户+用户+身份）
    CREATE TABLE IF NOT EXISTS dist_wallet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      identity_type TEXT NOT NULL DEFAULT 'individual',
      wait_settle INTEGER NOT NULL DEFAULT 0,
      available INTEGER NOT NULL DEFAULT 0,
      total_income INTEGER NOT NULL DEFAULT 0,
      total_withdraw INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, user_id, identity_type)
    );

    -- 提现申请表
    CREATE TABLE IF NOT EXISTS dist_withdraw (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      withdraw_no TEXT NOT NULL UNIQUE,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      identity_type TEXT NOT NULL DEFAULT 'individual',
      amount INTEGER NOT NULL DEFAULT 0,
      service_fee INTEGER NOT NULL DEFAULT 0,
      actual_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending', -- pending/approved/rejected/done
      reject_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_withdraw_tenant ON dist_withdraw(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_withdraw_user ON dist_withdraw(tenant_id, user_id);

    -- 分销漏斗事件表（分享/曝光埋点；绑定/付费由业务表派生统计）
    CREATE TABLE IF NOT EXISTS dist_funnel_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER NOT NULL DEFAULT 0,     -- 推广人
      visitor_key TEXT NOT NULL DEFAULT '',   -- 访客唯一键（曝光去重）
      event_type TEXT NOT NULL DEFAULT '',    -- share / view
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_funnel_tenant_time ON dist_funnel_events(tenant_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_funnel_view_dedup ON dist_funnel_events(tenant_id, user_id, event_type, visitor_key)
      WHERE event_type = 'view' AND visitor_key != '';

    -- 合伙人配置表（P1）
    CREATE TABLE IF NOT EXISTS dist_partner (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      ratio REAL NOT NULL DEFAULT 1,        -- 分红权重比例
      mode INTEGER NOT NULL DEFAULT 1,       -- 1 团队流水 2 租户全局流水
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tenant_user ON dist_partner(tenant_id, user_id);

    -- 全民股东表（P1）
    CREATE TABLE IF NOT EXISTS dist_share_all (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      weight REAL NOT NULL DEFAULT 1,        -- 权重（均等模式忽略）
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_share_all_tenant_user ON dist_share_all(tenant_id, user_id);

    -- 类目股东表（P1）：每个行业独立比例 + 独立股东列表
    CREATE TABLE IF NOT EXISTS dist_share_cat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      category_id TEXT NOT NULL,             -- 行业类目（card_profile.business_field）
      user_id INTEGER NOT NULL,
      ratio REAL NOT NULL DEFAULT 0.05,      -- 该类目分红池抽取比例
      weight REAL NOT NULL DEFAULT 1,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_share_cat_tenant_cat_user ON dist_share_cat(tenant_id, category_id, user_id);

    -- 区域股东表（P1）：每个地区独立比例 + 独立股东列表
    CREATE TABLE IF NOT EXISTS dist_share_area (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      area_code TEXT NOT NULL,               -- 地区（card_profile.city）
      user_id INTEGER NOT NULL,
      ratio REAL NOT NULL DEFAULT 0.05,      -- 该地区分红池抽取比例
      weight REAL NOT NULL DEFAULT 1,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_share_area_tenant_area_user ON dist_share_area(tenant_id, area_code, user_id);
  `);

  // 打款登记字段（幂等迁移，兼容存量库；必须放在 exec 之外）
  if (!colExists(db, 'dist_withdraw', 'pay_no')) {
    db.exec("ALTER TABLE dist_withdraw ADD COLUMN pay_no TEXT NOT NULL DEFAULT ''");
  }
  if (!colExists(db, 'dist_withdraw', 'pay_remark')) {
    db.exec("ALTER TABLE dist_withdraw ADD COLUMN pay_remark TEXT NOT NULL DEFAULT ''");
  }
  // 提现收款账户（申请时填写：JSON {type:'wx'|'alipay'|'bank', value, name?}）
  if (!colExists(db, 'dist_withdraw', 'pay_account')) {
    db.exec("ALTER TABLE dist_withdraw ADD COLUMN pay_account TEXT NOT NULL DEFAULT ''");
  }

  // —— 2. 应用注册：分销体系分类 + 5 个独立应用 ——
  db.exec("INSERT OR IGNORE INTO app_categories (name, icon, sort_order) VALUES ('分销体系', 'dist', 9)");
  const distApps = [
    ['dist', '分销裂变', '上下级链式推广佣金（一级/二级比例可配），并承载钱包提现与分销数据大盘', 'dist', 1],
    ['partner', '合伙人分红', '顶层运营/会长/秘书长团队分红，支持团队流水与租户全局流水两种模式', 'partner', 2],
    ['share-all', '全民股东', '全站付费订单池式分红，均等或按权重分配', 'share', 3],
    ['share-cat', '类目股东', '按行业类目分红，各行业独立比例与股东列表', 'category', 4],
    ['share-area', '区域股东', '按地域分红，各地区独立比例与股东列表', 'area', 5],
  ];
  const distAppIns = db.prepare('INSERT OR IGNORE INTO apps (code, name, description, icon, category, sort_order, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)');
  for (const [code, name, desc, icon, order] of distApps) {
    distAppIns.run(code, name, desc, icon, '分销体系', order);
    const app = db.prepare('SELECT id FROM apps WHERE code = ?').get(code);
    if (!app) continue;
    const menus = {
      dist: [
        ['配置', 'dist:config', '分销配置'], ['分销商', 'dist:members', '分销商管理'], ['佣金明细', 'dist:commissions', '佣金明细'],
        ['钱包提现', 'dist:wallet', '钱包提现'], ['数据大盘', 'dist:stats', '数据大盘'], ['溯源记录', 'dist:relations', '溯源记录'],
      ],
      partner: [
        ['配置', 'partner:config', '分红配置'], ['合伙人', 'partner:members', '合伙人管理'], ['分红明细', 'partner:logs', '分红明细'],
      ],
      'share-all': [
        ['配置', 'share-all:config', '分红配置'], ['股东', 'share-all:members', '股东管理'], ['分红明细', 'share-all:logs', '分红明细'],
      ],
      'share-cat': [
        ['配置', 'share-cat:config', '类目分红配置'], ['股东', 'share-cat:members', '股东管理'], ['分红明细', 'share-cat:logs', '分红明细'],
      ],
      'share-area': [
        ['配置', 'share-area:config', '区域分红配置'], ['股东', 'share-area:members', '股东管理'], ['分红明细', 'share-area:logs', '分红明细'],
      ],
    }[code] || [];
    const menuIns = db.prepare('INSERT OR IGNORE INTO app_menus (app_id, module, module_label, key, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    menus.forEach(([mod, key, label], idx) => menuIns.run(app.id, mod, mod, key, label, idx + 1));
  }

  // —— 3. 存量迁移：platform_user.parent_id/grandparent_id → dist_user_relation（补租户维度）——
  try {
    const legacy = db.prepare("SELECT id, customer_id, identity_type, parent_id, grandparent_id FROM platform_user WHERE parent_id IS NOT NULL OR grandparent_id IS NOT NULL").all();
    const relIns = db.prepare(
      'INSERT OR IGNORE INTO dist_user_relation (tenant_id, user_id, identity_type, pid1, pid2, source_type) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const u of legacy) {
      const tenantId = u.customer_id || 0;
      if (!tenantId) continue; // 未绑定租户的存量用户不迁移（避免污染）
      const idt = u.identity_type || 'individual';
      relIns.run(tenantId, u.id, idt, u.parent_id || null, u.grandparent_id || null, 'card');
    }
  } catch {}

  // —— 4. 演示方案纳入（migrateSolutionApps 会全量覆盖，此处补一次保证一致性）——
  try {
    const demoRow = db.prepare("SELECT id FROM solutions WHERE code = 'demo'").get();
    if (demoRow) {
      const allApps = db.prepare("SELECT id FROM apps WHERE code IN ('dist','partner','share-all','share-cat','share-area')").all();
      for (const a of allApps) {
        if (!db.prepare('SELECT id FROM solution_apps WHERE solution_id = ? AND app_id = ?').get(demoRow.id, a.id)) {
          db.prepare('INSERT INTO solution_apps (solution_id, app_id, enabled) VALUES (?, ?, 1)').run(demoRow.id, a.id);
        }
      }
    }
  } catch {}

  // —— 5. 分销迁移（建表之后执行）：dist_config 门槛列 + 分销商白名单表（旧运行库补齐）——
  if (!colExists(db, 'dist_config', 'distributor_gate')) {
    db.exec('ALTER TABLE dist_config ADD COLUMN distributor_gate INTEGER NOT NULL DEFAULT 0');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS dist_distributor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      identity_type TEXT NOT NULL DEFAULT 'individual',
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, user_id, identity_type)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS dist_distributor_apply (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      identity_type TEXT NOT NULL DEFAULT 'individual',
      status TEXT NOT NULL DEFAULT 'pending',
      reject_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT
    )
  `);

  // —— 6. 分销等级（dist_level，租户隔离；按累计收益/直推人数自动升级）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS dist_level (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      level_no INTEGER NOT NULL DEFAULT 1,          -- 等级序号（1 起，升序）
      name TEXT NOT NULL DEFAULT '默认等级',          -- 等级名
      min_total_income INTEGER NOT NULL DEFAULT 0,  -- 升级门槛：累计收益（分）
      min_direct INTEGER NOT NULL DEFAULT 0,        -- 升级门槛：直推人数
      benefits TEXT NOT NULL DEFAULT '',            -- 等级权益描述（自定义文案，C 端等级说明展示）
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, level_no)
    );
    CREATE INDEX IF NOT EXISTS idx_dist_level_tenant ON dist_level(tenant_id);
  `);
  // dist_level.benefits：等级权益描述（幂等迁移，放在 exec 之外）
  if (tableExists(db, 'dist_level') && !colExists(db, 'dist_level', 'benefits')) {
    db.exec("ALTER TABLE dist_level ADD COLUMN benefits TEXT NOT NULL DEFAULT ''");
  }
  // 平台模板（tenant 0）等级权益文案补默认值（幂等：仅模板租户且为空时）
  try {
    const tpl = db.prepare("SELECT id, level_no, benefits FROM dist_level WHERE tenant_id = 0 AND benefits = ''").all();
    const tplBenefit = {
      1: '开通即可参与推广；分享名片或推广码，客户付费后获得推广佣金',
      2: '解锁专属推广海报角标；佣金比例与结算周期维持标准档；优先获得平台推广活动参与资格',
      3: '专属黄金徽标与高级海报模板；更高的佣金结算优先级；新品与活动优先内测资格',
    };
    for (const lv of tpl) {
      if (tplBenefit[lv.level_no]) db.prepare("UPDATE dist_level SET benefits = ?, updated_at = datetime('now') WHERE id = ?").run(tplBenefit[lv.level_no], lv.id);
    }
  } catch {}
  // 默认等级种子（仅当该租户没有任何等级配置时插入，幂等）
  try {
    const levelCnt = db.prepare('SELECT COUNT(*) AS c FROM dist_level').get();
    if (levelCnt.c === 0) {
      const insLv = db.prepare('INSERT INTO dist_level (tenant_id, level_no, name, min_total_income, min_direct, benefits) VALUES (?, ?, ?, ?, ?, ?)');
      insLv.run(0, 1, '默认等级', 0, 0, '开通即可参与推广；分享名片或推广码，客户付费后获得推广佣金');
      insLv.run(0, 2, '白银推广员', 100000, 10, '解锁专属推广海报角标；佣金比例与结算周期维持标准档；优先获得平台推广活动参与资格');   // 累计收益 ¥1000 或直推 10 人
      insLv.run(0, 3, '黄金推广员', 500000, 30, '专属黄金徽标与高级海报模板；更高的佣金结算优先级；新品与活动优先内测资格');   // 累计收益 ¥5000 或直推 30 人
    }
  } catch {}
}

/** 设计中心：素材中心/系统风格/底部导航/系统模板/首页跳转/页面装修 建表 + 应用注册（幂等） */
function seedDesign(db) {
  // —— 1. 建表（全部 tenant_id 租户隔离）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS material_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      category_name TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_material_category_tenant ON material_category (tenant_id);

    CREATE TABLE IF NOT EXISTS material (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      category_id INTEGER,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      file_type TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_material_tenant_cat ON material (tenant_id, category_id);

    CREATE TABLE IF NOT EXISTS material_ref (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      material_id INTEGER NOT NULL,
      ref_type TEXT NOT NULL,
      ref_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (material_id, ref_type, ref_id)
    );
    CREATE INDEX IF NOT EXISTS idx_material_ref_tenant ON material_ref (tenant_id, material_id);

    CREATE TABLE IF NOT EXISTS tenant_style_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL UNIQUE,
      style_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tenant_tab_scheme (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      scheme_name TEXT NOT NULL,
      tab_json TEXT NOT NULL DEFAULT '[]',
      is_default INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_tab_tenant ON tenant_tab_scheme (tenant_id);

    CREATE TABLE IF NOT EXISTS tenant_home_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL UNIQUE,
      home_page TEXT NOT NULL DEFAULT 'card',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tenant_template (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 0,
      template_name TEXT NOT NULL,
      cover_url TEXT,
      template_json TEXT NOT NULL DEFAULT '{}',
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_template ON tenant_template (tenant_id);

    CREATE TABLE IF NOT EXISTS tenant_page_design (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      page_type TEXT NOT NULL,
      page_name TEXT NOT NULL,
      design_json TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      status INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_page ON tenant_page_design (tenant_id, page_type, status);

    CREATE TABLE IF NOT EXISTS tenant_page_version (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      page_type TEXT NOT NULL,
      version INTEGER NOT NULL,
      design_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_page_version ON tenant_page_version (tenant_id, page_type, version);

    CREATE TABLE IF NOT EXISTS tenant_design_global (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL UNIQUE,
      config_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 设计中心页面装修：首页可切换标记（幂等迁移；现有 home 页自动置为首页）
  if (tableExists(db, 'tenant_page_design') && !colExists(db, 'tenant_page_design', 'is_home')) {
    db.exec("ALTER TABLE tenant_page_design ADD COLUMN is_home INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE tenant_page_design SET is_home = 1 WHERE page_type = 'home'");
  }
  // 兜底：租户完全没有首页标记时（迁移后新建的旧 home 草稿行 is_home=0），把其 page_type='home' 行置为首页；
  // 已切换首页到其它页的租户（已有 is_home=1）不受影响
  if (tableExists(db, 'tenant_page_design')) {
    db.exec("UPDATE tenant_page_design SET is_home = 1 WHERE page_type = 'home' AND tenant_id NOT IN (SELECT tenant_id FROM tenant_page_design WHERE is_home = 1)");
    // 草稿行跟随同页发布行的首页标记（历史脏数据同步）
    db.exec("UPDATE tenant_page_design SET is_home = 1 WHERE status = 0 AND EXISTS (SELECT 1 FROM tenant_page_design t2 WHERE t2.tenant_id = tenant_page_design.tenant_id AND t2.page_type = tenant_page_design.page_type AND t2.status = 1 AND t2.is_home = 1)");
  }
  // 页面排序字段：sort_order（租户内页面列表拖拽排序用；同 page_type 草稿/发布行共享排序位，按 id 赋初值）
  if (tableExists(db, 'tenant_page_design') && !colExists(db, 'tenant_page_design', 'sort_order')) {
    db.exec("ALTER TABLE tenant_page_design ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE tenant_page_design SET sort_order = id WHERE sort_order = 0");
  }
}

/** 会员体系（租户级会员，1:1 复刻菜鸟云「用户」菜单：等级/开卡/申请/积分/消费/标签/设置，幂等） */
function seedMember(db) {
  // —— 会员等级（1-50 级，升级模式：consume 消费模式 / apply 申请模式）——
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      level_no INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL DEFAULT '',
      status INTEGER NOT NULL DEFAULT 1,
      icon TEXT NOT NULL DEFAULT '',           -- 权益等级图（建议 5:3 630x378）
      bg_color TEXT NOT NULL DEFAULT '',       -- 权益等级图背景颜色
      text_show INTEGER NOT NULL DEFAULT 1,    -- 等级图文字展示
      text_color TEXT NOT NULL DEFAULT '#ffffff',
      upgrade_mode TEXT NOT NULL DEFAULT 'consume', -- consume/apply
      consume_amount INTEGER NOT NULL DEFAULT 0,    -- 累计消费门槛（分）
      buy_price INTEGER NOT NULL DEFAULT 0,         -- 直接购买价格（分）
      buy_product TEXT NOT NULL DEFAULT '',         -- 购买商品（待接入商城）
      form_id INTEGER DEFAULT 0,                    -- 升级表单（申请模式，预留）
      benefits TEXT NOT NULL DEFAULT '{}',          -- 会员权益 JSON：{coupon:{...},post_free,discount,score_multiple,point_back,view_levels:[],custom:[]}
      description TEXT NOT NULL DEFAULT '',         -- 等级说明（最多200字）
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_member_levels_tenant ON member_levels (tenant_id);

    -- —— 会员设置（每租户一行）——
    CREATE TABLE IF NOT EXISTS member_settings (
      tenant_id INTEGER PRIMARY KEY,
      card_enabled INTEGER NOT NULL DEFAULT 1,      -- 会员卡开关
      expire_remind_days INTEGER NOT NULL DEFAULT 7,-- 到期提醒天数
      show_name INTEGER NOT NULL DEFAULT 1,         -- 信息展示-姓名
      show_expire INTEGER NOT NULL DEFAULT 1,       -- 信息展示-有效期
      permissions TEXT NOT NULL DEFAULT '{}',       -- 功能权限 JSON {balance_recharge:'all', product:'member', ...}
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- —— 会员身份（租户 x 用户，卡号/等级/余额(分)/积分/到期）——
    CREATE TABLE IF NOT EXISTS member_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      card_no TEXT NOT NULL DEFAULT '',
      level_id INTEGER DEFAULT 0,
      expire_at TEXT,
      balance INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_member_user_tenant ON member_user (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_member_user_card ON member_user (card_no);

    -- —— 开卡记录 ——
    CREATE TABLE IF NOT EXISTS member_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      card_no TEXT NOT NULL DEFAULT '',
      level_id INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'auto', -- auto/apply/buy
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      expire_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_member_cards_tenant ON member_cards (tenant_id, user_id);

    -- —— 申请记录（申请模式审核）——
    CREATE TABLE IF NOT EXISTS member_apply (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      apply_level_id INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending', -- pending/approved/rejected
      review_at TEXT,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_member_apply_tenant ON member_apply (tenant_id, status);

    -- —— 消费流水 ——
    CREATE TABLE IF NOT EXISTS member_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'consume', -- consume消费/recharge充值/get获取
      amount INTEGER NOT NULL DEFAULT 0,    -- 分（正=获得/充入，负=消费）
      note TEXT NOT NULL DEFAULT '',
      order_no TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_member_logs_tenant ON member_logs (tenant_id, user_id);

    -- —— 积分流水 ——
    CREATE TABLE IF NOT EXISTS member_score_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'get', -- get获得/use使用
      score INTEGER NOT NULL DEFAULT 0, -- 正=获得/负=使用
      note TEXT NOT NULL DEFAULT '',
      order_no TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_member_score_logs_tenant ON member_score_logs (tenant_id, user_id);

    -- —— 用户标签 ——
    CREATE TABLE IF NOT EXISTS member_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_member_labels_tenant ON member_labels (tenant_id);

    -- —— 用户 x 标签 ——
    CREATE TABLE IF NOT EXISTS member_user_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      label_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, user_id, label_id)
    );
    CREATE INDEX IF NOT EXISTS idx_member_user_labels ON member_user_labels (tenant_id, user_id);
  `);
}

/** 方案资产 P1：预置集市风格 A/B/C（幂等，价格可在总后台调整） */
function seedMarketStyles(db) {
  const styles = [
    { key: 'A', name: '方案A · 角标权重', description: '置顶/新入驻角标融入双列卡片流，默认推荐', price: 0, isDefault: 1, sortOrder: 1 },
    { key: 'B', name: '方案B · 重点会员', description: '顶部横向重点会员专区 + 双列普通列表', price: 199, isDefault: 0, sortOrder: 2 },
    { key: 'C', name: '方案C · 分类页签', description: '全部/置顶/新入驻三 Tab，适合大租户', price: 299, isDefault: 0, sortOrder: 3 },
  ];
  const exist = db.prepare('SELECT COUNT(*) AS c FROM market_styles').get();
  if (exist.c > 0) return;
  const ins = db.prepare('INSERT INTO market_styles (key, name, description, price, is_default, enabled, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)');
  for (const s of styles) ins.run(s.key, s.name, s.description, s.price, s.isDefault, s.sortOrder);
}

/** 数据库行 -> 客户项目 API JSON（camelCase） */
export function toCustomer(row) {
  if (!row) return null;
  let solutions = ['panorama'];
  try { solutions = JSON.parse(row.solutions || '["panorama"]'); } catch {}
  let config = {};
  try { config = JSON.parse(row.config || '{}'); } catch {}
  return {
    id: row.id,
    customerName: row.customer_name,
    logoPath: row.logo_path || '',
    description: row.description || '',
    validFrom: row.valid_from || '',
    validUntil: row.valid_until || '',
    isPinned: Boolean(row.is_pinned),
    remark: row.remark || '',
    status: row.status || 'active',
    solutions,
    config,
    adminUserId: row.admin_user_id || null,
    inviteCode: row.invite_code || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 数据库行 -> 解决方案 API JSON */
export function toSolution(row) {
  if (!row) return null;
  let appConfig = {};
  if (row.app_config) {
    try { appConfig = JSON.parse(row.app_config); } catch { appConfig = {}; }
  }
  let previewImages = [];
  if (row.preview_images) {
    try { previewImages = JSON.parse(row.preview_images); } catch { previewImages = []; }
  }
  // defaultPlatform：多选数组（JSON 存储），兼容旧单值字符串
  let defaultPlatform = ['h5'];
  if (row.default_platform) {
    const v = row.default_platform;
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr)) defaultPlatform = arr.length ? arr : ['h5'];
    } catch {
      defaultPlatform = [v];
    }
  }
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description || '',
    icon: row.icon || '',
    enabled: Boolean(row.enabled),
    status: row.status || 'on',
    isHot: Boolean(row.is_hot),
    categoryId: row.category_id || null,
    defaultPlatform,
    previewImages,
    virtualUseCount: row.virtual_use_count || 0,
    allPermissions: Boolean(row.all_permissions),
    isDemo: Boolean(row.is_demo),
    sortOrder: row.sort_order || 0,
    appConfig,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 方案中心：聚合价格与权限点（P0） */
export function solutionDetail(db, id) {
  const row = db.prepare('SELECT * FROM solutions WHERE id = ?').get(id);
  if (!row) return null;
  const pricing = db
    .prepare('SELECT id, duration_months, agent_price, user_price, renew_price FROM solution_pricing WHERE solution_id = ? ORDER BY duration_months ASC')
    .all(id)
    .map((p) => ({ id: p.id, durationMonths: p.duration_months, agentPrice: p.agent_price, userPrice: p.user_price, renewPrice: p.renew_price }));
  // 两级权限：应用级勾选（solution_apps）+ 应用内菜单级授权（solution_permissions）
  // 动态补齐：平台全部应用/菜单都返回；未勾选/未授权默认 false（新增应用/菜单自动出现、默认不选）
  const appAuth = {};
  db.prepare('SELECT app_id, enabled FROM solution_apps WHERE solution_id = ?').all(id)
    .forEach((a) => { appAuth[a.app_id] = Boolean(a.enabled); });
  const permAuth = {};
  db.prepare('SELECT app_id, key, enabled FROM solution_permissions WHERE solution_id = ?').all(id)
    .forEach((p) => { permAuth[`${p.app_id}:${p.key}`] = Boolean(p.enabled); });
  const appPermissions = db.prepare('SELECT * FROM apps ORDER BY sort_order ASC, id ASC').all()
    .filter((a) => a.enabled !== 0)
    .map((a) => {
      const menus = db.prepare('SELECT module, module_label, key, label, sort_order FROM app_menus WHERE app_id = ? ORDER BY sort_order ASC, id ASC').all(a.id)
        .map((m) => ({ module: m.module, moduleLabel: m.module_label, key: m.key, label: m.label, enabled: !!permAuth[`${a.id}:${m.key}`] }));
      // 演示试用方案：动态纳入全部应用 + 菜单全量授权（新增应用/菜单自动生效，无需落库）
      if (row.is_demo) {
        return { code: a.code, name: a.name, icon: a.icon, description: a.description, enabled: true, menus: menus.map((m) => ({ ...m, enabled: true })) };
      }
      return { code: a.code, name: a.name, icon: a.icon, description: a.description, enabled: !!appAuth[a.id], menus };
    });
  return { ...toSolution(row), pricing, allPermissions: Boolean(row.all_permissions), appPermissions };
}

/** 数据库行 -> 方案 API JSON（camelCase，原 toProject） */
export function toPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id || null,
    name: row.name,
    description: row.description,
    coverPath: row.cover_path || '',
    sortOrder: row.sort_order,
    published: Boolean(row.published),
    shareToken: row.share_token || '',
    shareEnabled: Boolean(row.share_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 兼容旧调用：toProject -> toPlan */
export const toProject = toPlan;

/** 数据库行 -> 场景 API JSON（camelCase） */
export function toScene(row) {
  if (!row) return null;
  let pyramid = null;
  if (row.pyramid) {
    try {
      pyramid = JSON.parse(row.pyramid);
    } catch {
      pyramid = null;
    }
  }
  let hotspots = [];
  if (row.hotspots) {
    try { hotspots = JSON.parse(row.hotspots); } catch { hotspots = []; }
  }
  let meta = {};
  if (row.meta) {
    try { meta = JSON.parse(row.meta); } catch { meta = {}; }
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imagePath: row.image_path,
    previewPath: row.preview_path || '',
    pyramid,
    hotspots,
    meta,
    planId: row.plan_id || null,
    projectId: row.plan_id || null, // 兼容旧前端字段
    shareToken: row.share_token || '',
    shareEnabled: Boolean(row.share_enabled),
    sortOrder: row.sort_order,
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- 密码哈希（scrypt） ----------
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  try {
    const derived = scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** 数据库行 -> 用户 API JSON（camelCase，不含密码哈希） */
export function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username || '',
    phone: row.phone || '',
    role: row.role,
    status: row.status,
    customerId: row.customer_id || null,
    enterpriseId: row.enterprise_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- 订单 ----------
export function toOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    orderNo: row.order_no,
    title: row.title,
    amount: row.amount,
    status: row.status,
    paymentMethod: row.payment_method,
    paidAt: row.paid_at,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function genOrderNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD${ts}${rand}`;
}

// ---------- 通用设置（key-value） ----------
export function getAllSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(db, key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, v);
}

export function setSettingsBatch(db, pairs) {
  const stmt = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );
  for (const [k, v] of pairs) {
    const val = typeof v === 'string' ? v : JSON.stringify(v);
    stmt.run(k, val);
  }
}

// ---------- 操作日志 ----------
export function addOperationLog(db, { userId, username, action, targetType, targetId, detail, ip }) {
  db.prepare(
    `INSERT INTO operation_logs (user_id, username, action, target_type, target_id, detail, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId ?? null, username ?? null, action, targetType ?? null, targetId ?? null, detail ?? null, ip ?? null);
}

export function queryOperationLogs(db, { userId, action, targetType, from, to, limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (userId) { where.push('user_id = ?'); params.push(userId); }
  if (action) { where.push('action = ?'); params.push(action); }
  if (targetType) { where.push('target_type = ?'); params.push(targetType); }
  if (from) { where.push('created_at >= ?'); params.push(from); }
  if (to) { where.push('created_at <= ?'); params.push(to); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db
    .prepare(`SELECT * FROM operation_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM operation_logs ${whereSql}`).get(...params)?.n || 0;
  return { logs: rows, total };
}

// ---------- 内容体系（1:1 复刻菜鸟云「东莞同城通」内容：文章/组图/视频/评论/基础设置） ----------
function seedContent(db) {
  db.exec(`
    -- 文章分类（支持二级：pid=0 顶级）
    CREATE TABLE IF NOT EXISTS content_article_cate (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      pid INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      image TEXT NOT NULL DEFAULT '',          -- 缩略图 350x350 ≤100kb
      intro TEXT NOT NULL DEFAULT '',          -- 分类简介
      sort_order INTEGER NOT NULL DEFAULT 0,   -- 数字越大越靠前
      status INTEGER NOT NULL DEFAULT 1,       -- 1启用 0禁用
      page_size INTEGER NOT NULL DEFAULT 10,   -- 每页数量（不填默认10）
      img_ratio TEXT NOT NULL DEFAULT '1:1',   -- 图片比例 1:1/4:3/3:4/自适应
      plate_style TEXT NOT NULL DEFAULT 'one_big', -- 板块样式 一列大图/两列图片/一列小图1/一列小图2/无图列表
      share_title TEXT NOT NULL DEFAULT '',
      share_img TEXT NOT NULL DEFAULT '',      -- 分享图 5:4 ≤100kb
      member_view INTEGER NOT NULL DEFAULT 0,  -- 会员浏览 0关闭 1开启
      pc_enable INTEGER NOT NULL DEFAULT 1,    -- PC端 1启用 0禁用
      ad_header TEXT NOT NULL DEFAULT '',      -- 流量广告-头部广告
      ad_footer TEXT NOT NULL DEFAULT '',      -- 流量广告-底部广告
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_content_article_cate ON content_article_cate(customer_id, pid);

    -- 文章（字段对齐菜鸟云添加文章 6 页签）
    CREATE TABLE IF NOT EXISTS content_article (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      status INTEGER NOT NULL DEFAULT 1,       -- 1上架 0下架
      sort_order INTEGER NOT NULL DEFAULT 0,
      cate_ids TEXT NOT NULL DEFAULT '[]',     -- 所属分类（可多选，第一个为主分类）
      title TEXT NOT NULL,
      thumb TEXT NOT NULL DEFAULT '',          -- 缩略图（与分类图片比例一致 ≤500kb）
      carousel TEXT NOT NULL DEFAULT '[]',     -- 轮播图 750*432 ≤200kb
      update_at TEXT NOT NULL DEFAULT '',      -- 更新时间
      views INTEGER NOT NULL DEFAULT 0,        -- 浏览次数
      intro TEXT NOT NULL DEFAULT '',          -- 文章简介
      detail TEXT NOT NULL DEFAULT '',         -- 文章详情（富文本）
      -- 样式设置
      title_show INTEGER NOT NULL DEFAULT 1,   -- 标题板块 1展示 0隐藏
      time_show INTEGER NOT NULL DEFAULT 1,    -- 时间板块
      poster_bg TEXT NOT NULL DEFAULT '',      -- 海报背景 600*960 底部留空260px
      share_title TEXT NOT NULL DEFAULT '',
      share_img_mode TEXT NOT NULL DEFAULT 'thumb', -- 分享图 缩略图/自定义/小程序转发图
      share_img TEXT NOT NULL DEFAULT '',
      visit_show INTEGER NOT NULL DEFAULT 1,   -- 访问量展示
      like_show INTEGER NOT NULL DEFAULT 1,    -- 点赞量展示
      collect_show INTEGER NOT NULL DEFAULT 1, -- 收藏量展示
      relate_title TEXT NOT NULL DEFAULT '推荐阅读', -- 关联文章显示标题（≤10字）
      relate_ids TEXT NOT NULL DEFAULT '[]',   -- 关联文章（拖动排序）
      show_content TEXT NOT NULL DEFAULT 'goods', -- 高级展示内容 推荐商品
      -- 音视频设置
      videos TEXT NOT NULL DEFAULT '[]',       -- [{url, play_mode}] 点击播放/自动播放
      audio_title TEXT NOT NULL DEFAULT '',
      audio_url TEXT NOT NULL DEFAULT '',
      audio_mode TEXT NOT NULL DEFAULT 'normal',  -- 正常音频/背景音频
      audio_play_mode TEXT NOT NULL DEFAULT 'click', -- 点击播放/自动播放
      audio_play_form TEXT NOT NULL DEFAULT 'once',  -- 单次播放/循环播放
      -- 分销设置
      dist_rule TEXT NOT NULL DEFAULT 'close', -- 关闭/默认设置/单独配置
      -- 高级设置
      recommend INTEGER NOT NULL DEFAULT 0,    -- 设为推荐
      jump_url TEXT NOT NULL DEFAULT '',       -- 直接跳转链接
      comment_mode TEXT NOT NULL DEFAULT 'default', -- 系统默认/本篇关闭/本篇启用
      share_mode TEXT NOT NULL DEFAULT 'default',    -- 文章分享
      share_style TEXT NOT NULL DEFAULT 'popup',     -- 分享样式 弹框展示/底部展示
      points INTEGER NOT NULL DEFAULT 0,       -- 积分数量
      points_limit INTEGER NOT NULL DEFAULT 0, -- 积分限制 次/每天
      -- 付费设置
      pay_amount REAL NOT NULL DEFAULT 0,      -- 付费金额 0或空为不收费
      super_form TEXT NOT NULL DEFAULT '',     -- 超级表单（待接入：红包封面）
      form_show TEXT NOT NULL DEFAULT 'pay',   -- 表单展示 付费展示/直接展示
      files TEXT NOT NULL DEFAULT '[]',        -- 文件下载 [{name,url}]
      file_show TEXT NOT NULL DEFAULT 'pay',   -- 文件展示 付费展示/直接展示
      likes INTEGER NOT NULL DEFAULT 0,
      collects INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_content_article ON content_article(customer_id, status, sort_order);

    -- 文章评论（含视频/音频）
    CREATE TABLE IF NOT EXISTS content_comment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      content_id INTEGER NOT NULL,             -- 文章/视频/音频 id
      content_type TEXT NOT NULL DEFAULT 'article', -- article/video/audio
      title TEXT NOT NULL DEFAULT '',          -- 文章标题冗余
      content TEXT NOT NULL DEFAULT '',
      nickname TEXT NOT NULL DEFAULT '',       -- 评论昵称（C 端）
      is_audit INTEGER NOT NULL DEFAULT 1,     -- 是否审核 1通过 0待审
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_content_comment ON content_comment(customer_id, content_type);

    -- 组图分类
    CREATE TABLE IF NOT EXISTS content_pic_cate (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      pid INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      image TEXT NOT NULL DEFAULT '',          -- 缩略图 350*350 ≤500kb
      intro TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      status INTEGER NOT NULL DEFAULT 1,       -- 1启用 0禁用
      page_size INTEGER NOT NULL DEFAULT 10,   -- 列表每页数量
      plate_style TEXT NOT NULL DEFAULT 'style1', -- 列表板块样式 样式一~四
      share_title TEXT NOT NULL DEFAULT '',
      share_img TEXT NOT NULL DEFAULT '',      -- 5:4 ≤100kb
      member_view INTEGER NOT NULL DEFAULT 0,
      pc_enable INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_content_pic_cate ON content_pic_cate(customer_id, pid);

    -- 组图
    CREATE TABLE IF NOT EXISTS content_pic (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      cate_id INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      show_style TEXT NOT NULL DEFAULT 'single', -- 单列大图/双列瀑布流/三列小图
      thumb TEXT NOT NULL DEFAULT '',          -- 缩略图 750*750 ≤500kb
      images TEXT NOT NULL DEFAULT '[]',       -- 组图 750x1200 ≤500kb（多图）
      sort_order INTEGER NOT NULL DEFAULT 0,
      status INTEGER NOT NULL DEFAULT 1,       -- 1上架 0下架
      recommend INTEGER NOT NULL DEFAULT 0,    -- 设为推荐
      bg_mode INTEGER NOT NULL DEFAULT 0,      -- 组图背景 0关闭 1开启（模糊背景）
      share_points INTEGER NOT NULL DEFAULT 0, -- 分享积分开关
      points INTEGER NOT NULL DEFAULT 0,
      points_limit INTEGER NOT NULL DEFAULT 0,
      share_title TEXT NOT NULL DEFAULT '',
      share_img TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_content_pic ON content_pic(customer_id, cate_id);

    -- 视频
    CREATE TABLE IF NOT EXISTS content_video (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      status INTEGER NOT NULL DEFAULT 1,       -- 1启用 0禁用
      be_online INTEGER NOT NULL DEFAULT 1,    -- 1已上线 0未上线
      sort_order INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      cover TEXT NOT NULL DEFAULT '',          -- 封面图 600x500 ≤100kb
      intro TEXT NOT NULL DEFAULT '',
      video_url TEXT NOT NULL DEFAULT '',      -- 腾讯视频/抖音视频/mp4（<50M）
      recommend INTEGER NOT NULL DEFAULT 0,    -- 设为推荐
      views INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      forwards INTEGER NOT NULL DEFAULT 0,
      share_title TEXT NOT NULL DEFAULT '',
      share_img TEXT NOT NULL DEFAULT '',      -- 5:4 ≤100kb
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_content_video ON content_video(customer_id, be_online);

    -- 内容基础设置（全部文章/全部组图分享 + AI生成/采集配置）
    CREATE TABLE IF NOT EXISTS content_setting (
      customer_id INTEGER PRIMARY KEY,
      article_share_title TEXT NOT NULL DEFAULT '',
      article_share_img TEXT NOT NULL DEFAULT '',
      pic_share_title TEXT NOT NULL DEFAULT '',
      pic_share_img TEXT NOT NULL DEFAULT '',
      ai_enable INTEGER NOT NULL DEFAULT 0,    -- AI生成文章开关（待配置大模型接口）
      ai_api_url TEXT NOT NULL DEFAULT '',     -- 大模型接口地址
      ai_api_key TEXT NOT NULL DEFAULT '',     -- 大模型 API Key
      ai_model TEXT NOT NULL DEFAULT '',
      collect_enable INTEGER NOT NULL DEFAULT 0, -- 文章采集开关
      collect_api_key TEXT NOT NULL DEFAULT '',  -- 采集 API Key
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
