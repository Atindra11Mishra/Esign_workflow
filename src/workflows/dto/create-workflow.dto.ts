import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateWorkflowDto {
  @ApiProperty()
  @IsUUID()
  documentId: string;

  @ApiProperty()
  @IsEmail()
  role1Email: string;

  @ApiProperty()
  @IsEmail()
  role2Email: string;

  @ApiPropertyOptional({
    default: 'placeholder-role-3@example.invalid',
    description: 'Placeholder value stored until Role 2 supplies the real Role 3 email.',
  })
  @IsOptional()
  @IsEmail()
  role3PlaceholderEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
