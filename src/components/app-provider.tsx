'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { DemoBackend } from '@/lib/data/demo';
import { SupabaseBackend } from '@/lib/data/supabase-backend';
import { BackendError, type Backend } from '@/lib/data/backend';
import { getSupabaseClient, hasSupabaseConfig } from '@/lib/supabase/client';
import { monthKeyOf, todayJst, type MonthKey } from '@/lib/date';
import { deriveCredentials } from '@/lib/passphrase';
import {
  STORAGE_KEYS,
  applyTheme,
  readLocal,
  removeLocal,
  writeLocal,
  type ThemeSetting,
} from '@/lib/settings';
import type { HouseholdSnapshot, ViewerFilter } from '@/lib/types';
import { useToast } from '@/components/ui/toast';

export type AppStatus = 'loading' | 'unauthenticated' | 'onboarding' | 'ready' | 'error';

export interface StartParams {
  passphrase: string;
  loginName: string;
  displayName: string;
  householdName?: string;
}

interface AppContextValue {
  status: AppStatus;
  error: string | null;
  isDemo: boolean;
  hasSupabase: boolean;
  session: Session | null;
  data: HouseholdSnapshot | null;
  backend: Backend | null;
  reload: () => Promise<void>;
  /** 変更処理の共通ラッパー。二重送信の防止・エラー表示・再読み込みをまとめて行う */
  run: <T>(fn: () => Promise<T>, options?: { success?: string; onError?: (e: BackendError) => void }) => Promise<T | null>;
  busy: boolean;
  monthKey: MonthKey;
  setMonthKey: (key: MonthKey) => void;
  viewer: ViewerFilter;
  setViewer: (v: ViewerFilter) => void;
  today: string;
  theme: ThemeSetting;
  setTheme: (t: ThemeSetting) => void;
  enterDemo: () => void;
  exitDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  /** 合言葉とお名前で入る（同じ合言葉のグループが無ければ作る） */
  startWithPassphrase: (params: StartParams) => Promise<void>;
  /** 合言葉を変更する。ログイン情報も合わせて更新する */
  changePassphrase: (newPassphrase: string) => Promise<void>;
  /** この端末に控えてある合言葉（相手に伝えるために表示する） */
  savedPassphrase: string | null;
}

const AppContext = React.createContext<AppContextValue | null>(null);

const START_PATH = '/start';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const [isDemo, setIsDemo] = React.useState(false);
  const [session, setSession] = React.useState<Session | null>(null);
  const [authReady, setAuthReady] = React.useState(false);
  const [data, setData] = React.useState<HouseholdSnapshot | null>(null);
  const [status, setStatus] = React.useState<AppStatus>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [today, setToday] = React.useState(() => todayJst());
  const [monthKey, setMonthKey] = React.useState<MonthKey>(() => monthKeyOf(todayJst(), 1));
  const [viewer, setViewer] = React.useState<ViewerFilter>('all');
  const [theme, setThemeState] = React.useState<ThemeSetting>('system');
  const [savedPassphrase, setSavedPassphrase] = React.useState<string | null>(null);

  const backendRef = React.useRef<Backend | null>(null);
  const monthTouched = React.useRef(false);

  // --- 初期化: 保存されたモードとテーマ ---
  React.useEffect(() => {
    const savedMode = readLocal<string>(STORAGE_KEYS.mode, hasSupabaseConfig ? 'supabase' : 'demo');
    setIsDemo(savedMode === 'demo' || !hasSupabaseConfig);
    const savedTheme = readLocal<ThemeSetting>(STORAGE_KEYS.theme, 'system');
    setThemeState(savedTheme);
    applyTheme(savedTheme);
    setToday(todayJst());
    setSavedPassphrase(readLocal<string | null>(STORAGE_KEYS.passphrase, null));
  }, []);

  React.useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = React.useCallback((t: ThemeSetting) => {
    setThemeState(t);
    writeLocal(STORAGE_KEYS.theme, t);
    applyTheme(t);
  }, []);

  // --- 認証状態の監視（Supabase モードのみ） ---
  React.useEffect(() => {
    if (isDemo) {
      setSession(null);
      setAuthReady(true);
      return;
    }
    if (!hasSupabaseConfig) {
      setAuthReady(true);
      return;
    }
    const supabase = getSupabaseClient();
    let active = true;
    supabase.auth.getSession().then(({ data: result }) => {
      if (!active) return;
      setSession(result.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [isDemo]);

  // --- バックエンドの用意 ---
  const backend = React.useMemo<Backend | null>(() => {
    if (isDemo) {
      const b = new DemoBackend();
      backendRef.current = b;
      return b;
    }
    if (!hasSupabaseConfig || !session) {
      backendRef.current = null;
      return null;
    }
    const b = new SupabaseBackend(getSupabaseClient());
    backendRef.current = b;
    return b;
  }, [isDemo, session]);

  const reload = React.useCallback(async () => {
    const b = backendRef.current;
    if (!b) return;
    try {
      const snapshot = await b.load();
      setData(snapshot);
      setError(null);
      setStatus(snapshot ? 'ready' : 'onboarding');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'データの読み込みに失敗しました';
      setError(message);
      setStatus('error');
    }
  }, []);

  // --- 初回読み込み ---
  React.useEffect(() => {
    if (!authReady) return;
    if (!isDemo && !session) {
      setData(null);
      setStatus('unauthenticated');
      return;
    }
    if (!backend) return;
    setStatus('loading');
    void reload();
  }, [authReady, backend, isDemo, session, reload]);

  // --- リアルタイム購読 ---
  React.useEffect(() => {
    if (!backend || status !== 'ready') return;
    const unsubscribe = backend.subscribe(() => {
      void reload();
    });
    return unsubscribe;
  }, [backend, status, reload]);

  // --- 月の開始日の設定に追従して表示月を決める ---
  React.useEffect(() => {
    if (!data || monthTouched.current) return;
    setMonthKey(monthKeyOf(today, data.household.monthStartDay));
  }, [data, today]);

  const changeMonth = React.useCallback((key: MonthKey) => {
    monthTouched.current = true;
    setMonthKey(key);
  }, []);

  // --- ルーティングの制御 ---
  // 合言葉を入れていない（＝まだ家計グループに入っていない）間は /start に留める
  React.useEffect(() => {
    const atStart = pathname.startsWith(START_PATH);
    if ((status === 'unauthenticated' || status === 'onboarding') && !atStart) {
      router.replace(START_PATH);
    } else if (status === 'ready' && atStart) {
      router.replace('/');
    }
  }, [status, pathname, router]);

  const run = React.useCallback<AppContextValue['run']>(
    async (fn, options) => {
      if (busy) return null;
      setBusy(true);
      try {
        const result = await fn();
        await reload();
        if (options?.success) toast.show(options.success, { tone: 'success' });
        return result;
      } catch (e) {
        const err =
          e instanceof BackendError
            ? e
            : new BackendError(e instanceof Error ? e.message : '処理に失敗しました');
        if (options?.onError) options.onError(err);
        else toast.show(err.message, { tone: 'error' });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, reload, toast],
  );

  const enterDemo = React.useCallback(() => {
    writeLocal(STORAGE_KEYS.mode, 'demo');
    setIsDemo(true);
    setStatus('loading');
    router.replace('/');
  }, [router]);

  const exitDemo = React.useCallback(async () => {
    writeLocal(STORAGE_KEYS.mode, 'supabase');
    setIsDemo(false);
    setData(null);
    setStatus('loading');
    router.replace(START_PATH);
  }, [router]);

  const signOut = React.useCallback(async () => {
    if (isDemo) {
      await exitDemo();
      return;
    }
    if (hasSupabaseConfig) await getSupabaseClient().auth.signOut();
    removeLocal(STORAGE_KEYS.passphrase);
    setSavedPassphrase(null);
    setData(null);
    setStatus('unauthenticated');
    router.replace(START_PATH);
  }, [isDemo, exitDemo, router]);

  /**
   * 合言葉とお名前でアプリを始める。
   * メールアドレスとパスワードは合言葉から自動で作るので、利用者は入力しない。
   */
  const startWithPassphrase = React.useCallback(
    async (params: StartParams) => {
      if (!hasSupabaseConfig) {
        throw new BackendError(
          'Supabase の設定がされていないため、2人での共有は使えません。デモモードでお試しください。',
          'no_supabase',
        );
      }
      const supabase = getSupabaseClient();
      const creds = await deriveCredentials(params.passphrase, params.loginName);

      // 既に同じ合言葉＋お名前で登録済みならログイン、なければ新規登録する
      const signIn = await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });
      if (signIn.error) {
        const signUp = await supabase.auth.signUp({
          email: creds.email,
          password: creds.password,
          options: { data: { display_name: params.displayName } },
        });
        if (signUp.error) {
          throw new BackendError(
            `始められませんでした: ${signUp.error.message}`,
            'signup_failed',
          );
        }
        if (!signUp.data.session) {
          throw new BackendError(
            'Supabase の設定で「Confirm email」をオフにしてください（この方式ではメールを使いません）。',
            'confirm_email',
          );
        }
      }

      const b = new SupabaseBackend(supabase);
      await b.joinOrCreateHousehold({
        passphraseHash: creds.householdHash,
        displayName: params.displayName,
        loginName: params.loginName,
        householdName: params.householdName,
      });

      // 相手に伝えるため、この端末にだけ合言葉を控えておく
      writeLocal(STORAGE_KEYS.passphrase, params.passphrase);
      setSavedPassphrase(params.passphrase);
    },
    [],
  );

  /** 合言葉の変更。ログイン情報も合言葉から作っているため、両方を更新する。 */
  const changePassphrase = React.useCallback(
    async (newPassphrase: string) => {
      const b = backendRef.current;
      if (!b || isDemo) {
        throw new BackendError('デモモードでは合言葉を変更できません', 'demo');
      }
      const loginName = data?.me.loginName?.trim() || data?.me.displayName || '';
      const creds = await deriveCredentials(newPassphrase, loginName);

      // 先にログイン情報を更新する。あとで失敗しても入れなくなることはない。
      const updated = await getSupabaseClient().auth.updateUser({
        email: creds.email,
        password: creds.password,
      });
      if (updated.error) {
        throw new BackendError(`合言葉を変更できませんでした: ${updated.error.message}`, 'update_failed');
      }
      await b.setPassphrase(creds.householdHash);
      writeLocal(STORAGE_KEYS.passphrase, newPassphrase);
      setSavedPassphrase(newPassphrase);
    },
    [isDemo, data],
  );

  const value = React.useMemo<AppContextValue>(
    () => ({
      status,
      error,
      isDemo,
      hasSupabase: hasSupabaseConfig,
      session,
      data,
      backend,
      reload,
      run,
      busy,
      monthKey,
      setMonthKey: changeMonth,
      viewer,
      setViewer,
      today,
      theme,
      setTheme,
      enterDemo,
      exitDemo,
      signOut,
      startWithPassphrase,
      changePassphrase,
      savedPassphrase,
    }),
    [
      status, error, isDemo, session, data, backend, reload, run, busy, monthKey,
      changeMonth, viewer, today, theme, setTheme, enterDemo, exitDemo, signOut,
      startWithPassphrase, changePassphrase, savedPassphrase,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('useApp は AppProvider の内側で使ってください');
  return ctx;
}

/** データが読み込み済みであることを前提にするページで使う。 */
export function useHousehold() {
  const app = useApp();
  if (!app.data) throw new Error('データが読み込まれていません');
  const { data } = app;
  const partner = data.members.find((m) => m.userId !== data.me.id) ?? null;
  return {
    ...app,
    data,
    me: data.me,
    partner,
    isShared: data.household.mode === 'shared' && data.members.length > 1,
    memberName: (userId: string) =>
      data.members.find((m) => m.userId === userId)?.displayName ?? 'メンバー',
  };
}
