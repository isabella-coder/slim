#!/usr/bin/env python3
"""
多轮对话模拟测试脚本
用法:
  python3 test_chat.py              # 交互式对话（手动输入）
  python3 test_chat.py --auto       # 自动模拟一段完整客户对话
  python3 test_chat.py --auto --account DY-LM-001  # 测试龙膜店

前提: 后端已启动 (python3 -m uvicorn app.main:app --reload)
"""

import argparse
import httpx
import sys

BASE_URL = "http://localhost:8000/api/v1"

# ───── 自动模拟对话（模拟一个真实客户）─────

AUTO_MESSAGES = [
    "你好，想了解一下贴膜",
    "我的车是宝马X5，想贴个隐形车衣",
    "大概什么价位啊？",
    "预算 1 万左右吧，叫我老王就行",
    "你们店在哪里？可以加微信详细聊吗",
]


def chat(message: str, platform: str, account_code: str, open_id: str) -> dict:
    """发送一条消息到测试接口"""
    resp = httpx.post(
        f"{BASE_URL}/chat/test",
        json={
            "platform": platform,
            "account_code": account_code,
            "open_id": open_id,
            "message": message,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def print_result(result: dict, turn: int):
    """格式化打印结果"""
    print(f"\n{'─' * 50}")
    print(f"🤖 AI 回复: {result['reply']}")
    print(f"📋 已提取信息: {result['extracted_info']}")
    print(f"✅ 信息充足: {result['info_sufficient']}")
    if result.get("lead_created"):
        print(f"🎉 线索已创建! lead_id = {result['lead_id']}")
    print(f"{'─' * 50}")


def run_auto(platform: str, account_code: str, open_id: str):
    """自动执行预设对话"""
    print(f"\n🚀 自动模拟对话 (平台={platform}, 账号={account_code}, 用户={open_id})\n")

    for i, msg in enumerate(AUTO_MESSAGES, 1):
        print(f"\n👤 客户 [{i}/{len(AUTO_MESSAGES)}]: {msg}")
        try:
            result = chat(msg, platform, account_code, open_id)
            print_result(result, i)
        except httpx.ConnectError:
            print("❌ 连接失败！请先启动后端: cd backend && uvicorn app.main:app --reload")
            sys.exit(1)
        except Exception as e:
            print(f"❌ 请求失败: {e}")
            sys.exit(1)

    print("\n✅ 自动对话完成！")


def run_interactive(platform: str, account_code: str, open_id: str):
    """交互式对话"""
    print(f"\n💬 交互式对话 (平台={platform}, 账号={account_code})")
    print("输入消息后回车发送，输入 q 退出\n")

    turn = 0
    while True:
        msg = input("👤 你: ").strip()
        if not msg or msg.lower() == "q":
            print("👋 再见！")
            break

        turn += 1
        try:
            result = chat(msg, platform, account_code, open_id)
            print_result(result, turn)
        except httpx.ConnectError:
            print("❌ 连接失败！请先启动后端: cd backend && uvicorn app.main:app --reload")
            sys.exit(1)
        except Exception as e:
            print(f"❌ 请求失败: {e}")


def main():
    parser = argparse.ArgumentParser(description="AI 客服多轮对话测试")
    parser.add_argument("--auto", action="store_true", help="自动模拟完整对话")
    parser.add_argument("--platform", default="douyin", help="平台 (默认 douyin)")
    parser.add_argument("--account", default="DY-BOP-001", help="账号编码 (默认 DY-BOP-001)")
    parser.add_argument("--user", default="test_user_001", help="模拟用户 ID")
    parser.add_argument("--url", default=None, help="后端地址 (默认 http://localhost:8000/api/v1)")
    args = parser.parse_args()

    if args.url:
        global BASE_URL
        BASE_URL = args.url.rstrip("/")

    if args.auto:
        run_auto(args.platform, args.account, args.user)
    else:
        run_interactive(args.platform, args.account, args.user)


if __name__ == "__main__":
    main()
