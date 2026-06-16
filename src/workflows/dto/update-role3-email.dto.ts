import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class UpdateRole3EmailDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}
