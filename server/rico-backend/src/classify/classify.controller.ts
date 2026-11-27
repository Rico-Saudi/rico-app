import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ClassifyService } from './classify.service';
import { ClassifyRequestDto } from './dto/classify-request.dto';

@Controller()
export class ClassifyController {
  // Exposed at POST /classify. The Cloudflare Worker this replaced served
  // it from its root path instead, which is why Flutter's constant appends
  // `/classify` to the API host.
  constructor(private readonly classifyService: ClassifyService) {}

  // Nest defaults POST handlers to 201 Created — override to 200 since
  // Flutter's LlmIntentService checks for an exact 200 and silently
  // discards anything else as a failure (falling back to local parsing).
  @Post('classify')
  @HttpCode(HttpStatus.OK)
  classify(@Body() dto: ClassifyRequestDto) {
    return this.classifyService.classify(dto);
  }
}
