/**
 * 権限判定
 *
 * ここでの判定は「画面上でボタンを出すかどうか」を決めるためのもの。
 * 実際の防御は Supabase の Row Level Security（supabase/migrations/0003_rls.sql）で行う。
 * 同じ規則を 2 箇所に書くことになるが、クライアント側だけで完結させないという方針を守るため意図的にそうしている。
 */
import type { SavingsGoal, Transaction, UUID } from './types';

export interface Viewer {
  userId: UUID;
  householdId: UUID | null;
}

/** その家計グループのデータを読めるか。 */
export function canReadHousehold(viewer: Viewer, householdId: UUID): boolean {
  return viewer.householdId !== null && viewer.householdId === householdId;
}

/** 取引を閲覧できるか。同じ家計グループのメンバーなら共有・個人どちらの区分でも閲覧できる。 */
export function canViewTransaction(viewer: Viewer, tx: Pick<Transaction, 'householdId'>): boolean {
  return canReadHousehold(viewer, tx.householdId);
}

/**
 * 取引を編集・削除できるか。
 * 夫婦で家計を管理する性質上、同じグループのメンバーなら相手の入力も直せる。
 * 誰が作成・更新したかは createdBy / updatedBy に必ず残す。
 */
export function canEditTransaction(viewer: Viewer, tx: Pick<Transaction, 'householdId'>): boolean {
  return canReadHousehold(viewer, tx.householdId);
}

/**
 * 貯金目標を閲覧できるか。
 * 個人目標（scope='personal'）は所有者だけが見られる。
 */
export function canViewGoal(
  viewer: Viewer,
  goal: Pick<SavingsGoal, 'householdId' | 'scope' | 'ownerId'>,
): boolean {
  if (!canReadHousehold(viewer, goal.householdId)) return false;
  if (goal.scope === 'personal') return goal.ownerId === viewer.userId;
  return true;
}

export function canEditGoal(
  viewer: Viewer,
  goal: Pick<SavingsGoal, 'householdId' | 'scope' | 'ownerId'>,
): boolean {
  return canViewGoal(viewer, goal);
}

/** コメントを編集・削除できるか（自分の投稿のみ）。 */
export function canEditComment(
  viewer: Viewer,
  comment: { householdId: UUID; userId: UUID },
): boolean {
  return canReadHousehold(viewer, comment.householdId) && comment.userId === viewer.userId;
}

/** Todo は同じグループのメンバーなら誰でも編集できる（担当者に関係なく完了にできる）。 */
export function canEditTodo(viewer: Viewer, todo: { householdId: UUID }): boolean {
  return canReadHousehold(viewer, todo.householdId);
}

/** 家計グループの設定（月の開始日・繰越し・パートナー解除）を変更できるか。 */
export function canManageHousehold(
  viewer: Viewer,
  household: { id: UUID; ownerId: UUID },
  role: 'owner' | 'member' | null,
): boolean {
  if (!canReadHousehold(viewer, household.id)) return false;
  return role === 'owner' || household.ownerId === viewer.userId || role === 'member';
}

/** パートナーが参加できるのは、まだ2人未満のグループだけ。 */
export function canAddPartner(viewer: Viewer, householdId: UUID, memberCount: number): boolean {
  return canReadHousehold(viewer, householdId) && memberCount < 2;
}
