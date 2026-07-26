/**
 * 「是否收到过带 X-Forwarded-For 的请求」这一进程级事实。
 *
 * 判断站点有没有挂在反向代理后面，光看环境变量看不出来——站长不会去填「我用了 nginx」。
 * 但只要真的有代理，每个请求都会带 XFF 头，观察一次就够。main.ts 在最外层中间件里打标，
 * 后台「部署自检」据此判断 TRUST_PROXY 漏配（漏配时按 IP 的限流全部落在代理 IP 上，形同虚设）。
 */
let seen = false;

export function markForwardedFor(): void {
  seen = true;
}

export function sawForwardedFor(): boolean {
  return seen;
}

/** 仅供测试重置。 */
export function resetForwardedForSignal(): void {
  seen = false;
}
