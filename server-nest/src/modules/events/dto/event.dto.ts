import { IsOptional, IsString, MaxLength } from 'class-validator';

// 覆盖 events.service.create 读取的全部字段（whitelist:true 会剥掉未列字段，故必须齐）。
// 文本字段补最大长度；capacity/fee/online 无类型约束（service 内 parseInt/truthy 兜底），
// startAt/endAt 是日期串（min/必填/敏感词/数值 clamp 由 service 内保留）。
export class CreateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  startAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  endAt?: string;

  @IsOptional()
  capacity?: number;

  @IsOptional()
  fee?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cover?: string;

  @IsOptional()
  online?: boolean;
}
