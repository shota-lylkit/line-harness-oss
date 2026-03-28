/**
 * LIFF Review Page — レビュー投稿画面
 *
 * ?page=review&bookingId=xxx でアクセス
 * 勤務完了後、ワーカーが園をレビューする
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
const LIFF_ID = import.meta.env?.VITE_LIFF_ID || '';
const BOT_BASIC_ID = import.meta.env?.VITE_BOT_BASIC_ID || '';

function apiCall(path: string, options?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const idToken = liff.getIDToken();
    if (idToken) headers['X-LIFF-Token'] = idToken;
  } catch { /* LIFF not initialized */ }
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
}

interface BookingInfo {
  id: string;
  nurseryName: string;
  workDate: string;
  startTime: string;
  endTime: string;
  friendId: string;
}

interface ReviewState {
  booking: BookingInfo | null;
  wantToReturn: number;
  jobAccuracy: number;
  announcementQuality: number;
  timeAccuracy: number;
  comment: string;
  submitting: boolean;
  alreadyReviewed: boolean;
}

const state: ReviewState = {
  booking: null,
  wantToReturn: 0,
  jobAccuracy: 0,
  announcementQuality: 0,
  timeAccuracy: 0,
  comment: '',
  submitting: false,
  alreadyReviewed: false,
};

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${month}月${day}日(${dow})`;
}

function renderStars(fieldName: string, value: number, label: string, description: string): string {
  const stars = [1, 2, 3, 4, 5].map((i) => {
    const filled = i <= value;
    return `<span class="review-star ${filled ? 'filled' : ''}" data-field="${fieldName}" data-value="${i}">★</span>`;
  }).join('');

  const labels = ['', '低い', 'やや低い', '普通', '良い', '非常に良い'];
  const selectedLabel = value > 0 ? labels[value] : '';

  return `
    <div class="review-item">
      <div class="review-label">${escapeHtml(label)}</div>
      <div class="review-description">${escapeHtml(description)}</div>
      <div class="review-stars" data-field="${fieldName}">
        ${stars}
        <span class="review-value-label">${selectedLabel}</span>
      </div>
    </div>
  `;
}

function render(): void {
  const container = document.getElementById('app')!;

  if (!state.booking) {
    container.innerHTML = `
      <div class="review-page">
        <div class="review-loading">読み込み中...</div>
      </div>
    `;
    return;
  }

  if (state.alreadyReviewed) {
    container.innerHTML = `
      <div class="review-page">
        <div class="review-card">
          <div class="review-complete-icon">✓</div>
          <h2>レビュー済み</h2>
          <p>${escapeHtml(state.booking.nurseryName)}のレビューは既に送信されています。</p>
          <p class="review-thanks">ご協力ありがとうございました！</p>
          <button class="review-close-btn" id="closeBtn">閉じる</button>
        </div>
      </div>
    `;
    const goBack = () => {
      if (liff.isInClient()) {
        try { liff.closeWindow(); } catch { /* fallback below */ }
      }
      if (BOT_BASIC_ID) {
        window.location.href = `https://line.me/R/oaMessage/${BOT_BASIC_ID}/`;
      } else {
        window.close();
      }
    };
    document.getElementById('closeBtn')?.addEventListener('click', goBack);
    // 3秒後に自動でトーク画面に戻る
    setTimeout(goBack, 3000);
    return;
  }

  const allRated = state.wantToReturn > 0 && state.jobAccuracy > 0 && state.announcementQuality > 0 && state.timeAccuracy > 0;

  container.innerHTML = `
    <div class="review-page">
      <div class="review-header">
        <h1>園のレビュー</h1>
        <div class="review-booking-info">
          <div class="review-nursery-name">${escapeHtml(state.booking.nurseryName)}</div>
          <div class="review-date">${formatDate(state.booking.workDate)} ${state.booking.startTime}〜${state.booking.endTime}</div>
        </div>
      </div>

      <div class="review-card">
        <p class="review-intro">お疲れ様でした！<br>今後応募される方の参考になりますので、ぜひご感想をお聞かせください。</p>

        ${renderStars('wantToReturn', state.wantToReturn, 'また働きたいと思いましたか？', '園の雰囲気や働きやすさの総合的な印象')}
        ${renderStars('jobAccuracy', state.jobAccuracy, '仕事内容は掲載通りでしたか？', '求人に書かれていた内容との一致度')}
        ${renderStars('announcementQuality', state.announcementQuality, '仕事内容のアナウンスは丁寧でしたか？', '当日の業務説明や案内の丁寧さ')}
        ${renderStars('timeAccuracy', state.timeAccuracy, '勤務時間は予定通りでしたか？', '開始・終了時刻が予定と合っていたか')}

        <div class="review-item">
          <div class="review-label">コメント</div>
          <div class="review-description">自由にご記入ください（任意）</div>
          <textarea class="review-comment" id="reviewComment" placeholder="園の雰囲気や気づいたことなど..." rows="4">${escapeHtml(state.comment)}</textarea>
        </div>

        <button class="review-submit-btn ${!allRated || state.submitting ? 'disabled' : ''}" id="submitBtn" ${!allRated || state.submitting ? 'disabled' : ''}>
          ${state.submitting ? '送信中...' : 'レビューを送信'}
        </button>

        ${!allRated ? '<p class="review-hint">すべての項目を評価してください</p>' : ''}
      </div>
    </div>
  `;

  // イベントリスナー
  container.querySelectorAll('.review-star').forEach((star) => {
    star.addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement;
      const field = el.dataset.field as string;
      const value = parseInt(el.dataset.value || '0', 10);
      if (field === 'wantToReturn') state.wantToReturn = value;
      else if (field === 'jobAccuracy') state.jobAccuracy = value;
      else if (field === 'announcementQuality') state.announcementQuality = value;
      else if (field === 'timeAccuracy') state.timeAccuracy = value;
      render();
    });
  });

  document.getElementById('reviewComment')?.addEventListener('input', (e) => {
    state.comment = (e.target as HTMLTextAreaElement).value;
  });

  document.getElementById('submitBtn')?.addEventListener('click', handleSubmit);
}

async function handleSubmit(): Promise<void> {
  if (state.submitting || !state.booking) return;
  state.submitting = true;
  render();

  try {
    const friendId = state.booking.friendId;
    const res = await apiCall('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        bookingId: state.booking.id,
        reviewerType: 'worker',
        reviewerId: friendId,
        wantToReturn: state.wantToReturn,
        jobAccuracy: state.jobAccuracy,
        announcementQuality: state.announcementQuality,
        timeAccuracy: state.timeAccuracy,
        comment: state.comment || undefined,
      }),
    });

    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error || 'レビューの送信に失敗しました');
    }

    // 送信完了画面
    const container = document.getElementById('app')!;
    container.innerHTML = `
      <div class="review-page">
        <div class="review-card">
          <div class="review-complete-icon">✓</div>
          <h2>ありがとうございます！</h2>
          <p>${escapeHtml(state.booking!.nurseryName)}のレビューを送信しました。</p>
          <p class="review-thanks">ご協力いただきありがとうございました。<br>今後応募される方の参考になります。</p>
          <button class="review-close-btn" id="closeBtn">閉じる</button>
        </div>
      </div>
    `;
    const goBack = () => {
      if (liff.isInClient()) {
        try { liff.closeWindow(); } catch { /* fallback below */ }
      }
      if (BOT_BASIC_ID) {
        window.location.href = `https://line.me/R/oaMessage/${BOT_BASIC_ID}/`;
      } else {
        window.close();
      }
    };
    document.getElementById('closeBtn')?.addEventListener('click', goBack);
    // 3秒後に自動でトーク画面に戻る
    setTimeout(goBack, 3000);
  } catch (err) {
    state.submitting = false;
    alert(err instanceof Error ? err.message : 'エラーが発生しました');
    render();
  }
}

function getReviewParams(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  const liffState = params.get('liff.state');
  if (liffState) {
    const stateParams = new URLSearchParams(liffState.replace(/^\?/, ''));
    for (const [key, value] of stateParams) {
      params.set(key, value);
    }
  }
  return params;
}

export async function initReview(): Promise<void> {
  const params = getReviewParams();
  const bookingId = params.get('bookingId');

  if (!bookingId) {
    document.getElementById('app')!.innerHTML = `
      <div class="review-page">
        <div class="review-card">
          <p>レビュー対象が見つかりません。</p>
          <button class="review-close-btn" onclick="window.close()">閉じる</button>
        </div>
      </div>
    `;
    return;
  }

  render();

  try {
    // 予約情報を取得（LIFF認証経由）
    const friendId = localStorage.getItem('lh_friend_id') || '';

    // 既にレビュー済みか確認
    const checkRes = await apiCall(`/api/reviews/check?bookingId=${bookingId}&reviewerType=worker`);
    if (checkRes.ok) {
      const checkData = await checkRes.json() as { data: { hasReviewed: boolean } };
      if (checkData.data.hasReviewed) {
        state.alreadyReviewed = true;
        // bookingの情報だけ最低限セット
        state.booking = { id: bookingId, nurseryName: '', workDate: '', startTime: '', endTime: '', friendId };
      }
    }

    if (!state.alreadyReviewed) {
      // 予約詳細を取得
      const bookingRes = await apiCall(`/api/liff/bookings/${bookingId}`);
      if (!bookingRes.ok) throw new Error('予約情報の取得に失敗しました');
      const bookingData = await bookingRes.json() as {
        data: {
          id: string;
          nursery_name?: string;
          work_date?: string;
          start_time?: string;
          end_time?: string;
          friend_id?: string;
        };
      };
      const b = bookingData.data;
      state.booking = {
        id: b.id,
        nurseryName: b.nursery_name || '（園名不明）',
        workDate: b.work_date || '',
        startTime: b.start_time || '',
        endTime: b.end_time || '',
        friendId: b.friend_id || friendId,
      };
    }

    render();
  } catch (err) {
    document.getElementById('app')!.innerHTML = `
      <div class="review-page">
        <div class="review-card">
          <p>エラー: ${err instanceof Error ? escapeHtml(err.message) : 'データの読み込みに失敗しました'}</p>
          <button class="review-close-btn" onclick="window.close()">閉じる</button>
        </div>
      </div>
    `;
  }
}
