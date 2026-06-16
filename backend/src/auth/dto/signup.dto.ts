import {
  IsEmail,
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
 * Signup payload: account credentials, profile fields and the user's default
 * address (created alongside the account per the registration flow).
 */
export class SignupDto {
  @IsEmail({}, { message: ValidationMessages.emailInvalid })
  email!: string;

  // Min 8 chars with at least one uppercase, lowercase, number and special char.
  // Capped at 72 bytes — bcrypt silently truncates beyond that.
  @MaxLength(72, { message: ValidationMessages.passwordWeak })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message: ValidationMessages.passwordWeak,
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  user_name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  first_name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  last_name!: string;

  @Matches(/^\d{10}$/, { message: ValidationMessages.phoneInvalid })
  phone!: string;

  // ----- Default address -----

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

  @IsOptional()
  @IsEnum(AddressType)
  address_type?: AddressType;
}
