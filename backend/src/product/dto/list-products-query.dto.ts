import { BadRequestException } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ProductMessages } from '../../constants/messages.constant';
import { SEARCH_MAX_LENGTH } from '../../constants/values.constant';

/**
 * Parses the URL-encoded `attributes` JSON map into a typed
 * `Record<string, string[]>`. Rejects malformed JSON or a wrong shape with a
 * 400 so a stale/handcrafted URL never reaches the query builder.
 */
function parseAttributesParam(
  value: unknown,
): Record<string, string[]> | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(ProductMessages.invalidAttributesFilter);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new BadRequestException(ProductMessages.invalidAttributesFilter);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BadRequestException(ProductMessages.invalidAttributesFilter);
  }

  const result: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(parsed)) {
    if (
      !Array.isArray(values) ||
      !values.every((item) => typeof item === 'string')
    ) {
      throw new BadRequestException(ProductMessages.invalidAttributesFilter);
    }
    result[key] = values;
  }

  return result;
}

/**
 * Accepted query parameters for the product listing endpoint. The global
 * `ValidationPipe` runs `whitelist` + `forbidNonWhitelisted`, so this DTO is the
 * single source of accepted params — attribute filters are deliberately
 * collapsed into one `attributes` param so the whitelist stays intact while
 * supporting arbitrary, category-defined attribute names.
 */
export class ListProductsQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseAttributesParam(value))
  attributes?: Record<string, string[]>;
}
