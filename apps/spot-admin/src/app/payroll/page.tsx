'use client'
import { useEffect, useState, useCallback } from 'react'
import { fetchApi, type ApiResponse } from '@/lib/api'
import StatusBadge from '@/components/status-badge'

type PayrollRecord = {
  id: string
  friendId: string
  friendDisplayName?: string
  workDate: string
  nurseryName: string
  startTime: string
  endTime: string
  actualHours: number | null
  hourlyRate: number
  grossAmount: number
  transportFee: number
  withholdingTax: number
  netAmount: number
  paymentMethod: 'spot' | 'monthly'
  paymentStatus: 'pending' | 'processing' | 'paid'
  paidAt: string | null
}

type CompletedWorker = {
  bookingId: string
  friendId: string
  displayName: string
  pictureUrl: string | null
  realName: string | null
  phone: string | null
  qualificationType: string | null
  nurseryName: string
  workDate: string
  startTime: string
  endTime: string
  hourlyRate: number
  actualHours: number | null
  checkInAt: string | null
  checkOutAt: string | null
  bankName: string | null
  branchName: string | null
  accountType: string | null
  accountNumber: string | null
  accountHolder: string | null
}

export default function PayrollPage() {
  const [tab, setTab] = useState<'payroll' | 'workers'>('workers')

  // Payroll tab
  const [records, setRecords] = useState<PayrollRecord[]>([])
  const [payrollLoading, setPayrollLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all')

  // Workers tab
  const [workers, setWorkers] = useState<CompletedWorker[]>([])
  const [workersLoading, setWorkersLoading] = useState(true)
  const [nurseryOptions, setNurseryOptions] = useState<string[]>([])
  const [monthFilter, setMonthFilter] = useState('')
  const [nurseryFilter, setNurseryFilter] = useState('')
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null)

  const fetchRecords = useCallback(async () => {
    try {
      setError('')
      const params = filter !== 'all' ? `?status=${filter}` : ''
      const res = await fetchApi<ApiResponse<PayrollRecord[]>>(`/api/payroll/admin/list${params}`)
      if (res.success) setRecords(res.data)
    } catch {
      setRecords([])
    } finally {
      setPayrollLoading(false)
    }
  }, [filter])

  const fetchWorkers = useCallback(async () => {
    try {
      setError('')
      const params = new URLSearchParams()
      if (monthFilter) params.set('month', monthFilter)
      if (nurseryFilter) params.set('nurseryName', nurseryFilter)
      const q = params.toString()
      const res = await fetchApi<ApiResponse<{ workers: CompletedWorker[]; nurseries: string[] }>>(
        `/api/payroll/admin/workers${q ? `?${q}` : ''}`
      )
      if (res.success) {
        setWorkers(res.data.workers)
        if (!nurseryFilter && !monthFilter) setNurseryOptions(res.data.nurseries)
      }
    } catch {
      setWorkers([])
    } finally {
      setWorkersLoading(false)
    }
  }, [monthFilter, nurseryFilter])

  useEffect(() => {
    if (tab === 'payroll') { setPayrollLoading(true); fetchRecords() }
  }, [tab, fetchRecords])

  useEffect(() => {
    if (tab === 'workers') { setWorkersLoading(true); fetchWorkers() }
  }, [tab, fetchWorkers])

  const handleMarkPaid = async (id: string) => {
    try {
      await fetchApi<ApiResponse<void>>(`/api/payroll/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'paid' }),
      })
      await fetchRecords()
    } catch {
      setError('ステータス更新に失敗しました')
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr + 'T00:00:00')
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`
  }

  const totalPending = records.filter(r => r.paymentStatus === 'pending').reduce((s, r) => s + r.netAmount, 0)

  // 現在の月をデフォルト選択肢に
  const monthOptions = (() => {
    const months: string[] = []
    const now = new Date()
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months
  })()

  const qualLabel: Record<string, string> = {
    hoikushi: '保育士', kangoshi: '看護師', kosodate_shienin: '子育て支援員', mukaku: '無資格',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">報酬管理</h1>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('workers')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'workers' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          勤務済みワーカー
        </button>
        <button
          onClick={() => setTab('payroll')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'payroll' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          報酬レコード
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

      {/* ===== 勤務済みワーカータブ ===== */}
      {tab === 'workers' && (
        <>
          {/* フィルター */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
            >
              <option value="">すべての月</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>{m.replace('-', '年') + '月'}</option>
              ))}
            </select>
            <select
              value={nurseryFilter}
              onChange={(e) => setNurseryFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
            >
              <option value="">すべての園</option>
              {nurseryOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-sm text-gray-500 self-center">{workers.length}件</span>
          </div>

          {workersLoading ? (
            <div className="text-center py-12 text-gray-500">読み込み中...</div>
          ) : workers.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <p className="text-gray-500">勤務済みワーカーはまだいません</p>
              <p className="text-sm text-gray-400 mt-2">ワーカーがチェックアウトすると表示されます</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workers.map((w) => (
                <div key={w.bookingId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedWorker(expandedWorker === w.bookingId ? null : w.bookingId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {w.pictureUrl ? (
                          <img src={w.pictureUrl} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-medium">
                            {(w.displayName || '?').charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">
                            {w.realName || w.displayName}
                            {w.realName && w.displayName && w.realName !== w.displayName && (
                              <span className="text-xs text-gray-400 ml-1">({w.displayName})</span>
                            )}
                          </p>
                          <p className="text-sm text-gray-500">
                            {w.nurseryName} ・ {formatDate(w.workDate)} {w.startTime}〜{w.endTime}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {w.qualificationType && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                            {qualLabel[w.qualificationType] || w.qualificationType}
                          </span>
                        )}
                        {w.bankName ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">口座登録済</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">口座未登録</span>
                        )}
                        <span className="text-gray-400 text-sm">{expandedWorker === w.bookingId ? '▲' : '▼'}</span>
                      </div>
                    </div>
                  </div>

                  {expandedWorker === w.bookingId && (
                    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs mb-1">連絡先</p>
                          <p>{w.phone || '未登録'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">実働時間</p>
                          <p>{w.actualHours ? `${w.actualHours.toFixed(1)}h` : '-'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">時給</p>
                          <p>¥{w.hourlyRate?.toLocaleString() || '-'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">概算報酬</p>
                          <p className="font-bold text-orange-600">
                            {w.actualHours && w.hourlyRate
                              ? `¥${Math.round(w.actualHours * w.hourlyRate).toLocaleString()}`
                              : '-'}
                          </p>
                        </div>
                      </div>

                      {/* 口座情報 */}
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-gray-500 text-xs mb-2 font-medium">振込先口座</p>
                        {w.bankName ? (
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-gray-400">銀行:</span> {w.bankName}</div>
                            <div><span className="text-gray-400">支店:</span> {w.branchName}</div>
                            <div><span className="text-gray-400">種別:</span> {w.accountType === 'ordinary' ? '普通' : w.accountType === 'current' ? '当座' : w.accountType}</div>
                            <div><span className="text-gray-400">番号:</span> {w.accountNumber}</div>
                            <div className="col-span-2"><span className="text-gray-400">名義:</span> {w.accountHolder}</div>
                          </div>
                        ) : (
                          <p className="text-sm text-yellow-600">口座情報が未登録です</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== 報酬レコードタブ ===== */}
      {tab === 'payroll' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              未払い合計: <span className="font-bold text-orange-600">¥{totalPending.toLocaleString()}</span>
            </p>
            <div className="flex gap-2">
              {(['all', 'pending', 'paid'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setPayrollLoading(true) }}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    filter === f
                      ? 'bg-orange-50 border-orange-300 text-orange-700 font-medium'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {{ all: 'すべて', pending: '未払���', paid: '振込済' }[f]}
                </button>
              ))}
            </div>
          </div>

          {payrollLoading ? (
            <div className="text-center py-12 text-gray-500">読み込み中...</div>
          ) : records.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <p className="text-gray-500">報酬レコードはまだありません</p>
              <p className="text-sm text-gray-400 mt-2">ワーカーがチェックアウトすると自動で作成されます</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日付</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">園</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ワーカー</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">報酬</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">源泉</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">手取り</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">方法</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">状態</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{formatDate(r.workDate)}</td>
                      <td className="px-4 py-3 text-sm font-medium">{r.nurseryName}</td>
                      <td className="px-4 py-3 text-sm">{r.friendDisplayName || r.friendId.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-sm text-right">¥{r.grossAmount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right text-red-600">
                        {r.withholdingTax > 0 ? `-¥${r.withholdingTax.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold">¥{r.netAmount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          r.paymentMethod === 'spot' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {r.paymentMethod === 'spot' ? 'スポット' : '月末'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={r.paymentStatus === 'paid' ? 'completed' : r.paymentStatus} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.paymentStatus === 'pending' && (
                          <button
                            onClick={() => handleMarkPaid(r.id)}
                            className="text-xs px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                          >
                            振込済にする
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
    </div>
  )
}
