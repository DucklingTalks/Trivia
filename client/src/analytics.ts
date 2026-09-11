import posthog from 'posthog-js'

export type AnalyticsRole = 'host' | 'player'
export type AnalyticsLanguage = 'es' | 'en'
export type ErrorCategory = 'validation' | 'network' | 'server' | 'rejected' | 'unknown'
export type ReconnectionResult = 'succeeded' | 'failed'
export type SessionStatus = 'lobby' | 'reading' | 'answering' | 'revealing' | 'finished' | 'unknown'

type Bucket = '1-5' | '6-10' | '11+'
type PlayerBucket = '1' | '2-4' | '5-9' | '10+'
type ResponseTimeBucket = '0-5s' | '6-10s' | '11-20s' | '21s+'
type DurationBucket = '0-5m' | '6-15m' | '16m+'

type AnalyticsProperties =
  | { environment: string; language: AnalyticsLanguage; app_version: string }
  | { role: AnalyticsRole; language: AnalyticsLanguage }
  | { language: AnalyticsLanguage; question_count_bucket: Bucket }
  | { error_category: ErrorCategory; language: AnalyticsLanguage }
  | { language: AnalyticsLanguage }
  | { question_count_bucket: Bucket; player_count_bucket: PlayerBucket; language: AnalyticsLanguage }
  | { response_time_bucket: ResponseTimeBucket; question_number_bucket: Bucket }
  | { duration_bucket: DurationBucket; question_count_bucket: Bucket; player_count_bucket: PlayerBucket }
  | { result: ReconnectionResult; session_status: SessionStatus }

export type AnalyticsEvent =
  | 'app_opened'
  | 'role_selected'
  | 'session_creation_succeeded'
  | 'session_creation_failed'
  | 'session_join_succeeded'
  | 'session_join_failed'
  | 'game_started'
  | 'answer_submitted'
  | 'game_finished'
  | 'reconnection_attempted'

const consentStorageKey = 'trivia_analytics_consent'
const posthogKey = import.meta.env.VITE_POSTHOG_KEY
const consentRequired = import.meta.env.VITE_POSTHOG_CONSENT_REQUIRED === 'true'
let initialized = false

export type AnalyticsConsent = 'accepted' | 'declined' | null

export function initializeAnalytics(): void {
  if (initialized || !posthogKey) return

  posthog.init(posthogKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || undefined,
    autocapture: false,
    capture_pageview: false,
    capture_exceptions: false,
    disable_session_recording: true,
    persistence: 'memory',
  })
  initialized = true

  if (consentRequired && getAnalyticsConsent() !== 'accepted') {
    posthog.opt_out_capturing()
  }
}

export function isAnalyticsConfigured(): boolean {
  return Boolean(posthogKey)
}

export function isAnalyticsConsentRequired(): boolean {
  return consentRequired
}

export function getAnalyticsConsent(): AnalyticsConsent {
  if (!consentRequired) return 'accepted'
  const value = localStorage.getItem(consentStorageKey)
  return value === 'accepted' || value === 'declined' ? value : null
}

export function setAnalyticsConsent(consent: Exclude<AnalyticsConsent, null>): void {
  if (!initialized) return
  localStorage.setItem(consentStorageKey, consent)
  if (consent === 'accepted') {
    posthog.opt_in_capturing()
  } else {
    posthog.opt_out_capturing()
  }
}

export function captureAnalyticsEvent(event: AnalyticsEvent, properties: AnalyticsProperties): void {
  if (!initialized || (consentRequired && getAnalyticsConsent() !== 'accepted')) return
  posthog.capture(event, properties)
}

export function bucketQuestionCount(count: number): Bucket {
  if (count <= 5) return '1-5'
  if (count <= 10) return '6-10'
  return '11+'
}

export function bucketPlayerCount(count: number): PlayerBucket {
  if (count <= 1) return '1'
  if (count <= 4) return '2-4'
  if (count <= 9) return '5-9'
  return '10+'
}

export function bucketResponseTime(milliseconds: number): ResponseTimeBucket {
  const seconds = Math.max(0, milliseconds) / 1000
  if (seconds <= 5) return '0-5s'
  if (seconds <= 10) return '6-10s'
  if (seconds <= 20) return '11-20s'
  return '21s+'
}

export function bucketDuration(milliseconds: number): DurationBucket {
  const minutes = Math.max(0, milliseconds) / 60000
  if (minutes <= 5) return '0-5m'
  if (minutes <= 15) return '6-15m'
  return '16m+'
}

export function mapErrorCategory(status?: number, error?: unknown): ErrorCategory {
  if (status !== undefined) {
    if (status >= 400 && status < 500) return 'validation'
    if (status >= 500) return 'server'
  }
  if (error instanceof TypeError || error instanceof DOMException) return 'network'
  return 'unknown'
}

export function mapSessionStatus(status?: string): SessionStatus {
  switch (status) {
    case 'LOBBY': return 'lobby'
    case 'READING': return 'reading'
    case 'ANSWERING': return 'answering'
    case 'REVEALING': return 'revealing'
    case 'FINISHED': return 'finished'
    default: return 'unknown'
  }
}
