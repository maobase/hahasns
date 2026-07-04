import { IsOptional, IsString, MaxLength } from 'class-validator';

// 后端长度上限（远宽于前端 maxLength，仅防 API 绕过前端塞超长串撑爆 UI；
// 超限由 ValidationPipe 统一返 400，而非撞 DB 列上限报 500）。
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  cover?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  verifiedNote?: string;
}

export class RechargeDto {
  @IsOptional()
  amount?: number;

  @IsOptional()
  vip?: boolean;

  @IsOptional()
  vipLevel?: number; // 1青铜/2黄金/3黑钻；兼容旧 vip:true(=1)
}
