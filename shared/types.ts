// Tipos y Modelos Compartidos para la Trivia

export type Language = 'es' | 'en';

export interface TriviaConfig {
  maxScore: number;         // Puntaje máximo por pregunta (ej. 1000)
  readTime: number;         // Tiempo de lectura en segundos (ej. 5)
  answerTime: number;       // Tiempo para responder en segundos (ej. 20)
  revealTime: number;       // Tiempo de revelación de resultados en segundos (ej. 5)
  randomizeQuestions: boolean; // Randomizar orden de preguntas
}

export interface Question {
  id: string;
  text: string;
  imageUrl?: string;        // Opcional
  options: [string, string, string, string]; // Exactamente 4 opciones
  correctOptionIndex: number; // Índice de la respuesta correcta (0-3)
  funFact?: string;         // Dato curioso / explicación que se muestra al revelar
}

export type SessionStatus = 'LOBBY' | 'READING' | 'ANSWERING' | 'REVEALING' | 'FINISHED';

export interface Player {
  id: string;               // Generado por el servidor / UUID
  name: string;             // Nombre/pseudónimo único elegido por el jugador
  socketId: string;         // ID de conexión de Socket.IO actual
  score: number;            // Puntaje total acumulado
  isConnected: boolean;     // Estado de conexión actual
  localUuid: string;        // UUID persistido en localStorage para reconexión
}

export interface Session {
  id: string;               // ID único de la sesión (código de partida)
  language: Language;       // Idioma seleccionado por el Host para toda la partida
  status: SessionStatus;
  config: TriviaConfig;
  questions: Question[];
  currentQuestionIndex: number;
  players: Player[];
  roundStartTime?: number;  // Timestamp en ms del inicio de la fase actual
}

// Interfaces de eventos y payloads de Socket.IO

// Eventos enviados por el Host
export interface HostJoinSessionResponsePayload {
  success: boolean;
  error?: string;
}

export interface HostCreateSessionPayload {
  config: TriviaConfig;
  questions: Question[];
  language: Language;
}

export interface HostStartGamePayload {
  sessionId: string;
}

// Eventos enviados por el Jugador
export interface PlayerJoinPayload {
  sessionId: string;
  name: string;
  localUuid: string;
}

export interface PlayerAnswerPayload {
  sessionId: string;
  questionId: string;
  selectedOptionIndex: number;
  responseTimeMs: number; // Tiempo transcurrido desde el inicio de la fase de respuesta
}

export interface PlayerReconnectPayload {
  sessionId: string;
  localUuid: string;
}

export interface ReconnectResponsePayload {
  success: boolean;
  error?: string;
  // Restore state
  playerName?: string;
  playerScore?: number;
  language?: Language;
  sessionStatus?: SessionStatus;
  currentQuestion?: {
    id: string;
    text: string;
    imageUrl?: string;
    options: [string, string, string, string];
  };
  currentQuestionIndex?: number;
  totalQuestions?: number;
  timeElapsedSeconds?: number;   // How much time has passed in the current phase
  phaseDurationSeconds?: number; // Total duration of the current phase
  hasAnsweredCurrentQuestion?: boolean;
  correctOptionIndex?: number;   // Only during REVEALING phase
}

// Eventos emitidos por el Servidor
export interface LobbyUpdatePayload {
  sessionId: string;
  players: { name: string; isConnected: boolean }[];
}

export interface RoundStartPayload {
  status: 'READING' | 'ANSWERING';
  question: {
    id: string;
    text: string;
    imageUrl?: string;
    options: [string, string, string, string]; // Opciones (pueden venir mezcladas para el cliente)
  };
  currentQuestionIndex: number;
  totalQuestions: number;
  durationSeconds: number;
}

export interface AnswersRevealPayload {
  correctOptionIndex: number;
  funFact?: string;         // Dato curioso de la pregunta (opcional)
  stats: {
    optionCounts: [number, number, number, number]; // Cantidad de respuestas por opción [A, B, C, D]
  };
}

export interface ScoreboardUpdatePayload {
  players: {
    name: string;
    score: number;
    lastRoundPoints: number;
    rank: number;
  }[];
}

export interface GameFinishedPayload {
  podium: {
    name: string;
    score: number;
    rank: number;
  }[];
}
