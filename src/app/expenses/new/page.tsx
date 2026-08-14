'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useHousehold } from '@/components/app-provider';
import { PageHeader } from '@/components/common';
import { TransactionForm } from '@/components/transaction-form';
import { LoadingBlock } from '@/components/ui/misc';

function NewTransactionInner() {
  const { data } = useHousehold();
  const params = useSearchParams();
  const fromId = params.get('from');
  const source = fromId ? data.transactions.find((t) => t.id === fromId) : undefined;

  return (
    <>
      <PageHeader
        title={source ? '複製して登録' : '登録'}
        subtitle={source ? '内容をそのまま引き継ぎました。日付や金額を確認してください。' : undefined}
        back="/expenses"
      />
      <TransactionForm
        mode="create"
        initial={source ? { ...source, occurredOn: undefined, id: undefined } : undefined}
      />
    </>
  );
}

export default function NewTransactionPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewTransactionInner />
    </Suspense>
  );
}
