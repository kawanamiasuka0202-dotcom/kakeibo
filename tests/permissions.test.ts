import { describe, expect, it } from 'vitest';
import {
  canAddPartner,
  canEditComment,
  canEditGoal,
  canEditTodo,
  canEditTransaction,
  canReadHousehold,
  canViewGoal,
  canViewTransaction,
} from '@/lib/permissions';
import { goal, HOUSEHOLD, ME, OUTSIDER, PARTNER, transaction } from './factories';

const meViewer = { userId: ME, householdId: HOUSEHOLD };
const partnerViewer = { userId: PARTNER, householdId: HOUSEHOLD };
const outsiderViewer = { userId: OUTSIDER, householdId: 'household-other' };
const noHouseholdViewer = { userId: OUTSIDER, householdId: null };

describe('家計グループの境界', () => {
  it('メンバーは自分のグループを読める', () => {
    expect(canReadHousehold(meViewer, HOUSEHOLD)).toBe(true);
  });

  it('別のグループのユーザーは読めない', () => {
    expect(canReadHousehold(outsiderViewer, HOUSEHOLD)).toBe(false);
  });

  it('グループに所属していないユーザーは読めない', () => {
    expect(canReadHousehold(noHouseholdViewer, HOUSEHOLD)).toBe(false);
  });
});

describe('取引の権限', () => {
  const tx = transaction({ createdBy: ME });

  it('同じグループのメンバーは閲覧できる', () => {
    expect(canViewTransaction(meViewer, tx)).toBe(true);
    expect(canViewTransaction(partnerViewer, tx)).toBe(true);
  });

  it('招待されていないユーザーは閲覧できない', () => {
    expect(canViewTransaction(outsiderViewer, tx)).toBe(false);
  });

  it('パートナーは相手が登録した記録も修正できる（夫婦での運用のため）', () => {
    expect(canEditTransaction(partnerViewer, tx)).toBe(true);
  });

  it('別グループのユーザーは編集できない', () => {
    expect(canEditTransaction(outsiderViewer, tx)).toBe(false);
  });
});

describe('貯金目標の権限', () => {
  const sharedGoal = goal({ scope: 'shared', ownerId: null });
  const myPersonalGoal = goal({ scope: 'personal', ownerId: ME });

  it('共有目標は2人とも見られる', () => {
    expect(canViewGoal(meViewer, sharedGoal)).toBe(true);
    expect(canViewGoal(partnerViewer, sharedGoal)).toBe(true);
  });

  it('個人目標は本人だけが見られる', () => {
    expect(canViewGoal(meViewer, myPersonalGoal)).toBe(true);
    expect(canViewGoal(partnerViewer, myPersonalGoal)).toBe(false);
    expect(canEditGoal(partnerViewer, myPersonalGoal)).toBe(false);
  });

  it('別グループのユーザーはどちらも見られない', () => {
    expect(canViewGoal(outsiderViewer, sharedGoal)).toBe(false);
    expect(canViewGoal(outsiderViewer, myPersonalGoal)).toBe(false);
  });
});

describe('コメント・Todo の権限', () => {
  it('コメントの編集・削除は投稿者本人のみ', () => {
    const comment = { householdId: HOUSEHOLD, userId: ME };
    expect(canEditComment(meViewer, comment)).toBe(true);
    expect(canEditComment(partnerViewer, comment)).toBe(false);
  });

  it('Todo は同じグループなら誰でも操作できる', () => {
    expect(canEditTodo(partnerViewer, { householdId: HOUSEHOLD })).toBe(true);
    expect(canEditTodo(outsiderViewer, { householdId: HOUSEHOLD })).toBe(false);
  });
});

describe('パートナー参加の可否', () => {
  it('1人のグループならパートナーが参加できる', () => {
    expect(canAddPartner(meViewer, HOUSEHOLD, 1)).toBe(true);
  });

  it('すでに2人なら参加できない', () => {
    expect(canAddPartner(meViewer, HOUSEHOLD, 2)).toBe(false);
  });

  it('メンバー以外のグループには追加できない', () => {
    expect(canAddPartner(outsiderViewer, HOUSEHOLD, 1)).toBe(false);
  });
});
