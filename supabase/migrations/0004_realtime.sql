-- ============================================================================
-- 0004_realtime.sql : リアルタイム更新の対象テーブル
--
-- コメントと Todo は夫婦で同時に見る前提なのでリアルタイム更新が必須。
-- 取引・予算・貯金も、相手の登録がすぐ反映されるようにしておく。
-- 配信内容は RLS が適用されるため、他のグループのデータは届かない。
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.todos;
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.budgets;
alter publication supabase_realtime add table public.savings_goals;
alter publication supabase_realtime add table public.savings_entries;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.household_members;

-- 更新・削除イベントで変更前の行を配信できるようにする（UI の差分反映に使う）
alter table public.comments replica identity full;
alter table public.todos replica identity full;
alter table public.transactions replica identity full;
alter table public.budgets replica identity full;
alter table public.savings_goals replica identity full;
alter table public.savings_entries replica identity full;
