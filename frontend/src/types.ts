export type Page =
  | 'overview'
  | 'ipo-engine'
  | 'portfolio'
  | 'accounts'
  | 'reports'
  | 'automation'
  | 'notifications'
  | 'settings';

// App-state account is METADATA only — credentials live encrypted server-side
// and are never held in the browser beyond a transient add/edit form.
export interface Account {
  id: number;
  username: string;
  client_id: number;
  label?: string;
  group_name?: string;
  created_at?: string;
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
  time: string;
  username: string;
  company_id: number;
  scrip?: string;
  status: 'success' | 'failed' | 'pending';
  error?: string;
  kitta: number;
}

export interface ReportApplication {
  applicantFormId?: number;
  companyShareId?: number;
  companyName: string;
  scrip: string;
  shareTypeName?: string;
  shareGroupName?: string;
  statusName?: string;
  appliedKitta?: number;
  alloted?: string;
  allotedQuantity?: number;
  meroshareRemark?: string;
  blockAmountStatus?: string;
  transactionAmount?: number;
  issueOpenDate?: string;
  issueCloseDate?: string;
  reservationTypeName?: string;
}

export interface AccountReport {
  username: string;
  label: string;
  error?: string;
  applications: ReportApplication[];
}

export interface AllocationRow {
  accountIndex: number;
  kitta: number;
  skip: boolean;
}

export interface ExecLog {
  ts: string;
  username: string;
  status: 'success' | 'failed' | 'retrying' | 'pending';
  message: string;
}

// ── Scheduler / automation (server-backed) ─────────────────────────────────────
export interface SchedulerRule {
  id: number;
  name: string;
  rule_type: 'auto_all' | 'sector_filter';
  kitta: number;
  sectors: string[] | null;
  account_ids: number[] | null;
  active: boolean;
  last_run_at: string | null;
  created_at: string | null;
  max_accounts: number;
  max_kitta: number;
}

export interface SchedulerRuleInput {
  name: string;
  rule_type: 'auto_all' | 'sector_filter';
  kitta?: number;
  sectors?: string[] | null;
  account_ids?: number[] | null;
  max_accounts?: number;
  max_kitta?: number;
}

// ── Application history (server-backed) ─────────────────────────────────────────
export interface HistoryRow {
  id: number;
  account_username: string;
  company_id: number;
  company_name: string | null;
  scrip: string | null;
  kitta: number;
  status: string;
  error_message: string | null;
  allotted_kitta: number | null;
  applied_at: string | null;
  allotment_checked_at: string | null;
}

export interface HistoryResponse {
  total: number;
  rows: HistoryRow[];
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

// Per-IPO applied summary: company_id -> { account_username: status }
export interface AppliedIpo {
  company_id: number;
  company_name: string | null;
  scrip: string | null;
  accounts: Record<string, string>;
}
