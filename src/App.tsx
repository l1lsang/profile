import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'

type CounselorProfile = {
  nickname: string
  avatarEmoji: string
  empathy: number
  listening: number
  atmosphere: string[]
  adviceStyle: string
  specialties: string[]
  methods: string[]
  responseSpeed: string
  intro: string
  statusEmoji: string
  contactNote: string
  updatedAt: string
}

type Review = {
  id: string
  overall: number
  empathy: number
  listening: number
  comfort: number
  emoji: string
  comment: string
  createdAt: string
}

type AppData = {
  profile: CounselorProfile
  reviews: Review[]
  hasPassword: boolean
}

type LocalPayload = AppData & {
  passwordHash: string
}

type RemotePayload = {
  profile: CounselorProfile | null
  reviews: Review[]
  hasPassword: boolean
}

type ListField = 'atmosphere' | 'specialties' | 'methods'
type ReviewMetric = 'overall' | 'empathy' | 'listening' | 'comfort'

const LOCAL_STORAGE_KEY = 'counselor-profile-data-v1'
const emojiOptions = ['🌤️', '🌿', '🫶', '☕', '💬', '✨']
const reviewEmojiOptions = ['😊', '🙂', '😌', '🥹', '💛']
const ratingSteps = [1, 2, 3, 4, 5]

const emptyReview = {
  overall: 5,
  empathy: 5,
  listening: 5,
  comfort: 5,
  emoji: '😊',
  comment: '',
}

const makeDefaultProfile = (): CounselorProfile => ({
  nickname: '하늘',
  avatarEmoji: '🌤️',
  empathy: 5,
  listening: 4,
  atmosphere: ['다정함', '차분함'],
  adviceStyle: '따뜻한 위로형',
  specialties: ['인간관계', '학교생활', '자존감'],
  methods: ['텍스트 상담', '장문 상담 가능'],
  responseSpeed: '보통',
  intro: '혼자 감당하지 않아도 괜찮아요. 천천히 들어드릴게요.',
  statusEmoji: '☁️',
  contactNote: '오늘 가능한 상담: 텍스트 중심',
  updatedAt: new Date().toISOString(),
})

const makeDefaultData = (): AppData => ({
  profile: makeDefaultProfile(),
  reviews: [],
  hasPassword: false,
})

const clampRating = (value: number) => Math.min(5, Math.max(1, Math.round(value)))

const splitList = (value: string) =>
  value
    .split(/[,/]/)
    .map((item) => item.trim())
    .filter(Boolean)

const joinList = (value: string[]) => value.join(', ')

const normalizeProfile = (profile: CounselorProfile): CounselorProfile => ({
  ...profile,
  nickname: profile.nickname.trim() || '상담사',
  avatarEmoji: profile.avatarEmoji.trim() || '💬',
  empathy: clampRating(profile.empathy),
  listening: clampRating(profile.listening),
  atmosphere: profile.atmosphere.length ? profile.atmosphere : ['편안함'],
  adviceStyle: profile.adviceStyle.trim() || '공감형',
  specialties: profile.specialties.length ? profile.specialties : ['마음 상담'],
  methods: profile.methods.length ? profile.methods : ['텍스트 상담'],
  responseSpeed: profile.responseSpeed.trim() || '보통',
  intro: profile.intro.trim() || '천천히 들어드릴게요.',
  statusEmoji: profile.statusEmoji.trim() || '☁️',
  contactNote: profile.contactNote.trim() || '상담 가능',
  updatedAt: new Date().toISOString(),
})

const makeReviewId = () =>
  globalThis.crypto?.randomUUID?.() ?? `review-${Date.now()}-${Math.random()}`

const stars = (value: number) =>
  ratingSteps.map((step) => (step <= clampRating(value) ? '★' : '☆')).join('')

const average = (reviews: Review[], key: ReviewMetric) => {
  if (!reviews.length) {
    return 0
  }

  const total = reviews.reduce((sum, review) => sum + review[key], 0)
  return total / reviews.length
}

const formatAverage = (value: number) => (value ? value.toFixed(1) : '대기')

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const hashPassword = async (password: string) => {
  const encoded = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', encoded)

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const readLocalData = (): LocalPayload | null => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LocalPayload) : null
  } catch {
    return null
  }
}

const writeLocalData = (data: AppData, passwordHash: string) => {
  const payload: LocalPayload = {
    ...data,
    hasPassword: Boolean(passwordHash),
    passwordHash,
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload))
}

const requestJson = async <T,>(path: string, init?: RequestInit): Promise<T | null> => {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  }
}

function RatingButtons({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="rating-control">
      <span>{label}</span>
      <div className="star-buttons" role="group" aria-label={label}>
        {ratingSteps.map((step) => (
          <button
            key={step}
            type="button"
            className={step <= value ? 'is-active' : ''}
            onClick={() => onChange(step)}
            aria-label={`${label} ${step}점`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  )
}

function ProfilePreview({
  profile,
  reviews,
}: {
  profile: CounselorProfile
  reviews: Review[]
}) {
  const overallAverage = average(reviews, 'overall')
  const comfortAverage = average(reviews, 'comfort')

  return (
    <article className="profile-card" aria-label="공개 상담사 프로필">
      <div className="profile-top">
        <div className="avatar" aria-hidden="true">
          {profile.avatarEmoji}
        </div>
        <div>
          <p className="eyebrow">상담사 프로필</p>
          <h2>{profile.nickname}</h2>
          <p className="tone-line">
            {profile.statusEmoji} {profile.atmosphere.join(' / ')}
          </p>
        </div>
      </div>

      <p className="intro">{profile.intro}</p>

      <dl className="metric-grid">
        <div>
          <dt>공감력</dt>
          <dd>{stars(profile.empathy)}</dd>
        </div>
        <div>
          <dt>경청력</dt>
          <dd>{stars(profile.listening)}</dd>
        </div>
        <div>
          <dt>조언 성향</dt>
          <dd>{profile.adviceStyle}</dd>
        </div>
        <div>
          <dt>응답 속도</dt>
          <dd>{profile.responseSpeed}</dd>
        </div>
      </dl>

      <div className="profile-section">
        <span>주요 상담 분야</span>
        <div className="chip-row">
          {profile.specialties.map((specialty) => (
            <span className="chip" key={specialty}>
              {specialty}
            </span>
          ))}
        </div>
      </div>

      <div className="profile-section">
        <span>상담 방식</span>
        <div className="chip-row">
          {profile.methods.map((method) => (
            <span className="chip alt" key={method}>
              {method}
            </span>
          ))}
        </div>
      </div>

      <div className="satisfaction-strip">
        <div>
          <strong>{formatAverage(overallAverage)}</strong>
          <span>평균 만족도</span>
        </div>
        <div>
          <strong>{formatAverage(comfortAverage)}</strong>
          <span>편안함</span>
        </div>
        <div>
          <strong>{reviews.length}</strong>
          <span>평가 수</span>
        </div>
      </div>

      <p className="contact-note">{profile.contactNote}</p>
    </article>
  )
}

function App() {
  const [data, setData] = useState<AppData>(() => makeDefaultData())
  const [draft, setDraft] = useState<CounselorProfile>(() => makeDefaultProfile())
  const [reviewDraft, setReviewDraft] = useState(emptyReview)
  const [isRemoteReady, setIsRemoteReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isUnlocked, setIsUnlocked] = useState(true)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [confirmedPassword, setConfirmedPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [localPasswordHash, setLocalPasswordHash] = useState('')
  const [status, setStatus] = useState('프로필을 준비하고 있어요.')

  const reviewSummary = useMemo(
    () => ({
      overall: average(data.reviews, 'overall'),
      empathy: average(data.reviews, 'empathy'),
      listening: average(data.reviews, 'listening'),
      comfort: average(data.reviews, 'comfort'),
    }),
    [data.reviews],
  )

  const recentReviews = useMemo(
    () =>
      [...data.reviews]
        .sort(
          (first, second) =>
            new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
        )
        .slice(0, 4),
    [data.reviews],
  )

  useEffect(() => {
    let isActive = true

    const hydrate = async () => {
      const remote = await requestJson<RemotePayload>('/api/profile')

      if (!isActive) {
        return
      }

      if (remote) {
        const nextData: AppData = {
          profile: remote.profile ?? makeDefaultProfile(),
          reviews: remote.reviews ?? [],
          hasPassword: remote.hasPassword,
        }

        setData(nextData)
        setDraft(nextData.profile)
        setIsUnlocked(!nextData.hasPassword)
        setIsRemoteReady(true)
        setStatus(nextData.hasPassword ? 'Vercel API와 연결됨' : '암호 설정 후 저장 가능')
        setIsLoading(false)
        return
      }

      const local = readLocalData()
      const fallback = local ?? { ...makeDefaultData(), passwordHash: '' }

      setData({
        profile: fallback.profile,
        reviews: fallback.reviews,
        hasPassword: Boolean(fallback.passwordHash),
      })
      setDraft(fallback.profile)
      setLocalPasswordHash(fallback.passwordHash)
      setIsUnlocked(!fallback.passwordHash)
      setIsRemoteReady(false)
      setStatus(fallback.passwordHash ? '로컬 저장소에서 불러옴' : '로컬 임시 저장 모드')
      setIsLoading(false)
    }

    hydrate()

    return () => {
      isActive = false
    }
  }, [])

  const updateDraft = <Key extends keyof CounselorProfile>(
    key: Key,
    value: CounselorProfile[Key],
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const handleListChange = (key: ListField, value: string) => {
    updateDraft(key, splitList(value))
  }

  const handleUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!data.hasPassword) {
      setIsUnlocked(true)
      setStatus('편집 가능')
      return
    }

    if (isRemoteReady) {
      const result = await requestJson<{ ok: boolean }>('/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          type: 'unlock',
          password: unlockPassword,
        }),
      })

      if (result?.ok) {
        setConfirmedPassword(unlockPassword)
        setUnlockPassword('')
        setIsUnlocked(true)
        setStatus('암호 확인 완료')
        return
      }
    } else if ((await hashPassword(unlockPassword)) === localPasswordHash) {
      setConfirmedPassword(unlockPassword)
      setUnlockPassword('')
      setIsUnlocked(true)
      setStatus('암호 확인 완료')
      return
    }

    setStatus('암호가 맞지 않아요.')
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (data.hasPassword && !isUnlocked) {
      setStatus('암호 확인이 필요해요.')
      return
    }

    const trimmedNewPassword = newPassword.trim()

    if (!data.hasPassword && trimmedNewPassword.length < 4) {
      setStatus('처음 저장할 때는 4자 이상 암호가 필요해요.')
      return
    }

    if (trimmedNewPassword && trimmedNewPassword.length < 4) {
      setStatus('새 암호는 4자 이상으로 설정해주세요.')
      return
    }

    const profile = normalizeProfile(draft)

    if (isRemoteReady) {
      const remote = await requestJson<RemotePayload>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          profile,
          password: confirmedPassword,
          newPassword: trimmedNewPassword,
        }),
      })

      if (remote) {
        const nextData: AppData = {
          profile: remote.profile ?? profile,
          reviews: remote.reviews,
          hasPassword: remote.hasPassword,
        }

        setData(nextData)
        setDraft(nextData.profile)
        setConfirmedPassword(trimmedNewPassword || confirmedPassword)
        setNewPassword('')
        setStatus('Firebase에 저장됨')
        return
      }
    }

    const nextPasswordHash = trimmedNewPassword
      ? await hashPassword(trimmedNewPassword)
      : localPasswordHash || (confirmedPassword ? await hashPassword(confirmedPassword) : '')

    const nextData: AppData = {
      profile,
      reviews: data.reviews,
      hasPassword: Boolean(nextPasswordHash),
    }

    writeLocalData(nextData, nextPasswordHash)
    setData(nextData)
    setDraft(profile)
    setLocalPasswordHash(nextPasswordHash)
    setConfirmedPassword(trimmedNewPassword || confirmedPassword)
    setNewPassword('')
    setIsRemoteReady(false)
    setStatus('로컬에 저장됨')
  }

  const handleReviewSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const review: Review = {
      ...reviewDraft,
      id: makeReviewId(),
      comment: reviewDraft.comment.trim(),
      createdAt: new Date().toISOString(),
    }

    if (isRemoteReady) {
      const remote = await requestJson<RemotePayload>('/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          type: 'review',
          review,
        }),
      })

      if (remote) {
        const nextData: AppData = {
          profile: remote.profile ?? data.profile,
          reviews: remote.reviews,
          hasPassword: remote.hasPassword,
        }

        setData(nextData)
        setDraft(nextData.profile)
        setReviewDraft(emptyReview)
        setStatus('평가가 저장됨')
        return
      }
    }

    const nextData = {
      ...data,
      reviews: [review, ...data.reviews],
    }

    writeLocalData(nextData, localPasswordHash)
    setData(nextData)
    setReviewDraft(emptyReview)
    setIsRemoteReady(false)
    setStatus('평가가 로컬에 저장됨')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">상담사 프로필</p>
          <h1>프로필 작성과 만족도 평가</h1>
        </div>
        <div className="status-group" aria-live="polite">
          <span className={isRemoteReady ? 'sync-pill remote' : 'sync-pill local'}>
            {isRemoteReady ? 'Vercel API' : 'Local'}
          </span>
          <span className="status-text">{isLoading ? '불러오는 중' : status}</span>
        </div>
      </header>

      <div className="workspace">
        <section className="panel editor-panel" aria-label="상담사 입력 영역">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">직접 입력</p>
              <h2>프로필 편집</h2>
            </div>
            <span className={isUnlocked ? 'lock-state open' : 'lock-state'}>
              {isUnlocked ? '편집 가능' : '잠김'}
            </span>
          </div>

          {data.hasPassword && !isUnlocked ? (
            <form className="stack-form" onSubmit={handleUnlock}>
              <label>
                암호
                <input
                  type="password"
                  value={unlockPassword}
                  onChange={(event) => setUnlockPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <button className="primary-button" type="submit">
                잠금 해제
              </button>
            </form>
          ) : (
            <form className="profile-form" onSubmit={handleSave}>
              <label>
                닉네임
                <input
                  value={draft.nickname}
                  onChange={(event) => updateDraft('nickname', event.target.value)}
                />
              </label>

              <div className="emoji-picker" role="group" aria-label="프로필 이모티콘">
                {emojiOptions.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={draft.avatarEmoji === emoji ? 'is-selected' : ''}
                    onClick={() => updateDraft('avatarEmoji', emoji)}
                    aria-label={`${emoji} 선택`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="two-column">
                <RatingButtons
                  label="공감력"
                  value={draft.empathy}
                  onChange={(value) => updateDraft('empathy', value)}
                />
                <RatingButtons
                  label="경청력"
                  value={draft.listening}
                  onChange={(value) => updateDraft('listening', value)}
                />
              </div>

              <label>
                상담 분위기
                <input
                  value={joinList(draft.atmosphere)}
                  onChange={(event) => handleListChange('atmosphere', event.target.value)}
                />
              </label>

              <label>
                조언 성향
                <input
                  value={draft.adviceStyle}
                  onChange={(event) => updateDraft('adviceStyle', event.target.value)}
                />
              </label>

              <label>
                주요 상담 분야
                <input
                  value={joinList(draft.specialties)}
                  onChange={(event) => handleListChange('specialties', event.target.value)}
                />
              </label>

              <label>
                상담 방식
                <input
                  value={joinList(draft.methods)}
                  onChange={(event) => handleListChange('methods', event.target.value)}
                />
              </label>

              <div className="two-column">
                <label>
                  응답 속도
                  <select
                    value={draft.responseSpeed}
                    onChange={(event) => updateDraft('responseSpeed', event.target.value)}
                  >
                    <option>빠름</option>
                    <option>보통</option>
                    <option>느림</option>
                    <option>상황에 따라 다름</option>
                  </select>
                </label>
                <label>
                  상태 이모티콘
                  <input
                    value={draft.statusEmoji}
                    onChange={(event) => updateDraft('statusEmoji', event.target.value)}
                    maxLength={6}
                  />
                </label>
              </div>

              <label>
                한마디
                <textarea
                  rows={4}
                  value={draft.intro}
                  onChange={(event) => updateDraft('intro', event.target.value)}
                />
              </label>

              <label>
                공개 안내
                <input
                  value={draft.contactNote}
                  onChange={(event) => updateDraft('contactNote', event.target.value)}
                />
              </label>

              <label>
                {data.hasPassword ? '새 암호' : '암호 설정'}
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </label>

              <button className="primary-button" type="submit">
                프로필 저장
              </button>
            </form>
          )}
        </section>

        <section className="preview-column" aria-label="공개 프로필과 평가 영역">
          <ProfilePreview profile={draft} reviews={data.reviews} />

          <section className="panel review-panel" aria-label="사용자 만족도 평가">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">만족도 조사</p>
                <h2>사용자 평가</h2>
              </div>
              <strong>{formatAverage(reviewSummary.overall)}</strong>
            </div>

            <form className="review-form" onSubmit={handleReviewSubmit}>
              <div className="emoji-picker compact" role="group" aria-label="평가 이모티콘">
                {reviewEmojiOptions.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={reviewDraft.emoji === emoji ? 'is-selected' : ''}
                    onClick={() => setReviewDraft((current) => ({ ...current, emoji }))}
                    aria-label={`${emoji} 선택`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="review-metrics">
                <RatingButtons
                  label="전체 만족도"
                  value={reviewDraft.overall}
                  onChange={(value) =>
                    setReviewDraft((current) => ({ ...current, overall: value }))
                  }
                />
                <RatingButtons
                  label="공감"
                  value={reviewDraft.empathy}
                  onChange={(value) =>
                    setReviewDraft((current) => ({ ...current, empathy: value }))
                  }
                />
                <RatingButtons
                  label="경청"
                  value={reviewDraft.listening}
                  onChange={(value) =>
                    setReviewDraft((current) => ({ ...current, listening: value }))
                  }
                />
                <RatingButtons
                  label="편안함"
                  value={reviewDraft.comfort}
                  onChange={(value) =>
                    setReviewDraft((current) => ({ ...current, comfort: value }))
                  }
                />
              </div>

              <label>
                후기
                <textarea
                  rows={3}
                  value={reviewDraft.comment}
                  onChange={(event) =>
                    setReviewDraft((current) => ({
                      ...current,
                      comment: event.target.value,
                    }))
                  }
                />
              </label>

              <button className="secondary-button" type="submit">
                평가 남기기
              </button>
            </form>
          </section>

          <section className="panel stats-panel" aria-label="최근 평가">
            <div className="score-grid">
              <div>
                <span>공감</span>
                <strong>{formatAverage(reviewSummary.empathy)}</strong>
              </div>
              <div>
                <span>경청</span>
                <strong>{formatAverage(reviewSummary.listening)}</strong>
              </div>
              <div>
                <span>편안함</span>
                <strong>{formatAverage(reviewSummary.comfort)}</strong>
              </div>
            </div>

            <div className="review-list">
              {recentReviews.length ? (
                recentReviews.map((review) => (
                  <article key={review.id} className="review-item">
                    <div>
                      <strong>{review.emoji}</strong>
                      <span>{stars(review.overall)}</span>
                    </div>
                    <p>{review.comment || '말없이 남긴 평가'}</p>
                    <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
                  </article>
                ))
              ) : (
                <p className="empty-state">아직 등록된 평가가 없어요.</p>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}

export default App
