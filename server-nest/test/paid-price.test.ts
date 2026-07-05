import 'reflect-metadata';
import { describe, expect, test } from 'vitest';
import { clampPrice } from '../src/modules/posts/posts.service';

// 付费内容价格上限（spec 波A #17）：后台 paid_price_max 钳制用户设定的解锁价格。
// 边界：负/非数→0；正常值原样；超上限→钳到上限；上限本身非法→0。
describe('clampPrice — 付费价格钳制边界', () => {
  test('正常值在上限内 → 原样', () => {
    expect(clampPrice(500, 100000)).toBe(500);
    expect(clampPrice('500', 100000)).toBe(500);
  });
  test('超过上限 → 钳到上限', () => {
    expect(clampPrice(999999, 1000)).toBe(1000);
    expect(clampPrice(1001, 1000)).toBe(1000);
  });
  test('负数 / 非数字 / 空 → 0', () => {
    expect(clampPrice(-5, 1000)).toBe(0);
    expect(clampPrice('abc', 1000)).toBe(0);
    expect(clampPrice(null, 1000)).toBe(0);
    expect(clampPrice(undefined, 1000)).toBe(0);
  });
  test('恰好等于上限 → 保留', () => {
    expect(clampPrice(1000, 1000)).toBe(1000);
  });
  test('上限非法（0/负/NaN）→ 0（不放行任意价）', () => {
    expect(clampPrice(500, 0)).toBe(0);
    expect(clampPrice(500, -1)).toBe(0);
    expect(clampPrice(500, NaN)).toBe(0);
  });
});
