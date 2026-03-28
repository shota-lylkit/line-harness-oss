'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { api, type Nursery, type NurseryContact, type Friend } from '@/lib/api'

type FormData = {
  name: string
  prefecture: string
  area: string
  nurseryType: string
  qualificationReq: string
  address: string
  station: string
  accessInfo: string
  description: string
  notes: string
}

const emptyForm: FormData = {
  name: '', prefecture: '', area: '', nurseryType: '', qualificationReq: '',
  address: '', station: '', accessInfo: '', description: '', notes: '',
}

export default function NurseriesPage() {
  const [nurseries, setNurseries] = useState<Nursery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)

  // 担当者管理
  const [expandedNurseryId, setExpandedNurseryId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<NurseryContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [showFriendPicker, setShowFriendPicker] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendSearch, setFriendSearch] = useState('')
  const [friendsLoading, setFriendsLoading] = useState(false)

  const fetchNurseries = useCallback(async () => {
    try {
      const res = await api.nurseries.list()
      if (res.success) setNurseries(res.data)
    } catch {
      setError('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNurseries() }, [fetchNurseries])

  const openCreate = () => {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (nursery: Nursery) => {
    setForm({
      name: nursery.name,
      prefecture: nursery.prefecture || '',
      area: nursery.area || '',
      nurseryType: nursery.nurseryType || '',
      qualificationReq: nursery.qualificationReq || '',
      address: nursery.address || '',
      station: nursery.station || '',
      accessInfo: nursery.accessInfo || '',
      description: nursery.description || '',
      notes: nursery.notes || '',
    })
    setEditingId(nursery.id)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) { setError('園名は必須です'); return }

    setSaving(true)
    setError('')

    try {
      if (editingId) {
        await api.nurseries.update(editingId, form)
      } else {
        await api.nurseries.create(form)
      }
      setShowForm(false)
      setLoading(true)
      await fetchNurseries()
    } catch {
      setError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この園を無効化しますか？')) return
    try {
      await api.nurseries.delete(id)
      setLoading(true)
      await fetchNurseries()
    } catch {
      setError('削除に失敗しました')
    }
  }

  // 担当者管理
  const toggleContacts = async (nurseryId: string) => {
    if (expandedNurseryId === nurseryId) {
      setExpandedNurseryId(null)
      return
    }
    setExpandedNurseryId(nurseryId)
    setContactsLoading(true)
    try {
      const res = await api.nurseries.contacts(nurseryId)
      if (res.success) setContacts(res.data)
    } catch {
      setError('担当者の取得に失敗しました')
    } finally {
      setContactsLoading(false)
    }
  }

  const openFriendPicker = async () => {
    setShowFriendPicker(true)
    setFriendsLoading(true)
    try {
      const res = await api.friends.list({ limit: 100 })
      if (res.success) setFriends(res.data.items)
    } catch {
      setError('友だち一覧の取得に失敗しました')
    } finally {
      setFriendsLoading(false)
    }
  }

  const addContact = async (friendId: string) => {
    if (!expandedNurseryId) return
    try {
      await api.nurseries.addContact(expandedNurseryId, friendId)
      setShowFriendPicker(false)
      setFriendSearch('')
      // reload contacts
      const res = await api.nurseries.contacts(expandedNurseryId)
      if (res.success) setContacts(res.data)
    } catch {
      setError('担当者の追加に失敗しました')
    }
  }

  const removeContact = async (friendId: string) => {
    if (!expandedNurseryId) return
    if (!confirm('この担当者を解除しますか？')) return
    try {
      await api.nurseries.removeContact(expandedNurseryId, friendId)
      const res = await api.nurseries.contacts(expandedNurseryId)
      if (res.success) setContacts(res.data)
    } catch {
      setError('担当者の解除に失敗しました')
    }
  }

  const filteredFriends = friends.filter(f =>
    !friendSearch || (f.displayName || '').toLowerCase().includes(friendSearch.toLowerCase())
  )

  const Field = ({ label, name, type = 'text', required = false }: { label: string; name: keyof FormData; type?: string; required?: boolean }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && ' *'}</label>
      {type === 'textarea' ? (
        <textarea
          value={form[name]}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          rows={2}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
        />
      ) : (
        <input
          type={type}
          value={form[name]}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          required={required}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      )}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">園マスター</h1>
          <p className="text-sm text-gray-500 mt-1">{nurseries.length}園登録済み</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#FF6B35' }}
        >
          + 新規登録
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editingId ? '園情報を編集' : '新規園登録'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="園名" name="name" required />
              <div className="grid grid-cols-2 gap-4">
                <Field label="都道府県" name="prefecture" />
                <Field label="エリア" name="area" />
              </div>
              <Field label="住所" name="address" />
              <Field label="最寄駅" name="station" />
              <Field label="アクセス" name="accessInfo" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="施設種別" name="nurseryType" />
                <Field label="必要資格" name="qualificationReq" />
              </div>
              <Field label="説明" name="description" type="textarea" />
              <Field label="備考" name="notes" type="textarea" />
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#FF6B35' }}
                >
                  {saving ? '保存中...' : editingId ? '更新' : '登録'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Friend Picker Modal */}
      {showFriendPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setShowFriendPicker(false); setFriendSearch('') }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] m-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900 mb-3">担当者を選択</h2>
              <input
                type="text"
                placeholder="名前で検索..."
                value={friendSearch}
                onChange={(e) => setFriendSearch(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {friendsLoading ? (
                <div className="py-8 text-center text-sm text-gray-400">読み込み中...</div>
              ) : filteredFriends.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">該当する友だちがいません</div>
              ) : (
                filteredFriends.map((f) => {
                  const alreadyAdded = contacts.some(ct => ct.friendId === f.id)
                  return (
                    <button
                      key={f.id}
                      onClick={() => !alreadyAdded && addContact(f.id)}
                      disabled={alreadyAdded}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-orange-50'}`}
                    >
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold shrink-0">
                        {(f.displayName || '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{f.displayName || '名前なし'}</p>
                        {alreadyAdded && <p className="text-xs text-gray-400">追加済み</p>}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
            <div className="p-3 border-t border-gray-200">
              <button onClick={() => { setShowFriendPicker(false); setFriendSearch('') }}
                className="w-full py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200">
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-6 py-4 border-b border-gray-100 animate-pulse">
              <div className="h-5 w-40 bg-gray-100 rounded mb-2" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : nurseries.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-gray-500">園が登録されていません</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">園名</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">エリア</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">最寄駅</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">種別</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {nurseries.map((n) => (
                  <React.Fragment key={n.id}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{n.name}</p>
                        {n.address && <p className="text-xs text-gray-500">{n.address}</p>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{n.area || n.prefecture || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{n.station || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{n.nurseryType || '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => toggleContacts(n.id)}
                            className={`text-xs hover:underline ${expandedNurseryId === n.id ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                            担当者
                          </button>
                          <button onClick={() => openEdit(n)} className="text-xs text-blue-600 hover:underline">編集</button>
                          <button onClick={() => handleDelete(n.id)} className="text-xs text-red-500 hover:underline">無効化</button>
                        </div>
                      </td>
                    </tr>
                    {expandedNurseryId === n.id && (
                      <tr>
                        <td colSpan={5} className="px-6 pb-4 bg-orange-50/50 border-t border-orange-100">
                          <div className="flex items-center justify-between py-3">
                            <h3 className="text-sm font-semibold text-gray-700">LINE担当者</h3>
                            <button onClick={openFriendPicker}
                              className="px-3 py-1.5 text-xs font-medium text-white rounded-md"
                              style={{ backgroundColor: '#FF6B35' }}>
                              + 担当者を追加
                            </button>
                          </div>
                          {contactsLoading ? (
                            <div className="py-3 text-sm text-gray-400">読み込み中...</div>
                          ) : contacts.length === 0 ? (
                            <div className="py-3 text-sm text-gray-400">担当者が登録されていません。追加すると応募通知がLINEで届きます。</div>
                          ) : (
                            <div className="space-y-2">
                              {contacts.map((ct) => (
                                <div key={ct.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-gray-200">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xs font-bold">
                                      {(ct.displayName || '?')[0]}
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">{ct.displayName || '名前なし'}</p>
                                      <p className="text-xs text-gray-400">{ct.role}</p>
                                    </div>
                                  </div>
                                  <button onClick={() => removeContact(ct.friendId)}
                                    className="text-xs text-red-400 hover:text-red-600">解除</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
