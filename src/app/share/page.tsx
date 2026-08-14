'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useHousehold } from '@/components/app-provider';
import { PageHeader } from '@/components/common';
import { CommentsPanel } from '@/components/comments-panel';
import { TodosPanel } from '@/components/todos-panel';
import { LoadingBlock, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';

function ShareInner() {
  const { isShared, data } = useHousehold();
  const params = useSearchParams();
  // Todo を先に開く（買い物・支払いの確認に使う頻度が高いため）
  const [tab, setTab] = React.useState(params.get('tab') === 'comment' ? 'comment' : 'todo');

  const openTodoCount = data.todos.filter((t) => !t.done && !t.archivedAt).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="共有"
        subtitle={
          isShared ? '2人で見られるコメントとTodoです。' : '自分用のメモとTodoとして使えます。'
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="todo">Todo{openTodoCount > 0 ? `（${openTodoCount}）` : ''}</TabsTrigger>
          <TabsTrigger value="comment">コメント</TabsTrigger>
        </TabsList>
        <TabsContent value="todo" className="mt-4">
          <TodosPanel />
        </TabsContent>
        <TabsContent value="comment" className="mt-4">
          <CommentsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ShareInner />
    </Suspense>
  );
}
