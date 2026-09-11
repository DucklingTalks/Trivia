export type Language = 'es' | 'en'

export const translations = {
  es: {
    // Header
    appName: 'Trivia realtime',
    exit: 'Salir',

    // Initial screen
    heroTitle: 'Partidas interactivas en tiempo real',
    heroSubtitle: 'Creá trivias al estilo Kahoot, compartí el código con tus amigos y competí para ver quién responde más rápido.',
    createGame: 'Crear Partida',
    createGameDesc: 'Configurá los tiempos, cargá las preguntas y administrá el juego en vivo como Host.',
    createGameBtn: 'Configurar Trivia',
    joinGame: 'Unirse a Partida',
    joinGameDesc: 'Ingresá el código PIN de la partida y registrate con tu apodo para competir.',
    joinGameBtn: 'Unirse a un Lobby',

    // Host config screen
    triviaConfig: 'Configuración de Trivia',
    maxScore: 'Puntaje Máximo',
    readTime: 'Tiempo de Lectura (s)',
    answerTime: 'Tiempo de Respuesta (s)',
    revealTime: 'Tiempo de Revelado (s)',
    randomize: 'Orden aleatorio de preguntas',
    questions: 'Preguntas',
    downloadJsonTemplate: 'Plantilla JSON',
    downloadCsvTemplate: 'Plantilla CSV',
    importQuestions: 'Importar',
    addQuestion: 'Agregar',
    exportJson: 'Exportar JSON',
    exportCsv: 'Exportar CSV',
    edit: 'Editar',
    delete: 'Eliminar',
    back: 'Atrás',
    createGameAction: 'Crear Partida',
    downloadJsonTitle: 'Descargar plantilla JSON de ejemplo',
    downloadCsvTitle: 'Descargar plantilla CSV de ejemplo',
    exportJsonTitle: 'Exportar preguntas actuales a archivo JSON',
    exportCsvTitle: 'Exportar preguntas actuales a archivo CSV',

    // Question modal
    editQuestion: 'Editar Pregunta',
    newQuestion: 'Nueva Pregunta',
    questionText: 'Texto de la Pregunta *',
    questionTextPlaceholder: 'Ej. ¿En qué año se lanzó JavaScript?',
    imageUrl: 'URL de Imagen (Opcional)',
    imageUrlPlaceholder: 'https://ejemplo.com/imagen.jpg',
    funFact: '💡 Dato Curioso (Opcional)',
    funFactPlaceholder: 'Ej: El servidor actúa como fuente de verdad para garantizar consistencia entre todos los jugadores...',
    answerOptions: 'Opciones de Respuesta (Marcá la Correcta) *',
    optionPlaceholder: 'Opción',
    cancel: 'Cancelar',
    saveQuestion: 'Guardar Pregunta',

    // Player join screen
    joinTitle: 'Ingresar a Partida',
    gameCode: 'Código de Partida',
    gameCodePlaceholder: 'Ej. ABCXYZ',
    yourNickname: 'Tu Apodo',
    nicknamePlaceholder: 'Ej. Goku99',
    join: 'Unirse',

    // Lobby screen
    lobbyLabel: 'Lobby de Partida',
    lobbyScanHint: 'Escaneá el QR o ingresá el código de 6 caracteres para unirte.',
    playersInLobby: 'Jugadores en el lobby',
    waitingForPlayers: 'Esperando a que se conecten jugadores...',
    startGame: 'Iniciar Partida',
    waitingForHost: 'Esperando que el Host inicie el juego...',

    // Game screen
    question: 'Pregunta',
    of: 'de',
    phase: 'Fase',
    readNow: '¡LEÉ LA PREGUNTA!',
    answerNow: '¡RESPONDÉ AHORA!',
    results: 'RESULTADOS',
    didYouKnow: '💡 ¿Sabías que...?',
    scoreboard: 'Tabla de Posiciones',

    // Answer reveal
    timeUp: '¡Se te acabó el tiempo!',
    timeUpAnswer: 'La respuesta era:',
    correct: '¡CORRECTO!',
    correctPoints: 'Sumaste puntos en esta ronda.',
    incorrect: 'INCORRECTO',
    incorrectAnswer: 'La respuesta correcta era:',

    // Finished screen
    gameFinished: 'Juego Finalizado',
    podium: '🏆 PODIO 🏆',
    backToMenu: 'Volver al Menú Principal',

    // Footer
    footerText: 'Trivia Realtime MVP. Todos los derechos reservados.',

    // Validation messages
    validationMinQuestion: 'Debe haber al menos 1 pregunta en la trivia.',
    validationQuestionText: 'El texto de la pregunta no puede estar vacío.',
    validationOptions: 'Las 4 opciones de respuesta deben estar completas.',
    validationCodeAndNickname: 'Completá el código y tu apodo.',
    errorConnect: 'Error al conectar con el servidor.',
    errorUnsupportedFormat: 'Formato no soportado. Seleccioná un archivo .json o .csv',
    errorEmptyCSV: 'El CSV está vacío o solo contiene la cabecera.',
    errorJsonNotArray: 'El JSON debe contener un array de preguntas.',
    errorJsonQuestionShape: 'La pregunta #{n} no tiene texto o exactamente 4 opciones.',
    errorCsvLineColumns: 'La línea #{line} del CSV debe contener al menos 7 columnas.',
    errorProcessingFile: 'Error al procesar el archivo.',
    errorCreateSession: 'No se pudo crear la sesión.',
    errorNetworkSession: 'Error de red al intentar crear la sesión.',
    analyticsConsentMessage: 'Podemos usar analítica anónima y acotada para mejorar Trivia. No incluye nombres, preguntas, respuestas, códigos ni identificadores de la aplicación.',
    analyticsAllow: 'Permitir analítica',
    analyticsDecline: 'No permitir',
  },
  en: {
    // Header
    appName: 'Trivia realtime',
    exit: 'Exit',

    // Initial screen
    heroTitle: 'Interactive real-time sessions',
    heroSubtitle: 'Create Kahoot-style trivia games, share the code with friends and compete to see who answers fastest.',
    createGame: 'Create Game',
    createGameDesc: 'Set timings, load questions, and manage the game live as a Host.',
    createGameBtn: 'Configure Trivia',
    joinGame: 'Join Game',
    joinGameDesc: 'Enter the game PIN code and register with your nickname to compete.',
    joinGameBtn: 'Join a Lobby',

    // Host config screen
    triviaConfig: 'Trivia Configuration',
    maxScore: 'Max Score',
    readTime: 'Reading Time (s)',
    answerTime: 'Answer Time (s)',
    revealTime: 'Reveal Time (s)',
    randomize: 'Randomize question order',
    questions: 'Questions',
    downloadJsonTemplate: 'JSON Template',
    downloadCsvTemplate: 'CSV Template',
    importQuestions: 'Import',
    addQuestion: 'Add',
    exportJson: 'Export JSON',
    exportCsv: 'Export CSV',
    edit: 'Edit',
    delete: 'Delete',
    back: 'Back',
    createGameAction: 'Create Game',
    downloadJsonTitle: 'Download sample JSON template',
    downloadCsvTitle: 'Download sample CSV template',
    exportJsonTitle: 'Export current questions to JSON file',
    exportCsvTitle: 'Export current questions to CSV file',

    // Question modal
    editQuestion: 'Edit Question',
    newQuestion: 'New Question',
    questionText: 'Question Text *',
    questionTextPlaceholder: 'E.g. In what year was JavaScript launched?',
    imageUrl: 'Image URL (Optional)',
    imageUrlPlaceholder: 'https://example.com/image.jpg',
    funFact: '💡 Fun Fact (Optional)',
    funFactPlaceholder: 'E.g: The server acts as the source of truth to guarantee consistency among all players...',
    answerOptions: 'Answer Options (Mark the Correct One) *',
    optionPlaceholder: 'Option',
    cancel: 'Cancel',
    saveQuestion: 'Save Question',

    // Player join screen
    joinTitle: 'Join Game',
    gameCode: 'Game Code',
    gameCodePlaceholder: 'E.g. ABCXYZ',
    yourNickname: 'Your Nickname',
    nicknamePlaceholder: 'E.g. Goku99',
    join: 'Join',

    // Lobby screen
    lobbyLabel: 'Game Lobby',
    lobbyScanHint: 'Scan the QR or enter the 6-character code to join.',
    playersInLobby: 'Players in lobby',
    waitingForPlayers: 'Waiting for players to connect...',
    startGame: 'Start Game',
    waitingForHost: 'Waiting for the Host to start the game...',

    // Game screen
    question: 'Question',
    of: 'of',
    phase: 'Phase',
    readNow: 'READ THE QUESTION!',
    answerNow: 'ANSWER NOW!',
    results: 'RESULTS',
    didYouKnow: '💡 Did you know...?',
    scoreboard: 'Leaderboard',

    // Answer reveal
    timeUp: "Time's up!",
    timeUpAnswer: 'The answer was:',
    correct: 'CORRECT!',
    correctPoints: 'You scored points this round.',
    incorrect: 'INCORRECT',
    incorrectAnswer: 'The correct answer was:',

    // Finished screen
    gameFinished: 'Game Over',
    podium: '🏆 PODIUM 🏆',
    backToMenu: 'Back to Main Menu',

    // Footer
    footerText: 'Trivia Realtime MVP. All rights reserved.',

    // Validation messages
    validationMinQuestion: 'There must be at least 1 question in the trivia.',
    validationQuestionText: 'The question text cannot be empty.',
    validationOptions: 'All 4 answer options must be filled in.',
    validationCodeAndNickname: 'Please fill in the code and your nickname.',
    errorConnect: 'Error connecting to the server.',
    errorUnsupportedFormat: 'Unsupported format. Select a .json or .csv file',
    errorEmptyCSV: 'The CSV is empty or only contains the header.',
    errorJsonNotArray: 'The JSON must contain an array of questions.',
    errorJsonQuestionShape: 'Question #{n} is missing text or does not have exactly 4 options.',
    errorCsvLineColumns: 'CSV line #{line} must contain at least 7 columns.',
    errorProcessingFile: 'Error processing the file.',
    errorCreateSession: 'Could not create the session.',
    errorNetworkSession: 'Network error while trying to create the session.',
    analyticsConsentMessage: 'We may use limited anonymous analytics to improve Trivia. It does not include names, questions, answers, codes, or application identifiers.',
    analyticsAllow: 'Allow analytics',
    analyticsDecline: 'Decline',
  }
} as const satisfies Record<Language, Record<string, string>>

export type TranslationKey = keyof typeof translations.es
