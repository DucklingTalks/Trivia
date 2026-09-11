import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './i18n/LanguageContext'

const sentryDsn = import.meta.env.VITE_SENTRY_DSN

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || undefined,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.request
      delete event.user
      delete event.extra
      delete event.contexts
      delete event.breadcrumbs
      delete event.spans
      delete event.message
      delete event.transaction

      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          delete exception.value
          for (const frame of exception.stacktrace?.frames || []) {
            delete frame.filename
            delete frame.abs_path
            delete frame.module
            delete frame.context_line
            delete frame.pre_context
            delete frame.post_context
            delete frame.vars
          }
        }
      }

      const operation = event.tags?.operation
      event.tags = { service: 'client', ...(operation ? { operation } : {}) }
      return event
    },
    beforeBreadcrumb() {
      return null
    },
  })
}

const root = createRoot(document.getElementById('root')!, sentryDsn ? {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
} : undefined)

root.render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)
