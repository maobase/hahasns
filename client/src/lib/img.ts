import type { SyntheticEvent } from 'react';

// 图片加载失败时的灰底占位（内联 SVG data-URI，无网络依赖）：一个浅灰方块 + 简单山峰/太阳图形。
const BROKEN_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%23eef1f6'/%3E%3Ccircle cx='45' cy='44' r='8' fill='%23c3ccd9'/%3E%3Cpath d='M32 82l20-24 14 16 10-11 16 19z' fill='%23c3ccd9'/%3E%3C/svg%3E";

/**
 * 通用 <img onError> 兜底：坏图(URL 失效/被删)替换成灰底占位，避免浏览器默认的破图图标。
 * 主 feed 图（MediaGrid）、头像、封面各有自己的兜底；此工具用于私信气泡图、转发缩略图等零散处。
 */
export function onImgError(e: SyntheticEvent<HTMLImageElement>) {
  const el = e.currentTarget;
  if (el.dataset.broken) return; // 已兜底，避免占位图再触发 onError 死循环
  el.dataset.broken = '1';
  el.src = BROKEN_IMG;
}
