import type { Catalog } from "../translate";
import type { EN } from "./en";

/*
 * Italian: natural and short, "tu", the same tone as the cards (person-language/cards.ts). The Bot speaks
 * in the first person with verbs that need no gender ("Non sono riuscito" for the Bot is masculine, as
 * "Bot" is).
 */
export const it: Catalog<typeof EN> = {
  "sign.title": "Accedi a {product}",
  "sign.continueWith": "Continua con {provider}",
  "sign.opening": "Apro {provider}…",
  "sign.openError":
    "Non è stato possibile aprire l'accesso con {provider}. Riprova.",
  "sign.ssoRequired":
    "La tua organizzazione richiede di accedere con l'account aziendale.",
  "sign.pairLead":
    "Questo browser non è ancora abbinato a {product}. Sul computer su cui gira, esegui",
  "sign.pairTail": ": si apre {product} qui, pronto all'uso.",
  "sign.notSetUp":
    "L'accesso non è ancora configurato. Un amministratore deve configurarlo prima.",
  "sign.or": "oppure",
  "sign.emailPlaceholder": "tu@azienda.com",
  "sign.openingCompany": "Apro…",
  "sign.continueCompany": "Continua con l'account aziendale",
  "sign.adminSignIn": "Accesso amministratore",
  "sign.noCompany":
    "Per quell'indirizzo non è configurato un accesso aziendale.",
  "shell.menu": "Menu",
  "shell.everything": "Tutto",
  "shell.everythingLine": "Tutto il contesto delle chat, in ogni canale",
  "shell.channelsError":
    "Non sono riuscito a caricare i tuoi canali. Ricarica la pagina.",
  "shell.channels": "Canali",
  "shell.newChannel": "Nuovo canale",
  "shell.archived": "Archiviati",
  "shell.archivedChannels": "Canali archiviati",
  "shell.unarchive": "Ripristina",
  "shell.unarchiveNamed": "Ripristina {name}",
  "shell.earlier": "Conversazioni precedenti",
  "shell.manage": "Gestisci",
  "shell.signOut": "Esci",
  "nav.bots": "Bot",
  "nav.connections": "Connessioni",
  "nav.capabilities": "Capacità",
  "nav.routines": "Routine",
  "nav.approvalRules": "Regole di approvazione",
  "nav.admin": "Amministrazione",
  "nav.dashboard": "Dashboard",
  "nav.settings": "Impostazioni",
  "tab.main": "Principale",
  "tab.chat": "Chat",
  "tab.tasks": "Attività",
  "tab.make": "Crea",
  "tab.waiting": "{tab}, {badge} in attesa",
  "header.chat": "Chat di {product}",
  "header.settings": "Le tue impostazioni",
  "header.back": "Indietro",
  "header.more": "Altro",
  "composer.ask": "Chiedi qualsiasi cosa",
  "composer.message": "Messaggio",
  "composer.queue": "Metti il messaggio in coda",
  "composer.send": "Invia messaggio",
  "composer.stop": "Ferma il Bot",
  "composer.showCall": "Mostra la chiamata vocale",
  "composer.startCall": "Avvia una chiamata vocale",
  "composer.callBot": "Chiama questo Bot",
  "composer.callUnsupported":
    "Le chiamate vocali richiedono un microfono e una connessione sicura (HTTPS)",
  "composer.speak": "Parla per scrivere un messaggio",
  "composer.dictateTitle": "Di' tutto quello che devi fare",
  "composer.attach": "Allega un file",
  "composer.moreUnavailable": "Altre opzioni del messaggio non disponibili",
  "composer.messageNamed": "Scrivi a {name}",
  "chat.botsError":
    "Non sono riuscito a caricare i tuoi Bot. Ricarica la pagina.",
  "chat.noBots": "Non ci sono ancora Bot.",
  "chat.conversationError":
    "Non sono riuscito a caricare la conversazione. Ricarica la pagina.",
  "chat.stillStarting":
    "La conversazione sta ancora partendo. Riprova tra un attimo.",
  "chat.startError": "Non sono riuscito ad avviare la conversazione. Riprova.",
  "attention.questions": { one: "{count} domanda", other: "{count} domande" },
  "attention.approvals": {
    one: "{count} approvazione",
    other: "{count} approvazioni",
  },
  "attention.handoffs": {
    one: "{count} passaggio di consegne bloccato",
    other: "{count} passaggi di consegne bloccati",
  },
  "attention.unread": {
    one: "{count} conversazione non letta",
    other: "{count} conversazioni non lette",
  },
  "attention.needYou": {
    one: "{count} cosa ha bisogno di te",
    other: "{count} cose hanno bisogno di te",
  },
  "attention.open": "{summary}. Apri Bot per occupartene.",
  "attention.unreadMessages": "Messaggi non letti",
  "bots.new": "Nuovo Bot",
  "bots.purpose":
    "I tuoi Bot e quelli condivisi con te. Guarda cosa sta facendo ognuno e di cosa ha bisogno da te.",
  "bots.loadError":
    "Non sono riuscito a caricare i tuoi Bot. Ricarica la pagina.",
  "bots.needsYou": "Hanno bisogno di te",
  "bots.pinned": "Fissati",
  "bots.yours": "I tuoi",
  "bots.shared": "Condivisi con te",
  "bots.allPinned": "I tuoi Bot sono tutti fissati qui sopra.",
  "bots.allNeedYou": "I tuoi Bot sono tutti sotto «Hanno bisogno di te».",
  "bots.none": "Non hai ancora nessun Bot. Creane uno con Nuovo Bot.",
  "bots.nobodyShared": "Nessuno ha ancora condiviso un Bot con te.",
  "bots.hide": "Nascondi",
  "bots.show": "Mostra",
  "bots.hidden": "Nascosti",
  "bots.hiddenDescription": {
    one: "{count} Bot che hai nascosto. Cambia solo il tuo elenco.",
    other: "{count} Bot che hai nascosto. Cambia solo il tuo elenco.",
  },
  "bots.paused": "In pausa",
  "bots.message": "Scrivi",
  "bots.wroteIn": {
    one: "{name} ha scritto in {count} conversazione che non hai letto.",
    other: "{name} ha scritto in {count} conversazioni che non hai letto.",
  },
  "bots.readNewest": "Leggi la più recente",
  "bots.resuming": "Riattivo…",
  "bots.pausedResume": "In pausa. Riattiva",
  "botPage.purpose": "Cosa sta facendo questo Bot per te e come è configurato.",
  "botPage.fallbackTitle": "Bot",
  "botPage.openError":
    "Non sono riuscito ad aprire questo Bot. Forse non è condiviso con te.",
  "profile.forYou": "Per te",
  "profile.settingsError":
    "Non sono riuscito a caricare le impostazioni di questo Bot. Ricarica la pagina.",
  "profile.active": "Attivo",
  "profile.pausedDescription":
    "In pausa. Niente parte per te finché non lo riattivi.",
  "profile.activeDescription":
    "Esegue per te routine, responsabilità, passaggi di consegne e solleciti.",
  "profile.notifications": "Notifiche",
  "profile.notifyDescription":
    "{level}. I contatori nella barra laterale si vedono sempre.",
  "profile.notify.all": "Tutto",
  "profile.notify.needsInput": "Solo quando ha bisogno di me",
  "profile.notify.none": "Niente (solo i contatori)",
  "profile.browserNotifications": "Notifiche del browser",
  "profile.browserOff":
    "Disattivate in questo browser. Attivale per sapere quando un Bot ha bisogno di te.",
  "profile.turnOn": "Attiva",
  "profile.startConversation": "Avvia una conversazione.",
  "stalled.what": "{name} non ha finito: {task}",
  "stalled.why": "Motivo: {reason}.",
  "stalled.retryError":
    "Non è stato possibile riprovare. Forse è già in corso.",
  "stalled.dismissError":
    "Non è stato possibile scartarlo. Forse è già in corso.",
  "stalled.dismissing": "Scarto…",
  "stalled.dismissed": "Scartato",
  "stalled.dismiss": "Scarta",
  "stalled.retrying": "Riprovo…",
  "stalled.queued": "Rimesso in coda",
  "stalled.retry": "Riprova",
  "stalled.open": "Apri la conversazione",
  "dash.title": "Dashboard",
  "dash.notAvailable": "Non ancora disponibile",
  "dash.tokensNotCounted": "Oggi non è ancora stato contato nessun turno.",
  "dash.countsUnavailable":
    "I conteggi dei token non sono disponibili in questo momento.",
  "dash.enginesLink": "Gestisci i motori",
  "dash.teamLink": "Tutti i membri",
  "dash.waitingForYou": "In attesa di te",
  "dash.available": "Disponibile",
  "dash.loading": "Carico il tuo team…",
  "dash.nothingWaits": "Non c'è nulla che ti aspetta.",
  "dash.thingsWait": {
    one: "{count} cosa ti aspetta.",
    other: "{count} cose ti aspettano.",
  },
  "dash.partialCount":
    "{reported} tentativi su {turns} hanno riportato un conteggio",
  "dash.inputPlusOutput": "Input più output, come l'ha riportato ogni motore",
  "dash.nothingSaved": "Oggi nulla è ancora passato da un motore gratuito",
  "dash.firstFor": {
    one: "primo per {count} membro",
    other: "primo per {count} membri",
  },
  "dash.members": { one: "{count} membro", other: "{count} membri" },
  "dash.indicators": "Indicatori",
  "dash.tokensToday": "Token di oggi",
  "dash.savedToday": "Risparmiato oggi con i motori gratuiti",
  "dash.waitingSub": "Domande, approvazioni e passaggi di consegne bloccati",
  "dash.nextRoutine": "Prossima routine",
  "dash.noRoutine": "Nessuna routine in programma.",
  "dash.team": "Team",
  "dash.engines": "Motori",
  "dash.noEngine": "Nessun motore è ancora configurato.",
  "dash.perMemberAria": "Token per membro",
  "dash.perMember": "Token per membro, oggi",
  "dash.foot":
    "I conteggi sono quelli riportati da ogni motore, per giorni UTC. Un registro delle attività recenti e un indicatore del limite del piano non sono ancora disponibili.",
  "voice.heardNothing":
    "Non ho sentito niente. Tocca il microfono per riprovare, oppure scrivi.",
  "voice.tapWhenDone": "Tocca il microfono quando hai finito",
  "voice.discard": "Scarta",
  "voice.start": "Avvia la dettatura",
  "voice.stopAndSend": "Ferma la dettatura e invia",
  "voice.typeInstead": "Scrivi invece",
  "voice.retry": "Riprova",
  "voice.recordAgain": "Registra di nuovo",
  "voice.writing": "Scrivo quello che hai detto…",
  "voice.listeningStop": "Ascolto… mi fermo quando fai una pausa",
  "voice.listening": "Ti ascolto, inizia pure a parlare",
  "voice.permission": "In attesa del permesso per il microfono…",
  "home.bots": "Conosci il tuo team e gestisci ogni Bot.",
  "home.capabilities": "Competenze e memoria.",
  "home.connectionsLabel": "Account, app e regole per la posta",
  "home.connections": "Collega un account, un'app o la tua posta.",
  "home.setupLabel": "Elenco di configurazione",
  "home.setup": "Guarda cosa è configurato e cosa manca.",
  "home.approvalsLabel": "Regole di approvazione e Accesso completo",
  "home.approvals": "Cosa può fare un Bot senza chiederti il permesso.",
  "home.passwordsLabel": "Password",
  "home.passwords": "Le password che il tuo team può usare.",
  "home.routines":
    "Lavori che si ripetono da soli, e la vista della settimana.",
  "home.notifications": "Dove ti arrivano gli aggiornamenti.",
  "home.admin": "Computer, credenziali, limiti, persone e registro.",
  "home.engines":
    "Chi risponde per ogni Bot, in che ordine, e quanto hanno usato oggi. Il tuo abbonamento resta il primo finché non cambi l'ordine.",
  "home.safety": "Sicurezza",
  "home.jobs": "Lavori",
  "home.system": "Sistema",
  "settings.description":
    "Gestisci il tuo team, gli account collegati e le tue preferenze.",
  "settings.sections": "Sezioni delle impostazioni",
  "settings.workspace": "Area di lavoro",
  "settings.preferences": "Preferenze",
  "settings.devices": "Dispositivi e info",
  "settings.appearance": "Aspetto",
  "settings.matchPhone": "Come il telefono",
  "settings.light": "Chiaro",
  "settings.dark": "Scuro",
  "settings.voice": "Voce",
  "settings.shortcuts": "Scorciatoie da tastiera",
  "language.section": "Lingua",
  "language.title": "Lingua dell'app",
  "language.description":
    "La lingua di menu e pulsanti. Il tuo team ti scrive nella lingua impostata in chat.",
  "language.auto": "Automatica (browser)",
  "settings.descriptionPlain": "Come {product} appare e funziona per te.",
  "wide.yourTeam": "Il tuo team",
  "wide.team": "Team",
  "wide.stateWaiting": "In attesa di te",
  "wide.stateWorking": "Ci sta lavorando",
  "wide.memberLabel": "{name}, {line}",
  "chat.loadingConversation": "Carico questa conversazione",
  "chat.readAloud": "Leggi ad alta voce",
  "chat.stopReading": "Smetti di leggere",
  "chat.thinking": "Sto pensando",
  "chat.queued": "In coda",
  "chat.removeQueued": "Rimuovi il messaggio in coda: {what}",
  "chat.remove": "Rimuovi",
  "chat.routineRan": "Routine eseguita.",
  "chat.firstDayYes": "Mi sembra giusto",
  "chat.firstDayNo": "Qualcosa non va",
  "chat.tryingAgain": "Riprovo.",
  "chat.responsibilityRan": "Responsabilità eseguita.",
  "chat.trigger": "Attivazione:",
  "chat.details": "Dettagli",
  "chat.via": "tramite {source}",
  "chat.untitledFile": "File senza nome",
  "chat.attachment": "Allegato",
  "chat.attachmentLower": "allegato",
  "chat.attachmentNamed": "Allegato: {name}",
  "chat.unavailableNamed": "{name} non è disponibile.",
  "chat.unavailable": "Questo allegato non è disponibile.",
  "chat.openNamed": "Apri {name}",
  "chat.close": "Chiudi",
  "chat.generatedInterface": "L'interfaccia generata da questo Bot",
  "chat.usedBrowser": "Usato il browser",
  "chat.hostAndMore": "{host} e altri {amount}",
  "chat.searchedWeb": "cercato sul web",
  "chat.readPages": {
    one: "letto {amount} pagina",
    other: "letto {amount} pagine",
  },
  "chat.browsedPages": {
    one: "navigato {amount} pagina",
    other: "navigato {amount} pagine",
  },
  "chat.usedBrowserPhrase": "usato il browser",
  "chat.usedNamed": "usato {name}",
  "chat.usedConnectors": {
    one: "usato {amount} connettore",
    other: "usato {amount} connettori",
  },
  "chat.usedTools": {
    one: "usato {amount} strumento",
    other: "usato {amount} strumenti",
  },
  "chat.andJoin": "{head} e {last}",
  "chat.inProgress": "In corso",
  "chat.waitingForYou": "In attesa di te",
  "chat.notCompleted": "Non completato",
  "chat.blocked": "Bloccato",
  "chat.didntWork": "Non ha funzionato",
  "chat.couldntFinishStep": "Non sono riuscito a completare questo passaggio.",
  "chat.issues": {
    one: "{amount} problema",
    other: "{amount} problemi",
  },
  "settings.changesTitle": "Modifiche fatte in chat",
  "settings.changesDescription":
    "Impostazioni che un Bot ha cambiato dalla chat. Annulla rimette il valore precedente per sette giorni, e solo finché l'impostazione mantiene il valore impostato dalla modifica.",
  "settings.changesLoading": "Carico le modifiche…",
  "settings.changesEmpty": "Nessuna modifica fatta in chat finora.",
  "settings.undoFailed": "Non sono riuscito ad annullare la modifica. Riprova.",
  "settings.levelAll": "tutto",
  "settings.levelNeedsInput": "solo quando ha bisogno di te",
  "settings.memberAdded": "{member} è stato aggiunto al tuo team",
  "settings.nameChanged":
    "{bot}: il tuo nome per lui è passato da {from} a {to}",
  "settings.nameOwn": "il suo nome",
  "settings.languageChanged":
    "La tua lingua per il team è passata da {from} a {to}",
  "settings.deploymentOwn": "quella dell'installazione",
  "settings.toneChanged": "{bot}: il tono è passato da {from} a {to}",
  "settings.notifyChanged": "{bot}: le notifiche sono passate da {from} a {to}",
  "settings.undone": "Annullata",
  "settings.undoGone": "Annullare non è più possibile",
  "settings.undoing": "Annullo…",
  "settings.undo": "Annulla",
  "settings.devicesTitle": "I tuoi dispositivi",
  "settings.devicesDescription":
    "Accedi all'app {product} sul telefono e attiva le notifiche per aggiungerlo qui.",
  "settings.devicesEmpty": "Nessun dispositivo ancora.",
  "settings.deliveriesTitle": "Invii recenti",
  "settings.deliveriesEmpty": "Nessun invio ancora.",
  "settings.repositories": "Repository",
  "settings.repositoriesDescription":
    "Aggiungi qui un repository, poi aggiungi in GitHub un webhook con l'indirizzo qui sotto e lo stesso segreto. I suoi eventi, come issues.opened, possono poi avviare una responsabilità.",
  "settings.addRepository": "Aggiungi un repository",
  "settings.repositoriesEmpty":
    "Nessun repository ancora. Aggiungine uno con «Aggiungi un repository».",
  "settings.repository": "Repository",
  "settings.webhookSecret": "Segreto del webhook",
  "settings.disconnect": "Disconnetti",
  "settings.sameSecret":
    "Usa lo stesso segreto quando aggiungi il webhook in GitHub.",
  "settings.cancel": "Annulla",
  "settings.connectEvents": "Collega gli eventi",
  "settings.needsReconnect": "Da ricollegare",
  "settings.needsReconnectHandle": "Da ricollegare · @{handle}",
  "settings.linked": "Collegato",
  "settings.yourAccount": "Il tuo account",
  "settings.cantLink":
    "Non puoi ancora collegare un account {provider}. Prima un amministratore deve configurarlo.",
  "settings.loadAccountError":
    "Non sono riuscito a caricare il tuo account: {error}",
  "settings.checkLinkError":
    "Non sono riuscito a verificare se puoi collegare questo account: {error}",
  "settings.slackCodeError":
    "Non sono riuscito a creare un codice Slack: {error}",
  "settings.githubConnectError":
    "Non sono riuscito a collegare GitHub: {error}",
  "settings.linkSlack": "Collega il tuo account Slack",
  "settings.copied": "Copiato",
  "settings.copy": "Copia",
  "settings.copyFailed":
    "Non sono riuscito a copiare. Seleziona il codice e copialo tu.",
  "settings.codeExpires":
    "Il codice funziona una sola volta e scade tra 10 minuti.",
  "settings.done": "Fatto",
  "settings.notLinked": "Non collegato",
  "settings.connect": "Collega",
  "settings.connectNamed": "Collega {name}",
  "settings.disconnectNamed": "Disconnetti {name}",
  "settings.disconnectError":
    "Non sono riuscito a disconnettere {name}: {error}",
  "settings.githubLinked": "Il tuo account GitHub è collegato.",
  "settings.githubLinkFailed":
    "Non sono riuscito a collegare il tuo account GitHub. Riprova.",
  "settings.githubTaken":
    "Quell'account GitHub è collegato a un'altra persona in {product}. Accedi a GitHub con un altro account e riprova, oppure chiedi a un amministratore.",
  "settings.emphasisTitle": "Evidenza nell'elenco dei messaggi",
  "settings.emphasisDescription":
    "Scegli quale riga risalta nella barra laterale.",
  "settings.emphasisBot": "Nome del Bot",
  "settings.emphasisConversation": "Titolo della conversazione",
  "settings.loading": "Carico…",
  "settings.saving": "Salvo…",
  "settings.emphasisPreview": "Anteprima dell'elenco dei messaggi",
  "settings.sampleBot": "Assistente generale",
  "settings.sampleTitle": "Pianifica la settimana prossima",
  "settings.readAloudTitle": "Leggi le risposte ad alta voce",
  "settings.readAloudDescription":
    "Aggiunge un pulsante Leggi ad alta voce sotto ogni risposta di un Bot. Usa una voce di questo computer soltanto, e non viene inviato nulla altrove.",
  "settings.noItalianVoice":
    "Su questo computer non c'è una voce italiana locale, quindi qui le risposte non possono essere lette ad alta voce.",
  "settings.general": "Generali",
  "settings.setup": "Configurazione",
  "settings.approvals": "Approvazioni",
  "settings.componentsGallery": "Galleria dei componenti",
  "settings.backToApp": "Torna all'app",
  "settings.standingTitle": "Istruzioni permanenti",
  "settings.standingDescription":
    "Vale per ogni Bot in ogni conversazione. Il ruolo di un Bot dice cosa fa. Questo dice come vuoi che lo faccia, come il tuo stile di scrittura.",
  "settings.charactersOf": "{used} caratteri su {limit}",
  "settings.saved": "Salvato",
  "settings.save": "Salva",
  "settings.sharedBots": "Bot condivisi",
  "settings.sharedBotsDescription":
    "Un Bot condiviso con te usa le app del suo proprietario. Usa le tue solo dove hai detto di sì in una conversazione.",
  "settings.appsSharedBots": "App che lasci usare ai Bot condivisi",
  "settings.resetDone": "Reimpostato. Ogni Bot condiviso chiederà di nuovo.",
  "settings.resetDescription":
    "Dimentica ogni risposta, così ogni Bot condiviso chiede di nuovo.",
  "settings.reset": "Reimposta",
  "settings.kindProgress": "Avanzamento",
  "settings.kindProgressDescription":
    "Risposte e risultati di lavori che non stavi seguendo.",
  "settings.kindDecision": "Decisioni",
  "settings.kindDecisionDescription":
    "Approvazioni di cui un Bot ha bisogno prima di agire.",
  "settings.kindQuestion": "Domande",
  "settings.kindQuestionDescription":
    "Cose che un Bot ti ha chiesto e per cui sta aspettando.",
  "settings.switchLabel": "{kind} tramite {transport}",
  "settings.notSetUp": "Non configurato",
  "settings.routingDescription":
    "Dove va ogni tipo di aggiornamento quando sei via. {product} sul web mostra sempre tutto.",
  "settings.routingTitle": "Dove arrivano gli aggiornamenti",
  "settings.routingError":
    "Non sono riuscito a caricare dove arrivano i tuoi aggiornamenti. Ricarica la pagina.",
  "settings.qrLabel": "Codice QR con il link di abbinamento",
  "settings.pairThisTitle": "Abbina questo browser",
  "settings.pairThisDescription":
    "Sul computer su cui gira FreeDuet apri Impostazioni, premi Crea un codice sotto Abbina un telefono o un altro browser, poi apri il link che mostra oppure scrivi qui il codice.",
  "settings.pairedDone": "Questo browser è abbinato al computer.",
  "settings.linkBroughtCode":
    "Il link ha portato un codice. Dai un nome a questo browser e premi Abbina.",
  "settings.code": "Codice",
  "settings.name": "Nome",
  "settings.phone": "Telefono",
  "settings.pairedDescription":
    "Un telefono o un altro browser abbinato funziona come questo. Revocane uno e alla sua prossima richiesta viene escluso e disconnesso.",
  "settings.pairedTitle": "Abbina un telefono o un altro browser",
  "settings.makeCode": "Crea un codice",
  "settings.cannotMakeCode":
    "Il codice si crea nel browser abbinato al computer. Questo non può crearne uno.",
  "settings.runsOut":
    "Sul telefono, con il tuo accesso, inquadra questo codice o apri il link, oppure apri Impostazioni e scrivi il codice. Funziona una sola volta e scade tra {time}.",
  "settings.codeRanOut": "Quel codice è scaduto. Creane uno nuovo.",
  "settings.localAddress":
    "Questo indirizzo funziona solo su questo computer. Un telefono ha bisogno dell'indirizzo con cui FreeDuet è raggiungibile dall'esterno: aprilo sul telefono e scrivi il codice in Impostazioni.",
  "settings.thisBrowserTag": "(questo browser)",
  "settings.computer": "Computer",
  "settings.phoneOrBrowser": "Telefono o altro browser",
  "settings.madeWhen": "creato {when}",
  "settings.lastSeen": "visto l'ultima volta {when}",
  "settings.rename": "Rinomina",
  "settings.revoke": "Revoca",
  // The Bot pages (D181 stage 2d): a Bot's activity, settings, access, Manage, Setup and Sharing,
  // and the descriptions of its sub-pages (`bot.page.*`). Shared words reuse their existing keys.
  "bot.activity.kindRoutine": "Routine",
  "bot.activity.kindResponsibility": "Responsabilità",
  "bot.activity.kindHandoff": "Attività delegata",
  "bot.activity.kindApproval": "Approvazione",
  "bot.activity.kindQuestion": "Domanda",
  "bot.activity.kindFollowUp": "Sollecito",
  "bot.activity.needsYou": "ha bisogno di te",
  "bot.activity.stop": "Ferma",
  "bot.activity.stopping": "Fermo…",
  "bot.activity.cancelling": "Annullo…",
  "bot.activity.open": "Apri",
  "bot.activity.title": "Attività",
  "bot.activity.scheduled": "In programma",
  "bot.activity.completed": "Completati",
  "bot.activity.emptyInProgress": "Non c'è nulla in corso né in attesa di te.",
  "bot.activity.emptyScheduled": "Non c'è nulla in programma.",
  "bot.activity.emptyCompleted": "Non è ancora finito nulla.",
  "bot.activity.loadError":
    "Non sono riuscito a caricare l'attività di questo Bot. Ricarica la pagina.",
  "bot.settings.heading": "Impostazioni di questo Bot",
  "bot.area.responsibilities": "Responsabilità",
  "bot.area.reaching": "Come ti raggiunge",
  "bot.area.memory": "Memoria",
  "bot.area.access": "Competenze e accessi",
  "bot.area.sharing": "Condivisione",
  "bot.settings.activeCount": {
    one: "{count} attiva",
    other: "{count} attive",
  },
  "bot.settings.noneActive": "Nessuna attiva",
  "bot.settings.ruleCount": { one: "{count} regola", other: "{count} regole" },
  "bot.settings.noRules": "Nessuna regola",
  "bot.settings.routineCount": {
    one: "{count} routine",
    other: "{count} routine",
  },
  "bot.settings.noRoutines": "Nessuna routine",
  "bot.access.skillsDescription":
    "Attiva una competenza per usarla con questo Bot. Scrivi / in una conversazione per eseguirla.",
  "bot.access.yourSkills": "Le tue competenze",
  "bot.access.skillsError":
    "Non sono riuscito a caricare le tue competenze. Ricarica la pagina.",
  "bot.access.noSkills": "Ancora nessuna competenza.",
  "bot.access.writeOne": "Scrivine una",
  "bot.access.title": "Cosa può usare",
  "bot.access.grantedDescription":
    "Le app e le competenze che questo Bot può usare, e se ogni app è pronta per te. Non può usare altro.",
  "bot.access.grantedError":
    "Non sono riuscito a caricare ciò che questo Bot può usare. Ricarica la pagina.",
  "bot.access.readyError":
    "Non sono riuscito a verificare se ogni app è pronta per te. Ricarica la pagina.",
  "bot.access.noApps":
    "Ancora nessuna app. Un amministratore deve aggiungerle. Fino ad allora questo Bot può solo parlare con te.",
  "bot.access.toolsAndMore": "{list} e altri {count}",
  "bot.access.toolCount": {
    one: "{count} strumento",
    other: "{count} strumenti",
  },
  "bot.access.skillLabel": "Competenza",
  "bot.access.manageNamed": "Gestisci {title} su questo Bot",
  "bot.reset.conversations": {
    one: "{count} conversazione",
    other: "{count} conversazioni",
  },
  "bot.reset.memorySources": {
    one: "{count} fonte di memoria",
    other: "{count} fonti di memoria",
  },
  "bot.reset.memories": {
    one: "{count} memoria importata",
    other: "{count} memorie importate",
  },
  "bot.reset.routines": { one: "{count} routine", other: "{count} routine" },
  "bot.reset.responsibilities": {
    one: "{count} responsabilità",
    other: "{count} responsabilità",
  },
  "bot.reset.followUps": {
    one: "{count} sollecito programmato",
    other: "{count} solleciti programmati",
  },
  "bot.reset.formedMemories": {
    one: "{count} memoria creata dal Bot",
    other: "{count} memorie create dal Bot",
  },
  "bot.reset.research": {
    one: "{count} ricerca in background",
    other: "{count} ricerche in background",
  },
  "bot.reset.standing": {
    one: "{count} permesso permanente",
    other: "{count} permessi permanenti",
  },
  "bot.reset.title": "Reimpostare {name}?",
  "bot.reset.description":
    "Elimina ciò che {name} ha con te. Le conversazioni e i dati di altre persone restano. Non si può annullare.",
  "bot.reset.planError":
    "Non sono riuscito a verificare cosa eliminerebbe la reimpostazione. Riprova.",
  "bot.reset.done": "Fatto. {name} ricomincia da zero con te.",
  "bot.reset.nothing": "Non c'è niente di tuo da eliminare.",
  "bot.reset.willDelete": "Verrà eliminato:",
  "bot.reset.sharedKept": {
    one: "{count} conversazione è condivisa con altre persone o altri Bot e verrà mantenuta.",
    other:
      "{count} conversazioni sono condivise con altre persone o altri Bot e verranno mantenute.",
  },
  "bot.reset.memoriesKept":
    "Restano le memorie che hai raccontato tu stesso a un Bot.",
  "bot.reset.resetting": "Reimposto…",
  "bot.reset.submit": "Elimina e reimposta",
  "bot.manage.pinnedAssigned":
    "Un amministratore te l'ha assegnato. Resta in cima al tuo elenco di Bot.",
  "bot.manage.pinnedOn":
    "In cima al tuo elenco di Bot. Cambia solo il tuo elenco.",
  "bot.manage.pinnedOff":
    "Tienilo in cima al tuo elenco di Bot. Cambia solo il tuo elenco.",
  "bot.manage.hiddenAssigned":
    "Un amministratore te l'ha assegnato. Non puoi nasconderlo.",
  "bot.manage.hiddenOn":
    "Sotto «Nascosti» nel tuo elenco di Bot. Cambia solo il tuo elenco.",
  "bot.manage.hiddenOff":
    "Toglilo dal tuo elenco di Bot. Cambia solo il tuo elenco.",
  "bot.manage.duplicate": "Duplica",
  "bot.manage.duplicateDescription":
    "Crea una copia tua. Le sue conversazioni e le sue chiavi non vengono copiate.",
  "bot.manage.resetDescription":
    "Elimina le tue conversazioni con questo Bot, ciò che ricorda per te e il suo lavoro programmato. Prima vedrai l'elenco.",
  "bot.manage.delete": "Elimina",
  "bot.manage.deleteDescription": "Lo elimina per tutti. Non si può annullare.",
  "bot.manage.deleteTitle": "Eliminare {name}?",
  "bot.manage.deleteConfirm":
    "Viene eliminato per tutti. Non si può annullare.",
  "bot.manage.deleting": "Elimino…",
  "bot.setup.title": "Titolo",
  "bot.setup.whatItDoes": "Cosa fa",
  "bot.setup.identity": "Identità",
  "bot.setup.systemOwned": "Di sistema",
  "bot.setup.systemOwnedDescription":
    "Arriva con {product}. Non appartiene a nessuna persona.",
  "bot.setup.visibility": "Visibilità",
  "bot.setup.visiblePrivate":
    "Solo tu puoi vederlo e avviare conversazioni con lui.",
  "bot.setup.visiblePublic": "Chiunque su {product} può trovarlo e usarlo.",
  "bot.setup.private": "Privato",
  "bot.setup.public": "Pubblico",
  "bot.setup.saveError": "Non sono riuscito a salvare. Riprova.",
  "bot.setup.checkField": "Controlla questo campo e riprova.",
  "bot.setup.connection": "Connessione",
  "bot.setup.builtIn": "Integrato",
  "bot.setup.agentUrl": "URL dell'agente",
  "bot.setup.builtInDescription":
    "Gira dentro {product}. Non c'è niente da collegare.",
  "bot.sharing.published": "Pubblicato",
  "bot.sharing.toWholeTeam": "A tutto il team",
  "bot.sharing.toPeople": "A {who}",
  "bot.sharing.groupNamed": "gruppo {name}",
  "bot.sharing.teamPrivate":
    "Le conversazioni di ogni persona con lui sono private.",
  "bot.sharing.notVisibleYet":
    "I membri del team non lo vedono finché non ha un nome e una descrizione veri.",
  "bot.sharing.unpublish": "Annulla la pubblicazione",
  "bot.sharing.link": "Collegamento",
  "bot.sharing.linkDescription": "Apre una conversazione privata con lui.",
  "bot.sharing.copyLink": "Copia il collegamento",
  "bot.sharing.publicNotPublished":
    "Non pubblicato al team. È pubblico, quindi chiunque su {product} può già usarlo.",
  "bot.sharing.onlyYouCanUse": "Non pubblicato. Solo tu puoi usarlo.",
  "bot.sharing.notPublished": "Non pubblicato.",
  "bot.sharing.whoPublishedTo": "A chi è pubblicato",
  "bot.sharing.publish": "Pubblica",
  "bot.sharing.publishNote":
    "Pubblicarlo non cambia la sua visibilità. Puoi annullarne la pubblicazione in qualsiasi momento.",
  "bot.sharing.audience": "Destinatari",
  "bot.sharing.notPublishedSummary": "Non pubblicato",
  "bot.sharing.theWholeTeam": "Tutto il team",
  "bot.sharing.specificPeople": "Persone o gruppi specifici",
  "bot.sharing.peopleCount": {
    one: "{count} persona",
    other: "{count} persone",
  },
  "bot.sharing.groupCount": { one: "{count} gruppo", other: "{count} gruppi" },
  "bot.sharing.assignToGroups": "Assegna a gruppi",
  "bot.sharing.assignDescription":
    "Fissa questo Bot in cima all'elenco dei Bot di ogni membro del gruppo. Usa * per tutto il team.",
  "bot.sharing.publishedTo": "Pubblicato a",
  "bot.sharing.peopleByEmail": "Persone, per email",
  "bot.sharing.commaSeparated": "Separati da virgole",
  "bot.sharing.groups": "Gruppi",
  "bot.sharing.update": "Aggiorna",
  "bot.sharing.publishToTeam": "Pubblica al team",
  "bot.sharing.assignNamed": "Assegna {name} a un gruppo",
  "bot.sharing.assignNote":
    "Viene fissato in cima all'elenco dei Bot di ogni membro.",
  "bot.sharing.groupOrStar": "Gruppo, o *",
  "bot.sharing.wholeTeamPlaceholder": "* per tutto il team",
  "bot.sharing.assign": "Assegna",
  "bot.sharing.removeNamed": "Rimuovi {name}",
  "bot.sharing.wholeTeam": "Tutto il team",
  "bot.sharing.notAssigned": "Non assegnato a nessun gruppo.",
  "bot.sharing.assignRow": "Assegna a un gruppo",
  "bot.page.accessPurpose":
    "Le competenze, le app e gli altri Bot che questo Bot può usare.",
  "bot.page.approvalsPurpose":
    "Cosa può fare questo Bot senza chiederti prima.",
  "bot.page.memoryPurpose":
    "Le app da cui questo Bot impara e le ricerche che fa per te in background.",
  "bot.page.memoryPointer": "Quello che i tuoi Bot ricordano di te è in",
  "bot.page.reachPurpose":
    "Continua una conversazione con questo Bot su Slack, Microsoft Teams o via SMS.",
  "bot.page.responsibilitiesPurpose":
    "Obiettivi continui su cui questo Bot lavora per te. Vedi cosa ha avviato ogni esecuzione e cosa ha trovato.",
  "bot.page.routinesPurpose":
    "Cosa fa questo Bot per te secondo un programma. Disattivane una, eseguila ora o eliminala.",
  "bot.page.setupPurpose": "Chi è questo Bot, chi può trovarlo e dove gira.",
  "bot.page.sharingPurpose":
    "Chi altro può usare questo Bot. Le conversazioni di ogni persona con lui sono private.",
  // Stage 2e (D181): the Bot sub-pages' contents, the summaries and the time phrases.
  "bot.choose": "Scegli un Bot",
  "memory.addSource": "Aggiungi fonte",
  "memory.title": "Fonti delle app",
  "memory.description":
    "Qui compaiono le app collegate che questo Bot può leggere, e puoi aggiungerne altre. Le fonti si aggiornano ogni 15 minuti. Solo questo Bot vede ciò che contengono.",
  "memory.empty":
    "Non c'è ancora nessuna fonte. Aggiungine una con Aggiungi fonte.",
  "memory.upToDate": "Aggiornata",
  "memory.off": "Disattivata",
  "memory.lastRead": "Ultima lettura {when}",
  "memory.syncNow": "Sincronizza ora",
  "memory.readNamed": "Leggi {name}",
  "memory.addTitle": "Aggiungi una fonte",
  "memory.addDescription":
    "{product} la legge subito, poi ogni 15 minuti finché è attiva.",
  "memory.enterNumber": "Inserisci un numero per {name}.",
  "memory.cantShow":
    "Questa ha impostazioni che {product} non sa mostrare. Scegline un'altra.",
  "memory.checkSettings": "Controlla le impostazioni della fonte.",
  "memory.whatToRead": "Cosa leggere",
  "memory.chooseWhat": "Scegli cosa leggere",
  "memory.sourceName": "Nome della fonte",
  "memory.chooseValue": "Scegli un valore",
  "memory.reading": "Leggo la fonte…",
  "memory.addAndSync": "Aggiungi e sincronizza la fonte",
  "suggestions.everyHour": "Ogni ora",
  "suggestions.every4Hours": "Ogni 4 ore",
  "suggestions.twiceDay": "Due volte al giorno",
  "suggestions.onceDay": "Una volta al giorno",
  "suggestions.everyMinutes": {
    one: "Ogni {count} minuto",
    other: "Ogni {count} minuti",
  },
  "suggestions.yourBot": "Il tuo Bot",
  "suggestions.title": "Passi successivi suggeriti",
  "suggestions.from": "Da {app}",
  "suggestions.connectedApp": "un'app collegata",
  "suggestions.openRecord": "Apri la scheda",
  "suggestions.startTask": "Avvia come attività",
  "suggestions.empty":
    "Nessun suggerimento per ora. I Bot con la ricerca in secondo piano attiva suggeriranno qui i passi successivi.",
  "suggestions.turnOnResearch": "Attiva la ricerca",
  "suggestions.researchDescription":
    "Spenta finché non la attivi per questo Bot, a meno che il tuo amministratore non l'abbia attivata per tutti. Quando è attiva, ogni quattro ore guarda nelle app che può già leggere, prepara ricordi da rivedere con te e suggerisce i passi successivi. Può solo leggere: non può inviare messaggi, cambiare nulla in un'app, né usare un browser o un computer. Se la disattivi o la rimuovi, resta così.",
  "suggestions.researchTitle": "Ricerca in secondo piano",
  "suggestions.researchOff": "La ricerca in secondo piano è spenta.",
  "suggestions.turnOnDialog": "Attiva la ricerca in secondo piano",
  "suggestions.turnOnDescription":
    "Legge a orari prestabiliti e consegna i suggerimenti in un canale in cui si trova.",
  "suggestions.deliverTo": "Consegna i suggerimenti a",
  "suggestions.chooseChannel": "Scegli un canale",
  "suggestions.howOften": "Con che frequenza",
  "suggestions.focus": "Cosa cercare (facoltativo)",
  "suggestions.off": "Spenta",
  "suggestions.researchingNow": "Ricerca in corso",
  "suggestions.lastRan": "Ultima esecuzione {when}",
  "suggestions.turnOff": "Disattiva",
  "reaching.linkSlack": "Collega Slack",
  "reaching.linkTeams": "Collega Microsoft Teams",
  "reaching.connectPhone": "Collega un telefono",
  "reaching.sumSlack": "Continua una conversazione da Slack.",
  "reaching.sumTeams": "Continua una conversazione da Microsoft Teams.",
  "reaching.sumSms": "Continua una conversazione con un messaggio di testo.",
  "reaching.codeOnWay":
    "Un codice di verifica è in arrivo. Inseriscilo per finire.",
  "reaching.linkReady":
    "Il tuo codice di collegamento è pronto da inviare. Aprilo per rivederlo.",
  "reaching.smsNotSet":
    "I messaggi di testo non sono ancora configurati. Un amministratore deve attivarli prima.",
  "reaching.notSet":
    "Non ancora configurato. Un amministratore deve attivare prima Slack e Teams.",
  "reaching.pointerBefore":
    "I tuoi dispositivi, le consegne recenti e dove arriva ogni tipo di aggiornamento sono in",
  "reaching.connected": "Destinazioni collegate",
  "reaching.noDestinations": "Nessuna destinazione collegata.",
  "reaching.optedOut": "Hai inviato STOP. Invia START per riprendere.",
  "reaching.disconnect": "Scollega",
  "reaching.channelNote":
    "In un canale Slack o Teams che altri possono leggere, il Bot ti risponde in un messaggio diretto.",
  "reaching.connectTitle": "Collega una conversazione",
  "reaching.oneAtATime":
    "Ogni account o numero di telefono funziona con una conversazione alla volta. Collegarlo qui lo sposta da quella a cui è collegato ora.",
  "reaching.conversation": "Conversazione",
  "reaching.chooseConversation": "Scegli una conversazione",
  "reaching.loadMore": "Carica altre conversazioni",
  "reaching.phoneNumber": "Numero di telefono",
  "reaching.sendCode": "Invia il codice di verifica",
  "reaching.verificationCode": "Codice di verifica",
  "reaching.confirmPhone": "Conferma il telefono",
  "reaching.linkExpires": {
    one: "Invia questo messaggio all'app {product} su {platform} entro {count} minuto. Collega quell'account a questa conversazione e a questo Bot.",
    other:
      "Invia questo messaggio all'app {product} su {platform} entro {count} minuti. Collega quell'account a questa conversazione e a questo Bot.",
  },
  "responsibilities.new": "Nuova responsabilità",
  "responsibilities.title": "Obiettivi",
  "responsibilities.empty":
    "Non hai ancora responsabilità. Aggiungine una con Nuova responsabilità.",
  "responsibilities.emptyBot":
    "Questo Bot non ha ancora responsabilità. Aggiungine una con Nuova responsabilità.",
  "routines.neverRun": "Non ancora eseguita",
  "routines.running": "In esecuzione…",
  "routines.missed": "Mancata {when}",
  "routines.failed": "Fallita {when}",
  "routines.skipped": "Saltata {when}",
  "routines.ran": "Eseguita {when}",
  "routines.finished": "Terminata {when}",
  "routines.noRuns": "Nessuna esecuzione ancora.",
  "routines.runNow": "Esegui ora",
  "routines.triggered": "Attivata",
  "routines.scheduled": "Pianificata",
  "routines.sweepChecked":
    "{product} le ha controllate l'ultima volta {when}. Nessuna partirà finché il servizio non riprende. Chiedi a un amministratore se succede ancora.",
  "routines.sweepNever":
    "{product} non ha ancora avviato le routine, quindi nessuna di queste partirà. Chiedi a un amministratore di configurarlo.",
  "routines.notRunning": "Le routine non sono in esecuzione.",
  "routines.loadError":
    "Impossibile caricare le tue routine. Ricarica la pagina.",
  "routines.emptyBot":
    'Questo Bot non ha ancora routine. Chiedigli qualcosa come "ogni giorno feriale alle 9, mandami…" e comparirà qui.',
  "routines.empty":
    'Non hai ancora routine. Chiedi a un Bot qualcosa come "ogni giorno feriale alle 9, mandami…" e comparirà qui.',
  "routines.enableAria": "Attiva la routine pianificata {schedule}",
  "routines.channelGone": "Conversazione eliminata",
  "routines.untitledChannel": "Conversazione senza titolo",
  "routines.due": "In ritardo",
  "routines.next": "Prossima: {when}",
  "routines.runNowTitle":
    "La esegue adesso, davvero. Il Bot fa il lavoro e pubblica nella conversazione.",
  "routines.pausedTurnOn": "Questa routine è in pausa. Attivala prima.",
  "routines.runNowAria": "Esegui adesso la routine pianificata {schedule}",
  "routines.historyAria":
    "Cronologia delle esecuzioni della routine pianificata {schedule}",
  "routines.history": "Cronologia",
  "routines.deleteAria": "Elimina la routine pianificata {schedule}",
  "routines.deleteTitle": 'Eliminare "{schedule}"?',
  "routines.deleteDescription":
    "Questa routine si ferma per sempre. Non puoi annullare l'operazione.",
  "routines.week": "Settimana",
  "routines.nextRuns": "Prossime esecuzioni",
  "routines.viewAria": "Vista",
  "summary.nothingGranted": "Niente concesso",
  "summary.skills": {
    one: "{count} competenza",
    other: "{count} competenze",
  },
  "summary.apps": {
    one: "{count} app",
    other: "{count} app",
  },
  "summary.everyonePublic": "Tutti (pubblico)",
  "summary.notShared": "Non condiviso",
  "summary.specificPeople": "Persone e gruppi specifici",
  "summary.onlyIn": "Solo in {product}",
  "summary.nothingConnected": "Niente collegato",
  "summary.sources": {
    one: "{count} fonte",
    other: "{count} fonti",
  },
  "summary.researchOn": "Ricerca in secondo piano attiva",
  "summary.researchOnAfter": "ricerca in secondo piano attiva",
  "time.justNow": "poco fa",
  "time.minutesAgo": {
    one: "{count} min fa",
    other: "{count} min fa",
  },
  "time.hoursAgo": {
    one: "{count} h fa",
    other: "{count} h fa",
  },
  "time.yesterday": "ieri",
  "time.daysAgo": {
    one: "{count} giorno fa",
    other: "{count} giorni fa",
  },
  "time.weeksAgo": {
    one: "{count} sett. fa",
    other: "{count} sett. fa",
  },
  "time.recently": "di recente",
  // Stage 2f (D181): the approval rules, the responsibility dialog, the routine history, Passwords.
  "approvals.behaviour.allow": "Agisci senza chiedere",
  "approvals.behaviour.preApproved": "Agisci se è già approvato in anticipo",
  "approvals.behaviour.ask": "Chiedi prima di agire",
  "approvals.behaviour.handOff": "Lascia fare a te",
  "approvals.host.ask": "Chiedi ogni volta",
  "approvals.host.allow": "Consenti sempre",
  "approvals.host.never": "Mai",
  "approvals.teamRule": "{label} (regola del team)",
  "approvals.matchOn": "su {scope}",
  "approvals.matchFor": "per {bot}",
  "approvals.locked": "Bloccata",
  "approvals.behaviourFor": "Comportamento per {tool}",
  "approvals.formLead":
    "Uno strumento o un'app, e che cosa fa un Bot prima di usarli.",
  "approvals.formHelp":
    "Usa * per indicare qualsiasi valore. mcp/gmail/* indica ogni strumento di Gmail. Una destinazione *.example.com indica ogni pagina di quel sito.",
  "approvals.field.tool": "Strumento o app",
  "approvals.field.effect": "Tipo di azione",
  "approvals.field.scope": "Destinazione",
  "approvals.field.scopeHint": "*, un sito, una cartella, il nome di un Bot",
  "approvals.field.bot": "Bot a cui si applica",
  "approvals.field.botHint": "* per ogni Bot",
  "approvals.field.behaviour": "Comportamento",
  "approvals.saveRule": "Salva la regola",
  "approvals.addRule": "Aggiungi una regola",
  "approvals.rulesOff":
    "Un amministratore ha disattivato le regole personali. Le tue restano salvate ma non si applicano.",
  "approvals.bot.lead":
    "Vince la regola più restrittiva tra quelle che corrispondono. Una regola «chiedi» prevale su una regola «consenti». Le regole per tutti i Bot sono in",
  "approvals.bot.settingsLink": "Impostazioni → Approvazioni",
  "approvals.bot.title": "Regole",
  "approvals.bot.empty": "Nessuna regola per questo Bot.",
  "approvals.adminLead":
    "Le impostazioni del team e le richieste di account condivisi sono in",
  "approvals.adminLink": "Amministrazione → Approvazioni",
  "approvals.before.title": "Prima che un Bot agisca",
  "approvals.before.askTitle": "Chiedi prima di fare modifiche",
  "approvals.before.askLine":
    "Controlli tu le modifiche di un Bot a siti web, app collegate e file.",
  "approvals.before.autoTitle": "Revisione automatica",
  "approvals.before.autoEnforced": "Un amministratore lo richiede.",
  "approvals.before.autoLine":
    "Prima che un Bot faccia qualcosa che potrebbe toccare i tuoi account o condividere informazioni, {product} la confronta con la tua richiesta e le tue regole. Se non riesce a stabilirlo, lo chiede a te.",
  "approvals.before.hostTitle": "Comandi sul tuo computer",
  "approvals.before.hostLimited":
    "Un amministratore limita questa opzione a «{limit}».",
  "approvals.before.hostLine":
    "L'app desktop di {product} ti mostra comunque ogni comando prima che venga eseguito.",
  "approvals.every.lead":
    "Vince la regola più restrittiva tra quelle che corrispondono. Una regola «chiedi» prevale su una regola «consenti». Le regole del team sono bloccate. Password e impostazioni di sicurezza passano sempre a te, e così i pagamenti, a meno che tu non attivi l'Accesso completo per un Bot qui sotto. Le regole per un solo Bot sono su",
  "approvals.every.botPage": "la pagina di quel Bot",
  "approvals.every.title": "Regole per ogni Bot",
  "approvals.every.empty": "Ancora nessuna regola.",
  "approvals.other.lead":
    "Queste non corrispondono a nessun Bot che puoi aprire. Valgono comunque per ogni Bot a cui corrispondono. Rimuovi quelle che non vuoi.",
  "approvals.other.title": "Regole per altri Bot",
  "approvals.page.description":
    "Scegli quando i tuoi Bot chiedono prima di cambiare qualcosa. Le regole qui valgono per tutti.",
  "approvals.admin.description":
    "Che cosa devono chiedere i Bot dei membri prima di agire, le regole per tutti e le richieste di usare account condivisi.",
  "approvals.team.title": "Impostazioni del team",
  "approvals.team.enforce": "Richiedi la revisione automatica per tutti",
  "approvals.team.custom": "Lascia che i membri impostino regole personali",
  "approvals.team.hostTitle": "Comandi sui computer dei membri, al massimo",
  "approvals.team.hostLine":
    "L'impostazione più restrittiva di un membro vale comunque.",
  "approvals.team.rulesLead":
    "Valgono per i Bot di ogni membro. I membri non possono cambiarle.",
  "approvals.team.rulesTitle": "Regole del team",
  "approvals.team.empty": "Nessuna regola del team.",
  "approvals.team.addRule": "Aggiungi una regola del team",
  "approvals.shared.title": "Richieste di account condivisi",
  "approvals.shared.wants": "{bot} vuole l'account condiviso {account}",
  "approvals.shared.why.refusedCall":
    "Un'azione è stata bloccata. Questo Bot raggiunge più persone di quelle approvate.",
  "approvals.shared.why.publish":
    "Il suo proprietario ha esteso chi può raggiungerlo.",
  "approvals.shared.why.trigger":
    "Il suo proprietario ha aggiunto un trigger che permette a messaggi esterni di guidarlo.",
  "approvals.shared.why.grant": "Gli sono state date le azioni dell'app.",
  "approvals.shared.now": "Ora:",
  "approvals.shared.notApproved": "Non approvato",
  "approvals.shared.asked": "Richiesto:",
  "approvals.shared.approve": "Approva",
  "approvals.shared.decline": "Rifiuta",
  "tasks.updated": "Aggiornato {ago}",
  "routines.status.running": "In corso",
  "routines.status.succeeded": "Riuscita",
  "routines.status.failed": "Non riuscita",
  "routines.status.skipped": "Saltata",
  "routines.status.waiting": "In attesa di te",
  "routines.status.missed": "Persa",
  "routines.history.empty":
    "Ancora nessuna esecuzione. Una esecuzione compare qui quando una routine è partita, o dopo che premi Esegui ora.",
  "routines.history.aBot": "Un Bot",
  "routines.history.latest": {
    one: "Mostro l'ultima esecuzione.",
    other: "Mostro le ultime {count} esecuzioni.",
  },
  "routines.history.deleted": "Una routine che nel frattempo è stata eliminata",
  "routines.history.waitingNote":
    "In attesa della tua approvazione. Apri la conversazione per rispondere.",
  "responsibilities.status.completed": "Completato",
  "responsibilities.summary.paused": "Niente la avvia finché non la riprendi",
  "responsibilities.summary.trigger": "trigger {kind}",
  "responsibilities.summary.starts": "Parte con {starts}",
  "responsibilities.summary.asked": "Parte quando glielo chiedi",
  "responsibilities.source.manual": "Manuale",
  "responsibilities.source.schedule": "Pianificazione",
  "responsibilities.source.connector": "App collegata",
  "responsibilities.progress": "Avanzamento",
  "responsibilities.lastResult": "Ultimo risultato",
  "responsibilities.activeOn": "I suoi eventi e trigger la avviano.",
  "responsibilities.activeOff": "In pausa. I suoi trigger non la avviano.",
  "responsibilities.runNowLine":
    "La esegue ora, per davvero. Il Bot fa il lavoro e può pubblicare e compiere azioni.",
  "responsibilities.complete": "Completa",
  "responsibilities.completeLine":
    "Segnala come fatta. Dopo, niente la avvia più.",
  "responsibilities.field.title": "Titolo",
  "responsibilities.field.instruction": "Istruzione",
  "responsibilities.field.criteria": "Criteri di riuscita",
  "responsibilities.events": "Eventi",
  "responsibilities.saving": "Salvataggio…",
  "responsibilities.run.queued": "In coda",
  "responsibilities.run.waiting":
    "In attesa {kind}. Rispondi in cima alla pagina di questo Bot o nella conversazione.",
  "responsibilities.runs": "Esecuzioni",
  "responsibilities.viewRuns": "Mostra le esecuzioni",
  "responsibilities.hideRuns": "Nascondi le esecuzioni",
  "passwords.description":
    "Gli accessi che hai salvato quando hai fatto entrare un Bot in un sito. I Bot non li vedono mai, e confermi tu ogni uso.",
  "passwords.saved": "Accessi salvati",
  "passwords.loadError":
    "Non sono riuscito a caricare le tue password. Ricarica la pagina.",
  "passwords.off":
    "Un amministratore ha disattivato le password salvate. I tuoi accessi restano salvati ma non verranno proposti.",
  "passwords.empty":
    "Nessun accesso salvato. Scegli Salva in Password quando fai entrare un Bot in un sito.",
  "passwords.lastUsed": "ultimo uso {date}",
  "passwords.neverUsed": "mai usato",
  "passwords.deleteAria": "Elimina l'accesso per {origin}",
  "settings.notificationsPage":
    "Dove ti raggiungono gli aggiornamenti dei tuoi Bot quando non ci sei. Quanto invia ogni Bot lo imposti nella sua pagina.",
  "fullaccess.label.noPayments": "Accesso completo senza pagamenti",
  "fullaccess.label.full": "Accesso completo",
  "fullaccess.off": "Disattivato",
  "fullaccess.description":
    "Sicuro per impostazione predefinita: i tuoi Bot chiedono prima di inviare, pagare, firmare, prenotare o eliminare. Per ogni Bot puoi scegliere di lasciargli fare queste cose senza chiedere.",
  "fullaccess.offTerm": "Disattivato:",
  "fullaccess.offText":
    "il Bot chiede prima di inviare, pagare, firmare, prenotare o eliminare.",
  "fullaccess.noPaymentsTerm": "Accesso completo senza pagamenti:",
  "fullaccess.noPaymentsText":
    "invia, firma, prenota ed elimina senza chiedere. Pagamenti e acquisti chiedono comunque a te.",
  "fullaccess.fullTerm": "Accesso completo:",
  "fullaccess.fullText":
    "paga e acquista anche senza chiedere. Non c'è alcun limite all'importo finché non esistono i limiti di spesa (previsti per la v0.4).",
  "fullaccess.askTitle": "Dare a {name} «{label}»?",
  "fullaccess.give": "Dai «{label}»",
  "fullaccess.full.p1":
    "{name} invierà, pagherà, firmerà, prenoterà ed eliminerà senza chiederti prima. Può agire su ciò che legge, come un'email o una pagina web, quindi attivalo solo se ti fidi di lui in questo.",
  "fullaccess.full.p2":
    "Non c'è alcun limite all'importo che può pagare: i limiti di spesa non esistono ancora (sono previsti per la v0.4). Per far chiedere sempre a te pagamenti e acquisti, scegli invece Accesso completo senza pagamenti.",
  "fullaccess.full.p3":
    "Password e impostazioni di sicurezza richiedono comunque te. Quando è configurato un revisore automatico, legge anche una volta ogni comando e script che il membro esegue sul suo computer, anche se hai disattivato il revisore; quando non ce n'è nessuno, i comandi non vengono letti. Vale per ciò che chiedi nelle tue chat, non per routine o check-in. Puoi disattivarlo in qualsiasi momento e si ferma subito.",
  "fullaccess.noPayments.p1":
    "{name} invierà, firmerà, prenoterà ed eliminerà senza chiederti prima. Pagamenti e acquisti chiedono comunque a te. Può agire su ciò che legge, come un'email o una pagina web, quindi attivalo solo se ti fidi di lui in questo.",
  "fullaccess.noPayments.p2":
    "L'app riconosce un pagamento con i suoi controlli integrati, quindi anche un messaggio che si limita a nominare un pagamento può chiedere, e un pagamento scritto in modo insolito potrebbe non essere riconosciuto. Password e impostazioni di sicurezza richiedono comunque te. Quando è configurato un revisore automatico, legge anche una volta ogni comando e script che il membro esegue sul suo computer per una password, un'impostazione di sicurezza o un pagamento fatto così, anche se hai disattivato il revisore; quando non ce n'è nessuno, i comandi non vengono letti. Vale per ciò che chiedi nelle tue chat, non per routine o check-in. Puoi disattivarlo in qualsiasi momento e si ferma subito.",
  "fullaccess.noBots": "Ancora nessun Bot.",
  "fullaccess.legend": "Accesso per {name}",
  "fullaccess.radioAria": "{label} per {name}",
  "fullaccess.summary.off":
    "Chiede prima di inviare, pagare, firmare, prenotare o eliminare.",
  "fullaccess.summary.noPayments":
    "Agisce senza chiedere, tranne che pagamenti e acquisti chiedono comunque a te. Dal {since}.",
  "fullaccess.summary.full":
    "Agisce senza chiedere, pagamenti compresi, senza alcun limite all'importo. Dal {since}.",
  "fullaccess.doneTitle": "Fatto senza chiedere",
  "fullaccess.doneDescription":
    "Che cosa ha fatto senza chiederti un Bot con Accesso completo, dal più recente.",
  "fullaccess.nothingYet": "Ancora niente.",
  "approvals.audience.owner": "Solo il suo proprietario",
  "approvals.audience.team": "Tutti",
  "approvals.audience.outside": ", e input dall'esterno",
  "approvals.audience.nobody": "Nessuno indicato",
  "approvals.audience.groups": {
    one: "Il gruppo {names}",
    other: "I gruppi {names}",
  },
  "approvals.audience.people": {
    one: "{count} persona",
    other: "{count} persone",
  },
  "approvals.audience.join": "{a} e {b}",
  "access.req.title": "Richieste",
  "access.req.loadError":
    "Impossibile caricare le richieste di accesso. Ricarica la pagina.",
  "access.req.descApp":
    "Persone che chiedono questa app. Approva fa subito ciò che hanno chiesto.",
  "access.req.descAll":
    "Persone che chiedono di attivare un'app, darla a un Bot o collegarla. Approva fa subito ciò che hanno chiesto.",
  "access.req.aBot": "un Bot",
  "access.req.theBot": "il Bot",
  "access.req.somebody": "Qualcuno",
  "access.req.enable": "Attivare {app} per {bot}",
  "access.req.grantMore": "Dare a {bot} altro di {app}: {list}",
  "access.req.grant": "Dare {app} a {bot}",
  "access.req.connectShared": "Collegare l'account condiviso di {app}",
  "access.req.asked": "{who} ha chiesto {when}{forBot}.",
  "access.req.forBot": ", per {bot}",
  "access.req.approving": "Approvo…",
  "access.req.botPage": "la pagina del Bot sotto {app}",
  "access.req.toolRead": "{name} (sola lettura)",
  "access.req.toolWrite": "{name} (modifica qualcosa)",
  "access.req.gives":
    "Approvando dai a {bot} esattamente questi strumenti e nient'altro: {list}.",
  "access.req.readOnly":
    "Approvando dai a {bot} solo le azioni di sola lettura di {app}. Scegli le altre in {page}.",
  "access.req.canSend": {
    one: "{names} può inviare per conto della persona.",
    other: "{names} possono inviare ciascuno per conto della persona.",
  },
  "access.req.unreviewed": {
    one: "Nessun elenco verificato dice che cosa fa {names} in {app}, quindi potrebbe inviare per conto della persona.",
    other:
      "Nessun elenco verificato dice che cosa fanno {names} in {app}, quindi ciascuno potrebbe inviare per conto della persona.",
  },
  "access.req.neverGives": {
    one: "Approvando non si dà mai uno strumento di questo tipo: consentilo nelle impostazioni, in {page}.",
    other:
      "Approvando non si danno mai strumenti di questo tipo: consentili nelle impostazioni, in {page}.",
  },
  "access.req.and": "{a} e {b}",
  "passwords.saveTo": "Salva in Password",
  "responsibilities.run.waitKind.approval": "della tua approvazione",
  "responsibilities.run.waitKind.question": "della tua risposta",
  "responsibilities.run.waitKind.handoff": "del tuo intervento",
  "responsibilities.run.waitKind.signIn": "del tuo accesso",
  "responsibilities.run.waitKind.other": "di te",
  "responsibilities.new.description":
    "Un obiettivo continuo. Il Bot ci lavora nella conversazione che scegli.",
  "responsibilities.new.chooseConversation": "Scegli una conversazione",
  "responsibilities.new.loadMore": "Carica altre conversazioni",
  "responsibilities.new.titleExample": "Tieni aggiornato il report clienti",
  "responsibilities.new.criteriaExample":
    "Il report contiene il grafico del trimestre in corso e un link alla fonte.",
  "responsibilities.new.eventSource": "Origine degli eventi",
  "responsibilities.new.source.none": "Esegui su richiesta",
  "responsibilities.new.githubHelp":
    "Gli eventi arrivano dai repository che hai collegato in {link}.",
  "responsibilities.new.eventType": "Tipo di evento",
  "responsibilities.new.creating": "Creo…",
  "responsibilities.new.create": "Crea responsabilità",
  "triggers.kind.email": "E-mail",
  "triggers.help.webhook":
    "Invia un POST con JSON a questo URL con l'header Authorization, oppure con gli header di firma Standard Webhooks. Un 200 significa che è stato ricevuto, non che l'esecuzione è finita.",
  "triggers.help.github":
    "In Settings → Webhooks del repository imposta come payload URL questo URL, come content type application/json e come secret la chiave.",
  "triggers.help.linear":
    "In Linear, Settings → API → Webhooks: imposta l'URL, poi incolla qui il segreto di firma che Linear mostra.",
  "triggers.help.sentry":
    "In un'integrazione interna di Sentry imposta l'URL del webhook, poi incolla qui il client secret dell'integrazione.",
  "triggers.help.pagerduty":
    "In PagerDuty, Integrations → Generic Webhooks (v3): imposta l'URL, poi incolla qui il segreto mostrato alla creazione.",
  "triggers.help.email":
    "Invia o inoltra un'email a questo indirizzo per avviare un'esecuzione.",
  "triggers.help.slack":
    "Parte con gli eventi Slack che questo Bot riceve. I messaggi inviati prima di aggiungere il trigger vengono ignorati.",
  "triggers.slack.mention": "Il Bot viene menzionato",
  "triggers.slack.phrase": "Un messaggio contiene una frase",
  "triggers.slack.reaction": "Viene aggiunta una reazione",
  "triggers.slack.message": "Qualsiasi messaggio",
  "triggers.f.inChannels": "nei canali {channels}",
  "triggers.f.everyChannel": "in ogni canale in cui c'è il Bot",
  "triggers.f.mention": "quando il Bot viene menzionato",
  "triggers.f.anyMessage": "a qualsiasi messaggio",
  "triggers.f.phrases": "sui messaggi che contengono {phrases}",
  "triggers.f.or": " o ",
  "triggers.f.reactions": "sulle reazioni",
  "triggers.f.slack": "{what} {where} (spazio di lavoro {team})",
  "triggers.f.events": "eventi {types}",
  "triggers.f.everyEvent": "ogni evento",
  "triggers.f.where": "dove {path} = {equals}",
  "triggers.f.from": "da {from}",
  "triggers.f.fromSenders": "da {senders} (autenticati)",
  "triggers.title": "Trigger",
  "triggers.add": "Aggiungi trigger",
  "triggers.notActive.paused":
    "Questa responsabilità è in pausa. I suoi trigger non la avviano.",
  "triggers.notActive.completed":
    "Questa responsabilità è completata. I suoi trigger non la avviano.",
  "triggers.none":
    "Nessun trigger. Parte quando premi Esegui ora, o con gli eventi qui sopra.",
  "triggers.removeForGood": "Rimuovi per sempre",
  "triggers.keep": "Tieni",
  "triggers.runOnAria": "Esegui con questo trigger {kind}",
  "triggers.postTo": "POST a",
  "triggers.copyUrl": "Copia URL",
  "triggers.copyAddress": "Copia indirizzo",
  "triggers.emailOff":
    "L'email non è ancora configurata su {product}, quindi questo indirizzo non può ricevere posta. Deve attivarla un amministratore.",
  "triggers.key": "Chiave",
  "triggers.copyKey": "Copia chiave",
  "triggers.copyHeader": "Copia header",
  "triggers.showKey": "Mostra chiave",
  "triggers.replaceKey": "Sostituisci chiave",
  "triggers.secretSaved": "Segreto di firma salvato",
  "triggers.secretWaiting": "In attesa del segreto di firma",
  "triggers.secret": "Segreto di firma",
  "triggers.pasteNew": "Incolla un nuovo segreto per sostituirlo",
  "triggers.paste": "Incolla il segreto di firma",
  "triggers.saveSecret": "Salva segreto",
  "triggers.addDescription":
    "Qualcosa fuori da {product} che avvia questa responsabilità.",
  "triggers.slackTeam": "ID del team Slack",
  "triggers.fireOn": "Scatta quando",
  "triggers.phrases": "Frasi (separate da virgole)",
  "triggers.reactions": "Reazioni (vuoto: qualsiasi)",
  "triggers.channelIds": "ID dei canali (vuoto: tutti quelli del Bot)",
  "triggers.eventTypes": "Tipi di evento",
  "triggers.onlyWhen": "Solo quando il campo",
  "triggers.equals": "è uguale a",
  "triggers.repository": "Repository (facoltativo)",
  "triggers.senders": "Mittenti consentiti (vuoto: nessuno)",
  "triggers.secretLater": "Segreto di firma (si può aggiungere dopo)",
  "triggers.adding": "Aggiungo…",
  "triggers.addKind": "Aggiungi trigger {kind}",
  "triggers.example.webhook": "deploy.finished (vuoto: qualsiasi)",
  "routines.cal.intro":
    "I prossimi {days} giorni, per le routine attive. Gli orari sono nel tuo fuso orario.",
  "routines.cal.none":
    "Ancora nessuna routine, quindi non c'è nulla in programma.",
  "routines.cal.noneOn":
    "Nessuna di queste routine è attiva, quindi nessuna verrà eseguita.",
  "routines.cal.nothing":
    "Non c'è nulla in programma nei prossimi {days} giorni.",
  "routines.cal.truncated":
    "Sono elencate solo le prime {max} esecuzioni di questi {days} giorni.",
  "routines.cal.paused": {
    one: "{count} routine in pausa, quindi non è elencata qui. Attivala per vedere quando viene eseguita.",
    other:
      "{count} routine in pausa, quindi non sono elencate qui. Attivane una per vedere quando viene eseguita.",
  },
  "routines.week.nothing":
    "Non c'è nulla in programma per il resto di questa settimana.",
  "routines.week.label": "Questa settimana",
  "routines.week.today": "oggi",
  "routines.week.now": "Adesso, {time}",
  "routines.week.next": "Prossima:",
  "routines.week.nothingElse": "Nient'altro in programma questa settimana.",
  "routines.week.truncated":
    "Sono elencate solo le prime esecuzioni dei prossimi giorni, quindi una routine molto frequente potrebbe non comparire ogni giorno.",
  "routines.week.historyError":
    "Non è stato possibile caricare le esecuzioni già avvenute, quindi non sono mostrate.",
  "routines.week.note":
    "Gli orari sono nel tuo fuso orario. Una routine che parte più spesso di una volta all'ora compare come un unico blocco per il giorno.",
  "routines.week.summary": "{count} esecuzioni, ogni ~{minutes} min",
  "routines.week.gone": "{label}, conversazione eliminata",
  "routines.card.label": "Scheda della routine",
  "routines.card.cancelled": "Routine annullata",
  "routines.card.readError": "Non è stato possibile leggere questa routine.",
  "routines.card.reading": "Leggo questa routine…",
  "routines.card.gone": "Questa routine non esiste più",
  "routines.card.cannotSend":
    "Questa conversazione non può ricevere un messaggio adesso. Scrivi la modifica nella casella dei messaggi qui sotto.",
  "routines.card.confirm": "Annullare questa routine?",
  "routines.card.yes": "Sì, annullala",
  "routines.card.no": "No, tienila",
  "routines.card.pause": "Metti in pausa",
  "routines.card.resume": "Riprendi",
  "routines.card.edit": "Modifica",
  "routines.card.whatChange": "Che cosa vuoi cambiare?",
  "routines.card.send": "Invia la modifica",
  "routines.card.writeBelow":
    "Scrivi la modifica nella casella dei messaggi qui sotto.",
  "routines.card.close": "Chiudi",
  "admin.boundaries.title": "Limiti",
  "admin.boundaries.descLead":
    "Che cosa può e non può fare un Bot con il suo computer. Ogni azione viene controllata prima che avvenga. I rifiuti compaiono in",
  "admin.boundaries.descAudit": "Registro",
  "admin.boundaries.descTail": "con la regola che li ha rifiutati.",
  "admin.boundaries.whenTitle": "Quando una regola corrisponde",
  "admin.boundaries.whenDesc":
    "Blocca l'azione, oppure registrala e lasciala passare. Registrare ti permette di provare una regola sull'attività reale prima che rifiuti qualcosa.",
  "admin.boundaries.modeEnforce": "Blocca l'azione",
  "admin.boundaries.modeRecord": "Registrala e permettila",
  "admin.boundaries.modeEnforceNote":
    "Il Bot viene fermato e gli viene detto quale regola l'ha rifiutato.",
  "admin.boundaries.modeRecordNote":
    "Niente viene fermato. Ogni corrispondenza viene registrata come se fosse stata rifiutata.",
  "admin.boundaries.neverTitle": "I Bot non possono mai",
  "admin.boundaries.neverLead":
    "Controllate per prime. Una corrispondenza ferma l'azione e al Bot viene detto quale regola l'ha rifiutata. Le regole sono in CEL. Possono controllare",
  "admin.boundaries.neverMid1": ", l'elemento, il tasto",
  "admin.boundaries.neverMid2": "premuto, il file, il",
  "admin.boundaries.neverMid3": "eseguito, e",
  "admin.boundaries.neverMid4": "per gli strumenti esterni.",
  "admin.boundaries.neverMid5": "dice che cosa ha avviato l'esecuzione:",
  "admin.boundaries.neverTail":
    "Un'esecuzione programmata agisce come il suo proprietario, quindi",
  "admin.boundaries.neverTail2":
    "da solo non te lo dice. Una regola che non si può valutare conta come una corrispondenza. Un errore di battitura non lascia mai passare un'azione.",
  "admin.boundaries.or": "oppure",
  "admin.boundaries.noRules":
    "Nessuna regola. Ogni azione è permessa e registrata.",
  "admin.boundaries.remove": "Rimuovi",
  "admin.boundaries.ruleLabel": "Una regola, scritta in CEL",
  "admin.boundaries.testing": "Prova in corso…",
  "admin.boundaries.testFirst": "Prova prima",
  "admin.boundaries.addRule": "Aggiungi regola",
  "admin.boundaries.preset.form": "Non inviare mai un modulo",
  "admin.boundaries.preset.formCost":
    "Impedisce al Bot di premere Invio anche altrove. Un modulo può partire da Invio in qualsiasi campo. Non copre la scelta in un menu o in un campo data, la cui modifica può inviare un modulo da sola.",
  "admin.boundaries.preset.password": "Non scrivere mai in un campo password",
  "admin.boundaries.preset.passwordCost":
    "Un campo password con un'etichetta diversa non è coperto. La regola guarda l'etichetta.",
  "admin.boundaries.preset.social": "Stai lontano dai social network",
  "admin.boundaries.preset.socialCost":
    "Solo questi due host. Un link che ci porta da un altro sito è permesso.",
  "admin.boundaries.otherwiseTitle": "Altrimenti possono",
  "admin.boundaries.otherwiseDesc":
    "Vale per tutto ciò che l'elenco qui sopra non ha preso. Un elenco vuoto qui non permette nulla, e ogni azione viene rifiutata.",
  "admin.boundaries.allowAll": "true, tutto ciò che non è rifiutato sopra",
  "admin.boundaries.saved":
    "Salvato. Vale dalla prossima azione di qualsiasi Bot.",
  "admin.boundaries.footer":
    "Le modifiche valgono dalla prossima azione di qualsiasi Bot. Restano dopo un riavvio.",
  "admin.boundaries.dry.none":
    "Non ci sono ancora azioni del computer registrate su cui provare. La regola è valida. Vedrai che cosa corrisponde quando i Bot avranno agito.",
  "admin.boundaries.dry.zero":
    "Provata sulle ultime {scanned} azioni registrate. Questa regola non ne avrebbe rifiutata nessuna. Potrebbe comunque corrispondere a quelle future.",
  "admin.boundaries.dry.some":
    "Provata sulle ultime {scanned} azioni registrate. Questa regola ne avrebbe rifiutate {refused}.",
  "admin.boundaries.dry.wouldRefuse": "Rifiuterebbe",
  "admin.boundaries.dry.wouldAllow": "Ora permetterebbe",
  "admin.boundaries.dry.on": "su «{name}»",
  "admin.boundaries.dry.running": "eseguendo",
  "admin.boundaries.dry.touching": "toccando {file}",
  "admin.boundaries.dry.first":
    "Mostro i primi {shown}. Il conteggio qui sopra riguarda tutto ciò che è stato controllato.",
  "admin.people.title": "Persone",
  "admin.people.desc":
    "Tutti quelli che hanno effettuato l'accesso. Gli amministratori possono aprire queste schermate. Tutti gli altri parlano con i Bot.",
  "admin.people.whoTitle": "Chi c'è",
  "admin.people.whoDesc":
    "Gli indirizzi in INITIAL_ADMIN_EMAILS sono sempre amministratori. Qui non puoi modificarli.",
  "admin.people.stopped": {
    one: "Fermato {count} computer",
    other: "Fermati {count} computer",
  },
  "admin.people.stoppedFailed": ". {failed} non si sono potuti fermare",
  "admin.people.disksKept": ". I loro dischi vengono conservati.",
  "admin.people.searchLabel": "Cerca persone",
  "admin.people.searchPlaceholder": "Cerca per nome o indirizzo",
  "admin.people.loadError":
    "Non è stato possibile caricare le persone. Ricarica la pagina.",
  "admin.people.noMatch": 'Nessuno corrisponde a "{query}".',
  "admin.people.nobody":
    "Nessuno ha ancora effettuato l'accesso. Le persone compariranno qui quando lo faranno.",
  "admin.people.lastSignedIn": "ultimo accesso {date}",
  "admin.people.neverSignedIn": "mai effettuato l'accesso",
  "admin.people.noProvider": "nessun provider",
  "admin.people.accessRemoved": "Accesso rimosso",
  "admin.people.adminByConfig": "Amministratore per configurazione",
  "admin.people.stopComputers": "Ferma i computer",
  "admin.people.restore": "Ripristina",
  "admin.people.remove": "Rimuovi",
  "admin.people.adminSwitch": "Amministratore: {email}",
  "admin.people.loading": "Caricamento…",
  "admin.people.showMore": "Mostra altro",
  "admin.boundaries.and": "e",
  "admin.credentials.title": "Credenziali",
  "admin.credentials.add": "Aggiungi credenziale",
  "admin.credentials.desc":
    "Chiavi e token di questa installazione. {product} non mostra mai un segreto dopo che è stato salvato.",
  "admin.credentials.dialogDesc":
    "Salvata per questa installazione. Non vedrai più il segreto.",
  "admin.credentials.type": "Tipo",
  "admin.credentials.model": "Modello",
  "admin.credentials.connector": "Connettore",
  "admin.credentials.provider": "Fornitore",
  "admin.credentials.keyId": "ID della chiave",
  "admin.credentials.secret": "Segreto",
  "admin.credentials.replaces":
    "Questa chiave ha già una credenziale attiva. Salvando la sostituisci e quella vecchia viene revocata.",
  "admin.credentials.saveError":
    "Non è stato possibile salvare la credenziale. Riprova.",
  "admin.credentials.cancel": "Annulla",
  "admin.credentials.saving": "Salvataggio…",
  "admin.credentials.save": "Salva la credenziale",
  "admin.credentials.savedTitle": "Credenziali salvate",
  "admin.credentials.loadError":
    "Non è stato possibile caricare le credenziali. Ricarica la pagina.",
  "admin.credentials.empty":
    "Ancora nessuna credenziale. Aggiungine una con «Aggiungi credenziale».",
  "admin.credentials.revoked": "revocata",
  "admin.credentials.active": "attiva",
  "admin.credentials.revoke": "Revoca",
  "admin.idp.title": "Provider di identità",
  "admin.idp.add": "Aggiungi un provider",
  "admin.idp.desc":
    "Il provider SAML o OpenID Connect della tua azienda. Le persone accedono con la loro email, e il dominio dell'email sceglie il provider.",
  "admin.idp.registeredTitle": "Registrati",
  "admin.idp.registeredDesc":
    "Google, Microsoft e Okta si impostano nell'ambiente. Qui non compaiono.",
  "admin.idp.loadError":
    "Non è stato possibile caricare i provider di identità. Ricarica la pagina.",
  "admin.idp.empty":
    "Ancora nessun provider di identità. Aggiungine uno con i metadati che ti dà il tuo team di identità.",
  "admin.idp.remove": "Rimuovi",
  "admin.idp.dialogTitle": "Aggiungi un provider di identità",
  "admin.idp.name": "Nome",
  "admin.idp.domain": "Dominio email",
  "admin.idp.domainNote":
    "Chiunque abbia un indirizzo su questo dominio accede da qui. Separa più domini con delle virgole.",
  "admin.idp.issuer": "Emittente",
  "admin.idp.signOnUrl": "URL di accesso",
  "admin.idp.metadata": "Metadati XML",
  "admin.idp.metadataNote":
    "Il file che ti dà il tuo team di identità. Include il certificato di firma.",
  "admin.idp.clientId": "ID client",
  "admin.idp.clientSecret": "Segreto del client",
  "admin.idp.cancel": "Annulla",
  "admin.idp.adding": "Aggiunta in corso…",
  "admin.idp.addShort": "Aggiungi",
  "admin.audit.decision.bot.declined": "Il Bot ha rifiutato",
  "admin.audit.decision.agent.stream_stalled": "Il Bot ha smesso di rispondere",
  "admin.audit.decision.computer.policy_loaded": "Limiti all'avvio",
  "admin.audit.decision.computer.isolation_loaded": "Isolamento all'avvio",
  "admin.audit.decision.computer.control_taken":
    "Una persona ha preso il controllo",
  "admin.audit.decision.computer.control_released":
    "Il controllo è tornato al Bot",
  "admin.audit.decision.computer.help_requested": "Il Bot ha chiesto aiuto",
  "admin.audit.decision.computer.secret_requested":
    "Il Bot ha chiesto un segreto",
  "admin.audit.decision.computer.secret_supplied":
    "Una persona ha fornito un segreto",
  "admin.audit.decision.computer.reset": "Il computer è stato reimpostato",
  "admin.audit.decision.computer.updated": "Il computer è stato aggiornato",
  "admin.audit.decision.computer.stopped": "Una persona ha premuto stop",
  "admin.audit.decision.component.granted": "Concesso a questo Bot",
  "admin.audit.decision.component.revoked": "Tolto a questo Bot",
  "admin.audit.decision.component.published": "Pubblicato. Ogni Bot può usarlo",
  "admin.audit.decision.component.unpublished":
    "Ritirato. Nessun Bot può usarlo",
  "admin.audit.decision.component.draft_saved":
    "Bozza salvata, non ancora pubblicata",
  "admin.audit.decision.component.refused": "Rifiutato",
  "admin.audit.decision.component.function_granted": "Può leggerlo",
  "admin.audit.decision.component.function_revoked": "Non può più leggerlo",
  "admin.audit.decision.component.function_called": "Ha letto dati reali",
  "admin.audit.decision.component.function_refused": "Rifiutato",
  "admin.audit.decision.component.function_failed": "Non è riuscito a leggerlo",
  "admin.audit.decision.mcp.tools_discovered":
    "Strumenti offerti per un'esecuzione",
  "admin.audit.decision.mcp.call_succeeded": "Chiamato per conto di questo Bot",
  "admin.audit.decision.mcp.call_rejected": "Bloccato",
  "admin.audit.decision.mcp.call_failed": "Il server non ha risposto",
  "admin.audit.decision.mcp.callback_refused":
    "Non è stato possibile confermare quale Bot fosse",
  "admin.audit.decision.configuration.changed": "Configurazione modificata",
  "admin.audit.decision.credential.created": "Credenziale salvata",
  "admin.audit.discovery.under-floor":
    "Pochi strumenti, quindi sono stati offerti tutti",
  "admin.audit.discovery.nothing-declared":
    "Nessuna skill dichiara uno di questi strumenti",
  "admin.audit.discovery.unavailable":
    "Non è stato possibile scegliere, quindi sono stati offerti tutti",
  "admin.audit.discovery.nothing-chosen":
    "Nessuna skill applicata, quindi sono stati offerti tutti",
  "admin.audit.discovery.selected": "Scelti in base alla skill",
  "admin.audit.title": "Registro",
  "admin.audit.desc":
    "Ogni azione compiuta da un Bot e ogni azione che la policy di questa installazione ha rifiutato.",
  "admin.audit.export": "Esporta CSV",
  "admin.audit.exporting": "Esportazione…",
  "admin.audit.refresh": "Aggiorna",
  "admin.audit.exportFailed":
    "Non è stato possibile esportare gli eventi. Riprova.",
  "admin.audit.filter.all": "Tutto",
  "admin.audit.filter.computer": "Azioni del computer",
  "admin.audit.filter.blocked": "Bloccate",
  "admin.audit.filter.didNot": "Non avvenute",
  "admin.audit.filter.nobody": "Senza nessuno a guardare",
  "admin.audit.capped":
    "Il file contiene i {count} eventi più recenti, non tutti. Restringi il filtro o le date per esportare il resto.",
  "admin.audit.loadError":
    "Non è stato possibile caricare il registro. Ricarica la pagina.",
  "admin.audit.empty": "Ancora nessun evento corrisponde a questo filtro.",
  "admin.audit.col.when": "Quando",
  "admin.audit.col.what": "Che cosa",
  "admin.audit.col.on": "Su",
  "admin.audit.col.bot": "Bot",
  "admin.audit.col.startedBy": "Avviata da",
  "admin.audit.col.decision": "Decisione",
  "admin.audit.by.routine": "Una routine",
  "admin.audit.by.handedOnBy": "Passata da {name}",
  "admin.audit.by.handedOn": "Passata",
  "admin.audit.by.memory": "Una fonte di memoria",
  "admin.audit.by.responsibility": "Una responsabilità",
  "admin.audit.by.deployment": "Questa installazione",
  "admin.audit.by.remote": "Un browser non abbinato al computer",
  "admin.audit.by.person": "Una persona",
  "admin.audit.routed.mention": "La persona ha scelto questo Bot",
  "admin.audit.routed.default": "Inviata al Bot predefinito",
  "admin.audit.routed.meant": "Inviata al Bot a cui era destinata",
  "admin.audit.toolsOf": "{offered} strumenti su {granted}",
  "admin.audit.blocked": "Bloccata",
  "admin.audit.didNot": "Non avvenuta",
  "admin.audit.allowed": "Permessa",
  "admin.audit.reportedByBot": ", segnalato dal Bot stesso",
  "admin.audit.dryRun": "prova: registrata, non applicata",
  "admin.nav.back": "Torna all'app",
  "admin.nav.overview": "Panoramica",
  "admin.nav.reach": "A che cosa possono accedere i Bot",
  "admin.nav.do": "Che cosa possono fare i Bot",
  "admin.nav.in": "Chi può entrare",
  "admin.nav.happened": "Che cosa è successo",
  "admin.nav.credentials": "Credenziali",
  "admin.nav.boundaries": "Limiti",
  "admin.nav.approvals": "Approvazioni",
  "admin.nav.computers": "Computer",
  "admin.nav.plugins": "Plugin",
  "admin.nav.skills": "Skill",
  "admin.nav.learning": "Apprendimento automatico",
  "admin.nav.components": "Componenti dell'interfaccia",
  "admin.nav.playground": "Area di prova",
  "admin.nav.people": "Persone",
  "admin.nav.idp": "Provider di identità",
  "admin.nav.audit": "Registro",
  "admin.enterprise.mode.allow_all": "Consenti tutto l'accesso alla rete",
  "admin.enterprise.mode.defaults_plus_allowlist":
    "Predefiniti più lista consentiti del team",
  "admin.enterprise.mode.allowlist_only": "Solo lista consentiti del team",
  "admin.enterprise.noPolicy":
    "Nessuna policy. I computer degli assistenti raggiungono tutto ciò che il cluster consente",
  "admin.enterprise.locked": " · bloccata",
  "admin.enterprise.loadError":
    "Non sono riuscito a caricare i controlli aziendali. Ricarica la pagina.",
  "admin.enterprise.title": "Controlli aziendali",
  "admin.enterprise.description":
    "Cosa possono usare i membri, come i computer degli assistenti raggiungono la rete e cosa viene registrato. Ogni modifica compare in Audit.",
  "admin.enterprise.signin.description":
    "Gli indirizzi in {env} possono sempre accedere con l'accesso social come via d'emergenza. Ognuno di questi accessi compare in Audit.",
  "admin.enterprise.signin.title": "Accesso",
  "admin.enterprise.sso.title": "Richiedi SSO",
  "admin.enterprise.sso.on":
    "Le persone possono accedere solo tramite un provider SAML o OpenID Connect registrato.",
  "admin.enterprise.sso.off":
    "Le persone possono accedere anche con Google, Microsoft o Okta.",
  "admin.enterprise.scim.title": "Provisioning SCIM",
  "admin.enterprise.scim.on":
    "URL base della directory {url} con il bearer token {env}. La rimozione dell'utente termina le sessioni, blocca l'indirizzo, ritira le credenziali dei connettori e ferma i suoi computer.",
  "admin.enterprise.scim.unsetUrl": "(imposta BETTER_AUTH_URL)",
  "admin.enterprise.scim.off":
    "Disattivato. Imposta {env} per accettare il provisioning da Okta, Entra o un'altra directory.",
  "admin.enterprise.on": "Attivo",
  "admin.enterprise.off": "Disattivato",
  "admin.enterprise.cap.description":
    "Ogni interruttore vale per tutta l'organizzazione. Un ruolo può sostituirlo e un gruppo della directory può ottenere una funzione che l'organizzazione ha disattivata.",
  "admin.enterprise.cap.title": "Funzioni",
  "admin.enterprise.cap.offFor":
    "Disattivata per tutti, a meno che un ruolo o un gruppo la attivi.",
  "admin.enterprise.over.title": "Eccezioni per ruolo e gruppo",
  "admin.enterprise.over.none":
    "Nessuna. Tutti ricevono gli interruttori qui sopra",
  "admin.enterprise.over.set": "{count} impostate",
  "admin.enterprise.net.description":
    "Dove possono connettersi i computer degli assistenti. Le modifiche raggiungono i computer in esecuzione in pochi secondi, senza riavvio. La policy di un gruppo sostituisce quella dell'organizzazione, a meno che sia bloccata.",
  "admin.enterprise.net.title": "Rete",
  "admin.enterprise.net.org": "Organizzazione",
  "admin.enterprise.net.group": "Gruppo: {name}",
  "admin.enterprise.net.addGroup": "Aggiungi una policy di gruppo",
  "admin.enterprise.mcp.description":
    "Con la lista consentiti attiva, gli assistenti possono chiamare strumenti solo sui server MCP approvati qui. Le chiamate a qualsiasi altro server vengono rifiutate.",
  "admin.enterprise.mcp.title": "Server MCP",
  "admin.enterprise.mcp.only": "Solo server approvati",
  "admin.enterprise.mcp.approved": "{count} approvati",
  "admin.enterprise.mcp.offDesc":
    "Disattivato. Gli assistenti possono usare qualsiasi server registrato a cui hanno accesso.",
  "admin.enterprise.mcp.onlyAria": "Solo server MCP approvati",
  "admin.enterprise.mcp.approveAria": "Approva {name}",
  "admin.enterprise.models.description":
    "L'assistente integrato usa {model}. Un assistente remoto sceglie il proprio, e il modello che dichiara viene registrato.",
  "admin.enterprise.models.configured":
    "il modello configurato nell'installazione",
  "admin.enterprise.models.title": "Modelli",
  "admin.enterprise.models.allowlist": "Lista dei modelli consentiti",
  "admin.enterprise.models.allowlistOn":
    "Un assistente integrato con un modello non in elenco viene rifiutato prima di partire.",
  "admin.enterprise.models.allowlistOff":
    "Disattivata. Si può usare qualsiasi modello.",
  "admin.enterprise.models.allowed": "Modelli consentiti",
  "admin.enterprise.models.none": "Nessuno in elenco",
  "admin.enterprise.models.listDesc":
    "Un modello per riga, come provider/modello, per esempio {example}.",
  "admin.enterprise.rec.description":
    "Imposta {env} per inviare gli eventi di audit e le azioni degli assistenti al tuo collector OpenTelemetry o SIEM. Sono etichettati {tag}.",
  "admin.enterprise.rec.title": "Registrazione ed esportazione",
  "admin.enterprise.rec.action": "Registrazione delle azioni",
  "admin.enterprise.rec.actionOn":
    "I comandi di shell eseguiti dagli assistenti vengono registrati senza i segreti e conservati {days} giorni.",
  "admin.enterprise.rec.actionOff":
    "Disattivata. I comandi compaiono solo in Audit.",
  "admin.enterprise.rec.otel": "Esportazione OpenTelemetry",
  "admin.enterprise.rec.otelOn": "Esportazione via OTLP/HTTP.",
  "admin.enterprise.rec.otelOff": "Non configurata. Imposta {env} sul server.",
  "admin.enterprise.comp.description":
    "Fermare un computer termina gli assistenti in esecuzione e ne conserva il disco. La sessione successiva l'assistente riceve un computer nuovo. Per fermare i computer di una sola persona, vai su Persone.",
  "admin.enterprise.comp.title": "Computer",
  "admin.enterprise.comp.stopInactive": "Ferma i computer inattivi",
  "admin.enterprise.comp.afterDays": "Dopo {days} giorni senza uso",
  "admin.enterprise.usage.error":
    "Non sono riuscito a caricare l'uso dei modelli. Ricarica la pagina.",
  "admin.enterprise.usage.empty":
    "Nessuna esecuzione di assistenti negli ultimi 30 giorni.",
  "admin.enterprise.usage.runs":
    "{runs} esecuzioni di {people} {who} in 30 giorni",
  "admin.enterprise.usage.person": "persona",
  "admin.enterprise.usage.people": "persone",
  "admin.enterprise.usage.refused": " · {count} fuori dalla lista",
  "admin.enterprise.recorded.error":
    "Non sono riuscito a caricare le azioni registrate. Ricarica la pagina.",
  "admin.enterprise.recorded.empty": "Ancora nessun comando registrato.",
  "admin.enterprise.recorded.local": "Computer del membro",
  "admin.enterprise.recorded.bot": "Assistente {id}",
  "admin.enterprise.sweep.stopping": "Fermo in corso…",
  "admin.enterprise.sweep.now": "Ferma ora i computer inattivi",
  "admin.enterprise.sweep.stopped": "Fermati: {count}.",
  "admin.enterprise.ov.admins": "Amministratori",
  "admin.enterprise.ov.members": "Membri",
  "admin.enterprise.ov.group": "Gruppo: {name}",
  "admin.enterprise.ov.scope": "Ambito",
  "admin.enterprise.ov.groupNote":
    "Un gruppo può solo aggiungere. «Concedi» dà ai suoi membri la funzione anche quando l'organizzazione l'ha disattivata.",
  "admin.enterprise.ov.roleNote":
    "L'impostazione di un ruolo sostituisce l'interruttore dell'organizzazione per tutti quelli con quel ruolo.",
  "admin.enterprise.ov.forScope": "{title} per {scope}",
  "admin.enterprise.ov.inherit": "Eredita",
  "admin.enterprise.ov.grant": "Concedi",
  "admin.enterprise.netd.org": "Policy di rete dell'organizzazione",
  "admin.enterprise.netd.group": "Policy di rete del gruppo",
  "admin.enterprise.netd.groupLabel": "Gruppo",
  "admin.enterprise.netd.mode": "Modalità",
  "admin.enterprise.netd.allowlist": "Lista consentiti",
  "admin.enterprise.netd.help":
    "Uno per riga. Un dominio copre i suoi sottodomini. *.nome copre solo i sottodomini. Un intervallo IP può indicare le porte. I predefiniti sono {first} e altri {more} host di pacchetti e sorgenti.",
  "admin.enterprise.netd.lock":
    "Blocca così i gruppi non possono sostituire questa policy",
  "admin.enterprise.netd.remove": "Rimuovi la policy",
  "admin.enterprise.days.label": "Giorni senza uso",
  "admin.enterprise.days.help": "0 la disattiva. Controllo ogni ora.",
  "admin.plugins.title": "Plugin",
  "admin.plugins.description":
    "Cosa può raggiungere questa installazione e quali assistenti possono usarlo. Un plugin che aggiungi è per tutti. Scegli quali assistenti ricevono i suoi strumenti nella sua pagina.",
  "admin.plugins.loadError":
    "Non sono riuscito a caricare i plugin. Ricarica la pagina.",
  "admin.plugins.connected.description":
    "Aggiunti per tutti. Aprine uno per configurarlo e scegliere quali assistenti ricevono i suoi strumenti.",
  "admin.plugins.connected.title": "Collegati",
  "admin.plugins.connected.empty":
    "Ancora niente di collegato. Scegline uno dall'elenco qui sotto.",
  "admin.plugins.explore.description":
    "Server ufficiali e verificati. Aprine uno per aggiungerlo.",
  "admin.plugins.explore.title": "Scopri i plugin",
  "admin.plugins.explore.empty": "Ogni plugin del catalogo è collegato.",
  "admin.plugins.notAdded": "Non aggiunto",
  "admin.plugins.more.title": "Altre app",
  "admin.plugins.sum.notConnected": "Non collegato",
  "admin.plugins.sum.noTools": "Ancora nessuno strumento",
  "admin.plugins.sum.tools": {
    one: "{count} strumento",
    other: "{count} strumenti",
  },
  "admin.plugins.sum.toolsNoBots": "{tools} · nessun assistente",
  "admin.plugins.sum.bots": {
    one: "{count} assistente",
    other: "{count} assistenti",
  },
  "admin.plugins.requests": {
    one: "{count} richiesta",
    other: "{count} richieste",
  },
  "admin.plugins.key.grant.none": "Nessun assistente",
  "admin.plugins.key.grant.one": "1 assistente",
  "admin.plugins.key.grant.all": "Tutti gli assistenti",
  "admin.plugins.key.grant.some": "{held} di {total} assistenti",
  "admin.plugins.key.held.none": "Nessuno strumento",
  "admin.plugins.key.held.one": "1 strumento",
  "admin.plugins.key.held.all": "Ogni strumento",
  "admin.plugins.key.held.some": "{held} di {total} strumenti",
  "admin.plugins.key.notApproved": "Non approvato",
  "admin.plugins.key.unreadableTitle": "Il tuo account",
  "admin.plugins.key.unreadable":
    "Non sono riuscito a caricare se hai collegato un account qui. Ricarica la pagina o controlla i log di questa installazione se continua.",
  "admin.plugins.key.noConsent":
    "{product} non ha ricevuto nessun link di consenso, quindi non è stato collegato nulla. Riprova o controlla la configurazione di questo connettore se continua.",
  "admin.plugins.key.reassurance":
    "La configurazione è completa anche senza, e raggiunge solo i tuoi documenti.",
  "admin.plugins.key.notPlugin.description":
    "Non esiste nessun plugin con quel nome, né qui né nel catalogo.",
  "admin.plugins.key.notPlugin.title": "Non è un plugin",
  "admin.plugins.key.notPlugin.empty": "Niente da configurare.",
  "admin.plugins.key.enable.title": "Attiva per questa installazione",
  "admin.plugins.key.enable.on":
    "Gli assistenti possono ricevere i suoi strumenti. Disattivandolo lo rimuovi, insieme all'accesso di ogni assistente ai suoi strumenti.",
  "admin.plugins.key.enable.off":
    "Nessun assistente può raggiungere questo fornitore. Attivalo per configurarlo e dare agli assistenti i suoi strumenti.",
  "admin.plugins.key.enable.aria": "Attiva {title} per questa installazione",
  "admin.plugins.key.whose.title": "Di chi è l'account",
  "admin.plugins.key.whose.shared": "Un solo account condiviso per tutti.",
  "admin.plugins.key.whose.personal": "Ognuno collega il proprio.",
  "admin.plugins.key.whose.makePersonal": "Rendilo personale",
  "admin.plugins.key.whose.makeShared": "Rendilo condiviso",
  "admin.plugins.key.conn.oauth":
    "Questo fornitore risponde come chi chiede. L'installazione registra un client OAuth e ogni persona collega il proprio account. Un assistente vede solo ciò che vede quella persona.",
  "admin.plugins.key.conn.secret":
    "Questo fornitore risponde come chi chiede. Ogni persona incolla la propria password per le app nella propria pagina Connessioni. Qui non c'è nulla da registrare e l'installazione non conserva nessuna password propria.",
  "admin.plugins.key.conn.builtin":
    "Integrato in questa installazione. Non c'è nessun fornitore da raggiungere e nessuna credenziale da conservare. Una chiamata viene eseguita come chi l'ha richiesta.",
  "admin.plugins.key.conn.bearer":
    "Ciò che questa installazione invia al fornitore. Una sola credenziale per tutti.",
  "admin.plugins.key.conn.title": "Connessione",
  "admin.plugins.key.builtin.desc":
    "Niente da configurare. Questi strumenti girano dentro questa installazione, sui suoi dati.",
  "admin.plugins.key.builtin.badge": "Integrato",
  "admin.plugins.key.secret.title": "Password per le app",
  "admin.plugins.key.secret.desc":
    "Ognuno crea la propria su Google e la incolla nella propria pagina Connessioni. Raggiunge tutta la sua casella di posta, quindi ciò che gli assistenti possono fare lo decidono gli strumenti che concedi qui sotto.",
  "admin.plugins.key.secret.badge": "Per persona",
  "admin.plugins.key.reach.title": "Come viene raggiunto",
  "admin.plugins.key.token.title": "Token di accesso",
  "admin.plugins.key.token.desc": "Inviato a ogni chiamata a questo fornitore.",
  "admin.plugins.key.saved": "Salvato",
  "admin.plugins.key.notSet": "Non impostato",
  "admin.plugins.key.client.title": "Client OAuth",
  "admin.plugins.key.client.selfDesc":
    "Questa installazione si registra da sola presso il fornitore al primo collegamento. Non c'è nulla da incollare.",
  "admin.plugins.key.client.selfBadge": "Autoregistrato",
  "admin.plugins.key.client.desc":
    "Identifica questa installazione presso il fornitore. Da solo non può raggiungere i documenti di nessuno.",
  "admin.plugins.key.client.registered": "Registrato",
  "admin.plugins.key.client.notRegistered": "Non registrato",
  "admin.plugins.key.team.connected":
    "Collegato{who}. Ogni assistente con questi strumenti agisce come questo account.",
  "admin.plugins.key.team.as": " come {name}",
  "admin.plugins.key.team.by": " da {name}",
  "admin.plugins.key.team.disconnected":
    "Nessun account del team è collegato. Gli assistenti con questi strumenti vengono rifiutati.",
  "admin.plugins.key.team.heading": "Account del team",
  "admin.plugins.key.team.notice":
    "Accedi come account del team, non con il tuo.",
  "admin.plugins.key.mine.connected":
    "Collegato. Un assistente con questi strumenti usa il tuo {title} come te. {note}",
  "admin.plugins.key.mine.tryConnect":
    "Collega il tuo account per provare questo connettore. {note}",
  "admin.plugins.key.oauthAcct.connected":
    "Collegato. Un assistente con questi strumenti usa il tuo {title} come te. Tutti gli altri collegano il proprio.",
  "admin.plugins.key.oauthAcct.connect":
    "Collega il tuo account per provare questo connettore. La configurazione è completa anche senza, e raggiunge solo i tuoi documenti.",
  "admin.plugins.key.connected": "Collegato",
  "admin.plugins.key.connect": "Collega",
  "admin.plugins.key.instance.title": "Host dell'istanza",
  "admin.plugins.key.instance.desc":
    "Questo fornitore dà a ogni cliente un proprio nome host. Viene controllato rispetto al modello del fornitore prima di essere salvato.",
  "admin.plugins.key.docs.builtin": "Documentazione",
  "admin.plugins.key.docs.vendor": "Documentazione del fornitore",
  "admin.plugins.key.docs.builtinDesc":
    "Cosa offrono questi strumenti, da chi li mantiene.",
  "admin.plugins.key.docs.vendorDesc":
    "Cosa offre questo server, da chi lo mantiene.",
  "admin.plugins.key.redirect.dynamic":
    "L'installazione registra da sola il proprio URI di reindirizzamento. Non c'è nulla da aggiungere presso il fornitore.",
  "admin.plugins.key.redirect.manual":
    "Aggiungilo agli URI di reindirizzamento autorizzati del client presso il fornitore, esattamente come scritto. Un carattere sbagliato fa fallire lì, con un errore che non nomina {product}.",
  "admin.plugins.key.redirect.noUrl":
    "Questa installazione non ha un URL pubblico, quindi nessuno può completare il collegamento. Imposta {env}.",
  "admin.plugins.key.tools.refresh": "Aggiorna gli strumenti",
  "admin.plugins.key.tools.grant": "Concedi strumenti…",
  "admin.plugins.key.tools.description":
    "Un assistente vede solo gli strumenti che gli sono stati concessi. Ogni chiamata viene controllata quando avviene, quindi togliere l'accesso vale dalla chiamata successiva.",
  "admin.plugins.key.tools.title": "Strumenti",
  "admin.plugins.key.tools.empty":
    "Nessuno strumento in elenco. Aggiorna gli strumenti per ricontrollare.",
  "admin.plugins.key.tools.writes": "apporta modifiche",
  "admin.plugins.key.tools.reads": "legge",
  "admin.plugins.key.byBot": "Per assistente",
  "admin.plugins.key.byBot.hidden":
    "Nascosto dal tuo elenco. Attiva o disattiva una per una le azioni di questa app.",
  "admin.plugins.key.byBot.shown":
    "Attiva o disattiva una per una le azioni di questa app.",
  "admin.plugins.key.gone.description":
    "Questo fornitore non li elenca più. Nessun assistente li vede e nessuno può chiamarli. L'accesso è ancora salvato e torna se il fornitore elenca di nuovo lo strumento. Per rimuoverlo, usa la pagina dell'assistente.",
  "admin.plugins.key.gone.title": "Concessi ma non più elencati",
  "admin.plugins.key.gone.row": "Non elencato da {title}{asOf}.",
  "admin.plugins.key.gone.asOf": " all'ultimo aggiornamento",
  "admin.plugins.key.dlg.client": "Client OAuth per {title}",
  "admin.plugins.key.dlg.instance": "Host dell'istanza per {title}",
  "admin.plugins.key.dlg.token": "Token di accesso per {title}",
  "admin.plugins.key.dlg.clientDesc":
    "Dalla console del fornitore. Il segreto viene salvato nel vault di questa installazione e non viene mostrato più.",
  "admin.plugins.key.dlg.instanceDesc":
    "Il tuo nome host presso questo fornitore. Viene controllato rispetto al modello del fornitore prima di essere salvato.",
  "admin.plugins.key.dlg.tokenDesc":
    "Salvato nel vault di questa installazione e non mostrato più.",
  "admin.plugins.key.dlg.clientId": "ID client",
  "admin.plugins.key.dlg.clientSecret": "Segreto del client",
  "admin.plugins.key.gr.title": "Concedi strumenti",
  "admin.plugins.key.gr.description":
    "Ogni concessione è una riga a sé in Audit. Gli strumenti che apportano modifiche vengono comunque controllati rispetto ai limiti a ogni chiamata.",
  "admin.plugins.key.gr.to": "A",
  "admin.plugins.key.gr.reads": "Legge",
  "admin.plugins.key.gr.writes": "Apporta modifiche",
  "admin.plugins.key.gr.selectAll": "Seleziona tutti",
  "admin.plugins.key.gr.button": "Concedi",
  "admin.plugins.key.gr.progress": "Concessione {current} di {total}…",
  "admin.plugins.key.gr.summary": {
    one: "Concedi {count} strumento a {names}.",
    other: "Concedi {count} strumenti a {names}.",
  },
  "admin.plugins.key.gr.changing": {
    one: "{count} apporta modifiche.",
    other: "{count} apportano modifiche.",
  },
  "admin.home.reach.desc":
    "Cosa può toccare un assistente fuori da {product}, e i limiti che ha.",
  "admin.home.credentials.desc": "Chiavi e token di questa installazione.",
  "admin.home.boundaries.desc": "Cose che nessun assistente può mai fare.",
  "admin.home.approvals.desc":
    "Cosa devono chiedere gli assistenti dei membri prima di agire.",
  "admin.home.computers.desc":
    "Le macchine su cui gli assistenti eseguono gli strumenti.",
  "admin.home.do.desc":
    "App, skill e pezzi di interfaccia che ogni assistente può usare.",
  "admin.home.plugins.desc":
    "I servizi che {product} può raggiungere e quali assistenti possono usarli.",
  "admin.home.skills.desc":
    "Istruzioni con un nome che chiunque può eseguire con /.",
  "admin.home.learning.desc":
    "Impara dalle conversazioni concluse e rivedi le skill che propone.",
  "admin.home.components.desc":
    "Pezzi personalizzati che un assistente può disegnare in una conversazione.",
  "admin.home.playground.desc":
    "Scrivi un componente e guardalo comparire mentre digiti.",
  "admin.home.engines.desc":
    "I motori AI su cui girano i membri e se ognuno può rispondere adesso.",
  "admin.home.people.desc":
    "Tutti quelli che hanno effettuato l'accesso, chi sono gli amministratori e a chi è stato tolto l'accesso.",
  "admin.home.enterprise.desc":
    "Ruoli e gruppi, SSO obbligatorio, SCIM, policy di rete, liste consentiti per MCP e modelli, registrazione delle azioni.",
  "admin.home.idp.desc":
    "Il provider SAML o OpenID Connect della tua azienda, abbinato per dominio email.",
  "admin.home.audit.desc": "Ogni azione compiuta in {product} e da chi.",
  "admin.home.description":
    "Impostazioni per tutti in questa installazione. Una modifica qui riguarda ogni persona e ogni assistente.",
  "admin.plugins.directoryError":
    "Non sono riuscito a caricare le impostazioni dei plugin. Ricarica la pagina.",
  "admin.components.description":
    "Con cosa può rispondere ogni assistente. Ogni componente pubblicato è attivo per ogni assistente. Disattivane uno e quell'assistente non lo vede mai. Modifiche e rifiuti compaiono in Audit.",
  "admin.components.loadError":
    "Non sono riuscito a caricare i componenti. Ricarica la pagina.",
  "admin.components.emptyTitle": "Ancora nessun componente",
  "admin.components.emptyDesc":
    "I componenti che i tuoi assistenti possono usare compariranno qui.",
  "admin.audit.silence.quiet": "Silenzioso per {seconds}s",
  "admin.audit.silence.nothing": "{quiet}, senza aver detto nulla",
  "admin.audit.silence.after": {
    one: "{quiet}, dopo {count} frammento",
    other: "{quiet}, dopo {count} frammenti",
  },
  "admin.compDetail.title": "Componenti",
  "admin.compDetail.noSuch.title": "Componente non trovato",
  "admin.compDetail.noSuch.description":
    "Non esiste alcun componente con quel nome.",
  "admin.compDetail.noSuch.hint":
    "Potrebbe essere stato rinominato, oppure questa installazione non lo include più.",
  "admin.compDetail.back": "Torna ai componenti",
  "admin.compDetail.grant.noBots": "Ancora nessun Bot",
  "admin.compDetail.grant.all": {
    one: "Tutti i Bot ({count})",
    other: "Tutti i {count} Bot",
  },
  "admin.compDetail.grant.none": "Nessun Bot",
  "admin.compDetail.grant.some": "{granted} Bot su {total}",
  "admin.compDetail.fn.none": "Questa installazione non ha funzioni dati",
  "admin.compDetail.fn.nothing":
    "Niente. Mostra solo ciò che il Bot gli passa.",
  "admin.compDetail.notPublished": "Non pubblicato. Nessun Bot può vederlo.",
  "admin.compDetail.config.title": "Configurazione",
  "admin.compDetail.config.description":
    "A che cosa serve questo componente e quali Bot possono rispondere con esso.",
  "admin.compDetail.notInBuild.title": "Non presente in questa versione",
  "admin.compDetail.notInBuild.description":
    "{product} non riesce a mostrarlo. Le impostazioni qui sotto non hanno effetto.",
  "admin.compDetail.published": "Pubblicato",
  "admin.compDetail.published.on": "I Bot possono rispondere con esso.",
  "admin.compDetail.published.off": "Nessun Bot può usarlo.",
  "admin.compDetail.published.changes":
    "La descrizione ha modifiche non pubblicate.",
  "admin.compDetail.description": "Descrizione",
  "admin.compDetail.nothingYet": "Ancora niente",
  "admin.compDetail.availableTo": "Disponibile per",
  "admin.compDetail.canRead": "Può leggere",
  "admin.compDetail.details": "Dettagli",
  "admin.compDetail.kind": "Tipo",
  "admin.compDetail.calledAs": "Richiamato come",
  "admin.compDetail.lastChanged": "Ultima modifica",
  "admin.compDetail.by": "da {name}",
  "admin.compDetail.descDlg.description":
    "Ciò che il modello legge quando decide di usarlo. Non ha effetto finché il componente non è pubblicato.",
  "admin.compDetail.grantsDlg.description":
    "Disattiva un Bot e non verrà mai a sapere che questo componente esiste. Le modifiche valgono subito.",
  "admin.compDetail.grantsDlg.empty": "Ancora nessun Bot.",
  "admin.compDetail.fnDlg.description":
    "I dati che questo componente può recuperare per mostrarsi. È separato da Disponibile per. Con tutti disattivati, mostra solo ciò che il Bot gli passa. Ogni lettura compare nel Registro. Le modifiche valgono subito.",
  "admin.compDetail.fnDlg.empty": "Questa installazione non ha funzioni dati.",
  "admin.computers.description":
    "Il browser di ogni Bot e il profilo che conserva. Il profilo tiene il Bot connesso. Reimpostarlo disconnette il Bot da tutto.",
  "admin.computers.loadError":
    "Non è stato possibile caricare i computer. Ricarica la pagina.",
  "admin.computers.shared.lead": "Tutti i Bot condividono un solo computer.",
  "admin.computers.shared.before":
    "Ne condividono accessi, file e sessione. Un Bot può raggiungere ciò a cui ne ha effettuato l'accesso un altro. Imposta",
  "admin.computers.shared.after": "per dare a ogni Bot il proprio.",
  "admin.computers.perBot":
    "Ogni Bot ha il proprio computer, con il proprio container, i propri file e il proprio profilo del browser.",
  "admin.computers.list.title": "Computer in questa installazione",
  "admin.computers.list.error": "Non è stato possibile caricare l'elenco.",
  "admin.computers.list.empty":
    "Ancora nessun computer. Ne compare uno la prima volta che un Bot apre una pagina.",
  "admin.computers.running": "Browser in esecuzione dalle {time}",
  "admin.computers.notRunning":
    "Nessun browser in esecuzione. Parte quando serve di nuovo al Bot.",
  "admin.computers.egress.unknown": "Uscita non indicata",
  "admin.computers.egress.direct": "Esce direttamente",
  "admin.computers.egress.via": "Esce tramite {egress}",
  "admin.computers.updateAvailable": "Aggiornamento disponibile",
  "admin.computers.update": "Aggiorna il computer",
  "admin.computers.working": "Un attimo…",
  "admin.computers.stop": "Ferma il browser",
  "admin.computers.reset": "Reimposta",
  "admin.computers.resetTitle": "Reimpostare il computer di {name}?",
  "admin.computers.resetDesc":
    "Il suo profilo viene eliminato. Il Bot viene disconnesso da ogni servizio e riparte da zero. Non puoi annullare questa azione.",
  "admin.computers.resetting": "Reimposto…",
  "admin.computers.resetIt": "Reimposta",
  "admin.computers.updateTitle": "Aggiornare il computer di {name}?",
  "admin.computers.updateDesc":
    "Passa all'immagine del computer che questa installazione usa ora. I suoi file e i suoi accessi restano. Se è in esecuzione, si riavvia e interrompe ciò che sta facendo.",
  "admin.computers.updating": "Aggiorno…",
  "admin.computers.updateIt": "Aggiorna",
  "admin.computers.foot.stopLead": "Ferma",
  "admin.computers.foot.stopRest":
    "chiude il browser e ne conserva gli accessi. Riparte la prossima volta che serve al Bot.",
  "admin.computers.foot.resetLead": "Reimposta",
  "admin.computers.foot.resetRest":
    "elimina il profilo e disconnette il Bot da tutto.",
  "admin.computers.foot.updateLead": "Aggiorna il computer",
  "admin.computers.foot.updateRest":
    "compare quando un computer usa un'immagine più vecchia. Porta il computer a quella nuova e ne conserva file e accessi.",
  "admin.computers.foot.audit": "Tutte e tre compaiono in",
  "admin.computers.host.description":
    "Scegli le cartelle che un Bot può leggere su questo computer. L'app desktop chiede prima di ogni modifica o comando. L'accesso finisce quando fermi {product}.",
  "admin.computers.host.title": "Cartelle su questo computer",
  "admin.computers.host.offline":
    "L'app desktop non è in linea. Aprila per approvare cartelle o eseguire comandi.",
  "admin.computers.host.noBots":
    "Ancora nessun Bot. Creane uno, poi scegli le sue cartelle.",
  "admin.computers.host.choose": "Scegli una cartella",
  "admin.computers.host.waiting": "In attesa…",
  "admin.computers.host.readOnlyNote":
    "Le cartelle sono di sola lettura. Quando un Bot deve scrivere, l'app desktop te lo chiede prima.",
  "admin.computers.host.stopAccess": "Interrompi l'accesso alle cartelle",
  "admin.computers.host.stopping": "Interrompo…",
  "admin.computers.host.viewAudit": "Apri il registro",
  "admin.computers.host.readOnly": "Sola lettura",
  "admin.computers.host.revoke": "Revoca",
  "admin.computers.host.revoking": "Revoco…",
  "admin.computers.host.pendingFrom": "{label} da {owner}.",
  "admin.computers.host.pendingFromFor": "{label} da {owner} per {name}.",
  "admin.computers.host.folders": {
    one: "{count} cartella di sola lettura",
    other: "{count} cartelle di sola lettura",
  },
  "admin.computers.host.requests": {
    one: "{count} richiesta in attesa",
    other: "{count} richieste in attesa",
  },
  "admin.computers.host.none": "Nessuna cartella approvata.",
  "admin.computers.host.owner": "il proprietario del desktop",
  "admin.computers.host.p.write":
    "Modifica di file in attesa di approvazione o di essere completata",
  "admin.computers.host.p.run":
    "Comando in attesa di approvazione o di essere completato",
  "admin.computers.host.p.list": "Elenco dei file",
  "admin.computers.host.p.read": "Lettura di un file",
  "admin.computers.host.p.stop": "Interruzione del lavoro sulle cartelle",
  "admin.computers.host.p.default":
    "Accesso alle cartelle in attesa di approvazione",
  "admin.learning.description":
    "Impara dalle conversazioni concluse, rivedi le skill che Intelligence propone e dai ai Bot le skill pubblicate.",
  "admin.learning.auto.assigned":
    '{product} ha assegnato automaticamente il container "{container}" di questo progetto Intelligence. Puoi cambiarlo qui.',
  "admin.learning.auto.absent":
    'Questo progetto Intelligence non ha ancora un container Learning "{container}". Non viene raccolto nulla.',
  "admin.learning.auto.notEntitled":
    "Il piano di questo progetto Intelligence non include Learning. Non è stato assegnato alcun container.",
  "admin.learning.auto.unavailable":
    "Non è stato possibile raggiungere Intelligence per trovare il container Learning di questo progetto. {product} riproverà.",
  "admin.learning.target.container": "ID del container: {label}",
  "admin.learning.target.revision": "Revisione esatta (facoltativa)",
  "admin.learning.target.revisionAria": "Revisione: {label}",
  "admin.learning.target.latest": "Ultima pubblicata",
  "admin.learning.create.busy": "Creo…",
  "admin.learning.create.button": "Crea il container {container}",
  "admin.learning.create.note":
    "Usa la credenziale di questa installazione, non la chiave di esecuzione.",
  "admin.learning.create.how": "Per crearlo: ",
  "admin.learning.part.title": "Partecipazione",
  "admin.learning.part.description":
    "Le modifiche ai container valgono per le nuove conversazioni. Quelle esistenti tengono il primo container. I container devono esistere già nello stesso progetto Intelligence. Finché non salvi qui, {product} usa il container openbot di quel progetto.",
  "admin.learning.part.loading": "Carico le impostazioni di Learning…",
  "admin.learning.part.turnOn":
    "Attiva l'apprendimento automatico e la consegna delle skill",
  "admin.learning.part.default": "Predefinito",
  "admin.learning.part.hint":
    "Senza un predefinito, i Bot senza un container proprio restano esclusi. Gli ID sono da 1 a 64 lettere minuscole, numeri e trattini singoli. Lascia vuota la revisione per usare le ultime skill pubblicate.",
  "admin.learning.part.perBot": "Partecipazione per Bot",
  "admin.learning.part.botListError":
    "Non è stato possibile caricare l'elenco dei Bot. Qui sotto trovi le impostazioni salvate per ogni Bot.",
  "admin.learning.part.botAria": "Partecipazione di {name}",
  "admin.learning.part.inherit": "Usa il predefinito dell'installazione",
  "admin.learning.part.exclude": "Escludi da Learning",
  "admin.learning.part.container": "Usa un container specifico",
  "admin.learning.part.saving": "Salvo…",
  "admin.learning.part.save": "Salva le impostazioni di Learning",
  "admin.learning.part.saved": "Impostazioni salvate.",
  "admin.learning.rev.title": "Rivedi e pubblica",
  "admin.learning.rev.description":
    "Intelligence studia le conversazioni concluse e propone skill. Rivedile e pubblicale in Intelligence. I Bot usano solo le skill pubblicate.",
  "admin.learning.rev.showFor": "Mostra il container di",
  "admin.learning.rev.default": "Predefinito dell'installazione",
  "admin.learning.rev.checking": "Controllo Intelligence…",
  "admin.learning.rev.invalid":
    "Il container selezionato o la sua strumentazione non è disponibile.",
  "admin.learning.rev.selection":
    "Scegli un Bot oppure imposta un container predefinito.",
  "admin.learning.rev.none": "Nessun container Learning assegnato.",
  "admin.learning.rev.threads": "Conversazioni pronte",
  "admin.learning.rev.candidates": "Candidate da rivedere",
  "admin.learning.rev.published": "Skill pubblicate",
  "admin.learning.rev.insights": "Approfondimenti",
  "admin.learning.rev.running": "Un'analisi è in corso.",
  "admin.learning.rev.latest": "Ultima analisi: {status}.",
  "admin.learning.rev.noRun": "Nessuna analisi è ancora stata eseguita.",
  "admin.learning.rev.manage": "Gestisci Learning in Intelligence",
  "admin.learning.rev.reviewCandidates": "Rivedi le skill candidate",
  "admin.learning.rev.viewRuns": "Vedi le analisi eseguite",
  "admin.learning.del.title": "Consegna delle skill",
  "admin.learning.del.checking": "Controllo la consegna…",
  "admin.learning.del.off": "La consegna è disattivata per questo Bot.",
  "admin.learning.del.waiting":
    "In attesa del primo snapshot verificato delle skill.",
  "admin.learning.del.stale":
    "Uso l'ultimo snapshot verificato. Un aggiornamento è in attesa.",
  "admin.learning.del.ok": "È disponibile uno snapshot verificato.",
  "admin.learning.del.revision": "Revisione caricata: {revision}",
  "admin.learning.del.lastChecked": "Ultimo controllo:",
  "admin.learning.rev.refresh": "Aggiorna lo stato",
  "admin.learning.rev.footer":
    "Gestire Learning richiede il tuo account Intelligence e l'accesso al progetto. {product} tiene le credenziali del progetto sul server. Disattivare Learning qui conserva le impostazioni e le assegnazioni delle conversazioni. Pianificazioni e pubblicazione restano in Intelligence.",
  "admin.playground.validJson": "{label} deve essere un JSON valido: {reason}",
  "admin.playground.invalidJson": "JSON non valido",
  "admin.playground.notObject":
    "{label} deve essere un oggetto JSON, non {kind}.",
  "admin.playground.schemaLabel": "Argomenti (JSON Schema)",
  "admin.playground.sampleLabel": "Argomenti di esempio",
  "admin.playground.fixBeforeSave": "Correggi i campi JSON prima di salvare.",
  "admin.playground.draftSaved": "Bozza salvata.",
  "admin.playground.published": "Pubblicato.",
  "admin.playground.description":
    "Scrivi un componente e pubblicalo senza rifare il deploy. Le tue modifiche sono una bozza. Le conversazioni mostrano solo ciò che è pubblicato.",
  "admin.playground.saveDraft": "Salva la bozza",
  "admin.playground.publish": "Pubblica",
  "admin.playground.title": "Titolo",
  "admin.playground.titlePlaceholder": "Scheda rimborso",
  "admin.playground.told": "Che cosa viene detto al modello",
  "admin.playground.toldPlaceholder":
    "Mostra un rimborso con importo, motivo e stato.",
  "admin.playground.preview": "Anteprima",
  "admin.playground.noSample": "Gli argomenti di esempio non sono disponibili.",
  "admin.playground.fixBeforePreview":
    "Correggi i campi JSON prima dell'anteprima.",
  "admin.playground.saved.title": "Salvati qui",
  "admin.playground.saved.empty":
    "Ancora niente di salvato. Salva una bozza per vederla qui.",
  "admin.playground.saved.published": "pubblicato, revisione {revision}",
  "admin.playground.saved.draftOnly": "solo bozza, nessun Bot può mostrarlo",
  "admin.playground.saved.edited": "modificato dopo la pubblicazione",
  "admin.playground.open": "Apri",
  "admin.playground.delete": "Elimina",
  "admin.playground.saved.note":
    "Pubblicare lo rende disponibile a ogni Bot. Puoi disattivarlo per un solo Bot nella pagina Componenti dell'interfaccia.",
  "admin.playground.del.title": "Eliminare {name}?",
  "admin.playground.del.description":
    "Viene rimosso da questa installazione e nessun Bot può più mostrarlo. Non puoi annullare questa azione.",
  "admin.playground.del.confirm": "Elimina",
  "admin.plugins.tool.title": "Strumento",
  "admin.plugins.tool.noTool":
    "Questo connettore non ha alcuno strumento con quel nome.",
  "admin.plugins.tool.removed":
    "Potrebbe essere stato rimosso dall'ultimo aggiornamento dell'elenco degli strumenti.",
  "admin.plugins.tool.notOn": "Questo connettore non è attivo.",
  "admin.plugins.tool.noDesc": "Questo strumento non ha una descrizione.",
  "admin.plugins.tool.writeDesc":
    "Questo strumento modifica qualcosa presso il fornitore. I limiti sulle scritture valgono per lui.",
  "admin.plugins.tool.readDesc":
    "Questo strumento si limita a leggere. I limiti sulle scritture non valgono per lui.",
  "admin.plugins.tool.what": "Che cosa fa",
  "admin.plugins.tool.effect": "Effetto",
  "admin.plugins.tool.effectDesc":
    "Lo stabilisce il connettore, non il nome dello strumento. Ciò che non è noto conta come una scrittura.",
  "admin.plugins.tool.bots.title": "Assistenti",
  "admin.plugins.tool.bots.description":
    "Un assistente può chiamare questo strumento solo finché il suo interruttore è attivo. Disattivarlo vale dalla chiamata successiva.",
  "admin.plugins.tool.bots.empty":
    "Ancora nessun assistente. Creane uno per dargli questo strumento.",
  "admin.plugins.tool.hidden": "Nascosto dal tuo elenco.",
  "admin.plugins.tool.canCall":
    "Può chiamare questo strumento. Ogni chiamata viene comunque controllata rispetto ai limiti e registrata in Audit.",
  "admin.plugins.tool.noToken":
    "Consentito, ma questo assistente non ha un token di richiamo. Ogni chiamata viene rifiutata. Emettine uno nella sua pagina oppure imposta AGENT_TOOL_TOKEN.",
  "admin.plugins.tool.cantCall":
    "Non può chiamare questo strumento. L'assistente non lo vede mai.",
  "admin.plugins.tool.aria": "Lascia che {bot} chiami {tool}",
  "admin.plugins.bot.title": "Assistente",
  "admin.plugins.bot.notOn": "Nessuna app con quel nome è attiva.",
  "admin.plugins.bot.nothing": "Qui non c'è nulla da dare a un assistente.",
  "admin.plugins.bot.notBot.title": "Non è un assistente",
  "admin.plugins.bot.notBot.description":
    "Non esiste alcun assistente con quel nome.",
  "admin.plugins.bot.notBot.hint":
    "Potrebbe essere stato eliminato dopo che hai aperto questa pagina.",
  "admin.plugins.bot.noDesc": "Questa azione non ha una descrizione.",
  "admin.plugins.bot.destroys": "distrugge cose",
  "admin.plugins.bot.description":
    "Quali azioni di {app} può chiamare {bot}. Disattivarne una vale dalla chiamata successiva.",
  "admin.plugins.bot.pageTitle": "{bot} e {app}",
  "admin.plugins.bot.noActions":
    "{app} non elenca alcuna azione. Aggiorna i suoi strumenti per ricontrollare.",
  "admin.plugins.bot.searchAria": "Cerca tra le azioni di {app}",
  "admin.plugins.bot.searchPlaceholder": "Cerca per nome dell'azione",
  "admin.plugins.bot.wouldHold": {
    one: "Questo assistente avrebbe allora {count} strumento di questa app.",
    other: "Questo assistente avrebbe allora {count} strumenti di questa app.",
  },
  "admin.plugins.bot.turnOnReads": "Attiva ogni azione di sola lettura",
  "admin.plugins.bot.reads.title": "Letture",
  "admin.plugins.bot.reads.description":
    "Queste azioni si limitano a leggere. I limiti sulle scritture non valgono per loro.",
  "admin.plugins.bot.reads.noMatch":
    'Nessuna azione di sola lettura corrisponde a "{query}".',
  "admin.plugins.bot.reads.none": "{app} non ha azioni di sola lettura.",
  "admin.plugins.bot.writes.title": "Apporta modifiche",
  "admin.plugins.bot.writes.description":
    "Queste azioni modificano qualcosa presso il fornitore. I limiti sulle scritture valgono per loro.",
  "admin.plugins.bot.writes.noMatch":
    'Nessuna azione che apporta modifiche corrisponde a "{query}".',
  "admin.plugins.bot.writes.none":
    "{app} non ha azioni che apportano modifiche.",
  "admin.plugins.bot.shared.title":
    "Consentire a {bot} di usare l'account {app} condiviso?",
  "admin.plugins.bot.allowing": "Consento…",
  "admin.plugins.bot.allow": "Consenti",
  "admin.shared.sentence.write":
    "Chiunque possa usare questo assistente può farlo con l'account condiviso.",
  "admin.shared.sentence.read":
    "Chiunque possa usare questo assistente può leggere ciò che questo account può leggere.",
  "admin.shared.owner": "Solo il suo proprietario",
  "admin.shared.named": "Persone indicate: {who}",
  "admin.shared.team": "Tutti",
  "admin.shared.legend":
    "Chi può usare l'account condiviso tramite questo assistente",
  "admin.shared.outside":
    "I messaggi dall'esterno (email, Slack, webhook) possono usarlo",
  "admin.shared.skipped": {
    one: "Un'azione elencata da questa app è stata esclusa, perché il nome di uno strumento può usare solo lettere, cifre, trattini bassi e trattini: ",
    other:
      "{count} azioni elencate da questa app sono state escluse, perché il nome di uno strumento può usare solo lettere, cifre, trattini bassi e trattini: ",
  },
  "admin.vocab.browse": "Sfoglia {name}",
  "admin.vocab.dirDesc.composio":
    "Qualche centinaio di app. Ogni persona collega il proprio account.",
  "admin.vocab.dirDesc.arcade":
    "App che nessuno qui ha verificato. Ogni persona collega il proprio account.",
  "admin.vocab.readFailure":
    "Non è stato possibile caricare l'elenco delle app di {name}. Ricarica la pagina.",
  "admin.vocab.moreApps": "App di {name}. Nessuno qui le ha verificate.",
  "admin.vocab.notSetUp":
    "Non configurato. Imposta {envVar} su questa installazione per sfogliarne le app.",
  "admin.vocab.connection":
    "Raggiunta tramite {name}, che conserva l'account di ogni persona.",
  "admin.vocab.reach.description":
    "L'account è conservato da {name}. Questa installazione invia una chiave e chi sta chiedendo. Ogni persona collega il proprio e un assistente vede solo ciò che vede quella persona. Non c'è alcun token da incollare.",
  "admin.vocab.reach.badge": "Tramite {name}",
  "admin.vocab.disconnect": "Scollegare termina anche l'account presso {name}.",
  "admin.vocab.trip.stem":
    "{name} approva un'azione alla volta, quindi non c'è nulla da collegare per l'intera app.",
  "admin.vocab.trip.below": "Autorizza qui sotto le azioni che vuoi.",
  "admin.vocab.trip.settings": "Autorizzale da Connessioni.",
  "admin.vocab.keyMissing":
    "Imposta {envVar} su questa installazione. Finché non lo fai, questo account non può essere collegato né scollegato da qui. L'app resta attiva e le concessioni dei suoi strumenti restano valide.",
  "admin.vocab.siblings": {
    one: "Scollegare termina anche il tuo accesso a {names}, che condivide questa connessione.",
    other:
      "Scollegare termina anche il tuo accesso a {names}, che condividono questa connessione.",
  },
  "admin.vocab.unansweredMore": {
    one: "{count} altra app non ha potuto essere controllata e potrebbe essere interessata anch'essa.",
    other:
      "{count} altre app non hanno potuto essere controllate e potrebbero essere interessate anch'esse.",
  },
  "admin.vocab.unansweredOnly": {
    one: "{count} app su questa connessione non ha potuto essere controllata, quindi scollegare potrebbe terminare anche quella.",
    other:
      "{count} app su questa connessione non hanno potuto essere controllate, quindi scollegare potrebbe terminare anche quelle.",
  },
  "admin.vocab.join2": "{a} e {b}",
  "admin.vocab.joinMany": "{list} e {last}",
  "admin.skills.write": "Scrivi una skill",
  "admin.skills.description":
    "Istruzioni con un nome che chiunque può avviare con /. Una skill non aggiunge alcun accesso. Può solo chiedere a un Bot di usare ciò che ha già.",
  "admin.skills.installed.title": "Installate",
  "admin.skills.installed.description":
    "Per tutti in questa installazione. Ognuno scrive le proprie nella sua pagina Skill.",
  "admin.skills.loadError":
    "Non è stato possibile caricare le skill. Ricarica la pagina.",
  "admin.skills.empty":
    "Ancora nessuna skill. Scrivine una con Scrivi una skill.",
  "admin.skills.dlg.title": "Scrivi una skill per tutti",
  "admin.skills.dlg.description":
    "Le persone scrivono lo slug dopo /. Il Bot poi segue le istruzioni. Tutti possono usarla e tu scegli quali Bot ce l'hanno.",
  "admin.skills.slug": "Identificativo (slug)",
  "admin.skills.title": "Titolo",
  "admin.skills.summary": "Riepilogo",
  "admin.skills.summaryPlaceholder": "Una riga",
  "admin.skills.instructions": "Istruzioni",
  "admin.skills.instructionsPlaceholder":
    "Che cosa deve fare il Bot quando questa skill viene usata.",
  "admin.skills.install": "Installa la skill",
  // connections-begin
  "connections.connect": "Collega",
  "connections.reconnect": "Ricollega",
  "connections.connected": "Collegato",
  "connections.teamAccount": "Account del team",
  "connections.disconnect": "Scollega",
  "connections.disconnecting": "Scollego…",
  "connections.startFailed":
    "Non sono riuscito ad avviare il collegamento, quindi non è stato collegato nulla. Riprova, oppure chiedi a un amministratore se continua a succedere.",
  "connections.list.auth.no-broker":
    "Il collegamento delle app non è ancora configurato, quindi non è stato registrato nulla. Chiedi a un amministratore di configurarlo.",
  "connections.list.auth.not-supported":
    "Qui le app si collegano una volta sola, con Collega nella pagina dell'app. Non vengono autorizzate un'azione alla volta.",
  "connections.list.auth.missing-handle":
    "Quel link non dice quale autorizzazione completa, quindi non è stato fatto nulla. Ricomincia dalla pagina dell'app.",
  "connections.list.auth.no-attempt":
    "Non c'è nessuna autorizzazione in corso da completare. Potrebbe essere scaduta o iniziata in un'altra sessione. Ricomincia dalla pagina dell'app.",
  "connections.list.auth.vendor-unavailable":
    "L'app non ha risposto quando {product} ha provato a completare quell'autorizzazione, quindi non è stato registrato nulla. Riprova il link tra un attimo.",
  "connections.list.auth.not-your-authorization":
    "Quel link non corrisponde all'autorizzazione che hai in corso, quindi non è stato registrato nulla. Completala nella scheda in cui l'hai avviata, oppure ricomincia dalla pagina dell'app.",
  "connections.list.auth.not-finished":
    "Quell'autorizzazione non è ancora terminata, quindi non è stato registrato nulla. Completala nell'app, poi apri di nuovo il link.",
  "connections.list.auth.authorization-failed":
    "L'app non ha completato quell'autorizzazione, quindi non è stato registrato nulla. Ricomincia dalla pagina dell'app.",
  "connections.list.auth.context-changed":
    "L'account di quell'app è cambiato mentre l'autorizzazione era aperta, quindi non è stato registrato nulla. L'accesso dato al vecchio account è stato rimosso. Ricomincia dalla pagina dell'app.",
  "connections.list.auth.not-permitted":
    "Non puoi più collegare l'account di quell'app, quindi non è stato registrato nulla. Il tuo accesso o la configurazione dell'app sono cambiati mentre l'autorizzazione era aperta. Chiedi a un amministratore se ti aspettavi di completarla.",
  "connections.list.auth.cancelled":
    "Quell'autorizzazione è stata annullata mentre veniva completata, quindi non è stato registrato nulla. L'accesso che aveva dato è stato rimosso.",
  "connections.list.auth.cancelled-left-live":
    "Quell'autorizzazione è stata annullata mentre veniva completata, quindi non è stato registrato nulla. L'accesso che aveva dato non si è potuto rimuovere, quindi l'app potrebbe ancora consentire l'azione che hai annullato. Per rimuoverlo, scollega l'app dalla sua pagina, poi collegala di nuovo e autorizza solo ciò che vuoi.",
  "connections.list.auth.not-recorded":
    "Non sono riuscito a registrare quell'autorizzazione, quindi non è stato salvato nulla. Ricomincia dalla pagina dell'app, oppure chiedi a un amministratore se continua a succedere.",
  "connections.list.description":
    "Le app e gli account che i tuoi Bot usano come te. Aprine uno per collegarlo o cambiarlo.",
  "connections.list.connectFailed":
    "Non sono riuscito a collegare quell'account. Non è stato salvato nulla. Riprova.",
  "connections.list.title": "Le tue connessioni",
  "connections.list.loading": "Caricamento delle connessioni…",
  "connections.list.loadError":
    "Non sono riuscito a caricare le tue connessioni. Ricarica la pagina, oppure chiedi a un amministratore se continua a succedere.",
  "connections.list.empty":
    "Ancora niente da collegare. Le app compaiono qui quando un amministratore le attiva.",
  "connections.list.count": "{inUse} in uso · {total} in tutto",
  "connections.list.search": "Cerca connessioni",
  "connections.list.noMatch": "Nessun risultato per “{query}”.",
  "connections.list.linksError":
    "Non sono riuscito a caricare GitHub e Slack, quindi non sono nell'elenco. Ricarica la pagina.",
  "connections.list.connectNamed": "Collega {title}",
  "connections.list.reconnectNamed": "Ricollega {title}",
  "connections.app.landed": "Hai appena autorizzato {action}.",
  "connections.app.pendingTitle": "L'account",
  "connections.app.loadError":
    "Non sono riuscito a caricare questa connessione. Ricarica la pagina, oppure chiedi a un amministratore se continua a succedere.",
  "connections.app.appLoadError":
    "Non sono riuscito a caricare questa app. Ricarica la pagina, oppure chiedi a un amministratore se continua a succedere.",
  "connections.app.notSetUp":
    "{title} non è ancora configurato. Un amministratore deve attivarlo prima che qualcuno possa collegarlo.",
  "connections.app.sharedDesc":
    "Condiviso dalla tua organizzazione. I Bot agiscono come l'account del team.",
  "connections.app.brokeredDesc":
    "I Bot lo usano come te e vedono solo ciò che vedi tu.",
  "connections.app.reassurance": "Nessun Bot può usarlo come te.",
  "connections.app.tripPerAction": "Autorizza qui sotto le azioni che vuoi.",
  "connections.app.tripConnect":
    "Collegando, vai su {title} per approvare l'accesso.",
  "connections.app.connectedDesc":
    "I Bot che autorizzi usano il tuo {title} come te. Scollegando, il loro accesso viene rimosso ovunque.",
  "connections.app.notYours": "Questa app non la colleghi tu.",
  "connections.app.oneShared":
    "I Bot usano un solo account condiviso per questa app, lo stesso per tutti.",
  "connections.app.noApp": "{product} non ha nessuna app con questo nome.",
  "connections.app.yourAccount": "Il tuo account",
  "connections.app.notAvailable":
    "Non ancora disponibile. Prima un amministratore deve attivarla.",
  "connections.app.connectedAsYou":
    "I Bot che autorizzi lo usano come te e vedono solo ciò che vedi tu.",
  "connections.app.notConnected":
    "Nessun Bot può usarlo come te. Collegando, vai su {vendor} per approvare l'accesso.",
  "connections.app.disconnectedDone":
    "Scollegato. {product} non può più usare il tuo account {vendor}.",
  "connections.app.disconnectedUnconfirmed":
    "Scollegato qui. {vendor} non l'ha confermato, quindi rimuovi anche {product} nelle impostazioni di accesso di terze parti del tuo account {vendor}.",
  "connections.app.accessDesc":
    "Ciò che hai consentito, come l'ha registrato {vendor}. Può essere meno di quanto {product} ha chiesto.",
  "connections.app.access": "Accesso",
  "connections.app.allowed": "Consentito",
  "connections.app.vendorDidntSay": "{vendor} non l'ha detto.",
  "connections.identity.toolsDesc":
    "Permette ai tuoi Bot di leggere e modificare i tuoi repository come te. Lo colleghi separatamente dal tuo account qui sopra.",
  "connections.identity.tools": "Strumenti",
  "connections.identity.githubTools": "Strumenti GitHub",
  "connections.identity.notConnected": "Non collegato",
  "connections.mail.neverRun": "Non è ancora stata eseguita.",
  "connections.mail.lastRun": {
    one: "Ultima esecuzione {when}: {count} messaggio. {total} in tutto.",
    other: "Ultima esecuzione {when}: {count} messaggi. {total} in tutto.",
  },
  "connections.mail.on": "Attiva. {activity}",
  "connections.mail.off": "Disattivata",
  "connections.mail.switchOff": "Disattiva",
  "connections.mail.switchOn": "Attiva",
  "connections.mail.delete": "Elimina",
  "connections.mail.lastProblem": "Ultimo problema: {error}",
  "connections.mail.description":
    "Regole permanenti che hai chiesto in chat. I tuoi Bot le tengono e le applicano alla posta nuova ogni pochi minuti; non sono filtri di Gmail. Eliminare una regola non annulla ciò che ha già fatto.",
  "connections.mail.title": "Regole della posta",
  "connections.mail.search": "Cerca nelle regole della posta",
  "connections.mail.statusLabel": "Stato della regola",
  "connections.mail.allStatuses": "Tutti gli stati",
  "connections.mail.optActive": "Attive",
  "connections.mail.optPaused": "In pausa",
  "connections.mail.active": "Attiva",
  "connections.mail.paused": "In pausa",
  "connections.mail.noMatch": "Nessuna regola corrisponde a questi filtri.",
  "connections.mail.paging": {
    one: "{from}–{to} di {count} regola",
    other: "{from}–{to} di {count} regole",
  },
  "connections.mail.previous": "Precedente",
  "connections.mail.next": "Successiva",
  "connections.secret.aMember": "Un membro",
  "connections.secret.doneMemberCal":
    "Collegato. {name} ora può leggere la tua posta e il tuo calendario come te.",
  "connections.secret.doneMember":
    "Collegato. {name} ora può leggere la tua posta come te.",
  "connections.secret.doneBotsCal":
    "Collegato. I Bot che autorizzi ora possono leggere la tua posta e il tuo calendario come te.",
  "connections.secret.doneBots":
    "Collegato. I Bot che autorizzi ora possono leggere la tua posta come te.",
  "connections.secret.notAvailable":
    "Non ancora disponibile. Prima un amministratore deve attivarla.",
  "connections.secret.statusError":
    "Non sono riuscito a caricare se l'hai già collegata. Ricarica la pagina, oppure chiedi a un amministratore se continua a succedere.",
  "connections.secret.yourAccount": "Il tuo account",
  "connections.secret.connectedCal":
    "Collegato come {address}. Anche il tuo calendario è collegato. I Bot che autorizzi la usano come te.",
  "connections.secret.connectedNoCal":
    "Collegato come {address}. Nessun calendario è collegato. I Bot che autorizzi la usano come te.",
  "connections.secret.notConnected":
    "Nessun Bot può usarla come te. Incolla qui sotto una password per le app per collegare il tuo Gmail.",
  "connections.secret.useDifferent": "Usa un'altra password per le app",
  "connections.secret.disconnected":
    "Scollegato. {product} non può più leggere la tua posta né il tuo calendario. Per essere sicuro che la password per le app smetta di funzionare, eliminala anche su {url}.",
  "connections.secret.formDesc":
    "Due passaggi su Google, poi incolla ciò che ti danno. Non viene salvato nulla se Gmail non lo accetta.",
  "connections.secret.connectTitle": "Collega",
  "connections.secret.memberWillUse": "{name} userà questa casella di posta.",
  "connections.secret.step1Lead":
    "Attiva la verifica in due passaggi per il tuo account Google, poi crea una password per le app su",
  "connections.secret.step1Tail":
    ". Chiamala {product} e copia le sedici lettere.",
  "connections.secret.step2Lead":
    "Per far vedere anche il calendario ai tuoi Bot: in Google Calendar apri le Impostazioni, scegli il tuo calendario e copia il suo",
  "connections.secret.step2Link": "Indirizzo segreto in formato iCal",
  "connections.secret.step2Tail": ". Questo passaggio è facoltativo.",
  "connections.secret.address": "Il tuo indirizzo Gmail",
  "connections.secret.password": "Password per le app",
  "connections.secret.passwordHint":
    "Le sedici lettere di Google, con o senza gli spazi. Non è la tua password abituale.",
  "connections.secret.calendar":
    "Indirizzo segreto del calendario (facoltativo)",
  "connections.secret.calendarHint":
    "Chiunque abbia questo indirizzo può leggere il tuo calendario, quindi viene custodito con la stessa cura della password.",
  "connections.secret.checking": "Controllo con Gmail…",
  "connections.secret.canDoTitle": "Cosa permette ai tuoi Bot di fare",
  "connections.secret.canDoDesc":
    "Una password per le app apre tutta la tua casella di posta, quindi vale la pena sapere cosa comporta.",
  "connections.secret.canDo":
    "I tuoi Bot possono cercare e leggere la tua posta e guardare il tuo calendario. Non possono eliminare, spostare o etichettare nulla. Una risposta parte solo dopo la tua approvazione, e solo verso persone già presenti nel messaggio. Puoi scollegare in qualsiasi momento ed eliminare la password per le app su Google quando vuoi.",
  "connections.mode.goesShared": "L'account condiviso verrà scollegato.",
  "connections.mode.goesNoShared": "Nessun account condiviso è collegato.",
  "connections.mode.goesPersonal": {
    one: "{count} account personale verrà scollegato.",
    other: "{count} account personali verranno scollegati.",
  },
  "connections.mode.makeShared": "Rendi {title} condiviso",
  "connections.mode.makePersonal": "Rendi {title} personale",
  "connections.mode.titleShared": "Condividere un solo account {title}?",
  "connections.mode.titlePersonal":
    "Dare a ciascuno il proprio account {title}?",
  "connections.mode.checking": "Controllo cosa cambierebbe…",
  "connections.mode.everyone":
    "Chiunque usi un Bot con questa app agirà come questo unico account.",
  "connections.cancel": "Annulla",
  "connections.dir.description":
    "La directory di app di {name}. Aggiungi un'app per rendere i suoi strumenti disponibili ai Bot. Ogni persona collega comunque il proprio account prima che legga qualsiasi cosa.",
  "connections.dir.appsTitle": "App",
  "connections.dir.appsDesc":
    "Cerca per nome. Nessuno qui ha controllato queste app.",
  "connections.dir.searchAria": "Cerca nelle app di {name}",
  "connections.dir.searchPlaceholder": "Cerca per nome dell'app",
  "connections.dir.noMatch": 'Nessuna app di {name} corrisponde a "{query}".',
  "connections.dir.none": "{name} non ha restituito nessuna app.",
  "connections.dir.actions": {
    one: "{count} azione",
    other: "{count} azioni",
  },
  "connections.dir.added": "Aggiunta",
  "connections.dir.adding": "Aggiungo…",
  "connections.dir.add": "Aggiungi",
  "connections.grants.consentFailed":
    "{product} ha risposto senza un link di consenso, quindi non è stato autorizzato nulla. Riprova, oppure chiedi a un amministratore se continua a succedere.",
  "connections.grants.title": "Azioni",
  "connections.grants.readError":
    "Non riesco a leggere cosa consente questo account in questo momento.",
  "connections.grants.retry": "Riprova",
  "connections.grants.description":
    "Raggruppate per il permesso che ogni azione richiede. Corrisponde a ciò che mostra la schermata di consenso.",
  "connections.grants.search": "Cerca azioni",
  "connections.grants.wholeApp": "Tutto in questa app, approvato insieme",
  "connections.grants.noPermission": "Non chiede nessun permesso proprio",
  "connections.grants.needs": "Richiede {scopes}",
  "connections.grants.authorize": "Autorizza",
  "connections.grants.hidden": {
    one: "{count} altra azione non ancora autorizzata. Cerca per trovarla.",
    other:
      "{count} altre azioni non ancora autorizzate. Cerca per trovarne una.",
  },
  "connections.grants.noMatch": "Nessuna azione corrisponde a questa ricerca.",
  "connections.grants.before": "Prima di autorizzare {action}",
  "connections.grants.continue": "Continua al consenso",
  "connections.grants.notRequired": "Non richiede autorizzazione.",
  "connections.grants.authorized": "Autorizzata.",
  "connections.grants.notYet": "Non ancora autorizzata.",
  "connections.grants.notYetAdmin":
    "Non ancora autorizzata. Un amministratore può autorizzarla.",
  "connections.grants.missing":
    "Manca {missing}. Un amministratore deve impostarlo. Autorizzare non lo risolve.",
  "connections.grants.missingSetting":
    "Manca un'impostazione. Un amministratore deve impostarla. Autorizzare non la risolve.",
  "connections.grants.unknown":
    "Non sono riuscito a leggere questa azione in questo momento. {reason}",
  "connections.row.connectKey":
    "Questa app si collega con una chiave, non con una pagina di accesso, quindi non è stato collegato nulla. Ricarica la pagina e premi di nuovo Collega.",
  "connections.row.noAuth":
    "{title} non ha bisogno di un account. I Bot che ce l'hanno possono usarla così com'è.",
  "connections.row.verified":
    "Collegato con la tua chiave. Ultimo controllo: {date}.",
  "connections.row.failedCheck":
    "La tua chiave non ha superato un controllo con {title}. Potrebbe essere la chiave, oppure {title} stesso. Il tuo account è ancora collegato. Premi Ricontrolla per riprovare, oppure scollega e collega con una nuova chiave.",
  "connections.row.noSafeCheck":
    "Collegato con la tua chiave. Non è stata controllata con {title}. In quel momento {title} non aveva un modo sicuro per controllare una chiave. Riguarda l'app, non la tua chiave.",
  "connections.row.unchecked":
    "Collegato con la tua chiave. Non è stata controllata con {title}.",
  "connections.row.keyStillWorks":
    "Scollegato. La tua chiave funziona ancora su {title}. Cambiala lì per interrompere ogni accesso.",
  "connections.row.asksForKey":
    "{title} si collega con una chiave che hai già. Il pulsante Collega te la chiede.",
  "connections.row.signedIn": "Accesso eseguito con {title}. {description}",
  "connections.row.yourAccount": "Il tuo account",
  "connections.row.keyMissing": "Chiave mancante",
  "connections.row.recheck": "Ricontrolla",
  "connections.row.rechecking": "Controllo…",
  "connections.row.perAction": "Approvato per azione",
  "connections.row.connectYour": "Collega il tuo account",
  "connections.row.checkingNeeds": "Controllo di cosa ha bisogno l'app…",
  "connections.row.noNeeds":
    "Non sono riuscito a scoprire di cosa ha bisogno questa app. Chiudi e riprova.",
  // connections-end
};
