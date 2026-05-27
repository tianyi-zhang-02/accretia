import type { AccountType } from '@/lib/validation/accounts';

/**
 * Database row shape for `public.accounts`. Until we hook up
 * `supabase gen types typescript`, we maintain this by hand.
 */
export type Account = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  archived_at: string | null;
  created_at: string;
};
