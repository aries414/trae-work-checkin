"use strict";
const { createClient } = require("./lib.cjs");

async function withRetry(fn, label, maxAttempts = 3, waitMs = 15000) {
  let lastErr;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.log(`[${label}] 第 ${i} 次失败: ${e.message}`);
      if (i < maxAttempts) {
        console.log(`${waitMs / 1000} 秒后重试...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastErr;
}

async function main() {
  const jsonOut = process.argv.includes("--json");
  const client = await createClient();

  // 重试状态查询（理论上不应该失败，但防一手）
  const status = await withRetry(
    () => client.post("/trae/api/v2/ug/checkin_credits/status", {}),
    "status", 3, 10000
  );
  if (!(status.json && status.json.code === 0)) {
    console.log(`[签到状态读取失败] ${(status.json && status.json.message) || "HTTP " + status.status}`);
    process.exit(2);
  }
  const s = status.json;

  if (jsonOut) {
    let result = { status_read: true, checked_in: !!s.checked_in };
    if (!s.checked_in) {
      const claim = await withRetry(
        () => client.post("/trae/api/v2/ug/checkin_credits/claim", {}),
        "claim", 3, 15000
      );
      result.claim = claim.json;
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("== Trae Work 每日签到 ==");
  console.log(`今日已签 : ${s.checked_in ? "是（跳过领取）" : "否"}`);

  if (s.checked_in) {
    console.log(`（已领取，无需重复签到。明日可领：基础 ${s.credits ?? "?"}` +
                `${s.extra_credits != null ? " + 额外 " + s.extra_credits : ""}）`);
    return;
  }

  const claim = await withRetry(
    () => client.post("/trae/api/v2/ug/checkin_credits/claim", {}),
    "claim", 3, 15000
  );
  if (claim.json && claim.json.code === 0) {
    const c = claim.json;
    const gained = c.gained_credits ?? c.credits_gained ?? c.reward ?? c.extra_credits ?? "";
    console.log(`签到成功 ✔  ${gained ? "领取积分 " + gained : "已领取"}`);
    if (c.reward_info) console.log("奖励:", JSON.stringify(c.reward_info));
  } else {
    console.log(`签到失败 : ${(claim.json && claim.json.message) || ("HTTP " + claim.status)}`);
    if (claim.json) console.log("原始返回:", JSON.stringify(claim.json).slice(0, 300));
    process.exit(3);
  }
}
main().catch((e) => { console.error("错误：" + e.message); process.exit(1); });
