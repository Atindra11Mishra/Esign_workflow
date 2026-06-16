import { ApiProperty } from '@nestjs/swagger';
import { WorkflowStatus } from '@prisma/client';

export class WorkflowStatusDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: WorkflowStatus })
  status: WorkflowStatus;

  @ApiProperty({ required: false, nullable: true })
  currentSignerRole?: string | null;
}
