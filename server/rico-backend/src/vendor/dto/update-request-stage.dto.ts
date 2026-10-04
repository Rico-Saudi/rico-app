import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { REQUEST_STAGES, RequestStage } from '../../requests/schemas/request.schema';

export class UpdateRequestStageDto {
  @IsIn(REQUEST_STAGES.filter((s) => s !== 'new'))
  stage: Exclude<RequestStage, 'new'>;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
