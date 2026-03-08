-- 从 JSON 迁移用户数据到 PostgreSQL
-- 创建时间：2026-03-08
-- 执行方式：psql -U postgres -d slim -f 002-migrate-users.sql
-- 或：psql -U postgres -d slim < 002-migrate-users.sql

-- ============================================================================
-- 备份现有用户数据（可选）
-- ============================================================================
-- BEGIN;
-- CREATE TABLE IF NOT EXISTS users_backup_20260308 AS SELECT * FROM users;

-- ============================================================================
-- 迁移用户数据
-- ============================================================================
-- 从 admin-console/data/users.json copy 这部分数据

-- 示例数据（来自项目的 ensure_seed_files）
-- 生产环境请替换为真实的 password_hash；不要在 SQL 中提交明文密码。
INSERT INTO users (username, name, role, password_hash, status, payload, created_at, updated_at)
VALUES 
  ('manager', '店长', 'manager', '<REPLACE_WITH_HASH>', 'active', '{"username":"manager","name":"店长","role":"manager","password":"<CHANGE_ME>"}'::jsonb, NOW(), NOW()),
  ('salesa', '销售A', 'sales', '<REPLACE_WITH_HASH>', 'active', '{"username":"salesa","name":"销售A","role":"sales","password":"<CHANGE_ME>"}'::jsonb, NOW(), NOW()),
  ('salesb', '销售B', 'sales', '<REPLACE_WITH_HASH>', 'active', '{"username":"salesb","name":"销售B","role":"sales","password":"<CHANGE_ME>"}'::jsonb, NOW(), NOW()),
  ('techa', '技师A', 'technician', '<REPLACE_WITH_HASH>', 'active', '{"username":"techa","name":"技师A","role":"technician","password":"<CHANGE_ME>"}'::jsonb, NOW(), NOW())
ON CONFLICT (username) DO UPDATE SET 
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  password_hash = EXCLUDED.password_hash,
  status = EXCLUDED.status,
  payload = EXCLUDED.payload,
  updated_at = EXCLUDED.updated_at;

-- ============================================================================
-- 验证导入结果
-- ============================================================================
SELECT 
  '用户迁移完成' as message,
  COUNT(*) as user_count,
  COUNT(DISTINCT role) as role_types
FROM users;

-- ============================================================================
-- 统计信息
-- ============================================================================
SELECT 
  role,
  COUNT(*) as count
FROM users
GROUP BY role
ORDER BY role;

-- COMMIT;
