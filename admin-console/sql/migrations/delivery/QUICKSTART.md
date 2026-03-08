# Database Migration Quick Start Card

## 🚀 Quick Commands

### Automatic (Recommended)
```bash
cd admin-console/sql/migrations/delivery
bash run-migration.sh
```

### Manual Step-by-Step
```bash
# Create database
psql -U postgres -c "CREATE DATABASE slim;"

# Run scripts in order
psql -U postgres -d slim -f 001-init-schema.sql
psql -U postgres -d slim -f 002-migrate-users.sql
psql -U postgres -d slim -f 003-migrate-orders.sql
psql -U postgres -d slim -f 004-migrate-finance.sql
psql -U postgres -d slim -f 005-post-migration-index.sql
```

## 📊 Verification Queries

After migration, verify with these commands:

```bash
psql -U postgres -d slim << EOF
-- Table row counts
SELECT 'users' as table_name, COUNT(*) as row_count FROM users;
SELECT 'orders', COUNT(*) FROM orders;
SELECT 'dispatches', COUNT(*) FROM order_dispatches;
SELECT 'work_items', COUNT(*) FROM order_work_parts;
SELECT 'followups', COUNT(*) FROM followups;
SELECT 'finance_logs', COUNT(*) FROM finance_sync_logs;

-- Total amount
SELECT 'Total Amount (CNY): ' || SUM(total_price) FROM orders;

-- Status distribution
SELECT status, COUNT(*) as count FROM orders GROUP BY status;
EOF
```

## ✅ Expected Results

| Metric | Expected Value | Actual |
|--------|---|---|
| Total Users | 4 | |
| Total Orders | 3 | |
| Completed Orders | 1 | |
| In-Progress Orders | 2 | |
| Total Price | 21,560 CNY | |
| Dispatch Coverage | 100% | |
| Finance Logs | 12 | |

## 🔧 Configuration

### Default Connection Parameters
- Host: `127.0.0.1`
- Port: `5432`
- User: `postgres`
- Password: `postgres`
- Database: `slim`

### Override via Environment Variables
```bash
POSTGRES_HOST=192.168.1.100 \
POSTGRES_PORT=5433 \
POSTGRES_USER=admin \
POSTGRES_PASSWORD=secret \
bash run-migration.sh
```

## 📋 Files Overview

| File | Purpose | Time |
|------|---------|------|
| 001-init-schema.sql | Create 8 tables + 15 indices | ~2s |
| 002-migrate-users.sql | Seed 4 users | ~1s |
| 003-migrate-orders.sql | Migrate 3 orders + related data | ~2s |
| 004-migrate-finance.sql | Migrate 12 finance logs | ~1s |
| 005-post-migration-index.sql | Create additional indices + perf tests | ~3s |
| 999-rollback-all.sql | ⚠️ Safe data cleanup (manual confirm) | ~1s |
| run-migration.sh | Automated orchestration script | ~10s |

**Total Execution Time**: ~10-15 seconds for complete migration

## 🔍 PostgreSQL Connection

### Start PostgreSQL

**Using Docker** (Recommended):
```bash
bash docker-postgres-start.sh
```

**Using Homebrew** (Mac):
```bash
brew install postgresql@15
brew services start postgresql@15
```

### Connect to Database
```bash
# Interactive shell
psql -U postgres -d slim

# Run single query
psql -U postgres -d slim -c "SELECT COUNT(*) FROM orders;"
```

## 🚨 Troubleshooting

### "FATAL: authentication failed"
```bash
# Set password via environment
export PGPASSWORD=postgres
bash run-migration.sh
```

### "database 'slim' already exists"
```bash
# Drop existing database
dropdb slim
bash run-migration.sh
```

### "relation does not exist"
```bash
# Ensure scripts run in correct order
# 001 → 002 → 003 → 004 → 005
```

### "connection refused"
```bash
# Check if PostgreSQL is running
pg_isready -h 127.0.0.1 -p 5432

# If not running, start it
#   - Docker: bash docker-postgres-start.sh
#   - Homebrew: brew services start postgresql@15
```

## 📝 Logs and Reports

After running `run-migration.sh`, check:

```bash
# Migration log (detailed SQL execution)
cat migration_*.log

# Migration report (summary statistics)
cat migration_report_*.txt
```

## 🔐 Cleanup and Rollback

### Delete All Data (Safe - requires manual confirm)
```bash
# View what will be deleted (no commit)
psql -U postgres -d slim -f 999-rollback-all.sql

# Confirm deletion
psql -U postgres -d slim -c "COMMIT;"

# Or rollback
psql -U postgres -d slim -c "ROLLBACK;"
```

### Complete Database Reset
```bash
# Drop and recreate database
dropdb slim
psql -U postgres -c "CREATE DATABASE slim;"
bash run-migration.sh
```

## 📚 Additional Resources

- Detailed guide: `README-ZH.md` (Chinese) or `README-EN.md` (English)
- Migration report: `MIGRATION_REPORT.md` (expectations, risks, validation)
- Docker script: `docker-postgres-start.sh` (PostgreSQL container setup)
- Rollback guide: `999-rollback-all.sql` (safe data cleanup)

## 🔗 Backend Integration

After migration, update `server.py`:

```python
# 1. Initialize database with schema
init_database_if_needed()

# 2. Load orders from PostgreSQL
orders = load_orders_from_db()

# 3. Implement dual-write (Week 2)
save_orders_to_db(orders)  # Write to PostgreSQL
save_json_orders(orders)   # Also write to JSON (temporary)

# 4. Verify consistency
reconcile_db_vs_json()
```

---

**Created**: March 2026  
**Status**: Ready for production migration  
**Estimated Total Time**: 10-15 minutes (including PostgreSQL startup)
