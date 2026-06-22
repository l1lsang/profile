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

type Counselor = {
  id: string
  profile: CounselorProfile
  reviews: Review[]
  hasPassword: boolean
  isActive: boolean
}

type AppData = {
  counselors: Counselor[]
  activeCounselorId: string
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
type CounselorFilter = 'all' | 'active' | 'inactive'
type IconName =
  | 'people'
  | 'star'
  | 'message'
  | 'search'
  | 'plus'
  | 'chevron'
  | 'lock'
  | 'cloud'
  | 'settings'
  | 'logout'
  | 'check'
  | 'trash'
  | 'close'

const LOCAL_STORAGE_KEY = 'counselor-profile-data-v1'
const emojiOptions = ['🌤️', '🌿', '🫶', '☕', '💬', '✨']
const ratingSteps = [1, 2, 3, 4, 5]
const counselorFilters: { value: CounselorFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '활동 중' },
  { value: 'inactive', label: '비활성' },
]

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
  isActive = true,
): Counselor => ({
  id,
  profile,
  reviews,
  hasPassword,
  isActive,
})

const makeDefaultData = (): AppData => {
  const counselor = makeCounselor()
  return { counselors: [counselor], activeCounselorId: counselor.id }
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

const average = (reviews: Review[], key: keyof Pick<Review, 'overall' | 'empathy' | 'listening' | 'comfort'>) => {
  if (!reviews.length) return 0
  return reviews.reduce((sum, review) => sum + review[key], 0) / reviews.length
}

const formatAverage = (value: number) => (value ? value.toFixed(1) : '—')

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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

const normalizeCounselors = (counselors: Counselor[]) =>
  counselors.map((counselor) => ({
    ...counselor,
    isActive: counselor.isActive !== false,
  }))

const makeDataFromRemote = (
  remote: RemotePayload,
  preferredCounselorId?: string,
): AppData => {
  if (remote.counselors?.length) {
    const counselors = normalizeCounselors(remote.counselors)
    const activeCounselorId =
      preferredCounselorId && counselors.some((item) => item.id === preferredCounselorId)
        ? preferredCounselorId
        : remote.activeCounselorId && counselors.some((item) => item.id === remote.activeCounselorId)
          ? remote.activeCounselorId
          : counselors[0].id

    return { counselors, activeCounselorId }
  }

  const counselor = makeCounselor(
    remote.profile ?? makeDefaultProfile(),
    remote.reviews ?? [],
    Boolean(remote.hasPassword),
    'main',
  )
  return { counselors: [counselor], activeCounselorId: counselor.id }
}

const makeDataFromLocal = (
  local: LegacyLocalPayload | LocalPayload | null,
): { data: AppData; passwordHashes: Record<string, string> } => {
  if (!local) return { data: makeDefaultData(), passwordHashes: {} }

  if (isLocalPayload(local)) {
    const counselors = local.counselors.map(({ passwordHash, ...counselor }) => ({
      ...counselor,
      hasPassword: Boolean(passwordHash),
      isActive: counselor.isActive !== false,
    }))
    const fallbackData = makeDefaultData()
    const activeCounselorId =
      local.activeCounselorId && counselors.some((item) => item.id === local.activeCounselorId)
        ? local.activeCounselorId
        : counselors[0]?.id

    return {
      data: counselors.length ? { counselors, activeCounselorId } : fallbackData,
      passwordHashes: Object.fromEntries(
        local.counselors.map((counselor) => [counselor.id, counselor.passwordHash]),
      ),
    }
  }

  const counselor = makeCounselor(local.profile, local.reviews, Boolean(local.passwordHash), 'main')
  return {
    data: { counselors: [counselor], activeCounselorId: counselor.id },
    passwordHashes: { [counselor.id]: local.passwordHash },
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
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    cloud: <><path d="M20 17.5A4.5 4.5 0 0 0 18 9a6 6 0 0 0-11.5 2A3.5 3.5 0 0 0 7 18h11"/><path d="m9 14 2 2 4-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63h.02A1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9v.02A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  }

  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
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

function SummaryCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: IconName
  label: string
  value: string | number
  note: string
  tone: 'green' | 'blue' | 'amber' | 'violet'
}) {
  return (
    <article className="summary-card">
      <span className={`summary-icon ${tone}`}><Icon name={icon} size={20} /></span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  )
}

function App() {
  const [data, setData] = useState<AppData>(() => makeDefaultData())
  const [draft, setDraft] = useState<CounselorProfile>(() => makeDefaultProfile())
  const [draftIsActive, setDraftIsActive] = useState(true)
  const [listTexts, setListTexts] = useState<ListTextMap>(() => profileToListTexts(makeDefaultProfile()))
  const [isRemoteReady, setIsRemoteReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [confirmedPasswords, setConfirmedPasswords] = useState<Record<string, string>>({})
  const [newPassword, setNewPassword] = useState('')
  const [localPasswordHashes, setLocalPasswordHashes] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('상담사 정보를 불러오고 있어요.')
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<CounselorFilter>('all')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [unsavedCounselorIds, setUnsavedCounselorIds] = useState<Set<string>>(() => new Set())

  const activeCounselor =
    data.counselors.find((counselor) => counselor.id === data.activeCounselorId) ?? data.counselors[0]
  const activeCounselorId = activeCounselor?.id ?? ''
  const isUnlocked = !activeCounselor?.hasPassword || Boolean(confirmedPasswords[activeCounselorId])

  const filteredCounselors = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('ko-KR')
    return data.counselors.filter((counselor) => {
      const matchesFilter =
        filter === 'all' || (filter === 'active' ? counselor.isActive : !counselor.isActive)
      const searchable = [
        counselor.profile.nickname,
        counselor.profile.adviceStyle,
        ...counselor.profile.specialties,
        ...counselor.profile.methods,
      ].join(' ').toLocaleLowerCase('ko-KR')
      return matchesFilter && (!query || searchable.includes(query))
    })
  }, [data.counselors, filter, searchTerm])

  const dashboardSummary = useMemo(() => {
    const allReviews = data.counselors.flatMap((counselor) => counselor.reviews)
    return {
      active: data.counselors.filter((counselor) => counselor.isActive).length,
      reviews: allReviews.length,
      rating: average(allReviews, 'overall'),
    }
  }, [data.counselors])

  useEffect(() => {
    let isActive = true

    const hydrate = async () => {
      const remote = await requestJson<RemotePayload>('/api/profile')
      if (!isActive) return

      if (remote) {
        const nextData = makeDataFromRemote(remote)
        const nextCounselor = nextData.counselors.find((item) => item.id === nextData.activeCounselorId) ?? nextData.counselors[0]
        setData(nextData)
        setDraft(nextCounselor.profile)
        setDraftIsActive(nextCounselor.isActive)
        setListTexts(profileToListTexts(nextCounselor.profile))
        setIsRemoteReady(true)
        setStatus('모든 변경사항이 안전하게 동기화됐어요.')
        setIsLoading(false)
        return
      }

      const { data: nextData, passwordHashes } = makeDataFromLocal(readLocalData())
      const nextCounselor = nextData.counselors.find((item) => item.id === nextData.activeCounselorId) ?? nextData.counselors[0]
      setData(nextData)
      setDraft(nextCounselor.profile)
      setDraftIsActive(nextCounselor.isActive)
      setListTexts(profileToListTexts(nextCounselor.profile))
      setLocalPasswordHashes(passwordHashes)
      setStatus('로컬 저장 모드로 실행 중이에요.')
      setIsLoading(false)
    }

    hydrate()
    return () => { isActive = false }
  }, [])

  const updateDraft = <Key extends keyof CounselorProfile>(key: Key, value: CounselorProfile[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const handleListChange = (key: ListField, value: string) => {
    setListTexts((current) => ({ ...current, [key]: value }))
    updateDraft(key, splitList(value))
  }

  const dataWithCurrentDraft = (): AppData => ({
    ...data,
    counselors: data.counselors.map((counselor) =>
      counselor.id === activeCounselorId
        ? { ...counselor, profile: draft, isActive: draftIsActive }
        : counselor,
    ),
  })

  const loadCounselorIntoEditor = (counselor: Counselor) => {
    setDraft(counselor.profile)
    setDraftIsActive(counselor.isActive)
    setListTexts(profileToListTexts(counselor.profile))
    setUnlockPassword('')
    setNewPassword('')
  }

  const selectCounselor = (counselorId: string) => {
    const nextData = { ...dataWithCurrentDraft(), activeCounselorId: counselorId }
    const nextCounselor = nextData.counselors.find((item) => item.id === counselorId) ?? nextData.counselors[0]
    setData(nextData)
    loadCounselorIntoEditor(nextCounselor)
    setIsEditorOpen(true)
    setStatus(nextCounselor.hasPassword ? `${nextCounselor.profile.nickname} 상담사를 선택했어요.` : '새 상담사 정보를 입력해주세요.')
  }

  const addCounselor = () => {
    const nextProfile = {
      ...makeDefaultProfile(),
      nickname: `새 상담사 ${data.counselors.length + 1}`,
      avatarEmoji: '💬',
      statusEmoji: '✨',
    }
    const nextCounselor = makeCounselor(nextProfile)
    const currentData = dataWithCurrentDraft()
    const nextData = {
      ...currentData,
      counselors: [...currentData.counselors, nextCounselor],
      activeCounselorId: nextCounselor.id,
    }
    setData(nextData)
    setUnsavedCounselorIds((current) => new Set(current).add(nextCounselor.id))
    loadCounselorIntoEditor(nextCounselor)
    setIsEditorOpen(true)
    setStatus('새 상담사를 만들었어요. 정보를 입력하고 저장해주세요.')
  }

  const handleUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeCounselor?.hasPassword) return

    if (isRemoteReady) {
      const result = await requestJson<{ ok: boolean }>('/api/profile', {
        method: 'POST',
        body: JSON.stringify({ type: 'unlock', counselorId: activeCounselorId, password: unlockPassword }),
      })
      if (result?.ok) {
        setConfirmedPasswords((current) => ({ ...current, [activeCounselorId]: unlockPassword }))
        setUnlockPassword('')
        setStatus('잠금이 해제됐어요. 이제 정보를 수정할 수 있어요.')
        return
      }
    } else if ((await hashPassword(unlockPassword)) === localPasswordHashes[activeCounselorId]) {
      setConfirmedPasswords((current) => ({ ...current, [activeCounselorId]: unlockPassword }))
      setUnlockPassword('')
      setStatus('잠금이 해제됐어요. 이제 정보를 수정할 수 있어요.')
      return
    }
    setStatus('암호가 맞지 않아요. 다시 확인해주세요.')
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (activeCounselor?.hasPassword && !isUnlocked) {
      setStatus('먼저 상담사 암호로 잠금을 해제해주세요.')
      return
    }

    const trimmedNewPassword = newPassword.trim()
    if (!activeCounselor?.hasPassword && !trimmedNewPassword) {
      setStatus('처음 저장할 때는 편집용 암호를 설정해주세요.')
      return
    }

    const profile = normalizeProfile(draft)
    if (isRemoteReady) {
      const remote = await requestJson<RemotePayload>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          counselorId: activeCounselorId,
          profile,
          isActive: draftIsActive,
          password: confirmedPasswords[activeCounselorId] ?? '',
          newPassword: trimmedNewPassword,
        }),
      })
      if (remote) {
        const nextData = makeDataFromRemote(remote, activeCounselorId)
        const nextCounselor = nextData.counselors.find((item) => item.id === activeCounselorId) ?? nextData.counselors[0]
        setData(nextData)
        setUnsavedCounselorIds((current) => {
          const next = new Set(current)
          next.delete(activeCounselorId)
          return next
        })
        loadCounselorIntoEditor(nextCounselor)
        setConfirmedPasswords((current) => ({
          ...current,
          [activeCounselorId]: trimmedNewPassword || current[activeCounselorId] || '',
        }))
        setStatus('상담사 정보가 저장됐어요.')
        return
      }
      setStatus('서버 저장에 실패했어요. 잠시 후 다시 시도해주세요.')
      return
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
          ? { ...counselor, profile, isActive: draftIsActive, hasPassword: Boolean(nextPasswordHash) }
          : counselor,
      ),
    }
    const nextPasswordHashes = { ...localPasswordHashes, [activeCounselorId]: nextPasswordHash }
    writeLocalData(nextData, nextPasswordHashes)
    setData(nextData)
    setUnsavedCounselorIds((current) => {
      const next = new Set(current)
      next.delete(activeCounselorId)
      return next
    })
    setDraft(profile)
    setLocalPasswordHashes(nextPasswordHashes)
    setConfirmedPasswords((current) => ({
      ...current,
      [activeCounselorId]: trimmedNewPassword || current[activeCounselorId] || '',
    }))
    setNewPassword('')
    setStatus('상담사 정보가 로컬에 저장됐어요.')
  }

  const handleDelete = async () => {
    if (!activeCounselor) return
    if (data.counselors.length === 1) {
      setStatus('최소 한 명의 상담사는 남아 있어야 해요.')
      return
    }
    if (!window.confirm(`${activeCounselor.profile.nickname} 상담사를 목록에서 삭제할까요?\n이 상담사의 후기 데이터도 함께 삭제됩니다.`)) return

    if (unsavedCounselorIds.has(activeCounselorId)) {
      const nextCounselors = data.counselors.filter((item) => item.id !== activeCounselorId)
      const nextData = { counselors: nextCounselors, activeCounselorId: nextCounselors[0].id }
      setData(nextData)
      setUnsavedCounselorIds((current) => {
        const next = new Set(current)
        next.delete(activeCounselorId)
        return next
      })
      loadCounselorIntoEditor(nextCounselors[0])
      setIsEditorOpen(false)
      setStatus('저장 전 상담사를 목록에서 제거했어요.')
      return
    }

    if (isRemoteReady) {
      const remote = await requestJson<RemotePayload>('/api/profile', {
        method: 'DELETE',
        body: JSON.stringify({
          counselorId: activeCounselorId,
          password: confirmedPasswords[activeCounselorId] ?? '',
        }),
      })
      if (!remote) {
        setStatus('삭제에 실패했어요. 잠금을 해제한 뒤 다시 시도해주세요.')
        return
      }
      const nextData = makeDataFromRemote(remote)
      const nextCounselor = nextData.counselors[0]
      setData(nextData)
      loadCounselorIntoEditor(nextCounselor)
      setIsEditorOpen(false)
      setStatus('상담사를 삭제했어요.')
      return
    }

    const nextCounselors = data.counselors.filter((item) => item.id !== activeCounselorId)
    const nextData = { counselors: nextCounselors, activeCounselorId: nextCounselors[0].id }
    const nextHashes = { ...localPasswordHashes }
    delete nextHashes[activeCounselorId]
    writeLocalData(nextData, nextHashes)
    setData(nextData)
    setLocalPasswordHashes(nextHashes)
    loadCounselorIntoEditor(nextCounselors[0])
    setIsEditorOpen(false)
    setStatus('상담사를 삭제했어요.')
  }

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">온</span>
          <div><strong>온마음</strong><small>관리자 콘솔</small></div>
        </div>
        <nav className="main-nav" aria-label="관리자 메뉴">
          <p>운영 관리</p>
          <button className="nav-item is-active" type="button"><Icon name="people" /> 상담사 관리 <span>{data.counselors.length}</span></button>
          <button className="nav-item" type="button" disabled><Icon name="message" /> 후기 관리</button>
          <p>시스템</p>
          <button className="nav-item" type="button" disabled><Icon name="settings" /> 기본 설정</button>
        </nav>
        <div className="sidebar-account">
          <div className="account-avatar">관</div>
          <div><strong>운영 관리자</strong><small>admin@onmaum.kr</small></div>
          <Icon name="logout" />
        </div>
      </aside>

      <main className="admin-main">
        <header className="page-header">
          <div>
            <p className="breadcrumb">운영 관리 <span>/</span> 상담사 관리</p>
            <h1>상담사 관리</h1>
            <p className="page-description">상담사 프로필과 활동 상태를 한곳에서 관리하세요.</p>
          </div>
          <button className="primary-action" type="button" onClick={addCounselor}><Icon name="plus" /> 새 상담사 등록</button>
        </header>

        <div className="sync-banner" aria-live="polite">
          <span className={`sync-indicator ${isRemoteReady ? 'remote' : 'local'}`}><Icon name={isRemoteReady ? 'cloud' : 'check'} /></span>
          <p><strong>{isLoading ? '데이터를 불러오는 중' : isRemoteReady ? '실시간 동기화 중' : '로컬 저장 모드'}</strong><small>{isLoading ? '잠시만 기다려주세요.' : status}</small></p>
        </div>

        <section className="summary-grid" aria-label="상담사 현황">
          <SummaryCard icon="people" label="전체 상담사" value={data.counselors.length} note="등록된 상담사" tone="green" />
          <SummaryCard icon="check" label="활동 중" value={dashboardSummary.active} note={`${data.counselors.length - dashboardSummary.active}명 비활성`} tone="blue" />
          <SummaryCard icon="star" label="평균 만족도" value={formatAverage(dashboardSummary.rating)} note="전체 후기 기준" tone="amber" />
          <SummaryCard icon="message" label="누적 후기" value={dashboardSummary.reviews} note="상담사 전체 합계" tone="violet" />
        </section>

        <div className={`management-grid ${isEditorOpen ? 'has-editor' : ''}`}>
          <section className="list-panel">
            <div className="list-toolbar">
              <div>
                <h2>상담사 목록</h2>
                <p>총 {filteredCounselors.length}명이 표시되고 있어요.</p>
              </div>
              <div className="toolbar-controls">
                <label className="search-box">
                  <span className="sr-only">상담사 검색</span>
                  <Icon name="search" />
                  <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="이름, 전문 분야 검색" />
                </label>
                <div className="filter-tabs" aria-label="활동 상태 필터">
                  {counselorFilters.map((item) => (
                    <button key={item.value} type="button" aria-pressed={filter === item.value} className={filter === item.value ? 'is-active' : ''} onClick={() => setFilter(item.value)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="counselor-table">
                <thead><tr><th>상담사</th><th>전문 분야</th><th>상태</th><th>만족도</th><th>후기</th><th>최근 수정</th><th><span className="sr-only">관리</span></th></tr></thead>
                <tbody>
                  {filteredCounselors.map((counselor) => {
                    const rating = average(counselor.reviews, 'overall')
                    return (
                      <tr key={counselor.id} className={counselor.id === activeCounselorId && isEditorOpen ? 'is-selected' : ''}>
                        <td><button type="button" className="counselor-cell" onClick={() => selectCounselor(counselor.id)}><span className="table-avatar">{counselor.profile.avatarEmoji}</span><span><strong>{counselor.profile.nickname}</strong><small>{counselor.profile.adviceStyle}</small></span></button></td>
                        <td><div className="mini-tags">{counselor.profile.specialties.slice(0, 2).map((item) => <span key={item}>{item}</span>)}{counselor.profile.specialties.length > 2 && <span>+{counselor.profile.specialties.length - 2}</span>}</div></td>
                        <td><span className={`status-badge ${counselor.isActive ? 'active' : 'inactive'}`}><i />{counselor.isActive ? '활동 중' : '비활성'}</span></td>
                        <td><span className="rating-value"><b>★</b> {formatAverage(rating)}</span></td>
                        <td>{counselor.reviews.length}</td>
                        <td>{formatDate(counselor.profile.updatedAt)}</td>
                        <td><button className="row-action" type="button" onClick={() => selectCounselor(counselor.id)} aria-label={`${counselor.profile.nickname} 관리`}><Icon name="chevron" /></button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!filteredCounselors.length && <div className="no-results"><span>🔎</span><strong>검색 결과가 없어요</strong><p>검색어나 활동 상태를 다시 확인해주세요.</p></div>}
            </div>
          </section>

          {isEditorOpen && activeCounselor && (
            <aside className="editor-drawer" aria-label="상담사 정보 편집">
              <div className="drawer-header">
                <div><p>상담사 상세</p><h2>{draft.nickname}</h2></div>
                <button type="button" className="close-button" onClick={() => setIsEditorOpen(false)} aria-label="편집 패널 닫기"><Icon name="close" /></button>
              </div>

              {activeCounselor.hasPassword && !isUnlocked ? (
                <div className="locked-panel">
                  <span className="lock-illustration"><Icon name="lock" size={28} /></span>
                  <h3>프로필이 잠겨 있어요</h3>
                  <p>정보를 수정하려면 이 상담사의 편집용 암호를 입력해주세요.</p>
                  <form onSubmit={handleUnlock}>
                    <label>편집용 암호<input type="password" value={unlockPassword} onChange={(event) => setUnlockPassword(event.target.value)} autoComplete="current-password" placeholder="암호 입력" /></label>
                    <button className="primary-action wide" type="submit"><Icon name="lock" /> 잠금 해제</button>
                  </form>
                </div>
              ) : (
                <form className="editor-form" onSubmit={handleSave}>
                  <section className="drawer-section profile-identity">
                    <div className="large-avatar">{draft.avatarEmoji}</div>
                    <div className="identity-copy"><strong>{draft.nickname || '이름 미입력'}</strong><small>{draft.contactNote || '공개 안내를 입력해주세요.'}</small></div>
                    <label className="switch-row"><input type="checkbox" checked={draftIsActive} onChange={(event) => setDraftIsActive(event.target.checked)} /><span className="switch" /><em>{draftIsActive ? '활동 중' : '비활성'}</em></label>
                  </section>

                  <section className="drawer-section form-section">
                    <h3>기본 정보</h3>
                    <label>상담사 이름<input value={draft.nickname} onChange={(event) => updateDraft('nickname', event.target.value)} placeholder="표시할 이름" /></label>
                    <div className="field-label">프로필 이모지</div>
                    <div className="emoji-picker" role="group" aria-label="프로필 이모지">
                      {emojiOptions.map((emoji) => <button key={emoji} type="button" className={draft.avatarEmoji === emoji ? 'is-selected' : ''} onClick={() => updateDraft('avatarEmoji', emoji)}>{emoji}</button>)}
                    </div>
                    <label>한 줄 소개<textarea rows={3} value={draft.intro} onChange={(event) => updateDraft('intro', event.target.value)} /></label>
                    <label>공개 안내<input value={draft.contactNote} onChange={(event) => updateDraft('contactNote', event.target.value)} /></label>
                  </section>

                  <section className="drawer-section form-section">
                    <h3>상담 정보</h3>
                    <label>전문 분야 <small>쉼표로 구분해주세요</small><input value={listTexts.specialties} onChange={(event) => handleListChange('specialties', event.target.value)} /></label>
                    <label>상담 분위기<input value={listTexts.atmosphere} onChange={(event) => handleListChange('atmosphere', event.target.value)} /></label>
                    <label>상담 방식<input value={listTexts.methods} onChange={(event) => handleListChange('methods', event.target.value)} /></label>
                    <div className="two-columns">
                      <label>조언 성향<input value={draft.adviceStyle} onChange={(event) => updateDraft('adviceStyle', event.target.value)} /></label>
                      <label>응답 속도<select value={draft.responseSpeed} onChange={(event) => updateDraft('responseSpeed', event.target.value)}><option>빠름</option><option>보통</option><option>느림</option><option>상황에 따라 다름</option></select></label>
                    </div>
                    <div className="two-columns">
                      <RatingButtons label="공감력" value={draft.empathy} onChange={(value) => updateDraft('empathy', value)} />
                      <RatingButtons label="경청력" value={draft.listening} onChange={(value) => updateDraft('listening', value)} />
                    </div>
                  </section>

                  <section className="drawer-section form-section">
                    <h3>보안</h3>
                    <label>{activeCounselor.hasPassword ? '새 암호 (변경할 때만 입력)' : '편집용 암호'}<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder={activeCounselor.hasPassword ? '변경하지 않음' : '필수 입력'} /></label>
                  </section>

                  <div className="drawer-actions">
                    <button className="delete-button" type="button" onClick={handleDelete}><Icon name="trash" /> 삭제</button>
                    <button className="primary-action" type="submit"><Icon name="check" /> 변경사항 저장</button>
                  </div>
                </form>
              )}
            </aside>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
