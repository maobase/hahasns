import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { User } from '../../database/entities';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import { StorageService } from '../storage/storage.service';
import {
  AddModeratorDto,
  CreateBoardDto,
  CreateProductDto,
  CreateTopicDto,
  UpdateBoardDto,
  UpdateUserDto,
} from './dto/admin.dto';

/**
 * /api/admin — admin-only operations. Mirrors server/src/routes/admin.js,
 * which applies requireAuth + requireAdmin to every route; AdminGuard does both.
 */
@Controller('api/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly storage: StorageService,
  ) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('audit')
  audit() {
    return this.admin.getAudit();
  }

  @Get('config')
  getConfig() {
    return this.admin.getConfig();
  }

  @Put('config')
  updateConfig(
    @CurrentUser() user: User,
    @Body('config') config: Record<string, any>,
  ) {
    return this.admin.updateConfig(user.id, config || {});
  }

  /** 当前生效的存储配置 + 逐项来源（后台 / 环境变量 / 默认），密钥只报有无 */
  @Get('storage/status')
  storageStatus() {
    return this.storage.status();
  }

  /** 测试当前存储驱动连通性（local 写探针 / s3 上传删除探针） */
  @Post('storage/test')
  testStorage() {
    return this.storage.testConnection();
  }

  /** 清掉后台存的存储配置（含密钥），退回环境变量 / 内置默认 */
  @Delete('storage/site-config')
  clearStorageSiteConfig(@CurrentUser() user: User) {
    return this.admin.clearStorageSiteConfig(user.id);
  }

  @Get('users')
  listUsers(@Query('q') q: string, @Query('filter') filter: string, @Query('offset') offset: string) {
    return this.admin.listUsers(q, filter, Number(offset) || 0);
  }

  @Put('users/:id')
  updateUser(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.admin.updateUser(user.id, Number(id), dto);
  }

  // 管理员重置用户登录密码（帮助找回，无需旧密码）
  @Post('users/:id/reset-password')
  resetUserPassword(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('password') password: string,
  ) {
    return this.admin.resetUserPassword(user.id, Number(id), password);
  }

  @Post('boards')
  createBoard(@CurrentUser() user: User, @Body() dto: CreateBoardDto) {
    return this.admin.createBoard(user.id, dto);
  }

  @Put('boards/:id')
  updateBoard(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.admin.updateBoard(user.id, Number(id), dto);
  }

  @Delete('boards/:id')
  deleteBoard(@CurrentUser() user: User, @Param('id') id: string) {
    return this.admin.deleteBoard(user.id, Number(id));
  }

  @Post('boards/:id/moderators')
  toggleModerator(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: AddModeratorDto,
  ) {
    return this.admin.toggleModerator(Number(id), user, dto);
  }

  @Post('topics')
  createTopic(@CurrentUser() user: User, @Body() dto: CreateTopicDto) {
    return this.admin.createTopic(user.id, dto);
  }

  @Put('topics/:id')
  updateTopic(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateTopicDto) {
    return this.admin.updateTopic(user.id, Number(id), dto);
  }

  @Delete('topics/:id')
  deleteTopic(@CurrentUser() user: User, @Param('id') id: string) {
    return this.admin.deleteTopic(user.id, Number(id));
  }

  @Get('reports')
  listReports(@Query('status') status: string) {
    return this.admin.listReports(status);
  }

  @Post('reports/:id/resolve')
  resolveReport(@CurrentUser() user: User, @Param('id') id: string) {
    return this.admin.resolveReport(user.id, Number(id));
  }

  @Post('products')
  createProduct(@CurrentUser() user: User, @Body() dto: CreateProductDto) {
    return this.admin.createProduct(user.id, dto);
  }

  @Put('products/:id')
  updateProduct(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.admin.updateProduct(user.id, Number(id), dto);
  }

  @Delete('products/:id')
  deleteProduct(@CurrentUser() user: User, @Param('id') id: string) {
    return this.admin.deleteProduct(user.id, Number(id));
  }

  @Delete('content/:type/:id')
  deleteContent(
    @CurrentUser() user: User,
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    return this.admin.deleteContent(user.id, type, Number(id));
  }
}
