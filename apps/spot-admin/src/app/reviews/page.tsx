'use client'
import { useEffect, useState, useCallback } from 'react'
import { api, fetchApi, type Booking, type ApiResponse, type ReviewItem } from '@/lib/api'

type CompletedBooking = Booking & {
  hasReviewed?: boolean
  workerRealName?: string | null
}

function StarDisplay({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const stars = [1, 2, 3, 4, 5]
  return (
    <span className="inline-flex items-center gap-0.5">
      {stars.map((i) => (
        <span key={i} className={`${size === 'lg' ? 'text-lg' : 'text-sm'} ${i <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
      ))}
      <span className={`ml-1 font-medium ${size === 'lg' ? 'text-base' : 'text-xs'} text-gray-700`}>{rating.toFixed(1)}</span>
    </span>
  )
}

export default function ReviewsPage() {
  const [tab, setTab] = useState<'list' | 'write'>('list')
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)

  // Write tab state
  const [bookings, setBookings] = useState<CompletedBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reviewTarget, setReviewTarget] = useState<CompletedBooking | null>(null)
  const [overallRating, setOverallRating] = useState(0)
  const [wantToReturn, setWantToReturn] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchReviews = useCallback(async () => {
    try {
      const res = await api.reviews.list()
      if (res.success) setReviews(res.data)
    } catch {
      // silent
    } finally {
      setReviewsLoading(false)
    }
  }, [])

  const fetchCompletedBookings = useCallback(async () => {
    try {
      setError('')
      const res = await fetchApi<ApiResponse<CompletedBooking[]>>(
        '/api/bookings/pending?includeCompleted=1'
      )
      if (res.success) {
        const completed = res.data.filter(
          (b) => b.approvalStatus === 'approved' && b.checkOutAt
        )
        const withReviewStatus = await Promise.all(
          completed.map(async (b) => {
            try {
              const checkRes = await api.reviews.check(b.id, 'nursery')
              return { ...b, hasReviewed: checkRes.data.hasReviewed }
            } catch {
              return { ...b, hasReviewed: false }
            }
          })
        )
        setBookings(withReviewStatus)
      }
    } catch {
      setError('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReviews()
    fetchCompletedBookings()
  }, [fetchReviews, fetchCompletedBookings])

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`
  }

  const handleOpenReview = (booking: CompletedBooking) => {
    setReviewTarget(booking)
    setOverallRating(0)
    setWantToReturn(0)
    setComment('')
  }

  const handleSubmitReview = async () => {
    if (!reviewTarget || overallRating === 0 || wantToReturn === 0) return
    setSubmitting(true)
    try {
      await api.reviews.submit({
        bookingId: reviewTarget.id,
        reviewerType: 'nursery',
        reviewerId: 'admin',
        overallRating,
        wantToReturn,
        comment: comment || undefined,
      })
      setReviewTarget(null)
      await Promise.all([fetchCompletedBookings(), fetchReviews()])
    } catch {
      setError('レビューの送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const StarSelector = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`text-3xl transition-colors ${i <= value ? 'text-yellow-400' : 'text-gray-300'}`}
          >
            ★
          </button>
        ))}
        {value > 0 && (
          <span className="ml-2 text-sm text-gray-500 self-center">
            {['', '非常に悪い', 'あまり良くない', 'どちらとも言えない', '良い', '非常に良い'][value]}
          </span>
        )}
      </div>
    </div>
  )

  const workerReviews = reviews.filter((r) => r.reviewerType === 'worker')
  const nurseryReviews = reviews.filter((r) => r.reviewerType === 'nursery')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">レビュー管理</h1>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('list')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          レビュー一覧 ({reviews.length})
        </button>
        <button
          onClick={() => setTab('write')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'write' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ワーカーを評価
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* ===== レビュー一覧タブ ===== */}
      {tab === 'list' && (
        <div className="space-y-8">
          {/* 保育士→園 レビュー */}
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-3">保育士 → 園のレビュー ({workerReviews.length}件)</h2>
            {reviewsLoading ? (
              <div className="text-center py-8 text-gray-500">読み込み中...</div>
            ) : workerReviews.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">まだレビューがありません</div>
            ) : (
              <div className="space-y-3">
                {workerReviews.map((r) => (
                  <div key={r.id} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">{r.nurseryName || '(不明)'}</p>
                        <p className="text-xs text-gray-400">{formatDate(r.workDate)} | by {r.workerName || r.reviewerId.slice(0, 8)}</p>
                      </div>
                      <StarDisplay rating={r.overallRating} size="lg" />
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 mb-2">
                      {r.wantToReturn && <span>また働きたい: ★{r.wantToReturn}</span>}
                      {r.jobAccuracy && <span>仕事内容: ★{r.jobAccuracy}</span>}
                      {r.announcementQuality && <span>アナウンス: ★{r.announcementQuality}</span>}
                      {r.timeAccuracy && <span>時間正確: ★{r.timeAccuracy}</span>}
                    </div>
                    {r.comment && (
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mt-2">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 園→保育士 レビュー */}
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-3">園 → 保育士のレビュー ({nurseryReviews.length}件)</h2>
            {nurseryReviews.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">まだレビューがありません</div>
            ) : (
              <div className="space-y-3">
                {nurseryReviews.map((r) => (
                  <div key={r.id} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">{r.workerName || r.targetId.slice(0, 8)}</p>
                        <p className="text-xs text-gray-400">{formatDate(r.workDate)} | {r.nurseryName || '(不明)'}</p>
                      </div>
                      <StarDisplay rating={r.overallRating} size="lg" />
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 mb-2">
                      {r.wantToReturn && <span>また来てほしい: ★{r.wantToReturn}</span>}
                    </div>
                    {r.comment && (
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mt-2">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== ワーカーを評価タブ ===== */}
      {tab === 'write' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-gray-500">読み込み中...</div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">レビュー対象の勤務がありません</p>
              <p className="text-sm text-gray-400 mt-1">勤務完了後にここに表示されます</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">勤務日</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ワーカー</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">園</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">時間</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ステータス</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{formatDate(b.workDate)}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          {b.friendPictureUrl && (
                            <img src={b.friendPictureUrl} alt="" className="w-8 h-8 rounded-full" />
                          )}
                          <span>{b.friendDisplayName || b.friendId}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{b.nurseryName || '-'}</td>
                      <td className="px-4 py-3 text-sm">{b.startTime}〜{b.endTime}</td>
                      <td className="px-4 py-3 text-sm">
                        {b.hasReviewed ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            レビュー済み
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            未レビュー
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!b.hasReviewed && (
                          <button
                            onClick={() => handleOpenReview(b)}
                            className="px-3 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                          >
                            レビューを書く
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* レビューモーダル */}
      {reviewTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1">ワーカーレビュー</h2>
            <p className="text-sm text-gray-500 mb-4">
              {reviewTarget.friendDisplayName} さん — {formatDate(reviewTarget.workDate)} {reviewTarget.startTime}〜{reviewTarget.endTime}
            </p>

            <StarSelector
              label="ワーカーの働きぶりはどうでしたか？"
              value={overallRating}
              onChange={setOverallRating}
            />

            <StarSelector
              label="ワーカーにまた来てほしいと思いますか？"
              value={wantToReturn}
              onChange={setWantToReturn}
            />

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">コメント（任意）</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="ワーカーについてのコメントをお願いします"
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setReviewTarget(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={overallRating === 0 || wantToReturn === 0 || submitting}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? '送信中...' : '送信'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
