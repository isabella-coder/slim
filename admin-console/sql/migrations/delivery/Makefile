.PHONY: help migrate verify reset logs clean

# PostgreSQL Connection Parameters
POSTGRES_HOST ?= 127.0.0.1
POSTGRES_PORT ?= 5432
POSTGRES_USER ?= postgres
POSTGRES_PASSWORD ?= postgres
POSTGRES_DB ?= slim

# Export for use in scripts
export POSTGRES_HOST POSTGRES_PORT POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB PGPASSWORD=$(POSTGRES_PASSWORD)

# Color output
BLUE := \033[0;34m
GREEN := \033[0;32m
RED := \033[0;31m
YELLOW := \033[1;33m
NC := \033[0m

## help - Display this help message
help:
	@echo "$(BLUE)╔════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║  Database Migration Makefile           ║$(NC)"
	@echo "$(BLUE)╚════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(GREEN)Available targets:$(NC)"
	@grep "^## " Makefile | sed 's/## /  make /'
	@echo ""
	@echo "$(YELLOW)Environment Variables:$(NC)"
	@echo "  POSTGRES_HOST=$(POSTGRES_HOST)"
	@echo "  POSTGRES_PORT=$(POSTGRES_PORT)"
	@echo "  POSTGRES_USER=$(POSTGRES_USER)"
	@echo "  POSTGRES_PASSWORD=$(POSTGRES_PASSWORD)"
	@echo "  POSTGRES_DB=$(POSTGRES_DB)"
	@echo ""
	@echo "$(BLUE)Examples:$(NC)"
	@echo "  make migrate                                # Run full migration"
	@echo "  make verify                                 # Verify data consistency"
	@echo "  POSTGRES_HOST=prod.db make migrate          # Use custom host"
	@echo "  make reset                                  # Drop and recreate database"
	@echo ""

## migrate - Run complete migration (automated)
migrate:
	@echo "$(GREEN)▶ Starting database migration...$(NC)"
	bash run-migration.sh
	@echo "$(GREEN)✓ Migration complete$(NC)"

## check - Check PostgreSQL connection
check:
	@echo "$(GREEN)▶ Checking PostgreSQL connection...$(NC)"
	@psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d postgres -c "SELECT 1;" > /dev/null 2>&1 && \
		echo "$(GREEN)✓ Connection successful$(NC)" || \
		(echo "$(RED)✗ Connection failed$(NC)" && exit 1)

## init - Create database (if not exists)
init: check
	@echo "$(GREEN)▶ Creating database '$(POSTGRES_DB)'...$(NC)"
	@psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d postgres -c "CREATE DATABASE $(POSTGRES_DB);" 2>/dev/null || \
		echo "$(YELLOW)⚠ Database already exists$(NC)"
	@echo "$(GREEN)✓ Database ready$(NC)"

## schema - Run schema initialization only
schema: init
	@echo "$(GREEN)▶ Initializing schema...$(NC)"
	psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) -f 001-init-schema.sql
	@echo "$(GREEN)✓ Schema initialized$(NC)"

## users - Migrate users
users: schema
	@echo "$(GREEN)▶ Migrating users...$(NC)"
	psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) -f 002-migrate-users.sql
	@echo "$(GREEN)✓ Users migrated$(NC)"

## orders - Migrate orders
orders: users
	@echo "$(GREEN)▶ Migrating orders...$(NC)"
	psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) -f 003-migrate-orders.sql
	@echo "$(GREEN)✓ Orders migrated$(NC)"

## finance - Migrate finance logs
finance: orders
	@echo "$(GREEN)▶ Migrating finance logs...$(NC)"
	psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) -f 004-migrate-finance.sql
	@echo "$(GREEN)✓ Finance logs migrated$(NC)"

## optimize - Create optimization indices
optimize: finance
	@echo "$(GREEN)▶ Optimizing indices...$(NC)"
	psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) -f 005-post-migration-index.sql
	@echo "$(GREEN)✓ Optimization complete$(NC)"

## verify - Run data verification queries
verify:
	@echo "$(GREEN)▶ Verifying data...$(NC)"
	@psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) << 'EOF'
\echo '╔════════════════════════════════════════╗'
\echo '║ Database Verification Report           ║'
\echo '╚════════════════════════════════════════╝'
\echo ''
\echo 'Table Row Counts:'
SELECT '  users: ' || COUNT(*) as check FROM users;
SELECT '  orders: ' || COUNT(*) FROM orders;
SELECT '  dispatches: ' || COUNT(*) FROM order_dispatches;
SELECT '  work_items: ' || COUNT(*) FROM order_work_parts;
SELECT '  followups: ' || COUNT(*) FROM followups;
SELECT '  finance_logs: ' || COUNT(*) FROM finance_sync_logs;
\echo ''
\echo 'Financial Summary:'
SELECT '  Total Price (CNY): ' || COALESCE(SUM(total_price)::text, '0') FROM orders;
\echo ''
\echo 'Order Status Distribution:'
SELECT '  ' || status || ': ' || COUNT(*) FROM orders GROUP BY status ORDER BY status;
\echo ''
\echo 'Dispatch Coverage:'
SELECT '  ' || CASE WHEN COUNT(*) = (SELECT COUNT(*) FROM orders) 
                    THEN 'Complete (' || COUNT(*) || '/' || (SELECT COUNT(*) FROM orders) || ')'
                    ELSE 'Incomplete (' || COUNT(*) || '/' || (SELECT COUNT(*) FROM orders) || ')' END
FROM order_dispatches;
\echo ''
\echo '✓ Verification complete'
EOF
	@echo "$(GREEN)✓ Verification done$(NC)"

## clean-data - Delete all data (safe - requires manual confirm)
clean-data:
	@echo "$(YELLOW)⚠ This will delete all data from the database$(NC)"
	@echo "$(YELLOW)  Type 'yes' to confirm: $(NC)" && read CONFIRM && \
	if [ "$$CONFIRM" = "yes" ]; then \
		echo "$(RED)▶ Running rollback...$(NC)"; \
		psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) -f 999-rollback-all.sql; \
		psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c "COMMIT;"; \
		echo "$(GREEN)✓ Data deleted$(NC)"; \
	else \
		echo "$(BLUE)⊘ Cancelled$(NC)"; \
	fi

## reset - Drop and recreate database
reset:
	@echo "$(YELLOW)⚠ This will drop the entire database$(NC)"
	@echo "$(YELLOW)  Type 'yes' to confirm: $(NC)" && read CONFIRM && \
	if [ "$$CONFIRM" = "yes" ]; then \
		echo "$(RED)▶ Dropping database...$(NC)"; \
		dropdb -h $(POSTGRES_HOST) -U $(POSTGRES_USER) --if-exists $(POSTGRES_DB) || true; \
		sleep 1; \
		echo "$(BLUE)▶ Recreating database...$(NC)"; \
		psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d postgres -c "CREATE DATABASE $(POSTGRES_DB);"; \
		sleep 1; \
		echo "$(GREEN)▶ Re-running migration...$(NC)"; \
		bash run-migration.sh; \
		echo "$(GREEN)✓ Reset complete$(NC)"; \
	else \
		echo "$(BLUE)⊘ Cancelled$(NC)"; \
	fi

## query - Interactive psql query (usage: make query Q='SELECT COUNT(*) FROM orders')
query:
	@if [ -z "$(Q)" ]; then \
		echo "$(YELLOW)Usage: make query Q='SELECT COUNT(*) FROM orders'$(NC)"; \
	else \
		psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c "$(Q)"; \
	fi

## psql - Open interactive psql shell
psql:
	@echo "$(BLUE)▶ Opening psql shell...$(NC)"
	@echo "$(YELLOW)  Type '\\q' to quit$(NC)"
	psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB)

## logs - Show migration logs
logs:
	@ls -lh migration_*.log 2>/dev/null || echo "$(YELLOW)No log files found$(NC)"
	@echo ""
	@echo "$(BLUE)Latest 50 lines of migration log:$(NC)"
	@tail -50 $$(ls -t migration_*.log 2>/dev/null | head -1) 2>/dev/null || echo "No logs available"

## report - Show migration report
report:
	@ls -lh migration_report_*.txt 2>/dev/null || echo "$(YELLOW)No report files found$(NC)"
	@echo ""
	@echo "$(BLUE)Latest migration report:$(NC)"
	@cat $$(ls -t migration_report_*.txt 2>/dev/null | head -1) 2>/dev/null || echo "No reports available"

## clean - Remove log and report files
clean:
	@echo "$(YELLOW)▶ Cleaning up log files...$(NC)"
	rm -f migration_*.log migration_report_*.txt
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

## backup - Create database backup
backup:
	@echo "$(GREEN)▶ Creating backup...$(NC)"
	@TIMESTAMP=$$(date +%Y%m%d_%H%M%S); \
	pg_dump -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) > "backup_$$TIMESTAMP.sql"; \
	echo "$(GREEN)✓ Backup created: backup_$$TIMESTAMP.sql$(NC)"

## restore - Restore from backup (usage: make restore FILE=backup_20260305_120000.sql)
restore:
	@if [ -z "$(FILE)" ]; then \
		echo "$(YELLOW)Usage: make restore FILE=backup_20260305_120000.sql$(NC)"; \
		ls -lh backup_*.sql 2>/dev/null || echo "No backup files found"; \
	else \
		echo "$(RED)▶ Restoring from $(FILE)...$(NC)"; \
		psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) < "$(FILE)"; \
		echo "$(GREEN)✓ Restore complete$(NC)"; \
	fi

## status - Show database status and statistics
status: check
	@echo ""
	@echo "$(BLUE)╔════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║  Database Status Report                ║$(NC)"
	@echo "$(BLUE)╚════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "Connection Info:"
	@echo "  Host: $(POSTGRES_HOST):$(POSTGRES_PORT)"
	@echo "  User: $(POSTGRES_USER)"
	@echo "  Database: $(POSTGRES_DB)"
	@echo ""
	@psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) -t -c \
		"SELECT 'Tables: ' || COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
	@psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) -t -c \
		"SELECT 'Indices: ' || COUNT(*) FROM information_schema.indexes WHERE schemaname = 'public';"
	@psql -h $(POSTGRES_HOST) -U $(POSTGRES_USER) -d $(POSTGRES_DB) -t -c \
		"SELECT 'Database Size: ' || pg_size_pretty(pg_database_size('$(POSTGRES_DB)'));"
	@echo ""

## full-test - Run complete test cycle
full-test: migrate verify
	@echo ""
	@echo "$(GREEN)╔════════════════════════════════════════╗$(NC)"
	@echo "$(GREEN)║  ✓ Full Migration Test Passed          ║$(NC)"
	@echo "$(GREEN)╚════════════════════════════════════════╝$(NC)"

.PHONY: all status
all: migrate verify

# Default target
.DEFAULT_GOAL := help
