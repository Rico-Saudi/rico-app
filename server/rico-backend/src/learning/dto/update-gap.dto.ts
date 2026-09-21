import { IsIn } from 'class-validator';

/** The owner's two verdicts on a gap they don't want a training run to keep
 * proposing: put it back in the queue, or stop showing it. Anything else a
 * gap becomes ('proposed', 'taught') is set by the system, not by hand. */
export class UpdateGapDto {
  @IsIn(['open', 'ignored'])
  status: string;
}
