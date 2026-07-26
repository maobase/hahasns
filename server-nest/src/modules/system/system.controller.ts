import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/jwt-auth.guard';
import { SystemService } from './system.service';

/** 后台「系统更新」：仅 admin。部署自检 + 检测新版 + 半自动一键升级。 */
@Controller('api/admin/system')
@UseGuards(AdminGuard)
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('status')
  status() {
    return this.system.status();
  }

  @Get('deploy-check')
  deployCheck() {
    return this.system.deployCheck();
  }

  @Post('upgrade')
  upgrade() {
    return this.system.upgrade();
  }
}
