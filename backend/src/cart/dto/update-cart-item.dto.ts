import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_CART_ITEM_QUANTITY } from '../../constants/values.constant';

/**
 * Update-quantity payload. Bounded `1 ≤ quantity ≤ MAX_CART_ITEM_QUANTITY` at
 * the DTO layer; the variant's current stock is the real ceiling and is checked
 * in {@link CartService} (a quantity above stock is rejected with a 400).
 */
export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CART_ITEM_QUANTITY)
  quantity!: number;
}
