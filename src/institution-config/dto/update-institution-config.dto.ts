import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// All fields optional: PATCH /institution-config applies a partial update to
// the single config row (see InstitutionConfigService.update()).
export class UpdateInstitutionConfigDto {
  @IsOptional()
  @IsString()
  academyName?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  headerLines?: string[];

  @IsOptional()
  @IsString()
  signatoryName?: string;

  @IsOptional()
  @IsString()
  signatoryTitle?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  contactFooter?: string;

  @IsOptional()
  @IsString()
  gradeScaleText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  minApproving?: number;

  @IsOptional()
  @IsString()
  approvedLabel?: string;

  @IsOptional()
  @IsString()
  failedLabel?: string;
}
