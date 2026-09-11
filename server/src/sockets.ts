import { Server, Socket } from 'socket.io';
import * as Sentry from '@sentry/node';
import { getSession, getAllSessions } from './store';
import { 
  PlayerJoinPayload, 
  PlayerReconnectPayload,
  ReconnectResponsePayload,
  LobbyUpdatePayload, 
  Player, 
  HostStartGamePayload, 
  PlayerAnswerPayload, 
  RoundStartPayload,
  AnswersRevealPayload,
  ScoreboardUpdatePayload,
  GameFinishedPayload
} from '../../shared/types';

// Almacén para el estado temporal de las rondas en juego
interface RoundState {
  correctOptionIndex: number; // Índice correcto de la opción mezclada
  shuffledOptions: [string, string, string, string];
  answers: Map<string, { selectedOptionIndex: number; pointsObtained: number; responseTimeMs: number }>;
  phaseTimer?: NodeJS.Timeout;
  phaseEndTimestamp?: number;
}

const activeRounds: Map<string, RoundState> = new Map();

export function setupSockets(io: Server) {
  
  // Función auxiliar para transicionar fases del juego
  function runGameCycle(sessionId: string) {
    const session = getSession(sessionId);
    if (!session || session.status === 'FINISHED') return;

    const currentIdx = session.currentQuestionIndex;
    const question = session.questions[currentIdx];

    if (!question) {
      // No hay más preguntas, finalizar juego
      session.status = 'FINISHED';
      
      // Ordenar podio
      const sortedPlayers = [...session.players].sort((a, b) => b.score - a.score);
      const podium = sortedPlayers.slice(0, 10).map((p, idx) => ({
        name: p.name,
        score: p.score,
        rank: idx + 1
      }));

      const finishPayload: GameFinishedPayload = { podium };
      io.to(sessionId).emit('game:finished', finishPayload);
      activeRounds.delete(sessionId);
      return;
    }

    // --- 1. FASE DE LECTURA (READING) ---
    session.status = 'READING';
    session.roundStartTime = Date.now();
    
    // Mezclar respuestas por defecto para la ronda
    const shuffledOptions = [...question.options] as [string, string, string, string];
    const correctText = question.options[question.correctOptionIndex];
    // Mezclar
    for (let i = shuffledOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffledOptions[i];
      shuffledOptions[i] = shuffledOptions[j];
      shuffledOptions[j] = temp;
    }
    const correctOptionIndex = shuffledOptions.indexOf(correctText);

    // Guardar el estado de la ronda
    const roundState: RoundState = {
      correctOptionIndex,
      shuffledOptions,
      answers: new Map()
    };
    activeRounds.set(sessionId, roundState);

    const roundStartPayload: RoundStartPayload = {
      status: 'READING',
      question: {
        id: question.id,
        text: question.text,
        imageUrl: question.imageUrl,
        options: shuffledOptions
      },
      currentQuestionIndex: currentIdx + 1,
      totalQuestions: session.questions.length,
      durationSeconds: session.config.readTime
    };

    io.to(sessionId).emit('round:start', roundStartPayload);

    // Configurar temporizador para pasar a la FASE DE RESPUESTA
    roundState.phaseTimer = setTimeout(() => {
      startAnsweringPhase(sessionId);
    }, session.config.readTime * 1000);
  }

  // --- 2. FASE DE RESPUESTA (ANSWERING) ---
  function startAnsweringPhase(sessionId: string) {
    const session = getSession(sessionId);
    const round = activeRounds.get(sessionId);
    if (!session || !round) return;

    session.status = 'ANSWERING';
    session.roundStartTime = Date.now();
    round.phaseEndTimestamp = Date.now() + session.config.answerTime * 1000;

    const roundStartPayload: RoundStartPayload = {
      status: 'ANSWERING',
      question: {
        id: session.questions[session.currentQuestionIndex].id,
        text: session.questions[session.currentQuestionIndex].text,
        imageUrl: session.questions[session.currentQuestionIndex].imageUrl,
        options: round.shuffledOptions
      },
      currentQuestionIndex: session.currentQuestionIndex + 1,
      totalQuestions: session.questions.length,
      durationSeconds: session.config.answerTime
    };

    io.to(sessionId).emit('round:start', roundStartPayload);

    // Configurar temporizador para pasar a REVELAR respuestas al terminar el tiempo
    round.phaseTimer = setTimeout(() => {
      revealAnswers(sessionId);
    }, session.config.answerTime * 1000);
  }

  // --- 3. FASE DE REVELADO (REVEALING) ---
  function revealAnswers(sessionId: string) {
    const session = getSession(sessionId);
    const round = activeRounds.get(sessionId);
    if (!session || !round) return;

    if (round.phaseTimer) clearTimeout(round.phaseTimer);

    session.status = 'REVEALING';

    // Contar las estadísticas de las respuestas
    const optionCounts: [number, number, number, number] = [0, 0, 0, 0];
    round.answers.forEach((ans) => {
      if (ans.selectedOptionIndex >= 0 && ans.selectedOptionIndex < 4) {
        optionCounts[ans.selectedOptionIndex]++;
      }
    });

    const currentQuestion = session.questions[session.currentQuestionIndex];
    const revealPayload: AnswersRevealPayload = {
      correctOptionIndex: round.correctOptionIndex,
      funFact: currentQuestion.funFact || undefined,
      stats: { optionCounts }
    };

    io.to(sessionId).emit('answers:reveal', revealPayload);

    // Emitir tabla de posiciones de la ronda
    const lastRoundPointsMap = new Map<string, number>();
    round.answers.forEach((ans, playerId) => {
      lastRoundPointsMap.set(playerId, ans.pointsObtained);
    });

    const scoreboard: ScoreboardUpdatePayload = {
      players: session.players
        .map((p) => ({
          name: p.name,
          score: p.score,
          lastRoundPoints: lastRoundPointsMap.get(p.id) || 0,
          rank: 1 // Se recalcula abajo
        }))
        .sort((a, b) => b.score - a.score)
        .map((playerItem, idx) => ({
          ...playerItem,
          rank: idx + 1
        }))
    };

    io.to(sessionId).emit('scoreboard:update', scoreboard);

    // Preparar para la siguiente ronda o finalizar
    session.currentQuestionIndex++;

    round.phaseTimer = setTimeout(() => {
      runGameCycle(sessionId);
    }, session.config.revealTime * 1000);
  }

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Cliente conectado: ${socket.id}`);

    socket.on('error', (error) => {
      Sentry.captureException(error, { tags: { operation: 'socket_server_error' } });
    });

    // Registro/Unión de Host
    socket.on('host:joinSession', (payload: { sessionId: string }) => {
      const { sessionId } = payload;
      const session = getSession(sessionId);

      if (!session) {
        socket.emit('error:sessionNotFound', { message: 'La sesión no existe.' });
        return;
      }

      socket.join(sessionId);
      console.log(`[Socket] Host unido a la sesión: ${sessionId} (Socket: ${socket.id})`);
    });

    // Iniciar partida (Host)
    socket.on('host:startGame', (payload: HostStartGamePayload) => {
      const { sessionId } = payload;
      const session = getSession(sessionId);

      if (!session) {
        socket.emit('error:startGame', { message: 'Sesión no encontrada.' });
        return;
      }

      console.log(`[Socket] Host inició la partida en sesión: ${sessionId}`);
      runGameCycle(sessionId);
    });

    // Reconexión de Jugador via UUID
    socket.on('player:reconnect', (payload: PlayerReconnectPayload, callback?: (response: ReconnectResponsePayload) => void) => {
      const { sessionId, localUuid } = payload;
      const session = getSession(sessionId);

      if (!session) {
        if (callback) callback({ success: false, error: 'La sesión ya no existe.' });
        return;
      }

      const player = session.players.find((p) => p.localUuid === localUuid);

      if (!player) {
        if (callback) callback({ success: false, error: 'Jugador no encontrado en esta sesión.' });
        return;
      }

      // Reasociar socket y marcar como conectado
      player.socketId = socket.id;
      player.isConnected = true;
      socket.join(sessionId);

      console.log(`[Socket] Jugador ${player.name} reconectado a sesión: ${sessionId} (Socket: ${socket.id})`);

      // Emitir actualización del lobby a todos
      const lobbyUpdatePayload: LobbyUpdatePayload = {
        sessionId,
        players: session.players.map((p) => ({ name: p.name, isConnected: p.isConnected }))
      };
      io.to(sessionId).emit('lobby:update', lobbyUpdatePayload);

      // Construir payload de respuesta con el estado actual del juego
      const round = activeRounds.get(sessionId);
      const currentQ = session.questions[session.currentQuestionIndex];
      const hasAnswered = round ? round.answers.has(player.id) : false;

      // Calcular tiempo restante en la fase actual
      let timeElapsedSeconds = 0;
      let phaseDurationSeconds = 0;

      if (session.roundStartTime) {
        timeElapsedSeconds = Math.floor((Date.now() - session.roundStartTime) / 1000);
        if (session.status === 'READING') phaseDurationSeconds = session.config.readTime;
        else if (session.status === 'ANSWERING') phaseDurationSeconds = session.config.answerTime;
        else if (session.status === 'REVEALING') phaseDurationSeconds = session.config.revealTime;
      }

      const response: ReconnectResponsePayload = {
        success: true,
        playerName: player.name,
        playerScore: player.score,
        language: session.language,
        sessionStatus: session.status,
        currentQuestion: currentQ && round ? {
          id: currentQ.id,
          text: currentQ.text,
          imageUrl: currentQ.imageUrl,
          options: round.shuffledOptions
        } : undefined,
        currentQuestionIndex: session.currentQuestionIndex + 1,
        totalQuestions: session.questions.length,
        timeElapsedSeconds,
        phaseDurationSeconds,
        hasAnsweredCurrentQuestion: hasAnswered,
        correctOptionIndex: session.status === 'REVEALING' && round ? round.correctOptionIndex : undefined
      };

      if (callback) callback(response);
    });

    // Registro/Unión de Jugador
    socket.on('player:join', (payload: PlayerJoinPayload, callback?: (response: { success: boolean; error?: string; language?: 'es' | 'en' }) => void) => {
      const { sessionId, name, localUuid } = payload;
      const session = getSession(sessionId);

      if (!session) {
        const err = 'La sesión de juego no existe.';
        if (callback) callback({ success: false, error: err });
        socket.emit('error:join', { message: err });
        return;
      }

      if (session.status !== 'LOBBY') {
        const err = 'La partida ya ha comenzado.';
        if (callback) callback({ success: false, error: err });
        socket.emit('error:join', { message: err });
        return;
      }

      // Validar nombre único
      const nameExists = session.players.some(
        (p) => p.name.toLowerCase() === name.trim().toLowerCase() && p.isConnected
      );
      if (nameExists) {
        const err = 'Este nombre ya está en uso en esta partida.';
        if (callback) callback({ success: false, error: err });
        socket.emit('error:join', { message: err });
        return;
      }

      let player = session.players.find((p) => p.localUuid === localUuid);

      if (player) {
        player.socketId = socket.id;
        player.isConnected = true;
      } else {
        player = {
          id: socket.id,
          name: name.trim(),
          socketId: socket.id,
          score: 0,
          isConnected: true,
          localUuid
        };
        session.players.push(player);
      }

      socket.join(sessionId);
      console.log(`[Socket] Jugador ${player.name} unido a la sesión: ${sessionId}`);

      if (callback) callback({ success: true, language: session.language });

      const lobbyUpdatePayload: LobbyUpdatePayload = {
        sessionId,
        players: session.players.map((p) => ({ name: p.name, isConnected: p.isConnected }))
      };
      io.to(sessionId).emit('lobby:update', lobbyUpdatePayload);
    });

    // Envío de Respuesta del Jugador
    socket.on('player:answer', (payload: PlayerAnswerPayload) => {
      const { sessionId, selectedOptionIndex, responseTimeMs } = payload;
      const session = getSession(sessionId);
      const round = activeRounds.get(sessionId);

      if (!session || !round || session.status !== 'ANSWERING') {
        return; // Ignorar si no está en fase de respuesta
      }

      const player = session.players.find((p) => p.socketId === socket.id);
      if (!player) return;

      // Solo computar la primera respuesta
      if (round.answers.has(player.id)) return;

      const isCorrect = selectedOptionIndex === round.correctOptionIndex;
      let pointsObtained = 0;

      if (isCorrect) {
        // Fórmula de score decreciente: score = maxScore * (tiempoRestante / tiempoRespuesta)
        const totalDuration = session.config.answerTime * 1000;
        const timeLeft = Math.max(0, totalDuration - responseTimeMs);
        pointsObtained = Math.round(session.config.maxScore * (timeLeft / totalDuration));
        player.score += pointsObtained;
      }

      round.answers.set(player.id, {
        selectedOptionIndex,
        pointsObtained,
        responseTimeMs
      });

      console.log(`[Answer] ${player.name} respondió ${isCorrect ? 'CORRECTAMENTE' : 'INCORRECTAMENTE'}. Puntos: ${pointsObtained}`);

      // Comprobar si respondieron TODOS los jugadores activos conectados
      const activeConnectedPlayers = session.players.filter((p) => p.isConnected);
      const allAnswered = activeConnectedPlayers.every((p) => round.answers.has(p.id));

      if (allAnswered && activeConnectedPlayers.length > 0) {
        console.log(`[Socket] Todos los jugadores conectados respondieron. Terminando fase temprano.`);
        revealAnswers(sessionId);
      }
    });

    // Manejar desconexión
    socket.on('disconnect', () => {
      console.log(`[Socket] Cliente desconectado: ${socket.id}`);
      
      const activeSessions = getAllSessions();

      for (const session of activeSessions) {
        const player = session.players.find((p) => p.socketId === socket.id);
        if (player) {
          player.isConnected = false;
          console.log(`[Socket] Jugador ${player.name} desconectado de la sesión: ${session.id}`);

          const lobbyUpdatePayload: LobbyUpdatePayload = {
            sessionId: session.id,
            players: session.players.map((p) => ({ name: p.name, isConnected: p.isConnected }))
          };
          io.to(session.id).emit('lobby:update', lobbyUpdatePayload);

          // Si el juego está en curso, verificar si el abandono de este jugador hace que todos los que quedan conectados ya hayan respondido
          const round = activeRounds.get(session.id);
          if (session.status === 'ANSWERING' && round) {
            const activeConnectedPlayers = session.players.filter((p) => p.isConnected);
            const allAnswered = activeConnectedPlayers.every((p) => round.answers.has(p.id));
            if (allAnswered && activeConnectedPlayers.length > 0) {
              revealAnswers(session.id);
            }
          }
          break;
        }
      }
    });
  });
}
