import { createHash, createSign } from 'node:crypto'

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

type StoredData = {
  profile: CounselorProfile | null
  reviews: Review[]
  passwordHash: string
}

type FirebaseConfig = {
  projectId: string
  clientEmail: string
  privateKey: string
  databaseId: string
}

type ApiRequest = {
  method?: string
  body?: unknown
}

type ApiResponse = {
  setHeader(name: string, value: string | string[]): void
  status(code: number): ApiResponse
  json(payload: unknown): void
  end(): void
}

type UnknownRecord = Record<string, unknown>

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore'
const DOCUMENT_PATH = 'counselorProfiles/main'
const MAX_REVIEWS = 200

let cachedToken = {
  value: '',
  expiresAt: 0,
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toBase64Url = (value: string | Buffer) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const getFirebaseConfig = (): FirebaseConfig | null => {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    return null
  }

  return {
    projectId,
    clientEmail,
    privateKey,
    databaseId: process.env.FIREBASE_DATABASE_ID || '(default)',
  }
}

const hashPassword = (password: string) =>
  createHash('sha256').update(password, 'utf8').digest('hex')

const clampRating = (value: unknown) => {
  const numberValue = typeof value === 'number' ? value : Number(value)
  const safeValue = Number.isFinite(numberValue) ? numberValue : 5
  return Math.min(5, Math.max(1, Math.round(safeValue)))
}

const cleanString = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return trimmed || fallback
}

const cleanList = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) {
    return fallback
  }

  const list = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)

  return list.length ? list : fallback
}

const sanitizeProfile = (value: unknown): CounselorProfile | null => {
  if (!isRecord(value)) {
    return null
  }

  return {
    nickname: cleanString(value.nickname, '상담사'),
    avatarEmoji: cleanString(value.avatarEmoji, '💬'),
    empathy: clampRating(value.empathy),
    listening: clampRating(value.listening),
    atmosphere: cleanList(value.atmosphere, ['편안함']),
    adviceStyle: cleanString(value.adviceStyle, '공감형'),
    specialties: cleanList(value.specialties, ['마음 상담']),
    methods: cleanList(value.methods, ['텍스트 상담']),
    responseSpeed: cleanString(value.responseSpeed, '보통'),
    intro: cleanString(value.intro, '천천히 들어드릴게요.'),
    statusEmoji: cleanString(value.statusEmoji, '☁️'),
    contactNote: cleanString(value.contactNote, '상담 가능'),
    updatedAt: new Date().toISOString(),
  }
}

const sanitizeReview = (value: unknown): Review | null => {
  if (!isRecord(value)) {
    return null
  }

  return {
    id: cleanString(value.id, `review-${Date.now()}`),
    overall: clampRating(value.overall),
    empathy: clampRating(value.empathy),
    listening: clampRating(value.listening),
    comfort: clampRating(value.comfort),
    emoji: cleanString(value.emoji, '😊'),
    comment: cleanString(value.comment, ''),
    createdAt: cleanString(value.createdAt, new Date().toISOString()),
  }
}

const parseBody = (body: unknown): UnknownRecord => {
  if (isRecord(body)) {
    return body
  }

  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as unknown
      return isRecord(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  return {}
}

const getAccessToken = async (config: FirebaseConfig) => {
  if (cachedToken.value && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }

  const issuedAt = Math.floor(Date.now() / 1000)
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = toBase64Url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: FIRESTORE_SCOPE,
      aud: TOKEN_URL,
      exp: issuedAt + 3600,
      iat: issuedAt,
    }),
  )
  const unsignedJwt = `${header}.${claim}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedJwt)
  signer.end()

  const assertion = `${unsignedJwt}.${toBase64Url(signer.sign(config.privateKey))}`
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  })

  if (!response.ok) {
    throw new Error('Firebase token request failed')
  }

  const token = (await response.json()) as {
    access_token?: string
    expires_in?: number
  }

  if (!token.access_token) {
    throw new Error('Firebase token response is missing access_token')
  }

  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + ((token.expires_in ?? 3600) - 60) * 1000,
  }

  return cachedToken.value
}

const documentUrl = (config: FirebaseConfig) =>
  `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.databaseId}/documents/${DOCUMENT_PATH}`

const firestoreFetch = async (
  config: FirebaseConfig,
  method: 'GET' | 'PATCH',
  body?: unknown,
) => {
  const accessToken = await getAccessToken(config)

  return fetch(documentUrl(config), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const parseJsonField = <T,>(value: unknown, fallback: T): T => {
  if (!isRecord(value) || typeof value.stringValue !== 'string') {
    return fallback
  }

  try {
    return JSON.parse(value.stringValue) as T
  } catch {
    return fallback
  }
}

const readStoredData = async (config: FirebaseConfig): Promise<StoredData | null> => {
  const response = await firestoreFetch(config, 'GET')

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error('Firestore read failed')
  }

  const document = (await response.json()) as UnknownRecord
  const fields = isRecord(document.fields) ? document.fields : {}
  const reviews = parseJsonField<Review[]>(fields.reviewsJson, [])
  const profile = parseJsonField<CounselorProfile | null>(fields.profileJson, null)
  const passwordHash =
    isRecord(fields.passwordHash) && typeof fields.passwordHash.stringValue === 'string'
      ? fields.passwordHash.stringValue
      : ''

  return {
    profile,
    reviews: Array.isArray(reviews) ? reviews : [],
    passwordHash,
  }
}

const writeStoredData = async (config: FirebaseConfig, data: StoredData) => {
  const response = await firestoreFetch(config, 'PATCH', {
    fields: {
      profileJson: {
        stringValue: JSON.stringify(data.profile),
      },
      reviewsJson: {
        stringValue: JSON.stringify(data.reviews.slice(0, MAX_REVIEWS)),
      },
      passwordHash: {
        stringValue: data.passwordHash,
      },
      updatedAt: {
        timestampValue: new Date().toISOString(),
      },
    },
  })

  if (!response.ok) {
    throw new Error('Firestore write failed')
  }
}

const toPublicPayload = (data: StoredData | null) => ({
  profile: data?.profile ?? null,
  reviews: data?.reviews ?? [],
  hasPassword: Boolean(data?.passwordHash),
})

const sendMethodNotAllowed = (res: ApiResponse) => {
  res.status(405).json({ error: 'Method not allowed' })
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const config = getFirebaseConfig()

  if (!config) {
    res.status(503).json({ error: 'Firebase environment variables are missing' })
    return
  }

  try {
    if (req.method === 'GET') {
      const storedData = await readStoredData(config)
      res.status(200).json(toPublicPayload(storedData))
      return
    }

    if (req.method === 'POST') {
      const body = parseBody(req.body)
      const storedData = await readStoredData(config)

      if (body.type === 'unlock') {
        const password = typeof body.password === 'string' ? body.password : ''
        const ok = !storedData?.passwordHash || hashPassword(password) === storedData.passwordHash
        res.status(ok ? 200 : 401).json({ ok })
        return
      }

      if (body.type === 'review') {
        const review = sanitizeReview(body.review)

        if (!review) {
          res.status(400).json({ error: 'Invalid review' })
          return
        }

        const nextData: StoredData = {
          profile: storedData?.profile ?? null,
          reviews: [review, ...(storedData?.reviews ?? [])].slice(0, MAX_REVIEWS),
          passwordHash: storedData?.passwordHash ?? '',
        }

        await writeStoredData(config, nextData)
        res.status(200).json(toPublicPayload(nextData))
        return
      }

      res.status(400).json({ error: 'Unknown request type' })
      return
    }

    if (req.method === 'PUT') {
      const body = parseBody(req.body)
      const profile = sanitizeProfile(body.profile)

      if (!profile) {
        res.status(400).json({ error: 'Invalid profile' })
        return
      }

      const storedData = await readStoredData(config)
      const currentHash = storedData?.passwordHash ?? ''
      const password = typeof body.password === 'string' ? body.password : ''
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword.trim() : ''
      let nextPasswordHash = currentHash

      if (currentHash && hashPassword(password) !== currentHash) {
        res.status(401).json({ error: 'Invalid password' })
        return
      }

      if (newPassword) {
        nextPasswordHash = hashPassword(newPassword)
      }

      if (!nextPasswordHash) {
        res.status(400).json({ error: 'Password is required' })
        return
      }

      const nextData: StoredData = {
        profile,
        reviews: storedData?.reviews ?? [],
        passwordHash: nextPasswordHash,
      }

      await writeStoredData(config, nextData)
      res.status(200).json(toPublicPayload(nextData))
      return
    }

    sendMethodNotAllowed(res)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Profile API failed' })
  }
}
