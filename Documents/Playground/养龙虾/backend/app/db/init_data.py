"""
初始化数据脚本
"""

import json
from datetime import datetime
from pathlib import Path
import hashlib
import uuid

from app.db import get_db_context
from app.models import Store, Account, Sales, Bot, SalesAllocation, StoreUser, StoreOrder


PASSWORD_HASH_ALGO = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 260000
def _normalize_text(value) -> str:
    return str(value or "").strip()


def _is_password_hash(value: str) -> bool:
    text = _normalize_text(value)
    if not text.startswith(f"{PASSWORD_HASH_ALGO}$"):
        return False
    parts = text.split("$")
    if len(parts) != 4:
        return False
    if not parts[1].isdigit():
        return False
    return bool(parts[2] and parts[3])


def _hash_password(password: str) -> str:
    secret = _normalize_text(password)
    if not secret:
        return ""
    salt = uuid.uuid4().hex
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt.encode("utf-8"), PASSWORD_HASH_ITERATIONS)
    return f"{PASSWORD_HASH_ALGO}${PASSWORD_HASH_ITERATIONS}${salt}${digest.hex()}"


def _parse_datetime_text(value: str):
    source = _normalize_text(value)
    if not source:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M", "%Y/%m/%d"):
        try:
            return datetime.strptime(source, fmt)
        except ValueError:
            continue
    return None


def _load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _legacy_data_dir() -> Path:
    project_root = Path(__file__).resolve().parents[3]
    return project_root / "car-film-mini-program" / "admin-console" / "data"


def _seed_store_users(db):
    if db.query(StoreUser).count() > 0:
        print("✓ 经营账号已存在，跳过初始化")
        return

    data_dir = _legacy_data_dir()
    users = _load_json(data_dir / "users.json", [])
    if not isinstance(users, list):
        users = []

    inserted = 0
    for item in users:
        if not isinstance(item, dict):
            continue

        username = _normalize_text(item.get("username"))
        if not username:
            continue

        role = _normalize_text(item.get("role")).lower() or "sales"
        name = _normalize_text(item.get("name")) or username
        store_code = _normalize_text(item.get("store")).upper()

        raw_secret = _normalize_text(item.get("passwordHash")) or _normalize_text(item.get("password"))
        if not raw_secret:
            continue
        if not _is_password_hash(raw_secret):
            raw_secret = _hash_password(raw_secret)

        row = StoreUser(
            username=username,
            name=name,
            role=role,
            store_code=store_code,
            password_hash=raw_secret,
            is_active=True,
        )
        db.add(row)
        inserted += 1

    if inserted == 0:
        fallback = [
            StoreUser(
                username="manager_yushuai",
                name="余帅",
                role="manager",
                store_code="",
                password_hash=_hash_password("admin123"),
                is_active=True,
            )
        ]
        for row in fallback:
            db.add(row)
        inserted = len(fallback)

    db.commit()
    print(f"✓ 经营账号初始化完成 ({inserted} 条)")


def _seed_store_orders(db):
    if db.query(StoreOrder).count() > 0:
        print("✓ 经营订单已存在，跳过初始化")
        return

    data_dir = _legacy_data_dir()
    orders = _load_json(data_dir / "orders.json", [])
    if not isinstance(orders, list):
        orders = []

    inserted = 0
    for item in orders:
        if not isinstance(item, dict):
            continue

        payload = dict(item)
        order_id = _normalize_text(payload.get("id"))
        if not order_id:
            continue

        try:
            version = int(payload.get("version") or 0)
        except (TypeError, ValueError):
            version = 0

        status = _normalize_text(payload.get("status")) or "未完工"
        created_at_text = _normalize_text(payload.get("createdAt"))
        updated_at_text = _normalize_text(payload.get("updatedAt")) or created_at_text
        created_at_dt = _parse_datetime_text(created_at_text) or datetime.utcnow()
        updated_at_dt = _parse_datetime_text(updated_at_text) or created_at_dt

        payload["id"] = order_id
        payload["status"] = status
        payload["version"] = max(0, version)
        payload["createdAt"] = created_at_text or created_at_dt.strftime("%Y-%m-%d %H:%M")
        payload["updatedAt"] = updated_at_text or updated_at_dt.strftime("%Y-%m-%d %H:%M")

        row = StoreOrder(
            order_id=order_id,
            status=status,
            version=max(0, version),
            store_name=_normalize_text(payload.get("store")),
            sales_brand_text=_normalize_text(payload.get("salesBrandText")),
            customer_name=_normalize_text(payload.get("customerName")),
            phone=_normalize_text(payload.get("phone")),
            car_model=_normalize_text(payload.get("carModel")),
            lead_source=_normalize_text(payload.get("leadSource")),
            lead_grade=_normalize_text(payload.get("leadGrade")).upper(),
            lead_status=_normalize_text(payload.get("leadStatus")),
            created_at_text=payload.get("createdAt"),
            updated_at_text=payload.get("updatedAt"),
            created_at_dt=created_at_dt,
            updated_at_dt=updated_at_dt,
            payload=payload,
        )
        db.add(row)
        inserted += 1

    db.commit()
    print(f"✓ 经营订单初始化完成 ({inserted} 条)")


def init_data():
    """初始化系统数据"""
    with get_db_context() as db:
        try:
            # 1. 创建门店
            stores = [
                Store(
                    store_code="BOP",
                    store_name="BOP 保镖隐形车衣店",
                    address="绥德路555号",
                    region="杨浦区",
                    main_service="车衣、隐形车衣、漆面保护",
                    wechat_group_id="wecom_bop_group",
                ),
                Store(
                    store_code="LM",
                    store_name="龙膜专营店",
                    address="杨浦区",
                    region="杨浦区",
                    main_service="龙膜、玻璃膜、隐热膜、窗膜",
                    wechat_group_id="wecom_lm_group",
                ),
            ]

            for store in stores:
                if not db.query(Store).filter(Store.store_code == store.store_code).first():
                    db.add(store)
            db.commit()
            print("✓ 门店初始化完成")

            # 2. 创建销售（与蔚蓝 users.json 中 sales 用户对齐）
            sales_list = [
                Sales(sales_id="sales_mengao", sales_name="孟傲", store_code="BOP"),
                Sales(sales_id="sales_tianjiajia", sales_name="田佳佳", store_code="BOP"),
                Sales(sales_id="sales_zhoushilei", sales_name="周石磊", store_code="BOP"),
                Sales(sales_id="sales_cuitingting", sales_name="崔庭廷", store_code="BOP"),
                Sales(sales_id="sales_weipeng", sales_name="魏鹏", store_code="LM"),
                Sales(sales_id="sales_libochao", sales_name="李博超", store_code="LM"),
            ]

            for sales in sales_list:
                if not db.query(Sales).filter(Sales.sales_id == sales.sales_id).first():
                    db.add(sales)
            db.commit()
            print("✓ 销售初始化完成")

            # 3. 创建机器人
            bots = [
                Bot(bot_instance_id="Bot-DY-BOP", platform="douyin", store_code="BOP",
                    bot_name="抖音BOP智能助手", personality_style="direct",
                    system_prompt="你是BOP保镖隐形车衣店的顾问..."),
                Bot(bot_instance_id="Bot-DY-LM", platform="douyin", store_code="LM",
                    bot_name="抖音龙膜智能助手", personality_style="direct",
                    system_prompt="你是龙膜专营店的顾问..."),
                Bot(bot_instance_id="Bot-XHS-BOP", platform="xiaohongshu", store_code="BOP",
                    bot_name="小红书BOP助手", personality_style="lifestyle",
                    system_prompt="你是BOP的生活方式顾问..."),
                Bot(bot_instance_id="Bot-XHS-LM", platform="xiaohongshu", store_code="LM",
                    bot_name="小红书龙膜助手", personality_style="lifestyle",
                    system_prompt="你是龙膜的贴心顾问..."),
            ]

            for bot in bots:
                if not db.query(Bot).filter(Bot.bot_instance_id == bot.bot_instance_id).first():
                    db.add(bot)
            db.commit()
            print("✓ 机器人初始化完成")

            # 4. 创建账号
            accounts = [
                Account(account_code="DY-BOP-001", platform="douyin", source_channel="live",
                        account_name="抖音直播BOP", store_code="BOP", bot_instance_id="Bot-DY-BOP"),
                Account(account_code="DY-LM-001", platform="douyin", source_channel="live",
                        account_name="抖音直播龙膜", store_code="LM", bot_instance_id="Bot-DY-LM"),
                Account(account_code="XHS-BOP-001", platform="xiaohongshu", source_channel="natural",
                        account_name="小红书BOP", store_code="BOP", bot_instance_id="Bot-XHS-BOP"),
                Account(account_code="XHS-LM-001", platform="xiaohongshu", source_channel="natural",
                        account_name="小红书龙膜", store_code="LM", bot_instance_id="Bot-XHS-LM"),
            ]

            for account in accounts:
                if not db.query(Account).filter(Account.account_code == account.account_code).first():
                    db.add(account)
            db.commit()
            print("✓ 账号初始化完成")

            # 5. 创建轮转指针
            allocations = [
                SalesAllocation(allocation_id="BOP-ROTATION", store_code="BOP", current_sales_index=0),
                SalesAllocation(allocation_id="LM-ROTATION", store_code="LM", current_sales_index=0),
            ]

            for allocation in allocations:
                if not db.query(SalesAllocation).filter(SalesAllocation.allocation_id == allocation.allocation_id).first():
                    db.add(allocation)
            db.commit()
            print("✓ 轮转指针初始化完成")

            # 6. 初始化经营系统统一数据（替代 8080 JSON）
            _seed_store_users(db)
            _seed_store_orders(db)

        except Exception as e:
            db.rollback()
            print(f"✗ 初始化数据失败: {e}")
            raise
