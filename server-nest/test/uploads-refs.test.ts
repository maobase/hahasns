import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  MEDIA_REF_COLUMNS,
  isLocalUploadPath,
  keyFromLocalPath,
  extractUploadKeys,
  splitLocalFiles,
} from '../src/modules/storage/uploads-refs';

// 纯函数测试：从库单元格里挖出本地 /uploads 引用，再按「有没有被引用」把磁盘文件分堆。
// 这是「存量没迁走」那条提示的判定依据——数错就会对着一堆孤儿喊迁移。

describe('isLocalUploadPath 判本地上传路径', () => {
  test('/uploads/ 与 uploads/ 两种写法都算', () => {
    expect(isLocalUploadPath('/uploads/a.jpg')).toBe(true);
    expect(isLocalUploadPath('uploads/a.jpg')).toBe(true);
  });

  test('完整 URL 说明已经在桶里，不算', () => {
    expect(isLocalUploadPath('https://cdn.example.com/uploads/a.jpg')).toBe(false);
    expect(isLocalUploadPath('http://x/y.jpg')).toBe(false);
  });

  test('非字符串与空值不算', () => {
    expect(isLocalUploadPath(null)).toBe(false);
    expect(isLocalUploadPath(undefined)).toBe(false);
    expect(isLocalUploadPath(123)).toBe(false);
    expect(isLocalUploadPath('')).toBe(false);
    expect(isLocalUploadPath({ url: '/uploads/a.jpg' })).toBe(false);
  });
});

describe('keyFromLocalPath 取文件名', () => {
  test('去前缀', () => {
    expect(keyFromLocalPath('/uploads/1783045709389-bb0d.jpg')).toBe('1783045709389-bb0d.jpg');
    expect(keyFromLocalPath('uploads/x.png')).toBe('x.png');
  });

  test('查询串与锚点一并去掉——同一文件带不带 ?v= 都该对上磁盘上那个名字', () => {
    expect(keyFromLocalPath('/uploads/a.jpg?v=2')).toBe('a.jpg');
    expect(keyFromLocalPath('/uploads/a.jpg#frag')).toBe('a.jpg');
  });

  test('带目录分隔符或 .. 的脏数据当没引用（返回空串）', () => {
    expect(keyFromLocalPath('/uploads/sub/a.jpg')).toBe('');
    expect(keyFromLocalPath('/uploads/..%2Fetc')).toBe('');
    expect(keyFromLocalPath('/uploads/../../etc/passwd')).toBe('');
    expect(keyFromLocalPath('/uploads/a\\b.jpg')).toBe('');
  });
});

describe('extractUploadKeys 从库单元格挖 key', () => {
  test('空值 → 空数组', () => {
    expect(extractUploadKeys(null)).toEqual([]);
    expect(extractUploadKeys(undefined)).toEqual([]);
    expect(extractUploadKeys('')).toEqual([]);
  });

  test('纯路径字符串（users.avatar / 私信 content）', () => {
    expect(extractUploadKeys('/uploads/a.jpg')).toEqual(['a.jpg']);
  });

  test('JSON 数组字符串（posts.media 的 [{url,type}]）', () => {
    const cell = JSON.stringify([
      { url: '/uploads/a.jpg', type: 'image' },
      { url: '/uploads/b.mp4', type: 'video' },
    ]);
    expect(extractUploadKeys(cell)).toEqual(['a.jpg', 'b.mp4']);
  });

  test('同一单元格里混着桶内 URL 时只取本地那几个', () => {
    const cell = JSON.stringify([
      { url: 'https://cdn.example.com/x.jpg', type: 'image' },
      { url: '/uploads/local.jpg', type: 'image' },
    ]);
    expect(extractUploadKeys(cell)).toEqual(['local.jpg']);
  });

  test('mysql2 在 JSON 列上直接给对象/数组时同样能挖', () => {
    expect(extractUploadKeys([{ url: '/uploads/a.jpg' }])).toEqual(['a.jpg']);
    expect(extractUploadKeys({ cover: '/uploads/c.png' })).toEqual(['c.png']);
  });

  test('长得像 JSON 但解析失败 → 退回按纯字符串处理，不抛', () => {
    expect(extractUploadKeys('[/uploads/a.jpg')).toEqual([]);
    expect(extractUploadKeys('{"url": /uploads/a.jpg}')).toEqual([]);
    // 以 [ 开头、解析失败，但整串本身不是上传路径 → 无 key，且不报错
    expect(() => extractUploadKeys('[oops')).not.toThrow();
  });

  test('嵌套结构也能挖到底', () => {
    const cell = { blocks: [{ media: [{ url: '/uploads/deep.jpg' }] }] };
    expect(extractUploadKeys(cell)).toEqual(['deep.jpg']);
  });

  test('脏路径不计入（键为空串就丢掉）', () => {
    expect(extractUploadKeys('/uploads/sub/a.jpg')).toEqual([]);
  });
});

describe('splitLocalFiles 按引用分堆', () => {
  test('全被引用', () => {
    expect(splitLocalFiles(['a.jpg', 'b.jpg'], new Set(['a.jpg', 'b.jpg']))).toEqual({
      referenced: 2,
      orphans: 0,
    });
  });

  test('全是孤儿——env2 实测就是这个形状（目录里 2 个，库里 0 处引用）', () => {
    expect(splitLocalFiles(['a.jpg', 'b.jpg'], new Set())).toEqual({
      referenced: 0,
      orphans: 2,
    });
  });

  test('混合；库里有引用但磁盘上没这个文件时不会算进任何一堆', () => {
    expect(splitLocalFiles(['a.jpg', 'b.jpg'], new Set(['a.jpg', 'gone.jpg']))).toEqual({
      referenced: 1,
      orphans: 1,
    });
  });

  test('空目录', () => {
    expect(splitLocalFiles([], new Set(['a.jpg']))).toEqual({ referenced: 0, orphans: 0 });
  });
});

describe('MEDIA_REF_COLUMNS 与迁移脚本口径一致', () => {
  // 两边扫的库列必须是同一份清单：这边说「没有引用了」而脚本还在重写（或反之）
  // 就会出现「后台说不用迁 / 脚本迁了一半」这种自相矛盾。加列时两处一起改。
  test('清单与 migrate-uploads-to-s3.mjs 的 targets 逐项对上', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../scripts/migrate-uploads-to-s3.mjs'),
      'utf8',
    );
    const block = src.match(/const targets = \[([\s\S]*?)\n {2}\];/);
    expect(block, 'migrate-uploads-to-s3.mjs 里没找到 targets 数组，脚本结构变了就来改这条用例').toBeTruthy();

    // 每行形如 ['posts', 'media', 'id'],  —— 只取前两项（表、列）
    const scriptPairs = [...block![1].matchAll(/\[\s*'([^']+)'\s*,\s*'([^']+)'/g)].map(
      (m) => `${m[1]}.${m[2]}`,
    );
    const ourPairs = MEDIA_REF_COLUMNS.map((t) => `${t.table}.${t.column}`);

    expect(scriptPairs.length).toBeGreaterThan(0);
    expect([...ourPairs].sort()).toEqual([...scriptPairs].sort());
  });

  test('私信那列带过滤条件（只有 type=image 存的是路径）', () => {
    const msg = MEDIA_REF_COLUMNS.find((t) => t.table === 'messages');
    expect(msg?.where).toContain("type='image'");
  });
});
