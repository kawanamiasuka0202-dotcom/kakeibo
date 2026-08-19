-- ============================================================================
-- 0006_shared_budget.sql
--
-- すでに 0001〜0005 を実行したデータベースに、あとから加えた変更をあてるファイル。
-- これから新しく作る場合は 0001 に同じ内容が入っているため、実行しても何も変わらない。
--
--   予算に「共有」の枠を追加する。
--     household = 家計全体（共有＋個人のすべて）
--     shared    = 共有だけ（家計から出したお金）   ← 今回追加
--     personal  = その人の個人支出
-- ============================================================================

alter table public.budgets drop constraint if exists budgets_scope_check;
alter table public.budgets
  add constraint budgets_scope_check
  check (scope in ('household', 'shared', 'personal'));

alter table public.budgets drop constraint if exists budgets_scope_user;
alter table public.budgets
  add constraint budgets_scope_user
  check (
    (scope in ('household', 'shared') and user_id is null)
    or (scope = 'personal' and user_id is not null)
  );
