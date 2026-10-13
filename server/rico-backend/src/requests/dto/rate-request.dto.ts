import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RateRequestDto {
  @IsInt()
  @Min(1)
  @Max(5)
  stars: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  comment?: string;
}
