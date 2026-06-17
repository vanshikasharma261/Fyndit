import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SEARCH_MAX_LENGTH } from '../../constants/values.constant';

/**
 * Query params for the category filters (facets) endpoint. Only `search` is
 * accepted so facets can reflect an active search while staying in the same
 * scope. The global pipe's `whitelist` keeps this the single source of truth.
 */
export class CategoryFiltersQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  search?: string;
}
