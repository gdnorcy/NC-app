-- =====================================================================
-- 清理历史遗留分销 / 股东测试数据（tenant_id = 1）
-- 背景（2026-10-26 排查结论）：
--   1) server/src 当前代码不写入 dist_share_all / dist_share_cat / dist_partner
--      这三张表，其数据全为 2026-09-08 测试期手动注入；
--   2) distribution_commission 整张表为空 → 所有「佣金」实为 dist_wallet
--      中无流水支撑的孤立余额；
--   3) user 5 昵称即「#小程序:优选大搜罗」，2026-10-21 扫码注册，
--      复用了 09-08 测试期的自增 ID，继承了那笔类目股东数据。
-- 范围（已与用户确认：身份 + 钱包全清）：
--   A 类：4 行股东/合伙人身份（无资金风险，清后不复发）
--   B 类：5 条钱包余额归零（无源）→ 林平可提现 56 元等消失
-- 注：dist_user_relation（真实上下级绑定）不动；distribution_commission 空表不动。
-- =====================================================================

-- 0) 先备份（在 sqlite3 外执行，或放开注释用 .shell）：
--    cp data/panorama.db data/panorama.db.bak_20261026_distclean

BEGIN;

-- ---------- A 类：股东 / 合伙人身份（tenant_id = 1）----------
-- 林平：全民股东
DELETE FROM dist_share_all WHERE user_id = 4 AND tenant_id = 1;
-- 优选大搜罗：类目股东（互联网/SaaS）
DELETE FROM dist_share_cat WHERE user_id = 5 AND tenant_id = 1;
-- 林小雨 / 张明：团队 / 全局分红股东
DELETE FROM dist_partner WHERE user_id IN (2, 3) AND tenant_id = 1;

-- ---------- B 类：钱包孤立余额归零（user 2/3/4/5/6）----------
UPDATE dist_wallet
   SET available = 0, wait_settle = 0, total_income = 0, total_withdraw = 0
 WHERE id IN (8, 9, 11, 12, 13);

-- ---------- 清 user 2 无源提现记录（保持与钱包余额自洽）----------
DELETE FROM dist_withdraw WHERE user_id = 2;

COMMIT;

-- =====================================================================
-- 验证：应全部为 0 / 余额归零
-- =====================================================================
SELECT 'dist_share_all(user4)'  AS tbl, count(*) AS remain FROM dist_share_all WHERE user_id = 4;
SELECT 'dist_share_cat(user5)'  AS tbl, count(*) AS remain FROM dist_share_cat WHERE user_id = 5;
SELECT 'dist_partner(2,3)'      AS tbl, count(*) AS remain FROM dist_partner WHERE user_id IN (2, 3);
SELECT id, available, total_income, total_withdraw
  FROM dist_wallet WHERE id IN (8, 9, 11, 12, 13);
SELECT 'dist_withdraw(user2)'   AS tbl, count(*) AS remain FROM dist_withdraw WHERE user_id = 2;
