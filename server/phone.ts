import { z } from 'zod';

/** Philippine mobile numbers, one format everywhere: exactly 11 digits starting with 09 (spaces and dashes typed in are dropped). */
export const PH_MOBILE_MESSAGE = 'Use an 11-digit mobile number starting with 09, like 09171234567.';
export const phMobileDigits = (value: string) => value.replace(/[\s-]/g, '');
export const isPhMobile = (value: string) => /^09\d{9}$/.test(phMobileDigits(value));

/** Optional mobile: blank stays blank, anything else must be a valid number and is stored as its 11 digits. */
export const optionalMobile = (max = 20) => z.string().trim().max(max).default('')
  .refine((value) => !value || isPhMobile(value), PH_MOBILE_MESSAGE)
  .transform((value) => (value ? phMobileDigits(value) : ''));

/** Required mobile, stored as its 11 digits. */
export const requiredMobile = z.string().trim().refine(isPhMobile, PH_MOBILE_MESSAGE).transform(phMobileDigits);
