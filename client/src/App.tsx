import { useState, useEffect, useRef } from 'react'
import { socket } from './socket'
import { QRCodeSVG } from 'qrcode.react'
import { sounds } from './sound'
import { useLanguage } from './i18n/LanguageContext'
import * as Sentry from '@sentry/react'
import {
  bucketDuration,
  bucketPlayerCount,
  bucketQuestionCount,
  bucketResponseTime,
  captureAnalyticsEvent,
  getAnalyticsConsent,
  isAnalyticsConfigured,
  isAnalyticsConsentRequired,
  mapErrorCategory,
  mapSessionStatus,
  setAnalyticsConsent,
} from './analytics'
import type { 
  Question, 
  TriviaConfig, 
  LobbyUpdatePayload, 
  PlayerJoinPayload,
  ReconnectResponsePayload,
  RoundStartPayload,
  AnswersRevealPayload,
  ScoreboardUpdatePayload,
  GameFinishedPayload
} from '../../shared/types'

function getDefaultQuestions(language: 'es' | 'en'): Question[] {
  if (language === 'en') {
    return [
      {
        id: '1',
        text: 'What is the single source of truth in this Trivia architecture?',
        options: ['The database', 'The Host client', 'The server', 'LocalStorage'],
        correctOptionIndex: 2,
        funFact: 'In client-server architectures, the server acts as the central referee. This ensures every player sees the same game state regardless of network latency.'
      },
      {
        id: '2',
        text: 'Which library is used for real-time communication?',
        options: ['HTTP Polling', 'WebRTC', 'Socket.IO', 'gRPC'],
        correctOptionIndex: 2,
        funFact: 'Socket.IO combines WebSockets with automatic fallbacks such as Long Polling, ensuring connectivity even on restrictive networks. It also handles reconnections automatically.'
      },
      {
        id: '3',
        text: 'Where do we persist the reconnection UUID locally?',
        options: ['Cookies', 'SessionStorage', 'IndexedDB', 'LocalStorage'],
        correctOptionIndex: 3,
        funFact: 'localStorage persists data even after closing the browser, unlike sessionStorage. This enables automatic reconnection when returning to the app.'
      }
    ]
  }

  return [
    {
      id: '1',
      text: '¿Cuál es la única fuente de verdad en la arquitectura de esta Trivia?',
      options: ['La base de datos', 'El cliente del Host', 'El servidor', 'El LocalStorage'],
      correctOptionIndex: 2,
      funFact: 'En arquitecturas cliente-servidor, el servidor actúa como árbitro central. Esto garantiza que todos los jugadores vean el mismo estado del juego, sin importar la latencia de red de cada uno.'
    },
    {
      id: '2',
      text: '¿Qué biblioteca se usa para la comunicación en tiempo real?',
      options: ['HTTP Polling', 'WebRTC', 'Socket.IO', 'gRPC'],
      correctOptionIndex: 2,
      funFact: 'Socket.IO combina WebSockets con fallbacks automáticos (como Long Polling) para garantizar conectividad incluso en redes restrictivas. También maneja reconexiones automáticamente.'
    },
    {
      id: '3',
      text: '¿En qué almacenamiento local persistimos el UUID de reconexión?',
      options: ['Cookies', 'SessionStorage', 'IndexedDB', 'LocalStorage'],
      correctOptionIndex: 3,
      funFact: 'localStorage persiste los datos incluso al cerrar el navegador, a diferencia de sessionStorage que se limpia al cerrar la pestaña. Esto es lo que permite la reconexión automática al volver a la app.'
    }
  ]
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback si no está en Contexto Seguro (HTTPS)
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}


function App() {
  const { lang, setLang, t } = useLanguage()

  const [role, setRole] = useState<'HOST' | 'PLAYER' | null>(null)
  const [screen, setScreen] = useState<'INITIAL' | 'HOST_CONFIG' | 'PLAYER_JOIN' | 'LOBBY' | 'GAME'>('INITIAL')
  const [gamePhase, setGamePhase] = useState<'READING' | 'ANSWERING' | 'REVEALING' | 'FINISHED'>('READING')

  // Estado del juego
  const [sessionId, setSessionId] = useState<string>('')
  const [players, setPlayers] = useState<{ name: string; isConnected: boolean }[]>([])
  const [errorMsg, setErrorMsg] = useState<string>('')

  // Configuración de la Trivia (Host)
  const [config, setConfig] = useState<TriviaConfig>({
    maxScore: 1000,
    readTime: 5,
    answerTime: 20,
    revealTime: 5,
    randomizeQuestions: false
  })
  const [questions, setQuestions] = useState<Question[]>(() => getDefaultQuestions(lang))

  const handleLanguageChange = (nextLanguage: 'es' | 'en') => {
    if (sessionId && screen !== 'INITIAL') return
    const usingDefaultQuestions = JSON.stringify(questions) === JSON.stringify(getDefaultQuestions(lang))
    if (usingDefaultQuestions) {
      setQuestions(getDefaultQuestions(nextLanguage))
    }
    setLang(nextLanguage)
  }

  // Estados para el editor de preguntas
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false)
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null)
  const [draftQuestion, setDraftQuestion] = useState<Question>({
    id: '',
    text: '',
    imageUrl: '',
    funFact: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0
  })

  const handleOpenAddQuestion = () => {
    setEditingQuestionIndex(null)
    setDraftQuestion({
      id: generateUUID(),
      text: '',
      imageUrl: '',
      funFact: '',
      options: ['', '', '', ''],
      correctOptionIndex: 0
    })
    setIsQuestionModalOpen(true)
  }

  const handleOpenEditQuestion = (index: number) => {
    setEditingQuestionIndex(index)
    setDraftQuestion(JSON.parse(JSON.stringify(questions[index])))
    setIsQuestionModalOpen(true)
  }

  const handleDeleteQuestion = (index: number) => {
    if (questions.length <= 1) {
      setErrorMsg(t('validationMinQuestion'))
      return
    }
    setErrorMsg('')
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const handleSaveDraftQuestion = () => {
    if (!draftQuestion.text.trim()) {
      setErrorMsg(t('validationQuestionText'))
      return
    }
    if (draftQuestion.options.some(opt => !opt.trim())) {
      setErrorMsg(t('validationOptions'))
      return
    }

    setErrorMsg('')
    if (editingQuestionIndex !== null) {
      const updated = [...questions]
      updated[editingQuestionIndex] = draftQuestion
      setQuestions(updated)
    } else {
      setQuestions([...questions, draftQuestion])
    }
    setIsQuestionModalOpen(false)
  }

  // Descarga de plantillas JSON y CSV
  const handleDownloadJSONTemplate = () => {
    const templateData = [
      {
        text: "¿Cuál es la fuente de verdad en esta arquitectura?",
        imageUrl: "https://ejemplo.com/diagrama.jpg",
        options: ["La base de datos", "El cliente del Host", "El servidor en memoria", "El LocalStorage"],
        correctOptionIndex: 2,
        funFact: "En una arquitectura centralizada, el servidor es quien mantiene el estado canónico del juego, garantizando consistencia entre todos los clientes."
      },
      {
        text: "¿Qué biblioteca se utiliza para tiempo real?",
        imageUrl: "",
        options: ["HTTP Long Polling", "WebRTC", "Socket.IO", "FTP"],
        correctOptionIndex: 2,
        funFact: "Socket.IO se apoya en WebSockets pero tiene fallback automático a Long Polling si el entorno no lo soporta."
      }
    ];
    const blob = new Blob([JSON.stringify(templateData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_preguntas.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCSVTemplate = () => {
    const csvContent =
      "text,imageUrl,optionA,optionB,optionC,optionD,correctOptionIndex,funFact\n" +
      '"¿Cuál es la fuente de verdad en esta arquitectura?","https://ejemplo.com/diagrama.jpg","La base de datos","El cliente del Host","El servidor en memoria","El LocalStorage",2,"En una arquitectura centralizada el servidor mantiene el estado canónico del juego."\n' +
      '"¿Qué biblioteca se utiliza para tiempo real?","","HTTP Long Polling","WebRTC","Socket.IO","FTP",2,"Socket.IO tiene fallback automático a Long Polling si WebSockets no está disponible."\n';
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_preguntas.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exportar preguntas actuales a JSON
  const handleExportJSON = () => {
    const exportData = questions.map(({ text, imageUrl, options, correctOptionIndex, funFact }) => ({
      text,
      imageUrl: imageUrl || '',
      options,
      correctOptionIndex,
      funFact: funFact || ''
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "preguntas_trivia.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exportar preguntas actuales a CSV
  const handleExportCSV = () => {
    const header = "text,imageUrl,optionA,optionB,optionC,optionD,correctOptionIndex,funFact\n";
    const rows = questions.map(q => {
      const escapedText = `"${q.text.replace(/"/g, '""')}"`;
      const escapedImg = `"${(q.imageUrl || '').replace(/"/g, '""')}"`;
      const optA = `"${(q.options[0] || '').replace(/"/g, '""')}"`;
      const optB = `"${(q.options[1] || '').replace(/"/g, '""')}"`;
      const optC = `"${(q.options[2] || '').replace(/"/g, '""')}"`;
      const optD = `"${(q.options[3] || '').replace(/"/g, '""')}"`;
      const escapedFunFact = `"${(q.funFact || '').replace(/"/g, '""')}"`;
      return `${escapedText},${escapedImg},${optA},${optB},${optC},${optD},${q.correctOptionIndex},${escapedFunFact}`;
    }).join("\n");

    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "preguntas_trivia.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parser CSV helper
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  };

  // Cargar archivo JSON o CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;
      try {
        if (fileName.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (!Array.isArray(parsed)) throw new Error(t('errorJsonNotArray'));

          const validQuestions: Question[] = parsed.map((item, idx) => {
            if (!item.text || !Array.isArray(item.options) || item.options.length !== 4) {
              throw new Error(t('errorJsonQuestionShape', { n: idx + 1 }));
            }
            const correctIndex = typeof item.correctOptionIndex === 'number' ? item.correctOptionIndex : 0;
            return {
              id: generateUUID(),
              text: String(item.text),
              imageUrl: item.imageUrl ? String(item.imageUrl) : '',
              options: [String(item.options[0]), String(item.options[1]), String(item.options[2]), String(item.options[3])],
              correctOptionIndex: Math.min(3, Math.max(0, correctIndex)),
              funFact: item.funFact ? String(item.funFact) : ''
            };
          });

          setQuestions(validQuestions);
          setErrorMsg('');
        } else if (fileName.endsWith('.csv')) {
          const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
          if (lines.length <= 1) throw new Error(t('errorEmptyCSV'));

          const hasHeader = lines[0].toLowerCase().includes('text') || lines[0].toLowerCase().includes('option');
          const dataLines = hasHeader ? lines.slice(1) : lines;

          const validQuestions: Question[] = dataLines.map((line, idx) => {
            const cols = parseCSVLine(line);
            if (cols.length < 7) {
              throw new Error(t('errorCsvLineColumns', { line: idx + (hasHeader ? 2 : 1) }));
            }
            const text = cols[0];
            const imageUrl = cols[1];
            const options: [string, string, string, string] = [cols[2], cols[3], cols[4], cols[5]];
            const correctOptionIndex = parseInt(cols[6], 10);
            const funFact = cols[7] || '';

            return {
              id: generateUUID(),
              text,
              imageUrl: imageUrl || '',
              options,
              correctOptionIndex: isNaN(correctOptionIndex) ? 0 : Math.min(3, Math.max(0, correctOptionIndex)),
              funFact
            };
          });

          setQuestions(validQuestions);
          setErrorMsg('');
        } else {
          throw new Error(t('errorUnsupportedFormat'));
        }
      } catch (err: any) {
        setErrorMsg(err.message || t('errorProcessingFile'));
      }
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  // Datos del jugador
  const [playerName, setPlayerName] = useState<string>('')
  const [playerUuid, setPlayerUuid] = useState<string>('')

  // Datos en tiempo de juego
  const [currentQuestion, setCurrentQuestion] = useState<{
    id: string;
    text: string;
    imageUrl?: string;
    options: [string, string, string, string];
  } | null>(null)
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)

  // Temporizadores
  const [timeLeft, setTimeLeft] = useState(0)
  const phaseStartTimestamp = useRef<number>(0)

  // Respuestas y Resultados
  const [hasAnswered, setHasAnswered] = useState(false)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const selectedOptionRef = useRef<number | null>(null)  // ref para evitar stale closure en socket handlers
  const [correctIndex, setCorrectIndex] = useState<number | null>(null)
  const [revealFunFact, setRevealFunFact] = useState<string>('')
  const [answerStats, setAnswerStats] = useState<[number, number, number, number] | null>(null)
  const [scoreboard, setScoreboard] = useState<ScoreboardUpdatePayload['players']>([])
  const [podium, setPodium] = useState<GameFinishedPayload['podium']>([])
  const [analyticsConsent, setAnalyticsConsentState] = useState(getAnalyticsConsent())
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false)
  const gameStartedAt = useRef<number | null>(null)
  const appOpenedSent = useRef(false)

  useEffect(() => {
    if (appOpenedSent.current || (isAnalyticsConsentRequired() && analyticsConsent !== 'accepted')) return
    captureAnalyticsEvent('app_opened', {
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'local',
      language: lang,
      app_version: import.meta.env.VITE_SENTRY_RELEASE || 'unknown',
    })
    appOpenedSent.current = true
  }, [analyticsConsent, lang])

  const handleAnalyticsConsent = (consent: 'accepted' | 'declined') => {
    setAnalyticsConsent(consent)
    setAnalyticsConsentState(consent)
  }

  const handleRoleSelected = (selectedRole: 'host' | 'player') => {
    captureAnalyticsEvent('role_selected', { role: selectedRole, language: lang })
    setRole(selectedRole.toUpperCase() as 'HOST' | 'PLAYER')
    setScreen(selectedRole === 'host' ? 'HOST_CONFIG' : 'PLAYER_JOIN')
  }

  // Generar UUID único del jugador si no existe en localStorage + auto-reconexión
  useEffect(() => {
    let uuid = localStorage.getItem('trivia_player_uuid')
    if (!uuid) {
      uuid = generateUUID()
      localStorage.setItem('trivia_player_uuid', uuid)
    }
    setPlayerUuid(uuid)

    // Detección de parámetro QR ?session=CODIGO
    const searchParams = new URLSearchParams(window.location.search);
    const sessionParam = searchParams.get('session');

    if (sessionParam) {
      const cleanSessionId = sessionParam.trim().toUpperCase();
      setSessionId(cleanSessionId);
      setRole('PLAYER');
      setScreen('PLAYER_JOIN');
    } else {
      // Intentar reconexión automática si hay una sesión guardada previamente
      const savedSessionId = localStorage.getItem('trivia_session_id')
      const savedName = localStorage.getItem('trivia_player_name')
      if (savedSessionId && savedName && uuid) {
        socket.connect()
        socket.emit(
          'player:reconnect',
          { sessionId: savedSessionId, localUuid: uuid },
          (res: ReconnectResponsePayload) => {
            if (!res.success) {
              captureAnalyticsEvent('reconnection_attempted', { result: 'failed', session_status: 'unknown' })
              // Sesión expirada o jugador no encontrado, limpiar storage
              localStorage.removeItem('trivia_session_id')
              localStorage.removeItem('trivia_player_name')
              socket.disconnect()
              return
            }

            captureAnalyticsEvent('reconnection_attempted', {
              result: 'succeeded',
              session_status: mapSessionStatus(res.sessionStatus),
            })
            setLang(res.language || lang)
            setRole('PLAYER')
            setSessionId(savedSessionId)
            setPlayerName(res.playerName || savedName)

            if (res.sessionStatus === 'LOBBY') {
              setScreen('LOBBY')
            } else if (res.sessionStatus === 'FINISHED') {
              setScreen('INITIAL')
              localStorage.removeItem('trivia_session_id')
              localStorage.removeItem('trivia_player_name')
              socket.disconnect()
            } else if (res.currentQuestion && res.sessionStatus) {
              // En medio de una ronda: restaurar estado de juego
              setCurrentQuestion(res.currentQuestion)
              setCurrentQuestionNumber(res.currentQuestionIndex || 0)
              setTotalQuestions(res.totalQuestions || 0)
              setHasAnswered(res.hasAnsweredCurrentQuestion || false)

              const elapsed = res.timeElapsedSeconds || 0
              const duration = res.phaseDurationSeconds || 0
              setTimeLeft(Math.max(0, duration - elapsed))

              if (res.sessionStatus === 'REVEALING' && res.correctOptionIndex !== undefined) {
                setGamePhase('REVEALING')
                setCorrectIndex(res.correctOptionIndex)
              } else {
                setGamePhase(res.sessionStatus as 'READING' | 'ANSWERING')
                if (res.sessionStatus === 'ANSWERING') {
                  phaseStartTimestamp.current = Date.now() - elapsed * 1000
                }
              }
              setScreen('GAME')
            }
          }
        )
      }
    }
  }, [])

  // Temporizador regresivo en UI
  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft])

  // Sincronizar eventos socket
  useEffect(() => {
    socket.on('lobby:update', (payload: LobbyUpdatePayload) => {
      if (payload.sessionId.toUpperCase() === sessionId.toUpperCase()) {
        setPlayers(payload.players)
      }
    });

    socket.on('round:start', (payload: RoundStartPayload) => {
      if (payload.status === 'READING' && gameStartedAt.current === null) {
        gameStartedAt.current = Date.now()
        captureAnalyticsEvent('game_started', {
          question_count_bucket: bucketQuestionCount(payload.totalQuestions),
          player_count_bucket: bucketPlayerCount(players.length),
          language: lang,
        })
      }
      setScreen('GAME')
      setGamePhase(payload.status)
      setCurrentQuestion(payload.question)
      setCurrentQuestionNumber(payload.currentQuestionIndex)
      setTotalQuestions(payload.totalQuestions)
      setTimeLeft(payload.durationSeconds)
      
      if (payload.status === 'READING') {
        setHasAnswered(false)
        setSelectedOption(null)
        selectedOptionRef.current = null  // limpiar ref al iniciar nueva ronda
        setCorrectIndex(null)
        setRevealFunFact('')
        setAnswerStats(null)
      } else if (payload.status === 'ANSWERING') {
        phaseStartTimestamp.current = Date.now()
      }
    });

    socket.on('answers:reveal', (payload: AnswersRevealPayload) => {
      setGamePhase('REVEALING')
      setCorrectIndex(payload.correctOptionIndex)
      setRevealFunFact(payload.funFact || '')
      setAnswerStats(payload.stats.optionCounts)
      setTimeLeft(config.revealTime)

      // Usar ref en lugar de state para evitar stale closure
      const selected = selectedOptionRef.current
      if (selected !== null) {
        if (selected === payload.correctOptionIndex) {
          sounds.playCorrect();
        } else {
          sounds.playIncorrect();
        }
      }
    });

    socket.on('scoreboard:update', (payload: ScoreboardUpdatePayload) => {
      setScoreboard(payload.players)
    });

    socket.on('game:finished', (payload: GameFinishedPayload) => {
      captureAnalyticsEvent('game_finished', {
        duration_bucket: bucketDuration(gameStartedAt.current ? Date.now() - gameStartedAt.current : 0),
        question_count_bucket: bucketQuestionCount(totalQuestions),
        player_count_bucket: bucketPlayerCount(players.length),
      })
      gameStartedAt.current = null
      setGamePhase('FINISHED')
      setPodium(payload.podium)
      sounds.playVictory();
    });

    socket.on('connect_error', (error) => {
      captureAnalyticsEvent('reconnection_attempted', {
        result: 'failed',
        session_status: 'unknown',
      })
      Sentry.captureException(error, { tags: { operation: 'socket_connect' } })
      setErrorMsg(t('errorConnect'))
    })

    socket.on('error:join', (err: { message: string }) => {
      setErrorMsg(err.message)
    })

    return () => {
      socket.off('lobby:update')
      socket.off('round:start')
      socket.off('answers:reveal')
      socket.off('scoreboard:update')
      socket.off('game:finished')
      socket.off('connect_error')
      socket.off('error:join')
    }
  }, [sessionId, config.revealTime, players.length, lang, totalQuestions])

  // Helper para URL dinámica del servidor (Desarrollo / Proxy / Producción)
  const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    }
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  };

  // Crear la sesión en el Backend
  const handleCreateSession = async () => {
    try {
      setErrorMsg('')
      const response = await fetch(`${getApiUrl()}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, questions, language: lang })
      })

      if (!response.ok) {
        captureAnalyticsEvent('session_creation_failed', {
          error_category: mapErrorCategory(response.status),
          language: lang,
        })
        const errorData = await response.json().catch(() => ({}))
        setErrorMsg(errorData.error || t('errorCreateSession'))
        return
      }

      const session = await response.json()
      captureAnalyticsEvent('session_creation_succeeded', {
        language: lang,
        question_count_bucket: bucketQuestionCount(questions.length),
      })
      setSessionId(session.id)
      
      socket.connect()
      socket.emit('host:joinSession', { sessionId: session.id })
      setScreen('LOBBY')
    } catch (err: unknown) {
      captureAnalyticsEvent('session_creation_failed', {
        error_category: mapErrorCategory(undefined, err),
        language: lang,
      })
      Sentry.captureException(err, { tags: { operation: 'session_creation_request' } })
      setErrorMsg(err instanceof Error ? err.message : t('errorNetworkSession'))
    }
  }

  // Unirse a la sesión
  const handleJoinSession = () => {
    if (!sessionId.trim() || !playerName.trim()) {
      captureAnalyticsEvent('session_join_failed', { error_category: 'validation', language: lang })
      setErrorMsg(t('validationCodeAndNickname'))
      return;
    }
    setErrorMsg('')
    socket.connect()
    
    const joinPayload: PlayerJoinPayload = {
      sessionId: sessionId.trim().toUpperCase(),
      name: playerName.trim(),
      localUuid: playerUuid
    }

    socket.emit('player:join', joinPayload, (res: { success: boolean; error?: string; language?: 'es' | 'en' }) => {
      if (res.success) {
        captureAnalyticsEvent('session_join_succeeded', { language: res.language || lang })
        setLang(res.language || lang)
        // Persistir sesión y nombre para reconexión automática
        localStorage.setItem('trivia_session_id', sessionId.trim().toUpperCase())
        localStorage.setItem('trivia_player_name', playerName.trim())
        setScreen('LOBBY')
      } else if (res.error) {
        captureAnalyticsEvent('session_join_failed', { error_category: 'rejected', language: lang })
        setErrorMsg(res.error)
        socket.disconnect()
      }
    })
  }

  // Iniciar el juego (Host)
  const handleStartGame = () => {
    socket.emit('host:startGame', { sessionId })
  }

  // Enviar respuesta (Jugador)
  const handleSelectOption = (index: number) => {
    if (hasAnswered || gamePhase !== 'ANSWERING') return;

    setSelectedOption(index)
    selectedOptionRef.current = index  // mantener ref actualizado
    setHasAnswered(true)

    const responseTimeMs = Date.now() - phaseStartTimestamp.current;

    captureAnalyticsEvent('answer_submitted', {
      response_time_bucket: bucketResponseTime(responseTimeMs),
      question_number_bucket: bucketQuestionCount(currentQuestionNumber),
    })

    socket.emit('player:answer', {
      sessionId,
      questionId: currentQuestion?.id || '',
      selectedOptionIndex: index,
      responseTimeMs
    })
  }

  const resetAll = () => {
    socket.disconnect()
    localStorage.removeItem('trivia_session_id')
    localStorage.removeItem('trivia_player_name')
    setRole(null)
    setScreen('INITIAL')
    setSessionId('')
    setPlayers([])
    setErrorMsg('')
    setPlayerName('')
    setCurrentQuestion(null)
    setHasAnswered(false)
    setSelectedOption(null)
    selectedOptionRef.current = null
    setCorrectIndex(null)
    setAnswerStats(null)
    setScoreboard([])
    setPodium([])
    gameStartedAt.current = null
  }

  // Colores premium para botones
  const optionColors = [
    'from-red-500 to-rose-600 shadow-red-500/25 hover:from-red-600 hover:to-rose-700',
    'from-blue-500 to-indigo-600 shadow-blue-500/25 hover:from-blue-600 hover:to-indigo-700',
    'from-yellow-500 to-amber-600 shadow-yellow-500/25 hover:from-yellow-600 hover:to-amber-700',
    'from-green-500 to-emerald-600 shadow-green-500/25 hover:from-green-600 hover:to-emerald-700'
  ]

  const optionLetters = ['▲ A', '◆ B', '● C', '■ D']

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-900 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 py-4 px-6 flex justify-between items-center bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={resetAll}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
            T
          </div>
          <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            {t('appName')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Language toggle */}
          <div className="flex items-center rounded-lg border border-slate-700 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => handleLanguageChange('es')}
              disabled={Boolean(sessionId && screen !== 'INITIAL')}
              className={`px-2.5 py-1 transition-colors ${
                lang === 'es'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              ES
            </button>
            <button
              onClick={() => handleLanguageChange('en')}
              disabled={Boolean(sessionId && screen !== 'INITIAL')}
              className={`px-2.5 py-1 transition-colors ${
                lang === 'en'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              EN
            </button>
          </div>
          {role && (
            <button 
              onClick={resetAll}
              className="text-xs py-1 px-3 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors"
            >
              {t('exit')}
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full">

        {errorMsg && (
          <div className="w-full max-w-md mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-center text-sm font-medium">
            {errorMsg}
          </div>
        )}

        {/* 1. INITIAL SCREEN */}
        {screen === 'INITIAL' && (
          <div className="w-full max-w-3xl flex flex-col items-center">
            <div className="text-center space-y-6 mb-12">
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                {t('heroTitle')}
              </h1>
              <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto">
                {t('heroSubtitle')}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 w-full">
              <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/40 transition-all duration-300 flex flex-col justify-between group shadow-xl">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 3m0-3a2 2 0 110 3m-9 8h10M3 5h10M9 3v2m1.248 11.248a6 6 0 11-8.486 0M3 9h.01M9 9h.01M3 12h.01M9 12h.01M3 15h.01M9 15h.01M3 18h.01M9 18h.01" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">{t('createGame')}</h2>
                  <p className="text-slate-400 mb-6 text-sm">
                    {t('createGameDesc')}
                  </p>
                </div>
                <button 
                  onClick={() => handleRoleSelected('host')}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 font-semibold text-white transition-all shadow-lg shadow-indigo-500/25 active:scale-95"
                >
                  {t('createGameBtn')}
                </button>
              </div>

              <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-6 hover:border-violet-500/40 transition-all duration-300 flex flex-col justify-between group shadow-xl">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">{t('joinGame')}</h2>
                  <p className="text-slate-400 mb-6 text-sm">
                    {t('joinGameDesc')}
                  </p>
                </div>
                <button 
                  onClick={() => handleRoleSelected('player')}
                  className="w-full py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 font-semibold text-white transition-all active:scale-95"
                >
                  {t('joinGameBtn')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. HOST CONFIGURATION SCREEN */}
        {screen === 'HOST_CONFIG' && (
          <div className="w-full max-w-2xl bg-slate-800/40 border border-slate-800 rounded-2xl p-4 sm:p-8 shadow-xl">
            <h2 className="text-3xl font-extrabold text-white mb-6 bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              {t('triviaConfig')}
            </h2>
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('maxScore')}</label>
                  <input 
                    type="number" 
                    value={config.maxScore}
                    onChange={(e) => setConfig({ ...config, maxScore: parseInt(e.target.value) || 1000 })}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-950 border border-slate-700 focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('readTime')}</label>
                  <input 
                    type="number" 
                    value={config.readTime}
                    onChange={(e) => setConfig({ ...config, readTime: parseInt(e.target.value) || 5 })}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-950 border border-slate-700 focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('answerTime')}</label>
                  <input 
                    type="number" 
                    value={config.answerTime}
                    onChange={(e) => setConfig({ ...config, answerTime: parseInt(e.target.value) || 20 })}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-950 border border-slate-700 focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('revealTime')}</label>
                  <input 
                    type="number" 
                    value={config.revealTime}
                    onChange={(e) => setConfig({ ...config, revealTime: parseInt(e.target.value) || 5 })}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-950 border border-slate-700 focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>
              </div>

              <div>
                {/* Header: título + botones de plantilla, importar y agregar */}
                <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
                  <h3 className="text-lg font-bold text-white">{t('questions')} ({questions.length})</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsTemplateMenuOpen((open) => !open)}
                        className="py-1.5 px-2.5 rounded-lg border border-slate-700 bg-slate-950/60 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-all"
                        aria-expanded={isTemplateMenuOpen}
                        aria-haspopup="menu"
                      >
                        📥 {t('templates')} ▾
                      </button>

                      {isTemplateMenuOpen && (
                        <div className="absolute left-0 top-full z-20 mt-2 min-w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl" role="menu">
                          <button
                            type="button"
                            onClick={() => { handleDownloadJSONTemplate(); setIsTemplateMenuOpen(false) }}
                            className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-slate-800"
                            title={t('downloadJsonTitle')}
                            role="menuitem"
                          >
                            {t('downloadJsonTemplate')}
                          </button>
                          <button
                            type="button"
                            onClick={() => { handleDownloadCSVTemplate(); setIsTemplateMenuOpen(false) }}
                            className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-slate-800"
                            title={t('downloadCsvTitle')}
                            role="menuitem"
                          >
                            {t('downloadCsvTemplate')}
                          </button>
                        </div>
                      )}
                    </div>

                    <label className="py-1.5 px-3 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-xs font-semibold text-violet-300 cursor-pointer transition-all active:scale-95 flex items-center gap-1">
                      <span>📂</span> {t('importQuestions')}
                      <input
                        type="file"
                        accept=".json,.csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleOpenAddQuestion}
                      className="py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white transition-all active:scale-95 flex items-center gap-1 shadow-md shadow-indigo-500/20"
                    >
                      <span>+</span> {t('addQuestion')}
                    </button>
                  </div>
                </div>

                {/* Lista de preguntas */}
                <div className="max-h-72 overflow-y-auto space-y-3 pr-2">
                  {questions.map((q, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start">
                          <p className="min-w-0 flex-1 break-words font-semibold text-slate-100 text-sm">{idx + 1}. {q.text}</p>
                          <div className="flex gap-2 shrink-0 self-end sm:self-start">
                            <button
                              onClick={() => handleOpenEditQuestion(idx)}
                              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                            >
                              {t('edit')}
                            </button>
                            <button
                              onClick={() => handleDeleteQuestion(idx)}
                              className="text-xs px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                            >
                              {t('delete')}
                            </button>
                          </div>
                        </div>

                        {q.imageUrl && (
                          <p className="text-xs text-slate-500 truncate mt-1">🖼️ {q.imageUrl}</p>
                        )}
                        {q.funFact && (
                          <p className="text-xs text-indigo-400/70 truncate mt-1">💡 {q.funFact}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                        {q.options.map((opt, oIdx) => (
                          <div
                            key={oIdx}
                            className={`px-2.5 py-1.5 rounded border ${
                              oIdx === q.correctOptionIndex
                                ? 'bg-green-500/10 border-green-500/40 text-green-300 font-bold'
                                : 'bg-slate-900/60 border-slate-800 text-slate-400'
                            }`}
                          >
                            <span className="opacity-60 mr-1">{['A', 'B', 'C', 'D'][oIdx]}:</span> {opt}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Botones de exportación debajo de la lista */}
                <div className="relative mt-3 inline-block">
                  <button
                    type="button"
                    onClick={() => setIsExportMenuOpen((open) => !open)}
                    className="py-1.5 px-3 rounded-lg border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/50 text-xs font-medium text-indigo-200 transition-all"
                    aria-expanded={isExportMenuOpen}
                    aria-haspopup="menu"
                  >
                    📤 {t('exportData')} ▾
                  </button>

                  {isExportMenuOpen && (
                    <div className="absolute left-0 bottom-full z-20 mb-2 min-w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl" role="menu">
                      <button
                        type="button"
                        onClick={() => { handleExportJSON(); setIsExportMenuOpen(false) }}
                        className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-slate-800"
                        title={t('exportJsonTitle')}
                        role="menuitem"
                      >
                        {t('exportJson')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { handleExportCSV(); setIsExportMenuOpen(false) }}
                        className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-slate-800"
                        title={t('exportCsvTitle')}
                        role="menuitem"
                      >
                        {t('exportCsv')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <button 
                  onClick={() => setScreen('INITIAL')}
                  className="w-full min-w-0 py-3 px-4 rounded-xl border border-slate-700 text-slate-300 font-semibold hover:bg-slate-800 transition-all active:scale-95"
                >
                  {t('back')}
                </button>
                <button 
                  onClick={handleCreateSession}
                  className="w-full min-w-0 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 font-semibold text-white transition-all shadow-lg shadow-indigo-500/25 active:scale-95"
                >
                  {t('createGameAction')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL EDICIÓN / CREACIÓN DE PREGUNTA */}
        {isQuestionModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-xl shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-xl font-bold text-white">
                  {editingQuestionIndex !== null ? `${t('editQuestion')} #${editingQuestionIndex + 1}` : t('newQuestion')}
                </h3>
                <button 
                  onClick={() => setIsQuestionModalOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('questionText')}</label>
                  <input
                    type="text"
                    value={draftQuestion.text}
                    onChange={(e) => setDraftQuestion({ ...draftQuestion, text: e.target.value })}
                    placeholder={t('questionTextPlaceholder')}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-950 border border-slate-700 focus:outline-none focus:border-indigo-500 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('imageUrl')}</label>
                  <input
                    type="text"
                    value={draftQuestion.imageUrl || ''}
                    onChange={(e) => setDraftQuestion({ ...draftQuestion, imageUrl: e.target.value })}
                    placeholder={t('imageUrlPlaceholder')}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-950 border border-slate-700 focus:outline-none focus:border-indigo-500 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    {t('funFact')}
                  </label>
                  <textarea
                    value={draftQuestion.funFact || ''}
                    onChange={(e) => setDraftQuestion({ ...draftQuestion, funFact: e.target.value })}
                    placeholder={t('funFactPlaceholder')}
                    rows={2}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-950 border border-slate-700 focus:outline-none focus:border-indigo-500 text-white text-sm resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    {t('answerOptions')}
                  </label>
                  <div className="space-y-2.5">
                    {draftQuestion.options.map((opt, oIdx) => {
                      const isCorrect = draftQuestion.correctOptionIndex === oIdx;
                      return (
                        <div key={oIdx} className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setDraftQuestion({ ...draftQuestion, correctOptionIndex: oIdx })}
                            className={`w-7 h-7 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 transition-all ${
                              isCorrect 
                                ? 'bg-green-500 border-green-400 text-white shadow-lg shadow-green-500/30' 
                                : 'bg-slate-950 border-slate-700 text-slate-500 hover:border-slate-500'
                            }`}
                          >
                            {isCorrect ? '✓' : ['A', 'B', 'C', 'D'][oIdx]}
                          </button>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...draftQuestion.options] as [string, string, string, string];
                              newOpts[oIdx] = e.target.value;
                              setDraftQuestion({ ...draftQuestion, options: newOpts });
                            }}
                            placeholder={`${t('optionPlaceholder')} ${['A', 'B', 'C', 'D'][oIdx]}`}
                            className={`w-full py-2 px-3 rounded-lg bg-slate-950 border text-sm text-white focus:outline-none ${
                              isCorrect ? 'border-green-500/50 bg-green-500/5' : 'border-slate-800 focus:border-indigo-500'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsQuestionModalOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 text-slate-300 font-semibold hover:bg-slate-800 text-sm transition-all"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraftQuestion}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 font-semibold text-white text-sm transition-all shadow-md shadow-indigo-500/25"
                >
                  {t('saveQuestion')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. PLAYER JOIN SCREEN */}
        {screen === 'PLAYER_JOIN' && (
          <div className="w-full max-w-md bg-slate-800/40 border border-slate-800 rounded-2xl p-8 shadow-xl">
            <h2 className="text-3xl font-extrabold text-white mb-6 text-center bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              {t('joinTitle')}
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('gameCode')}</label>
                <input
                  type="text"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                  placeholder={t('gameCodePlaceholder')}
                  maxLength={6}
                  className="w-full py-3 px-4 rounded-xl bg-slate-950 border border-slate-700 text-center tracking-widest text-lg font-mono placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:border-violet-500 text-white uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('yourNickname')}</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder={t('nicknamePlaceholder')}
                  className="w-full py-3 px-4 rounded-xl bg-slate-950 border border-slate-700 text-center focus:outline-none focus:border-violet-500 text-white"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setScreen('INITIAL')}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-700 text-slate-300 font-semibold hover:bg-slate-800 transition-all active:scale-95"
                >
                  {t('back')}
                </button>
                <button
                  onClick={handleJoinSession}
                  className="flex-1 py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 font-semibold text-white transition-all active:scale-95"
                >
                  {t('join')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. LOBBY SCREEN */}
        {screen === 'LOBBY' && (
          <div className="w-full max-w-xl bg-slate-800/40 border border-slate-800 rounded-2xl p-8 shadow-xl text-center space-y-8">
            <div>
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider block mb-1">
                {t('lobbyLabel')}
              </span>
              <h2 className="text-5xl font-mono font-bold text-white tracking-wider">
                {sessionId}
              </h2>
              <p className="text-xs text-slate-500 mt-2 mb-4">
                {t('lobbyScanHint')}
              </p>

              {role === 'HOST' && (
                <div className="flex justify-center p-3 bg-white rounded-2xl w-fit mx-auto shadow-lg border border-slate-700">
                  <QRCodeSVG 
                    value={`${window.location.origin}?session=${sessionId}`} 
                    size={140}
                    level="H"
                  />
                </div>
              )}
            </div>

            {/* Players Connected */}
            <div className="border border-slate-800 rounded-xl p-4 bg-slate-950/40">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 text-left">
                {t('playersInLobby')} ({players.length})
              </h3>
              {players.length === 0 ? (
                <p className="text-sm text-slate-500 py-6">{t('waitingForPlayers')}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {players.map((p, idx) => (
                    <div 
                      key={idx} 
                      className={`flex items-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium ${
                        p.isConnected 
                          ? 'bg-slate-900 border-indigo-500/20 text-slate-200' 
                          : 'bg-slate-900/40 border-slate-800 text-slate-600'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${p.isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                      {p.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons depending on Role */}
            <div>
              {role === 'HOST' ? (
                <button 
                  onClick={handleStartGame}
                  disabled={players.length === 0}
                  className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 font-bold text-white transition-all shadow-lg shadow-indigo-500/25 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {t('startGame')}
                </button>
              ) : (
                <div className="flex flex-col items-center justify-center py-4 space-y-2">
                  <div className="w-5 h-5 border-2 border-t-transparent border-violet-500 rounded-full animate-spin" />
                  <p className="text-sm text-slate-400 font-medium">
                    {t('waitingForHost')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. GAME SCREEN */}
        {screen === 'GAME' && currentQuestion && (
          <div className="w-full max-w-2xl space-y-6">
            
            {/* Header info */}
            <div className="flex justify-between items-center text-sm font-semibold uppercase tracking-wider text-slate-400">
              <div>{t('question')} {currentQuestionNumber} {t('of')} {totalQuestions}</div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping" />
                {t('phase')}: {gamePhase}
              </div>
            </div>

            {/* Timers & Questions */}
            {gamePhase !== 'FINISHED' && (
              <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl text-center space-y-6 relative overflow-hidden">
                {/* Visual Timer bar */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-950">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-1000 ease-linear"
                    style={{ 
                      width: `${(timeLeft / (gamePhase === 'READING' ? config.readTime : gamePhase === 'ANSWERING' ? config.answerTime : config.revealTime)) * 100}%` 
                    }}
                  />
                </div>

                <div className="flex justify-between items-center">
                  <div className="w-12 h-12 rounded-full border-2 border-slate-700 flex items-center justify-center font-bold text-lg text-slate-300">
                    {timeLeft}s
                  </div>
                  {gamePhase === 'READING' && (
                    <span className="text-sm px-3 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold animate-pulse">
                      {t('readNow')}
                    </span>
                  )}
                  {gamePhase === 'ANSWERING' && (
                    <span className="text-sm px-3 py-1 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-semibold">
                      {t('answerNow')}
                    </span>
                  )}
                  {gamePhase === 'REVEALING' && (
                    <span className="text-sm px-3 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-semibold">
                      {t('results')}
                    </span>
                  )}
                </div>

                <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                  {currentQuestion.text}
                </h2>
              </div>
            )}

            {/* HOST VIEW */}
            {role === 'HOST' && gamePhase !== 'FINISHED' && (
              <div className="space-y-6">
                {/* Shuffled Options displayed on Host Screen (Read-Only) */}
                <div className="grid grid-cols-2 gap-4">
                  {currentQuestion.options.map((opt, idx) => {
                    const isCorrect = gamePhase === 'REVEALING' && idx === correctIndex;
                    const totalVotes = answerStats ? answerStats.reduce((a, b) => a + b, 0) : 0;
                    const voteCount = answerStats ? answerStats[idx] : 0;
                    const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

                    return (
                      <div 
                        key={idx} 
                        className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all relative overflow-hidden ${
                          isCorrect 
                            ? 'bg-green-500/10 border-green-500 text-green-300 font-bold' 
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        {/* Background Percentage Bar */}
                        {gamePhase === 'REVEALING' && (
                          <div 
                            className={`absolute bottom-0 left-0 top-0 opacity-15 transition-all duration-1000 ${
                              isCorrect ? 'bg-green-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        )}

                        <div className="flex justify-between items-center z-10">
                          <div>
                            <span className="text-xs font-semibold text-slate-500 mr-2">{optionLetters[idx]}</span>
                            {opt}
                          </div>
                          {answerStats && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-slate-400">{percentage}%</span>
                              <span className="bg-slate-800 text-slate-300 font-mono text-xs px-2.5 py-1 rounded-md">
                                {voteCount}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Fun Fact during Reveal — Host */}
                {gamePhase === 'REVEALING' && revealFunFact && (
                  <div className="animate-pop-in bg-indigo-950/50 border border-indigo-500/30 rounded-2xl p-5 shadow-lg">
                    <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">{t('didYouKnow')}</p>
                    <p className="text-slate-200 text-sm leading-relaxed">{revealFunFact}</p>
                  </div>
                )}

                {/* Scoreboard displayed on Host Screen during Reveal */}
                {gamePhase === 'REVEALING' && (
                  <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                      {t('scoreboard')}
                    </h3>
                    <div className="space-y-2">
                      {scoreboard.map((p, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-slate-500 text-sm">#{p.rank}</span>
                            <span className="font-bold text-slate-200">{p.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {p.lastRoundPoints > 0 && (
                              <span className="text-xs text-green-400 font-bold">+{p.lastRoundPoints}</span>
                            )}
                            <span className="font-bold text-indigo-400">{p.score} pts</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PLAYER VIEW */}
            {role === 'PLAYER' && gamePhase !== 'FINISHED' && (
              <div className="space-y-6">
                {/* Options clickable only in ANSWERING phase */}
                <div className="grid grid-cols-2 gap-4">
                  {currentQuestion.options.map((opt, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrect = gamePhase === 'REVEALING' && idx === correctIndex;
                    const isWrongSelection = gamePhase === 'REVEALING' && isSelected && !isCorrect;

                    let btnClass = `relative overflow-hidden py-6 px-4 rounded-2xl font-bold text-lg text-white shadow-lg transition-all duration-200 active:scale-95 flex flex-col items-center justify-center gap-2 border bg-gradient-to-r ${optionColors[idx]}`;
                    
                    if (gamePhase === 'READING') {
                      btnClass = 'bg-slate-800/50 border-slate-800 text-slate-500 cursor-not-allowed py-6 px-4 rounded-2xl flex flex-col items-center justify-center gap-2';
                    } else if (hasAnswered && gamePhase === 'ANSWERING') {
                      btnClass = isSelected 
                        ? 'bg-indigo-600 border-indigo-400 text-white py-6 px-4 rounded-2xl flex flex-col items-center justify-center gap-2 animate-pulse' 
                        : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed py-6 px-4 rounded-2xl flex flex-col items-center justify-center gap-2';
                    } else if (gamePhase === 'REVEALING') {
                      if (isCorrect) {
                        btnClass = 'bg-green-600 border-green-400 text-white py-6 px-4 rounded-2xl flex flex-col items-center justify-center gap-2 font-extrabold';
                      } else if (isWrongSelection) {
                        btnClass = 'bg-red-600 border-red-400 text-white py-6 px-4 rounded-2xl flex flex-col items-center justify-center gap-2';
                      } else {
                        btnClass = 'bg-slate-900 border-slate-800 text-slate-700 py-6 px-4 rounded-2xl flex flex-col items-center justify-center gap-2';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectOption(idx)}
                        disabled={hasAnswered || gamePhase !== 'ANSWERING'}
                        className={btnClass}
                      >
                        <span className="text-xs uppercase tracking-wider opacity-60">{optionLetters[idx]}</span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Display answer status during reveal */}
                {gamePhase === 'REVEALING' && (
                  <div className="animate-pop-in text-center p-6 rounded-2xl border bg-slate-950/40 border-slate-800">
                    {selectedOption === null ? (
                      <div className="animate-pop-in">
                        <p className="text-4xl mb-2">⏱️</p>
                        <p className="text-yellow-400 font-extrabold text-xl">{t('timeUp')}</p>
                        <p className="text-slate-400 text-sm mt-1">{t('timeUpAnswer')} <span className="text-white font-bold">{currentQuestion.options[correctIndex!]}</span></p>
                      </div>
                    ) : selectedOption === correctIndex ? (
                      <div className="animate-pop-in">
                        <p className="text-5xl mb-2">🎉</p>
                        <p className="text-green-400 font-extrabold text-2xl tracking-tight">{t('correct')}</p>
                        <p className="text-slate-400 text-sm mt-1">{t('correctPoints')}</p>
                      </div>
                    ) : (
                      <div className="animate-pop-in">
                        <p className="text-5xl mb-2">💥</p>
                        <p className="text-red-400 font-extrabold text-2xl tracking-tight">{t('incorrect')}</p>
                        <p className="text-slate-400 text-sm mt-1">{t('incorrectAnswer')} <span className="text-green-400 font-bold">{currentQuestion.options[correctIndex!]}</span></p>
                      </div>
                    )}
                    {revealFunFact && (
                      <div className="mt-4 pt-4 border-t border-slate-700 animate-pop-in" style={{ animationDelay: '0.3s' }}>
                        <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1">{t('didYouKnow')}</p>
                        <p className="text-slate-300 text-sm leading-relaxed">{revealFunFact}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* FINISHED / PODIUM SCREEN (Both Host & Player see final podium) */}
            {gamePhase === 'FINISHED' && (
              <div className="relative overflow-hidden bg-slate-800/40 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-8 max-w-md mx-auto">

                {/* Confetti particles */}
                {['🎊','🎉','⭐','✨','🏆','🎊','🎉','⭐','✨','🌟'].map((emoji, i) => (
                  <span
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${(i * 11) % 100}%`,
                      top: '-20px',
                      fontSize: `${14 + (i % 3) * 4}px`,
                      animation: `confettiFall ${2.5 + (i % 3) * 0.7}s ${i * 0.25}s ease-in forwards`,
                      pointerEvents: 'none',
                      zIndex: 0
                    }}
                  >
                    {emoji}
                  </span>
                ))}

                <div className="relative z-10">
                  <span className="text-xs font-semibold text-yellow-400 uppercase tracking-wider block mb-1">
                    {t('gameFinished')}
                  </span>
                  <h2 className="text-4xl font-extrabold text-white animate-pop-in">
                    {t('podium')}
                  </h2>
                </div>

                {/* Podium visualization */}
                <div className="relative z-10 flex items-end justify-center gap-4 py-4">
                  {/* 2nd Place */}
                  {podium[1] && (
                    <div className="flex flex-col items-center animate-rise-2">
                      <span className="text-sm text-slate-300 font-bold mb-1 truncate max-w-[80px]">{podium[1].name}</span>
                      <div className="w-20 bg-gradient-to-t from-slate-600 to-slate-400 h-24 rounded-t-xl flex flex-col items-center justify-center text-white font-bold text-xl shadow-lg">
                        <span>🥈</span>
                        <span className="text-xs font-mono mt-1 text-slate-200">{podium[1].score}</span>
                      </div>
                    </div>
                  )}

                  {/* 1st Place */}
                  {podium[0] && (
                    <div className="flex flex-col items-center animate-rise-1">
                      <span className="text-sm text-yellow-300 font-extrabold mb-1 truncate max-w-[90px]">{podium[0].name}</span>
                      <div className="w-24 bg-gradient-to-t from-amber-600 to-yellow-400 h-36 rounded-t-xl flex flex-col items-center justify-center text-white font-black text-2xl shadow-2xl border-t-2 border-yellow-300 animate-winner-glow">
                        <span>👑</span>
                        <span className="text-xs font-mono mt-1">{podium[0].score}</span>
                      </div>
                    </div>
                  )}

                  {/* 3rd Place */}
                  {podium[2] && (
                    <div className="flex flex-col items-center animate-rise-3">
                      <span className="text-sm text-amber-500 font-bold mb-1 truncate max-w-[80px]">{podium[2].name}</span>
                      <div className="w-20 bg-gradient-to-t from-amber-900 to-amber-700 h-16 rounded-t-xl flex flex-col items-center justify-center text-white font-bold text-lg shadow-lg">
                        <span>🥉</span>
                        <span className="text-xs font-mono mt-1">{podium[2].score}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Remaining players list */}
                {podium.length > 3 && (
                  <div className="relative z-10 text-left space-y-2 max-h-40 overflow-y-auto border-t border-slate-800 pt-4">
                    {podium.slice(3).map((p, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-500">#{p.rank}</span>
                          <span className="text-slate-300">{p.name}</span>
                        </div>
                        <span className="font-bold text-indigo-400">{p.score} pts</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={resetAll}
                  className="relative z-10 w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 font-bold text-white transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                >
                  {t('backToMenu')}
                </button>
              </div>
            )}

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} {t('footerText')}
      </footer>

      {isAnalyticsConfigured() && isAnalyticsConsentRequired() && analyticsConsent === null && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 rounded-xl border border-indigo-500/30 bg-slate-900/95 p-4 text-sm text-slate-200 shadow-2xl backdrop-blur">
          <p className="mb-3">{t('analyticsConsentMessage')}</p>
          <div className="flex gap-3">
            <button onClick={() => handleAnalyticsConsent('accepted')} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white hover:bg-indigo-700">
              {t('analyticsAllow')}
            </button>
            <button onClick={() => handleAnalyticsConsent('declined')} className="rounded-lg border border-slate-600 px-3 py-2 font-semibold text-slate-300 hover:bg-slate-800">
              {t('analyticsDecline')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
