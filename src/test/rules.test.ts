import { describe, expect, it } from "vitest";
import { adCooldownMs, coinsToUsd, prizeForRank, seasonEndsAt } from "@/lib/rules";

describe("rules", () => {
  it("30 winners share exactly $10", () => {
    let sum = 0;
    for (let r = 1; r <= 30; r++) sum += prizeForRank(r);
    expect(sum).toBeCloseTo(10, 6);
  });
  it("ranks 31-50 get nothing", () => {
    expect(prizeForRank(31)).toBe(0);
    expect(prizeForRank(50)).toBe(0);
  });
  it("neighbouring prizes stay close (under 2 cents apart)", () => {
    for (let r = 1; r < 30; r++) expect(prizeForRank(r) - prizeForRank(r + 1)).toBeLessThan(0.02);
  });
  it("100000 coins = $1", () => {
    expect(coinsToUsd(100_000)).toBe(1);
    expect(coinsToUsd(250_000)).toBe(2.5);
  });
  it("season resets every 2 days", () => {
    const t = Date.UTC(2026, 10, 3, 12);
    const end = seasonEndsAt(t);
    expect(end - seasonEndsAt(end - 1)).toBe(0);
    expect(seasonEndsAt(end) - end).toBe(2 * 24 * 3600 * 1000);
  });
  it("survived full 90s -> next ad in 90s", () => {
    expect(adCooldownMs(90)).toBe(90_000);
  });
  it("died at 30s -> 60s left + 90s = 150s", () => {
    expect(adCooldownMs(30)).toBe(150_000);
  });
});
