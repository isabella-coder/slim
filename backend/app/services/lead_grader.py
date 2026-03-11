"""
客户质量分级服务
根据 AI 收集到的信息评估客户意向等级: S / A / B / C

S级: 高预算 + 明确车型 + 明确需求 → 最优先跟进
A级: 有车型 + 有需求 + 有预算 → 优先跟进
B级: 有车型 + 有需求，预算不明 → 正常跟进
C级: 只有部分信息 → 低优先级
"""
from __future__ import annotations


# 高端品牌列表（更容易成交高客单价）
PREMIUM_BRANDS = {
    "保时捷", "porsche", "奔驰", "benz", "mercedes", "宝马", "bmw",
    "奥迪", "audi", "路虎", "land rover", "雷克萨斯", "lexus",
    "沃尔沃", "volvo", "凯迪拉克", "cadillac", "林肯", "lincoln",
    "蔚来", "nio", "理想", "lixiang", "仰望",
    "迈巴赫", "maybach", "劳斯莱斯", "rolls", "宾利", "bentley",
    "法拉利", "ferrari", "兰博基尼", "lamborghini", "特斯拉", "tesla",
}

# 高价值服务
HIGH_VALUE_SERVICES = {
    "隐形车衣", "车衣", "ppf", "全车贴膜", "改色膜", "改色",
    "整车", "全车", "透明膜",
}

# 预算阈值
BUDGET_HIGH_THRESHOLD = 8000  # ≥8000 视为高预算


def grade_lead(extracted_info: dict) -> dict:
    """
    给线索评分和分级。

    返回:
    {
        "grade": "S" | "A" | "B" | "C",
        "score": int (0-100),
        "reasons": [str],
        "followup_priority": "urgent" | "normal" | "low",
        "suggested_followup_days": [int],
    }
    """
    score = 0
    reasons = []

    car_model = (extracted_info.get("car_model") or "").strip()
    service_type = (extracted_info.get("service_type") or "").strip()
    budget = (extracted_info.get("budget_range") or "").strip()
    nickname = (extracted_info.get("customer_nickname") or "").strip()
    phone = (extracted_info.get("customer_phone") or "").strip()
    wechat = (extracted_info.get("customer_wechat") or "").strip()

    # ---- 车型评分 ----
    if car_model:
        score += 20
        reasons.append(f"有明确车型: {car_model}")
        car_lower = car_model.lower()
        if any(brand in car_lower for brand in PREMIUM_BRANDS):
            score += 15
            reasons.append("高端品牌车型")

    # ---- 需求评分 ----
    if service_type:
        score += 20
        reasons.append(f"有明确需求: {service_type}")
        svc_lower = service_type.lower()
        if any(svc in svc_lower for svc in HIGH_VALUE_SERVICES):
            score += 10
            reasons.append("高价值服务类型")

    # ---- 预算评分 ----
    if budget:
        score += 15
        reasons.append(f"有预算信息: {budget}")
        budget_num = _extract_budget_number(budget)
        if budget_num and budget_num >= BUDGET_HIGH_THRESHOLD:
            score += 10
            reasons.append("高预算客户")

    # ---- 联系方式评分 ----
    if phone:
        score += 10
        reasons.append("留了电话")
    if wechat:
        score += 10
        reasons.append("留了微信号")

    # ---- 称呼评分（愿意告诉名字说明有诚意）----
    if nickname:
        score += 5

    # ---- 确定等级 ----
    if score >= 70:
        grade = "S"
        followup_priority = "urgent"
        followup_days = [1, 3, 7, 30]
    elif score >= 50:
        grade = "A"
        followup_priority = "urgent"
        followup_days = [1, 7, 30]
    elif score >= 30:
        grade = "B"
        followup_priority = "normal"
        followup_days = [3, 7, 30, 60]
    else:
        grade = "C"
        followup_priority = "low"
        followup_days = [7, 30, 60, 180]

    return {
        "grade": grade,
        "score": min(score, 100),
        "reasons": reasons,
        "followup_priority": followup_priority,
        "suggested_followup_days": followup_days,
    }


def _extract_budget_number(budget_str: str) -> int | None:
    """从预算字符串中提取数值（取最大值）"""
    import re
    # 处理 "1万" "1.5万" "10000" "8000-12000"
    nums = []
    # 万
    for m in re.finditer(r'(\d+\.?\d*)\s*万', budget_str):
        nums.append(int(float(m.group(1)) * 10000))
    # 纯数字
    for m in re.finditer(r'(\d{4,})', budget_str):
        nums.append(int(m.group(1)))
    return max(nums) if nums else None
