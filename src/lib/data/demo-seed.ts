import { DEFAULT_CATEGORIES } from '../categories';
import {
  addDays,
  addMonthKey,
  monthKeyOf,
  monthKeyToDbDate,
  monthPeriod,
  todayJst,
  type Ymd,
} from '../date';
import type {
  Budget,
  Category,
  Comment,
  CommentReaction,
  Household,
  HouseholdSnapshot,
  Member,
  RecurringRule,
  SavingsEntry,
  SavingsGoal,
  Todo,
  Transaction,
} from '../types';

export const DEMO_HOUSEHOLD_ID = 'demo-household';
export const DEMO_ME_ID = 'demo-user-me';
export const DEMO_PARTNER_ID = 'demo-user-partner';

/**
 * 再現性のある擬似乱数（デモデータが毎回同じになるように）。
 * 32bit の乗算は Math.imul を使う。通常の * では 2^53 を超えて精度が落ち、
 * 生成される値が偏ってしまう（特定のカテゴリだけ出ないなど）。
 */
function makeRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** 100円単位に丸めた金額 */
function roundedYen(rng: () => number, min: number, max: number): number {
  const raw = min + Math.floor(rng() * (max - min));
  return Math.round(raw / 100) * 100;
}

const SAMPLE_ITEMS: Record<string, string[]> = {
  食費: ['スーパーまるみ', '八百屋', '業務用スーパー', 'コンビニ', 'パン屋'],
  外食費: ['ラーメン一番', 'カフェ', '定食屋', '寿司', 'ファミレス'],
  日用品: ['ドラッグストア', '洗剤・トイレットペーパー', '100円ショップ'],
  住居費: ['家賃'],
  水道: ['水道料金'],
  電気: ['電気料金'],
  ガス: ['ガス料金'],
  通信費: ['携帯代', '光回線'],
  サブスクリプション: ['動画配信', '音楽配信', 'クラウド'],
  交通費: ['電車', 'バス', 'タクシー'],
  医療費: ['内科', '歯科', '薬局'],
  美容: ['美容院', '化粧品'],
  衣服: ['靴下・下着', 'アウター'],
  趣味: ['本', 'ゲーム'],
  娯楽: ['映画', '動物園', 'カラオケ'],
  交際費: ['飲み会', 'ランチ会'],
  その他: ['雑費'],
};

export function buildDemoSnapshot(today: Ymd = todayJst()): HouseholdSnapshot {
  const rng = makeRandom(20260814);
  const monthStartDay = 1;

  const household: Household = {
    id: DEMO_HOUSEHOLD_ID,
    name: 'デモ家計',
    mode: 'shared',
    monthStartDay,
    carryoverEnabled: false,
    ownerId: DEMO_ME_ID,
    createdAt: new Date().toISOString(),
  };

  const members: Member[] = [
    { userId: DEMO_ME_ID, displayName: 'あなた（デモ）', role: 'owner', joinedAt: new Date().toISOString() },
    { userId: DEMO_PARTNER_ID, displayName: 'パートナー（デモ）', role: 'member', joinedAt: new Date().toISOString() },
  ];

  const categories: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({
    id: `demo-cat-${i}`,
    householdId: DEMO_HOUSEHOLD_ID,
    name: c.name,
    kind: c.kind,
    color: c.color,
    icon: c.icon,
    sortOrder: (i + 1) * 10,
    isHidden: false,
    isSystem: true,
  }));
  const catByName = new Map(categories.map((c) => [c.name, c]));
  const cat = (name: string) => catByName.get(name)!;

  const thisMonth = monthKeyOf(today, monthStartDay);
  const months = [addMonthKey(thisMonth, -2), addMonthKey(thisMonth, -1), thisMonth];

  // ---- 予算 -------------------------------------------------------------
  const budgets: Budget[] = [];
  let budgetSeq = 0;
  const addBudget = (b: Omit<Budget, 'id' | 'householdId' | 'createdBy' | 'updatedAt'>) => {
    budgets.push({
      ...b,
      id: `demo-budget-${budgetSeq++}`,
      householdId: DEMO_HOUSEHOLD_ID,
      createdBy: DEMO_ME_ID,
      updatedAt: new Date().toISOString(),
    });
  };
  for (const key of months) {
    const month = monthKeyToDbDate(key);
    addBudget({ month, scope: 'household', userId: null, categoryId: null, amountYen: 250000 });
    addBudget({ month, scope: 'personal', userId: DEMO_ME_ID, categoryId: null, amountYen: 40000 });
    addBudget({ month, scope: 'personal', userId: DEMO_PARTNER_ID, categoryId: null, amountYen: 35000 });
    addBudget({ month, scope: 'household', userId: null, categoryId: cat('食費').id, amountYen: 60000 });
    addBudget({ month, scope: 'household', userId: null, categoryId: cat('外食費').id, amountYen: 20000 });
    addBudget({ month, scope: 'household', userId: null, categoryId: cat('日用品').id, amountYen: 12000 });
    addBudget({ month, scope: 'household', userId: null, categoryId: cat('住居費').id, amountYen: 92000 });
    addBudget({ month, scope: 'household', userId: null, categoryId: cat('交通費').id, amountYen: 12000 });
    addBudget({ month, scope: 'household', userId: null, categoryId: cat('娯楽').id, amountYen: 15000 });
  }

  // ---- 取引 -------------------------------------------------------------
  const transactions: Transaction[] = [];
  let txSeq = 0;
  const addTx = (
    t: Omit<Transaction, 'id' | 'householdId' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>,
    who = DEMO_ME_ID,
  ) => {
    const iso = new Date(`${t.occurredOn}T12:00:00+09:00`).toISOString();
    transactions.push({
      ...t,
      id: `demo-tx-${txSeq++}`,
      householdId: DEMO_HOUSEHOLD_ID,
      createdBy: who,
      updatedBy: who,
      createdAt: iso,
      updatedAt: iso,
    });
  };

  // 実際の家計に近づけるため、食費・外食費が出やすいように重み付けしている
  const dailyCategories = [
    '食費', '食費', '食費', '食費',
    '外食費', '外食費',
    '日用品', '日用品',
    '交通費', '娯楽', '医療費', '美容', '衣服', '趣味', '交際費',
  ];

  for (const key of months) {
    const period = monthPeriod(key, monthStartDay);
    const isCurrent = key.year === thisMonth.year && key.month === thisMonth.month;
    const lastDay = isCurrent ? today : period.end;

    // 固定費
    const fixed: [string, number, string][] = [
      ['住居費', 92000, '家賃'],
      ['電気', 8600, '電気料金'],
      ['ガス', 5200, 'ガス料金'],
      ['水道', 4300, '水道料金'],
      ['通信費', 11800, '携帯・光回線'],
      ['サブスクリプション', 2980, '動画配信ほか'],
    ];
    for (const [name, amount, desc] of fixed) {
      const day = addDays(period.start, 4);
      if (day > lastDay) continue;
      addTx(
        {
          type: 'expense',
          amountYen: amount,
          categoryId: cat(name).id,
          description: desc,
          occurredOn: day,
          // 共有は「家計から出したお金」なので、個人の支払いにはしない
          paidBy: null,
          shareScope: 'shared',
          paymentMethod: '口座振替',
          memo: '',
          savingsGoalId: null,
          receiptPath: null,
        },
        DEMO_ME_ID,
      );
    }

    // 給与
    const payday = addDays(period.start, 24);
    if (payday <= lastDay) {
      addTx(
        {
          type: 'income',
          amountYen: 285000,
          categoryId: cat('給与').id,
          // 共有は誰か個人に紐づけないため、誰の分かは内容に書く
          description: '給与（あなた）',
          occurredOn: payday,
          paidBy: null,
          shareScope: 'shared',
          paymentMethod: '銀行振込',
          memo: '',
          savingsGoalId: null,
          receiptPath: null,
        },
        DEMO_ME_ID,
      );
      addTx(
        {
          type: 'income',
          amountYen: 178000,
          categoryId: cat('給与').id,
          description: '給与（パートナー）',
          occurredOn: payday,
          paidBy: null,
          shareScope: 'shared',
          paymentMethod: '銀行振込',
          memo: '',
          savingsGoalId: null,
          receiptPath: null,
        },
        DEMO_PARTNER_ID,
      );
    }

    // 日々の支出
    let day = period.start;
    while (day <= lastDay) {
      const count = rng() < 0.25 ? 0 : rng() < 0.7 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const name = pick(rng, dailyCategories);
        const who = rng() < 0.55 ? DEMO_ME_ID : DEMO_PARTNER_ID;
        const isPersonal = name === '美容' || name === '趣味';
        const items = SAMPLE_ITEMS[name] ?? ['支出'];
        addTx(
          {
            type: 'expense',
            amountYen: roundedYen(rng, 400, name === '衣服' || name === '趣味' ? 12000 : 5000),
            categoryId: cat(name).id,
            description: pick(rng, items),
            occurredOn: day,
            // 個人の支出だけ「誰が払ったか」を持つ
            paidBy: isPersonal ? who : null,
            shareScope: isPersonal ? 'personal' : 'shared',
            paymentMethod: pick(rng, ['現金', 'クレジットカード', '電子マネー', 'QRコード決済'] as const),
            memo: '',
            savingsGoalId: null,
            receiptPath: null,
          },
          who,
        );
      }
      day = addDays(day, 1);
    }
  }

  // ---- 貯金目標 ---------------------------------------------------------
  const goals: SavingsGoal[] = [
    {
      id: 'demo-goal-1',
      householdId: DEMO_HOUSEHOLD_ID,
      name: '沖縄旅行',
      targetYen: 300000,
      targetDate: addDays(today, 150),
      color: '#3f9ec4',
      icon: '✈️',
      memo: '3泊4日・レンタカー込み',
      scope: 'shared',
      ownerId: null,
      status: 'active',
      createdBy: DEMO_ME_ID,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo-goal-2',
      householdId: DEMO_HOUSEHOLD_ID,
      name: 'ソファ買い替え',
      targetYen: 120000,
      targetDate: addDays(today, 60),
      color: '#7a8fa3',
      icon: '🛋️',
      memo: '',
      scope: 'shared',
      ownerId: null,
      status: 'active',
      createdBy: DEMO_PARTNER_ID,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo-goal-3',
      householdId: DEMO_HOUSEHOLD_ID,
      name: 'わたしのカメラ資金',
      targetYen: 90000,
      targetDate: null,
      color: '#9c7bc4',
      icon: '🎸',
      memo: '個人目標（パートナーには表示されません）',
      scope: 'personal',
      ownerId: DEMO_ME_ID,
      status: 'active',
      createdBy: DEMO_ME_ID,
      createdAt: new Date().toISOString(),
    },
  ];

  const savingsEntries: SavingsEntry[] = [
    { id: 'demo-se-1', goalId: 'demo-goal-1', householdId: DEMO_HOUSEHOLD_ID, amountYen: 50000, occurredOn: addDays(today, -62), userId: DEMO_ME_ID, memo: '6月分', transactionId: null, createdAt: new Date().toISOString() },
    { id: 'demo-se-2', goalId: 'demo-goal-1', householdId: DEMO_HOUSEHOLD_ID, amountYen: 40000, occurredOn: addDays(today, -32), userId: DEMO_PARTNER_ID, memo: '7月分', transactionId: null, createdAt: new Date().toISOString() },
    { id: 'demo-se-3', goalId: 'demo-goal-1', householdId: DEMO_HOUSEHOLD_ID, amountYen: 45000, occurredOn: addDays(today, -3), userId: DEMO_ME_ID, memo: '8月分', transactionId: null, createdAt: new Date().toISOString() },
    { id: 'demo-se-4', goalId: 'demo-goal-2', householdId: DEMO_HOUSEHOLD_ID, amountYen: 60000, occurredOn: addDays(today, -20), userId: DEMO_PARTNER_ID, memo: '', transactionId: null, createdAt: new Date().toISOString() },
    { id: 'demo-se-5', goalId: 'demo-goal-2', householdId: DEMO_HOUSEHOLD_ID, amountYen: -8000, occurredOn: addDays(today, -5), userId: DEMO_PARTNER_ID, memo: 'クッション購入で取り崩し', transactionId: null, createdAt: new Date().toISOString() },
    { id: 'demo-se-6', goalId: 'demo-goal-3', householdId: DEMO_HOUSEHOLD_ID, amountYen: 30000, occurredOn: addDays(today, -15), userId: DEMO_ME_ID, memo: '', transactionId: null, createdAt: new Date().toISOString() },
  ];

  // ---- 定期支出 ---------------------------------------------------------
  const recurringRules: RecurringRule[] = [
    {
      id: 'demo-rec-1',
      householdId: DEMO_HOUSEHOLD_ID,
      name: 'ジム会費',
      type: 'expense',
      amountYen: 7800,
      categoryId: cat('趣味').id,
      dayOfMonth: 10,
      paidBy: DEMO_ME_ID,
      shareScope: 'personal',
      paymentMethod: 'クレジットカード',
      memo: '',
      active: true,
      lastConfirmedMonth: null,
      createdBy: DEMO_ME_ID,
    },
    {
      id: 'demo-rec-2',
      householdId: DEMO_HOUSEHOLD_ID,
      name: '生命保険',
      type: 'expense',
      amountYen: 12000,
      categoryId: cat('保険').id,
      dayOfMonth: 27,
      paidBy: null,
      shareScope: 'shared',
      paymentMethod: '口座振替',
      memo: '',
      active: true,
      lastConfirmedMonth: null,
      createdBy: DEMO_PARTNER_ID,
    },
  ];

  // ---- コメント / Todo --------------------------------------------------
  const nowMs = Date.now();
  const comments: Comment[] = [
    {
      id: 'demo-comment-1',
      householdId: DEMO_HOUSEHOLD_ID,
      userId: DEMO_PARTNER_ID,
      body: '今月ちょっと外食が多いかも。週末は家で作ろう〜',
      linkType: null,
      linkId: null,
      parentId: null,
      createdAt: new Date(nowMs - 3600 * 1000 * 5).toISOString(),
      updatedAt: new Date(nowMs - 3600 * 1000 * 5).toISOString(),
    },
    {
      id: 'demo-comment-1-reply',
      householdId: DEMO_HOUSEHOLD_ID,
      userId: DEMO_ME_ID,
      body: 'そうだね、土曜はカレー作るよ🍛',
      linkType: null,
      linkId: null,
      parentId: 'demo-comment-1',
      createdAt: new Date(nowMs - 3600 * 1000 * 4).toISOString(),
      updatedAt: new Date(nowMs - 3600 * 1000 * 4).toISOString(),
    },
    {
      id: 'demo-comment-2',
      householdId: DEMO_HOUSEHOLD_ID,
      userId: DEMO_ME_ID,
      body: '旅行の貯金、今月分入れておいたよ',
      linkType: 'savings_goal',
      linkId: 'demo-goal-1',
      parentId: null,
      createdAt: new Date(nowMs - 3600 * 1000 * 26).toISOString(),
      updatedAt: new Date(nowMs - 3600 * 1000 * 26).toISOString(),
    },
    {
      id: 'demo-comment-3',
      householdId: DEMO_HOUSEHOLD_ID,
      userId: DEMO_PARTNER_ID,
      body: '電気代、去年より高い気がする。プラン見直す？',
      linkType: null,
      linkId: null,
      parentId: null,
      createdAt: new Date(nowMs - 3600 * 1000 * 50).toISOString(),
      updatedAt: new Date(nowMs - 3600 * 1000 * 50).toISOString(),
    },
  ];

  const commentReactions: CommentReaction[] = [
    {
      commentId: 'demo-comment-2',
      userId: DEMO_PARTNER_ID,
      householdId: DEMO_HOUSEHOLD_ID,
      createdAt: new Date(nowMs - 3600 * 1000 * 25).toISOString(),
    },
    {
      commentId: 'demo-comment-1',
      userId: DEMO_ME_ID,
      householdId: DEMO_HOUSEHOLD_ID,
      createdAt: new Date(nowMs - 3600 * 1000 * 4).toISOString(),
    },
  ];

  const todos: Todo[] = [
    {
      id: 'demo-todo-1',
      householdId: DEMO_HOUSEHOLD_ID,
      title: '火災保険の更新手続き',
      done: false,
      doneAt: null,
      assigneeUserId: DEMO_ME_ID,
      assignBoth: false,
      dueOn: addDays(today, 5),
      priority: 'high',
      category: 'procedure',
      memo: '証券番号を控えておく',
      linkType: null,
      linkId: null,
      createdBy: DEMO_ME_ID,
      archivedAt: null,
      createdAt: new Date(nowMs - 3600 * 1000 * 100).toISOString(),
      updatedAt: new Date(nowMs - 3600 * 1000 * 100).toISOString(),
    },
    {
      id: 'demo-todo-2',
      householdId: DEMO_HOUSEHOLD_ID,
      title: '米とトイレットペーパーを買う',
      done: false,
      doneAt: null,
      assigneeUserId: null,
      assignBoth: true,
      dueOn: addDays(today, 1),
      priority: 'normal',
      category: 'shopping',
      memo: '',
      linkType: null,
      linkId: null,
      createdBy: DEMO_PARTNER_ID,
      archivedAt: null,
      createdAt: new Date(nowMs - 3600 * 1000 * 20).toISOString(),
      updatedAt: new Date(nowMs - 3600 * 1000 * 20).toISOString(),
    },
    {
      id: 'demo-todo-3',
      householdId: DEMO_HOUSEHOLD_ID,
      title: 'クレジットカードの支払い確認',
      done: false,
      doneAt: null,
      assigneeUserId: DEMO_PARTNER_ID,
      assignBoth: false,
      dueOn: addDays(today, -2),
      priority: 'normal',
      category: 'payment',
      memo: '',
      linkType: null,
      linkId: null,
      createdBy: DEMO_ME_ID,
      archivedAt: null,
      createdAt: new Date(nowMs - 3600 * 1000 * 200).toISOString(),
      updatedAt: new Date(nowMs - 3600 * 1000 * 200).toISOString(),
    },
    {
      id: 'demo-todo-4',
      householdId: DEMO_HOUSEHOLD_ID,
      title: 'ふるさと納税の申し込み',
      done: true,
      doneAt: new Date(nowMs - 3600 * 1000 * 48).toISOString(),
      assigneeUserId: DEMO_ME_ID,
      assignBoth: false,
      dueOn: addDays(today, -10),
      priority: 'low',
      category: 'other',
      memo: '',
      linkType: null,
      linkId: null,
      createdBy: DEMO_ME_ID,
      archivedAt: null,
      createdAt: new Date(nowMs - 3600 * 1000 * 300).toISOString(),
      updatedAt: new Date(nowMs - 3600 * 1000 * 48).toISOString(),
    },
  ];

  return {
    household,
    members,
    me: { id: DEMO_ME_ID, displayName: 'あなた（デモ）', householdId: DEMO_HOUSEHOLD_ID },
    categories,
    budgets,
    transactions,
    recurringRules,
    savingsGoals: goals,
    savingsEntries,
    comments,
    commentReactions,
    todos,
    lastCommentReadAt: new Date(nowMs - 3600 * 1000 * 30).toISOString(),
  };
}
