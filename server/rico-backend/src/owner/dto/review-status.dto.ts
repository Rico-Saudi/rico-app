import { IsIn } from 'class-validator';

export class ReviewDealStatusDto {
  @IsIn(['active', 'rejected'])
  status: string;
}

export class ReviewClaimStatusDto {
  @IsIn(['active', 'rejected', 'suspended'])
  status: string;
}
