import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { brandFor } from '../common/constants/brands';
import { buildComposePrompt } from './constants/compose.constants';
import { ComposeRequestDto } from './dto/compose-request.dto';

@Injectable()
export class ComposeService {
  constructor(private readonly llm: LlmService) {}

  async compose(dto: ComposeRequestDto) {
    const userPayload = {
      message: dto.message,
      intentKind: dto.intentKind,
      intentLabel: dto.intentLabel,
      rank: dto.rank,
      items: dto.items,
      truncated: dto.truncated,
      history: dto.history || [],
    };

    const { content } = await this.llm.complete({
      purpose: 'compose',
      messages: [
        { role: 'system', content: buildComposePrompt(brandFor(dto.brand)) },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      temperature: 0.3,
      maxTokens: 260,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new HttpException({ error: 'parse_error' }, HttpStatus.BAD_GATEWAY);
    }

    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    if (!reply) {
      throw new HttpException({ error: 'empty_reply' }, HttpStatus.BAD_GATEWAY);
    }

    return { reply };
  }
}
