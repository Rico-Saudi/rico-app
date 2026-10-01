import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ComposeService } from './compose.service';
import { ComposeRequestDto } from './dto/compose-request.dto';

@Controller()
export class ComposeController {
  constructor(private readonly composeService: ComposeService) {}

  // Nest defaults POST handlers to 201 Created — override to 200 to match
  // ComposeService (Flutter)'s exact-200 check, same reasoning as classify.
  @Post('compose')
  @HttpCode(HttpStatus.OK)
  compose(@Body() dto: ComposeRequestDto) {
    return this.composeService.compose(dto);
  }
}
