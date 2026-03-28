/**
 * LIFF 園担当者画面 — 応募管理（承認/却下）
 *
 * ?page=nursery-staff でアクセス。LIFF認証後に表示。
 * nursery_contacts に登録された園担当者のみアクセス可能。
 */

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  getIDToken(): string | null;
  isInClient(): boolean;
  closeWindow(): void;
};

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8787';

interface NurseryInfo {
  nursery_id: string;
  nursery_name: string;
}

interface StaffBooking {
  id: string;
  friend_id: string | null;
  job_id: string | null;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  approval_status: string | null;
  approval_note: string | null;
  created_at: string;
  nursery_id: string | null;
  nursery_name: string | null;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  hourly_rate: number | null;
  display_name: string | null;
  picture_url: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
}

interface StaffState {
  loading: boolean;
  error: string | null;
  nurseries: NurseryInfo[];
  pending: StaffBooking[];
  approved: StaffBooking[];
  activeTab: 'pending' | 'approved';
  processing: Set<string>;
}

const state: StaffState = {
  loading: true,
  error: null,
  nurseries: [],
  pending: [],
  approved: [],
  activeTab: 'pending',
  processing: new Set(),
};

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const idToken = liff.getIDToken();
    if (idToken) headers['X-LIFF-Token'] = idToken;
  } catch { /* */ }
  return headers;
}

async function fetchDashboard(): Promise<void> {
  const res = await fetch(`${API_URL}/api/nursery-staff/dashboard`, { headers: apiHeaders() });
  if (!res.ok) {
    if (res.status === 403) throw new Error('この機能は園担当者のみ利用できます');
    if (res.status === 401) throw new Error('認証に失敗しました。LINEアプリから再度お試しください');
    throw new Error('データの取得に失敗しました');
  }
  const json = await res.json() as { success: boolean; data: { nurseries: NurseryInfo[]; pending: StaffBooking[]; approved: StaffBooking[] } };
  if (!json.success) throw new Error('データの取得に失敗しました');
  state.nurseries = json.data.nurseries;
  state.pending = json.data.pending;
  state.approved = json.data.approved;
}

async function handleApprove(bookingId: string): Promise<void> {
  if (state.processing.has(bookingId)) return;
  state.processing.add(bookingId);
  render();
  try {
    const res = await fetch(`${API_URL}/api/nursery-staff/bookings/${bookingId}/approve`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error('承認に失敗しました');
    await fetchDashboard();
  } catch (err) {
    state.error = err instanceof Error ? err.message : '承認に失敗しました';
  } finally {
    state.processing.delete(bookingId);
    render();
  }
}

async function handleDeny(bookingId: string): Promise<void> {
  if (state.processing.has(bookingId)) return;
  if (!confirm('この応募を見送りますか？')) return;
  state.processing.add(bookingId);
  render();
  try {
    const res = await fetch(`${API_URL}/api/nursery-staff/bookings/${bookingId}/deny`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error('却下に失敗しました');
    await fetchDashboard();
  } catch (err) {
    state.error = err instanceof Error ? err.message : '却下に失敗しました';
  } finally {
    state.processing.delete(bookingId);
    render();
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const dow = weekdays[d.getDay()];
  return `${month}/${day}(${dow})`;
}

function formatTime(time: string | null): string {
  if (!time) return '';
  return time.slice(0, 5);
}

function renderBookingCard(b: StaffBooking, showActions: boolean): string {
  const isProcessing = state.processing.has(b.id);
  const initial = (b.display_name || '?')[0];
  const dateLabel = formatDate(b.work_date);
  const timeLabel = b.start_time && b.end_time ? `${formatTime(b.start_time)}〜${formatTime(b.end_time)}` : '';
  const rateLabel = b.hourly_rate ? `¥${b.hourly_rate.toLocaleString()}/h` : '';

  return `
    <div class="booking-card">
      <div class="booking-header">
        <div class="worker-info">
          <div class="worker-avatar">${initial}</div>
          <div class="worker-details">
            <span class="worker-name">${b.display_name || '名前なし'}</span>
            <span class="nursery-label">${b.nursery_name || ''}</span>
          </div>
        </div>
        ${b.check_in_at ? '<span class="badge badge-checkin">出勤済</span>' : ''}
      </div>
      <div class="booking-meta">
        <div class="meta-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>${dateLabel}</span>
        </div>
        <div class="meta-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>${timeLabel}</span>
        </div>
        ${rateLabel ? `<div class="meta-item"><span class="rate">${rateLabel}</span></div>` : ''}
      </div>
      ${showActions ? `
        <div class="booking-actions">
          <button class="btn btn-approve" data-id="${b.id}" ${isProcessing ? 'disabled' : ''}>
            ${isProcessing ? '処理中...' : '承認する'}
          </button>
          <button class="btn btn-deny" data-id="${b.id}" ${isProcessing ? 'disabled' : ''}>
            見送り
          </button>
        </div>
      ` : `
        <div class="booking-status">
          ${b.check_in_at && b.check_out_at
            ? `<span class="status-label status-completed">勤務完了</span>`
            : b.check_in_at
              ? `<span class="status-label status-working">勤務中</span>`
              : `<span class="status-label status-confirmed">確定</span>`
          }
        </div>
      `}
    </div>
  `;
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;

  if (state.loading) {
    app.innerHTML = `
      <div class="loading-container">
        <div class="spinner"></div>
        <p>読み込み中...</p>
      </div>
    `;
    return;
  }

  if (state.error) {
    app.innerHTML = `
      <div class="error-container">
        <p class="error-text">${state.error}</p>
        <button class="btn btn-retry" onclick="location.reload()">再読み込み</button>
      </div>
    `;
    return;
  }

  const nurseryNames = state.nurseries.map((n) => n.nursery_name).join('・');
  const pendingCount = state.pending.length;
  const approvedCount = state.approved.length;

  const bookings = state.activeTab === 'pending' ? state.pending : state.approved;
  const showActions = state.activeTab === 'pending';
  const emptyMessage = state.activeTab === 'pending'
    ? '承認待ちの応募はありません'
    : '今後の確定シフトはありません';

  app.innerHTML = `
    <div class="staff-container">
      <header class="staff-header">
        <h1>園担当者メニュー</h1>
        <p class="nursery-names">${nurseryNames}</p>
      </header>

      <div class="tabs">
        <button class="tab ${state.activeTab === 'pending' ? 'active' : ''}" data-tab="pending">
          承認待ち${pendingCount > 0 ? `<span class="tab-badge">${pendingCount}</span>` : ''}
        </button>
        <button class="tab ${state.activeTab === 'approved' ? 'active' : ''}" data-tab="approved">
          確定シフト${approvedCount > 0 ? `<span class="tab-count">(${approvedCount})</span>` : ''}
        </button>
      </div>

      <div class="bookings-list">
        ${bookings.length === 0
          ? `<div class="empty-state"><p>${emptyMessage}</p></div>`
          : bookings.map((b) => renderBookingCard(b, showActions)).join('')
        }
      </div>
    </div>
  `;

  // イベントリスナー
  app.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.activeTab = (tab as HTMLElement).dataset.tab as 'pending' | 'approved';
      render();
    });
  });

  app.querySelectorAll('.btn-approve').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id;
      if (id) handleApprove(id);
    });
  });

  app.querySelectorAll('.btn-deny').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id;
      if (id) handleDeny(id);
    });
  });
}

function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --primary: #FF6B35;
      --primary-light: #FFF3ED;
      --green: #22C55E;
      --green-light: #DCFCE7;
      --red: #EF4444;
      --red-light: #FEE2E2;
      --blue: #3B82F6;
      --gray-50: #F9FAFB;
      --gray-100: #F3F4F6;
      --gray-200: #E5E7EB;
      --gray-400: #9CA3AF;
      --gray-500: #6B7280;
      --gray-700: #374151;
      --gray-900: #111827;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', system-ui, sans-serif;
      background: var(--gray-50);
      color: var(--gray-900);
      -webkit-font-smoothing: antialiased;
    }

    .loading-container, .error-container {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 60vh; gap: 16px; padding: 24px;
    }
    .spinner {
      width: 36px; height: 36px; border: 3px solid var(--gray-200);
      border-top-color: var(--primary); border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-text { color: var(--red); font-size: 14px; text-align: center; }

    .staff-container { max-width: 480px; margin: 0 auto; padding: 0 0 24px; }

    .staff-header {
      background: linear-gradient(135deg, var(--primary), #E85D2A);
      color: white; padding: 24px 20px 20px; text-align: center;
    }
    .staff-header h1 { font-size: 18px; font-weight: 700; }
    .nursery-names { font-size: 13px; opacity: 0.85; margin-top: 4px; }

    .tabs {
      display: flex; background: white; border-bottom: 1px solid var(--gray-200);
      position: sticky; top: 0; z-index: 10;
    }
    .tab {
      flex: 1; padding: 14px 8px; font-size: 14px; font-weight: 600;
      background: none; border: none; border-bottom: 2px solid transparent;
      color: var(--gray-400); cursor: pointer; display: flex;
      align-items: center; justify-content: center; gap: 6px;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab.active { color: var(--primary); border-bottom-color: var(--primary); }
    .tab-badge {
      background: var(--red); color: white; font-size: 11px;
      padding: 1px 7px; border-radius: 10px; font-weight: 700;
    }
    .tab-count { font-size: 12px; color: var(--gray-400); font-weight: 400; }

    .bookings-list { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }

    .empty-state {
      text-align: center; padding: 48px 24px; color: var(--gray-400); font-size: 14px;
    }

    .booking-card {
      background: white; border-radius: 12px; padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid var(--gray-100);
    }

    .booking-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .worker-info { display: flex; align-items: center; gap: 10px; }
    .worker-avatar {
      width: 40px; height: 40px; border-radius: 50%; background: var(--primary-light);
      color: var(--primary); display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700; flex-shrink: 0;
    }
    .worker-details { display: flex; flex-direction: column; }
    .worker-name { font-size: 15px; font-weight: 600; color: var(--gray-900); }
    .nursery-label { font-size: 12px; color: var(--gray-400); }

    .badge-checkin {
      font-size: 11px; padding: 3px 8px; border-radius: 6px;
      background: var(--green-light); color: var(--green); font-weight: 600;
    }

    .booking-meta {
      display: flex; gap: 16px; padding: 10px 0; border-top: 1px solid var(--gray-100);
      border-bottom: 1px solid var(--gray-100); margin-bottom: 12px;
    }
    .meta-item { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--gray-500); }
    .meta-item svg { color: var(--gray-400); }
    .rate { font-weight: 600; color: var(--primary); }

    .booking-actions { display: flex; gap: 8px; }
    .btn {
      flex: 1; padding: 10px 16px; border-radius: 8px; border: none;
      font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.15s;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn:active:not(:disabled) { opacity: 0.8; }
    .btn-approve { background: var(--primary); color: white; }
    .btn-deny { background: var(--gray-100); color: var(--gray-500); }
    .btn-retry { background: var(--primary); color: white; padding: 10px 32px; border-radius: 8px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; }

    .booking-status { text-align: right; }
    .status-label {
      font-size: 12px; padding: 4px 10px; border-radius: 6px; font-weight: 600;
    }
    .status-confirmed { background: var(--green-light); color: var(--green); }
    .status-working { background: #DBEAFE; color: var(--blue); }
    .status-completed { background: var(--gray-100); color: var(--gray-500); }
  `;
  document.head.appendChild(style);
}

export async function initNurseryStaff(): Promise<void> {
  injectStyles();

  const app = document.getElementById('app');
  if (!app) {
    document.body.innerHTML = '<div id="app"></div>';
  }

  render(); // loading state

  try {
    await fetchDashboard();
    state.loading = false;
  } catch (err) {
    state.loading = false;
    state.error = err instanceof Error ? err.message : 'エラーが発生しました';
  }

  render();
}
