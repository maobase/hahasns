import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '../../database/entities';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/event.dto';

/** /api/events — 社区活动. Mirrors server/src/routes/events.js. */
@Controller('api/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  list(@CurrentUser() user: User | null, @Query('filter') filter: string, @Query('category') category: string, @Query('q') q: string) {
    return this.events.list(user?.id, filter, category, q);
  }

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard)
  adminStats(@CurrentUser() user: User) {
    return this.events.adminStats(user);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  detail(@Param('id') id: string, @CurrentUser() user: User | null) {
    return this.events.detail(Number(id), user?.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: User, @Body() body: CreateEventDto) {
    return this.events.create(user, body);
  }

  @Post(':id/signup')
  @UseGuards(JwtAuthGuard)
  signup(@CurrentUser() user: User, @Param('id') id: string) {
    return this.events.signup(user, Number(id));
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@CurrentUser() user: User, @Param('id') id: string) {
    return this.events.cancel(user, Number(id));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.events.remove(user, Number(id));
  }
}
