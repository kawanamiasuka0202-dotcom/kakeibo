import { describe, expect, it } from 'vitest';
import {
  applyFilter,
  budgetTargetOf,
  buildMonthlySummary,
  carryoverAmount,
  categoryBreakdown,
  categoryBudgetMap,
  findTotalBudget,
  inPeriod,
  levelOf,
  memberBreakdown,
  monthlyTrend,
  scopeBreakdown,
  SHARED_PAYER_ID,
  totalExpense,
  totalIncome,
} from '@/lib/budget';
import { monthPeriod } from '@/lib/date';
import { budget, category, ME, PARTNER, transaction } from './factories';

const AUGUST = { year: 2026, month: 8 };
const TODAY = '2026-08-14';

const food = category({ id: 'cat-food', name: '食費' });
const rent = category({ id: 'cat-rent', name: '住居費' });
const salary = category({ id: 'cat-salary', name: '給与', kind: 'income' });
const categories = [food, rent, salary];

describe('期間の絞り込み', () => {
  it('集計期間内の取引だけを取り出す', () => {
    const period = monthPeriod(AUGUST, 1);
    const rows = inPeriod(
      [
        transaction({ occurredOn: '2026-07-31' }),
        transaction({ occurredOn: '2026-08-01' }),
        transaction({ occurredOn: '2026-08-31' }),
        transaction({ occurredOn: '2026-09-01' }),
      ],
      period,
    );
    expect(rows.map((r) => r.occurredOn)).toEqual(['2026-08-01', '2026-08-31']);
  });

  it('月の開始日が25日なら翌月分も同じ期間に含まれる', () => {
    const period = monthPeriod(AUGUST, 25);
    const rows = inPeriod(
      [
        transaction({ occurredOn: '2026-08-24' }),
        transaction({ occurredOn: '2026-08-25' }),
        transaction({ occurredOn: '2026-09-24' }),
        transaction({ occurredOn: '2026-09-25' }),
      ],
      period,
    );
    expect(rows.map((r) => r.occurredOn)).toEqual(['2026-08-25', '2026-09-24']);
  });
});

describe('表示対象の絞り込み', () => {
  const rows = [
    transaction({ paidBy: ME, amountYen: 1000 }),
    transaction({ paidBy: PARTNER, amountYen: 2000 }),
    transaction({ paidBy: ME, amountYen: 500, shareScope: 'personal' }),
  ];

  it('自分が支払ったものだけに絞れる', () => {
    const mine = applyFilter(rows, { viewer: 'me', meId: ME, partnerId: PARTNER });
    expect(totalExpense(mine)).toBe(1500);
  });

  it('パートナーが支払ったものだけに絞れる', () => {
    const theirs = applyFilter(rows, { viewer: 'partner', meId: ME, partnerId: PARTNER });
    expect(totalExpense(theirs)).toBe(2000);
  });

  it('パートナーがいない場合、partner 指定では何も返らない', () => {
    const theirs = applyFilter(rows, { viewer: 'partner', meId: ME, partnerId: null });
    expect(theirs).toHaveLength(0);
  });

  it('共有（支払った人なし）は個人の絞り込みに含まれない', () => {
    const list = [
      transaction({ paidBy: null, amountYen: 92000, shareScope: 'shared' }),
      transaction({ paidBy: ME, amountYen: 3000, shareScope: 'personal' }),
    ];
    expect(totalExpense(applyFilter(list, { viewer: 'me', meId: ME, partnerId: PARTNER }))).toBe(3000);
    expect(totalExpense(applyFilter(list, { viewer: 'partner', meId: ME, partnerId: PARTNER }))).toBe(0);
  });

  it('shared 指定なら共有の支出だけを返す', () => {
    const list = [
      transaction({ paidBy: null, amountYen: 92000, shareScope: 'shared' }),
      transaction({ paidBy: ME, amountYen: 3000, shareScope: 'personal' }),
    ];
    const shared = applyFilter(list, { viewer: 'shared', meId: ME, partnerId: PARTNER });
    expect(shared).toHaveLength(1);
    expect(totalExpense(shared)).toBe(92000);
  });

  it('2人合計（all）は共有も個人もすべて含む', () => {
    const list = [
      transaction({ paidBy: null, amountYen: 92000, shareScope: 'shared' }),
      transaction({ paidBy: ME, amountYen: 3000, shareScope: 'personal' }),
    ];
    expect(totalExpense(applyFilter(list, { viewer: 'all', meId: ME, partnerId: PARTNER }))).toBe(95000);
  });

  it('共有・個人の区分で絞れる', () => {
    expect(applyFilter(rows, { shareScope: 'personal' })).toHaveLength(1);
    expect(applyFilter(rows, { shareScope: 'shared' })).toHaveLength(2);
  });

  it('キーワードは内容・メモ・カテゴリ名を対象にする', () => {
    const list = [
      transaction({ description: 'スーパーまるみ', categoryId: food.id }),
      transaction({ description: '', memo: '実家へのお土産', categoryId: food.id }),
      transaction({ description: '家賃', categoryId: rent.id }),
    ];
    expect(applyFilter(list, { keyword: 'まるみ' }, categories)).toHaveLength(1);
    expect(applyFilter(list, { keyword: 'お土産' }, categories)).toHaveLength(1);
    expect(applyFilter(list, { keyword: '住居' }, categories)).toHaveLength(1);
  });
});

describe('月次サマリ', () => {
  const transactions = [
    transaction({ occurredOn: '2026-08-02', amountYen: 30000, categoryId: food.id }),
    transaction({ occurredOn: '2026-08-05', amountYen: 92000, categoryId: rent.id }),
    transaction({ occurredOn: '2026-08-10', amountYen: 8000, categoryId: food.id, paidBy: PARTNER }),
    transaction({
      occurredOn: '2026-08-25',
      amountYen: 285000,
      categoryId: salary.id,
      type: 'income',
    }),
  ];

  it('予算・支出・残額・使用率を計算する', () => {
    const summary = buildMonthlySummary({
      transactions,
      budgets: [budget({ amountYen: 200000 })],
      key: AUGUST,
      monthStartDay: 1,
      carryoverEnabled: false,
      today: TODAY,
    });
    expect(summary.budgetYen).toBe(200000);
    expect(summary.spentYen).toBe(130000);
    expect(summary.incomeYen).toBe(285000);
    expect(summary.remainingYen).toBe(70000);
    expect(summary.usageRate).toBe(65);
    expect(summary.level).toBe('safe');
  });

  it('予算超過なら残額がマイナスになり level が over になる', () => {
    const summary = buildMonthlySummary({
      transactions,
      budgets: [budget({ amountYen: 100000 })],
      key: AUGUST,
      monthStartDay: 1,
      carryoverEnabled: false,
      today: TODAY,
    });
    expect(summary.remainingYen).toBe(-30000);
    expect(summary.level).toBe('over');
  });

  it('80%を超えると warn になる', () => {
    const summary = buildMonthlySummary({
      transactions,
      budgets: [budget({ amountYen: 150000 })],
      key: AUGUST,
      monthStartDay: 1,
      carryoverEnabled: false,
      today: TODAY,
    });
    expect(summary.usageRate).toBeGreaterThanOrEqual(80);
    expect(summary.level).toBe('warn');
  });

  it('予算が未設定なら level は none', () => {
    const summary = buildMonthlySummary({
      transactions,
      budgets: [],
      key: AUGUST,
      monthStartDay: 1,
      carryoverEnabled: false,
      today: TODAY,
    });
    expect(summary.hasBudget).toBe(false);
    expect(summary.level).toBe('none');
    expect(summary.spentYen).toBe(130000);
  });

  it('支出を追加すると残り予算が即座に減る', () => {
    const base = buildMonthlySummary({
      transactions,
      budgets: [budget({ amountYen: 200000 })],
      key: AUGUST,
      monthStartDay: 1,
      carryoverEnabled: false,
      today: TODAY,
    });
    const after = buildMonthlySummary({
      transactions: [...transactions, transaction({ occurredOn: '2026-08-14', amountYen: 1200 })],
      budgets: [budget({ amountYen: 200000 })],
      key: AUGUST,
      monthStartDay: 1,
      carryoverEnabled: false,
      today: TODAY,
    });
    expect(after.spentYen - base.spentYen).toBe(1200);
    expect(base.remainingYen - after.remainingYen).toBe(1200);
  });

  it('1日あたりの残り予算は整数になる', () => {
    const summary = buildMonthlySummary({
      transactions,
      budgets: [budget({ amountYen: 200000 })],
      key: AUGUST,
      monthStartDay: 1,
      carryoverEnabled: false,
      today: TODAY,
    });
    expect(Number.isInteger(summary.dailyRemainingYen)).toBe(true);
    expect(summary.daysLeft).toBe(18); // 8/14〜8/31
  });

  it('自分の個人予算を表示できる', () => {
    const budgets = [
      budget({ amountYen: 200000 }),
      budget({ scope: 'personal', userId: ME, amountYen: 40000 }),
    ];
    const mine = buildMonthlySummary({
      transactions,
      budgets,
      key: AUGUST,
      monthStartDay: 1,
      carryoverEnabled: false,
      today: TODAY,
      viewer: 'me',
      meId: ME,
      partnerId: PARTNER,
    });
    expect(mine.budgetYen).toBe(40000);
    expect(mine.spentYen).toBe(122000); // パートナーの8,000円を除く
  });
});

describe('予算の繰越し', () => {
  const julyTransactions = [transaction({ occurredOn: '2026-07-10', amountYen: 80000 })];
  const budgets = [budget({ month: '2026-07-01', amountYen: 100000 }), budget({ amountYen: 100000 })];

  it('初期状態では繰り越さない', () => {
    expect(carryoverAmount(budgets, julyTransactions, AUGUST, 1, false)).toBe(0);
  });

  it('有効にすると前月の未使用額が加算される', () => {
    expect(carryoverAmount(budgets, julyTransactions, AUGUST, 1, true)).toBe(20000);
  });

  it('前月が超過ならマイナスを引き継ぐ', () => {
    const over = [transaction({ occurredOn: '2026-07-10', amountYen: 130000 })];
    expect(carryoverAmount(budgets, over, AUGUST, 1, true)).toBe(-30000);
  });

  it('サマリの予算額に繰越しが反映される', () => {
    const summary = buildMonthlySummary({
      transactions: julyTransactions,
      budgets,
      key: AUGUST,
      monthStartDay: 1,
      carryoverEnabled: true,
      today: TODAY,
    });
    expect(summary.baseBudgetYen).toBe(100000);
    expect(summary.carryoverYen).toBe(20000);
    expect(summary.budgetYen).toBe(120000);
  });
});

describe('内訳', () => {
  const rows = [
    transaction({ amountYen: 30000, categoryId: food.id, paidBy: ME }),
    transaction({ amountYen: 10000, categoryId: food.id, paidBy: PARTNER, shareScope: 'personal' }),
    transaction({ amountYen: 60000, categoryId: rent.id, paidBy: ME }),
  ];

  it('カテゴリ別の金額と割合を計算する', () => {
    const breakdown = categoryBreakdown(rows, categories);
    expect(breakdown[0].label).toBe('住居費');
    expect(breakdown[0].amountYen).toBe(60000);
    expect(breakdown[0].share).toBe(60);
    expect(breakdown[1].label).toBe('食費');
    expect(breakdown[1].amountYen).toBe(40000);
    expect(breakdown[1].share).toBe(40);
  });

  it('カテゴリ別予算があれば残額も返す', () => {
    const budgets = [budget({ scope: 'household', categoryId: food.id, amountYen: 35000 })];
    const breakdown = categoryBreakdown(rows, categories, categoryBudgetMap(budgets, AUGUST));
    const foodRow = breakdown.find((r) => r.id === food.id);
    expect(foodRow?.budgetYen).toBe(35000);
    expect(foodRow?.remainingYen).toBe(-5000);
  });

  it('カテゴリ別予算は対象（全体／共有／個人）ごとに分かれている', () => {
    const budgets = [
      budget({ scope: 'household', categoryId: food.id, amountYen: 60000 }),
      budget({ scope: 'shared', categoryId: food.id, amountYen: 40000 }),
      budget({ scope: 'personal', userId: ME, categoryId: food.id, amountYen: 10000 }),
      budget({ scope: 'personal', userId: PARTNER, categoryId: food.id, amountYen: 8000 }),
    ];
    expect(categoryBudgetMap(budgets, AUGUST, 'household').get(food.id)).toBe(60000);
    expect(categoryBudgetMap(budgets, AUGUST, 'shared').get(food.id)).toBe(40000);
    expect(categoryBudgetMap(budgets, AUGUST, 'personal', ME).get(food.id)).toBe(10000);
    expect(categoryBudgetMap(budgets, AUGUST, 'personal', PARTNER).get(food.id)).toBe(8000);
  });

  it('別の人の個人カテゴリ予算は混ざらない', () => {
    const budgets = [budget({ scope: 'personal', userId: PARTNER, categoryId: food.id, amountYen: 8000 })];
    expect(categoryBudgetMap(budgets, AUGUST, 'personal', ME).has(food.id)).toBe(false);
  });

  it('合計の予算（categoryId が null）はカテゴリ別に混ざらない', () => {
    const budgets = [budget({ scope: 'shared', categoryId: null, amountYen: 150000 })];
    expect(categoryBudgetMap(budgets, AUGUST, 'shared').size).toBe(0);
  });

  it('支払者別の内訳を計算する', () => {
    const members = [
      { userId: ME, displayName: 'わたし' },
      { userId: PARTNER, displayName: 'パートナー' },
    ];
    const breakdown = memberBreakdown(rows, members);
    expect(breakdown[0].amountYen).toBe(90000);
    expect(breakdown[1].amountYen).toBe(10000);
  });

  it('共有の支出は個人に振り分けず「共有」としてまとめる', () => {
    const members = [
      { userId: ME, displayName: 'わたし' },
      { userId: PARTNER, displayName: 'パートナー' },
    ];
    const withShared = [
      transaction({ amountYen: 92000, paidBy: null, shareScope: 'shared' }),
      transaction({ amountYen: 8000, paidBy: ME, shareScope: 'personal' }),
      transaction({ amountYen: 5000, paidBy: PARTNER, shareScope: 'personal' }),
    ];
    const breakdown = memberBreakdown(withShared, members);
    const shared = breakdown.find((r) => r.id === SHARED_PAYER_ID);
    expect(shared?.amountYen).toBe(92000);
    expect(breakdown.find((r) => r.id === ME)?.amountYen).toBe(8000);
    expect(breakdown.find((r) => r.id === PARTNER)?.amountYen).toBe(5000);
  });

  it('共有の支出がなければ「共有」の行は出さない', () => {
    const members = [{ userId: ME, displayName: 'わたし' }];
    const onlyPersonal = [transaction({ amountYen: 8000, paidBy: ME, shareScope: 'personal' })];
    expect(memberBreakdown(onlyPersonal, members).some((r) => r.id === SHARED_PAYER_ID)).toBe(false);
  });

  it('共有・個人の内訳を計算する', () => {
    const breakdown = scopeBreakdown(rows);
    expect(breakdown.find((r) => r.id === 'shared')?.amountYen).toBe(90000);
    expect(breakdown.find((r) => r.id === 'personal')?.amountYen).toBe(10000);
  });

  it('収入は支出の内訳に含めない', () => {
    const withIncome = [...rows, transaction({ type: 'income', amountYen: 500000, categoryId: salary.id })];
    expect(totalExpense(withIncome)).toBe(100000);
    expect(totalIncome(withIncome)).toBe(500000);
    expect(categoryBreakdown(withIncome, categories)).toHaveLength(2);
  });
});

describe('表示対象と予算の対応', () => {
  it('画面の切り替えが、予算の置き場所と一致する', () => {
    expect(budgetTargetOf('all', ME, PARTNER)).toEqual({ scope: 'household', userId: null });
    expect(budgetTargetOf('shared', ME, PARTNER)).toEqual({ scope: 'shared', userId: null });
    expect(budgetTargetOf('me', ME, PARTNER)).toEqual({ scope: 'personal', userId: ME });
    expect(budgetTargetOf('partner', ME, PARTNER)).toEqual({ scope: 'personal', userId: PARTNER });
  });

  it('パートナーがいない場合は userId が null になる', () => {
    expect(budgetTargetOf('partner', ME, null)).toEqual({ scope: 'personal', userId: null });
  });
});

describe('推移', () => {
  const rows = [
    transaction({ occurredOn: '2026-06-10', amountYen: 1000, categoryId: food.id }),
    transaction({ occurredOn: '2026-07-10', amountYen: 2000, categoryId: food.id }),
    transaction({ occurredOn: '2026-07-15', amountYen: 90000, categoryId: rent.id }),
    transaction({ occurredOn: '2026-08-10', amountYen: 3000, categoryId: food.id }),
  ];

  it('指定した月数ぶんを古い順に返す', () => {
    const trend = monthlyTrend(rows, AUGUST, 3, 1);
    expect(trend.map((t) => t.expenseYen)).toEqual([1000, 92000, 3000]);
    expect(trend.map((t) => t.label)).toEqual(['6月', '7月', '8月']);
  });

  it('カテゴリを指定すると、そのカテゴリだけの推移になる', () => {
    const trend = monthlyTrend(rows, AUGUST, 3, 1, food.id);
    expect(trend.map((t) => t.expenseYen)).toEqual([1000, 2000, 3000]);
  });

  it('記録のないカテゴリを指定すると、すべて0になる', () => {
    const trend = monthlyTrend(rows, AUGUST, 3, 1, 'cat-unknown');
    expect(trend.map((t) => t.expenseYen)).toEqual([0, 0, 0]);
  });

  it('カテゴリ未指定（null）は全体の推移と同じ', () => {
    expect(monthlyTrend(rows, AUGUST, 3, 1, null)).toEqual(monthlyTrend(rows, AUGUST, 3, 1));
  });
});

describe('予算のレベル判定', () => {
  it('しきい値どおりに判定する', () => {
    expect(levelOf(false, 120)).toBe('none');
    expect(levelOf(true, 79.9)).toBe('safe');
    expect(levelOf(true, 80)).toBe('warn');
    expect(levelOf(true, 99.9)).toBe('warn');
    expect(levelOf(true, 100)).toBe('over');
  });
});

describe('全体予算の取り出し', () => {
  const budgets = [
    budget({ amountYen: 200000 }),
    budget({ scope: 'personal', userId: ME, amountYen: 40000 }),
    budget({ scope: 'personal', userId: PARTNER, amountYen: 35000 }),
    budget({ scope: 'household', categoryId: food.id, amountYen: 60000 }),
  ];

  it('世帯予算と個人予算を区別する', () => {
    expect(findTotalBudget(budgets, AUGUST, 'all')?.amountYen).toBe(200000);
    expect(findTotalBudget(budgets, AUGUST, 'me', ME, PARTNER)?.amountYen).toBe(40000);
    expect(findTotalBudget(budgets, AUGUST, 'partner', ME, PARTNER)?.amountYen).toBe(35000);
  });

  it('「共有」は共有予算を使う', () => {
    const withShared = [...budgets, budget({ scope: 'shared', amountYen: 150000 })];
    expect(findTotalBudget(withShared, AUGUST, 'shared', ME, PARTNER)?.amountYen).toBe(150000);
  });

  it('共有予算が未設定なら「共有」は予算なしとして扱う（全体予算で代用しない）', () => {
    expect(findTotalBudget(budgets, AUGUST, 'shared', ME, PARTNER)).toBeNull();
  });

  it('共有予算は全体予算・個人予算と混ざらない', () => {
    const withShared = [...budgets, budget({ scope: 'shared', amountYen: 150000 })];
    expect(findTotalBudget(withShared, AUGUST, 'all')?.amountYen).toBe(200000);
    expect(findTotalBudget(withShared, AUGUST, 'me', ME, PARTNER)?.amountYen).toBe(40000);
  });
});

describe('共有予算の集計', () => {
  it('共有の支出だけが共有予算に対して計上される', () => {
    const transactions = [
      transaction({ occurredOn: '2026-08-02', amountYen: 92000, paidBy: null, shareScope: 'shared' }),
      transaction({ occurredOn: '2026-08-03', amountYen: 5000, paidBy: ME, shareScope: 'personal' }),
    ];
    const summary = buildMonthlySummary({
      transactions,
      budgets: [budget({ scope: 'shared', amountYen: 120000 })],
      key: AUGUST,
      monthStartDay: 1,
      carryoverEnabled: false,
      today: TODAY,
      viewer: 'shared',
      meId: ME,
      partnerId: PARTNER,
    });
    expect(summary.budgetYen).toBe(120000);
    expect(summary.spentYen).toBe(92000);
    expect(summary.remainingYen).toBe(28000);
  });

  it('経過日数を返す（横グラフのペース表示に使う）', () => {
    const summary = buildMonthlySummary({
      transactions: [],
      budgets: [budget({ amountYen: 100000 })],
      key: AUGUST,
      monthStartDay: 1,
      carryoverEnabled: false,
      today: TODAY,
    });
    expect(summary.elapsedDays).toBe(14);
    expect(summary.period.days).toBe(31);
  });
});

describe('収入の支払者', () => {
  it('収入は共有でも誰の収入かで絞り込める', () => {
    const rows = [
      transaction({ type: 'income', amountYen: 285000, paidBy: ME, shareScope: 'shared' }),
      transaction({ type: 'income', amountYen: 178000, paidBy: PARTNER, shareScope: 'shared' }),
      transaction({ type: 'expense', amountYen: 92000, paidBy: null, shareScope: 'shared' }),
    ];
    expect(totalIncome(applyFilter(rows, { viewer: 'me', meId: ME, partnerId: PARTNER }))).toBe(285000);
    expect(totalIncome(applyFilter(rows, { viewer: 'partner', meId: ME, partnerId: PARTNER }))).toBe(
      178000,
    );
    // 共有（支払った人なし）は支出だけ
    expect(totalIncome(applyFilter(rows, { viewer: 'shared', meId: ME, partnerId: PARTNER }))).toBe(0);
  });

  it('収入に人が紐づいていても、支払者別の支出内訳には影響しない', () => {
    const members = [
      { userId: ME, displayName: 'わたし' },
      { userId: PARTNER, displayName: 'パートナー' },
    ];
    const rows = [
      transaction({ type: 'income', amountYen: 285000, paidBy: ME, shareScope: 'shared' }),
      transaction({ type: 'expense', amountYen: 92000, paidBy: null, shareScope: 'shared' }),
    ];
    const breakdown = memberBreakdown(rows, members);
    expect(breakdown.find((r) => r.id === ME)?.amountYen).toBe(0);
    expect(breakdown.find((r) => r.id === SHARED_PAYER_ID)?.amountYen).toBe(92000);
  });
});
