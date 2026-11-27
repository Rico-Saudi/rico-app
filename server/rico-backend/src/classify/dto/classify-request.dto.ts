import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';

// The limits below are generous on purpose, and the service trims to what
// the model actually needs (see trimContext in classify.service). They used
// to be the trim: a bot reply over 300 characters in the history, or a
// merged answer showing more than ten places, failed validation with a 400 —
// and the app reads any non-200 as "server down" and drops to its weakest
// offline parser, for every message after that until the list scrolled away.
export class HistoryMessageDto {
  @IsIn(['user', 'assistant'])
  role: string;

  @IsString()
  @Length(1, 4000)
  content: string;
}

export const MAX_LAST_RESULTS = 30;

class LastShownItemDto {
  @IsInt()
  @Min(1)
  @Max(MAX_LAST_RESULTS)
  position: number;

  // May be empty (a deal with no shop name yet): positions must stay
  // contiguous, and one nameless row must not 400 the whole message.
  @IsString()
  @Length(0, 300)
  name: string;
}

export class LastResultsDto {
  // May be empty: a merged multi-search answer has no single label.
  @IsString()
  @Length(0, 200)
  label: string;

  @IsArray()
  @ArrayMaxSize(MAX_LAST_RESULTS)
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

class BasketItemDto {
  @IsString()
  @Length(1, 80)
  name: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}

/** The basket the customer has open right now, as the app holds it. Without
 * it the model never saw the real basket — only chat text — and an edit made
 * on the card ("+" on a line) was invisible to "شيل البيبسي" a turn later. */
export class BasketDto {
  @IsString()
  @Length(0, 120)
  placeName: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BasketItemDto)
  items: BasketItemDto[];
}

export class ClassifyRequestDto {
  // Accepted up to 2000 and trimmed for the model (MAX_MESSAGE_CHARS): a
  // customer who pastes a long shopping list should get an answer about its
  // start, not a 400.
  @IsString()
  @Length(1, 2000)
  message: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HistoryMessageDto)
  history?: HistoryMessageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => LastResultsDto)
  lastResults?: LastResultsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BasketDto)
  basket?: BasketDto;

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
