import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { HistoryMessageDto } from '../../classify/dto/classify-request.dto';

class ComposeItemDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsNumber()
  distanceMeters?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  priceLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsInt()
  ratingCount?: number;

  @IsOptional()
  @IsBoolean()
  openNow?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  dealLabel?: string;

  // Present only for intentKind='professional' — the trade of the person
  // this item describes ("دهّان"). Places never carry it.
  @IsOptional()
  @IsString()
  @Length(1, 60)
  professionLabel?: string;
}

export class ComposeRequestDto {
  @IsString()
  @Length(1, 500)
  message: string;

  @IsIn(['place', 'deals', 'professional'])
  intentKind: string;

  @IsString()
  @Length(1, 60)
  intentLabel: string;

  @IsIn(['nearest', 'cheapest', 'open_now', 'best_rated'])
  rank: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ComposeItemDto)
  items: ComposeItemDto[];

  @IsBoolean()
  truncated: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => HistoryMessageDto)
  history?: HistoryMessageDto[];

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

  // Where the user is, so the reply can mention the weather when it's worth
  // mentioning. Optional on purpose: app builds older than this feature send
  // neither, and the reply is composed exactly as before without them.
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}
