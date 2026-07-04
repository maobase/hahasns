/**
 * 上传前尽力把大图等比缩到合理尺寸（省流量、feed 更快、少占存储）。
 * **fail-safe**：任何不确定/失败都返回原文件——绝不弄坏上传。具体：
 *  - 只处理 image/jpeg 与 image/png（gif 含动画不能 canvas 缩、video/audio/webp 等一律原样）；
 *  - 用 createImageBitmap({imageOrientation:'from-image'}) 尊重 EXIF 方向（否则手机竖拍图会躺倒）；
 *  - 已经够小、或缩完反而更大、或任何异常 → 返回原文件。
 */
export async function shrinkImage(file: File, maxDim = 1600, quality = 0.85): Promise<File> {
  if (!/^image\/(jpeg|png)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = bmp;
    if (Math.max(width, height) <= maxDim) { bmp.close?.(); return file; }
    const scale = maxDim / Math.max(width, height);
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close?.(); return file; }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, outType, quality));
    if (!blob || blob.size >= file.size) return file; // 没变小就用原图
    return new File([blob], file.name, { type: outType, lastModified: Date.now() });
  } catch {
    return file;
  }
}
