'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useToast } from '@/components/ui/toast';
import type { Account } from '@/lib/types/account';

import TransactionForm from '../transaction-form';

export default function NewTransactionClient({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const toast = useToast();

  return (
    <div className="flex flex-col gap-4">
      <TransactionForm
        accounts={accounts}
        onSaved={() => {
          toast.success('Transaction added.');
          router.replace('/transactions');
          router.refresh();
        }}
        onError={toast.error}
      />
      <Link href="/transactions" className="text-muted hover:text-foreground self-start text-xs">
        ← Back to transactions
      </Link>
    </div>
  );
}
