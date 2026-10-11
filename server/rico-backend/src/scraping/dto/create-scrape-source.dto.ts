import { IsBoolean, IsMongoId, IsOptional, IsUrl } from 'class-validator';

export class CreateScrapeSourceDto {
  @IsMongoId()
  businessId: string;

  // https only: a scraped price is already a weak claim, and one collected
  // over a connection anyone could rewrite is not a claim at all.
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url: string;

  @IsOptional()
  @IsBoolean()
  renderJs?: boolean;
}
