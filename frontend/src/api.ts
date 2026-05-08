import type { Broker, IPO, AccountSnapshot, SnapshotSummary, AccountPortfolio, ApplyResult, HistoryRow, HistoryStats, SchedulerRule, Account } from './types';

function getToken(): string {
  try {
    const raw = localStorage.getItem('ncap_auth');
    if (!raw) return '';
    return JSON.parse(raw).token || '';
  } catch { return ''; }
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, { ...init, headers: { ...authHeaders(), ...(init?.headers as Record<string, string> || {}) } });
  if (res.status === 401) {
    localStorage.removeItem('ncap_auth');
    window.location.reload();
  }
  return res;
}

// ── Brokers ───────────────────────────────────────────────────────────────────

export async function fetchBrokers(): Promise<Broker[]> {
  const res = await fetch('/api/brokers');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function fetchAccounts(): Promise<Account[]> {
  const res = await apiFetch('/api/accounts');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function addAccount(data: {
  username: string; password: string; pin: string; crn: string;
  client_id: number; label?: string; group_name?: string;
}): Promise<Account> {
  const res = await apiFetch('/api/accounts', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
  return res.json();
}

export async function updateAccount(id: number, data: Partial<{
  label: string; group_name: string; password: string; pin: string; crn: string; client_id: number;
}>): Promise<Account> {
  const res = await apiFetch(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteAccount(id: number): Promise<void> {
  const res = await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function bulkImportAccounts(rows: {
  client_id: number; username: string; password: string; crn: string; pin: string;
  label?: string; group_name?: string;
}[]): Promise<{ added: number; skipped: number }> {
  const res = await apiFetch('/api/accounts/import', { method: 'POST', body: JSON.stringify(rows) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── IPOs ──────────────────────────────────────────────────────────────────────

export async function fetchIPOs(): Promise<IPO[]> {
  const res = await apiFetch('/api/ipos');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export async function fetchSnapshot(): Promise<{ accounts: AccountSnapshot[]; summary: SnapshotSummary }> {
  const res = await apiFetch('/api/snapshot');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export async function fetchPortfolio(): Promise<{ accounts: AccountPortfolio[]; grand_total: number }> {
  const res = await apiFetch('/api/portfolio');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Apply ─────────────────────────────────────────────────────────────────────

export async function* streamBulkApply(
  companyId: number,
  kitta: number,
  accountIds?: number[],
  signal?: AbortSignal,
): AsyncGenerator<{ type: string; index?: number; total?: number; result?: ApplyResult }> {
  const res = await apiFetch('/api/apply', {
    method: 'POST',
    body: JSON.stringify({ company_id: companyId, kitta, account_ids: accountIds }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  yield* _readNDJSON(res);
}

export async function* streamMultiApply(
  allocations: { account_id: number; company_id: number; kitta: number }[],
  signal?: AbortSignal,
): AsyncGenerator<{ type: string; index?: number; total?: number; result?: ApplyResult }> {
  const res = await apiFetch('/api/apply/multi', {
    method: 'POST',
    body: JSON.stringify({ allocations }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  yield* _readNDJSON(res);
}

async function* _readNDJSON(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try { yield JSON.parse(line); } catch { /* skip */ }
    }
  }
}

// ── History ───────────────────────────────────────────────────────────────────

export async function fetchHistory(params?: { status?: string; company_id?: number; limit?: number }): Promise<{ total: number; rows: HistoryRow[] }> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.company_id) q.set('company_id', String(params.company_id));
  if (params?.limit) q.set('limit', String(params.limit));
  const res = await apiFetch(`/api/history?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchHistoryStats(): Promise<HistoryStats> {
  const res = await apiFetch('/api/history/stats');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchAppliedIPOs(): Promise<{ company_id: number; company_name: string; scrip: string; accounts: Record<string, string> }[]> {
  const res = await apiFetch('/api/history/applied-ipos');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function checkAllotment(): Promise<{ checked: number; allotted: number }> {
  const res = await apiFetch('/api/allotment/check');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export async function fetchSchedulerRules(): Promise<SchedulerRule[]> {
  const res = await apiFetch('/api/scheduler/rules');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createSchedulerRule(data: {
  name: string; rule_type: string; kitta: number; sectors?: string[]; account_ids?: number[];
}): Promise<SchedulerRule> {
  const res = await apiFetch('/api/scheduler/rules', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function toggleSchedulerRule(id: number): Promise<SchedulerRule> {
  const res = await apiFetch(`/api/scheduler/rules/${id}/toggle`, { method: 'PUT' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteSchedulerRule(id: number): Promise<void> {
  const res = await apiFetch(`/api/scheduler/rules/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
