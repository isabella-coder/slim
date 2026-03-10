"""
初始化数据脚本
"""

from app.db import get_db_context
from app.models import Store, Account, Sales, Bot, SalesAllocation


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

        except Exception as e:
            db.rollback()
            print(f"✗ 初始化数据失败: {e}")
            raise
