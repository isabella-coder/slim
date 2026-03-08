#!/usr/bin/env python3
"""初始化 PostgreSQL 数据库表结构"""

import psycopg
import sys
from pathlib import Path

# PostgreSQL 连接参数
POSTGRES_HOST = "127.0.0.1"
POSTGRES_PORT = 5432
POSTGRES_DB = "slim"
POSTGRES_USER = "postgres"
POSTGRES_PASSWORD = "postgres"

# SQL 脚本文件
SQL_SCRIPT = Path(__file__).parent / "001-init-schema.sql"

def main():
    print("🚀 初始化 PostgreSQL 数据库...")
    
    # 1. 连接到 postgres 数据库以创建 slim
    try:
        print("▶ 连接 PostgreSQL...")
        conn = psycopg.connect(
            f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/postgres"
        )
        conn.autocommit = True
        cursor = conn.cursor()
    except Exception as e:
        print(f"✗ 连接失败: {e}")
        return 1
    
    # 2. 创建数据库
    try:
        print("▶ 创建数据库 'slim'...")
        cursor.execute("DROP DATABASE IF EXISTS slim")
        cursor.execute("CREATE DATABASE slim")
        print("✓ 数据库已创建")
    except Exception as e:
        print(f"⚠ 创建数据库出错 (可能已存在): {e}")
    finally:
        cursor.close()
        conn.close()
    
    # 3. 连接到 slim 数据库，执行初始化脚本
    try:
        print("▶ 连接数据库 'slim'...")
        conn = psycopg.connect(
            f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
        )
        conn.autocommit = True
        cursor = conn.cursor()
    except Exception as e:
        print(f"✗ 连接数据库失败: {e}")
        return 1
    
    # 4. 读取和执行 SQL 脚本
    try:
        if not SQL_SCRIPT.exists():
            print(f"✗ SQL 脚本不存在: {SQL_SCRIPT}")
            return 1
        
        print(f"▶ 执行 SQL 脚本: {SQL_SCRIPT.name}...")
        sql_content = SQL_SCRIPT.read_text(encoding='utf-8')
        
        # 分割 SQL 语句（简单的方式，不处理 -- 注释）
        statements = sql_content.split(';')
        
        count = 0
        for statement in statements:
            stmt = statement.strip()
            if stmt:
                try:
                    cursor.execute(stmt)
                    count += 1
                except Exception as e:
                    print(f"⚠ SQL 执行出错: {e}")
                    print(f"  语句: {stmt[:100]}...")
        
        print(f"✓ 执行了 {count} 个 SQL 语句")
    except Exception as e:
        print(f"✗ 脚本执行失败: {e}")
        return 1
    finally:
        cursor.close()
        conn.close()
    
    print("\n✅ 数据库初始化完成！")
    return 0

if __name__ == '__main__':
    sys.exit(main())
