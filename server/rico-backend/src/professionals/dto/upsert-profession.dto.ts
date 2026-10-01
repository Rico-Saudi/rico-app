import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

// A slug is stored on every profile that offers the trade, so it is
// restricted to what stays safe in a URL, a Mongo query and the classifier's
// JSON — lowercase ASCII, digits, underscores.
export const PROFESSION_SLUG_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

export class CreateProfessionDto {
  @Matches(PROFESSION_SLUG_PATTERN, { message: 'slug_invalid' })
  slug: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  label: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  group: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  aliases?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

// Slug is absent on purpose: it is the identity of the row and is stored on
// profiles, so renaming one would orphan everyone on it. To retire a trade,
// deactivate it; to replace one, add the new slug and deactivate the old.
export class UpdateProfessionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  group?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  aliases?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
