'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { api, type Friend, type Tag, type Message } from '@/lib/api'

const BRAND_COLOR = '#FF6B35'

function ChatPanel({ friend, onClose }: { friend: Friend; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchMessages = useCallback(async () => {
    try {
      const res = await api.friends.messages(friend.id)
      setMessages(res.data)
    } catch (e) {
      console.error('Failed to fetch messages:', e)
    }
    setLoading(false)
  }, [friend.id])

  useEffect(() => { fetchMessages() }, [fetchMessages])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await api.friends.sendMessage(friend.id, text.trim())
      setText('')
      await fetchMessages()
    } catch (e) {
      console.error('Failed to send:', e)
      alert('送信に失敗しました')
    }
    setSending(false)
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white flex flex-col h-full shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 shrink-0">
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {friend.pictureUrl ? (
            <img src={friend.pictureUrl} alt="" className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium">
              {(friend.displayName || '?').charAt(0)}
            </div>
          )}
          <p className="font-medium text-sm text-gray-900">{friend.displayName || '名前不明'}</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-8">読み込み中...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">メッセージ履歴がありません</div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                    msg.direction === 'outgoing'
                      ? 'bg-[#FF6B35] text-white rounded-br-md'
                      : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                  }`}
                >
                  <p>{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${msg.direction === 'outgoing' ? 'text-white/70' : 'text-gray-400'}`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-200 shrink-0 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="メッセージを入力..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': BRAND_COLOR } as React.CSSProperties}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="w-10 h-10 flex items-center justify-center rounded-full text-white transition-opacity hover:opacity-90 disabled:opacity-40 shrink-0"
              style={{ backgroundColor: BRAND_COLOR }}
            >
              {sending ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tagMenuOpen, setTagMenuOpen] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)
  const [chatFriend, setChatFriend] = useState<Friend | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError('')
      const [friendsRes, tagsRes] = await Promise.all([
        api.friends.list({ limit: 200 }),
        api.tags.list(),
      ])
      setFriends(friendsRes.data.items)
      setTags(tagsRes.data)
    } catch (e) {
      console.error('Failed to fetch:', e)
      setError('データの取得に失敗しました')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAddTag = async (friendId: string, tagId: string) => {
    try {
      await api.friends.addTag(friendId, tagId)
      await fetchData()
    } catch (e) {
      console.error('Failed to add tag:', e)
    }
    setTagMenuOpen(null)
  }

  const handleRemoveTag = async (friendId: string, tagId: string) => {
    try {
      await api.friends.removeTag(friendId, tagId)
      await fetchData()
    } catch (e) {
      console.error('Failed to remove tag:', e)
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    setCreatingTag(true)
    try {
      await api.tags.create(newTagName.trim())
      setNewTagName('')
      await fetchData()
    } catch (e) {
      console.error('Failed to create tag:', e)
    }
    setCreatingTag(false)
  }

  const friendTags = (friend: Friend) => friend.tags || []
  const availableTags = (friend: Friend) => {
    const assigned = new Set(friendTags(friend).map(t => t.id))
    return tags.filter(t => !assigned.has(t.id))
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">ユーザー一覧</h1>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          ユーザー一覧
          <span className="ml-2 text-base font-normal text-gray-400">{friends.length}人</span>
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      {/* Tag management */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">タグ管理</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {tags.map(tag => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          {tags.length === 0 && <span className="text-sm text-gray-400">タグがありません</span>}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
            placeholder="新しいタグ名"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': BRAND_COLOR } as React.CSSProperties}
          />
          <button
            onClick={handleCreateTag}
            disabled={creatingTag || !newTagName.trim()}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            追加
          </button>
        </div>
      </div>

      {/* Friends list */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="divide-y divide-gray-100">
          {friends.map(friend => (
            <div key={friend.id} className="px-4 sm:px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {friend.pictureUrl ? (
                    <img src={friend.pictureUrl} alt="" className="w-10 h-10 rounded-full shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium shrink-0">
                      {(friend.displayName || '?').charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {friend.displayName || '名前不明'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {friend.isFollowing ? 'フォロー中' : 'ブロック/解除'}
                    </p>
                  </div>
                </div>

                {/* Actions: tags + message + add tag */}
                <div className="flex items-center gap-2 flex-wrap justify-end relative">
                  {friendTags(friend).map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => handleRemoveTag(friend.id, tag.id)}
                      title={`${tag.name} を外す`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ))}

                  {/* Message button */}
                  <button
                    onClick={() => setChatFriend(friend)}
                    className="w-7 h-7 flex items-center justify-center rounded-full text-white transition-opacity hover:opacity-80"
                    style={{ backgroundColor: '#06C755' }}
                    title="メッセージ"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </button>

                  {availableTags(friend).length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setTagMenuOpen(tagMenuOpen === friend.id ? null : friend.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
                        title="タグを追加"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </button>

                      {tagMenuOpen === friend.id && (
                        <div className="absolute right-0 top-9 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                          {availableTags(friend).map(tag => (
                            <button
                              key={tag.id}
                              onClick={() => handleAddTag(friend.id, tag.id)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                              {tag.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {friends.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">ユーザーがいません</div>
          )}
        </div>
      </div>

      {/* Chat panel */}
      {chatFriend && <ChatPanel friend={chatFriend} onClose={() => setChatFriend(null)} />}
    </div>
  )
}
