import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LESSON_DIALECTS } from '../schemas/lesson.schema';

/**
 * تعديلات اختيارية على الاقتراح لحظة الموافقة.
 *
 * الاقتراح جاي من نموذج، والمالك غالباً بيوافق عليه كما هو — بس أحياناً
 * الصياغة تحتاج شدّة وحدة (كلمة زايدة، لهجة غلط). إجباره يرفض ويكتب من
 * الصفر عشان كلمة معناه إن الاقتراحات القريبة من الصح بتضيع.
 */
export class ApproveLessonDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  message?: string;

  @IsOptional()
  @IsIn(LESSON_DIALECTS)
  dialect?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  reply?: string;

  /** Re-validated against the live classifier rules before it is saved — see
   * LearningService.approve. */
  @IsOptional()
  @IsArray()
  intents?: unknown[];
}
