import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Account, IPO, AccountSnapshot, SnapshotSummary, AccountPortfolio, LogEntry, Page, HistoryStats } from './types';
import { fetchAccounts, fetchIPOs, fetchSnapshot, fetchPortfolio, fetchHistoryStats, fetchAppliedIPOs } from './api';
import { useAuth } from './auth';

function uid() { return Math.random().toString(36).slice(2); }

interface AppState {
  accounts: Account[];
  ipos: IPO[];
  snapshots: AccountSnapshot[];
  snapshotSummary: SnapshotSummary | null;
  portfolios: AccountPortfolio[];
  grandTotal: number;
  historyStats: HistoryStats | null;
  log: LogEntry[];
  currentPage: Page;
  snapshotLoading: boolean;
  ipoLoading: boolean;
  portfolioLoading: boolean;
  accountsLoading: boolean;
  commandOpen: boolean;
}

interface AppActions {
  setAccounts: (accounts: Account[]) => void;
  reloadAccounts: () => Promise<void>;
  setIPOs: (ipos: IPO[]) => void;
  setSnapshots: (snapshots: AccountSnapshot[], summary: SnapshotSummary) => void;
  setPortfolios: (portfolios: AccountPortfolio[], grandTotal: number) => void;
  setHistoryStats: (stats: HistoryStats) => void;
  addLog: (entry: Omit<LogEntry, 'id' | 'time'>) => void;
  navigate: (page: Page) => void;
  setSnapshotLoading: (v: boolean) => void;
  setIPOLoading: (v: boolean) => void;
  setPortfolioLoading: (v: boolean) => void;
  openCommand: () => void;
  closeCommand: () => void;
}

type Ctx = AppState & AppActions;
const AppContext = createContext<Ctx>(null!);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [accounts, setAccountsRaw] = useState<Account[]>([]);
  const [ipos, setIPOsRaw] = useState<IPO[]>([]);
  const [snapshots, setSnapshotsRaw] = useState<AccountSnapshot[]>([]);
  const [snapshotSummary, setSnapshotSummary] = useState<SnapshotSummary | null>(null);
  const [portfolios, setPortfoliosRaw] = useState<AccountPortfolio[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [historyStats, setHistoryStatsRaw] = useState<HistoryStats | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [currentPage, setCurrentPage] = useState<Page>('overview');
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [ipoLoading, setIPOLoading] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const setAccounts = useCallback((accs: Account[]) => setAccountsRaw(accs), []);

  const reloadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const accs = await fetchAccounts();
      setAccountsRaw(accs);
    } catch { /* silent */ } finally {
      setAccountsLoading(false);
    }
  }, []);

  const setIPOs = useCallback(async (raw: IPO[]) => {
    try {
      const applied = await fetchAppliedIPOs();
      const appliedMap: Record<number, Record<string, string>> = {};
      for (const a of applied) appliedMap[a.company_id] = a.accounts;
      setIPOsRaw(raw.map(ipo => ({
        ...ipo,
        appliedAccounts: appliedMap[ipo.companyShareId] || {},
        applied: !!appliedMap[ipo.companyShareId],
      })));
    } catch {
      setIPOsRaw(raw);
    }
  }, []);

  const setSnapshots = useCallback((snaps: AccountSnapshot[], summary: SnapshotSummary) => {
    setSnapshotsRaw(snaps);
    setSnapshotSummary(summary);
  }, []);

  const setPortfolios = useCallback((ports: AccountPortfolio[], total: number) => {
    setPortfoliosRaw(ports);
    setGrandTotal(total);
  }, []);

  const setHistoryStats = useCallback((stats: HistoryStats) => setHistoryStatsRaw(stats), []);

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'time'>) => {
    setLog(prev => [{
      ...entry,
      id: uid(),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    }, ...prev].slice(0, 200));
  }, []);

  const navigate = useCallback((page: Page) => setCurrentPage(page), []);
  const openCommand = useCallback(() => setCommandOpen(true), []);
  const closeCommand = useCallback(() => setCommandOpen(false), []);

  // Boot when user logs in
  useEffect(() => {
    if (!user) {
      setAccountsRaw([]);
      setSnapshotsRaw([]);
      setSnapshotSummary(null);
      setIPOsRaw([]);
      setPortfoliosRaw([]);
      setGrandTotal(0);
      return;
    }

    async function boot() {
      setAccountsLoading(true);
      setSnapshotLoading(true);
      setIPOLoading(true);
      setPortfolioLoading(true);

      try {
        const accs = await fetchAccounts();
        setAccountsRaw(accs);
        setAccountsLoading(false);

        if (accs.length === 0) {
          setSnapshotLoading(false);
          setIPOLoading(false);
          setPortfolioLoading(false);
          return;
        }

        const [snap, ipoData, port, stats] = await Promise.all([
          fetchSnapshot(),
          fetchIPOs(),
          fetchPortfolio(),
          fetchHistoryStats(),
        ]);

        setSnapshotsRaw(snap.accounts);
        setSnapshotSummary(snap.summary);
        setSnapshotLoading(false);

        try {
          const applied = await fetchAppliedIPOs();
          const appliedMap: Record<number, Record<string, string>> = {};
          for (const a of applied) appliedMap[a.company_id] = a.accounts;
          setIPOsRaw(ipoData.map(ipo => ({
            ...ipo,
            appliedAccounts: appliedMap[ipo.companyShareId] || {},
            applied: !!appliedMap[ipo.companyShareId],
          })));
        } catch {
          setIPOsRaw(ipoData);
        }
        setIPOLoading(false);

        setPortfoliosRaw(port.accounts);
        setGrandTotal(port.grand_total);
        setPortfolioLoading(false);

        setHistoryStatsRaw(stats);
      } catch { /* silent on startup */ } finally {
        setAccountsLoading(false);
        setSnapshotLoading(false);
        setIPOLoading(false);
        setPortfolioLoading(false);
      }
    }

    boot();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCommandOpen(v => !v); }
      if (e.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <AppContext.Provider value={{
      accounts, ipos, snapshots, snapshotSummary, portfolios, grandTotal,
      historyStats, log, currentPage, snapshotLoading, ipoLoading, portfolioLoading,
      accountsLoading, commandOpen,
      setAccounts, reloadAccounts, setIPOs, setSnapshots, setPortfolios,
      setHistoryStats, addLog, navigate,
      setSnapshotLoading, setIPOLoading, setPortfolioLoading,
      openCommand, closeCommand,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() { return useContext(AppContext); }
