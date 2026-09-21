import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { GAP_STATUSES } from '../schemas/knowledge-gap.schema';
import { LESSON_STATUSES } from '../schemas/lesson.schema';

export class ListGapsDto {
  @IsOptional()
  @IsIn(GAP_STATUSES)
  status?: string;

  /** Free-text filter over the raw phrasings. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}

export class ListLessonsDto {
  @IsOptional()
  @IsIn(LESSON_STATUSES)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
