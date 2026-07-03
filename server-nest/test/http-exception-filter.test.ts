import { describe, test, expect, vi } from 'vitest';
import { BadRequestException, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

// 造一个最小的 ArgumentsHost/Response/Request 替身，捕获 filter 最终写出的 status + body。
function run(exception: unknown, req: any = { method: 'POST', path: '/api/users/x/follow' }) {
  const captured: any = {};
  const res: any = {
    status(s: number) { captured.status = s; return this; },
    json(b: any) { captured.body = b; return this; },
    setHeader() {}, sendFile() { captured.sentFile = true; },
  };
  const host: any = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) };
  new HttpExceptionFilter().catch(exception, host);
  return captured;
}

describe('HttpExceptionFilter — 错误规范化 & 不泄露内部错误', () => {
  test('业务错误(HttpException) 原样保留 message + 状态码', () => {
    const r = run(new UnauthorizedException('请先登录'));
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: '请先登录' });
  });

  test('400 校验错误也保留其文案', () => {
    const r = run(new BadRequestException('标题不能为空'));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('标题不能为空');
  });

  test('未预期错误(DB/系统 Error) → 通用文案，绝不泄露原始 message', () => {
    const r = run(new Error("Unknown column 'NaN' in 'WHERE'"));
    expect(r.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR); // 500
    expect(r.body.error).toBe('服务器出错了，请稍后重试');
    // 关键：SQL/内部细节不能出现在返回体里
    expect(JSON.stringify(r.body)).not.toMatch(/Unknown column|NaN|WHERE|SQL/i);
  });

  test('TypeError 之类也走通用文案', () => {
    const r = run(new TypeError("Cannot read properties of undefined (reading 'id')"));
    expect(r.body.error).toBe('服务器出错了，请稍后重试');
    expect(JSON.stringify(r.body)).not.toMatch(/undefined|properties/i);
  });

  test('HttpException 携带对象体(message 数组) → 取首条', () => {
    const r = run(new HttpException({ message: ['字段A 不合法', '字段B 不合法'] }, 422));
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('字段A 不合法');
  });
});
