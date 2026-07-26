/**
 * 「本地上传目录里的文件，还有没有内容在引用它」——纯判断层。
 *
 * 起因：切到对象存储后，后台按「uploads 目录里有几个文件」提示存量没迁走。
 * 但目录里躺着的东西不一定有人用：测试残留、删过的帖子留下的图，都会被数成待迁。
 * 实测过一次（env2 报还剩 2 个，迁移脚本 dry-run 一看待重写路径 0，两个都是孤儿），
 * 于是把「有几个文件」换成「有几个还被引用」——后者才是不迁就会裂图的数量。
 *
 * 这里只做解析与归类，SQL 由 StorageService 去跑。
 */

/** 一处可能存着上传路径的库列。与迁移脚本 migrate-uploads-to-s3.mjs 的 targets 同一份清单。 */
export interface MediaRefColumn {
  table: string;
  column: string;
  /** 附加过滤，缩小扫描范围（如私信只有 type='image' 存路径） */
  where?: string;
}

/**
 * 引用扫描覆盖的库列。
 *
 * **加列时必须同时改迁移脚本的 targets**，否则两边口径不一致：
 * 这边说「没有引用了」，脚本却还在重写，或反之。`test/uploads-refs.test.ts`
 * 有一条用例直接读脚本源码比对，漏改会红。
 */
export const MEDIA_REF_COLUMNS: MediaRefColumn[] = [
  { table: 'posts', column: 'media' },
  { table: 'threads', column: 'media' },
  { table: 'users', column: 'avatar' },
  { table: 'users', column: 'cover' },
  { table: 'articles', column: 'cover' },
  { table: 'site_config', column: 'value' },
  { table: 'messages', column: 'content', where: "type='image'" },
];

/** 是不是本地上传路径（`/uploads/x` 或 `uploads/x`）。完整 http(s) URL 说明已经在桶里了。 */
export function isLocalUploadPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith('/uploads/') || value.startsWith('uploads/'))
  );
}

/** `/uploads/1783045709389-bb0d.jpg` → `1783045709389-bb0d.jpg`（去掉查询串与锚点，路径穿越一并挡掉）。 */
export function keyFromLocalPath(value: string): string {
  const bare = value.replace(/^\/?uploads\//, '').split(/[?#]/)[0];
  // 目录分隔符与 .. 都不该出现在 key 里；出现就说明这行数据不干净，当没引用处理
  return bare.includes('/') || bare.includes('\\') || bare.includes('..') ? '' : bare;
}

/**
 * 从一个库单元格里挖出所有本地上传 key。
 *
 * 单元格可能是纯路径字符串（users.avatar、私信 content），
 * 也可能是 JSON 数组 / 对象（posts.media 的 `[{url,type}]`）。JSON 解析失败就退回按字符串处理。
 */
export function extractUploadKeys(cell: unknown): string[] {
  if (cell == null) return [];
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (isLocalUploadPath(node)) {
      const k = keyFromLocalPath(node);
      if (k) out.push(k);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach(walk);
    }
  };
  if (typeof cell === 'string') {
    const s = cell.trim();
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        walk(JSON.parse(s));
        return out;
      } catch {
        /* 不是合法 JSON，按纯字符串处理 */
      }
    }
    walk(s);
    return out;
  }
  // mysql2 在 JSON 列上会直接给对象
  walk(cell);
  return out;
}

export interface LocalFileSplit {
  /** 还有内容引用的文件数——这才是不迁就会裂图的数量 */
  referenced: number;
  /** 没人引用的残留文件数。迁移脚本不会动它们，迁过去只是给桶里添孤儿 */
  orphans: number;
}

/** 按「有没有被引用」把本地文件分成两堆。`files` 是文件名（不含 /uploads/ 前缀）。 */
export function splitLocalFiles(files: string[], referencedKeys: Set<string>): LocalFileSplit {
  let referenced = 0;
  for (const f of files) if (referencedKeys.has(f)) referenced++;
  return { referenced, orphans: files.length - referenced };
}
