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
  counselors: Counselor[]
  activeCounselorId: string
}

type Counselor = {
  id: string
  profile: CounselorProfile
  reviews: Review[]
  hasPassword: boolean
}

type LocalCounselor = Counselor & {
  passwordHash: string
}

type LocalPayload = {
  counselors: LocalCounselor[]
  activeCounselorId: string
}

type LegacyLocalPayload = {
  profile: CounselorProfile
  reviews: Review[]
  hasPassword: boolean
  passwordHash: string
}

type RemotePayload = {
  counselors?: Counselor[]
  activeCounselorId?: string
  profile?: CounselorProfile | null
  reviews?: Review[]
  hasPassword?: boolean
}

type ListField = 'atmosphere' | 'specialties' | 'methods'
type ListTextMap = Record<ListField, string>
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

const makeCounselorId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `counselor-${Date.now()}-${Math.random()}`

const makeCounselor = (
  profile: CounselorProfile = makeDefaultProfile(),
  reviews: Review[] = [],
  hasPassword = false,
  id = makeCounselorId(),
): Counselor => ({
  id,
  profile,
  reviews,
  hasPassword,
})

const makeDefaultData = (): AppData => {
  const counselor = makeCounselor()

  return {
    counselors: [counselor],
    activeCounselorId: counselor.id,
  }
}

const clampRating = (value: number) => Math.min(5, Math.max(1, Math.round(value)))

const splitList = (value: string) =>
  value
    .split(/[,/]/)
    .map((item) => item.trim())
    .filter(Boolean)

const joinList = (value: string[]) => value.join(', ')

const profileToListTexts = (profile: CounselorProfile): ListTextMap => ({
  atmosphere: joinList(profile.atmosphere),
  specialties: joinList(profile.specialties),
  methods: joinList(profile.methods),
})

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

const readLocalData = (): LegacyLocalPayload | LocalPayload | null => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LegacyLocalPayload | LocalPayload) : null
  } catch {
    return null
  }
}

const isLocalPayload = (
  value: LegacyLocalPayload | LocalPayload,
): value is LocalPayload => 'counselors' in value

const makeDataFromRemote = (
  remote: RemotePayload,
  preferredCounselorId?: string,
): AppData => {
  if (remote.counselors?.length) {
    const activeCounselorId =
      preferredCounselorId && remote.counselors.some((counselor) => counselor.id === preferredCounselorId)
        ? preferredCounselorId
        : remote.activeCounselorId && remote.counselors.some((counselor) => counselor.id === remote.activeCounselorId)
          ? remote.activeCounselorId
          : remote.counselors[0].id

    return {
      counselors: remote.counselors,
      activeCounselorId,
    }
  }

  const counselor = makeCounselor(
    remote.profile ?? makeDefaultProfile(),
    remote.reviews ?? [],
    Boolean(remote.hasPassword),
    'main',
  )

  return {
    counselors: [counselor],
    activeCounselorId: counselor.id,
  }
}

const makeDataFromLocal = (
  local: LegacyLocalPayload | LocalPayload | null,
): {
  data: AppData
  passwordHashes: Record<string, string>
} => {
  if (!local) {
    return {
      data: makeDefaultData(),
      passwordHashes: {},
    }
  }

  if (isLocalPayload(local)) {
    const counselors = local.counselors.map(({ passwordHash, ...counselor }) => ({
      ...counselor,
      hasPassword: Boolean(passwordHash),
    }))
    const fallbackData = makeDefaultData()
    const activeCounselorId =
      local.activeCounselorId && counselors.some((counselor) => counselor.id === local.activeCounselorId)
        ? local.activeCounselorId
        : counselors[0]?.id

    return {
      data: counselors.length
        ? {
            counselors,
            activeCounselorId,
          }
        : fallbackData,
      passwordHashes: Object.fromEntries(
        local.counselors.map((counselor) => [counselor.id, counselor.passwordHash]),
      ),
    }
  }

  const counselor = makeCounselor(
    local.profile,
    local.reviews,
    Boolean(local.passwordHash),
    'main',
  )

  return {
    data: {
      counselors: [counselor],
      activeCounselorId: counselor.id,
    },
    passwordHashes: {
      [counselor.id]: local.passwordHash,
    },
  }
}

const writeLocalData = (data: AppData, passwordHashes: Record<string, string>) => {
  const payload: LocalPayload = {
    activeCounselorId: data.activeCounselorId,
    counselors: data.counselors.map((counselor) => ({
      ...counselor,
      hasPassword: Boolean(passwordHashes[counselor.id]),
      passwordHash: passwordHashes[counselor.id] ?? '',
    })),
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
  const [listTexts, setListTexts] = useState<ListTextMap>(() =>
    profileToListTexts(makeDefaultProfile()),
  )
  const [reviewDraft, setReviewDraft] = useState(emptyReview)
  const [isRemoteReady, setIsRemoteReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [confirmedPasswords, setConfirmedPasswords] = useState<Record<string, string>>({})
  const [newPassword, setNewPassword] = useState('')
  const [localPasswordHashes, setLocalPasswordHashes] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('프로필을 준비하고 있어요.')

  const activeCounselor =
    data.counselors.find((counselor) => counselor.id === data.activeCounselorId) ??
    data.counselors[0]
  const activeCounselorId = activeCounselor?.id ?? ''
  const activeReviews = useMemo(() => activeCounselor?.reviews ?? [], [activeCounselor])
  const isUnlocked =
    !activeCounselor?.hasPassword || Boolean(confirmedPasswords[activeCounselorId])

  const reviewSummary = useMemo(
    () => ({
      overall: average(activeReviews, 'overall'),
      empathy: average(activeReviews, 'empathy'),
      listening: average(activeReviews, 'listening'),
      comfort: average(activeReviews, 'comfort'),
    }),
    [activeReviews],
  )

  const recentReviews = useMemo(
    () =>
      [...activeReviews]
        .sort(
          (first, second) =>
            new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
        )
        .slice(0, 4),
    [activeReviews],
  )

  useEffect(() => {
    let isActive = true

    const hydrate = async () => {
      const remote = await requestJson<RemotePayload>('/api/profile')

      if (!isActive) {
        return
      }

      if (remote) {
        const nextData = makeDataFromRemote(remote)
        const nextCounselor =
          nextData.counselors.find((counselor) => counselor.id === nextData.activeCounselorId) ??
          nextData.counselors[0]

        setData(nextData)
        setDraft(nextCounselor.profile)
        setListTexts(profileToListTexts(nextCounselor.profile))
        setIsRemoteReady(true)
        setStatus(nextCounselor.hasPassword ? 'Vercel API와 연결됨' : '암호 설정 후 저장 가능')
        setIsLoading(false)
        return
      }

      const { data: nextData, passwordHashes } = makeDataFromLocal(readLocalData())
      const nextCounselor =
        nextData.counselors.find((counselor) => counselor.id === nextData.activeCounselorId) ??
        nextData.counselors[0]

      setData(nextData)
      setDraft(nextCounselor.profile)
      setListTexts(profileToListTexts(nextCounselor.profile))
      setLocalPasswordHashes(passwordHashes)
      setIsRemoteReady(false)
      setStatus(nextCounselor.hasPassword ? '로컬 저장소에서 불러옴' : '로컬 임시 저장 모드')
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
    setListTexts((current) => ({
      ...current,
      [key]: value,
    }))
    updateDraft(key, splitList(value))
  }

  const dataWithCurrentDraft = (): AppData => ({
    ...data,
    counselors: data.counselors.map((counselor) =>
      counselor.id === activeCounselorId
        ? {
            ...counselor,
            profile: draft,
          }
        : counselor,
    ),
  })

  const selectCounselor = (counselorId: string) => {
    const nextData = {
      ...dataWithCurrentDraft(),
      activeCounselorId: counselorId,
    }
    const nextCounselor =
      nextData.counselors.find((counselor) => counselor.id === counselorId) ??
      nextData.counselors[0]

    setData(nextData)
    setDraft(nextCounselor.profile)
    setListTexts(profileToListTexts(nextCounselor.profile))
    setUnlockPassword('')
    setNewPassword('')
    setReviewDraft(emptyReview)
    setStatus(nextCounselor.hasPassword ? '암호 확인이 필요해요.' : '편집 가능')
  }

  const addCounselor = () => {
    const nextProfile = {
      ...makeDefaultProfile(),
      nickname: `상담사 ${data.counselors.length + 1}`,
      avatarEmoji: '💬',
      statusEmoji: '✨',
      updatedAt: new Date().toISOString(),
    }
    const nextCounselor = makeCounselor(nextProfile)
    const nextData = {
      ...dataWithCurrentDraft(),
      counselors: [...dataWithCurrentDraft().counselors, nextCounselor],
      activeCounselorId: nextCounselor.id,
    }

    setData(nextData)
    setDraft(nextCounselor.profile)
    setListTexts(profileToListTexts(nextCounselor.profile))
    setUnlockPassword('')
    setNewPassword('')
    setReviewDraft(emptyReview)
    setStatus('새 상담사를 추가했어요. 암호를 설정하고 저장해주세요.')
  }

  const handleUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!activeCounselor?.hasPassword) {
      setStatus('편집 가능')
      return
    }

    if (isRemoteReady) {
      const result = await requestJson<{ ok: boolean }>('/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          type: 'unlock',
          counselorId: activeCounselorId,
          password: unlockPassword,
        }),
      })

      if (result?.ok) {
        setConfirmedPasswords((current) => ({
          ...current,
          [activeCounselorId]: unlockPassword,
        }))
        setUnlockPassword('')
        setStatus('암호 확인 완료')
        return
      }
    } else if ((await hashPassword(unlockPassword)) === localPasswordHashes[activeCounselorId]) {
      setConfirmedPasswords((current) => ({
        ...current,
        [activeCounselorId]: unlockPassword,
      }))
      setUnlockPassword('')
      setStatus('암호 확인 완료')
      return
    }

    setStatus('암호가 맞지 않아요.')
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (activeCounselor?.hasPassword && !isUnlocked) {
      setStatus('암호 확인이 필요해요.')
      return
    }

    const trimmedNewPassword = newPassword.trim()

    if (!activeCounselor?.hasPassword && !trimmedNewPassword) {
      setStatus('처음 저장할 때는 암호가 필요해요.')
      return
    }

    const profile = normalizeProfile(draft)

    if (isRemoteReady) {
      const remote = await requestJson<RemotePayload>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          counselorId: activeCounselorId,
          profile,
          password: confirmedPasswords[activeCounselorId] ?? '',
          newPassword: trimmedNewPassword,
        }),
      })

      if (remote) {
        const nextData = makeDataFromRemote(remote, activeCounselorId)
        const nextCounselor =
          nextData.counselors.find((counselor) => counselor.id === nextData.activeCounselorId) ??
          nextData.counselors[0]

        setData(nextData)
        setDraft(nextCounselor.profile)
        setListTexts(profileToListTexts(nextCounselor.profile))
        setConfirmedPasswords((current) => ({
          ...current,
          [activeCounselorId]: trimmedNewPassword || current[activeCounselorId] || '',
        }))
        setNewPassword('')
        setStatus('Firebase에 저장됨')
        return
      }
    }

    const nextPasswordHash = trimmedNewPassword
      ? await hashPassword(trimmedNewPassword)
      : localPasswordHashes[activeCounselorId] ||
        (confirmedPasswords[activeCounselorId]
          ? await hashPassword(confirmedPasswords[activeCounselorId])
          : '')

    const nextData: AppData = {
      ...data,
      counselors: data.counselors.map((counselor) =>
        counselor.id === activeCounselorId
          ? {
              ...counselor,
              profile,
              hasPassword: Boolean(nextPasswordHash),
            }
          : counselor,
      ),
      activeCounselorId,
    }
    const nextPasswordHashes = {
      ...localPasswordHashes,
      [activeCounselorId]: nextPasswordHash,
    }

    writeLocalData(nextData, nextPasswordHashes)
    setData(nextData)
    setDraft(profile)
    setListTexts(profileToListTexts(profile))
    setLocalPasswordHashes(nextPasswordHashes)
    setConfirmedPasswords((current) => ({
      ...current,
      [activeCounselorId]: trimmedNewPassword || current[activeCounselorId] || '',
    }))
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
          counselorId: activeCounselorId,
          review,
        }),
      })

      if (remote) {
        const nextData = makeDataFromRemote(remote, activeCounselorId)
        const nextCounselor =
          nextData.counselors.find((counselor) => counselor.id === nextData.activeCounselorId) ??
          nextData.counselors[0]

        setData(nextData)
        setDraft(nextCounselor.profile)
        setListTexts(profileToListTexts(nextCounselor.profile))
        setReviewDraft(emptyReview)
        setStatus('평가가 저장됨')
        return
      }
    }

    const nextData = {
      ...data,
      counselors: data.counselors.map((counselor) =>
        counselor.id === activeCounselorId
          ? {
              ...counselor,
              reviews: [review, ...counselor.reviews],
            }
          : counselor,
      ),
    }

    writeLocalData(nextData, localPasswordHashes)
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
              <h2>{draft.nickname} 편집</h2>
            </div>
            <span className={isUnlocked ? 'lock-state open' : 'lock-state'}>
              {isUnlocked ? '편집 가능' : '잠김'}
            </span>
          </div>

          <div className="counselor-manager">
            <button className="add-counselor-button" type="button" onClick={addCounselor}>
              + 새 상담사 추가
            </button>
            <div className="counselor-tabs" role="tablist" aria-label="상담사 선택">
              {data.counselors.map((counselor) => (
                <button
                  key={counselor.id}
                  type="button"
                  role="tab"
                  aria-selected={counselor.id === activeCounselorId}
                  className={counselor.id === activeCounselorId ? 'is-active' : ''}
                  onClick={() => selectCounselor(counselor.id)}
                >
                  <strong>
                    <span aria-hidden="true">{counselor.profile.avatarEmoji}</span>
                    {counselor.profile.nickname}
                  </strong>
                  <span>
                    {counselor.reviews.length}개 평가 ·{' '}
                    {counselor.hasPassword ? '암호 설정됨' : '저장 전'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {activeCounselor?.hasPassword && !isUnlocked ? (
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
                  value={listTexts.atmosphere}
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
                  value={listTexts.specialties}
                  onChange={(event) => handleListChange('specialties', event.target.value)}
                />
              </label>

              <label>
                상담 방식
                <input
                  value={listTexts.methods}
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
                {activeCounselor?.hasPassword ? '새 암호' : '암호 설정'}
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
          <ProfilePreview profile={draft} reviews={activeReviews} />

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
