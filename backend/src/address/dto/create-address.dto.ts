import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { AddressType } from '../../generated/prisma/enums';
import {
  INDIAN_STATES,
  SUPPORTED_COUNTRY,
} from '../../constants/location.constant';
import { ValidationMessages } from '../../constants/messages.constant';

/**
 * Add-address payload. Mirrors the signup address block so validation stays
 * consistent across the app: state/country are constrained to the supported
 * set and the zip is a strict 6-digit Indian PIN. `is_default` is NOT accepted
 * here — the first address auto-defaults and the default is changed only via the
 * dedicated set-default endpoint.
 */
export class CreateAddressDto {
  @IsEnum(AddressType)
  address_type!: AddressType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  line2?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  city!: string;

  @IsIn(INDIAN_STATES, { message: ValidationMessages.stateInvalid })
  state!: string;

  @IsIn([SUPPORTED_COUNTRY], { message: ValidationMessages.countryInvalid })
  country!: string;

  @Matches(/^\d{6}$/, { message: ValidationMessages.zipInvalid })
  zip!: string;
}
