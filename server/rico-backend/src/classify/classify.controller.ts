import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ClassifyService } from './classify.service';
import { ClassifyRequestDto } from './dto/classify-request.dto';

@Controller()
export class ClassifyController {
  // Exposed at POST /classify (the live groq-proxy Worker exposed this at
  // its root path instead — Flutter's base URL constant is updated to
  // append `/classify` as part of this rewrite).
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
