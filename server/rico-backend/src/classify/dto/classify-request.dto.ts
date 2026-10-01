import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';

export class HistoryMessageDto {
  @IsIn(['user', 'assistant'])
  role: string;

  @IsString()
  @Length(1, 300)
  content: string;
}

class LastShownItemDto {
  @IsInt()
  @Min(1)
  @Max(10)
  position: number;

  @IsString()
  @Length(1, 120)
  name: string;
}

export class LastResultsDto {
  @IsString()
  @Length(1, 40)
  label: string;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => LastShownItemDto)
  items: LastShownItemDto[];
}

/** How the customer sounded, measured by the app from the recording it just
 * uploaded. Sent only for voice messages; a typed message carries none of
 * it, and the classifier is then told nothing about tone at all. */
export class VoiceSignalsDto {
  @IsInt()
  @Min(0)
  @Max(60_000)
  durationMs: number;

  // Words per minute over the whole clip. Capped rather than rejected at the
  // top end: a bad duration reading should degrade the mood hint, not 400 a
  // search the customer is waiting on.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(400)
  wordsPerMinute?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  loudness?: number;
}

export class ClassifyRequestDto {
  @IsString()
  @Length(1, 500)
  message: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => HistoryMessageDto)
  history?: HistoryMessageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => LastResultsDto)
  lastResults?: LastResultsDto;

  // Which regional build is asking. Deliberately not validated against the
  // known slugs: the brand only picks a display name and a dialect, so a
  // client sending one this deployment hasn't heard of should still get a
  // working answer (as the default brand, in Saudi) rather than a 400 that
  // drops it into offline
  // keyword parsing. brandFor() does the resolving and the falling back.
  @IsOptional()
  @IsString()
  @Length(1, 40)
  brand?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VoiceSignalsDto)
  voice?: VoiceSignalsDto;
}
