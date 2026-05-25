import { useState, useEffect, useRef } from 'react';
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

function isComplete(a: Account): boolean {
  return a.client_id > 0 && !!a.username && !!a.password && !!a.crn && a.pin > 0;
}

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [accounts, setAccounts] = useState<Account[]>(() => {
    try { return JSON.parse(localStorage.getItem('merit_accounts') || '[]'); }
    catch { return []; }
  });
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

  function setAndSaveAccounts(accs: Account[]) {
    setAccounts(accs);
    localStorage.setItem('merit_accounts', JSON.stringify(accs));
    // Reset auto-load flag so newly-added accounts trigger a refetch on next mount cycle
    autoLoadedRef.current = false;
  }

  async function loadIpos() {
    if (accounts.length === 0) return;
    setLoadingIpos(true);
    setIpoError('');
    try {
      const res = await fetch('/api/ipos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      const data: IPO[] = await res.json();
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
      const res = await fetch('/api/portfolio/aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      const raw = await res.json();
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
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      const raw = await res.json();
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
    const complete = accounts.filter(isComplete);
    if (complete.length === 0) return;
    setChecking(true);
    try {
      const res = await fetch('/api/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: complete }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
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
    if (!isComplete(account)) return;
    setVerifyingUser(account.username);
    try {
      const res = await fetch('/api/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: [account] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
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

  // Auto-load on app mount when accounts exist
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    const complete = accounts.filter(isComplete);
    if (complete.length === 0 || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    loadIpos();
    loadPortfolios();
    loadReports();
    // Verify only accounts that haven't been verified yet
    const unverified = complete.filter(a => !snapshots[a.username]);
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
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar current={page} onNavigate={setPage} />

        <main className="flex-1 overflow-auto select-text">
          {page === 'overview' && <Overview accounts={accounts} onNavigate={setPage} snapshots={snapshots} ipos={ipos} portfolios={portfolios} portfoliosFetchedAt={portfoliosFetchedAt} iposFetchedAt={iposFetchedAt} activity={activity} />}
          {page === 'ipo-engine' && <IPOEngine accounts={accounts} ipos={ipos} loadingIpos={loadingIpos} ipoError={ipoError} onRefreshIpos={loadIpos} fetchedAt={iposFetchedAt} onActivity={pushActivity} />}
          {page === 'portfolio' && <Portfolio accounts={accounts} portfolios={portfolios} loading={loadingPortfolios} error={portfolioError} onRefresh={loadPortfolios} fetchedAt={portfoliosFetchedAt} />}
          {page === 'accounts' && <Accounts accounts={accounts} onChange={setAndSaveAccounts} snapshots={snapshots} verifyingUser={verifyingUser} checking={checking} onVerifyOne={verifyOne} onCheckAll={verifyAll} />}
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
