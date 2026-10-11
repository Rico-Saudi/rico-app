import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { WeatherService } from '../weather/weather.service';
import { brandFor } from '../common/constants/brands';
import { buildComposePrompt } from './constants/compose.constants';
import { ComposeRequestDto } from './dto/compose-request.dto';

@Injectable()
export class ComposeService {
  constructor(
    private readonly llm: LlmService,
    private readonly weather: WeatherService,
  ) {}

  async compose(dto: ComposeRequestDto) {
    // Only *notable* weather is passed on. Telling a Riyadh user it's hot in
    // August is not information, and a model handed a temperature every time
    // will find a way to mention it every time.
    const weather =
      dto.lat !== undefined && dto.lng !== undefined ? await this.weather.getFor(dto.lat, dto.lng) : null;

    const userPayload = {
      message: dto.message,
      intentKind: dto.intentKind,
      intentLabel: dto.intentLabel,
      rank: dto.rank,
      items: dto.items,
      truncated: dto.truncated,
      history: dto.history || [],
      ...(weather?.notable ? { weather: weather.descriptionAr } : {}),
      ...(dto.mood && dto.mood !== 'neutral' ? { mood: dto.mood } : {}),
    };

    const { content } = await this.llm.complete({
      purpose: 'compose',
      messages: [
        { role: 'system', content: buildComposePrompt(brandFor(dto.brand)) },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      temperature: 0.3,
      // A rushed customer gets a hard ceiling, not just a polite request for
      // brevity: the instruction alone lets the model write four warm lines
      // to someone standing over a burst pipe.
      maxTokens: dto.mood === 'urgent' || dto.mood === 'angry' ? 90 : 260,
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
