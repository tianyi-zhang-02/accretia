import { z } from 'zod';

export const ACCOUNT_TYPES = [
  'cash',
  'savings',
  'brokerage',
  'retirement',
  'crypto',
  'other',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(ACCOUNT_TYPES),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3)
    .regex(/^[A-Z]{3}$/),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.archived !== undefined, {
    message: 'no fields to update',
  });
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
