import { z } from 'zod';

export const sendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
export type SendOtpInput = z.infer<typeof sendOtpSchema>;

// Supabase emits 8-digit numeric OTPs for our project's email template.
// Strict regex — any other length is rejected before we hit Supabase.
const tokenField = z.string().trim().regex(/^\d{8}$/, 'token must be exactly 8 digits');

/**
 * Full server-side schema for POST /api/auth/verify-otp — both fields are
 * validated together because both arrive in the same JSON body.
 */
export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  token: tokenField,
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/**
 * Client-only schema for the stage-2 OTP form. The email isn't a form field
 * on that stage (it's carried over from stage 1 in component state), so
 * validating against the full server schema would silently fail
 * `handleSubmit` on an empty email and the user would see nothing happen.
 */
export const verifyOtpClientSchema = z.object({ token: tokenField });
export type VerifyOtpClientInput = z.infer<typeof verifyOtpClientSchema>;
