import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PauseOrdersDto {
  @IsBoolean()
  paused: boolean;

  // Up to a week; anything longer is "until I reopen", which is null.
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(7 * 24 * 60)
  minutes?: number | null;

  // Shown to the customer who tries to order — "مسكّرين للجرد، نرجع ٦م".
  @IsOptional()
  @IsString()
  @MaxLength(140)
  note?: string;
}
