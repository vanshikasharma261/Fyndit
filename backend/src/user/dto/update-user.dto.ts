import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ValidationMessages } from '../../constants/messages.constant';

/**
 * Partial profile update. Every field is optional — only the keys present in
 * the body are changed — but each is validated when supplied, reusing the same
 * validators/messages as `SignupDto`.
 *
 * The global `ValidationPipe` runs with `whitelist` + `forbidNonWhitelisted`,
 * so `password`, ids and any other key are rejected (400) — a user cannot
 * escalate by posting extra fields.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  first_name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  last_name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  user_name?: string;

  @IsOptional()
  @IsEmail({}, { message: ValidationMessages.emailInvalid })
  email?: string;

  @IsOptional()
  @Matches(/^\d{10}$/, { message: ValidationMessages.phoneInvalid })
  phone?: string;
}
