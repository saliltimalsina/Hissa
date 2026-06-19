import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import type { Account, Page, IPO, AccountPortfolio, AccountSnapshot, AccountReport, HistoryRow, HistoryStats } from './types';
import { deriveAlerts } from './lib/alerts';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import CommandPalette from './components/layout/CommandPalette';
import Overview from './pages/Overview';
import IPOEngine from './pages/IPOEngine';
import Portfolio from './pages/Portfolio';
import Accounts from './pages/Accounts';
import Reports from './pages/Reports';
import Automation from './pages/Automation';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import { useAuth } from './auth/useAuth';
import { Spinner } from './components/ui';
import { api, getHistory, getHistoryStats } from './lib/api';

type AuthView = 'login' | 'signup' | 'forgot';

// The aggregate/reports/snapshot endpoints return either a bare array or an
// `{ accounts: [...] }` wrapper. Normalize to the array without using `any`.
function unwrapAccounts<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { accounts?: unknown }).accounts)) {
    return (raw as { accounts: T[] }).accounts;
  }
  return [];
}

function AuthGate() {
  const [view, setView] = useState<AuthView>('login');
  if (view === 'signup') return <Signup onLogin={() => setView('login')} />;
  if (view === 'forgot') return <ForgotPassword onLogin={() => setView('login')} />;
  return <Login onSignup={() => setView('signup')} onForgot={() => setView('forgot')} />;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface text-brand">
      <Spinner size="lg" label="Loading Hissa" />
    </div>
  );
}

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <AuthGate />;
  return <AppShell onLogout={logout} userEmail={user.email} userName={user.name} />;
}

function AppShell({ onLogout, userEmail, userName }: { onLogout: () => void; userEmail: string; userName?: string }) {
  const [page, setPage] = useState<Page>('overview');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  // Off-canvas sidebar drawer (mobile/tablet). Always visible inline at lg+.
  const [navOpen, setNavOpen] = useState(false);

  // Lifted state — shared across pages, persists across navigation
  const [ipos, setIpos] = useState<IPO[]>([]);
  const [loadingIpos, setLoadingIpos] = useState(false);
  const [ipoError, setIpoError] = useState('');
  const [iposFetchedAt, setIposFetchedAt] = useState<number | null>(null);

  const [portfolios, setPortfolios] = useState<AccountPortfolio[]>([]);
  const [loadingPortfolios, setLoadingPortfolios] = useState(false);
  const [portfolioError, setPortfolioError] = useState('');
  const [portfoliosFetchedAt, setPortfoliosFetchedAt] = useState<number | null>(null);

  const [reports, setReports] = useState<AccountReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsError, setReportsError] = useState('');
  const [reportsFetchedAt, setReportsFetchedAt] = useState<number | null>(null);

  // Snapshots/activity hold NO credentials — safe to persist locally, keyed by username.
  const [snapshots, setSnapshots] = useState<Record<string, AccountSnapshot>>(() => {
    try { return JSON.parse(localStorage.getItem('merit_snapshots') || '{}'); }
    catch { return {}; }
  });
  const [verifyingUser, setVerifyingUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  type Activity = { ts: number; type: 'apply' | 'verify' | 'sync' | 'error'; status: 'success' | 'failed' | 'info'; message: string };
  const [activity, setActivity] = useState<Activity[]>(() => {
    try { return JSON.parse(localStorage.getItem('merit_activity') || '[]'); }
    catch { return []; }
  });

  function pushActivity(entry: Omit<Activity, 'ts'>) {
    const next = [{ ...entry, ts: Date.now() }, ...activity].slice(0, 50);
    setActivity(next);
    localStorage.setItem('merit_activity', JSON.stringify(next));
  }

  // Recent failed applications feed the Alerts page + bell (no creds, safe to hold).
  const [historyFailures, setHistoryFailures] = useState<HistoryRow[]>([]);

  // Persisted set of alert ids the user has dismissed/read.
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('merit_read_alerts') || '[]')); }
    catch { return new Set(); }
  });

  const alerts = deriveAlerts(snapshots, historyFailures);
  const unreadCount = alerts.filter(a => !readAlertIds.has(a.id)).length;

  function markAllAlertsRead() {
    const ids = new Set(alerts.map(a => a.id));
    setReadAlertIds(ids);
    localStorage.setItem('merit_read_alerts', JSON.stringify([...ids]));
  }

  const loadHistoryFailures = useCallback(async () => {
    try {
      const res = await getHistory({ status: 'failed', limit: 50 });
      setHistoryFailures(res.rows);
    } catch (e) {
      // Non-fatal: alerts simply fall back to health-only.
      console.error('Failed to load history for alerts', e);
    }
  }, []);

  const [historyStats, setHistoryStats] = useState<HistoryStats | null>(null);
  const loadHistoryStats = useCallback(async () => {
    try {
      setHistoryStats(await getHistoryStats());
    } catch (e) {
      console.error('Failed to load history stats', e);
    }
  }, []);

  function saveSnapshots(s: Record<string, AccountSnapshot>) {
    setSnapshots(s);
    localStorage.setItem('merit_snapshots', JSON.stringify(s));
  }

  // Auto-load bookkeeping. `autoLoadKey` advances whenever a fresh accounts
  // set should re-trigger the one-shot auto-load; the effect below keys off it.
  const [autoLoadKey, setAutoLoadKey] = useState(0);
  const lastAutoLoadKey = useRef(-1);

  // Load account METADATA from the server (never credentials).
  const refreshAccounts = useCallback(async () => {
    try {
      const data = await api<Account[]>('/api/accounts');
      // Guard against a non-array response (e.g. an error object) so a malformed
      // payload can't crash downstream `.map`/`.filter` calls across the app.
      setAccounts(Array.isArray(data) ? data : []);
      // Allow auto-load to refire after the set changes.
      setAutoLoadKey(k => k + 1);
    } catch (e) {
      console.error('Failed to load accounts', e);
    } finally {
      setAccountsLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Kick off via a microtask so the fetch's setState lands after commit,
    // not synchronously inside the effect body.
    Promise.resolve().then(refreshAccounts);
  }, [refreshAccounts]);

  async function loadIpos() {
    if (accounts.length === 0) return;
    setLoadingIpos(true);
    setIpoError('');
    try {
      const data = await api<IPO[]>('/api/ipos', { method: 'POST', body: {} });
      setIpos(data);
      setIposFetchedAt(Date.now());
      if (data.length === 0) setIpoError('No IPOs open for application right now.');
    } catch (e: unknown) {
      setIpoError(e instanceof Error ? e.message : 'Failed to load IPOs');
    } finally {
      setLoadingIpos(false);
    }
  }

  async function loadPortfolios() {
    if (accounts.length === 0) return;
    setLoadingPortfolios(true);
    setPortfolioError('');
    try {
      const raw = await api<unknown>('/api/portfolio/aggregate', { method: 'POST', body: {} });
      const data = unwrapAccounts<AccountPortfolio>(raw);
      setPortfolios(data);
      setPortfoliosFetchedAt(Date.now());
    } catch (e: unknown) {
      setPortfolioError(e instanceof Error ? e.message : 'Failed to load portfolio');
    } finally {
      setLoadingPortfolios(false);
    }
  }

  async function loadReports() {
    if (accounts.length === 0) return;
    setLoadingReports(true);
    setReportsError('');
    try {
      const raw = await api<unknown>('/api/reports', { method: 'POST', body: {} });
      const data = unwrapAccounts<AccountReport>(raw);
      setReports(data);
      setReportsFetchedAt(Date.now());
    } catch (e: unknown) {
      setReportsError(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      setLoadingReports(false);
    }
  }

  async function verifyAll() {
    if (accounts.length === 0) return;
    setChecking(true);
    try {
      // Omit account_ids => verify all of the user's accounts.
      const raw = await api<unknown>('/api/snapshot', { method: 'POST', body: {} });
      const data = unwrapAccounts<AccountSnapshot>(raw);
      const map = { ...snapshots };
      data.forEach(s => { map[s.username] = s; });
      saveSnapshots(map);
      const ok = data.filter(s => s.status === 'healthy').length;
      const bad = data.length - ok;
      pushActivity({ type: 'verify', status: bad > 0 ? 'info' : 'success', message: `Health check: ${ok} healthy, ${bad} issues` });
    } catch (e) {
      console.error(e);
    } finally {
      setChecking(false);
    }
  }

  async function verifyOne(account: Account) {
    setVerifyingUser(account.username);
    try {
      const raw = await api<unknown>('/api/snapshot', { method: 'POST', body: { account_ids: [account.id] } });
      const data = unwrapAccounts<AccountSnapshot>(raw);
      if (data[0]) {
        saveSnapshots({ ...snapshots, [data[0].username]: data[0] });
        pushActivity({
          type: 'verify',
          status: data[0].status === 'healthy' ? 'success' : 'failed',
          message: `${account.label || account.username}: ${data[0].status === 'auth_failed' ? 'Auth failed' : data[0].status}`,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setVerifyingUser(null);
    }
  }

  // Auto-load once accounts metadata is available. Keyed off autoLoadKey so it
  // re-fires after each accounts refresh; the lastAutoLoadKey ref dedupes so the
  // body runs at most once per key. All setState happens inside the async
  // loaders (after their awaits), not synchronously in this effect.
  useEffect(() => {
    if (accounts.length === 0) return;
    if (lastAutoLoadKey.current === autoLoadKey) return;
    lastAutoLoadKey.current = autoLoadKey;
    const unverified = accounts.filter(a => !snapshots[a.username]);
    // Run via a microtask so the loaders' setState lands after commit, not
    // synchronously inside this effect body.
    Promise.resolve().then(() => {
      void loadIpos();
      void loadPortfolios();
      void loadReports();
      void loadHistoryFailures();
      void loadHistoryStats();
      if (unverified.length > 0) void verifyAll();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length, autoLoadKey]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        const pages: Page[] = ['overview', 'ipo-engine', 'portfolio', 'accounts', 'reports', 'automation', 'notifications', 'settings'];
        const n = parseInt(e.key);
        if (n >= 1 && n <= pages.length) {
          e.preventDefault();
          setPage(pages[n - 1]);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const navigate = (p: Page) => { setPage(p); setNavOpen(false); };

  return (
    <div className="flex flex-col h-screen bg-surface text-ink overflow-hidden">
      <TopBar
        accounts={accounts}
        onOpenCmd={() => setCmdOpen(true)}
        onOpenNav={() => setNavOpen(true)}
        notifications={unreadCount}
        onNavigate={setPage}
        snapshots={snapshots}
        userEmail={userEmail}
        userName={userName}
        onLogout={onLogout}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar current={page} onNavigate={navigate} open={navOpen} onClose={() => setNavOpen(false)} />

        <main className="flex-1 overflow-auto">
          {page === 'overview' && <Overview accounts={accounts} onNavigate={setPage} snapshots={snapshots} ipos={ipos} portfolios={portfolios} portfoliosFetchedAt={portfoliosFetchedAt} iposFetchedAt={iposFetchedAt} activity={activity} historyStats={historyStats} />}
          {page === 'ipo-engine' && <IPOEngine accounts={accounts} ipos={ipos} loadingIpos={loadingIpos} ipoError={ipoError} onRefreshIpos={loadIpos} fetchedAt={iposFetchedAt} onActivity={pushActivity} />}
          {page === 'portfolio' && <Portfolio accounts={accounts} portfolios={portfolios} loading={loadingPortfolios} error={portfolioError} onRefresh={loadPortfolios} fetchedAt={portfoliosFetchedAt} />}
          {page === 'accounts' && <Accounts accounts={accounts} accountsLoaded={accountsLoaded} onRefresh={refreshAccounts} snapshots={snapshots} verifyingUser={verifyingUser} checking={checking} onVerifyOne={verifyOne} onCheckAll={verifyAll} />}
          {page === 'reports' && <Reports accounts={accounts} reports={reports} loading={loadingReports} error={reportsError} onRefresh={loadReports} fetchedAt={reportsFetchedAt} />}
          {page === 'automation' && <Automation />}
          {page === 'notifications' && <Notifications alerts={alerts} readAlertIds={readAlertIds} onMarkAllRead={markAllAlertsRead} />}
          {page === 'settings' && <Settings />}
        </main>
      </div>

      {cmdOpen && (
        <CommandPalette
          onClose={() => setCmdOpen(false)}
          onNavigate={(p) => { setPage(p); setCmdOpen(false); }}
          accounts={accounts}
        />
      )}
    </div>
  );
}
