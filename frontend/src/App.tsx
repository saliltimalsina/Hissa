import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import type { Account, Page, IPO, AccountPortfolio, AccountSnapshot, AccountReport } from './types';
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
import { useAuth } from './auth/AuthContext';
import { api } from './lib/api';

type AuthView = 'login' | 'signup' | 'forgot';

function AuthGate() {
  const [view, setView] = useState<AuthView>('login');
  if (view === 'signup') return <Signup onLogin={() => setView('login')} />;
  if (view === 'forgot') return <ForgotPassword onLogin={() => setView('login')} />;
  return <Login onSignup={() => setView('signup')} onForgot={() => setView('forgot')} />;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FC]">
      <svg className="animate-spin h-6 w-6 text-[#5B4DFF]" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
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

  function saveSnapshots(s: Record<string, AccountSnapshot>) {
    setSnapshots(s);
    localStorage.setItem('merit_snapshots', JSON.stringify(s));
  }

  // Load account METADATA from the server (never credentials).
  const refreshAccounts = useCallback(async () => {
    try {
      const data = await api<Account[]>('/api/accounts');
      setAccounts(data);
      // Allow auto-load to refire after the set changes.
      autoLoadedRef.current = false;
    } catch (e) {
      console.error('Failed to load accounts', e);
    } finally {
      setAccountsLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshAccounts();
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
    } catch (e: any) {
      setIpoError(e.message || 'Failed to load IPOs');
    } finally {
      setLoadingIpos(false);
    }
  }

  async function loadPortfolios() {
    if (accounts.length === 0) return;
    setLoadingPortfolios(true);
    setPortfolioError('');
    try {
      const raw = await api<any>('/api/portfolio/aggregate', { method: 'POST', body: {} });
      const data: AccountPortfolio[] = Array.isArray(raw) ? raw : (raw.accounts || []);
      setPortfolios(data);
      setPortfoliosFetchedAt(Date.now());
    } catch (e: any) {
      setPortfolioError(e.message || 'Failed to load portfolio');
    } finally {
      setLoadingPortfolios(false);
    }
  }

  async function loadReports() {
    if (accounts.length === 0) return;
    setLoadingReports(true);
    setReportsError('');
    try {
      const raw = await api<any>('/api/reports', { method: 'POST', body: {} });
      const data: AccountReport[] = Array.isArray(raw) ? raw : (raw.accounts || []);
      setReports(data);
      setReportsFetchedAt(Date.now());
    } catch (e: any) {
      setReportsError(e.message || 'Failed to load reports');
    } finally {
      setLoadingReports(false);
    }
  }

  async function verifyAll() {
    if (accounts.length === 0) return;
    setChecking(true);
    try {
      // Omit account_ids => verify all of the user's accounts.
      const raw = await api<any>('/api/snapshot', { method: 'POST', body: {} });
      const data: AccountSnapshot[] = Array.isArray(raw) ? raw : (raw.accounts || []);
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
      const raw = await api<any>('/api/snapshot', { method: 'POST', body: { account_ids: [account.id] } });
      const data: AccountSnapshot[] = Array.isArray(raw) ? raw : (raw.accounts || []);
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

  // Auto-load once accounts metadata is available.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (accounts.length === 0 || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    loadIpos();
    loadPortfolios();
    loadReports();
    const unverified = accounts.filter(a => !snapshots[a.username]);
    if (unverified.length > 0) verifyAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

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

  return (
    <div className="flex flex-col h-screen bg-[#F7F8FC] text-[#111827] overflow-hidden select-none">
      <TopBar
        accounts={accounts}
        onOpenCmd={() => setCmdOpen(true)}
        notifications={0}
        onNavigate={setPage}
        snapshots={snapshots}
        userEmail={userEmail}
        userName={userName}
        onLogout={onLogout}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar current={page} onNavigate={setPage} />

        <main className="flex-1 overflow-auto select-text">
          {page === 'overview' && <Overview accounts={accounts} onNavigate={setPage} snapshots={snapshots} ipos={ipos} portfolios={portfolios} portfoliosFetchedAt={portfoliosFetchedAt} iposFetchedAt={iposFetchedAt} activity={activity} />}
          {page === 'ipo-engine' && <IPOEngine accounts={accounts} ipos={ipos} loadingIpos={loadingIpos} ipoError={ipoError} onRefreshIpos={loadIpos} fetchedAt={iposFetchedAt} onActivity={pushActivity} />}
          {page === 'portfolio' && <Portfolio accounts={accounts} portfolios={portfolios} loading={loadingPortfolios} error={portfolioError} onRefresh={loadPortfolios} fetchedAt={portfoliosFetchedAt} />}
          {page === 'accounts' && <Accounts accounts={accounts} accountsLoaded={accountsLoaded} onRefresh={refreshAccounts} snapshots={snapshots} verifyingUser={verifyingUser} checking={checking} onVerifyOne={verifyOne} onCheckAll={verifyAll} />}
          {page === 'reports' && <Reports accounts={accounts} reports={reports} loading={loadingReports} error={reportsError} onRefresh={loadReports} fetchedAt={reportsFetchedAt} />}
          {page === 'automation' && <Automation />}
          {page === 'notifications' && <Notifications />}
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
