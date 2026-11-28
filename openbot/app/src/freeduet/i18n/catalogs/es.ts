import type { Catalog } from "../translate";
import type { EN } from "./en";

/*
 * Spanish: a machine draft, to review. It stays a draft until a reader of Spanish has checked it
 * (docs/design/app-languages.md, decision 5). "Tú", as the site's Spanish page writes to the reader.
 * Where the site's Spanish page has a word for a thing, the app uses it: "asistente" for a Bot,
 * "miembro", "equipo", "motores", "traspaso", "rutina", "ajustes". The Spanish approval cards
 * (openbot/shared/approval-text-es.ts) still say "Bot": a mismatch to settle, not a choice made here.
 * Product names stay as they are.
 */
export const es: Catalog<typeof EN> = {
  "sign.title": "Inicia sesión en {product}",
  "sign.continueWith": "Continuar con {provider}",
  "sign.opening": "Abriendo {provider}…",
  "sign.openError":
    "No se pudo abrir el inicio de sesión con {provider}. Inténtalo de nuevo.",
  "sign.ssoRequired":
    "Tu organización requiere que inicies sesión con tu cuenta de empresa.",
  "sign.pairLead":
    "Este navegador aún no está emparejado con {product}. En el ordenador donde corre, lanza",
  "sign.pairTail": ": se abre {product} aquí, listo para usar.",
  "sign.notSetUp":
    "El inicio de sesión aún no está configurado. Un administrador debe configurarlo primero.",
  "sign.or": "o",
  "sign.emailPlaceholder": "tu@empresa.com",
  "sign.openingCompany": "Abriendo…",
  "sign.continueCompany": "Continuar con tu cuenta de empresa",
  "sign.adminSignIn": "Inicio de sesión de administrador",
  "sign.noCompany":
    "No hay un inicio de sesión de empresa configurado para esa dirección.",
  "shell.menu": "Menú",
  "shell.everything": "Todo",
  "shell.everythingLine": "Todo el contexto de los chats, en todos los canales",
  "shell.channelsError":
    "No se han podido cargar tus canales. Recarga la página.",
  "shell.channels": "Canales",
  "shell.newChannel": "Nuevo canal",
  "shell.archived": "Archivados",
  "shell.archivedChannels": "Canales archivados",
  "shell.unarchive": "Desarchivar",
  "shell.unarchiveNamed": "Desarchivar {name}",
  "shell.earlier": "Conversaciones anteriores",
  "shell.manage": "Gestionar",
  "shell.signOut": "Cerrar sesión",
  "nav.bots": "Asistentes",
  "nav.connections": "Conexiones",
  "nav.capabilities": "Capacidades",
  "nav.routines": "Rutinas",
  "nav.approvalRules": "Reglas de aprobación",
  "nav.admin": "Administración",
  "nav.dashboard": "Panel",
  "nav.settings": "Ajustes",
  "tab.main": "Principal",
  "tab.chat": "Chat",
  "tab.tasks": "Tareas",
  "tab.make": "Crear",
  "tab.waiting": "{tab}, {badge} en espera",
  "header.chat": "Chat de {product}",
  "header.settings": "Tus ajustes",
  "header.back": "Atrás",
  "header.more": "Más",
  "composer.ask": "Pregunta lo que quieras",
  "composer.message": "Mensaje",
  "composer.queue": "Poner el mensaje en cola",
  "composer.send": "Enviar mensaje",
  "composer.stop": "Detener al asistente",
  "composer.showCall": "Mostrar la llamada de voz",
  "composer.startCall": "Iniciar llamada de voz",
  "composer.callBot": "Llamar a este asistente",
  "composer.callUnsupported":
    "Las llamadas de voz necesitan micrófono y una conexión segura (HTTPS)",
  "composer.speak": "Dictar un mensaje",
  "composer.dictateTitle": "Di todo lo que tienes que hacer",
  "composer.attach": "Adjuntar un archivo",
  "composer.moreUnavailable": "Más opciones del mensaje no disponibles",
  "composer.messageNamed": "Escribe a {name}",
  "chat.botsError":
    "No se han podido cargar tus asistentes. Recarga la página.",
  "chat.noBots": "Todavía no hay asistentes.",
  "chat.conversationError":
    "No se ha podido cargar tu conversación. Recarga la página.",
  "chat.stillStarting":
    "La conversación todavía está empezando. Inténtalo de nuevo en un momento.",
  "chat.startError":
    "No se ha podido iniciar la conversación. Inténtalo de nuevo.",
  "attention.questions": {
    one: "{count} pregunta",
    other: "{count} preguntas",
  },
  "attention.approvals": {
    one: "{count} aprobación",
    other: "{count} aprobaciones",
  },
  "attention.handoffs": {
    one: "{count} traspaso parado",
    other: "{count} traspasos parados",
  },
  "attention.unread": {
    one: "{count} conversación sin leer",
    other: "{count} conversaciones sin leer",
  },
  "attention.needYou": {
    one: "{count} cosa necesita tu atención",
    other: "{count} cosas necesitan tu atención",
  },
  "attention.open": "{summary}. Abre Asistentes para resolverlos.",
  "attention.unreadMessages": "Mensajes sin leer",
  "bots.new": "Nuevo asistente",
  "bots.purpose":
    "Tus asistentes y los que se han compartido contigo. Mira qué hace cada uno y qué necesita de ti.",
  "bots.loadError":
    "No se han podido cargar tus asistentes. Recarga la página.",
  "bots.needsYou": "Te necesitan",
  "bots.pinned": "Fijados",
  "bots.yours": "Tuyos",
  "bots.shared": "Compartidos contigo",
  "bots.allPinned": "Tus asistentes están todos fijados arriba.",
  "bots.allNeedYou": "Tus asistentes están todos en «Te necesitan».",
  "bots.none":
    "Todavía no tienes ningún asistente. Crea uno con «Nuevo asistente».",
  "bots.nobodyShared": "Todavía nadie ha compartido un asistente contigo.",
  "bots.hide": "Ocultar",
  "bots.show": "Mostrar",
  "bots.hidden": "Ocultos",
  "bots.hiddenDescription": {
    one: "{count} asistente que has ocultado. Solo cambia tu lista.",
    other: "{count} asistentes que has ocultado. Solo cambia tu lista.",
  },
  "bots.paused": "En pausa",
  "bots.message": "Escribir",
  "bots.wroteIn": {
    one: "{name} escribió en {count} conversación que no has leído.",
    other: "{name} escribió en {count} conversaciones que no has leído.",
  },
  "bots.readNewest": "Leer la más reciente",
  "bots.resuming": "Reanudando…",
  "bots.pausedResume": "En pausa. Reanudar",
  "botPage.purpose":
    "Lo que este asistente hace por ti y cómo está configurado.",
  "botPage.fallbackTitle": "Asistente",
  "botPage.openError":
    "No se ha podido abrir este asistente. Puede que no esté compartido contigo.",
  "profile.forYou": "Para ti",
  "profile.settingsError":
    "No se han podido cargar los ajustes de este asistente. Recarga la página.",
  "profile.active": "Activo",
  "profile.pausedDescription":
    "En pausa. No se ejecuta nada para ti hasta que lo vuelvas a activar.",
  "profile.activeDescription":
    "Ejecuta por ti sus rutinas, responsabilidades, traspasos y seguimientos.",
  "profile.notifications": "Notificaciones",
  "profile.notifyDescription":
    "{level}. Los contadores de la barra lateral siempre se muestran.",
  "profile.notify.all": "Todo",
  "profile.notify.needsInput": "Solo cuando me necesite",
  "profile.notify.none": "Nada (solo los contadores)",
  "profile.browserNotifications": "Notificaciones del navegador",
  "profile.browserOff":
    "Desactivadas en este navegador. Actívalas para enterarte cuando un asistente te necesite.",
  "profile.turnOn": "Activar",
  "profile.startConversation": "Empieza una conversación.",
  "stalled.what": "{name} no ha terminado: {task}",
  "stalled.why": "Motivo: {reason}.",
  "stalled.retryError":
    "No se ha podido volver a intentar. Puede que ya esté en marcha.",
  "stalled.dismissError":
    "No se ha podido descartar. Puede que ya esté en marcha.",
  "stalled.dismissing": "Descartando…",
  "stalled.dismissed": "Descartado",
  "stalled.dismiss": "Descartar",
  "stalled.retrying": "Volviendo a intentar…",
  "stalled.queued": "Vuelto a poner en cola",
  "stalled.retry": "Volver a intentar",
  "stalled.open": "Abrir la conversación",
  "dash.title": "Panel",
  "dash.notAvailable": "Todavía no disponible",
  "dash.tokensNotCounted": "Todavía no se ha contado ningún turno hoy.",
  "dash.countsUnavailable":
    "Los recuentos de tokens no están disponibles ahora.",
  "dash.enginesLink": "Gestionar motores",
  "dash.teamLink": "Todos los miembros",
  "dash.waitingForYou": "Pendiente de ti",
  "dash.available": "Disponible",
  "dash.loading": "Cargando tu equipo…",
  "dash.nothingWaits": "No hay nada pendiente para ti.",
  "dash.thingsWait": {
    one: "{count} cosa pendiente para ti.",
    other: "{count} cosas pendientes para ti.",
  },
  "dash.partialCount": "{reported} de {turns} intentos informaron un recuento",
  "dash.inputPlusOutput": "Entrada más salida, tal como la informó cada motor",
  "dash.nothingSaved": "Hoy todavía nada ha usado un motor gratuito",
  "dash.firstFor": {
    one: "primero para {count} miembro",
    other: "primero para {count} miembros",
  },
  "dash.members": { one: "{count} miembro", other: "{count} miembros" },
  "dash.indicators": "Indicadores",
  "dash.tokensToday": "Tokens hoy",
  "dash.savedToday": "Ahorrado con motores gratuitos hoy",
  "dash.waitingSub": "Preguntas, aprobaciones y traspasos parados",
  "dash.nextRoutine": "Próxima rutina",
  "dash.noRoutine": "No hay ninguna rutina programada.",
  "dash.team": "Equipo",
  "dash.engines": "Motores",
  "dash.noEngine": "Todavía no hay ningún motor configurado.",
  "dash.perMemberAria": "Tokens por miembro",
  "dash.perMember": "Tokens por miembro, hoy",
  "dash.foot":
    "Los recuentos son lo que informó cada motor, en días UTC. Un registro de actividad reciente y un indicador del límite del plan todavía no están disponibles.",
  "voice.heardNothing":
    "No he oído nada. Toca el micrófono para intentarlo de nuevo, o escribe.",
  "voice.tapWhenDone": "Toca el micrófono cuando termines",
  "voice.discard": "Descartar",
  "voice.start": "Empezar a dictar",
  "voice.stopAndSend": "Parar el dictado y enviar",
  "voice.typeInstead": "Escribir en su lugar",
  "voice.retry": "Reintentar",
  "voice.recordAgain": "Grabar de nuevo",
  "voice.writing": "Transcribiendo lo que has dicho…",
  "voice.listeningStop": "Escuchando… Pararé cuando hagas una pausa",
  "voice.listening": "Te escucho, empieza a hablar",
  "voice.permission": "Esperando permiso para el micrófono…",
  "home.bots": "Conoce a tu equipo y gestiona cada asistente.",
  "home.capabilities": "Habilidades y memoria.",
  "home.connectionsLabel": "Cuentas, apps y reglas de correo",
  "home.connections": "Conecta una cuenta, una app o tu correo.",
  "home.setupLabel": "Lista de configuración",
  "home.setup": "Mira qué está configurado y qué falta.",
  "home.approvalsLabel": "Reglas de aprobación y Full access",
  "home.approvals": "Lo que un asistente puede hacer sin preguntarte.",
  "home.passwordsLabel": "Contraseñas",
  "home.passwords": "Las contraseñas que tu equipo puede usar.",
  "home.routines": "Trabajo que se repite solo, y la vista de la semana.",
  "home.notifications": "Por dónde te llegan las novedades.",
  "home.admin": "Ordenadores, credenciales, límites, personas y registro.",
  "home.engines":
    "Quién responde por cada asistente, en qué orden y cuánto han usado hoy. Tu suscripción sigue primero hasta que cambies el orden.",
  "home.safety": "Seguridad",
  "home.jobs": "Trabajos",
  "home.system": "Sistema",
  "settings.description":
    "Gestiona tu equipo, las cuentas conectadas y tus preferencias personales.",
  "settings.sections": "Secciones de ajustes",
  "settings.workspace": "Espacio de trabajo",
  "settings.preferences": "Preferencias",
  "settings.devices": "Dispositivos e información",
  "settings.appearance": "Apariencia",
  "settings.matchPhone": "Igual que el móvil",
  "settings.light": "Claro",
  "settings.dark": "Oscuro",
  "settings.voice": "Voz",
  "settings.shortcuts": "Atajos de teclado",
  "language.section": "Idioma",
  "language.title": "Idioma de la app",
  "language.description":
    "El idioma de los menús y los botones. Tu equipo te escribe en el idioma que tienes configurado en el chat.",
  "language.auto": "Automático (navegador)",
  "settings.descriptionPlain": "Cómo se ve y cómo funciona {product} para ti.",
  "wide.yourTeam": "Tu equipo",
  "wide.team": "Equipo",
  "wide.stateWaiting": "Pendiente de ti",
  "wide.stateWorking": "Trabajando en ello",
  "wide.memberLabel": "{name}, {line}",
  "chat.loadingConversation": "Cargando esta conversación",
  "chat.readAloud": "Leer en voz alta",
  "chat.stopReading": "Dejar de leer",
  "chat.thinking": "Pensando",
  "chat.queued": "En cola",
  "chat.removeQueued": "Quitar el mensaje en cola: {what}",
  "chat.remove": "Quitar",
  "chat.routineRan": "Se ejecutó la rutina.",
  "chat.firstDayYes": "Me parece bien",
  "chat.firstDayNo": "Algo no cuadra",
  "chat.tryingAgain": "Lo intento de nuevo.",
  "chat.responsibilityRan": "Se ejecutó la responsabilidad.",
  "chat.trigger": "Disparador:",
  "chat.details": "Detalles",
  "chat.via": "vía {source}",
  "chat.untitledFile": "Archivo sin título",
  "chat.attachment": "Adjunto",
  "chat.attachmentLower": "adjunto",
  "chat.attachmentNamed": "Adjunto: {name}",
  "chat.unavailableNamed": "{name} no está disponible.",
  "chat.unavailable": "Este adjunto no está disponible.",
  "chat.openNamed": "Abrir {name}",
  "chat.close": "Cerrar",
  "chat.generatedInterface": "La interfaz generada por este asistente",
  "chat.usedBrowser": "Usó el navegador",
  "chat.hostAndMore": "{host} y {amount} más",
  "chat.searchedWeb": "buscó en la web",
  "chat.readPages": {
    one: "leyó {amount} página",
    many: "leyó {amount} de páginas",
    other: "leyó {amount} páginas",
  },
  "chat.browsedPages": {
    one: "consultó {amount} página",
    many: "consultó {amount} de páginas",
    other: "consultó {amount} páginas",
  },
  "chat.usedBrowserPhrase": "usó el navegador",
  "chat.usedNamed": "usó {name}",
  "chat.usedConnectors": {
    one: "usó {amount} conector",
    many: "usó {amount} de conectores",
    other: "usó {amount} conectores",
  },
  "chat.usedTools": {
    one: "usó {amount} herramienta",
    many: "usó {amount} de herramientas",
    other: "usó {amount} herramientas",
  },
  "chat.andJoin": "{head} y {last}",
  "chat.inProgress": "En curso",
  "chat.waitingForYou": "Pendiente de ti",
  "chat.notCompleted": "No completado",
  "chat.blocked": "Bloqueado",
  "chat.didntWork": "No funcionó",
  "chat.couldntFinishStep": "No se ha podido terminar este paso.",
  "chat.issues": {
    one: "{amount} problema",
    many: "{amount} de problemas",
    other: "{amount} problemas",
  },
  "settings.addRepository": "Añadir un repositorio",
  "settings.approvals": "Aprobaciones",
  "settings.appsSharedBots": "Apps que dejas usar a los asistentes compartidos",
  "settings.backToApp": "Volver a la app",
  "settings.cancel": "Cancelar",
  "settings.cannotMakeCode":
    "El código se crea en el navegador emparejado con el ordenador. Este no puede crear uno.",
  "settings.cantLink":
    "Todavía no puedes vincular una cuenta de {provider}. Antes un administrador tiene que configurarla.",
  "settings.changesDescription":
    "Ajustes que un asistente ha cambiado desde el chat. Deshacer devuelve el valor anterior durante siete días, y solo mientras el ajuste conserve el valor que fijó el cambio.",
  "settings.changesEmpty": "Todavía no hay cambios hechos en el chat.",
  "settings.changesLoading": "Cargando cambios…",
  "settings.changesTitle": "Cambios hechos en el chat",
  "settings.charactersOf": "{used} de {limit} caracteres",
  "settings.checkLinkError":
    "No se ha podido comprobar si puedes vincular esta cuenta: {error}",
  "settings.code": "Código",
  "settings.codeExpires":
    "El código funciona una sola vez y caduca en 10 minutos.",
  "settings.codeRanOut": "Ese código ha caducado. Crea uno nuevo.",
  "settings.componentsGallery": "Galería de componentes",
  "settings.computer": "Ordenador",
  "settings.connect": "Conectar",
  "settings.connectEvents": "Conectar eventos",
  "settings.connectNamed": "Conectar {name}",
  "settings.copied": "Copiado",
  "settings.copy": "Copiar",
  "settings.copyFailed":
    "No se ha podido copiar. Selecciona el código y cópialo tú mismo.",
  "settings.deliveriesEmpty": "Todavía no hay entregas.",
  "settings.deliveriesTitle": "Entregas recientes",
  "settings.deploymentOwn": "el de la instalación",
  "settings.devicesDescription":
    "Inicia sesión en la app de {product} en tu móvil y activa las notificaciones para añadirlo aquí.",
  "settings.devicesEmpty": "Todavía no hay dispositivos.",
  "settings.devicesTitle": "Tus dispositivos",
  "settings.disconnect": "Desconectar",
  "settings.disconnectError": "No se ha podido desconectar {name}: {error}",
  "settings.disconnectNamed": "Desconectar {name}",
  "settings.done": "Listo",
  "settings.emphasisBot": "Nombre del asistente",
  "settings.emphasisConversation": "Título de la conversación",
  "settings.emphasisDescription":
    "Elige qué línea destaca en la barra lateral.",
  "settings.emphasisPreview": "Vista previa de la lista de mensajes",
  "settings.emphasisTitle": "Qué resaltar en la lista de mensajes",
  "settings.general": "General",
  "settings.githubConnectError": "No se ha podido conectar GitHub: {error}",
  "settings.githubLinkFailed":
    "No se ha podido vincular tu cuenta de GitHub. Inténtalo de nuevo.",
  "settings.githubLinked": "Tu cuenta de GitHub está vinculada.",
  "settings.githubTaken":
    "Esa cuenta de GitHub está vinculada a otra persona en {product}. Inicia sesión en GitHub con otra cuenta e inténtalo de nuevo, o pide ayuda a un administrador.",
  "settings.kindDecision": "Decisiones",
  "settings.kindDecisionDescription":
    "Aprobaciones que un asistente necesita antes de actuar.",
  "settings.kindProgress": "Progreso",
  "settings.kindProgressDescription":
    "Respuestas y resultados de trabajos que no estabas siguiendo.",
  "settings.kindQuestion": "Preguntas",
  "settings.kindQuestionDescription":
    "Cosas que un asistente te ha preguntado y que está esperando.",
  "settings.languageChanged": "Tu idioma para el equipo pasó de {from} a {to}",
  "settings.lastSeen": "visto por última vez {when}",
  "settings.levelAll": "todo",
  "settings.levelNeedsInput": "solo cuando te necesite",
  "settings.linkBroughtCode":
    "El enlace incluía un código. Pon un nombre a este navegador y pulsa Emparejar.",
  "settings.linkSlack": "Vincula tu cuenta de Slack",
  "settings.linked": "Vinculada",
  "settings.loadAccountError": "No se ha podido cargar tu cuenta: {error}",
  "settings.loading": "Cargando…",
  "settings.localAddress":
    "Esta dirección solo funciona en este ordenador. Un móvil necesita la dirección con la que se llega a FreeDuet desde fuera; ábrela en el móvil y escribe el código en Ajustes.",
  "settings.madeWhen": "creado {when}",
  "settings.makeCode": "Crear un código",
  "settings.memberAdded": "{member} se ha añadido a tu equipo",
  "settings.name": "Nombre",
  "settings.nameChanged": "{bot}: tu nombre para él pasó de {from} a {to}",
  "settings.nameOwn": "su propio nombre",
  "settings.needsReconnect": "Necesita volver a conectarse",
  "settings.needsReconnectHandle": "Necesita volver a conectarse · @{handle}",
  "settings.noItalianVoice":
    "No hay ninguna voz italiana local en este ordenador, así que aquí las respuestas no se pueden leer en voz alta.",
  "settings.notLinked": "No vinculada",
  "settings.notSetUp": "Sin configurar",
  "settings.notifyChanged":
    "{bot}: las notificaciones pasaron de {from} a {to}",
  "settings.pairThisDescription":
    "En el ordenador donde corre FreeDuet, abre Ajustes, pulsa Crear un código en Emparejar un móvil u otro navegador, y luego abre el enlace que muestra o escribe aquí el código.",
  "settings.pairThisTitle": "Emparejar este navegador",
  "settings.pairedDescription":
    "Un móvil u otro navegador emparejado funciona igual que este. Si revocas uno, se corta en su siguiente petición y se cierra su sesión.",
  "settings.pairedDone": "Este navegador está emparejado con el ordenador.",
  "settings.pairedTitle": "Emparejar un móvil u otro navegador",
  "settings.phone": "Móvil",
  "settings.phoneOrBrowser": "Móvil u otro navegador",
  "settings.qrLabel": "Código QR con el enlace de emparejamiento",
  "settings.readAloudDescription":
    "Añade un botón «Leer en voz alta» bajo cada respuesta de un asistente. Usa solo una voz de este ordenador, y no se envía nada a ningún otro sitio.",
  "settings.readAloudTitle": "Leer las respuestas en voz alta",
  "settings.rename": "Renombrar",
  "settings.repositories": "Repositorios",
  "settings.repositoriesDescription":
    "Añade aquí un repositorio y luego añade en GitHub un webhook con la dirección de abajo y el mismo secreto. Sus eventos, como issues.opened, pueden iniciar después una responsabilidad.",
  "settings.repositoriesEmpty":
    "Todavía no hay repositorios. Añade uno con «Añadir un repositorio».",
  "settings.repository": "Repositorio",
  "settings.reset": "Restablecer",
  "settings.resetDescription":
    "Olvida cada respuesta, para que cada asistente compartido vuelva a preguntar.",
  "settings.resetDone":
    "Restablecido. Cada asistente compartido volverá a preguntar.",
  "settings.revoke": "Revocar",
  "settings.routingDescription":
    "Por dónde llega cada tipo de novedad cuando estás fuera. {product} en la web siempre muestra todo.",
  "settings.routingError":
    "No se ha podido cargar por dónde te llegan las novedades. Recarga la página.",
  "settings.routingTitle": "Por dónde llegan las novedades",
  "settings.runsOut":
    "En el móvil, con tu sesión iniciada, escanea esto o abre el enlace, o abre Ajustes y escribe el código. Funciona una sola vez y caduca en {time}.",
  "settings.sameSecret":
    "Usa el mismo secreto cuando añadas el webhook en GitHub.",
  "settings.sampleBot": "Asistente general",
  "settings.sampleTitle": "Planificar la próxima semana",
  "settings.save": "Guardar",
  "settings.saved": "Guardado",
  "settings.saving": "Guardando…",
  "settings.setup": "Configuración",
  "settings.sharedBots": "Asistentes compartidos",
  "settings.sharedBotsDescription":
    "Un asistente compartido contigo usa las apps de su propietario. Usa las tuyas solo donde hayas dicho que sí en una conversación.",
  "settings.slackCodeError":
    "No se ha podido crear un código de Slack: {error}",
  "settings.standingDescription":
    "Se aplica a cada asistente en cada conversación. El papel de un asistente dice qué hace. Esto dice cómo quieres que lo haga, como tu estilo de escritura.",
  "settings.standingTitle": "Instrucciones permanentes",
  "settings.switchLabel": "{kind} por {transport}",
  "settings.thisBrowserTag": "(este navegador)",
  "settings.toneChanged": "{bot}: el tono pasó de {from} a {to}",
  "settings.undo": "Deshacer",
  "settings.undoFailed":
    "No se ha podido deshacer el cambio. Inténtalo de nuevo.",
  "settings.undoGone": "Ya no se puede deshacer",
  "settings.undoing": "Deshaciendo…",
  "settings.undone": "Deshecho",
  "settings.webhookSecret": "Secreto del webhook",
  "settings.yourAccount": "Tu cuenta",
  "bot.activity.kindRoutine": "Rutina",
  "bot.activity.kindResponsibility": "Responsabilidad",
  "bot.activity.kindHandoff": "Tarea delegada",
  "bot.activity.kindApproval": "Aprobación",
  "bot.activity.kindQuestion": "Pregunta",
  "bot.activity.kindFollowUp": "Seguimiento",
  "bot.activity.needsYou": "te necesita",
  "bot.activity.stop": "Detener",
  "bot.activity.stopping": "Deteniendo…",
  "bot.activity.cancelling": "Cancelando…",
  "bot.activity.open": "Abrir",
  "bot.activity.title": "Actividad",
  "bot.activity.scheduled": "Programadas",
  "bot.activity.completed": "Completadas",
  "bot.activity.emptyInProgress": "No hay nada en marcha ni pendiente de ti.",
  "bot.activity.emptyScheduled": "No hay nada programado.",
  "bot.activity.emptyCompleted": "Todavía no ha terminado nada.",
  "bot.activity.loadError":
    "No se ha podido cargar la actividad de este asistente. Recarga la página.",
  "bot.settings.heading": "Ajustes de este asistente",
  "bot.area.responsibilities": "Responsabilidades",
  "bot.area.reaching": "Cómo te contacta",
  "bot.area.memory": "Memoria",
  "bot.area.access": "Habilidades y accesos",
  "bot.area.sharing": "Compartir",
  "bot.settings.activeCount": {
    one: "{count} activa",
    many: "{count} de activas",
    other: "{count} activas",
  },
  "bot.settings.noneActive": "Ninguna activa",
  "bot.settings.ruleCount": {
    one: "{count} regla",
    many: "{count} de reglas",
    other: "{count} reglas",
  },
  "bot.settings.noRules": "Sin reglas",
  "bot.settings.routineCount": {
    one: "{count} rutina",
    many: "{count} de rutinas",
    other: "{count} rutinas",
  },
  "bot.settings.noRoutines": "Sin rutinas",
  "bot.access.skillsDescription":
    "Activa una habilidad para usarla con este asistente. Escribe / en una conversación para ejecutarla.",
  "bot.access.yourSkills": "Tus habilidades",
  "bot.access.skillsError":
    "No se han podido cargar tus habilidades. Recarga la página.",
  "bot.access.noSkills": "Todavía no hay habilidades.",
  "bot.access.writeOne": "Escribe una",
  "bot.access.title": "Lo que puede usar",
  "bot.access.grantedDescription":
    "Las apps y habilidades que puede usar este asistente, y si cada app está lista para ti. No puede usar nada más.",
  "bot.access.grantedError":
    "No se ha podido cargar lo que puede usar este asistente. Recarga la página.",
  "bot.access.readyError":
    "No se ha podido comprobar si cada app está lista para ti. Recarga la página.",
  "bot.access.noApps":
    "Todavía no hay apps. Un administrador tiene que añadirlas. Hasta entonces, este asistente solo puede hablar contigo.",
  "bot.access.toolsAndMore": "{list} y {count} más",
  "bot.access.toolCount": {
    one: "{count} herramienta",
    many: "{count} de herramientas",
    other: "{count} herramientas",
  },
  "bot.access.skillLabel": "Habilidad",
  "bot.access.manageNamed": "Gestionar {title} en este asistente",
  "bot.reset.conversations": {
    one: "{count} conversación",
    many: "{count} de conversaciones",
    other: "{count} conversaciones",
  },
  "bot.reset.memorySources": {
    one: "{count} fuente de memoria",
    many: "{count} de fuentes de memoria",
    other: "{count} fuentes de memoria",
  },
  "bot.reset.memories": {
    one: "{count} memoria importada",
    many: "{count} de memorias importadas",
    other: "{count} memorias importadas",
  },
  "bot.reset.routines": {
    one: "{count} rutina",
    many: "{count} de rutinas",
    other: "{count} rutinas",
  },
  "bot.reset.responsibilities": {
    one: "{count} responsabilidad",
    many: "{count} de responsabilidades",
    other: "{count} responsabilidades",
  },
  "bot.reset.followUps": {
    one: "{count} seguimiento programado",
    many: "{count} de seguimientos programados",
    other: "{count} seguimientos programados",
  },
  "bot.reset.formedMemories": {
    one: "{count} memoria que creó el asistente",
    many: "{count} de memorias que creó el asistente",
    other: "{count} memorias que creó el asistente",
  },
  "bot.reset.research": {
    one: "{count} investigación en segundo plano",
    many: "{count} de investigaciones en segundo plano",
    other: "{count} investigaciones en segundo plano",
  },
  "bot.reset.standing": {
    one: "{count} permiso permanente",
    many: "{count} de permisos permanentes",
    other: "{count} permisos permanentes",
  },
  "bot.reset.title": "¿Restablecer {name}?",
  "bot.reset.description":
    "Esto elimina lo que {name} tiene contigo. Las conversaciones y los datos de otras personas se mantienen. No se puede deshacer.",
  "bot.reset.planError":
    "No se ha podido comprobar qué eliminaría el restablecimiento. Inténtalo de nuevo.",
  "bot.reset.done": "Listo. {name} empieza de cero contigo.",
  "bot.reset.nothing": "No hay nada tuyo que eliminar.",
  "bot.reset.willDelete": "Se eliminará:",
  "bot.reset.sharedKept": {
    one: "{count} conversación está compartida con otras personas o asistentes y se conservará.",
    many: "{count} de conversaciones están compartidas con otras personas o asistentes y se conservarán.",
    other:
      "{count} conversaciones están compartidas con otras personas o asistentes y se conservarán.",
  },
  "bot.reset.memoriesKept":
    "Se conservan las memorias que tú mismo le has contado a un asistente.",
  "bot.reset.resetting": "Restableciendo…",
  "bot.reset.submit": "Eliminar y restablecer",
  "bot.manage.pinnedAssigned":
    "Un administrador te lo ha asignado. Se queda arriba en tu lista de asistentes.",
  "bot.manage.pinnedOn":
    "Arriba en tu lista de asistentes. Solo cambia tu lista.",
  "bot.manage.pinnedOff":
    "Mantenlo arriba en tu lista de asistentes. Solo cambia tu lista.",
  "bot.manage.hiddenAssigned":
    "Un administrador te lo ha asignado. No puedes ocultarlo.",
  "bot.manage.hiddenOn":
    "En «Ocultos» de tu lista de asistentes. Solo cambia tu lista.",
  "bot.manage.hiddenOff":
    "Quítalo de tu lista de asistentes. Solo cambia tu lista.",
  "bot.manage.duplicate": "Duplicar",
  "bot.manage.duplicateDescription":
    "Crea tu propia copia. Sus conversaciones y claves no se copian.",
  "bot.manage.resetDescription":
    "Elimina tus conversaciones con él, lo que recuerda para ti y su trabajo programado. Antes verás la lista.",
  "bot.manage.delete": "Eliminar",
  "bot.manage.deleteDescription":
    "Lo elimina para todos. No se puede deshacer.",
  "bot.manage.deleteTitle": "¿Eliminar {name}?",
  "bot.manage.deleteConfirm": "Se elimina para todos. No se puede deshacer.",
  "bot.manage.deleting": "Eliminando…",
  "bot.setup.title": "Título",
  "bot.setup.whatItDoes": "Qué hace",
  "bot.setup.identity": "Identidad",
  "bot.setup.systemOwned": "Propiedad del sistema",
  "bot.setup.systemOwnedDescription":
    "Viene con {product}. No pertenece a ninguna persona.",
  "bot.setup.visibility": "Visibilidad",
  "bot.setup.visiblePrivate":
    "Solo tú puedes verlo y empezar conversaciones con él.",
  "bot.setup.visiblePublic":
    "Todo el mundo en {product} puede encontrarlo y usarlo.",
  "bot.setup.private": "Privado",
  "bot.setup.public": "Público",
  "bot.setup.saveError": "No se ha podido guardar. Inténtalo de nuevo.",
  "bot.setup.checkField": "Revisa este campo e inténtalo de nuevo.",
  "bot.setup.connection": "Conexión",
  "bot.setup.builtIn": "Integrado",
  "bot.setup.agentUrl": "URL del agente",
  "bot.setup.builtInDescription":
    "Funciona dentro de {product}. No hay nada que conectar.",
  "bot.sharing.published": "Publicado",
  "bot.sharing.toWholeTeam": "Para todo el equipo",
  "bot.sharing.toPeople": "Para {who}",
  "bot.sharing.groupNamed": "grupo {name}",
  "bot.sharing.teamPrivate":
    "Las conversaciones de cada persona con él son privadas.",
  "bot.sharing.notVisibleYet":
    "Los miembros del equipo no lo ven hasta que tenga un nombre y una descripción reales.",
  "bot.sharing.unpublish": "Dejar de publicar",
  "bot.sharing.link": "Enlace",
  "bot.sharing.linkDescription": "Abre una conversación privada con él.",
  "bot.sharing.copyLink": "Copiar enlace",
  "bot.sharing.publicNotPublished":
    "No publicado para el equipo. Es público, así que todo el mundo en {product} ya puede usarlo.",
  "bot.sharing.onlyYouCanUse": "No publicado. Solo tú puedes usarlo.",
  "bot.sharing.notPublished": "No publicado.",
  "bot.sharing.whoPublishedTo": "A quién se publica",
  "bot.sharing.publish": "Publicar",
  "bot.sharing.publishNote":
    "Publicar no cambia su visibilidad. Puedes dejar de publicarlo en cualquier momento.",
  "bot.sharing.audience": "Destinatarios",
  "bot.sharing.notPublishedSummary": "No publicado",
  "bot.sharing.theWholeTeam": "Todo el equipo",
  "bot.sharing.specificPeople": "Personas o grupos concretos",
  "bot.sharing.peopleCount": {
    one: "{count} persona",
    many: "{count} de personas",
    other: "{count} personas",
  },
  "bot.sharing.groupCount": {
    one: "{count} grupo",
    many: "{count} de grupos",
    other: "{count} grupos",
  },
  "bot.sharing.assignToGroups": "Asignar a grupos",
  "bot.sharing.assignDescription":
    "Fija este asistente arriba en la lista de asistentes de cada miembro del grupo. Usa * para todo el equipo.",
  "bot.sharing.publishedTo": "Publicado para",
  "bot.sharing.peopleByEmail": "Personas, por correo",
  "bot.sharing.commaSeparated": "Separadas por comas",
  "bot.sharing.groups": "Grupos",
  "bot.sharing.update": "Actualizar",
  "bot.sharing.publishToTeam": "Publicar para el equipo",
  "bot.sharing.assignNamed": "Asignar {name} a un grupo",
  "bot.sharing.assignNote":
    "Queda fijado arriba en la lista de asistentes de cada miembro.",
  "bot.sharing.groupOrStar": "Grupo, o *",
  "bot.sharing.wholeTeamPlaceholder": "* para todo el equipo",
  "bot.sharing.assign": "Asignar",
  "bot.sharing.removeNamed": "Quitar {name}",
  "bot.sharing.wholeTeam": "Todo el equipo",
  "bot.sharing.notAssigned": "No asignado a ningún grupo.",
  "bot.sharing.assignRow": "Asignar a un grupo",
  "bot.page.accessPurpose":
    "Las habilidades, apps y otros asistentes que puede usar este asistente.",
  "bot.page.approvalsPurpose":
    "Lo que puede hacer este asistente sin preguntarte antes.",
  "bot.page.memoryPurpose":
    "Las apps de las que aprende este asistente y la investigación que hace para ti en segundo plano.",
  "bot.page.memoryPointer": "Lo que tus asistentes recuerdan de ti está en",
  "bot.page.reachPurpose":
    "Continúa una conversación con este asistente en Slack, Microsoft Teams o por mensaje de texto.",
  "bot.page.responsibilitiesPurpose":
    "Objetivos continuos en los que este asistente trabaja para ti. Mira qué inició cada ejecución y qué encontró.",
  "bot.page.routinesPurpose":
    "Lo que hace este asistente por ti según un horario. Desactiva una, ejecútala ahora o elimínala.",
  "bot.page.setupPurpose":
    "Quién es este asistente, quién puede encontrarlo y dónde funciona.",
  "bot.page.sharingPurpose":
    "Quién más puede usar este asistente. Las conversaciones de cada persona con él son privadas.",
  // The Bot sub-pages' contents (D181 stage 2e): memory sources, suggestions, reaching you, responsibilities
  // and routines, the summaries of lib/agents/bot-summaries.ts and the time phrases of lib/relative-time.ts.
  // Shared words reuse their existing keys (`botPage.fallbackTitle` is "Bot"); `bot.choose` is "Choose a Bot".
  "bot.choose": "Elige un asistente",
  "memory.addSource": "Añadir fuente",
  "memory.title": "Fuentes de las apps",
  "memory.description":
    "Aquí aparecen las apps que has conectado y que este asistente puede leer, y puedes añadir más. Las fuentes se actualizan cada 15 minutos. Solo este asistente ve lo que contienen.",
  "memory.empty": "Todavía no hay fuentes. Añade una con «Añadir fuente».",
  "memory.upToDate": "Al día",
  "memory.off": "Desactivada",
  "memory.lastRead": "Última lectura {when}",
  "memory.syncNow": "Sincronizar ahora",
  "memory.readNamed": "Leer {name}",
  "memory.addTitle": "Añadir una fuente",
  "memory.addDescription":
    "{product} la lee ahora y, después, cada 15 minutos mientras esté activada.",
  "memory.enterNumber": "Escribe un número para {name}.",
  "memory.cantShow":
    "Esta tiene ajustes que {product} no puede mostrar. Elige otra.",
  "memory.checkSettings": "Revisa los ajustes de la fuente.",
  "memory.whatToRead": "Qué leer",
  "memory.chooseWhat": "Elige qué leer",
  "memory.sourceName": "Nombre de la fuente",
  "memory.chooseValue": "Elige un valor",
  "memory.reading": "Leyendo la fuente…",
  "memory.addAndSync": "Añadir y sincronizar la fuente",
  "suggestions.everyHour": "Cada hora",
  "suggestions.every4Hours": "Cada 4 horas",
  "suggestions.twiceDay": "Dos veces al día",
  "suggestions.onceDay": "Una vez al día",
  "suggestions.everyMinutes": {
    one: "Cada {count} minuto",
    many: "Cada {count} de minutos",
    other: "Cada {count} minutos",
  },
  "suggestions.yourBot": "Tu asistente",
  "suggestions.title": "Próximos pasos sugeridos",
  "suggestions.from": "De {app}",
  "suggestions.connectedApp": "una app conectada",
  "suggestions.openRecord": "Abrir registro",
  "suggestions.startTask": "Iniciar como tarea",
  "suggestions.empty":
    "No hay sugerencias por ahora. Los asistentes con la investigación en segundo plano activada sugerirán aquí los próximos pasos.",
  "suggestions.turnOnResearch": "Activar la investigación",
  "suggestions.researchDescription":
    "Está desactivada hasta que la actives para este asistente, a menos que tu administrador la haya activado para todos. Cuando está activada, cada cuatro horas revisa las apps que ya puede leer, prepara memorias para que las revises y sugiere próximos pasos. Solo puede leer: no puede enviar mensajes, cambiar nada en una app ni usar un navegador o un ordenador. Si la desactivas o la quitas, se queda así.",
  "suggestions.researchTitle": "Investigación en segundo plano",
  "suggestions.researchOff":
    "La investigación en segundo plano está desactivada.",
  "suggestions.turnOnDialog": "Activar la investigación en segundo plano",
  "suggestions.turnOnDescription":
    "Lee según un horario y entrega lo que sugiere en un canal en el que está.",
  "suggestions.deliverTo": "Entregar las sugerencias a",
  "suggestions.chooseChannel": "Elige un canal",
  "suggestions.howOften": "Con qué frecuencia",
  "suggestions.focus": "Qué buscar (opcional)",
  "suggestions.off": "Desactivada",
  "suggestions.researchingNow": "Investigando ahora",
  "suggestions.lastRan": "Última ejecución {when}",
  "suggestions.turnOff": "Desactivar",
  "reaching.linkSlack": "Vincular Slack",
  "reaching.linkTeams": "Vincular Microsoft Teams",
  "reaching.connectPhone": "Conectar un teléfono",
  "reaching.sumSlack": "Continúa una conversación desde Slack.",
  "reaching.sumTeams": "Continúa una conversación desde Microsoft Teams.",
  "reaching.sumSms": "Continúa una conversación por mensaje de texto.",
  "reaching.codeOnWay":
    "Un código de verificación está en camino. Escríbelo para terminar.",
  "reaching.linkReady":
    "Tu código de vinculación está listo para enviar. Ábrelo para verlo de nuevo.",
  "reaching.smsNotSet":
    "Los mensajes de texto todavía no están configurados. Un administrador tiene que activarlos antes.",
  "reaching.notSet":
    "Todavía no está configurado. Un administrador tiene que activar Slack y Teams antes.",
  "reaching.pointerBefore":
    "Tus dispositivos, las entregas recientes y por dónde llega cada tipo de novedad están en",
  "reaching.connected": "Destinos conectados",
  "reaching.noDestinations": "No hay destinos conectados.",
  "reaching.optedOut": "Has enviado STOP. Envía START para reanudar.",
  "reaching.disconnect": "Desconectar",
  "reaching.channelNote":
    "En un canal de Slack o Teams que otras personas pueden leer, el asistente te responde en un mensaje directo.",
  "reaching.connectTitle": "Conectar una conversación",
  "reaching.oneAtATime":
    "Cada cuenta o número de teléfono funciona con una sola conversación a la vez. Vincularlo aquí lo traslada desde la conversación a la que está vinculado ahora.",
  "reaching.conversation": "Conversación",
  "reaching.chooseConversation": "Elige una conversación",
  "reaching.loadMore": "Cargar más conversaciones",
  "reaching.phoneNumber": "Número de teléfono",
  "reaching.sendCode": "Enviar código de verificación",
  "reaching.verificationCode": "Código de verificación",
  "reaching.confirmPhone": "Confirmar teléfono",
  "reaching.linkExpires": {
    one: "Envía este mensaje a la app de {product} en {platform} dentro de {count} minuto. Con él se vincula esa cuenta a esta conversación y a este asistente.",
    many: "Envía este mensaje a la app de {product} en {platform} dentro de {count} de minutos. Con él se vincula esa cuenta a esta conversación y a este asistente.",
    other:
      "Envía este mensaje a la app de {product} en {platform} dentro de {count} minutos. Con él se vincula esa cuenta a esta conversación y a este asistente.",
  },
  "responsibilities.new": "Nueva responsabilidad",
  "responsibilities.title": "Objetivos",
  "responsibilities.empty":
    "Todavía no hay responsabilidades. Añade una con «Nueva responsabilidad».",
  "responsibilities.emptyBot":
    "Este asistente todavía no tiene responsabilidades. Añade una con «Nueva responsabilidad».",
  "routines.neverRun": "Todavía no se ha ejecutado",
  "routines.running": "En marcha…",
  "routines.missed": "Perdida {when}",
  "routines.failed": "Falló {when}",
  "routines.skipped": "Omitida {when}",
  "routines.ran": "Se ejecutó {when}",
  "routines.finished": "Terminó {when}",
  "routines.noRuns": "Todavía no hay ejecuciones.",
  "routines.runNow": "Ejecutar ahora",
  "routines.triggered": "Disparada",
  "routines.scheduled": "Programada",
  "routines.sweepChecked":
    "{product} las revisó por última vez {when}. Ninguna se ejecutará hasta que vuelva a arrancar. Si esto sigue pasando, pide a un administrador que lo revise.",
  "routines.sweepNever":
    "{product} todavía no ha empezado a ejecutar rutinas, así que ninguna de estas se ejecutará. Pide a un administrador que lo configure.",
  "routines.notRunning": "Las rutinas no se están ejecutando.",
  "routines.loadError":
    "No se han podido cargar tus rutinas. Recarga la página.",
  "routines.emptyBot":
    "Este asistente todavía no tiene rutinas. Pídele algo como «cada día laborable a las 9, envíame…» y aparecerá aquí.",
  "routines.empty":
    "Todavía no tienes rutinas. Pide a un asistente algo como «cada día laborable a las 9, envíame…» y aparecerá aquí.",
  "routines.enableAria": "Activar la rutina programada {schedule}",
  "routines.channelGone": "Conversación eliminada",
  "routines.untitledChannel": "Conversación sin título",
  "routines.due": "Pendiente",
  "routines.next": "Próxima: {when}",
  "routines.runNowTitle":
    "La ejecuta ahora, de verdad. El asistente hace el trabajo y publica en la conversación.",
  "routines.pausedTurnOn": "Esta rutina está en pausa. Actívala primero.",
  "routines.runNowAria": "Ejecutar ahora la rutina programada {schedule}",
  "routines.historyAria":
    "Historial de ejecuciones de la rutina programada {schedule}",
  "routines.history": "Historial",
  "routines.deleteAria": "Eliminar la rutina programada {schedule}",
  "routines.deleteTitle": "¿Eliminar «{schedule}»?",
  "routines.deleteDescription":
    "Esta rutina se detiene para siempre. No se puede deshacer.",
  "routines.week": "Semana",
  "routines.nextRuns": "Próximas ejecuciones",
  "routines.viewAria": "Ver",
  "summary.nothingGranted": "Nada concedido",
  "summary.skills": {
    one: "{count} habilidad",
    many: "{count} de habilidades",
    other: "{count} habilidades",
  },
  "summary.apps": {
    one: "{count} app",
    many: "{count} de apps",
    other: "{count} apps",
  },
  "summary.everyonePublic": "Todo el mundo (público)",
  "summary.notShared": "No compartido",
  "summary.specificPeople": "Personas o grupos concretos",
  "summary.onlyIn": "Solo en {product}",
  "summary.nothingConnected": "Nada conectado",
  "summary.sources": {
    one: "{count} fuente",
    many: "{count} de fuentes",
    other: "{count} fuentes",
  },
  "summary.researchOn": "Investigación en segundo plano activada",
  "summary.researchOnAfter": "investigación en segundo plano activada",
  "time.justNow": "ahora mismo",
  "time.minutesAgo": {
    one: "hace {count} min",
    many: "hace {count} de minutos",
    other: "hace {count} min",
  },
  "time.hoursAgo": {
    one: "hace {count} h",
    many: "hace {count} de horas",
    other: "hace {count} h",
  },
  "time.yesterday": "ayer",
  "time.daysAgo": {
    one: "hace {count} día",
    many: "hace {count} de días",
    other: "hace {count} días",
  },
  "time.weeksAgo": {
    one: "hace {count} sem",
    many: "hace {count} de semanas",
    other: "hace {count} sem",
  },
  "time.recently": "hace poco",
  // Stage 2f (D181): the approval rules, the responsibility dialog, the routine history, Passwords.
  "approvals.behaviour.allow": "Actuar sin preguntar",
  "approvals.behaviour.preApproved": "Actuar si está aprobado de antemano",
  "approvals.behaviour.ask": "Preguntar antes de actuar",
  "approvals.behaviour.handOff": "Traspasarlo a ti",
  "approvals.host.ask": "Preguntar cada vez",
  "approvals.host.allow": "Permitir siempre",
  "approvals.host.never": "Nunca",
  "approvals.teamRule": "{label} (regla del equipo)",
  "approvals.matchOn": "en {scope}",
  "approvals.matchFor": "para {bot}",
  "approvals.locked": "Bloqueada",
  "approvals.behaviourFor": "Comportamiento para {tool}",
  "approvals.formLead":
    "Una herramienta o app, y lo que hace un asistente antes de usarla.",
  "approvals.formHelp":
    "Usa * para que coincida con cualquier valor. mcp/gmail/* significa todas las herramientas de Gmail. Un destino *.example.com significa cada página de ese sitio.",
  "approvals.field.tool": "Herramienta o app",
  "approvals.field.effect": "Tipo de acción",
  "approvals.field.scope": "Destino",
  "approvals.field.scopeHint":
    "*, un sitio, una carpeta, el nombre de un asistente",
  "approvals.field.bot": "Asistente",
  "approvals.field.botHint": "* para todos los asistentes",
  "approvals.field.behaviour": "Comportamiento",
  "approvals.saveRule": "Guardar regla",
  "approvals.addRule": "Añadir una regla",
  "approvals.rulesOff":
    "Un administrador ha desactivado las reglas personales. Las tuyas se conservan, pero no se aplican.",
  "approvals.bot.lead":
    "Gana la regla más estricta de las que coinciden. Una regla «preguntar» vence a una regla «permitir». Las reglas de todos los asistentes están en",
  "approvals.bot.settingsLink": "Ajustes → Aprobaciones",
  "approvals.bot.title": "Reglas",
  "approvals.bot.empty": "No hay reglas para este asistente.",
  "approvals.adminLead":
    "Los ajustes del equipo y las solicitudes de cuentas compartidas están en",
  "approvals.adminLink": "Administración → Aprobaciones",
  "approvals.before.title": "Antes de que actúe un asistente",
  "approvals.before.askTitle": "Preguntar antes de hacer cambios",
  "approvals.before.askLine":
    "Revisa los cambios de un asistente en sitios web, apps conectadas y archivos.",
  "approvals.before.autoTitle": "Revisión automática",
  "approvals.before.autoEnforced": "Un administrador lo exige.",
  "approvals.before.autoLine":
    "Antes de que un asistente haga algo que pueda afectar a tus cuentas o compartir información, {product} lo comprueba con tu petición y tus reglas. Si no puede saberlo, te lo pregunta.",
  "approvals.before.hostTitle": "Comandos en tu ordenador",
  "approvals.before.hostLimited": "Un administrador lo limita a «{limit}».",
  "approvals.before.hostLine":
    "La app de escritorio de {product} te muestra igualmente cada comando antes de ejecutarlo.",
  "approvals.every.lead":
    "Gana la regla más estricta de las que coinciden. Una regla «preguntar» vence a una regla «permitir». Las reglas del equipo están bloqueadas. Las contraseñas y los ajustes de seguridad siempre se traspasan a ti, y también los pagos, a menos que actives Full access para un asistente más abajo. Las reglas de un solo asistente están en",
  "approvals.every.botPage": "la página de ese asistente",
  "approvals.every.title": "Reglas de todos los asistentes",
  "approvals.every.empty": "Todavía no hay reglas.",
  "approvals.other.lead":
    "Estas no coinciden con ningún asistente que puedas abrir. Siguen aplicándose a cualquier asistente con el que coincidan. Elimina las que no quieras.",
  "approvals.other.title": "Reglas de otros asistentes",
  "approvals.page.description":
    "Elige cuándo tus asistentes preguntan antes de cambiar cosas. Las reglas de aquí se aplican a todos ellos.",
  "approvals.admin.description":
    "Lo que deben preguntar los asistentes de los miembros antes de actuar, las reglas para todos y las solicitudes para usar cuentas compartidas.",
  "approvals.team.title": "Ajustes del equipo",
  "approvals.team.enforce": "Exigir la revisión automática a todos",
  "approvals.team.custom": "Dejar que los miembros definan sus propias reglas",
  "approvals.team.hostTitle":
    "Comandos en los ordenadores de los miembros, como máximo",
  "approvals.team.hostLine":
    "El ajuste más estricto que haya puesto un miembro sigue aplicándose.",
  "approvals.team.rulesLead":
    "Se aplican a los asistentes de cada miembro. Los miembros no pueden cambiarlas.",
  "approvals.team.rulesTitle": "Reglas del equipo",
  "approvals.team.empty": "No hay reglas del equipo.",
  "approvals.team.addRule": "Añadir una regla del equipo",
  "approvals.shared.title": "Solicitudes de cuentas compartidas",
  "approvals.shared.wants":
    "{bot} quiere usar la cuenta compartida de {account}",
  "approvals.shared.why.refusedCall":
    "Se bloqueó una acción. Este asistente llega a más personas de las aprobadas.",
  "approvals.shared.why.publish":
    "Su propietario amplió quién puede contactarlo.",
  "approvals.shared.why.trigger":
    "Su propietario añadió un disparador que deja que mensajes externos lo dirijan.",
  "approvals.shared.why.grant": "Se le dieron las acciones de la app.",
  "approvals.shared.now": "Ahora:",
  "approvals.shared.notApproved": "No aprobado",
  "approvals.shared.asked": "Solicitado:",
  "approvals.shared.approve": "Aprobar",
  "approvals.shared.decline": "Rechazar",
  "tasks.updated": "Actualizada {ago}",
  "routines.status.running": "En marcha",
  "routines.status.succeeded": "Correcta",
  "routines.status.failed": "Fallida",
  "routines.status.skipped": "Omitida",
  "routines.status.waiting": "Pendiente de ti",
  "routines.status.missed": "Perdida",
  "routines.history.empty":
    "Todavía no hay ejecuciones. Una ejecución aparece aquí cuando una rutina se ha disparado, o después de que pulses «Ejecutar ahora».",
  "routines.history.aBot": "Un asistente",
  "routines.history.latest": {
    one: "Mostrando la última ejecución.",
    many: "Mostrando las últimas {count} de ejecuciones.",
    other: "Mostrando las últimas {count} ejecuciones.",
  },
  "routines.history.deleted": "Una rutina que se ha eliminado desde entonces",
  "routines.history.waitingNote":
    "Esperando tu aprobación. Abre la conversación para responder.",
  "responsibilities.status.completed": "Completada",
  "responsibilities.summary.paused":
    "Nada la pone en marcha hasta que la reanudes",
  "responsibilities.summary.trigger": "Disparador de {kind}",
  "responsibilities.summary.starts": "Empieza con {starts}",
  "responsibilities.summary.asked": "Se ejecuta cuando lo pidas",
  "responsibilities.source.manual": "Manual",
  "responsibilities.source.schedule": "Horario",
  "responsibilities.source.connector": "App conectada",
  "responsibilities.progress": "Progreso",
  "responsibilities.lastResult": "Último resultado",
  "responsibilities.activeOn": "Sus eventos y disparadores la inician.",
  "responsibilities.activeOff": "En pausa. Sus disparadores no la inician.",
  "responsibilities.runNowLine":
    "La ejecuta ahora, de verdad. El asistente hace el trabajo y puede publicar y realizar acciones.",
  "responsibilities.complete": "Completar",
  "responsibilities.completeLine":
    "Márcala como terminada. Después, nada la pone en marcha.",
  "responsibilities.field.title": "Título",
  "responsibilities.field.instruction": "Instrucción",
  "responsibilities.field.criteria": "Criterios de éxito",
  "responsibilities.events": "Eventos",
  "responsibilities.saving": "Guardando…",
  "responsibilities.run.queued": "En cola",
  "responsibilities.run.waiting":
    "Esperando {kind}. Responde arriba, en la página de este asistente, o en la conversación.",
  "responsibilities.runs": "Ejecuciones",
  "responsibilities.viewRuns": "Ver ejecuciones",
  "responsibilities.hideRuns": "Ocultar ejecuciones",
  "passwords.description":
    "Accesos que guardaste cuando hiciste que un asistente iniciara sesión en un sitio web. Los asistentes nunca los ven, y tú confirmas cada uso.",
  "passwords.saved": "Accesos guardados",
  "passwords.loadError":
    "No se han podido cargar tus contraseñas. Recarga la página.",
  "passwords.off":
    "Un administrador ha desactivado las contraseñas guardadas. Tus accesos se conservan, pero no se ofrecerán.",
  "passwords.empty":
    "No hay accesos guardados. Elige «Guardar en Contraseñas» cuando hagas que un asistente inicie sesión en un sitio web.",
  "passwords.lastUsed": "último uso: {date}",
  "passwords.neverUsed": "sin usar",
  "passwords.deleteAria": "Eliminar el acceso de {origin}",
  "settings.notificationsPage":
    "Por dónde te llegan las novedades de tus asistentes cuando estás fuera. Ajusta cuánto envía cada asistente en su propia página.",
  "fullaccess.label.noPayments": "Full access sin pagos",
  "fullaccess.label.full": "Full access",
  "fullaccess.off": "Desactivado",
  "fullaccess.description":
    "Seguro por defecto: tus asistentes preguntan antes de enviar, pagar, firmar, reservar o eliminar. Para cada asistente puedes elegir que haga esto sin preguntar.",
  "fullaccess.offTerm": "Desactivado:",
  "fullaccess.offText":
    "el asistente pregunta antes de enviar, pagar, firmar, reservar o eliminar.",
  "fullaccess.noPaymentsTerm": "Full access sin pagos:",
  "fullaccess.noPaymentsText":
    "envía, firma, reserva y elimina sin preguntar. Los pagos y las compras te siguen preguntando a ti.",
  "fullaccess.fullTerm": "Full access:",
  "fullaccess.fullText":
    "también paga y compra sin preguntar. No hay límite en el importe hasta que existan límites de gasto (previstos para v0.4).",
  "fullaccess.askTitle": "¿Dar {label} a {name}?",
  "fullaccess.give": "Dar {label}",
  "fullaccess.full.p1":
    "{name} enviará, pagará, firmará, reservará y eliminará sin preguntarte antes. Puede actuar según lo que lee, como un correo o una página web, así que actívalo solo si confías en él para eso.",
  "fullaccess.full.p2":
    "No hay límite en el importe que puede pagar: todavía no existen límites de gasto (están previstos para v0.4). Para que los pagos y las compras te sigan preguntando, elige en su lugar Full access sin pagos.",
  "fullaccess.full.p3":
    "Las contraseñas y los ajustes de seguridad siguen necesitándote a ti. Cuando hay un revisor automático configurado, este también lee una vez cada comando y script que el miembro ejecuta en su ordenador, aunque hayas desactivado el revisor; cuando no hay ninguno configurado, no se lee ningún comando. Esto se aplica a lo que pides en tus propios chats, no a las rutinas ni a los check-ins. Puedes desactivarlo en cualquier momento y se detiene al instante.",
  "fullaccess.noPayments.p1":
    "{name} enviará, firmará, reservará y eliminará sin preguntarte antes. Los pagos y las compras te siguen preguntando a ti. Puede actuar según lo que lee, como un correo o una página web, así que actívalo solo si confías en él para eso.",
  "fullaccess.noPayments.p2":
    "La app reconoce un pago con sus comprobaciones integradas, así que un mensaje que solo menciona un pago también puede preguntar, y un pago redactado de forma poco habitual podría no detectarse. Las contraseñas y los ajustes de seguridad siguen necesitándote a ti. Cuando hay un revisor automático configurado, este también lee una vez cada comando y script que el miembro ejecuta en su ordenador cuando se trata de una contraseña, un ajuste de seguridad o un pago hecho de ese modo, aunque hayas desactivado el revisor; cuando no hay ninguno configurado, no se lee ningún comando. Esto se aplica a lo que pides en tus propios chats, no a las rutinas ni a los check-ins. Puedes desactivarlo en cualquier momento y se detiene al instante.",
  "fullaccess.noBots": "Aún no hay asistentes.",
  "fullaccess.legend": "Acceso para {name}",
  "fullaccess.radioAria": "{label} para {name}",
  "fullaccess.summary.off":
    "Pregunta antes de enviar, pagar, firmar, reservar o eliminar.",
  "fullaccess.summary.noPayments":
    "Actúa sin preguntar, salvo que los pagos y las compras te siguen preguntando a ti. Desde {since}.",
  "fullaccess.summary.full":
    "Actúa sin preguntar, pagos incluidos, sin límite en el importe. Desde {since}.",
  "fullaccess.doneTitle": "Hecho sin preguntar",
  "fullaccess.doneDescription":
    "Lo que un asistente con Full access hizo sin preguntarte, de lo más reciente a lo más antiguo.",
  "fullaccess.nothingYet": "Todavía nada.",
  "approvals.audience.owner": "Solo su propietario",
  "approvals.audience.team": "Todos",
  "approvals.audience.outside": ", y entradas de fuera",
  "approvals.audience.nobody": "Nadie indicado",
  "approvals.audience.groups": {
    one: "El grupo {names}",
    other: "Los grupos {names}",
  },
  "approvals.audience.people": {
    one: "{count} persona",
    other: "{count} personas",
  },
  "approvals.audience.join": "{a} y {b}",
  "access.req.title": "Solicitudes",
  "access.req.loadError":
    "No se pudieron cargar las solicitudes de acceso. Recarga la página.",
  "access.req.descApp":
    "Personas que piden esta app. Aprobar hace lo que pidieron, enseguida.",
  "access.req.descAll":
    "Personas que piden que se active una app, se dé a un asistente o se conecte. Aprobar hace lo que pidieron, enseguida.",
  "access.req.aBot": "un asistente",
  "access.req.theBot": "el asistente",
  "access.req.somebody": "Alguien",
  "access.req.enable": "Activar {app} para {bot}",
  "access.req.grantMore": "Dar a {bot} más de {app}: {list}",
  "access.req.grant": "Dar {app} a {bot}",
  "access.req.connectShared": "Conectar la cuenta compartida de {app}",
  "access.req.asked": "{who} lo pidió {when}{forBot}.",
  "access.req.forBot": ", para {bot}",
  "access.req.approving": "Aprobando…",
  "access.req.botPage": "la página del asistente en {app}",
  "access.req.toolRead": "{name} (solo lectura)",
  "access.req.toolWrite": "{name} (cambia algo)",
  "access.req.gives":
    "Aprobar da a {bot} exactamente estas herramientas y nada más: {list}.",
  "access.req.readOnly":
    "Aprobar da a {bot} solo las acciones de solo lectura de {app}. Elige las demás en {page}.",
  "access.req.canSend": {
    one: "{names} puede enviar en nombre de la persona.",
    other: "{names} pueden enviar cada uno en nombre de la persona.",
  },
  "access.req.unreviewed": {
    one: "Ninguna lista revisada indica qué hace {names} en {app}, así que puede enviar en nombre de la persona.",
    other:
      "Ninguna lista revisada indica qué hacen {names} en {app}, así que cada uno puede enviar en nombre de la persona.",
  },
  "access.req.neverGives": {
    one: "Aprobar nunca da una herramienta así: permítela en los ajustes, en {page}.",
    other:
      "Aprobar nunca da herramientas así: permítelas en los ajustes, en {page}.",
  },
  "access.req.and": "{a} y {b}",
  "passwords.saveTo": "Guardar en Contraseñas",
  "responsibilities.run.waitKind.approval": "tu aprobación",
  "responsibilities.run.waitKind.question": "tu respuesta",
  "responsibilities.run.waitKind.handoff": "que tomes el relevo",
  "responsibilities.run.waitKind.signIn": "que inicies sesión",
  "responsibilities.run.waitKind.other": "tu intervención",
  "responsibilities.new.description":
    "Un objetivo continuo. El asistente trabaja en él en la conversación que elijas.",
  "responsibilities.new.chooseConversation": "Elige una conversación",
  "responsibilities.new.loadMore": "Cargar más conversaciones",
  "responsibilities.new.titleExample": "Mantener al día el informe de clientes",
  "responsibilities.new.criteriaExample":
    "El informe contiene el gráfico del trimestre actual y un enlace a la fuente.",
  "responsibilities.new.eventSource": "Origen del evento",
  "responsibilities.new.source.none": "Ejecutar cuando se pida",
  "responsibilities.new.githubHelp":
    "Los eventos vienen de los repositorios que conectaste en {link}.",
  "responsibilities.new.eventType": "Tipo de evento",
  "responsibilities.new.creating": "Creando…",
  "responsibilities.new.create": "Crear responsabilidad",
  "triggers.kind.email": "Correo",
  "triggers.help.webhook":
    "Haz un POST de JSON a esta URL con la cabecera Authorization, o con las cabeceras de firma de Standard Webhooks. Un 200 significa que se recibió, no que la ejecución terminó.",
  "triggers.help.github":
    "En Settings → Webhooks del repositorio, pon esta URL como payload URL, application/json como content type y la clave como secret.",
  "triggers.help.linear":
    "En Linear, Settings → API → Webhooks: indica la URL y pega aquí el signing secret que muestra Linear.",
  "triggers.help.sentry":
    "En una integración interna de Sentry, indica la URL del webhook y pega aquí el client secret de la integración.",
  "triggers.help.pagerduty":
    "En PagerDuty, Integrations → Generic Webhooks (v3): indica la URL y pega aquí el secret que se muestra al crearlo.",
  "triggers.help.email":
    "Envía o reenvía correo a esta dirección para iniciar una ejecución.",
  "triggers.help.slack":
    "Se inicia con los eventos de Slack que recibe este asistente. Los mensajes enviados antes de añadir el disparador se ignoran.",
  "triggers.slack.mention": "Se menciona al asistente",
  "triggers.slack.phrase": "Un mensaje contiene una frase",
  "triggers.slack.reaction": "Se añade una reacción",
  "triggers.slack.message": "Cualquier mensaje",
  "triggers.f.inChannels": "en {channels}",
  "triggers.f.everyChannel":
    "en todos los canales en los que está el asistente",
  "triggers.f.mention": "cuando se menciona al asistente",
  "triggers.f.anyMessage": "con cualquier mensaje",
  "triggers.f.phrases": "con mensajes que contienen {phrases}",
  "triggers.f.or": " o ",
  "triggers.f.reactions": "con reacciones",
  "triggers.f.slack": "{what} {where} (espacio de trabajo {team})",
  "triggers.f.events": "eventos {types}",
  "triggers.f.everyEvent": "todos los eventos",
  "triggers.f.where": "cuando {path} = {equals}",
  "triggers.f.from": "de {from}",
  "triggers.f.fromSenders": "de {senders} (autenticado)",
  "triggers.title": "Disparadores",
  "triggers.add": "Añadir disparador",
  "triggers.notActive.paused":
    "Esta responsabilidad está en pausa. Sus disparadores no la inician.",
  "triggers.notActive.completed":
    "Esta responsabilidad está completada. Sus disparadores no la inician.",
  "triggers.none":
    "Sin disparadores. Se ejecuta cuando pulsas Ejecutar ahora, o con los eventos de arriba.",
  "triggers.removeForGood": "Quitar para siempre",
  "triggers.keep": "Conservar",
  "triggers.runOnAria": "Ejecutar con este disparador de {kind}",
  "triggers.postTo": "POST a",
  "triggers.copyUrl": "Copiar URL",
  "triggers.copyAddress": "Copiar dirección",
  "triggers.emailOff":
    "El correo todavía no está configurado en {product}, así que esta dirección no puede recibir correo. Un administrador tiene que activarlo.",
  "triggers.key": "Clave",
  "triggers.copyKey": "Copiar clave",
  "triggers.copyHeader": "Copiar cabecera",
  "triggers.showKey": "Mostrar clave",
  "triggers.replaceKey": "Sustituir clave",
  "triggers.secretSaved": "Signing secret guardado",
  "triggers.secretWaiting": "Esperando el signing secret",
  "triggers.secret": "Signing secret",
  "triggers.pasteNew": "Pega un secret nuevo para sustituirlo",
  "triggers.paste": "Pega el signing secret",
  "triggers.saveSecret": "Guardar secret",
  "triggers.addDescription":
    "Algo ajeno a {product} que inicia esta responsabilidad.",
  "triggers.slackTeam": "ID del equipo de Slack",
  "triggers.fireOn": "Disparar con",
  "triggers.phrases": "Frases (separadas por comas)",
  "triggers.reactions": "Reacciones (vacío: cualquiera)",
  "triggers.channelIds":
    "ID de canales (vacío: todos en los que está el asistente)",
  "triggers.eventTypes": "Tipos de evento",
  "triggers.onlyWhen": "Solo cuando el campo",
  "triggers.equals": "es igual a",
  "triggers.repository": "Repositorio (opcional)",
  "triggers.senders": "Remitentes permitidos (vacío: nadie)",
  "triggers.secretLater": "Signing secret (se puede añadir después)",
  "triggers.adding": "Añadiendo…",
  "triggers.addKind": "Añadir disparador de {kind}",
  "triggers.example.webhook": "deploy.finished (vacío: cualquiera)",
  "routines.cal.intro":
    "Los próximos {days} días, para las rutinas que están activadas. Las horas están en tu zona horaria.",
  "routines.cal.none":
    "Todavía no hay rutinas, así que no hay nada programado.",
  "routines.cal.noneOn":
    "Ninguna de estas rutinas está activada, así que ninguna se ejecutará.",
  "routines.cal.nothing": "No hay nada programado en los próximos {days} días.",
  "routines.cal.truncated":
    "Solo se listan las primeras {max} ejecuciones de estos {days} días.",
  "routines.cal.paused": {
    one: "{count} rutina en pausa, por eso no aparece aquí. Activa una para ver cuándo se ejecuta.",
    other:
      "{count} rutinas en pausa, por eso no aparecen aquí. Activa una para ver cuándo se ejecuta.",
  },
  "routines.week.nothing":
    "No hay nada programado para el resto de esta semana.",
  "routines.week.label": "Esta semana",
  "routines.week.today": "hoy",
  "routines.week.now": "Ahora, {time}",
  "routines.week.next": "Siguiente:",
  "routines.week.nothingElse": "No hay nada más programado esta semana.",
  "routines.week.truncated":
    "Solo se listan las primeras ejecuciones de los próximos días, así que una rutina muy activa puede no aparecer todos los días.",
  "routines.week.historyError":
    "No se pudieron cargar las ejecuciones que ya ocurrieron, así que no se muestran.",
  "routines.week.note":
    "Las horas están en tu zona horaria. Una rutina que se ejecuta más de una vez por hora aparece como un solo bloque del día.",
  "routines.week.summary": "{count} ejecuciones, cada ~{minutes} min",
  "routines.week.gone": "{label}, conversación eliminada",
  "routines.card.label": "Rutina",
  "routines.card.cancelled": "Rutina cancelada",
  "routines.card.readError": "No se pudo leer esta rutina.",
  "routines.card.reading": "Leyendo esta rutina…",
  "routines.card.gone": "Esta rutina ya no existe",
  "routines.card.cannotSend":
    "Esta conversación no puede recibir un mensaje ahora mismo. Escribe el cambio en el cuadro de mensaje de abajo.",
  "routines.card.confirm": "¿Cancelar esta rutina?",
  "routines.card.yes": "Sí, cancelarla",
  "routines.card.no": "No, conservarla",
  "routines.card.pause": "Pausar",
  "routines.card.resume": "Reanudar",
  "routines.card.edit": "Editar",
  "routines.card.whatChange": "¿Qué debería cambiar?",
  "routines.card.send": "Enviar cambio",
  "routines.card.writeBelow":
    "Escribe el cambio en el cuadro de mensaje de abajo.",
  "routines.card.close": "Cerrar",
  "admin.boundaries.title": "Límites",
  "admin.boundaries.descLead":
    "Lo que un asistente puede y no puede hacer con su ordenador. Cada acción se comprueba antes de que ocurra. Los rechazos aparecen en",
  "admin.boundaries.descAudit": "Auditoría",
  "admin.boundaries.descTail": "con la regla que los rechazó.",
  "admin.boundaries.whenTitle": "Cuando una regla coincide",
  "admin.boundaries.whenDesc":
    "Detener la acción, o registrarla y dejarla pasar. Registrar te permite probar una regla con actividad real antes de que rechace nada.",
  "admin.boundaries.modeEnforce": "Detener la acción",
  "admin.boundaries.modeRecord": "Registrarla y permitirla",
  "admin.boundaries.modeEnforceNote":
    "El asistente se detiene y se le dice qué regla lo rechazó.",
  "admin.boundaries.modeRecordNote":
    "No se detiene nada. Cada coincidencia se registra como si se hubiera rechazado.",
  "admin.boundaries.neverTitle": "Los asistentes nunca pueden",
  "admin.boundaries.neverLead":
    "Se comprueba primero. Una coincidencia detiene la acción y se le dice al asistente qué regla la rechazó. Las reglas son CEL. Pueden comprobar",
  "admin.boundaries.neverMid1": ", el elemento, la tecla",
  "admin.boundaries.neverMid2": "pulsada, el archivo, el",
  "admin.boundaries.neverMid3": "ejecutado y",
  "admin.boundaries.neverMid4": "para herramientas externas.",
  "admin.boundaries.neverMid5": "dice qué inició la ejecución:",
  "admin.boundaries.neverTail":
    "Una ejecución programada actúa como su propietario, así que",
  "admin.boundaries.neverTail2":
    "por sí solo no puede decirte eso. Una regla que no se puede evaluar cuenta como coincidencia. Una errata nunca deja pasar una acción.",
  "admin.boundaries.or": "o",
  "admin.boundaries.noRules":
    "Sin reglas. Cada acción se permite y se registra.",
  "admin.boundaries.remove": "Quitar",
  "admin.boundaries.ruleLabel": "Una regla, escrita en CEL",
  "admin.boundaries.testing": "Probando…",
  "admin.boundaries.testFirst": "Probar primero",
  "admin.boundaries.addRule": "Añadir regla",
  "admin.boundaries.preset.form": "Nunca enviar un formulario",
  "admin.boundaries.preset.formCost":
    "También impide que el asistente pulse Intro en cualquier otro sitio. Un formulario puede enviarse con Intro en cualquier campo. No cubre elegir en un menú o en un campo de fecha, cuyo cambio puede enviar un formulario por sí solo.",
  "admin.boundaries.preset.password":
    "Nunca escribir en un campo de contraseña",
  "admin.boundaries.preset.passwordCost":
    "Un campo de contraseña con otra etiqueta no queda cubierto. La regla se basa en la etiqueta.",
  "admin.boundaries.preset.social": "Mantenerse fuera de las redes sociales",
  "admin.boundaries.preset.socialCost":
    "Solo estos dos hosts. Se permite un enlace que redirige allí desde otro sitio.",
  "admin.boundaries.otherwiseTitle": "En otro caso pueden",
  "admin.boundaries.otherwiseDesc":
    "Se aplica a todo lo que la lista de arriba no recogió. Una lista vacía aquí no permite nada, y se rechaza cada acción.",
  "admin.boundaries.allowAll": "true, todo lo que no se rechaza arriba",
  "admin.boundaries.saved":
    "Guardado. Se aplica a la próxima acción de cualquier asistente.",
  "admin.boundaries.footer":
    "Los cambios se aplican a la próxima acción de cualquier asistente. Se mantienen tras un reinicio.",
  "admin.boundaries.dry.none":
    "Aún no hay acciones del ordenador registradas para probar. La regla es válida. Verás qué recoge cuando los asistentes hayan actuado.",
  "admin.boundaries.dry.zero":
    "Probada con las últimas {scanned} acciones registradas. Esta regla no habría rechazado ninguna. Aun así puede coincidir con futuras.",
  "admin.boundaries.dry.some":
    "Probada con las últimas {scanned} acciones registradas. Esta regla habría rechazado {refused}.",
  "admin.boundaries.dry.wouldRefuse": "Rechazaría",
  "admin.boundaries.dry.wouldAllow": "Ahora permitiría",
  "admin.boundaries.dry.on": "en «{name}»",
  "admin.boundaries.dry.running": "ejecutando",
  "admin.boundaries.dry.touching": "tocando {file}",
  "admin.boundaries.dry.first":
    "Se muestran las primeras {shown}. El recuento de arriba abarca todo lo comprobado.",
  "admin.people.title": "Personas",
  "admin.people.desc":
    "Todas las personas que han iniciado sesión. Los administradores pueden abrir estas pantallas. Todos los demás hablan con los asistentes.",
  "admin.people.whoTitle": "Quién está aquí",
  "admin.people.whoDesc":
    "Las direcciones de INITIAL_ADMIN_EMAILS son siempre administradoras. No puedes cambiarlas aquí.",
  "admin.people.stopped": {
    one: "{count} ordenador detenido",
    many: "{count} de ordenadores detenidos",
    other: "{count} ordenadores detenidos",
  },
  "admin.people.stoppedFailed": ". {failed} no se pudieron detener",
  "admin.people.disksKept": ". Sus discos se conservan.",
  "admin.people.searchLabel": "Buscar personas",
  "admin.people.searchPlaceholder": "Buscar por nombre o dirección",
  "admin.people.loadError":
    "No se pudieron cargar las personas. Recarga la página.",
  "admin.people.noMatch": "Nadie coincide con «{query}».",
  "admin.people.nobody":
    "Todavía nadie ha iniciado sesión. Las personas aparecerán aquí cuando lo hagan.",
  "admin.people.lastSignedIn": "última sesión {date}",
  "admin.people.neverSignedIn": "nunca ha iniciado sesión",
  "admin.people.noProvider": "sin proveedor",
  "admin.people.accessRemoved": "Acceso retirado",
  "admin.people.adminByConfig": "Administrador por configuración",
  "admin.people.stopComputers": "Detener ordenadores",
  "admin.people.restore": "Restaurar",
  "admin.people.remove": "Quitar",
  "admin.people.adminSwitch": "Administrador: {email}",
  "admin.people.loading": "Cargando…",
  "admin.people.showMore": "Mostrar más",
  "admin.boundaries.and": "y",
  "admin.credentials.title": "Credenciales",
  "admin.credentials.add": "Añadir credencial",
  "admin.credentials.desc":
    "Claves y tokens de esta instalación. {product} nunca muestra un secreto después de guardarlo.",
  "admin.credentials.dialogDesc":
    "Se guarda para esta instalación. No volverás a ver el secreto.",
  "admin.credentials.type": "Tipo",
  "admin.credentials.model": "Modelo",
  "admin.credentials.connector": "Conector",
  "admin.credentials.provider": "Proveedor",
  "admin.credentials.keyId": "ID de clave",
  "admin.credentials.secret": "Secreto",
  "admin.credentials.replaces":
    "Esta clave ya tiene una credencial activa. Al guardar se sustituye y se revoca la anterior.",
  "admin.credentials.saveError":
    "No se pudo guardar la credencial. Inténtalo de nuevo.",
  "admin.credentials.cancel": "Cancelar",
  "admin.credentials.saving": "Guardando…",
  "admin.credentials.save": "Guardar credencial",
  "admin.credentials.savedTitle": "Credenciales guardadas",
  "admin.credentials.loadError":
    "No se pudieron cargar las credenciales. Recarga la página.",
  "admin.credentials.empty":
    "Aún no hay credenciales. Añade una con Añadir credencial.",
  "admin.credentials.revoked": "revocada",
  "admin.credentials.active": "activa",
  "admin.credentials.revoke": "Revocar",
  "admin.idp.title": "Proveedores de identidad",
  "admin.idp.add": "Añadir un proveedor",
  "admin.idp.desc":
    "El proveedor SAML u OpenID Connect propio de tu empresa. Las personas inician sesión con su correo, y su dominio elige el proveedor.",
  "admin.idp.registeredTitle": "Registrados",
  "admin.idp.registeredDesc":
    "Google, Microsoft y Okta se configuran en el entorno. No aparecen aquí.",
  "admin.idp.loadError":
    "No se pudieron cargar los proveedores de identidad. Recarga la página.",
  "admin.idp.empty":
    "Aún no hay proveedores de identidad. Añade uno con los metadatos de tu equipo de identidad.",
  "admin.idp.remove": "Quitar",
  "admin.idp.dialogTitle": "Añadir un proveedor de identidad",
  "admin.idp.name": "Nombre",
  "admin.idp.domain": "Dominio de correo",
  "admin.idp.domainNote":
    "Cualquiera con una dirección de este dominio inicia sesión aquí. Separa varios con comas.",
  "admin.idp.issuer": "Emisor",
  "admin.idp.signOnUrl": "URL de inicio de sesión",
  "admin.idp.metadata": "XML de metadatos",
  "admin.idp.metadataNote":
    "El archivo de tu equipo de identidad. Incluye el certificado de firma.",
  "admin.idp.clientId": "ID de cliente",
  "admin.idp.clientSecret": "Secreto de cliente",
  "admin.idp.cancel": "Cancelar",
  "admin.idp.adding": "Añadiendo…",
  "admin.idp.addShort": "Añadir",
  "admin.audit.decision.bot.declined": "El asistente rechazó",
  "admin.audit.decision.agent.stream_stalled": "El asistente dejó de responder",
  "admin.audit.decision.computer.policy_loaded": "Límite al arrancar",
  "admin.audit.decision.computer.isolation_loaded": "Aislamiento al arrancar",
  "admin.audit.decision.computer.control_taken": "Una persona tomó el control",
  "admin.audit.decision.computer.control_released":
    "El control volvió al asistente",
  "admin.audit.decision.computer.help_requested": "El asistente pidió ayuda",
  "admin.audit.decision.computer.secret_requested":
    "El asistente pidió un secreto",
  "admin.audit.decision.computer.secret_supplied":
    "Una persona proporcionó un secreto",
  "admin.audit.decision.computer.reset": "Se reinició el ordenador",
  "admin.audit.decision.computer.updated": "Se actualizó el ordenador",
  "admin.audit.decision.computer.stopped": "Una persona pulsó detener",
  "admin.audit.decision.component.granted": "Concedido a este asistente",
  "admin.audit.decision.component.revoked": "Retirado de este asistente",
  "admin.audit.decision.component.published":
    "Publicado. Todos los asistentes pueden usarlo",
  "admin.audit.decision.component.unpublished":
    "Despublicado. Ningún asistente puede usarlo",
  "admin.audit.decision.component.draft_saved":
    "Borrador guardado, aún sin publicar",
  "admin.audit.decision.component.refused": "Rechazado",
  "admin.audit.decision.component.function_granted": "Puede leer esto",
  "admin.audit.decision.component.function_revoked": "Ya no puede leer esto",
  "admin.audit.decision.component.function_called": "Leyó datos reales",
  "admin.audit.decision.component.function_refused": "Rechazado",
  "admin.audit.decision.component.function_failed": "No pudo leerlo",
  "admin.audit.decision.mcp.tools_discovered":
    "Herramientas ofrecidas para una ejecución",
  "admin.audit.decision.mcp.call_succeeded":
    "Llamado en nombre de este asistente",
  "admin.audit.decision.mcp.call_rejected": "Bloqueado",
  "admin.audit.decision.mcp.call_failed": "El servidor no respondió",
  "admin.audit.decision.mcp.callback_refused":
    "No pudo confirmar qué asistente era",
  "admin.audit.decision.configuration.changed": "Configuración cambiada",
  "admin.audit.decision.credential.created": "Credencial guardada",
  "admin.audit.discovery.under-floor":
    "Pocas herramientas, así que se ofrecieron todas",
  "admin.audit.discovery.nothing-declared":
    "Ninguna habilidad declara ninguna de estas herramientas",
  "admin.audit.discovery.unavailable":
    "No se pudo elegir, así que se ofrecieron todas",
  "admin.audit.discovery.nothing-chosen":
    "No se aplicó ninguna habilidad, así que se ofrecieron todas",
  "admin.audit.discovery.selected": "Elegidas por habilidad",
  "admin.audit.title": "Auditoría",
  "admin.audit.desc":
    "Cada acción que realizó un asistente y cada una que la política de esta instalación rechazó.",
  "admin.audit.export": "Exportar CSV",
  "admin.audit.exporting": "Exportando…",
  "admin.audit.refresh": "Actualizar",
  "admin.audit.exportFailed":
    "No se pudieron exportar los eventos de auditoría. Inténtalo de nuevo.",
  "admin.audit.filter.all": "Todo",
  "admin.audit.filter.computer": "Acciones del ordenador",
  "admin.audit.filter.blocked": "Bloqueado",
  "admin.audit.filter.didNot": "No ocurrió",
  "admin.audit.filter.nobody": "Nadie vigilando",
  "admin.audit.capped":
    "El archivo tiene los {count} eventos más recientes, no todos. Acota el filtro o las fechas para exportar el resto.",
  "admin.audit.loadError":
    "No se pudo cargar el registro de auditoría. Recarga la página.",
  "admin.audit.empty": "Todavía no hay eventos que coincidan con este filtro.",
  "admin.audit.col.when": "Cuándo",
  "admin.audit.col.what": "Qué",
  "admin.audit.col.on": "Sobre",
  "admin.audit.col.bot": "Asistente",
  "admin.audit.col.startedBy": "Iniciado por",
  "admin.audit.col.decision": "Decisión",
  "admin.audit.by.routine": "Una rutina",
  "admin.audit.by.handedOnBy": "Traspasado por {name}",
  "admin.audit.by.handedOn": "Traspasado",
  "admin.audit.by.memory": "Una fuente de memoria",
  "admin.audit.by.responsibility": "Una responsabilidad",
  "admin.audit.by.deployment": "Esta instalación",
  "admin.audit.by.remote": "Un navegador no emparejado con el ordenador",
  "admin.audit.by.person": "Una persona",
  "admin.audit.routed.mention": "La persona eligió este asistente",
  "admin.audit.routed.default": "Enviado al asistente predeterminado",
  "admin.audit.routed.meant": "Enviado al asistente al que iba dirigido",
  "admin.audit.toolsOf": "{offered} de {granted} herramientas",
  "admin.audit.blocked": "Bloqueado",
  "admin.audit.didNot": "No ocurrió",
  "admin.audit.allowed": "Permitido",
  "admin.audit.reportedByBot": ", comunicado por el propio asistente",
  "admin.audit.dryRun": "simulacro: registrado, no aplicado",
  "admin.nav.back": "Volver a la app",
  "admin.nav.overview": "Resumen",
  "admin.nav.reach": "A qué pueden llegar los asistentes",
  "admin.nav.do": "Qué pueden hacer los asistentes",
  "admin.nav.in": "Quién puede entrar",
  "admin.nav.happened": "Qué ha pasado",
  "admin.nav.credentials": "Credenciales",
  "admin.nav.boundaries": "Límites",
  "admin.nav.approvals": "Aprobaciones",
  "admin.nav.computers": "Ordenadores",
  "admin.nav.plugins": "Plugins",
  "admin.nav.skills": "Habilidades",
  "admin.nav.learning": "Aprendizaje automático",
  "admin.nav.components": "Componentes de la interfaz",
  "admin.nav.playground": "Playground",
  "admin.nav.people": "Personas",
  "admin.nav.idp": "Proveedores de identidad",
  "admin.nav.audit": "Auditoría",
  "admin.enterprise.mode.allow_all": "Permitir todo el acceso a la red",
  "admin.enterprise.mode.defaults_plus_allowlist":
    "Valores por defecto más lista de permitidos del equipo",
  "admin.enterprise.mode.allowlist_only":
    "Solo la lista de permitidos del equipo",
  "admin.enterprise.noPolicy":
    "Sin política. Los ordenadores de los asistentes pueden llegar a todo lo que permita el clúster",
  "admin.enterprise.locked": " · bloqueado",
  "admin.enterprise.loadError":
    "No se pudieron cargar los controles de empresa. Recarga la página.",
  "admin.enterprise.title": "Controles de empresa",
  "admin.enterprise.description":
    "Qué pueden usar los miembros, cómo llegan a la red los ordenadores de los asistentes y qué se registra. Cada cambio aparece en Auditoría.",
  "admin.enterprise.signin.description":
    "Las direcciones de {env} siempre pueden usar el inicio de sesión social como vía de emergencia. Cada uno de esos inicios de sesión aparece en Auditoría.",
  "admin.enterprise.signin.title": "Inicio de sesión",
  "admin.enterprise.sso.title": "Exigir SSO",
  "admin.enterprise.sso.on":
    "Las personas solo pueden iniciar sesión mediante un proveedor SAML u OpenID Connect registrado.",
  "admin.enterprise.sso.off":
    "Las personas también pueden iniciar sesión con Google, Microsoft u Okta.",
  "admin.enterprise.scim.title": "Aprovisionamiento SCIM",
  "admin.enterprise.scim.on":
    "URL base del directorio {url} con el token de portador {env}. Al desaprovisionar se cierran las sesiones, se bloquea la dirección, se retiran las credenciales de los conectores y se detienen sus ordenadores.",
  "admin.enterprise.scim.unsetUrl": "(define BETTER_AUTH_URL)",
  "admin.enterprise.scim.off":
    "Desactivado. Define {env} para aceptar el aprovisionamiento desde Okta, Entra u otro directorio.",
  "admin.enterprise.on": "Activado",
  "admin.enterprise.off": "Desactivado",
  "admin.enterprise.cap.description":
    "Cada interruptor se aplica a toda la organización. Un rol puede anularlo, y un grupo del directorio puede recibir una capacidad que la organización tiene desactivada.",
  "admin.enterprise.cap.title": "Capacidades",
  "admin.enterprise.cap.offFor":
    "Desactivada para todos, salvo que un rol o un grupo la active.",
  "admin.enterprise.over.title": "Excepciones por rol y por grupo",
  "admin.enterprise.over.none":
    "Ninguna. Todos reciben los interruptores de arriba",
  "admin.enterprise.over.set": "{count} definidas",
  "admin.enterprise.net.description":
    "A dónde pueden conectarse los ordenadores de los asistentes. Los cambios llegan a los ordenadores en marcha en segundos, sin reiniciar. La política de un grupo sustituye a la de la organización, salvo que esta esté bloqueada.",
  "admin.enterprise.net.title": "Red",
  "admin.enterprise.net.org": "Organización",
  "admin.enterprise.net.group": "Grupo: {name}",
  "admin.enterprise.net.addGroup": "Añadir una política de grupo",
  "admin.enterprise.mcp.description":
    "Con la lista de permitidos activada, los asistentes solo pueden llamar a herramientas de los servidores MCP aprobados aquí. Las llamadas a cualquier otro servidor se rechazan.",
  "admin.enterprise.mcp.title": "Servidores MCP",
  "admin.enterprise.mcp.only": "Solo servidores aprobados",
  "admin.enterprise.mcp.approved": "{count} aprobados",
  "admin.enterprise.mcp.offDesc":
    "Desactivado. Los asistentes pueden usar cualquier servidor registrado al que tengan acceso.",
  "admin.enterprise.mcp.onlyAria": "Solo servidores MCP aprobados",
  "admin.enterprise.mcp.approveAria": "Aprobar {name}",
  "admin.enterprise.models.description":
    "El asistente integrado funciona con {model}. Un asistente remoto elige el suyo, y el modelo que informa se registra.",
  "admin.enterprise.models.configured":
    "el modelo configurado en esta instalación",
  "admin.enterprise.models.title": "Modelos",
  "admin.enterprise.models.allowlist": "Lista de modelos permitidos",
  "admin.enterprise.models.allowlistOn":
    "Un asistente integrado con un modelo que no está en la lista se rechaza antes de ejecutarse.",
  "admin.enterprise.models.allowlistOff":
    "Desactivada. Se puede usar cualquier modelo.",
  "admin.enterprise.models.allowed": "Modelos permitidos",
  "admin.enterprise.models.none": "Ninguno en la lista",
  "admin.enterprise.models.listDesc":
    "Un modelo por línea, como proveedor/modelo, por ejemplo {example}.",
  "admin.enterprise.rec.description":
    "Define {env} para enviar los eventos de auditoría y las acciones de los asistentes a tu colector de OpenTelemetry o a tu SIEM. Llevan la etiqueta {tag}.",
  "admin.enterprise.rec.title": "Registro y exportación",
  "admin.enterprise.rec.action": "Action Recording",
  "admin.enterprise.rec.actionOn":
    "Los comandos de shell que ejecutan los asistentes se registran sin secretos y se conservan {days} días.",
  "admin.enterprise.rec.actionOff":
    "Desactivado. Los comandos solo aparecen en Auditoría.",
  "admin.enterprise.rec.otel": "Exportación a OpenTelemetry",
  "admin.enterprise.rec.otelOn": "Exportando por OTLP/HTTP.",
  "admin.enterprise.rec.otelOff":
    "Sin configurar. Define {env} en el servidor.",
  "admin.enterprise.comp.description":
    "Detener un ordenador cierra los asistentes que se ejecutan en él y conserva su disco. El asistente recibe un ordenador nuevo en la siguiente sesión. Para detener los ordenadores de una sola persona, ve a Personas.",
  "admin.enterprise.comp.title": "Ordenadores",
  "admin.enterprise.comp.stopInactive": "Detener los ordenadores inactivos",
  "admin.enterprise.comp.afterDays": "Tras {days} días sin uso",
  "admin.enterprise.usage.error":
    "No se pudo cargar el uso de modelos. Recarga la página.",
  "admin.enterprise.usage.empty":
    "Ninguna ejecución de asistentes en los últimos 30 días.",
  "admin.enterprise.usage.runs":
    "{runs} ejecuciones de {people} {who} en 30 días",
  "admin.enterprise.usage.person": "persona",
  "admin.enterprise.usage.people": "personas",
  "admin.enterprise.usage.refused":
    " · {count} fuera de la lista de permitidos",
  "admin.enterprise.recorded.error":
    "No se pudieron cargar las acciones registradas. Recarga la página.",
  "admin.enterprise.recorded.empty": "Aún no hay comandos registrados.",
  "admin.enterprise.recorded.local": "Equipo del miembro",
  "admin.enterprise.recorded.bot": "Asistente {id}",
  "admin.enterprise.sweep.stopping": "Deteniendo…",
  "admin.enterprise.sweep.now": "Detener ahora los ordenadores inactivos",
  "admin.enterprise.sweep.stopped": "{count} detenidos.",
  "admin.enterprise.ov.admins": "Administradores",
  "admin.enterprise.ov.members": "Miembros",
  "admin.enterprise.ov.group": "Grupo: {name}",
  "admin.enterprise.ov.scope": "Ámbito",
  "admin.enterprise.ov.groupNote":
    "Un grupo solo puede añadir. Conceder da a sus miembros la capacidad aunque la organización la tenga desactivada.",
  "admin.enterprise.ov.roleNote":
    "El ajuste de un rol sustituye al interruptor de la organización para todos los que tengan ese rol.",
  "admin.enterprise.ov.forScope": "{title} para {scope}",
  "admin.enterprise.ov.inherit": "Heredar",
  "admin.enterprise.ov.grant": "Conceder",
  "admin.enterprise.netd.org": "Política de red de la organización",
  "admin.enterprise.netd.group": "Política de red del grupo",
  "admin.enterprise.netd.groupLabel": "Grupo",
  "admin.enterprise.netd.mode": "Modo",
  "admin.enterprise.netd.allowlist": "Lista de permitidos",
  "admin.enterprise.netd.help":
    "Uno por línea. Un dominio cubre sus subdominios. *.nombre cubre solo subdominios. Un rango de IP puede indicar puertos. Por defecto están {first} y {more} hosts más de paquetes y de código fuente.",
  "admin.enterprise.netd.lock":
    "Bloquear para que los grupos no puedan sustituir esta política",
  "admin.enterprise.netd.remove": "Quitar la política",
  "admin.enterprise.days.label": "Días sin uso",
  "admin.enterprise.days.help": "0 lo desactiva. Se comprueba cada hora.",
  "admin.plugins.title": "Plugins",
  "admin.plugins.description":
    "A qué puede llegar esta instalación y qué asistentes pueden usarlo. Un plugin que añades es para todos. En su página eliges qué asistentes reciben sus herramientas.",
  "admin.plugins.loadError":
    "No se pudieron cargar los plugins. Recarga la página.",
  "admin.plugins.connected.description":
    "Añadidos para todos. Abre uno para configurarlo y elegir qué asistentes reciben sus herramientas.",
  "admin.plugins.connected.title": "Conectados",
  "admin.plugins.connected.empty":
    "Aún no hay nada conectado. Elige uno de la lista de abajo.",
  "admin.plugins.explore.description":
    "Servidores propios, revisados. Abre uno para añadirlo.",
  "admin.plugins.explore.title": "Explorar plugins",
  "admin.plugins.explore.empty":
    "Todos los plugins del catálogo están conectados.",
  "admin.plugins.notAdded": "No añadido",
  "admin.plugins.more.title": "Más apps",
  "admin.plugins.sum.notConnected": "No conectado",
  "admin.plugins.sum.noTools": "Aún sin herramientas",
  "admin.plugins.sum.tools": {
    one: "{count} herramienta",
    other: "{count} herramientas",
    many: "{count} de herramientas",
  },
  "admin.plugins.sum.toolsNoBots": "{tools} · sin asistentes",
  "admin.plugins.sum.bots": {
    one: "{count} asistente",
    other: "{count} asistentes",
    many: "{count} de asistentes",
  },
  "admin.plugins.requests": {
    one: "{count} solicitud",
    other: "{count} solicitudes",
    many: "{count} de solicitudes",
  },
  "admin.plugins.key.grant.none": "Ningún asistente",
  "admin.plugins.key.grant.one": "1 asistente",
  "admin.plugins.key.grant.all": "Todos los asistentes",
  "admin.plugins.key.grant.some": "{held} de {total} asistentes",
  "admin.plugins.key.held.none": "Ninguna herramienta",
  "admin.plugins.key.held.one": "1 herramienta",
  "admin.plugins.key.held.all": "Todas las herramientas",
  "admin.plugins.key.held.some": "{held} de {total} herramientas",
  "admin.plugins.key.notApproved": "No aprobado",
  "admin.plugins.key.unreadableTitle": "Tu cuenta",
  "admin.plugins.key.unreadable":
    "No se pudo comprobar si has conectado una cuenta aquí. Recarga la página, o revisa los registros de esta instalación si sigue ocurriendo.",
  "admin.plugins.key.noConsent":
    "{product} no recibió ningún enlace de consentimiento, así que no se conectó nada. Inténtalo de nuevo, o revisa la configuración de este conector si sigue ocurriendo.",
  "admin.plugins.key.reassurance":
    "La configuración está completa sin ella, y solo llega a tus documentos.",
  "admin.plugins.key.notPlugin.description":
    "No hay ningún plugin con ese nombre, ni aquí ni en el catálogo.",
  "admin.plugins.key.notPlugin.title": "No es un plugin",
  "admin.plugins.key.notPlugin.empty": "Nada que configurar.",
  "admin.plugins.key.enable.title": "Activar para esta instalación",
  "admin.plugins.key.enable.on":
    "Se pueden dar sus herramientas a los asistentes. Al desactivarlo, se quita y todos los asistentes pierden el acceso a sus herramientas.",
  "admin.plugins.key.enable.off":
    "Ningún asistente puede llegar a este proveedor. Actívalo para configurarlo y dar sus herramientas a los asistentes.",
  "admin.plugins.key.enable.aria": "Activar {title} para esta instalación",
  "admin.plugins.key.whose.title": "De quién es la cuenta",
  "admin.plugins.key.whose.shared": "Una cuenta compartida para todos.",
  "admin.plugins.key.whose.personal": "Cada persona conecta la suya.",
  "admin.plugins.key.whose.makePersonal": "Hacer personal",
  "admin.plugins.key.whose.makeShared": "Hacer compartida",
  "admin.plugins.key.conn.oauth":
    "Este proveedor responde como quien le pregunta. La instalación registra un cliente OAuth, y cada persona conecta su propia cuenta. Un asistente solo ve lo que esa persona puede ver.",
  "admin.plugins.key.conn.secret":
    "Este proveedor responde como quien le pregunta. Cada persona pega su propia contraseña de aplicación en su página de Conexiones. Aquí no hay nada que registrar, y la instalación no guarda ninguna contraseña propia.",
  "admin.plugins.key.conn.builtin":
    "Integrado en esta instalación. No hay proveedor al que llegar ni credencial que guardar. Una llamada se ejecuta como quien la pidió.",
  "admin.plugins.key.conn.bearer":
    "Lo que esta instalación envía al proveedor. Una sola credencial para todos.",
  "admin.plugins.key.conn.title": "Conexión",
  "admin.plugins.key.builtin.desc":
    "Nada que configurar. Estas herramientas se ejecutan dentro de esta instalación, con sus propios datos.",
  "admin.plugins.key.builtin.badge": "Integrado",
  "admin.plugins.key.secret.title": "Contraseña de aplicación",
  "admin.plugins.key.secret.desc":
    "Cada persona crea la suya en Google y la pega en su página de Conexiones. Llega a todo su buzón, así que lo que pueden hacer los asistentes lo deciden las herramientas que concedas abajo.",
  "admin.plugins.key.secret.badge": "Por persona",
  "admin.plugins.key.reach.title": "Cómo se llega a esto",
  "admin.plugins.key.token.title": "Token de acceso",
  "admin.plugins.key.token.desc": "Se envía con cada llamada a este proveedor.",
  "admin.plugins.key.saved": "Guardado",
  "admin.plugins.key.notSet": "Sin definir",
  "admin.plugins.key.client.title": "Cliente OAuth",
  "admin.plugins.key.client.selfDesc":
    "Esta instalación se registra sola en el proveedor al conectar por primera vez. No hay nada que pegar.",
  "admin.plugins.key.client.selfBadge": "Autorregistrado",
  "admin.plugins.key.client.desc":
    "Identifica esta instalación ante el proveedor. Por sí solo, no puede llegar a los documentos de nadie.",
  "admin.plugins.key.client.registered": "Registrado",
  "admin.plugins.key.client.notRegistered": "Sin registrar",
  "admin.plugins.key.team.connected":
    "Conectado{who}. Todo asistente con estas herramientas actúa como esta cuenta.",
  "admin.plugins.key.team.as": " como {name}",
  "admin.plugins.key.team.by": " por {name}",
  "admin.plugins.key.team.disconnected":
    "No hay ninguna cuenta del equipo conectada. Los asistentes con estas herramientas son rechazados.",
  "admin.plugins.key.team.heading": "Cuenta del equipo",
  "admin.plugins.key.team.notice":
    "Inicia sesión con la cuenta del equipo, no con la tuya.",
  "admin.plugins.key.mine.connected":
    "Conectado. Un asistente con estas herramientas usa tu {title} como si fueras tú. {note}",
  "admin.plugins.key.mine.tryConnect":
    "Conecta tu propia cuenta para probar este conector. {note}",
  "admin.plugins.key.oauthAcct.connected":
    "Conectado. Un asistente con estas herramientas usa tu {title} como si fueras tú. Todos los demás conectan la suya.",
  "admin.plugins.key.oauthAcct.connect":
    "Conecta tu propia cuenta para probar este conector. La configuración está completa sin ella, y solo llega a tus documentos.",
  "admin.plugins.key.connected": "Conectado",
  "admin.plugins.key.connect": "Conectar",
  "admin.plugins.key.instance.title": "Host de la instancia",
  "admin.plugins.key.instance.desc":
    "Este proveedor da a cada cliente su propio nombre de host. Se comprueba con el patrón del proveedor antes de guardarlo.",
  "admin.plugins.key.docs.builtin": "Documentación",
  "admin.plugins.key.docs.vendor": "Documentación del proveedor",
  "admin.plugins.key.docs.builtinDesc":
    "Lo que ofrecen estas herramientas, según quienes las mantienen.",
  "admin.plugins.key.docs.vendorDesc":
    "Lo que ofrece este servidor, según quienes lo mantienen.",
  "admin.plugins.key.redirect.dynamic":
    "La instalación registra sola su URI de redirección. No hay nada que añadir en el proveedor.",
  "admin.plugins.key.redirect.manual":
    "Añade esto a las URI de redirección autorizadas del cliente en el proveedor, exactamente como está escrito. Un solo carácter incorrecto falla allí, con un error que no menciona {product}.",
  "admin.plugins.key.redirect.noUrl":
    "Esta instalación no tiene URL pública, así que nadie puede terminar de conectar. Define {env}.",
  "admin.plugins.key.tools.refresh": "Actualizar herramientas",
  "admin.plugins.key.tools.grant": "Conceder herramientas…",
  "admin.plugins.key.tools.description":
    "Un asistente solo ve las herramientas que se le han dado. Cada llamada se comprueba en el momento en que ocurre, así que quitar un acceso se aplica desde la siguiente llamada.",
  "admin.plugins.key.tools.title": "Herramientas",
  "admin.plugins.key.tools.empty":
    "No hay herramientas en la lista. Actualiza las herramientas para volver a comprobar.",
  "admin.plugins.key.tools.writes": "cambia cosas",
  "admin.plugins.key.tools.reads": "lee",
  "admin.plugins.key.byBot": "Por asistente",
  "admin.plugins.key.byBot.hidden":
    "Oculta en tu lista. Activa o desactiva las acciones de esta app una a una.",
  "admin.plugins.key.byBot.shown":
    "Activa o desactiva las acciones de esta app una a una.",
  "admin.plugins.key.gone.description":
    "Este proveedor ya no las lista. Ningún asistente las ve y ninguno puede llamarlas. El acceso sigue guardado y vuelve si el proveedor vuelve a listar la herramienta. Para quitarlo, usa la página del propio asistente.",
  "admin.plugins.key.gone.title": "Concedidas pero ya no listadas",
  "admin.plugins.key.gone.row": "{title} no la lista{asOf}.",
  "admin.plugins.key.gone.asOf": " desde la última actualización",
  "admin.plugins.key.dlg.client": "Cliente OAuth de {title}",
  "admin.plugins.key.dlg.instance": "Host de la instancia de {title}",
  "admin.plugins.key.dlg.token": "Token de acceso de {title}",
  "admin.plugins.key.dlg.clientDesc":
    "De la consola del proveedor. El secreto se guarda en la bóveda de esta instalación y no se vuelve a mostrar.",
  "admin.plugins.key.dlg.instanceDesc":
    "Tu propio nombre de host con este proveedor. Se comprueba con el patrón del proveedor antes de guardarlo.",
  "admin.plugins.key.dlg.tokenDesc":
    "Se guarda en la bóveda de esta instalación y no se vuelve a mostrar.",
  "admin.plugins.key.dlg.clientId": "ID de cliente",
  "admin.plugins.key.dlg.clientSecret": "Secreto de cliente",
  "admin.plugins.key.gr.title": "Conceder herramientas",
  "admin.plugins.key.gr.description":
    "Cada concesión es su propia fila en Auditoría. Las herramientas que cambian cosas se siguen comprobando contra los límites en cada llamada.",
  "admin.plugins.key.gr.to": "A",
  "admin.plugins.key.gr.reads": "Lee",
  "admin.plugins.key.gr.writes": "Cambia cosas",
  "admin.plugins.key.gr.selectAll": "Seleccionar todo",
  "admin.plugins.key.gr.button": "Conceder",
  "admin.plugins.key.gr.progress": "Concediendo {current} de {total}…",
  "admin.plugins.key.gr.summary": {
    one: "Conceder {count} herramienta a {names}.",
    other: "Conceder {count} herramientas a {names}.",
    many: "Conceder {count} de herramientas a {names}.",
  },
  "admin.plugins.key.gr.changing": {
    one: "{count} cambia cosas.",
    other: "{count} cambian cosas.",
    many: "{count} de ellas cambian cosas.",
  },
  "admin.home.reach.desc":
    "A qué puede acceder un asistente fuera de {product}, y los límites que tiene.",
  "admin.home.credentials.desc": "Claves y tokens de esta instalación.",
  "admin.home.boundaries.desc": "Cosas que ningún asistente puede hacer nunca.",
  "admin.home.approvals.desc":
    "Lo que los asistentes de los miembros deben preguntar antes de actuar.",
  "admin.home.computers.desc":
    "Las máquinas en las que los asistentes ejecutan herramientas.",
  "admin.home.do.desc":
    "Apps, habilidades y piezas de interfaz que puede usar cualquier asistente.",
  "admin.home.plugins.desc":
    "Los servicios a los que {product} puede llegar, y qué asistentes pueden usarlos.",
  "admin.home.skills.desc":
    "Instrucciones con nombre que cualquiera puede ejecutar con /.",
  "admin.home.learning.desc":
    "Aprende de las conversaciones terminadas y revisa las habilidades que propone.",
  "admin.home.components.desc":
    "Piezas propias que un asistente puede dibujar en una conversación.",
  "admin.home.playground.desc":
    "Escribe un componente y míralo dibujarse mientras tecleas.",
  "admin.home.engines.desc":
    "Los motores de IA en los que funcionan los miembros, y si cada uno puede responder ahora.",
  "admin.home.people.desc":
    "Todas las personas que han iniciado sesión, quiénes son los administradores y a quiénes se retiró el acceso.",
  "admin.home.enterprise.desc":
    "Roles y grupos, SSO obligatorio, SCIM, política de red, listas de permitidos de MCP y de modelos, Action Recording.",
  "admin.home.idp.desc":
    "El proveedor SAML u OpenID Connect de tu empresa, asignado por el dominio del correo.",
  "admin.home.audit.desc":
    "Cada acción realizada en {product} y quién la realizó.",
  "admin.home.description":
    "Ajustes para todos en esta instalación. Un cambio aquí afecta a cada persona y a cada asistente.",
  "admin.plugins.directoryError":
    "No se pudieron cargar los ajustes de plugins. Recarga la página.",
  "admin.components.description":
    "Con qué puede responder cada asistente. Todo componente publicado está activado para todos los asistentes. Desactiva uno y ese asistente nunca lo verá. Los cambios y los rechazos aparecen en Auditoría.",
  "admin.components.loadError":
    "No se pudieron cargar los componentes. Recarga la página.",
  "admin.components.emptyTitle": "Aún no hay componentes",
  "admin.components.emptyDesc":
    "Aquí aparecerán los componentes que tus asistentes pueden usar.",
  "admin.audit.silence.quiet": "En silencio durante {seconds} s",
  "admin.audit.silence.nothing": "{quiet}, sin haber dicho nada en absoluto",
  "admin.audit.silence.after": {
    one: "{quiet}, tras {count} fragmento",
    other: "{quiet}, tras {count} fragmentos",
    many: "{quiet}, tras {count} de fragmentos",
  },
  "admin.compDetail.title": "Componentes",
  "admin.compDetail.noSuch.title": "No existe ese componente",
  "admin.compDetail.noSuch.description":
    "No hay ningún componente con ese nombre.",
  "admin.compDetail.noSuch.hint":
    "Puede que se haya renombrado, o que esta instalación ya no lo incluya.",
  "admin.compDetail.back": "Volver a los componentes",
  "admin.compDetail.grant.noBots": "Todavía no hay asistentes",
  "admin.compDetail.grant.all": {
    one: "Todos los {count} asistentes",
    many: "Todos los {count} de asistentes",
    other: "Todos los {count} asistentes",
  },
  "admin.compDetail.grant.none": "Ningún asistente",
  "admin.compDetail.grant.some": "{granted} de {total} asistentes",
  "admin.compDetail.fn.none": "Esta instalación no tiene funciones de datos",
  "admin.compDetail.fn.nothing":
    "Ninguno. Solo muestra lo que le pasa el asistente.",
  "admin.compDetail.notPublished":
    "Sin publicar. Ningún asistente puede verlo.",
  "admin.compDetail.config.title": "Configuración",
  "admin.compDetail.config.description":
    "Para qué sirve este componente y qué asistentes pueden responder con él.",
  "admin.compDetail.notInBuild.title": "No está en esta versión",
  "admin.compDetail.notInBuild.description":
    "{product} no puede dibujarlo. Los ajustes de abajo no tienen efecto.",
  "admin.compDetail.published": "Publicado",
  "admin.compDetail.published.on": "Los asistentes pueden responder con él.",
  "admin.compDetail.published.off": "Ningún asistente puede usarlo.",
  "admin.compDetail.published.changes":
    "La descripción tiene cambios sin publicar.",
  "admin.compDetail.description": "Descripción",
  "admin.compDetail.nothingYet": "Todavía nada",
  "admin.compDetail.availableTo": "Disponible para",
  "admin.compDetail.canRead": "Puede leer",
  "admin.compDetail.details": "Detalles",
  "admin.compDetail.kind": "Tipo",
  "admin.compDetail.calledAs": "Se llama",
  "admin.compDetail.lastChanged": "Último cambio",
  "admin.compDetail.by": "por {name}",
  "admin.compDetail.descDlg.description":
    "Lo que lee el modelo cuando decide usarlo. No tiene efecto hasta que el componente se publique.",
  "admin.compDetail.grantsDlg.description":
    "Desactiva un asistente y nunca sabrá que este componente existe. Los cambios se aplican enseguida.",
  "admin.compDetail.grantsDlg.empty": "Todavía no hay asistentes.",
  "admin.compDetail.fnDlg.description":
    "Los datos que este componente puede obtener para dibujarse. Es independiente de «Disponible para». Con todos desactivados, solo muestra lo que le pasa el asistente. Cada lectura aparece en Auditoría. Los cambios se aplican enseguida.",
  "admin.compDetail.fnDlg.empty":
    "Esta instalación no tiene funciones de datos.",
  "admin.computers.description":
    "El navegador de cada asistente y el perfil que conserva. El perfil mantiene la sesión iniciada del asistente. Si lo restableces, el asistente cierra sesión en todo.",
  "admin.computers.loadError":
    "No se pudieron cargar los ordenadores. Recarga la página.",
  "admin.computers.shared.lead":
    "Todos los asistentes comparten un solo ordenador.",
  "admin.computers.shared.before":
    "Comparten sus inicios de sesión, archivos y sesión. Un asistente puede llegar a lo que otro tiene abierto. Configura",
  "admin.computers.shared.after": "para dar a cada asistente el suyo.",
  "admin.computers.perBot":
    "Cada asistente tiene su propio ordenador, con su propio contenedor, sus archivos y su perfil de navegador.",
  "admin.computers.list.title": "Ordenadores de esta instalación",
  "admin.computers.list.error": "No se pudo cargar la lista.",
  "admin.computers.list.empty":
    "Todavía no hay ordenadores. Aparece uno la primera vez que un asistente abre una página.",
  "admin.computers.running": "Navegador en marcha desde {time}",
  "admin.computers.notRunning":
    "No hay ningún navegador en marcha. Arranca cuando el asistente lo necesite de nuevo.",
  "admin.computers.egress.unknown": "Salida no indicada",
  "admin.computers.egress.direct": "Sale directamente",
  "admin.computers.egress.via": "Sale a través de {egress}",
  "admin.computers.updateAvailable": "Actualización disponible",
  "admin.computers.update": "Actualizar el ordenador",
  "admin.computers.working": "Trabajando…",
  "admin.computers.stop": "Detener el navegador",
  "admin.computers.reset": "Restablecer",
  "admin.computers.resetTitle": "¿Restablecer el ordenador de {name}?",
  "admin.computers.resetDesc":
    "Se borra su perfil. El asistente cierra sesión en todos los servicios y empieza de cero. No se puede deshacer.",
  "admin.computers.resetting": "Restableciendo…",
  "admin.computers.resetIt": "Restablecerlo",
  "admin.computers.updateTitle": "¿Actualizar el ordenador de {name}?",
  "admin.computers.updateDesc":
    "Pasa a la imagen de ordenador que esta instalación usa ahora. Se conservan sus archivos y sus inicios de sesión. Si está en marcha, se reinicia y detiene lo que esté haciendo.",
  "admin.computers.updating": "Actualizando…",
  "admin.computers.updateIt": "Actualizarlo",
  "admin.computers.foot.stopLead": "Detener",
  "admin.computers.foot.stopRest":
    "cierra el navegador y conserva sus inicios de sesión. Vuelve a arrancar la próxima vez que el asistente lo necesite.",
  "admin.computers.foot.resetLead": "Restablecer",
  "admin.computers.foot.resetRest":
    "borra el perfil y cierra la sesión del asistente en todo.",
  "admin.computers.foot.updateLead": "Actualizar el ordenador",
  "admin.computers.foot.updateRest":
    "aparece cuando un ordenador usa una imagen más antigua. Pasa el ordenador a la nueva y conserva sus archivos y sus inicios de sesión.",
  "admin.computers.foot.audit": "Las tres aparecen en",
  "admin.computers.host.description":
    "Elige carpetas que un asistente puede leer en este ordenador. La app de escritorio pregunta antes de cada cambio o comando. El acceso termina cuando detienes {product}.",
  "admin.computers.host.title": "Carpetas de este ordenador",
  "admin.computers.host.offline":
    "La app de escritorio está sin conexión. Ábrela para aprobar carpetas o ejecutar comandos.",
  "admin.computers.host.noBots":
    "Todavía no hay asistentes. Crea uno y luego elige sus carpetas.",
  "admin.computers.host.choose": "Elegir carpeta",
  "admin.computers.host.waiting": "Esperando…",
  "admin.computers.host.readOnlyNote":
    "Las carpetas son de solo lectura. Cuando un asistente necesita escribir, la app de escritorio te pregunta primero.",
  "admin.computers.host.stopAccess": "Detener el acceso a carpetas",
  "admin.computers.host.stopping": "Deteniendo…",
  "admin.computers.host.viewAudit": "Ver auditoría",
  "admin.computers.host.readOnly": "Solo lectura",
  "admin.computers.host.revoke": "Revocar",
  "admin.computers.host.revoking": "Revocando…",
  "admin.computers.host.pendingFrom": "{label} de {owner}.",
  "admin.computers.host.pendingFromFor": "{label} de {owner} para {name}.",
  "admin.computers.host.folders": {
    one: "{count} carpeta de solo lectura",
    many: "{count} de carpetas de solo lectura",
    other: "{count} carpetas de solo lectura",
  },
  "admin.computers.host.requests": {
    one: "{count} solicitud pendiente",
    many: "{count} de solicitudes pendientes",
    other: "{count} solicitudes pendientes",
  },
  "admin.computers.host.none": "No hay carpetas aprobadas.",
  "admin.computers.host.owner": "el propietario del escritorio",
  "admin.computers.host.p.write":
    "Cambio de archivo a la espera de aprobación o de terminar",
  "admin.computers.host.p.run":
    "Comando a la espera de aprobación o de terminar",
  "admin.computers.host.p.list": "Listando archivos",
  "admin.computers.host.p.read": "Leyendo un archivo",
  "admin.computers.host.p.stop": "Deteniendo el trabajo con carpetas",
  "admin.computers.host.p.default":
    "Acceso a carpetas a la espera de aprobación",
  "admin.learning.description":
    "Aprende de las conversaciones terminadas, revisa las habilidades que propone Intelligence y da las habilidades publicadas a los asistentes.",
  "admin.learning.auto.assigned":
    "{product} asignó automáticamente el contenedor «{container}» a este proyecto de Intelligence. Puedes cambiarlo aquí.",
  "admin.learning.auto.absent":
    "Este proyecto de Intelligence aún no tiene un contenedor de Learning «{container}». No se recoge nada.",
  "admin.learning.auto.notEntitled":
    "El plan de este proyecto de Intelligence no incluye Learning. No se asignó ningún contenedor.",
  "admin.learning.auto.unavailable":
    "No se pudo conectar con Intelligence para encontrar el contenedor de Learning de este proyecto. {product} lo intentará de nuevo.",
  "admin.learning.target.container": "ID del contenedor: {label}",
  "admin.learning.target.revision": "Revisión exacta (opcional)",
  "admin.learning.target.revisionAria": "Revisión: {label}",
  "admin.learning.target.latest": "Última publicada",
  "admin.learning.create.busy": "Creando…",
  "admin.learning.create.button": "Crear el contenedor {container}",
  "admin.learning.create.note":
    "Usa la credencial de esta instalación, no la clave de ejecución.",
  "admin.learning.create.how": "Para crearlo: ",
  "admin.learning.part.title": "Participación",
  "admin.learning.part.description":
    "Los cambios de contenedor valen para las conversaciones nuevas. Las existentes conservan su primer contenedor. Los contenedores ya deben existir en el mismo proyecto de Intelligence. Hasta que guardes aquí, {product} usa el contenedor openbot de ese proyecto.",
  "admin.learning.part.loading": "Cargando los ajustes de Learning…",
  "admin.learning.part.turnOn":
    "Activar el aprendizaje automático y la entrega de habilidades",
  "admin.learning.part.default": "Predeterminado",
  "admin.learning.part.hint":
    "Sin predeterminado, los asistentes sin contenedor propio quedan fuera. Los ID tienen de 1 a 64 letras minúsculas, números y guiones sueltos. Deja la revisión vacía para usar las últimas habilidades publicadas.",
  "admin.learning.part.perBot": "Participación por asistente",
  "admin.learning.part.botListError":
    "No se pudo cargar la lista de asistentes. Abajo están los ajustes guardados de cada asistente.",
  "admin.learning.part.botAria": "Participación de {name}",
  "admin.learning.part.inherit": "Usar el predeterminado de la instalación",
  "admin.learning.part.exclude": "Dejar fuera de Learning",
  "admin.learning.part.container": "Usar un contenedor concreto",
  "admin.learning.part.saving": "Guardando…",
  "admin.learning.part.save": "Guardar los ajustes de Learning",
  "admin.learning.part.saved": "Ajustes guardados.",
  "admin.learning.rev.title": "Revisar y publicar",
  "admin.learning.rev.description":
    "Intelligence estudia las conversaciones terminadas y propone habilidades. Revísalas y publícalas en Intelligence. Los asistentes solo usan habilidades publicadas.",
  "admin.learning.rev.showFor": "Mostrar el contenedor de",
  "admin.learning.rev.default": "Predeterminado de la instalación",
  "admin.learning.rev.checking": "Comprobando Intelligence…",
  "admin.learning.rev.invalid":
    "El contenedor elegido o su instrumentación no está disponible.",
  "admin.learning.rev.selection":
    "Elige un asistente o define un contenedor predeterminado.",
  "admin.learning.rev.none": "No hay ningún contenedor de Learning asignado.",
  "admin.learning.rev.threads": "Hilos listos",
  "admin.learning.rev.candidates": "Candidatas para revisar",
  "admin.learning.rev.published": "Habilidades publicadas",
  "admin.learning.rev.insights": "Conclusiones",
  "admin.learning.rev.running": "Hay un análisis en curso.",
  "admin.learning.rev.latest": "Último análisis: {status}.",
  "admin.learning.rev.noRun": "Todavía no se ha ejecutado ningún análisis.",
  "admin.learning.rev.manage": "Gestionar Learning en Intelligence",
  "admin.learning.rev.reviewCandidates": "Revisar candidatas a habilidad",
  "admin.learning.rev.viewRuns": "Ver ejecuciones de análisis",
  "admin.learning.del.title": "Entrega de habilidades",
  "admin.learning.del.checking": "Comprobando la entrega…",
  "admin.learning.del.off": "La entrega está desactivada para este asistente.",
  "admin.learning.del.waiting":
    "Esperando la primera instantánea de habilidades verificada.",
  "admin.learning.del.stale":
    "Se usa la última instantánea verificada. Hay una actualización pendiente.",
  "admin.learning.del.ok": "Hay una instantánea verificada disponible.",
  "admin.learning.del.revision": "Revisión cargada: {revision}",
  "admin.learning.del.lastChecked": "Última comprobación:",
  "admin.learning.rev.refresh": "Actualizar el estado",
  "admin.learning.rev.footer":
    "Gestionar Learning requiere tu cuenta de Intelligence y acceso al proyecto. {product} guarda las credenciales del proyecto en el servidor. Desactivar Learning aquí conserva los ajustes y las asignaciones de conversaciones. Las programaciones y la publicación siguen en Intelligence.",
  "admin.playground.validJson": "{label} debe ser JSON válido: {reason}",
  "admin.playground.invalidJson": "JSON no válido",
  "admin.playground.notObject": "{label} debe ser un objeto JSON, no {kind}.",
  "admin.playground.schemaLabel": "Argumentos (JSON Schema)",
  "admin.playground.sampleLabel": "Argumentos de ejemplo",
  "admin.playground.fixBeforeSave": "Corrige los campos JSON antes de guardar.",
  "admin.playground.draftSaved": "Borrador guardado.",
  "admin.playground.published": "Publicado.",
  "admin.playground.description":
    "Escribe un componente y publícalo sin volver a desplegar. Tus cambios son un borrador. Las conversaciones solo muestran lo publicado.",
  "admin.playground.saveDraft": "Guardar borrador",
  "admin.playground.publish": "Publicar",
  "admin.playground.title": "Título",
  "admin.playground.titlePlaceholder": "Tarjeta de reembolso",
  "admin.playground.told": "Lo que se le dice al modelo sobre él",
  "admin.playground.toldPlaceholder":
    "Muestra un reembolso con su importe, motivo y estado.",
  "admin.playground.preview": "Vista previa",
  "admin.playground.noSample":
    "Los argumentos de ejemplo no están disponibles.",
  "admin.playground.fixBeforePreview":
    "Corrige los campos JSON antes de la vista previa.",
  "admin.playground.saved.title": "Guardado aquí",
  "admin.playground.saved.empty":
    "Todavía no hay nada guardado. Guarda un borrador para verlo aquí.",
  "admin.playground.saved.published": "publicado, revisión {revision}",
  "admin.playground.saved.draftOnly":
    "solo borrador, ningún asistente puede dibujarlo",
  "admin.playground.saved.edited": "editado desde la publicación",
  "admin.playground.open": "Abrir",
  "admin.playground.delete": "Eliminar",
  "admin.playground.saved.note":
    "Publicar lo pone a disposición de todos los asistentes. Para quitárselo a uno solo, desactívalo en la página Componentes de la interfaz.",
  "admin.playground.del.title": "¿Eliminar {name}?",
  "admin.playground.del.description":
    "Se quita de esta instalación y ningún asistente puede dibujarlo. No se puede deshacer.",
  "admin.playground.del.confirm": "Eliminarlo",
  "admin.plugins.tool.title": "Herramienta",
  "admin.plugins.tool.noTool":
    "Este conector no tiene ninguna herramienta con ese nombre.",
  "admin.plugins.tool.removed":
    "Puede que se haya quitado desde la última vez que se actualizó la lista de herramientas.",
  "admin.plugins.tool.notOn": "Este conector no está activado.",
  "admin.plugins.tool.noDesc": "Esta herramienta no tiene descripción.",
  "admin.plugins.tool.writeDesc":
    "Esta herramienta cambia algo en el proveedor. Se le aplican los límites sobre escrituras.",
  "admin.plugins.tool.readDesc":
    "Esta herramienta solo lee. No se le aplican los límites sobre escrituras.",
  "admin.plugins.tool.what": "Qué hace",
  "admin.plugins.tool.effect": "Efecto",
  "admin.plugins.tool.effectDesc":
    "Lo fija el conector, no el nombre de la herramienta. Todo lo desconocido cuenta como escritura.",
  "admin.plugins.tool.bots.title": "Asistentes",
  "admin.plugins.tool.bots.description":
    "Un asistente solo puede llamar a esta herramienta mientras su interruptor esté activado. Desactivarlo se aplica desde la siguiente llamada.",
  "admin.plugins.tool.bots.empty":
    "Todavía no hay asistentes. Crea uno para darle esta herramienta.",
  "admin.plugins.tool.hidden": "Oculto en tu lista.",
  "admin.plugins.tool.canCall":
    "Puede llamar a esta herramienta. Cada llamada se sigue comprobando contra los límites y se registra en Auditoría.",
  "admin.plugins.tool.noToken":
    "Permitido, pero este asistente no tiene token de retorno. Se rechaza cada llamada. Emite uno en su página o define AGENT_TOOL_TOKEN.",
  "admin.plugins.tool.cantCall":
    "No puede llamar a esta herramienta. El asistente nunca la ve.",
  "admin.plugins.tool.aria": "Dejar que {bot} llame a {tool}",
  "admin.plugins.bot.title": "Asistente",
  "admin.plugins.bot.notOn": "No hay ninguna app con ese nombre activada.",
  "admin.plugins.bot.nothing": "Aquí no hay nada que dar a un asistente.",
  "admin.plugins.bot.notBot.title": "No es un asistente",
  "admin.plugins.bot.notBot.description":
    "No hay ningún asistente con ese nombre.",
  "admin.plugins.bot.notBot.hint":
    "Puede que se haya eliminado después de abrir esta página.",
  "admin.plugins.bot.noDesc": "Esta acción no tiene descripción.",
  "admin.plugins.bot.destroys": "destruye cosas",
  "admin.plugins.bot.description":
    "Qué acciones de {app} puede llamar {bot}. Desactivar una se aplica desde la siguiente llamada.",
  "admin.plugins.bot.pageTitle": "{bot} y {app}",
  "admin.plugins.bot.noActions":
    "{app} no lista ninguna acción. Actualiza sus herramientas para comprobarlo de nuevo.",
  "admin.plugins.bot.searchAria": "Buscar acciones de {app}",
  "admin.plugins.bot.searchPlaceholder": "Buscar por nombre de acción",
  "admin.plugins.bot.wouldHold": {
    one: "Entonces este asistente tendría {count} herramienta de esta app.",
    many: "Entonces este asistente tendría {count} de herramientas de esta app.",
    other: "Entonces este asistente tendría {count} herramientas de esta app.",
  },
  "admin.plugins.bot.turnOnReads": "Activar todas las acciones de solo lectura",
  "admin.plugins.bot.reads.title": "Lecturas",
  "admin.plugins.bot.reads.description":
    "Estas solo leen. No se les aplican los límites sobre escrituras.",
  "admin.plugins.bot.reads.noMatch":
    "Ninguna acción que solo lee coincide con «{query}».",
  "admin.plugins.bot.reads.none": "{app} no tiene acciones de solo lectura.",
  "admin.plugins.bot.writes.title": "Cambia cosas",
  "admin.plugins.bot.writes.description":
    "Estas cambian algo en el proveedor. Se les aplican los límites sobre escrituras.",
  "admin.plugins.bot.writes.noMatch":
    "Ninguna acción que cambia cosas coincide con «{query}».",
  "admin.plugins.bot.writes.none": "{app} no tiene acciones que cambien cosas.",
  "admin.plugins.bot.shared.title":
    "¿Dejar que {bot} use la cuenta compartida de {app}?",
  "admin.plugins.bot.allowing": "Permitiendo…",
  "admin.plugins.bot.allow": "Permitir",
  "admin.shared.sentence.write":
    "Cualquiera que pueda usar este asistente puede hacerlo con la cuenta compartida.",
  "admin.shared.sentence.read":
    "Cualquiera que pueda usar este asistente puede leer lo que esta cuenta puede leer.",
  "admin.shared.owner": "Solo su propietario",
  "admin.shared.named": "Con nombre: {who}",
  "admin.shared.team": "Todos",
  "admin.shared.legend":
    "Quién puede usar la cuenta compartida a través de este asistente",
  "admin.shared.outside":
    "Los mensajes de fuera (correo, Slack, webhooks) pueden usarla",
  "admin.shared.skipped": {
    one: "Se dejó fuera una acción que lista esta app, porque el nombre de una herramienta solo puede usar letras, dígitos, guiones bajos y guiones: ",
    many: "Se dejaron fuera {count} de acciones que lista esta app, porque el nombre de una herramienta solo puede usar letras, dígitos, guiones bajos y guiones: ",
    other:
      "Se dejaron fuera {count} acciones que lista esta app, porque el nombre de una herramienta solo puede usar letras, dígitos, guiones bajos y guiones: ",
  },
  "admin.vocab.browse": "Explorar {name}",
  "admin.vocab.dirDesc.composio":
    "Unos cientos de apps. Cada persona conecta su propia cuenta.",
  "admin.vocab.dirDesc.arcade":
    "Apps que nadie aquí ha revisado. Cada persona conecta su propia cuenta.",
  "admin.vocab.readFailure":
    "No se pudo cargar el directorio de apps de {name}. Recarga la página.",
  "admin.vocab.moreApps": "Apps de {name}. Nadie aquí las ha revisado.",
  "admin.vocab.notSetUp":
    "Sin configurar. Define {envVar} en esta instalación para explorar sus apps.",
  "admin.vocab.connection":
    "Se llega a través de {name}, que guarda la cuenta propia de cada persona.",
  "admin.vocab.reach.description":
    "{name} guarda la cuenta. Esta instalación envía una clave y quién pregunta. Cada persona conecta la suya, y un asistente solo ve lo que esa persona puede ver. No hay token que pegar.",
  "admin.vocab.reach.badge": "A través de {name}",
  "admin.vocab.disconnect": "Desconectar también termina la cuenta en {name}.",
  "admin.vocab.trip.stem":
    "{name} aprueba una acción cada vez, así que no hay nada que conectar para toda la app.",
  "admin.vocab.trip.below": "Autoriza abajo las acciones que quieras.",
  "admin.vocab.trip.settings": "Autorízalas desde Conexiones.",
  "admin.vocab.keyMissing":
    "Define {envVar} en esta instalación. Hasta entonces, esta cuenta no se puede conectar ni desconectar aquí. La app sigue activada y sus permisos de herramientas se mantienen.",
  "admin.vocab.siblings": {
    one: "Desconectar también termina tu acceso a {names}, que comparte esta conexión.",
    many: "Desconectar también termina tu acceso a {names}, que comparten esta conexión.",
    other:
      "Desconectar también termina tu acceso a {names}, que comparten esta conexión.",
  },
  "admin.vocab.unansweredMore": {
    one: "No se pudo comprobar {count} app más y también podría verse afectada.",
    many: "No se pudo comprobar {count} de apps más y también podrían verse afectadas.",
    other:
      "No se pudieron comprobar {count} apps más y también podrían verse afectadas.",
  },
  "admin.vocab.unansweredOnly": {
    one: "No se pudo comprobar {count} app de esta conexión, así que desconectar podría terminar también con ella.",
    many: "No se pudo comprobar {count} de apps de esta conexión, así que desconectar podría terminar también con ellas.",
    other:
      "No se pudieron comprobar {count} apps de esta conexión, así que desconectar podría terminar también con ellas.",
  },
  "admin.vocab.join2": "{a} y {b}",
  "admin.vocab.joinMany": "{list} y {last}",
  "admin.skills.write": "Escribir una habilidad",
  "admin.skills.description":
    "Instrucciones con nombre que cualquiera puede ejecutar con /. Una habilidad no añade acceso. Solo puede pedirle a un asistente que use lo que ya tiene.",
  "admin.skills.installed.title": "Instaladas",
  "admin.skills.installed.description":
    "Para todos en esta instalación. Cada persona escribe las suyas en su página de Habilidades.",
  "admin.skills.loadError":
    "No se pudieron cargar las habilidades. Recarga la página.",
  "admin.skills.empty":
    "Todavía no hay habilidades. Escribe una con Escribir una habilidad.",
  "admin.skills.dlg.title": "Escribir una habilidad para todos",
  "admin.skills.dlg.description":
    "La gente escribe el slug después de /. Entonces el asistente sigue las instrucciones. Todos pueden usarla y tú eliges qué asistentes la tienen.",
  "admin.skills.slug": "Slug",
  "admin.skills.title": "Título",
  "admin.skills.summary": "Resumen",
  "admin.skills.summaryPlaceholder": "Una línea",
  "admin.skills.instructions": "Instrucciones",
  "admin.skills.instructionsPlaceholder":
    "Lo que debe hacer el asistente cuando se usa esta habilidad.",
  "admin.skills.install": "Instalar habilidad",
  "engines.intro":
    "El motor es lo que piensa por cada miembro. Tus propios inicios de sesión responden primero, a menos que elijas otro orden; todo lo de pago sigue apagado hasta que tú lo digas.",
  "engines.loadFailed": "No se pudieron cargar los motores. Recarga la página.",
  "engines.fallback": "No se pudieron listar los motores.",
  "engines.noEngines": "Todavía no se ha informado de ningún motor.",
  "engines.statesTitle": "Los motores y su estado",
  "engines.sectionsLabel": "Secciones de los motores",
  "engines.tab.overview": "Resumen",
  "engines.tab.providers": "Proveedores",
  "engines.tab.members": "Asignaciones de los asistentes",
  "engines.tab.usage": "Uso",
  "engines.asideLabel": "Claves y gasto",
  "engines.keys.title": "Claves",
  "engines.keys.text":
    "Aquí solo se guardarán claves de gateways. FreeDuet nunca almacena tus inicios de sesión de Claude y ChatGPT.",
  "engines.keys.notBuilt":
    "Una clave se añade en la tarjeta de su motor. Se guarda en esta instalación y no se vuelve a mostrar nunca.",
  "engines.spending.title": "Gasto",
  "engines.spending.text":
    "El gasto todavía no se muestra en esta página. Un motor de pago solo funciona si esta instalación lo permite.",
  "engines.today": "Hoy",
  "engines.reason.off":
    "Los motores están desactivados en esta instalación (FREEDUET_ROUTER=off), así que no hay nada que mostrar.",
  "engines.reason.not_set_up":
    "En esta instalación no hay ningún agente de FreeDuet configurado, así que no hay motores que mostrar.",
  "engines.reason.unreachable":
    "El agente de FreeDuet no respondió, así que ahora mismo no se pueden leer los motores. Esta página vuelve a preguntar cada 30 segundos.",
  "engines.state.ready": "Listo",
  "engines.state.degraded": "Listo, pero ha tenido errores recientes",
  "engines.state.limitedAt": "Ha llegado a su límite hasta {at}",
  "engines.state.limited": "Ha llegado a su límite por ahora",
  "engines.state.outOfCreditAt": "Sin crédito, se reintentará a las {at}",
  "engines.state.outOfCredit": "Sin crédito",
  "engines.state.notAnsweringAt": "No responde, se reintentará a las {at}",
  "engines.state.notAnswering": "No responde por ahora",
  "engines.state.checking": "Comprobando si vuelve a responder",
  "engines.state.gatewayKey":
    "Su gateway no aceptó la clave. Revisa la clave que le diste.",
  "engines.state.signedOut":
    "Sesión cerrada: vuelve a iniciar sesión con el acceso propio del motor",
  "engines.state.refusedWhy": "No se ejecutó: {reason}",
  "engines.state.refused": "No se ejecutó: no se conoce el motivo.",
  "engines.state.unknown": "Estado desconocido",
  "engines.state.toolsAsText":
    "Su última respuesta escribió las llamadas a herramientas como texto en lugar de usarlas: elige un modelo que admita herramientas",
  "engines.pill.working": "Funciona",
  "engines.pill.checking": "Comprobando",
  "engines.pill.limited": "Limitado",
  "engines.pill.outOfCredit": "Sin crédito",
  "engines.pill.notAnswering": "No responde",
  "engines.pill.signedOut": "Sesión cerrada",
  "engines.pill.locked": "Bloqueado",
  "engines.pill.unknown": "Desconocido",
  "engines.members.title": "Quién usa qué",
  "engines.members.description":
    "Los motores que prueba cada miembro, en el orden en que los prueba, y qué pasa cuando uno se agota. Un cambio se aplica desde el siguiente mensaje del miembro, y puedes deshacerlo.",
  "engines.members.col.member": "Miembro",
  "engines.members.col.order": "Orden de los motores",
  "engines.members.col.switching": "Cuando un motor se agota",
  "engines.order.note":
    "Usa las flechas para mover un motor una posición. Tus propios inicios de sesión van primero a menos que elijas otra cosa: si un movimiento pone un motor gratuito o de pago antes que ellos, antes se te pide que lo confirmes.",
  "engines.order.warnTitle.free_before_login":
    "Un motor gratuito respondería antes que tu propio inicio de sesión",
  "engines.order.warnTitle.paid_before_free_or_login":
    "Un motor de pago iría antes que un motor gratuito o un inicio de sesión",
  "engines.order.warnText.free_before_login":
    "Si es un servicio en la nube, los mensajes de este miembro van primero a ese proveedor y este puede guardarlos. Además, sus respuestas pueden ser de menor calidad que las de tu inicio de sesión.",
  "engines.order.warnText.paid_before_free_or_login":
    "Un motor de pago responde antes que los motores que le siguen, así que lo que responda puede costar dinero. Si va el primero de la lista, cada mensaje puede costar dinero desde el primero. Solo funciona después de que hayas activado los motores de pago y fijado tus límites.",
  "engines.order.newLabel": "Nuevo orden:",
  "engines.order.tick": "Lo entiendo, usa este orden",
  "engines.order.confirm": "Confirmar",
  "engines.order.tickLabel": "Lo entiendo, usa este orden para {name}",
  "engines.order.confirmLabel": "Confirmar el nuevo orden para {name}",
  "engines.order.cancelLabel": "Cancelar el nuevo orden para {name}",
  "engines.order.own": "Tu orden: los inicios de sesión no van primero",
  "engines.order.recommended": "Usar el orden recomendado",
  "engines.order.recommendedLabel": "Usar el orden recomendado para {name}",
  "engines.order.moveUp": "Subir {engine} para {name}",
  "engines.order.moveDown": "Bajar {engine} para {name}",
  "engines.order.saveFailed": "No se pudo guardar el orden.",
  "engines.claude.default": "Predeterminado de la suscripción",
  "engines.claude.effort.low": "Bajo",
  "engines.claude.effort.medium": "Medio",
  "engines.claude.effort.high": "Alto",
  "engines.claude.effort.xhigh": "Muy alto",
  "engines.claude.effort.max": "Máximo",
  "engines.claude.effortLabel": "Esfuerzo",
  "engines.claude.note":
    "Solo Claude Code. Un modelo que tu suscripción no puede usar termina ese turno con el error propio de Claude Code. No se desactiva nada, y «Predeterminado de la suscripción» deshace la elección.",
  "engines.claude.modelAria": "Modelo de Claude para {name}",
  "engines.claude.effortAria": "Esfuerzo de Claude para {name}",
  "engines.claude.saved":
    "Elección de Claude guardada. Se aplica desde el siguiente mensaje.",
  "engines.members.saveFailed": "No se pudo guardar tu elección.",
  "engines.members.undoFailed": "No se pudo deshacer ese cambio.",
  "engines.mode.groupLabel": "Cuando un motor se agota, para {name}",
  "engines.mode.controlLabel": "{label} para {name}",
  "engines.mode.undoLabel": "Deshacer el cambio para {name}",
  "engines.mode.automatic.label": "Cambiar automáticamente",
  "engines.mode.automatic.effect":
    "Cuando un motor se agota, responde el siguiente y se te dice cuál.",
  "engines.mode.askFirst.label": "Preguntarme antes",
  "engines.mode.askFirst.effect":
    "Cuando un motor se agota, se te pregunta: cambiar, esperar o indicar otro motor.",
  "engines.leftOut.line": "No se usa: {engine}, porque {why}.",
  "engines.leftOut.locked": "el archivo de la instalación no lo permite",
  "engines.leftOut.disabled": "está desactivado",
  "engines.leftOut.paid_gateway":
    "es un gateway de pago, que FreeDuet todavía no ejecuta",
  "engines.leftOut.metered_off": "los motores de pago están desactivados",
  "engines.leftOut.cap_zero": "su tope de gasto es cero",
  "engines.leftOut.not_set_up": "no está configurado en esta instalación",
  "engines.leftOut.other": "no se ejecutará",
  "engines.chain.none": "Ningún motor puede responder ahora por este miembro.",
  "engines.chain.one": "Prueba solo {engine}.",
  "engines.chain.many": "Prueba {list}.",
  "engines.chain.then": ", luego ",
  "engines.pin":
    "Fijado a {engine} por el archivo de la instalación: nunca cambia a otro motor.",
  "engines.alone":
    "Para este miembro solo está configurado {engine}, así que todavía no hay nada a lo que cambiar. Tu elección se conserva para cuando lo haya.",
  "engines.source.yours":
    "Tu elección. El archivo de la instalación dice: {mode}.",
  "engines.source.file": "Del archivo de la instalación.",
  "engines.block.not_at_the_computer":
    "Cambia esto en el ordenador en el que funciona FreeDuet.",
  "engines.block.not_paired_with_the_computer":
    "Primero vincula este navegador con el ordenador en el que funciona FreeDuet: ejecuta allí `bash scripts/open.sh` y abre aquí el enlace.",
  "engines.block.agent_too_old": "Actualiza FreeDuet para cambiar esto.",
  "engines.block.choices_unreadable":
    "No se pudieron leer tus elecciones, así que se usan los ajustes de la instalación. No se pierde nada de lo que elegiste.",
  "engines.saved":
    "Guardado. Se aplica desde el siguiente mensaje del miembro.",
  "engines.undone":
    "Deshecho. El ajuste anterior se aplica desde el siguiente mensaje del miembro.",
  "engines.providers.title": "Añadir un motor",
  "engines.providers.description":
    "Activa un motor, pega su clave y pulsa Guardar, luego pulsa Probar. Un cambio se aplica desde el siguiente mensaje.",
  "engines.providers.pickerLabel": "Proveedor",
  "engines.providers.blurb.ollama":
    "Modelos que funcionan en tu propio ordenador.",
  "engines.providers.blurb.llamacpp":
    "Un servidor llama.cpp en tu propio ordenador o en tu red.",
  "engines.providers.blurb.lmstudio":
    "El servidor local de LM Studio en tu propio ordenador.",
  "engines.providers.blurb.freellmapi":
    "Un router que ejecutas tú mismo y que reúne los planes gratuitos de muchos proveedores detrás de una sola dirección.",
  "engines.providers.blurb.groq":
    "Modelos abiertos rápidos, gratuitos con límites diarios.",
  "engines.providers.blurb.google": "Modelos Gemini, gratuitos con límites.",
  "engines.providers.blurb.mistral":
    "Modelos Mistral en el plan gratuito, con límites.",
  "engines.providers.blurb.openrouter":
    "Solo modelos que no cuestan nada: un id que termina en :free, o openrouter/free.",
  "engines.providers.blurb.cloudflare":
    "Modelos abiertos en Cloudflare, gratuitos con una cuota diaria. Pon tu propia cuenta en la dirección.",
  "engines.providers.blurb.cerebras": "Modelos abiertos muy rápidos.",
  "engines.providers.blurb.anthropic-api":
    "Claude con créditos de pago por uso.",
  "engines.providers.tag.local": "Local",
  "engines.providers.tag.router": "Avanzado: tu propio router",
  "engines.providers.tag.free": "Gratuito con límites",
  "engines.providers.tag.trial": "Prueba, requiere tarjeta",
  "engines.providers.tag.paid": "De pago",
  "engines.providers.cloudWarning":
    "Los datos enviados a este servicio salen de tu ordenador.",
  "engines.providers.routerWarning":
    "Tus mensajes van al router, que los transmite a los proveedores gratuitos que activaste dentro de él. Salen de tu ordenador, y esos proveedores pueden guardarlos.",
  "engines.providers.routerAdvanced":
    "Opción avanzada, no un ajuste predeterminado recomendado: el propio proyecto se describe como solo para experimentación personal. FreeDuet no lo instala ni lo ejecuta. Las claves de tus proveedores se quedan dentro de él; FreeDuet solo conserva el único token de acceso que te da.",
  "engines.providers.routerAddress":
    "Su puerto predeterminado, el 3001, es el de FreeDuet. Ejecútalo en otro puerto y escribe la dirección con /v1 al final. En este ordenador basta con http. Fuera de este ordenador solo se acepta tu propia red (una dirección de LAN o un nombre .local), mediante https. Un host público se rechaza.",
  "engines.providers.address": "Dirección del servidor",
  "engines.providers.loadList": "Cargar la lista",
  "engines.providers.saveSettings": "Guardar los ajustes",
  "engines.providers.test": "Probar",
  "engines.providers.freeModelsNote":
    "Los modelos gratuitos cambian a menudo y pueden guardar lo que envías.",
  "engines.providers.freeModelsLoading":
    "Cargando los modelos gratuitos que pueden usar herramientas.",
  "engines.providers.freeModelsStale":
    "No se pudo conectar con OpenRouter hace un momento. Esta es la última lista que se cargó.",
  "engines.providers.freeModelsFallback":
    "No se pudo conectar con OpenRouter hace un momento. Solo se ofrece el router gratuito.",
  "engines.providers.freeRouterLabel":
    "openrouter/free (OpenRouter elige un modelo gratuito)",
  "engines.providers.keySaved": "Clave guardada. No se vuelve a mostrar nunca.",
  "engines.providers.keyPlaceholder": "Pega la clave aquí",
  "engines.providers.notOnKey":
    "Todavía no está activado. Pega la clave y pulsa Guardar.",
  "engines.providers.notOnSettings":
    "Todavía no está activado. Elige un modelo y pulsa Guardar los ajustes.",
  "engines.providers.settingsSaved":
    "Guardado. Se aplica desde el siguiente mensaje.",
  "engines.providers.keyRemoved": "Clave eliminada. El motor está apagado.",
  "engines.providers.lockedOwnFile":
    "Escribiste un archivo de motores propio, así que estas tarjetas solo lo muestran. Cámbialo allí.",
  "engines.providers.users.paid":
    "Apagado hasta que existan topes de gasto. FreeDuet no dejará que un motor de pago funcione antes.",
  "engines.providers.users.trial":
    "Su plan gratuito es una prueba que requiere tarjeta, así que FreeDuet no lo ofrece como gratuito. Sigue apagado.",
  "engines.providers.users.members":
    "Para los miembros: sí, después de su inicio de sesión de Claude. Para los asistentes ligeros: sí.",
  "engines.providers.users.notYet":
    "Para los miembros: todavía no. Para los asistentes ligeros: sí.",
  "engines.providers.check.ok": "Respondió. Funciona.",
  "engines.providers.check.key_rejected":
    "No se aceptó la clave. Revísala y guárdala de nuevo.",
  "engines.providers.check.model_missing":
    "El servidor no conoce ese modelo. Revisa el nombre del modelo.",
  "engines.providers.check.rate_limited":
    "El límite o el crédito está agotado por ahora. Inténtalo más tarde.",
  "engines.providers.check.other":
    "Nada respondió, o no se entendió la respuesta.",
  "engines.providers.freeNote":
    "«Gratuito» es la etiqueta de FreeDuet, tomada de los términos del proveedor. Algunos proveedores (Google, por ejemplo) te cobran si la facturación está activada en tu proyecto.",
  "engines.providers.useFor": "Usar para",
  "engines.providers.useForNone":
    "Ningún miembro lo usa todavía. Los asistentes ligeros sí. Marca los miembros que pueden enviar su trabajo a este servicio.",
  "engines.providers.warn.inbox": "Envía tu correo a este servicio.",
  "engines.providers.warn.concierge": "Envía tus reservas a este servicio.",
  "engines.providers.modelsEmpty":
    "La lista está vacía. Escribe el nombre del modelo.",
  "engines.providers.modelsLoaded": {
    one: "{count} modelo cargado. Elige uno en la casilla.",
    many: "{count} de modelos cargados. Elige uno en la casilla.",
    other: "{count} modelos cargados. Elige uno en la casilla.",
  },
  "engines.providers.switchOn": "Activar {name}",
  "engines.providers.changeFailed": "No se pudo cambiar.",
  "engines.providers.keySaveFailed": "No se pudo guardar la clave.",
  "engines.providers.listFailed": "No se pudo cargar la lista.",
  "engines.providers.keyRemoveFailed": "No se pudo eliminar la clave.",
  "engines.providers.saveFailed": "No se pudo guardar.",
  "engines.providers.testFailed": "No se pudo ejecutar la prueba.",
  "engines.tokens.title": "Tokens",
  "engines.tokens.description":
    "Lo que cada miembro usó en cada motor, tal como lo informó el propio motor. Los días se cuentan en UTC.",
  "engines.tokens.fallback": "No se pudieron cargar los recuentos de tokens.",
  "engines.tokens.empty": "Todavía no se ha contado ningún turno.",
  "engines.tokens.unavailable":
    "Los recuentos de tokens no están disponibles ahora.",
  "engines.tokens.problem":
    "No se pudo leer el archivo que guarda los recuentos, así que pueden faltar algunos números.",
  "engines.tokens.notReported": "no informado",
  "engines.tokens.col.engine": "Motor",
  "engines.tokens.col.week": "Últimos 7 días",
  "engines.tokens.allMembers": "Todos los miembros",
  "engines.tokens.note":
    "La entrada cuenta todos los tokens que se dieron al modelo, incluidos los de la caché. Cada fila cuenta intentos del motor: un reintento en el mismo motor cuenta de nuevo. Un intento cuyo motor no informó nada suma su tiempo y ningún token. El tiempo se mide aquí, desde el inicio hasta el final de cada intento.",
  "engines.tokens.savedWeek": "Ahorrado en los últimos 7 días",
  "engines.tokens.savedNote":
    "Ahorrado significa los tokens que pasaron por motores gratuitos, en la nube o en tu propio ordenador. Tu suscripción a Claude Code es de tarifa fija y los motores de pago cuestan dinero, así que ninguno de los dos cuenta.",
  "engines.tokens.currencyHelp":
    "Haz clic en un importe para cambiar entre euros y dólares.",
  "engines.tokens.reference":
    "A los precios de lista de {model} ({input} de entrada, {output} de salida por millón de tokens, {date}); {euro} = {rate} ({rateDate}).",
  "engines.tokens.under": "menos de {amount}",
  "engines.tokens.nothingYet": "todavía nada",
  "engines.tokens.plus": "más {time}",
  "engines.tokens.toDollars": "{amount}. Mostrar los importes en dólares",
  "engines.tokens.toEuros": "{amount}. Mostrar los importes en euros",
  "engines.tokens.amount": "{amount} tokens",
  "engines.tokens.timeLocal": "{time} en tu propia GPU",
  "engines.tokens.timeCloud": "{time} en un motor gratuito en la nube",
  "engines.tokens.and": " y ",
  "engines.tokens.timeTail": "{parts}, tokens no informados",
  "engines.tokens.cell": "{input} entrada · {output} salida",
  "engines.tokens.partial": "{reported} de {total} intentos informados",
  "engines.dur.under": "menos de 1 min",
  "engines.dur.min": "{minutes} min",
  "engines.dur.hourMin": "{hours} h {minutes} min",
  "engines.usage.bySource": "Por origen",
  "engines.usage.byMember": "Por miembro",
  "engines.usage.time": "Tiempo",
  "engines.usage.source.person": "Tú",
  "engines.usage.source.routine": "Rutinas",
  "engines.usage.source.handoff": "Entre miembros",
  "engines.usage.source.other": "Otros",
  "engines.usage.source.unknown": "Antes (no registrado)",
  "engines.usage.title": "Adónde fueron los últimos 7 días",
  "engines.usage.note":
    "Los porcentajes son sobre los tokens que informaron los motores (entrada más salida), o sobre el tiempo cuando se elige Tiempo; los intentos que no informaron tokens suman solo tiempo. «Tú» son tus propios mensajes, «Rutinas» son las rutinas y los seguimientos, «Entre miembros» son los traspasos, y «Otros» es todo lo demás, como las ejecuciones propias de una instalación.",
  "engines.usage.nothing": "No se contó nada en los últimos 7 días.",
  "engines.usage.chartsFailed":
    "No se pudieron dibujar los gráficos de uso. La tabla de abajo no se ve afectada.",
  "engines.usage.restMembers": "Otros miembros",
  "engines.usage.limitTitle": "Límites del plan",
  "engines.usage.limitNone":
    "Ahora mismo ningún motor está frenado por un límite.",
  "engines.usage.limitNote":
    "No se muestra un porcentaje del límite semanal de tu plan: la suscripción no se lo informa a FreeDuet. Un motor solo lo dice cuando ha llegado a un límite, con la hora a la que se espera que vuelva.",
  "engines.usage.range": "{from} a {to}, días UTC",
  "engines.usage.splitBy": "Dividir por",
  "engines.usage.measure": "Medida",
  "engines.usage.perDay": "{title}: {metric} por día",
  "engines.usage.perDayUtc": "{title}: {metric} por día, UTC",
  "engines.usage.day": "Día",
  // connections-begin
  "connections.connect": "Conectar",
  "connections.reconnect": "Reconectar",
  "connections.connected": "Conectado",
  "connections.teamAccount": "Cuenta del equipo",
  "connections.disconnect": "Desconectar",
  "connections.disconnecting": "Desconectando…",
  "connections.startFailed":
    "No se pudo iniciar la conexión, así que no se conectó nada. Inténtalo de nuevo, o pregunta a un administrador si sigue pasando.",
  "connections.list.auth.no-broker":
    "La conexión de apps todavía no está configurada, así que no se registró nada. Pide a un administrador que la configure.",
  "connections.list.auth.not-supported":
    "Aquí las apps se conectan una sola vez, con Conectar en la página de la app. No se autorizan una acción por vez.",
  "connections.list.auth.missing-handle":
    "Ese enlace no dice qué autorización completa, así que no se hizo nada. Empieza de nuevo desde la página de la app.",
  "connections.list.auth.no-attempt":
    "No hay ninguna autorización en curso que puedas completar. Puede que haya caducado o que se iniciara en otra sesión. Empieza de nuevo desde la página de la app.",
  "connections.list.auth.vendor-unavailable":
    "La app no respondió cuando {product} intentó completar esa autorización, así que no se registró nada. Prueba el enlace de nuevo en un momento.",
  "connections.list.auth.not-your-authorization":
    "Ese enlace no corresponde a la autorización que tienes en curso, así que no se registró nada. Complétala en la pestaña en la que la iniciaste, o empieza de nuevo desde la página de la app.",
  "connections.list.auth.not-finished":
    "Esa autorización todavía no ha terminado, así que no se registró nada. Complétala en la app y luego abre el enlace de nuevo.",
  "connections.list.auth.authorization-failed":
    "La app no completó esa autorización, así que no se registró nada. Empieza de nuevo desde la página de la app.",
  "connections.list.auth.context-changed":
    "La cuenta de esa app cambió mientras la autorización estaba abierta, así que no se registró nada. Se eliminó el acceso dado a la cuenta anterior. Empieza de nuevo desde la página de la app.",
  "connections.list.auth.not-permitted":
    "Ya no puedes conectar la cuenta de esa app, así que no se registró nada. Tu acceso o la configuración de la app cambiaron mientras la autorización estaba abierta. Pregunta a un administrador si esperabas completarla.",
  "connections.list.auth.cancelled":
    "Esa autorización se canceló mientras se completaba, así que no se registró nada. Se eliminó el acceso que había dado.",
  "connections.list.auth.cancelled-left-live":
    "Esa autorización se canceló mientras se completaba, así que no se registró nada. No se pudo eliminar el acceso que había dado, así que la app puede seguir permitiendo la acción que cancelaste. Para eliminarlo, desconecta la app desde su página, luego conéctala de nuevo y autoriza solo lo que quieras.",
  "connections.list.auth.not-recorded":
    "No se pudo registrar esa autorización, así que no se guardó nada. Empieza de nuevo desde la página de la app, o pregunta a un administrador si sigue pasando.",
  "connections.list.description":
    "Las apps y cuentas que tus asistentes usan como tú. Abre una para conectarla o cambiarla.",
  "connections.list.connectFailed":
    "No se pudo conectar esa cuenta. No se guardó nada. Inténtalo de nuevo.",
  "connections.list.title": "Tus conexiones",
  "connections.list.loading": "Cargando conexiones…",
  "connections.list.loadError":
    "No se pudieron cargar tus conexiones. Recarga la página, o pregunta a un administrador si sigue pasando.",
  "connections.list.empty":
    "Todavía no hay nada que conectar. Las apps aparecen aquí cuando un administrador las activa.",
  "connections.list.count": "{inUse} en uso · {total} en total",
  "connections.list.search": "Buscar conexiones",
  "connections.list.noMatch": "Nada coincide con “{query}”.",
  "connections.list.linksError":
    "No se pudieron cargar GitHub y Slack, así que no aparecen en la lista. Recarga la página.",
  "connections.list.connectNamed": "Conectar {title}",
  "connections.list.reconnectNamed": "Reconectar {title}",
  "connections.app.landed": "Acabas de autorizar {action}.",
  "connections.app.pendingTitle": "Cuenta",
  "connections.app.loadError":
    "No se pudo cargar esta conexión. Recarga la página, o pregunta a un administrador si sigue pasando.",
  "connections.app.appLoadError":
    "No se pudo cargar esta app. Recarga la página, o pregunta a un administrador si sigue pasando.",
  "connections.app.notSetUp":
    "{title} todavía no está configurado. Un administrador tiene que activarlo antes de que nadie pueda conectarlo.",
  "connections.app.sharedDesc":
    "Compartido por tu organización. Los asistentes actúan como la cuenta del equipo.",
  "connections.app.brokeredDesc":
    "Los asistentes lo usan como tú y solo ven lo que tú puedes ver.",
  "connections.app.reassurance": "Ningún asistente puede usarlo como tú.",
  "connections.app.tripPerAction": "Autoriza abajo las acciones que quieras.",
  "connections.app.tripConnect":
    "Al conectar, vas a {title} para aprobar el acceso.",
  "connections.app.connectedDesc":
    "Los asistentes que autorizas usan tu {title} como tú. Al desconectar, su acceso se elimina en todas partes.",
  "connections.app.notYours": "Esta app no la conectas tú.",
  "connections.app.oneShared":
    "Los asistentes usan una sola cuenta compartida para esta app, la misma para todos.",
  "connections.app.noApp": "{product} no tiene ninguna app con ese nombre.",
  "connections.app.yourAccount": "Tu cuenta",
  "connections.app.notAvailable":
    "Todavía no está disponible. Un administrador tiene que activarlo primero.",
  "connections.app.connectedAsYou":
    "Los asistentes que autorizas lo usan como tú y solo ven lo que tú puedes ver.",
  "connections.app.notConnected":
    "Ningún asistente puede usarlo como tú. Al conectar, vas a {vendor} para aprobar el acceso.",
  "connections.app.disconnectedDone":
    "Desconectado. {product} ya no puede usar tu cuenta de {vendor}.",
  "connections.app.disconnectedUnconfirmed":
    "Desconectado aquí. {vendor} no lo confirmó, así que elimina también {product} en los ajustes de acceso de terceros de tu cuenta de {vendor}.",
  "connections.app.accessDesc":
    "Lo que permitiste, tal como lo registró {vendor}. Puede ser menos de lo que pidió {product}.",
  "connections.app.access": "Acceso",
  "connections.app.allowed": "Permitido",
  "connections.app.vendorDidntSay": "{vendor} no lo dijo.",
  "connections.identity.toolsDesc":
    "Permite a tus asistentes leer y cambiar tus repositorios como tú. Esto lo conectas por separado de tu cuenta de arriba.",
  "connections.identity.tools": "Herramientas",
  "connections.identity.githubTools": "Herramientas de GitHub",
  "connections.identity.notConnected": "No conectado",
  "connections.mail.neverRun": "Todavía no se ha ejecutado.",
  "connections.mail.lastRun": {
    one: "Última ejecución {when}: {count} mensaje. {total} en total.",
    many: "Última ejecución {when}: {count} de mensajes. {total} en total.",
    other: "Última ejecución {when}: {count} mensajes. {total} en total.",
  },
  "connections.mail.on": "Activada. {activity}",
  "connections.mail.off": "Desactivada",
  "connections.mail.switchOff": "Desactivar",
  "connections.mail.switchOn": "Activar",
  "connections.mail.delete": "Eliminar",
  "connections.mail.lastProblem": "Último problema: {error}",
  "connections.mail.description":
    "Reglas permanentes que pediste en el chat. Tus asistentes las guardan y las aplican al correo nuevo cada pocos minutos; no son filtros de Gmail. Eliminar una regla no deshace lo que ya hizo.",
  "connections.mail.title": "Reglas de correo",
  "connections.mail.search": "Buscar reglas de correo",
  "connections.mail.statusLabel": "Estado de la regla",
  "connections.mail.allStatuses": "Todos los estados",
  "connections.mail.optActive": "Activas",
  "connections.mail.optPaused": "En pausa",
  "connections.mail.active": "Activa",
  "connections.mail.paused": "En pausa",
  "connections.mail.noMatch": "Ninguna regla coincide con estos filtros.",
  "connections.mail.paging": {
    one: "{from}–{to} de {count} regla",
    many: "{from}–{to} de {count} de reglas",
    other: "{from}–{to} de {count} reglas",
  },
  "connections.mail.previous": "Anterior",
  "connections.mail.next": "Siguiente",
  "connections.secret.aMember": "Un miembro",
  "connections.secret.doneMemberCal":
    "Conectado. {name} ya puede leer tu correo y tu calendario como tú.",
  "connections.secret.doneMember":
    "Conectado. {name} ya puede leer tu correo como tú.",
  "connections.secret.doneBotsCal":
    "Conectado. Los asistentes que autorizas ya pueden leer tu correo y tu calendario como tú.",
  "connections.secret.doneBots":
    "Conectado. Los asistentes que autorizas ya pueden leer tu correo como tú.",
  "connections.secret.notAvailable":
    "Todavía no está disponible. Un administrador tiene que activarlo primero.",
  "connections.secret.statusError":
    "No se pudo cargar si ya lo has conectado. Recarga la página, o pregunta a un administrador si sigue pasando.",
  "connections.secret.yourAccount": "Tu cuenta",
  "connections.secret.connectedCal":
    "Conectado como {address}. Tu calendario también está conectado. Los asistentes que autorizas lo usan como tú.",
  "connections.secret.connectedNoCal":
    "Conectado como {address}. No hay ningún calendario conectado. Los asistentes que autorizas lo usan como tú.",
  "connections.secret.notConnected":
    "Ningún asistente puede usarlo como tú. Pega abajo una contraseña de aplicación para conectar tu Gmail.",
  "connections.secret.useDifferent": "Usar otra contraseña de aplicación",
  "connections.secret.disconnected":
    "Desconectado. {product} ya no puede leer tu correo ni tu calendario. Para estar seguro de que la contraseña de aplicación deja de funcionar, elimínala también en {url}.",
  "connections.secret.formDesc":
    "Dos pasos en Google, y luego pega lo que te den. No se guarda nada a menos que Gmail lo acepte.",
  "connections.secret.connectTitle": "Conectar",
  "connections.secret.memberWillUse": "{name} usará este buzón.",
  "connections.secret.step1Lead":
    "Activa la verificación en dos pasos en tu cuenta de Google y luego crea una contraseña de aplicación en",
  "connections.secret.step1Tail":
    ". Ponle el nombre {product} y copia las dieciséis letras.",
  "connections.secret.step2Lead":
    "Para que tus asistentes vean también tu calendario: en Google Calendar abre Configuración, elige tu calendario y copia su",
  "connections.secret.step2Link": "Dirección secreta en formato iCal",
  "connections.secret.step2Tail": ". Este paso es opcional.",
  "connections.secret.address": "Tu dirección de Gmail",
  "connections.secret.password": "Contraseña de aplicación",
  "connections.secret.passwordHint":
    "Las dieciséis letras de Google, con o sin los espacios. No tu contraseña habitual.",
  "connections.secret.calendar": "Dirección secreta del calendario (opcional)",
  "connections.secret.calendarHint":
    "Cualquiera que tenga esta dirección puede leer tu calendario, así que se guarda con el mismo cuidado que la contraseña.",
  "connections.secret.checking": "Comprobando con Gmail…",
  "connections.secret.canDoTitle": "Qué permite hacer esto a tus asistentes",
  "connections.secret.canDoDesc":
    "Una contraseña de aplicación abre todo tu buzón, así que conviene saber qué hace esto.",
  "connections.secret.canDo":
    "Tus asistentes pueden buscar y leer tu correo y mirar tu calendario. No pueden eliminar, mover ni etiquetar nada. Una respuesta sale solo después de que la apruebes, y solo a personas que ya estén en el mensaje. Puedes desconectar en cualquier momento y puedes eliminar la contraseña de aplicación en Google cuando quieras.",
  "connections.mode.goesShared": "Se desconectará la cuenta compartida.",
  "connections.mode.goesNoShared":
    "No hay ninguna cuenta compartida conectada.",
  "connections.mode.goesPersonal": {
    one: "Se desconectará {count} cuenta personal.",
    many: "Se desconectarán {count} de cuentas personales.",
    other: "Se desconectarán {count} cuentas personales.",
  },
  "connections.mode.makeShared": "Hacer compartido {title}",
  "connections.mode.makePersonal": "Hacer personal {title}",
  "connections.mode.titleShared": "¿Compartir una sola cuenta de {title}?",
  "connections.mode.titlePersonal":
    "¿Dar a cada persona su propia cuenta de {title}?",
  "connections.mode.checking": "Comprobando qué cambiaría…",
  "connections.mode.everyone":
    "Todas las personas que usen un asistente con esta app actuarán como esta única cuenta.",
  "connections.cancel": "Cancelar",
  "connections.dir.description":
    "El directorio de apps de {name}. Añade una app para que sus herramientas estén disponibles para los asistentes. Cada persona sigue conectando su propia cuenta antes de que lea nada.",
  "connections.dir.appsTitle": "Apps",
  "connections.dir.appsDesc":
    "Busca por nombre. Nadie aquí ha revisado estas apps.",
  "connections.dir.searchAria": "Buscar en las apps de {name}",
  "connections.dir.searchPlaceholder": "Buscar por nombre de la app",
  "connections.dir.noMatch": 'Ninguna app de {name} coincide con "{query}".',
  "connections.dir.none": "{name} no devolvió ninguna app.",
  "connections.dir.actions": {
    one: "{count} acción",
    many: "{count} de acciones",
    other: "{count} acciones",
  },
  "connections.dir.added": "Añadida",
  "connections.dir.adding": "Añadiendo…",
  "connections.dir.add": "Añadir",
  "connections.grants.consentFailed":
    "{product} respondió sin un enlace de consentimiento, así que no se autorizó nada. Inténtalo de nuevo, o pregunta a un administrador si sigue pasando.",
  "connections.grants.title": "Acciones",
  "connections.grants.readError":
    "Ahora mismo no se pudo leer qué permite esta cuenta.",
  "connections.grants.retry": "Reintentar",
  "connections.grants.description":
    "Agrupadas por el permiso que pide cada acción. Coincide con lo que muestra la pantalla de consentimiento.",
  "connections.grants.search": "Buscar acciones",
  "connections.grants.wholeApp": "Todo en esta app, aprobado en conjunto",
  "connections.grants.noPermission": "No pide ningún permiso propio",
  "connections.grants.needs": "Requiere {scopes}",
  "connections.grants.authorize": "Autorizar",
  "connections.grants.hidden": {
    one: "{count} acción más todavía sin autorizar. Busca para encontrarla.",
    many: "{count} de acciones más todavía sin autorizar. Busca para encontrar una.",
    other:
      "{count} acciones más todavía sin autorizar. Busca para encontrar una.",
  },
  "connections.grants.noMatch": "Ninguna acción coincide con esa búsqueda.",
  "connections.grants.before": "Antes de autorizar {action}",
  "connections.grants.continue": "Continuar al consentimiento",
  "connections.grants.notRequired": "No requiere autorización.",
  "connections.grants.authorized": "Autorizada.",
  "connections.grants.notYet": "Todavía no autorizada.",
  "connections.grants.notYetAdmin":
    "Todavía no autorizada. Un administrador puede autorizarla.",
  "connections.grants.missing":
    "Falta {missing}. Un administrador tiene que configurarlo. Autorizar no lo arregla.",
  "connections.grants.missingSetting":
    "Falta un ajuste. Un administrador tiene que configurarlo. Autorizar no lo arregla.",
  "connections.grants.unknown":
    "Ahora mismo no se pudo leer esta acción. {reason}",
  "connections.row.connectKey":
    "Esta app se conecta con una clave, no con una página de inicio de sesión, así que no se conectó nada. Recarga la página y pulsa Conectar de nuevo.",
  "connections.row.noAuth":
    "{title} no necesita una cuenta. Los asistentes que lo tienen pueden usarlo tal cual.",
  "connections.row.verified":
    "Conectado con tu clave. Última comprobación: {date}.",
  "connections.row.failedCheck":
    "Tu clave no superó una comprobación con {title}. Puede ser la clave, o {title} mismo. Tu cuenta sigue conectada. Pulsa Comprobar de nuevo para reintentarlo, o desconecta y conecta con una clave nueva.",
  "connections.row.noSafeCheck":
    "Conectado con tu clave. No se ha comprobado con {title}. En ese momento {title} no tenía una forma segura de comprobar una clave. Eso es cosa de la app, no de tu clave.",
  "connections.row.unchecked":
    "Conectado con tu clave. No se ha comprobado con {title}.",
  "connections.row.keyStillWorks":
    "Desconectado. Tu clave sigue funcionando en {title}. Cámbiala allí para cortar todo acceso.",
  "connections.row.asksForKey":
    "{title} se conecta con una clave que ya tienes. Conectar te la pide.",
  "connections.row.signedIn": "Sesión iniciada con {title}. {description}",
  "connections.row.yourAccount": "Tu cuenta",
  "connections.row.keyMissing": "Falta la clave",
  "connections.row.recheck": "Comprobar de nuevo",
  "connections.row.rechecking": "Comprobando…",
  "connections.row.perAction": "Aprobado por acción",
  "connections.row.connectYour": "Conecta tu cuenta",
  "connections.row.checkingNeeds": "Comprobando qué necesita la app…",
  "connections.row.noNeeds":
    "No se pudo averiguar qué necesita esta app. Cierra esto y vuelve a intentarlo.",
  // connections-end
};
