import api from '../api/client';
import { shrinkImage } from './resizeImage';

export interface UploadPickedOpts {
  maxSizeMb: number;            // 单文件大小上限（MB，后台可配 uploadMaxSizeMb）
  remaining: number;            // 剩余可传数量（slice 上限；单文件场景传 1）
  onErr: (msg: string) => void; // 超限 / 失败提示（toast.err）
  single?: boolean;             // 单文件场景：超限提示用单数文案
}

/**
 * 公共媒体上传流水线（收敛自 Composer / NewThreadModal 三处重复逻辑）：
 * 选中的文件 → shrinkImage 压缩 → 按 maxSizeMb 前端拦截 → FormData POST /api/upload
 * → 返回上传成功的 files 数组。全部超限或请求失败时返回 []（提示已在内部发出）；
 * media 合并 / slice 与 input 复位仍由调用方负责，保持各自原有语义。
 */
export async function uploadPickedFiles(files: File[], { maxSizeMb, remaining, onErr, single = false }: UploadPickedOpts): Promise<any[]> {
  const picked = await Promise.all(files.slice(0, remaining).map((f) => shrinkImage(f)));
  // 后台可配「单文件最大 MB」：前端先拦超限文件，给友好提示，避免直接吃后端报错
  const okFiles = picked.filter((f) => f.size <= maxSizeMb * 1024 * 1024);
  if (okFiles.length < picked.length) onErr(single ? `文件超过 ${maxSizeMb}MB` : `部分文件超过 ${maxSizeMb}MB，已跳过`);
  if (!okFiles.length) return [];
  const fd = new FormData();
  okFiles.forEach((f) => fd.append('files', f));
  try {
    const { data } = await api.post('/upload', fd);
    return data.files || [];
  } catch (err: any) {
    onErr(err.message);
    return [];
  }
}
