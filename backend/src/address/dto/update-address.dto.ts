import { PartialType } from '@nestjs/mapped-types';
import { CreateAddressDto } from './create-address.dto';

/**
 * Partial address update: every field from {@link CreateAddressDto} made
 * optional (only the keys present in the body are changed), but each is
 * validated with the same rules when supplied. `is_default` is intentionally
 * NOT part of the create DTO, so it can't be set here — the default is changed
 * only via the dedicated set-default endpoint.
 */
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
