import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** `GET /order` query — 1-based page for the paginated order history. */
export class ListOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
