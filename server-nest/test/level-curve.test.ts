import { describe, it, expect } from 'vitest';
import { expForLevelPure } from '../src/common/helpers.service';

// 波B 经济：等级曲线 expForLevel = base * (level-1)^1.7。base 后台可配（默认 30）。
describe('expForLevelPure（等级曲线）', () => {
  it('默认系数 30：等级 1→0，等级 2→30，随级递增', () => {
    expect(expForLevelPure(30, 1)).toBe(0); // (1-1)^1.7 = 0
    expect(expForLevelPure(30, 2)).toBe(30); // 30*1^1.7 = 30
    expect(expForLevelPure(30, 3)).toBe(Math.round(30 * Math.pow(2, 1.7)));
    expect(expForLevelPure(30, 5)).toBeGreaterThan(expForLevelPure(30, 4));
  });

  it('系数越大，同等级所需经验越多（升级越慢）', () => {
    expect(expForLevelPure(60, 3)).toBeGreaterThan(expForLevelPure(30, 3));
    expect(expForLevelPure(50, 4)).toBeGreaterThan(expForLevelPure(30, 4));
    // 约 2 倍（各自独立四舍五入，允许 ±1 误差）
    expect(Math.abs(expForLevelPure(60, 3) - 2 * expForLevelPure(30, 3))).toBeLessThanOrEqual(1);
  });

  it('等级 1 恒为 0（任何系数）', () => {
    expect(expForLevelPure(30, 1)).toBe(0);
    expect(expForLevelPure(999, 1)).toBe(0);
  });
});
