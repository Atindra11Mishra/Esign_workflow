import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';

export class DocusealWebhookDto {
  @ApiProperty({
    examples: ['form.completed', 'form.declined', 'submission.completed'],
  })
  @IsString()
  event_type: string;

  @ApiProperty()
  @IsString()
  timestamp: string;

  @ApiProperty({ type: Object })
  @IsObject()
  data: Record<string, any>;
}
