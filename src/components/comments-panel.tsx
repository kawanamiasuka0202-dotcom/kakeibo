'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, CornerDownRight, Heart, Pencil, Send, Trash2, X } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Select, Textarea } from '@/components/ui/field';
import { Badge, EmptyState } from '@/components/ui/misc';
import { formatRelativeJst } from '@/lib/date';
import { formatYen } from '@/lib/money';
import type { Comment, LinkType } from '@/lib/types';
import { cn } from '@/lib/utils';

export function CommentsPanel() {
  const { data, me, backend, run, busy, isShared, memberName } = useHousehold();
  const [body, setBody] = React.useState('');
  const [linkType, setLinkType] = React.useState<LinkType | ''>('');
  const [linkId, setLinkId] = React.useState('');
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editBody, setEditBody] = React.useState('');
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [replyBody, setReplyBody] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState<Comment | null>(null);

  const reactions = data.commentReactions ?? [];

  /** 親コメント（新しい順）と、その返信（古い順）に分けて並べる */
  const threads = React.useMemo(() => {
    const roots = data.comments
      .filter((c) => !c.parentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const repliesByParent = new Map<string, Comment[]>();
    for (const c of data.comments) {
      if (!c.parentId) continue;
      const list = repliesByParent.get(c.parentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentId, list);
    }
    for (const list of repliesByParent.values()) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return roots.map((root) => ({ root, replies: repliesByParent.get(root.id) ?? [] }));
  }, [data.comments]);

  const unread = React.useMemo(
    () =>
      data.comments.filter(
        (c) => c.userId !== me.id && (!data.lastCommentReadAt || c.createdAt > data.lastCommentReadAt),
      ),
    [data.comments, me.id, data.lastCommentReadAt],
  );

  // 画面を開いた時点で既読にする
  const latestCreatedAt = threads[0]?.root.createdAt;
  React.useEffect(() => {
    if (!backend || unread.length === 0 || !latestCreatedAt) return;
    void backend.markCommentsRead(new Date().toISOString());
    // 既読化は画面表示時の1回だけでよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestCreatedAt]);

  const linkOptions = React.useMemo(() => {
    if (linkType === 'transaction') {
      return data.transactions
        .slice(0, 30)
        .map((t) => ({ id: t.id, label: `${t.occurredOn} ${t.description || '記録'} ${formatYen(t.amountYen)}` }));
    }
    if (linkType === 'savings_goal') {
      return data.savingsGoals.map((g) => ({ id: g.id, label: `${g.icon} ${g.name}` }));
    }
    if (linkType === 'todo') {
      return data.todos.filter((t) => !t.archivedAt).map((t) => ({ id: t.id, label: t.title }));
    }
    return [];
  }, [linkType, data.transactions, data.savingsGoals, data.todos]);

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || !backend || busy) return;
    const result = await run(() =>
      backend.create('comments', {
        householdId: data.household.id,
        userId: me.id,
        body: trimmed,
        linkType: linkType || null,
        linkId: linkType ? linkId || null : null,
        parentId: null,
      }),
    );
    if (result !== null) {
      setBody('');
      setLinkType('');
      setLinkId('');
    }
  };

  const postReply = async (parentId: string) => {
    const trimmed = replyBody.trim();
    if (!trimmed || !backend || busy) return;
    const result = await run(() =>
      backend.create('comments', {
        householdId: data.household.id,
        userId: me.id,
        body: trimmed,
        linkType: null,
        linkId: null,
        parentId,
      }),
    );
    if (result !== null) {
      setReplyBody('');
      setReplyTo(null);
    }
  };

  const saveEdit = async (comment: Comment) => {
    const trimmed = editBody.trim();
    if (!trimmed || !backend) return;
    const result = await run(() => backend.update('comments', comment.id, { body: trimmed }), {
      success: 'コメントを更新しました',
    });
    if (result !== null) setEditing(null);
  };

  const toggleLike = async (comment: Comment) => {
    if (!backend) return;
    const liked = reactions.some((r) => r.commentId === comment.id && r.userId === me.id);
    await run(() => backend.setCommentReaction(comment.id, !liked));
  };

  const remove = async () => {
    if (!deleteTarget || !backend) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await run(() => backend.remove('comments', target.id), { success: 'コメントを削除しました' });
  };

  const linkLabel = (comment: Comment): { label: string; href?: string } | null => {
    if (!comment.linkType || !comment.linkId) return null;
    if (comment.linkType === 'transaction') {
      const t = data.transactions.find((x) => x.id === comment.linkId);
      return t
        ? { label: `記録: ${t.description || formatYen(t.amountYen)}`, href: `/expenses/${t.id}` }
        : { label: '記録（削除済み）' };
    }
    if (comment.linkType === 'savings_goal') {
      const g = data.savingsGoals.find((x) => x.id === comment.linkId);
      return g ? { label: `目標: ${g.name}`, href: `/savings/${g.id}` } : { label: '目標（削除済み）' };
    }
    const todo = data.todos.find((x) => x.id === comment.linkId);
    return todo ? { label: `Todo: ${todo.title}` } : { label: 'Todo（削除済み）' };
  };

  /** 1件分の表示（親コメントにも返信にも使う） */
  const renderComment = (comment: Comment, isReply: boolean) => {
    const mine = comment.userId === me.id;
    const link = linkLabel(comment);
    const isUnread = unread.some((u) => u.id === comment.id);
    const likes = reactions.filter((r) => r.commentId === comment.id);
    const likedByMe = likes.some((r) => r.userId === me.id);
    const likedByNames = likes.map((r) => memberName(r.userId)).join('・');

    return (
      <>
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-bold">{memberName(comment.userId)}</span>
          <span className="text-xs text-muted">{formatRelativeJst(comment.createdAt)}</span>
          {comment.updatedAt !== comment.createdAt ? (
            <span className="text-xs text-muted">(編集済み)</span>
          ) : null}
          {isUnread ? <Badge tone="primary">新着</Badge> : null}
        </div>

        {editing === comment.id ? (
          <div className="space-y-2">
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              maxLength={1000}
              rows={3}
              aria-label="コメントを編集"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveEdit(comment)} disabled={busy}>
                <Check className="size-4" />
                保存
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                <X className="size-4" />
                やめる
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{comment.body}</p>
        )}

        {link ? (
          <p className="mt-2 text-xs">
            {link.href ? (
              <Link href={link.href} className="text-primary underline">
                {link.label}
              </Link>
            ) : (
              <span className="text-muted">{link.label}</span>
            )}
          </p>
        ) : null}

        {editing === comment.id ? null : (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => toggleLike(comment)}
              disabled={busy}
              aria-pressed={likedByMe}
              aria-label={likedByMe ? 'いいねを取り消す' : 'いいねする'}
              title={likes.length > 0 ? `${likedByNames} がいいねしました` : undefined}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-semibold transition-colors',
                likedByMe ? 'bg-danger-soft text-danger' : 'text-muted active:bg-surface-muted',
              )}
            >
              <Heart className={cn('size-4', likedByMe && 'fill-current')} />
              {likes.length > 0 ? <span className="tabular">{likes.length}</span> : 'いいね'}
            </button>

            {!isReply ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setReplyTo(replyTo === comment.id ? null : comment.id);
                  setReplyBody('');
                }}
              >
                <CornerDownRight className="size-4" />
                返信
              </Button>
            ) : null}

            {mine ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(comment.id);
                    setEditBody(comment.body);
                  }}
                >
                  <Pencil className="size-4" />
                  編集
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(comment)}>
                  <Trash2 className="size-4 text-danger" />
                  <span className="text-danger">削除</span>
                </Button>
              </>
            ) : null}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={post} className="space-y-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder={
              isShared ? '家計について気づいたことを書きましょう' : '自分用のメモを書きましょう'
            }
            aria-label="コメント本文"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={linkType}
              onChange={(e) => {
                setLinkType(e.target.value as LinkType | '');
                setLinkId('');
              }}
              aria-label="関連付けの種類"
            >
              <option value="">関連付けなし</option>
              <option value="transaction">家計簿の記録</option>
              <option value="savings_goal">貯金目標</option>
              <option value="todo">Todo</option>
            </Select>
            <Select
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              disabled={!linkType}
              aria-label="関連付ける対象"
            >
              <option value="">選択しない</option>
              {linkOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="block" disabled={busy || body.trim() === ''}>
            <Send className="size-5" />
            投稿する
          </Button>
        </form>
      </Card>

      {threads.length === 0 ? (
        <EmptyState
          title="まだコメントがありません"
          description={
            isShared
              ? '「今月は外食が多いね」など、短いやりとりに使えます。'
              : '買い物の反省や気づきをメモとして残せます。'
          }
        />
      ) : (
        <ul className="space-y-3">
          {threads.map(({ root, replies }) => {
            const rootUnread = unread.some((u) => u.id === root.id);
            return (
              <li key={root.id}>
                <Card className={rootUnread ? 'border-primary/40' : undefined}>
                  {renderComment(root, false)}

                  {replies.length > 0 ? (
                    <ul className="mt-3 space-y-3 border-l-2 border-border pl-3">
                      {replies.map((reply) => (
                        <li key={reply.id}>{renderComment(reply, true)}</li>
                      ))}
                    </ul>
                  ) : null}

                  {replyTo === root.id ? (
                    <div className="mt-3 space-y-2 border-l-2 border-primary pl-3">
                      <Textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        maxLength={1000}
                        rows={2}
                        autoFocus
                        placeholder={`${memberName(root.userId)} さんに返信…`}
                        aria-label="返信の本文"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => postReply(root.id)}
                          disabled={busy || replyBody.trim() === ''}
                        >
                          <Send className="size-4" />
                          返信する
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                          <X className="size-4" />
                          やめる
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="このコメントを削除しますか？"
        description={
          deleteTarget && data.comments.some((c) => c.parentId === deleteTarget.id)
            ? '返信といいねも一緒に削除されます。元に戻せません。'
            : '削除すると元に戻せません。'
        }
        onConfirm={remove}
        busy={busy}
      />
    </div>
  );
}
