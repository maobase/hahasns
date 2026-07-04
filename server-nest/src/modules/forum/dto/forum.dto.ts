import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateThreadDto {
  @IsOptional()
  boardId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;

  @IsOptional()
  @IsArray()
  media?: any[];
}

export class UpdateThreadDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;
}

export class ModerateThreadDto {
  @IsOptional()
  @IsString()
  action?: string;
}
