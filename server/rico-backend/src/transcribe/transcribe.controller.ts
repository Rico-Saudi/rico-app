import { Body, Controller, HttpCode, HttpStatus, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_AUDIO_BYTES } from './constants/transcribe.constants';
import { TranscribeService } from './transcribe.service';

@Controller()
export class TranscribeController {
  constructor(private readonly transcribeService: TranscribeService) {}

  // Multipart, not JSON — the body is a recorded audio clip, so this is the
  // one public endpoint that doesn't go through the global ValidationPipe's
  // DTO path. Multer keeps the file in memory (no disk writes on Render's
  // ephemeral filesystem); the size cap is enforced here rather than in the
  // service so an oversized upload is rejected before it's buffered.
  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } }))
  // `brand` rides along as an ordinary multipart text field. There's no DTO
  // here because the global ValidationPipe doesn't apply to multipart bodies,
  // so it's read straight off the body and resolved (with a fallback) by
  // brandFor() rather than trusted.
  transcribe(@UploadedFile() audio?: Express.Multer.File, @Body('brand') brand?: string) {
    return this.transcribeService.transcribe(audio, typeof brand === 'string' ? brand : undefined);
  }
}
