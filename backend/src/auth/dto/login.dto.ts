import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ValidationMessages } from '../../constants/messages.constant';

/**
 * Login payload. Credentials are intentionally validated loosely here — the
 * service rejects bad combinations with a single generic message so we don't
 * leak which field was wrong.
 */
export class LoginDto {
  @IsEmail({}, { message: ValidationMessages.emailInvalid })
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
