import type {
  Budget,
  Category,
  RecurringRule,
  SavingsEntry,
  SavingsGoal,
  Transaction,
} from '@/lib/types';

export const HOUSEHOLD = 'household-1';
export const ME = 'user-me';
export const PARTNER = 'user-partner';
export const OUTSIDER = 'user-outsider';

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export function category(overrides: Partial<Category> = {}): Category {
  return {
    id: nextId('cat'),
    householdId: HOUSEHOLD,
    name: '食費',
    kind: 'expense',
    color: '#e2725b',
    icon: '🍚',
    sortOrder: 10,
    isHidden: false,
    isSystem: true,
    ...overrides,
  };
}

export function transaction(overrides: Partial<Transaction> = {}): Transaction {
  const iso = '2026-08-10T03:00:00.000Z';
  return {
    id: nextId('tx'),
    householdId: HOUSEHOLD,
    type: 'expense',
    amountYen: 1000,
    categoryId: 'cat-1',
    description: '',
    occurredOn: '2026-08-10',
    paidBy: ME,
    shareScope: 'shared',
    paymentMethod: '現金',
    memo: '',
    savingsGoalId: null,
    receiptPath: null,
    createdBy: ME,
    updatedBy: ME,
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  };
}

export function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: nextId('budget'),
    householdId: HOUSEHOLD,
    month: '2026-08-01',
    scope: 'household',
    userId: null,
    categoryId: null,
    amountYen: 100000,
    createdBy: ME,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

export function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: nextId('goal'),
    householdId: HOUSEHOLD,
    name: '沖縄旅行',
    targetYen: 300000,
    targetDate: '2027-01-10',
    color: '#3f9ec4',
    icon: '✈️',
    memo: '',
    scope: 'shared',
    ownerId: null,
    status: 'active',
    createdBy: ME,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

export function savingsEntry(overrides: Partial<SavingsEntry> = {}): SavingsEntry {
  return {
    id: nextId('entry'),
    goalId: 'goal-1',
    householdId: HOUSEHOLD,
    amountYen: 10000,
    occurredOn: '2026-08-01',
    userId: ME,
    memo: '',
    transactionId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

export function recurringRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: nextId('rule'),
    householdId: HOUSEHOLD,
    name: '家賃',
    type: 'expense',
    amountYen: 92000,
    categoryId: 'cat-rent',
    dayOfMonth: 5,
    paidBy: ME,
    shareScope: 'shared',
    paymentMethod: '口座振替',
    memo: '',
    active: true,
    lastConfirmedMonth: null,
    createdBy: ME,
    ...overrides,
  };
}
