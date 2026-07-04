import { IsOptional, IsString, MaxLength } from 'class-validator';

// 覆盖 articles.service.create 读取的全部字段（whitelist:true 会剥掉未列字段，故必须齐）。
// 仅补服务端最大长度（min 长度/敏感词/分类白名单由 service 内保留）。文章正文长故给 100000。
export class CreateArticleDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cover?: string;
}
