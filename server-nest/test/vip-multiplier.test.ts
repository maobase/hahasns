import { describe, it, expect } from 'vitest';
import { vipMultiplier } from '../src/common/helpers.service';

// 波B 经济：VIP 签到积分加成倍率。百分比可后台配置，非 VIP 无加成，倍率恒 >= 1。
describe('vipMultiplier（VIP 加成倍率）', () => {
  it('默认百分比 20/50/100 → ×1.2 / ×1.5 / ×2', () => {
    expect(vipMultiplier(1, 20, 50, 100)).toBeCloseTo(1.2);
    expect(vipMultiplier(2, 20, 50, 100)).toBeCloseTo(1.5);
    expect(vipMultiplier(3, 20, 50, 100)).toBeCloseTo(2);
  });

  it('非 VIP（0）无加成 = ×1', () => {
    expect(vipMultiplier(0, 20, 50, 100)).toBe(1);
  });

  it('自定义百分比生效', () => {
    expect(vipMultiplier(1, 0, 50, 100)).toBe(1); // VIP1 设 0 = 无加成
    expect(vipMultiplier(2, 20, 200, 100)).toBeCloseTo(3); // VIP2 +200% = ×3
  });

  it('vipLevel >= 3 都用 VIP3 档；负百分比按 0（倍率不小于 1）', () => {
    expect(vipMultiplier(5, 20, 50, 100)).toBeCloseTo(2);
    expect(vipMultiplier(1, -50, 50, 100)).toBe(1);
  });
});
