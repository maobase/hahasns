import { describe, it, expect } from 'vitest';
import { rewardNum } from '../src/common/helpers.service';

// 波B 经济：后台配置的奖励数值解析。关键边界是「允许 0」（站长可关闭某项奖励），
// 不能用 `Number(x) || def` 写法（会把合法的 0 误判成 falsy 回退到默认）。
describe('rewardNum（奖励数值解析）', () => {
  it('空 / null / undefined / 非数字 → 回退默认', () => {
    expect(rewardNum(null, 5)).toBe(5);
    expect(rewardNum(undefined, 10)).toBe(10);
    expect(rewardNum('', 2)).toBe(2);
    expect(rewardNum('abc', 50)).toBe(50);
  });

  it('「0」被保留（站长关闭奖励），不误回退默认', () => {
    expect(rewardNum('0', 5)).toBe(0);
    expect(rewardNum('0', 50)).toBe(0);
  });

  it('负数 → 回退默认（奖励不能为负）', () => {
    expect(rewardNum('-1', 5)).toBe(5);
    expect(rewardNum('-999', 2)).toBe(2);
  });

  it('合法非负数值原样返回', () => {
    expect(rewardNum('2', 5)).toBe(2);
    expect(rewardNum('50', 10)).toBe(50);
    expect(rewardNum('1000', 5)).toBe(1000);
  });
});
