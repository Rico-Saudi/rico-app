import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { SessionGuard } from '../common/guards/session.guard';
import { RequireApp } from '../common/decorators/require-app.decorator';
import { AccountId } from '../common/decorators/account-id.decorator';
import { PushService } from './push.service';

class PushEndpointDto {
  @IsString()
  @MaxLength(1000)
  endpoint: string;
}

@Controller('vendor/push')
@UseGuards(SessionGuard)
@RequireApp('vendor')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('key')
  async key() {
    return { publicKey: await this.push.publicKey() };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  async subscribe(@AccountId() accountId: string, @Body() dto: PushEndpointDto) {
    await this.push.subscribe(accountId, dto.endpoint);
    return { ok: true };
  }

  @Delete('subscribe')
  async unsubscribe(@AccountId() accountId: string, @Body() dto: PushEndpointDto) {
    await this.push.unsubscribe(accountId, dto.endpoint);
    return { ok: true };
  }
}
