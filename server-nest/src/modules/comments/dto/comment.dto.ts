import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsOptional()
  postId?: number;

  @IsOptional()
  threadId?: number;

  @IsOptional()
  articleId?: number;

  @IsOptional()
  parentId?: number;

  @IsOptional()
  replyTo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;
}
