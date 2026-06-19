import { IsUUID } from 'class-validator';

/**
 * Add-to-cart payload. Only the variant id is accepted — quantity is not
 * client-supplied: a new line starts at 1 and an existing line is incremented
 * by the service. The global `ValidationPipe` (`whitelist` +
 * `forbidNonWhitelisted`) rejects any extra key with a 400.
 */
export class AddCartItemDto {
  @IsUUID()
  product_variant_id!: string;
}
