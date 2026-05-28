import { z } from 'zod';

export const sendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
export type SendOtpInput = z.infer<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // Supabase emits 8-digit numeric OTPs for our project's email template.
  // Strict regex — any other length is rejected before we hit Supabase.
  token: z
    .string()
    .trim()
    .regex(/^\d{8}$/, 'token must be exactly 8 digits'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
