// ─── Types ───────────────────────────────────────────────────────────────────

export type Job = {
  id: string
  connectionId: string
  nurseryName: string
  nurseryId?: string | null
  address?: string | null
  station?: string | null
  hourlyRate?: number | null
  description?: string | null
  requirements?: string | null
  capacity: number
  workDate: string
  startTime: string
  endTime: string
  status: 'open' | 'filled' | 'completed' | 'cancelled'
  metadata?: Record<string, unknown> | null
  attendanceToken?: string | null
  createdAt: string
  updatedAt: string
  remainingSlots?: number
  nurseryData?: Nursery | null
}

export type Nursery = {
  id: string
  name: string
  prefecture?: string | null
  area?: string | null
  nurseryType?: string | null
  qualificationReq?: string | null
  address?: string | null
  station?: string | null
  accessInfo?: string | null
  hpUrl?: string | null
  description?: string | null
  requirements?: string | null
  notes?: string | null
  transportFee?: string | null
  breakMinutes?: number | null
  photoR2Keys?: string | null
  photoUrls?: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type Booking = {
  id: string
  friendId: string
  jobId?: string | null
  title?: string | null
  startAt?: string | null
  endAt?: string | null
  status: string
  approvalStatus: 'pending' | 'approved' | 'denied'
  checkInAt?: string | null
  checkOutAt?: string | null
  actualHours?: number | null
  metadata?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  friendDisplayName?: string | null
  friendPictureUrl?: string | null
  qualificationType?: string | null
  nurseryName?: string | null
  workDate?: string | null
  startTime?: string | null
  endTime?: string | null
}

export type AttendanceRecord = {
  id: string
  friendId: string
  friendDisplayName?: string | null
  approvalStatus: string
  checkInAt?: string | null
  checkOutAt?: string | null
  actualHours?: number | null
}

export type ReviewItem = {
  id: string
  bookingId: string
  jobId: string
  reviewerType: 'worker' | 'nursery'
  reviewerId: string
  targetId: string
  overallRating: number
  wantToReturn: number | null
  jobAccuracy: number | null
  announcementQuality: number | null
  timeAccuracy: number | null
  comment: string | null
  createdAt: string
  nurseryName: string | null
  workDate: string | null
  workerName: string | null
}

export type ParsedJob = {
  nurseryId: string | null
  nurseryName: string
  workDate: string
  startTime: string
  endTime: string
  hourlyRate: number | null
  capacity: number
  description: string | null
  requirements: string | null
  address?: string | null
  station?: string | null
}

export type NurseryContact = {
  id: string
  nurseryId: string
  friendId: string
  lineUserId: string
  displayName: string | null
  role: string
  createdAt: string
}

export type Tag = {
  id: string
  name: string
  color: string
  createdAt: string
}

export type Friend = {
  id: string
  displayName: string | null
  lineUserId: string
  pictureUrl?: string | null
  isFollowing: boolean
  tags?: Tag[]
}

export type Message = {
  id: string
  direction: 'incoming' | 'outgoing'
  messageType: string
  content: string
  createdAt: string
}

export type ApiResponse<T> = {
  success: boolean
  data: T
  error?: string
}

// ─── Fetch Helper ────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

function getAuthToken(): string {
  if (typeof window !== 'undefined') {
    const jwt = localStorage.getItem('spot_admin_jwt')
    if (jwt) return jwt
    // フォールバック: 旧API_KEY方式（移行期間中）
    const apiKey = localStorage.getItem('spot_admin_api_key')
    if (apiKey) return apiKey
  }
  return process.env.NEXT_PUBLIC_API_KEY || ''
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
      ...options?.headers,
    },
  })
  if (res.status === 401 && typeof window !== 'undefined') {
    // JWT期限切れ or 無効 → 自動ログアウト
    localStorage.removeItem('spot_admin_jwt')
    localStorage.removeItem('spot_admin_api_key')
    window.location.href = '/login'
    throw new Error('認証が切れました。再ログインしてください。')
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json() as Promise<T>
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const api = {
  jobs: {
    list: (params?: { status?: string; fromDate?: string; toDate?: string }) => {
      const query: Record<string, string> = {}
      if (params?.status) query.status = params.status
      if (params?.fromDate) query.fromDate = params.fromDate
      if (params?.toDate) query.toDate = params.toDate
      return fetchApi<ApiResponse<Job[]>>('/api/jobs?' + new URLSearchParams(query))
    },
    get: (id: string) =>
      fetchApi<ApiResponse<Job>>(`/api/jobs/${id}`),
    create: (data: {
      connectionId: string
      nurseryName: string
      nurseryId?: string
      address?: string
      station?: string
      hourlyRate?: number
      description?: string
      requirements?: string
      capacity?: number
      workDate: string
      startTime: string
      endTime: string
      metadata?: Record<string, unknown>
    }) =>
      fetchApi<ApiResponse<Job>>('/api/jobs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Job>) =>
      fetchApi<ApiResponse<Job>>(`/api/jobs/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    updateStatus: (id: string, status: string) =>
      fetchApi<ApiResponse<void>>(`/api/jobs/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    parseEmail: (text: string) =>
      fetchApi<ApiResponse<ParsedJob[]>>('/api/jobs/parse-email', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    batch: (jobs: ParsedJob[]) =>
      fetchApi<ApiResponse<unknown[]> & { count: number }>('/api/jobs/batch', {
        method: 'POST',
        body: JSON.stringify({
          jobs: jobs.map((j) => ({
            connectionId: 'default',
            nurseryName: j.nurseryName,
            nurseryId: j.nurseryId || undefined,
            address: j.address || undefined,
            station: j.station || undefined,
            hourlyRate: j.hourlyRate || undefined,
            description: j.description || undefined,
            requirements: j.requirements || undefined,
            capacity: j.capacity,
            workDate: j.workDate,
            startTime: j.startTime,
            endTime: j.endTime,
          })),
        }),
      }),
  },

  bookings: {
    pending: () =>
      fetchApi<ApiResponse<Booking[]>>('/api/bookings/pending'),
    approve: (id: string) =>
      fetchApi<ApiResponse<void>>(`/api/bookings/${id}/approve`, { method: 'POST' }),
    deny: (id: string) =>
      fetchApi<ApiResponse<void>>(`/api/bookings/${id}/deny`, { method: 'POST' }),
  },

  nurseries: {
    list: () =>
      fetchApi<ApiResponse<Nursery[]>>('/api/nurseries'),
    get: (id: string) =>
      fetchApi<ApiResponse<Nursery>>(`/api/nurseries/${id}`),
    create: (data: Partial<Nursery>) =>
      fetchApi<ApiResponse<Nursery>>('/api/nurseries', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Nursery>) =>
      fetchApi<ApiResponse<Nursery>>(`/api/nurseries/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<ApiResponse<void>>(`/api/nurseries/${id}`, { method: 'DELETE' }),
    contacts: (id: string) =>
      fetchApi<ApiResponse<NurseryContact[]>>(`/api/nurseries/${id}/contacts`),
    addContact: (nurseryId: string, friendId: string) =>
      fetchApi<ApiResponse<NurseryContact>>(`/api/nurseries/${nurseryId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ friendId }),
      }),
    removeContact: (nurseryId: string, friendId: string) =>
      fetchApi<ApiResponse<void>>(`/api/nurseries/${nurseryId}/contacts/${friendId}`, {
        method: 'DELETE',
      }),
    uploadPhoto: async (nurseryId: string, file: File): Promise<ApiResponse<{ r2Key: string }>> => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_URL}/api/nurseries/${nurseryId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        body: formData,
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    deletePhoto: (nurseryId: string, fileName: string) =>
      fetchApi<ApiResponse<void>>(`/api/nurseries/${nurseryId}/photos/${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
      }),
  },

  attendance: {
    qrToken: (jobId: string) =>
      fetchApi<ApiResponse<{ token: string; checkinUrl: string }>>(`/api/attendance/qr/${jobId}`),
    byJob: (jobId: string) =>
      fetchApi<ApiResponse<AttendanceRecord[]>>(`/api/attendance/job/${jobId}`),
  },

  friends: {
    count: () =>
      fetchApi<ApiResponse<{ count: number }>>('/api/friends/count'),
    list: (params?: { limit?: number; offset?: number }) => {
      const q = new URLSearchParams()
      if (params?.limit) q.set('limit', String(params.limit))
      if (params?.offset) q.set('offset', String(params.offset))
      return fetchApi<ApiResponse<{ items: Friend[]; total: number }>>(`/api/friends?${q}`)
    },
    addTag: (friendId: string, tagId: string) =>
      fetchApi<ApiResponse<void>>(`/api/friends/${friendId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tagId }),
      }),
    removeTag: (friendId: string, tagId: string) =>
      fetchApi<ApiResponse<void>>(`/api/friends/${friendId}/tags/${tagId}`, {
        method: 'DELETE',
      }),
    messages: (friendId: string) =>
      fetchApi<ApiResponse<Message[]>>(`/api/friends/${friendId}/messages`),
    sendMessage: (friendId: string, content: string) =>
      fetchApi<ApiResponse<{ messageId: string }>>(`/api/friends/${friendId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
  },

  tags: {
    list: () =>
      fetchApi<ApiResponse<Tag[]>>('/api/tags'),
    create: (name: string, color?: string) =>
      fetchApi<ApiResponse<Tag>>('/api/tags', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      }),
    delete: (id: string) =>
      fetchApi<ApiResponse<void>>(`/api/tags/${id}`, { method: 'DELETE' }),
  },

  reviews: {
    submit: (data: {
      bookingId: string
      reviewerType: 'worker' | 'nursery'
      reviewerId: string
      overallRating: number
      wantToReturn: number
      comment?: string
    }) =>
      fetchApi<ApiResponse<{ id: string }>>('/api/reviews', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    check: (bookingId: string, reviewerType: 'worker' | 'nursery') =>
      fetchApi<ApiResponse<{ hasReviewed: boolean }>>(`/api/reviews/check?bookingId=${bookingId}&reviewerType=${reviewerType}`),
    nurseryStats: (nurseryId: string) =>
      fetchApi<ApiResponse<{ averageRating: number; totalReviews: number }>>(`/api/reviews/nursery/${nurseryId}/stats`),
    workerStats: (friendId: string) =>
      fetchApi<ApiResponse<{ averageRating: number; totalReviews: number }>>(`/api/reviews/stats/${friendId}?reviewerType=nursery`),
    list: () =>
      fetchApi<ApiResponse<ReviewItem[]>>('/api/reviews'),
  },
}
