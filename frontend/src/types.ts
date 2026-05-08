export interface Broker {
  id: number;
  code: string;
  name: string;
}

// Server-side account (no password in frontend state)
export interface Account {
  id: number;           // DB id
  username: string;
  client_id: number;
  label?: string;
  group_name?: string;
  broker_name?: string;
}

export interface IPO {
  companyShareId: number;
  companyName: string;
  scrip: string;
  shareTypeName: string;
  shareGroupName: string;
  minUnit: number;
  maxUnit: number;
  issueOpenDate: string;
  issueCloseDate: string;
  action?: string;
  // enriched client-side
  applied?: boolean;          // has any account applied
  appliedAccounts?: Record<string, string>; // username -> status
}

export interface AccountSnapshot {
  username: string;
  label: string;
  name?: string;
  demat?: string;
  client_code?: string;
  boid?: string;
  email?: string;
  status: 'healthy' | 'expiring' | 'expired' | 'auth_failed' | 'error';
  days_to_expiry?: number;
  expired_date?: string;
  demat_expiry?: string;
  password_expiry?: string;
  renewed_date?: string;
  error?: string;
}

export interface SnapshotSummary {
  total: number;
  healthy: number;
  expiring: number;
  expired: number;
  failed: number;
}

export interface Holding {
  script: string;
  scriptDesc: string;
  currentBalance: number;
  lastTransactionPrice: string;
  previousClosingPrice: string;
  valueOfLastTransPrice: number;
  valueOfPrevClosingPrice: number;
}

export interface AccountPortfolio {
  username: string;
  label: string;
  name?: string;
  holdings: Holding[];
  total_value: number;
  count: number;
  error?: string;
}

export interface LogEntry {
  id: string;
  time: string;
  username?: string;
  company_id?: number;
  scrip?: string;
  status: 'success' | 'failed' | 'pending' | 'info';
  error?: string;
  kitta?: number;
  message?: string;
}

export interface ApplyResult {
  user_name: string;
  status: 'success' | 'failed' | 'pending';
  error_message?: string;
  company_id?: number;
  kitta_amount?: number;
  attempts?: number;
}

export interface HistoryRow {
  id: number;
  account_username: string;
  company_id: number;
  company_name: string | null;
  scrip: string | null;
  kitta: number;
  status: 'success' | 'failed' | 'allotted' | 'not_allotted';
  error_message: string | null;
  allotted_kitta: number | null;
  applied_at: string;
  allotment_checked_at: string | null;
}

export interface HistoryStats {
  total_applications: number;
  success: number;
  failed: number;
  allotted: number;
  unique_ipos: number;
  unique_accounts: number;
  success_rate: number;
  allotment_rate: number;
}

export interface SchedulerRule {
  id: number;
  name: string;
  rule_type: 'auto_all' | 'sector_filter';
  kitta: number;
  sectors?: string[] | null;
  account_ids?: number[] | null;
  active: boolean;
  last_run_at: string | null;
  created_at: string;
}

export type Page = 'overview' | 'ipo' | 'portfolio' | 'accounts' | 'history' | 'automation' | 'notifications' | 'settings';
