# データベース構成の説明

このアプリのデータは Supabase（PostgreSQL）に保存されます。
定義は `supabase/migrations/` にあり、番号順に実行することで再現できます。

| ファイル | 役割 |
| --- | --- |
| `0001_schema.sql` | テーブルの定義 |
| `0002_functions.sql` | サーバー側で実行する処理（合言葉での参加など）・初期カテゴリ |
| `0003_rls.sql` | アクセス制御（Row Level Security） |
| `0004_realtime.sql` | リアルタイム更新の対象設定 |
| `0005_shared_payer_and_comment_reactions.sql` | すでに 0001〜0004 を実行済みのデータベース向けの差分（新規作成時は不要） |
| `0006_shared_budget.sql` | 予算に「共有」の枠を足す差分（新規作成時は不要） |

---

## 1. 全体像

```
auth.users（Supabase が管理するログイン情報。合言葉から自動生成した値が入る）
 │
 ├─ profiles                 表示名・入り直すときのお名前・所属している家計グループ
 │
households（家計グループ。合言葉の照合用の値を持つ）
 ├─ household_members        誰が参加しているか（最大2人）
 ├─ categories               カテゴリ（初期35件＋追加分）
 ├─ budgets                  予算（全体／個人／カテゴリ別）
 ├─ transactions             支出・収入
 ├─ recurring_rules          定期支出のひな形
 ├─ savings_goals            貯金目標
 │   └─ savings_entries      入金・出金の履歴
 ├─ todos                    Todo
 ├─ comments                 コメント
 └─ comment_reads            未読件数のための既読位置
```

**設計の中心**は `households`（家計グループ）です。
個人モードでも必ず1件作られ、メンバーが1人か2人かの違いしかありません。
これにより「データを見てよいか」の判断が、**そのグループのメンバーかどうか**の一点に統一されます。

---

## 2. テーブルごとの説明

### households（家計グループ）

| 列 | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid | グループのID |
| `name` | text | 家計の名前（例:「わが家」） |
| `mode` | text | `personal`（個人）/ `shared`（共有） |
| `month_start_day` | smallint | 月の開始日（1〜28）。給料日基準の集計に使う |
| `carryover_enabled` | boolean | 予算の繰越し。初期値 `false` |
| `owner_id` | uuid | 作成者 |
| `passphrase_hash` | text | 合言葉の照合用の値（64桁の16進数・一意）。**合言葉そのものは保存しない。** 2人はこの値が一致することで同じグループに入る |

`passphrase_hash` は列単位で `authenticated` から `select` / `update` を取り消してあります。
ブラウザから読めてしまうと、それだけで他人が同じ家計に入れてしまうためです。
変更は `set_passphrase` / `remove_partner` の関数からのみ行います。

### household_members（メンバー）

`household_id` + `user_id` が主キー。`role` は `owner` / `member`。
**トリガー `household_members_limit` により、3人目の追加はデータベース側で拒否されます。**

### profiles（利用者情報）

`auth.users` と1対1。`display_name`（画面表示用・20文字まで）、
`login_name`（入り直すときに使うお名前）、`household_id` を持ちます。
サインアップ時にトリガー `on_auth_user_created` が自動で作成します。

`display_name` と `login_name` を分けているのは、表示名を変えたときに
ログインできなくならないようにするためです（ログイン情報は合言葉と `login_name` から作られます）。

### categories（カテゴリ）

`kind` は `expense` / `income`。`is_system = true` は初期カテゴリで、**削除できません**（名称・色・アイコンの変更と非表示は可能）。
`(household_id, kind, name)` に一意制約があり、同名カテゴリを作れません。
`transactions.category_id` は `ON DELETE RESTRICT` のため、**使用中のカテゴリはデータベース側でも削除が拒否されます。**

### budgets（予算）

| 列 | 説明 |
| --- | --- |
| `month` | 月キー。必ずその月の1日（`2026-08-01`）。実際の集計期間は `month_start_day` で決まる |
| `scope` | `household`（家計全体＝共有＋個人）/ `shared`（共有だけ）/ `personal`（個人予算） |
| `user_id` | `personal` のときの対象者。`household` / `shared` では NULL |
| `category_id` | NULL なら「合計の予算」、値があれば「カテゴリ別予算」 |

`scope` × `user_id` × `category_id` の組み合わせで1件ずつ持てるため、
「共有の食費」「自分の食費」のように、対象ごとに別々のカテゴリ別予算を設定できます。
| `amount_yen` | bigint（円単位の整数、0以上） |

`budgets_unique_idx` により、同じ月・同じ対象の予算は1件だけです（`COALESCE` を使い NULL 同士も重複扱い）。

### transactions（支出・収入）

| 列 | 説明 |
| --- | --- |
| `type` | `expense` / `income` |
| `amount_yen` | bigint。**`> 0` を CHECK 制約で強制**（0円以下は登録不可） |
| `occurred_on` | date（日本時間で決めた日付） |
| `paid_by` | 支払った人。**NULL は「共有（家計から出したお金）」**を表し、特定の個人の支出としては集計しない |
| `share_scope` | `shared`（家計の支出）/ `personal`（個人の支出） |
| `savings_goal_id` | 貯金目標との関連付け（任意） |
| `receipt_path` | レシート画像の保存先（**将来用。初期版では未使用**） |
| `created_by` / `updated_by` | 誰が登録・更新したか。画面に表示する |

### savings_goals / savings_entries（貯金）

- `savings_goals.scope` が `personal` のとき `owner_id` が必須で、**本人以外には見えません**。
- `savings_entries.amount_yen` は **入金が正、出金（取り崩し）が負**。0は不可。
- 家計簿から自動作成された履歴は `transaction_id` に元の取引IDを持ちます。
  取引を削除すると、画面側で対応する履歴も一緒に削除します（取り消しにも対応）。

### recurring_rules（定期支出）

`day_of_month` は1〜28。`last_confirmed_month` に取り込み済みの月を記録し、
同じ月に二重で候補が出ないようにしています。**自動での取引作成は行いません。**

### todos / comments / comment_reads / comment_reactions

- `todos` の担当者は `assignee_user_id`（個人）または `assign_both`（2人）で表します。
- `comments` は `link_type` / `link_id` で、支出・貯金目標・Todo に紐づけられます。
- `comments.parent_id` は返信先のコメント。`on delete cascade` なので、元のコメントを消すと返信も消えます。
  画面では返信を1段階までにしています（深い階層はスマホで読みにくいため）。
- `comment_reactions` は「いいね」。`(comment_id, user_id)` が主キーなので、1人1コメントにつき1件だけです。
- `comment_reads` は「どこまで読んだか」だけを持ち、未読件数の計算に使います。

---

## 3. アクセス制御（Row Level Security）

全テーブルで RLS を有効にしています。**ポリシーが定義されていない操作は実行できません。**

### 判定の中心となる関数

```sql
public.is_household_member(hid uuid) -- 自分がそのグループのメンバーか
```

`security definer` で定義しているため、ポリシー評価中に `household_members` を参照しても
無限再帰になりません。

### ポリシーの要約

| テーブル | 参照 | 追加 | 更新 | 削除 |
| --- | --- | --- | --- | --- |
| households | メンバー（`passphrase_hash` を除く） | ✗（関数のみ） | メンバー（`passphrase_hash` を除く） | ✗（関数のみ） |
| household_members | メンバー | ✗ | ✗ | ✗ |
| profiles | 自分＋同じグループの人 | ✗ | 自分のみ | ✗ |
| categories | メンバー | メンバー | メンバー | メンバー かつ 初期カテゴリでない |
| budgets | メンバー | メンバー（作成者＝自分） | メンバー | メンバー |
| transactions | メンバー | メンバー（作成者＝自分・支払者はメンバー） | メンバー（更新者＝自分） | メンバー |
| savings_goals | メンバー かつ（共有 または 所有者＝自分） | 同左 | 同左 | 同左 |
| savings_entries | 参照できる目標の履歴のみ | メンバー かつ 記録者＝自分 | メンバー | メンバー |
| recurring_rules | メンバー | メンバー | メンバー | メンバー |
| todos | メンバー | メンバー（作成者＝自分） | メンバー | メンバー |
| comments | メンバー | メンバー かつ 投稿者＝自分 | **投稿者本人のみ** | **投稿者本人のみ** |
| comment_reads | 自分の行のみ | 自分の行のみ | 自分の行のみ | 自分の行のみ |
| comment_reactions | メンバー | メンバー かつ 本人 | ✗ | **本人のみ** |

`anon`（未ログイン）にはテーブル権限を一切与えていません。

### なぜ「関数のみ」があるのか

メンバーの追加や合言葉の変更をブラウザから直接テーブルに書き込めるようにすると、
細工したリクエストで他人のグループに入れてしまう恐れがあります。
そのため以下は `security definer` の関数に限定し、関数の中で `auth.uid()` と条件を必ず確認しています。

| 関数 | 内容 |
| --- | --- |
| `join_or_create_household(hash, display_name, login_name, household_name)` | 合言葉が一致するグループがあれば参加、なければ作成（＋初期カテゴリ投入）。2人を超える参加は拒否 |
| `set_passphrase(new_hash)` | 合言葉の変更。**1人で使っているときのみ**（2人のときに変えると相手が入れなくなるため） |
| `remove_partner(user_id, new_hash)` | パートナー解除（共有データは残す）＋合言葉の入れ替えを同時に行う |
| `leave_household(delete_data)` | 退出。最後の1人のときは `delete_data = true` が必須 |
| `delete_my_account()` | アカウント削除 |
| `copy_budgets_from_previous_month(month)` | 前月の予算をコピー |

### 合言葉のあつかい（`src/lib/passphrase.ts`）

1. 合言葉を正規化する（全角→半角、空白の除去、英字は小文字に）
2. PBKDF2-SHA256（15万回）で元になる鍵を作る
3. その鍵から3つの値を導出する
   - `passphrase_hash`（グループの照合用。サーバーに保存される）
   - ログイン用のメールアドレス（合言葉 + お名前）
   - ログイン用のパスワード（合言葉 + お名前）

合言葉そのものはサーバーに送りません。
同じ合言葉なら2人とも同じ `passphrase_hash` になり、
お名前が違うのでログイン情報は別々になります。
これにより「誰が払ったか」を区別しつつ、同じ家計を共有できます。

---

## 4. 金額の扱い

- 金額はすべて **`bigint` の円単位の整数**です。`numeric` や `float` は使いません。
- `transactions.amount_yen` は `> 0`、`budgets.amount_yen` は `>= 0`、
  `savings_entries.amount_yen` は `<> 0` を CHECK 制約で強制しています。
- 割り算（月あたりの積立目安、1日あたりの残り予算など）は表示のためだけに行い、
  必ず整数へ丸めた結果を保存・表示します（`src/lib/money.ts`）。

## 5. 日付の扱い

- 日付は `date` 型で `YYYY-MM-DD` を保存します。タイムゾーンの影響を受けません。
- 「今日」を決めるときだけ `Asia/Tokyo` を明示して求めます（`src/lib/date.ts` の `todayJst`）。
- 集計期間は `households.month_start_day` から計算します。
  開始日が25日なら「2026年8月」＝ `2026-08-25` 〜 `2026-09-24` です。

## 6. リアルタイム更新

`0004_realtime.sql` で、コメント・Todo・取引・予算・貯金を `supabase_realtime` パブリケーションに追加しています。
配信内容にも RLS が適用されるため、**他のグループの変更は届きません。**

アプリ側は変更通知を受け取ると、そのグループのデータを読み直します。
差分を細かく当てるより単純で取り違えが起きず、1グループのデータ量（多くても数千件）では十分な速度です。
