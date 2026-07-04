import 'reflect-metadata';
import { describe, expect, test, vi, afterEach } from 'vitest';
import { LotteryService } from '../src/modules/lottery/lottery.service';

// 幸运抽奖 draw() 是核心演示功能，涉及真实积分收支 + 加权随机（公平性）。
// 用 mock 仓库 + stub Math.random 测「真实」draw()（不改动 service 源码）：
//   加权命中区间 / 免费不扣费(88) / 付费扣费 / 积分不足抛错 / 各奖品类型结算。
// 权重区间：A[thanks,10] → [0,10)，B[points+50,30] → [10,40)，C[title,60] → [40,100)。
const PRIZES = [
  { id: 1, name: 'A', type: 'thanks', value: '', weight: 10, position: 1 },
  { id: 2, name: 'B', type: 'points', value: 50, weight: 30, position: 2 },
  { id: 3, name: 'C', type: 'title', value: '幸运星', weight: 60, position: 3 },
];
const COST = 88;

function setup({ prizes = PRIZES, drawsToday = 0, points = 200, lotteryCost = null as string | null, lotteryFree = null as string | null } = {}) {
  const state: any = { updatePatch: null, savedDraws: [] };
  const svc = new LotteryService(
    { find: async () => prizes } as any,
    {
      count: async () => drawsToday,
      create: (x: any) => x,
      save: async (x: any) => { state.savedDraws.push(x); return x; },
    } as any,
    { update: async (_c: any, patch: any) => { state.updatePatch = patch; } } as any,
    {
      getUser: async () => ({ id: 7, points, title: '', avatar_frame: '' }),
      today: () => '2026-07-02',
      nowSql: () => '2026-07-02 00:00:00',
      publicUser: async (u: any) => ({ id: u.id, points: u.points }),
    } as any,
    // 5th: SiteService mock — 后台配置 lottery_cost / lottery_free_daily（null=未配置用默认）
    { getConfig: async (k: string) => (k === 'lottery_cost' ? lotteryCost : k === 'lottery_free_daily' ? lotteryFree : null) } as any,
  );
  return { svc, state, user: { id: 7 } as any };
}

afterEach(() => vi.restoreAllMocks());

describe('LotteryService.draw — 加权随机 + 积分收支', () => {
  test('空奖池 → 抛错', async () => {
    const { svc, user } = setup({ prizes: [] });
    await expect(svc.draw(user)).rejects.toThrow();
  });

  test('加权随机：random 落入各奖品累计权重区间 → 命中对应奖品', async () => {
    const cases: Array<[number, string]> = [
      [0.0, 'A'],   // r=0 → 命中首个(r<=0)
      [0.05, 'A'],  // r=5 ∈ [0,10)
      [0.25, 'B'],  // r=25 ∈ [10,40)
      [0.70, 'C'],  // r=70 ∈ [40,100)
      [0.999, 'C'], // r=99.9 ∈ [40,100)
    ];
    for (const [rand, name] of cases) {
      vi.spyOn(Math, 'random').mockReturnValue(rand);
      const { svc, user } = setup({ drawsToday: 0 });
      const res: any = await svc.draw(user);
      expect(res.prize.name).toBe(name);
      vi.restoreAllMocks();
    }
  });

  test('免费抽（今日未抽）→ wasFree=true，不扣 88，仅结算奖品', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25); // → B: +50 积分
    const { svc, state, user } = setup({ drawsToday: 0, points: 200 });
    const res: any = await svc.draw(user);
    expect(res.wasFree).toBe(true);
    expect(state.updatePatch.points).toBe(250); // 200 - 0 + 50
    expect(state.savedDraws).toHaveLength(1);
  });

  test('付费抽（免费额已用尽）积分充足 → 扣 88 再结算奖品', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25); // → B: +50
    const { svc, state, user } = setup({ drawsToday: 1, points: 200 });
    const res: any = await svc.draw(user);
    expect(res.wasFree).toBe(false);
    expect(state.updatePatch.points).toBe(200 - COST + 50); // 162
  });

  test('付费抽但积分不足 88 → 抛错且不写库（不扣费不发奖）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const { svc, state, user } = setup({ drawsToday: 1, points: 50 });
    await expect(svc.draw(user)).rejects.toThrow();
    expect(state.updatePatch).toBeNull();
    expect(state.savedDraws).toHaveLength(0);
  });

  test('后台配置 lottery_cost=200 → 付费抽扣 200（覆盖默认 88）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25); // → B: +50
    const { svc, state, user } = setup({ drawsToday: 1, points: 300, lotteryCost: '200' });
    await svc.draw(user);
    expect(state.updatePatch.points).toBe(300 - 200 + 50); // 150
  });

  test('后台配置 lottery_free_daily=0 → 无免费额，首抽即扣费', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const { svc, state, user } = setup({ drawsToday: 0, points: 300, lotteryFree: '0' });
    const res: any = await svc.draw(user);
    expect(res.wasFree).toBe(false);
    expect(state.updatePatch.points).toBe(300 - COST + 50); // 262
  });

  test('奖品类型结算：title→写 title；frame→写 avatar_frame；thanks→仅计费不发物', async () => {
    const single = (type: string, value: any) => [{ id: 1, name: 'X', type, value, weight: 100, position: 1 }];

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    let s = setup({ prizes: single('title', '幸运星'), drawsToday: 0, points: 100 });
    await s.svc.draw(s.user);
    expect(s.state.updatePatch.title).toBe('幸运星');
    expect(s.state.updatePatch.points).toBe(100); // 免费 + 非积分奖 → 不变
    vi.restoreAllMocks();

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    s = setup({ prizes: single('frame', 'rainbow'), drawsToday: 0, points: 100 });
    await s.svc.draw(s.user);
    expect(s.state.updatePatch.avatar_frame).toBe('rainbow');
    vi.restoreAllMocks();

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    s = setup({ prizes: single('thanks', ''), drawsToday: 0, points: 100 });
    await s.svc.draw(s.user);
    expect(s.state.updatePatch.points).toBe(100);
    expect(s.state.updatePatch.title).toBeUndefined();
    expect(s.state.updatePatch.avatar_frame).toBeUndefined();
  });
});
