import { ApiProperty } from '@nestjs/swagger';
import { SignatureFieldType, SignerRole } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SignatureTagInputDto {
  @ApiProperty({ enum: SignerRole })
  @IsEnum(SignerRole)
  role: SignerRole;

  @ApiProperty({ enum: SignatureFieldType })
  @IsEnum(SignatureFieldType)
  type: SignatureFieldType;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  page: number;

  @ApiProperty()
  @IsNumber()
  x: number;

  @ApiProperty()
  @IsNumber()
  y: number;

  @ApiProperty()
  @IsNumber()
  width: number;

  @ApiProperty()
  @IsNumber()
  height: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class AddSignatureTagsDto {
  @ApiProperty({ type: [SignatureTagInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignatureTagInputDto)
  tags: SignatureTagInputDto[];
}
