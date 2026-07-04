import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '../../database/entities';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/article.dto';

/** /api/articles — 专栏. Mirrors server/src/routes/articles.js. */
@Controller('api/articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  list(
    @CurrentUser() user: User | null,
    @Query('category') category: string,
    @Query('sort') sort: string,
    @Query('offset') offset: string,
    @Query('limit') limit: string,
    @Query('q') q: string,
  ) {
    return this.articles.list(user?.id, category, sort, Number(offset) || 0, Number(limit) || 12, q);
  }

  @Get('trending')
  trending() {
    return this.articles.trending();
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  detail(@Param('id') id: string, @CurrentUser() user: User | null) {
    return this.articles.detail(Number(id), user?.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: User, @Body() body: CreateArticleDto) {
    return this.articles.create(user, body);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  like(@CurrentUser() user: User, @Param('id') id: string) {
    return this.articles.like(user, Number(id));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.articles.remove(user, Number(id));
  }

  @Post(':id/feature')
  @UseGuards(JwtAuthGuard)
  feature(@CurrentUser() user: User, @Param('id') id: string, @Body('featured') featured: boolean) {
    return this.articles.setFeatured(user, Number(id), !!featured);
  }
}
