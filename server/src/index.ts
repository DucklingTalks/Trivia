import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as Sentry from '@sentry/node';
import routes from './routes';
import { setupSockets } from './sockets';

const parseSampleRate = (value: string | undefined): number | undefined => {
  if (!value || value.trim() === '') return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
};

const sentryDsn = process.env.SENTRY_DSN;

if (sentryDsn) {
  const tracesSampleRate = parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE);

  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.SENTRY_ENVIRONMENT || undefined,
    release: process.env.SENTRY_RELEASE || undefined,
    ...(tracesSampleRate === undefined ? {} : { tracesSampleRate }),
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.request;
      delete event.user;
      delete event.extra;
      delete event.contexts;
      delete event.breadcrumbs;
      delete event.spans;
      delete event.message;
      delete event.transaction;

      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          delete exception.value;
          for (const frame of exception.stacktrace?.frames || []) {
            delete frame.filename;
            delete frame.abs_path;
            delete frame.module;
            delete frame.context_line;
            delete frame.pre_context;
            delete frame.post_context;
            delete frame.vars;
          }
        }
      }

      const operation = event.tags?.operation;
      event.tags = { service: 'server', ...(operation ? { operation } : {}) };
      return event;
    },
    beforeBreadcrumb() {
      return null;
    },
  });
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Montar las rutas REST
app.use('/api', routes);

// Endpoint de health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

if (sentryDsn) {
  Sentry.setupExpressErrorHandler(app);
}

// Crear el servidor HTTP y vincular Socket.IO
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Permitir conexiones desde cualquier origen para desarrollo
    methods: ['GET', 'POST']
  }
});

// Configurar WebSockets
setupSockets(io);

httpServer.listen(PORT, () => {
  console.log(`[Server] Corriendo en http://localhost:${PORT}`);
});
