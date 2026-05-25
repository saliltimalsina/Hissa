export type Page =
  | 'overview'
  | 'ipo-engine'
  | 'portfolio'
  | 'accounts'
  | 'reports'
  | 'automation'
  | 'notifications'
  | 'settings';

export interface Account {
  client_id: number;
  username: string;
  password: string;
  crn: string;
  pin: number;
  label?: string;
  group?: string;
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
