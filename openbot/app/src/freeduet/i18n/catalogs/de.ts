import type { Catalog } from "../translate";
import type { EN } from "./en";

/*
 * German: "du", the form the site's German pages use for the reader. The site's German words are
 * "Assistent" for a Bot and "Mitglied" for a member, and "Engine" and "Full access" stay in English there.
 * Not yet checked by a person who reads German.
 */
export const de: Catalog<typeof EN> = {
  "sign.title": "Bei {product} anmelden",
  "sign.continueWith": "Weiter mit {provider}",
  "sign.opening": "{provider} wird geöffnet…",
  "sign.openError":
    "Die Anmeldung mit {provider} konnte nicht geöffnet werden. Versuch es erneut.",
  "sign.ssoRequired":
    "Deine Organisation verlangt, dass du dich mit deinem Firmenkonto anmeldest.",
  "sign.pairLead":
    "Dieser Browser ist noch nicht mit {product} gekoppelt. Führe auf dem Computer, auf dem die App läuft,",
  "sign.pairTail": " aus: {product} öffnet sich hier, einsatzbereit.",
  "sign.notSetUp":
    "Die Anmeldung ist noch nicht eingerichtet. Ein Administrator muss sie zuerst einrichten.",
  "sign.or": "oder",
  "sign.emailPlaceholder": "du@firma.com",
  "sign.openingCompany": "Wird geöffnet…",
  "sign.continueCompany": "Weiter mit deinem Firmenkonto",
  "sign.adminSignIn": "Administrator-Anmeldung",
  "sign.noCompany": "Für diese Adresse ist keine Firmenanmeldung eingerichtet.",
  "shell.menu": "Menü",
  "shell.everything": "Alles",
  "shell.everythingLine": "Der gesamte Chat-Kontext aus allen Kanälen",
  "shell.channelsError":
    "Deine Kanäle konnten nicht geladen werden. Lade die Seite neu.",
  "shell.channels": "Kanäle",
  "shell.newChannel": "Neuer Kanal",
  "shell.archived": "Archiviert",
  "shell.archivedChannels": "Archivierte Kanäle",
  "shell.unarchive": "Wiederherstellen",
  "shell.unarchiveNamed": "{name} wiederherstellen",
  "shell.earlier": "Frühere Unterhaltungen",
  "shell.manage": "Verwalten",
  "shell.signOut": "Abmelden",
  "nav.bots": "Assistenten",
  "nav.connections": "Verbindungen",
  "nav.capabilities": "Fähigkeiten",
  "nav.routines": "Routinen",
  "nav.approvalRules": "Genehmigungsregeln",
  "nav.admin": "Verwaltung",
  "nav.dashboard": "Dashboard",
  "nav.settings": "Einstellungen",
  "tab.main": "Start",
  "tab.chat": "Chat",
  "tab.tasks": "Aufgaben",
  "tab.make": "Erstellen",
  "tab.waiting": "{tab}, {badge} ausstehend",
  "header.chat": "{product}-Chat",
  "header.settings": "Deine Einstellungen",
  "header.back": "Zurück",
  "header.more": "Mehr",
  "composer.ask": "Frag, was du brauchst",
  "composer.message": "Nachricht",
  "composer.queue": "Nachricht einreihen",
  "composer.send": "Nachricht senden",
  "composer.stop": "Den Assistenten stoppen",
  "composer.showCall": "Sprachanruf anzeigen",
  "composer.startCall": "Sprachanruf starten",
  "composer.callBot": "Diesen Assistenten anrufen",
  "composer.callUnsupported":
    "Sprachanrufe brauchen ein Mikrofon und eine sichere Verbindung (HTTPS)",
  "composer.speak": "Per Sprache diktieren",
  "composer.dictateTitle": "Sag alles, was du erledigen musst",
  "composer.attach": "Datei anhängen",
  "composer.moreUnavailable":
    "Weitere Nachrichtenoptionen sind nicht verfügbar",
  "composer.messageNamed": "Nachricht an {name}",
  "chat.botsError":
    "Deine Assistenten konnten nicht geladen werden. Lade die Seite neu.",
  "chat.noBots": "Es gibt noch keine Assistenten.",
  "chat.conversationError":
    "Deine Unterhaltung konnte nicht geladen werden. Lade die Seite neu.",
  "chat.stillStarting":
    "Die Unterhaltung startet noch. Versuch es gleich noch einmal.",
  "chat.startError":
    "Die Unterhaltung konnte nicht gestartet werden. Versuch es noch einmal.",
  "attention.questions": { one: "{count} Frage", other: "{count} Fragen" },
  "attention.approvals": {
    one: "{count} Genehmigung",
    other: "{count} Genehmigungen",
  },
  "attention.handoffs": {
    one: "{count} steckengebliebene Übergabe",
    other: "{count} steckengebliebene Übergaben",
  },
  "attention.unread": {
    one: "{count} ungelesene Unterhaltung",
    other: "{count} ungelesene Unterhaltungen",
  },
  "attention.needYou": {
    one: "{count} Sache braucht dich",
    other: "{count} Sachen brauchen dich",
  },
  "attention.open":
    "{summary}. Öffne die Assistenten, um dich darum zu kümmern.",
  "attention.unreadMessages": "Ungelesene Nachrichten",
  "bots.new": "Neuer Assistent",
  "bots.purpose":
    "Deine Assistenten und die, die mit dir geteilt wurden. Sieh, was jeder gerade tut und was er von dir braucht.",
  "bots.loadError":
    "Deine Assistenten konnten nicht geladen werden. Lade die Seite neu.",
  "bots.needsYou": "Braucht dich",
  "bots.pinned": "Angeheftet",
  "bots.yours": "Deine",
  "bots.shared": "Mit dir geteilt",
  "bots.allPinned": "Alle deine Assistenten sind oben angeheftet.",
  "bots.allNeedYou": "Alle deine Assistenten stehen unter „Braucht dich“.",
  "bots.none":
    "Du hast noch keine Assistenten. Lege mit „Neuer Assistent“ einen an.",
  "bots.nobodyShared": "Noch hat niemand einen Assistenten mit dir geteilt.",
  "bots.hide": "Ausblenden",
  "bots.show": "Einblenden",
  "bots.hidden": "Ausgeblendet",
  "bots.hiddenDescription": {
    one: "{count} Assistent, den du ausgeblendet hast. Nur deine Liste ändert sich.",
    other:
      "{count} Assistenten, die du ausgeblendet hast. Nur deine Liste ändert sich.",
  },
  "bots.paused": "Pausiert",
  "bots.message": "Schreiben",
  "bots.wroteIn": {
    one: "{name} hat in {count} Unterhaltung geschrieben, die du nicht gelesen hast.",
    other:
      "{name} hat in {count} Unterhaltungen geschrieben, die du nicht gelesen hast.",
  },
  "bots.readNewest": "Neueste lesen",
  "bots.resuming": "Wird fortgesetzt…",
  "bots.pausedResume": "Pausiert. Fortsetzen",
  "botPage.purpose":
    "Was dieser Assistent für dich tut und wie er eingerichtet ist.",
  "botPage.fallbackTitle": "Assistent",
  "botPage.openError":
    "Dieser Assistent konnte nicht geöffnet werden. Vielleicht ist er nicht mit dir geteilt.",
  "profile.forYou": "Für dich",
  "profile.settingsError":
    "Die Einstellungen dieses Assistenten konnten nicht geladen werden. Lade die Seite neu.",
  "profile.active": "Aktiv",
  "profile.pausedDescription":
    "Pausiert. Für dich läuft nichts, bis du ihn wieder einschaltest.",
  "profile.activeDescription":
    "Führt für dich Routinen, Zuständigkeiten, Übergaben und Nachfassen aus.",
  "profile.notifications": "Benachrichtigungen",
  "profile.notifyDescription":
    "{level}. Die Zähler in der Seitenleiste bleiben immer sichtbar.",
  "profile.notify.all": "Alles",
  "profile.notify.needsInput": "Nur, wenn er dich braucht",
  "profile.notify.none": "Nichts (nur Zähler)",
  "profile.browserNotifications": "Browser-Benachrichtigungen",
  "profile.browserOff":
    "In diesem Browser aus. Schalte sie ein, um zu hören, wann ein Assistent dich braucht.",
  "profile.turnOn": "Einschalten",
  "profile.startConversation": "Starte eine Unterhaltung.",
  "stalled.what": "{name} ist nicht fertig geworden: {task}",
  "stalled.why": "Grund: {reason}.",
  "stalled.retryError":
    "Der neue Versuch hat nicht geklappt. Vielleicht läuft es schon.",
  "stalled.dismissError":
    "Es konnte nicht verworfen werden. Vielleicht läuft es schon.",
  "stalled.dismissing": "Wird verworfen…",
  "stalled.dismissed": "Verworfen",
  "stalled.dismiss": "Verwerfen",
  "stalled.retrying": "Wird erneut versucht…",
  "stalled.queued": "Erneut eingereiht",
  "stalled.retry": "Erneut versuchen",
  "stalled.open": "Unterhaltung öffnen",
  "dash.title": "Dashboard",
  "dash.notAvailable": "Noch nicht verfügbar",
  "dash.tokensNotCounted": "Heute wurde noch kein Durchgang gezählt.",
  "dash.countsUnavailable": "Die Token-Zählungen sind gerade nicht verfügbar.",
  "dash.enginesLink": "Engines verwalten",
  "dash.teamLink": "Alle Mitglieder",
  "dash.waitingForYou": "Wartet auf dich",
  "dash.available": "Verfügbar",
  "dash.loading": "Dein Team wird geladen…",
  "dash.nothingWaits": "Nichts wartet auf dich.",
  "dash.thingsWait": {
    one: "{count} Sache wartet auf dich.",
    other: "{count} Sachen warten auf dich.",
  },
  "dash.partialCount":
    "{reported} von {turns} Versuchen haben eine Zahl gemeldet",
  "dash.inputPlusOutput":
    "Eingabe plus Ausgabe, so wie jede Engine sie gemeldet hat",
  "dash.nothingSaved": "Heute lief noch nichts über eine kostenlose Engine",
  "dash.firstFor": {
    one: "zuerst für {count} Mitglied",
    other: "zuerst für {count} Mitglieder",
  },
  "dash.members": { one: "{count} Mitglied", other: "{count} Mitglieder" },
  "dash.indicators": "Kennzahlen",
  "dash.tokensToday": "Token heute",
  "dash.savedToday": "Heute mit kostenlosen Engines gespart",
  "dash.waitingSub": "Fragen, Genehmigungen und steckengebliebene Übergaben",
  "dash.nextRoutine": "Nächste Routine",
  "dash.noRoutine": "Keine Routine ist geplant.",
  "dash.team": "Team",
  "dash.engines": "Engines",
  "dash.noEngine": "Noch ist keine Engine eingerichtet.",
  "dash.perMemberAria": "Token pro Mitglied",
  "dash.perMember": "Token pro Mitglied, heute",
  "dash.foot":
    "Die Zahlen sind das, was jede Engine gemeldet hat, nach UTC-Tagen. Ein Protokoll der letzten Aktivitäten und eine Anzeige für das Limit deines Tarifs gibt es noch nicht.",
  "voice.heardNothing":
    "Ich habe nichts gehört. Tippe aufs Mikrofon, um es noch einmal zu versuchen, oder schreibe.",
  "voice.tapWhenDone": "Tippe aufs Mikrofon, wenn du fertig bist",
  "voice.discard": "Verwerfen",
  "voice.start": "Diktat starten",
  "voice.stopAndSend": "Diktat beenden und senden",
  "voice.typeInstead": "Stattdessen tippen",
  "voice.retry": "Erneut versuchen",
  "voice.recordAgain": "Noch einmal aufnehmen",
  "voice.writing": "Ich schreibe auf, was du gesagt hast…",
  "voice.listeningStop": "Ich höre zu… Ich höre auf, wenn du eine Pause machst",
  "voice.listening": "Ich höre zu, sprich einfach los",
  "voice.permission": "Warte auf die Erlaubnis für das Mikrofon…",
  "voice.widget.unavailable": "",
  "voice.widget.connecting": "",
  "voice.widget.speaking": "",
  "voice.widget.working": "",
  "voice.widget.muted": "",
  "voice.widget.listening": "",
  "voice.widget.ready": "",
  "voice.widget.label": "",
  "voice.widget.duration": "",
  "voice.widget.expand": "",
  "voice.widget.expandTitle": "",
  "voice.widget.end": "",
  "voice.widget.endTitle": "",
  "voice.widget.returnChat": "",
  "voice.widget.returnChatTitle": "",
  "voice.widget.settings": "",
  "voice.widget.captions": "",
  "voice.widget.captionsEmpty": "",
  "voice.widget.you": "",
  "voice.widget.youMuted": "",
  "voice.widget.youNamed": "",
  "voice.widget.mute": "",
  "voice.widget.unmute": "",
  "voice.widget.muteTitle": "",
  "voice.session.slow": "",
  "voice.session.timeLimit": "",
  "voice.session.muteFailed": "",
  "voice.session.lost": "",
  "voice.session.startFailed": "",
  "voice.session.transcriptLimit": "",
  "voice.session.responseFailed": "",
  "voice.session.serviceError": "",
  "voice.webrtc.unsupported": "",
  "voice.webrtc.playback": "",
  "voice.webrtc.lost": "",
  "voice.webrtc.micGone": "",
  "voice.webrtc.channelFailed": "",
  "voice.webrtc.ended": "",
  "voice.webrtc.unreadable": "",
  "voice.webrtc.connectFailed": "",
  "voice.webrtc.invalid": "",
  "voice.webrtc.notConnected": "",
  "voice.websocket.audio": "",
  "voice.websocket.config": "",
  "voice.websocket.address": "",
  "voice.websocket.startFailed": "",
  "voice.websocket.connect": "",
  "voice.websocket.closed": "",
  "voice.websocket.notConnected": "",
  "voice.websocket.invalid": "",
  "voice.websocket.slow": "",
  "voice.websocket.micGone": "",
  "voice.connection.unsupported": "",
  "voice.connection.unavailable": "",
  "voice.connection.transport": "",
  "dictation.controls.dictate": "",
  "dictation.controls.cancel": "",
  "dictation.controls.transcribing": "",
  "dictation.controls.listening": "",
  "dictation.controls.duration": "",
  "dictation.controls.stop": "",
  "dictation.controls.stopTitle": "",
  "dictation.controls.send": "",
  "dictation.recording.secure": "",
  "dictation.recording.noRecorder": "",
  "dictation.recording.noFormat": "",
  "dictation.recording.tooLarge": "",
  "dictation.recording.stopped": "",
  "dictation.recording.interrupted": "",
  "dictation.recording.empty": "",
  "dictation.recording.noSpeech": "",
  "dictation.recording.failed": "",
  "dictation.session.denied": "",
  "dictation.session.startFailed": "",
  "dictation.session.finishFailed": "",
  "dictation.session.transcribeFailed": "",
  "home.bots": "Lerne dein Team kennen und verwalte jeden Assistenten.",
  "home.capabilities": "Fähigkeiten und Gedächtnis.",
  "home.connectionsLabel": "Konten, Apps und Postfachregeln",
  "home.connections": "Verbinde ein Konto, eine App oder dein Postfach.",
  "home.setupLabel": "Einrichtungs-Checkliste",
  "home.setup": "Sieh, was eingerichtet ist und was noch fehlt.",
  "home.approvalsLabel": "Genehmigungsregeln und Full access",
  "home.approvals": "Was ein Assistent tun darf, ohne dich zu fragen.",
  "home.passwordsLabel": "Passwörter",
  "home.passwords": "Passwörter, die dein Team verwenden darf.",
  "home.routines":
    "Arbeit, die sich von selbst wiederholt, und die Wochenansicht.",
  "home.notifications": "Wo Neuigkeiten dich erreichen.",
  "home.admin": "Computer, Zugangsdaten, Grenzen, Personen und Protokoll.",
  "home.engines":
    "Wer für jeden Assistenten antwortet, in welcher Reihenfolge und wie viel heute verbraucht wurde. Dein Abo bleibt an erster Stelle, bis du die Reihenfolge änderst.",
  "home.safety": "Sicherheit",
  "home.jobs": "Jobs",
  "home.system": "System",
  "settings.description":
    "Verwalte dein Team, deine verbundenen Konten und deine persönlichen Vorlieben.",
  "settings.sections": "Abschnitte der Einstellungen",
  "settings.workspace": "Arbeitsbereich",
  "settings.preferences": "Vorlieben",
  "settings.devices": "Geräte & Infos",
  "settings.appearance": "Darstellung",
  "settings.matchPhone": "Wie auf dem Handy",
  "settings.light": "Hell",
  "settings.dark": "Dunkel",
  "settings.voice": "Stimme",
  "settings.shortcuts": "Tastenkürzel",
  "language.section": "Sprache",
  "language.title": "Sprache der App",
  "language.description":
    "Die Sprache der Menüs und Schaltflächen. Dein Team schreibt dir in der Sprache, die im Chat eingestellt ist.",
  "language.auto": "Automatisch (Browser)",
  "settings.descriptionPlain":
    "Wie {product} für dich aussieht und funktioniert.",
  "wide.yourTeam": "Dein Team",
  "wide.team": "Team",
  "wide.stateWaiting": "Wartet auf dich",
  "wide.stateWorking": "Arbeitet daran",
  "wide.memberLabel": "{name}, {line}",
  "chat.loadingConversation": "Diese Unterhaltung wird geladen",
  "chat.readAloud": "Vorlesen",
  "chat.stopReading": "Vorlesen beenden",
  "chat.thinking": "Denkt nach",
  "chat.queued": "Eingereiht",
  "chat.removeQueued": "Eingereihte Nachricht entfernen: {what}",
  "chat.remove": "Entfernen",
  "chat.routineRan": "Routine ausgeführt.",
  "chat.firstDayYes": "Klingt richtig",
  "chat.firstDayNo": "Da stimmt etwas nicht",
  "chat.tryingAgain": "Versucht es erneut.",
  "chat.responsibilityRan": "Zuständigkeit ausgeführt.",
  "chat.trigger": "Auslöser:",
  "chat.details": "Details",
  "chat.via": "über {source}",
  "chat.untitledFile": "Datei ohne Namen",
  "chat.attachment": "Anhang",
  "chat.attachmentLower": "Anhang",
  "chat.attachmentNamed": "Anhang: {name}",
  "chat.unavailableNamed": "{name} ist nicht verfügbar.",
  "chat.unavailable": "Dieser Anhang ist nicht verfügbar.",
  "chat.openNamed": "{name} öffnen",
  "chat.close": "Schließen",
  "chat.generatedInterface": "Die von diesem Assistenten erstellte Oberfläche",
  "chat.usedBrowser": "Browser verwendet",
  "chat.hostAndMore": "{host} und {amount} weitere",
  "chat.searchedWeb": "im Web gesucht",
  "chat.readPages": {
    one: "{amount} Seite gelesen",
    other: "{amount} Seiten gelesen",
  },
  "chat.browsedPages": {
    one: "{amount} Seite besucht",
    other: "{amount} Seiten besucht",
  },
  "chat.usedBrowserPhrase": "den Browser verwendet",
  "chat.usedNamed": "{name} verwendet",
  "chat.usedConnectors": {
    one: "{amount} Verbindung verwendet",
    other: "{amount} Verbindungen verwendet",
  },
  "chat.usedTools": {
    one: "{amount} Werkzeug verwendet",
    other: "{amount} Werkzeuge verwendet",
  },
  "chat.andJoin": "{head} und {last}",
  "chat.inProgress": "In Arbeit",
  "chat.waitingForYou": "Wartet auf dich",
  "chat.notCompleted": "Nicht abgeschlossen",
  "chat.blocked": "Blockiert",
  "chat.didntWork": "Hat nicht funktioniert",
  "chat.couldntFinishStep": "Dieser Schritt konnte nicht abgeschlossen werden.",
  "chat.issues": {
    one: "{amount} Problem",
    other: "{amount} Probleme",
  },
  "settings.addRepository": "Repository hinzufügen",
  "settings.approvals": "Genehmigungen",
  "settings.appsSharedBots": "Apps, die geteilte Assistenten nutzen dürfen",
  "settings.backToApp": "Zurück zur App",
  "settings.cancel": "Abbrechen",
  "settings.cannotMakeCode":
    "Einen Code erstellt der Browser, der am Computer gekoppelt ist. Dieser hier kann keinen erstellen.",
  "settings.cantLink":
    "Du kannst noch kein {provider}-Konto verknüpfen. Ein Administrator muss das zuerst einrichten.",
  "settings.changesDescription":
    "Einstellungen, die ein Assistent im Chat geändert hat. „Rückgängig machen“ setzt den alten Wert sieben Tage lang zurück, und nur, solange die Einstellung noch den Wert hat, den die Änderung gesetzt hat.",
  "settings.changesEmpty": "Im Chat wurde noch nichts geändert.",
  "settings.changesLoading": "Änderungen werden geladen…",
  "settings.changesTitle": "Änderungen aus dem Chat",
  "settings.charactersOf": "{used} von {limit} Zeichen",
  "settings.checkLinkError":
    "Es konnte nicht geprüft werden, ob du dieses Konto verknüpfen kannst: {error}",
  "settings.code": "Code",
  "settings.codeExpires":
    "Der Code funktioniert nur einmal und läuft in 10 Minuten ab.",
  "settings.codeRanOut": "Dieser Code ist abgelaufen. Erstelle einen neuen.",
  "settings.componentsGallery": "Komponentengalerie",
  "settings.computer": "Computer",
  "settings.connect": "Verbinden",
  "settings.connectEvents": "Ereignisse verbinden",
  "settings.connectNamed": "{name} verbinden",
  "settings.copied": "Kopiert",
  "settings.copy": "Kopieren",
  "settings.copyFailed":
    "Konnte nicht kopieren. Markiere den Code und kopiere ihn selbst.",
  "settings.deliveriesEmpty": "Noch keine Zustellungen.",
  "settings.deliveriesTitle": "Letzte Zustellungen",
  "settings.deploymentOwn": "die Vorgabe der Installation",
  "settings.devicesDescription":
    "Melde dich in der App {product} auf deinem Handy an und schalte Benachrichtigungen ein, um es hier hinzuzufügen.",
  "settings.devicesEmpty": "Noch keine Geräte.",
  "settings.devicesTitle": "Deine Geräte",
  "settings.disconnect": "Trennen",
  "settings.disconnectError": "{name} konnte nicht getrennt werden: {error}",
  "settings.disconnectNamed": "{name} trennen",
  "settings.done": "Fertig",
  "settings.emphasisBot": "Name des Assistenten",
  "settings.emphasisConversation": "Titel der Unterhaltung",
  "settings.emphasisDescription":
    "Wähle, welche Zeile in der Seitenleiste hervorsticht.",
  "settings.emphasisPreview": "Vorschau der Nachrichtenliste",
  "settings.emphasisTitle": "Hervorhebung in der Nachrichtenliste",
  "settings.general": "Allgemein",
  "settings.githubConnectError":
    "GitHub konnte nicht verbunden werden: {error}",
  "settings.githubLinkFailed":
    "Dein GitHub-Konto konnte nicht verknüpft werden. Versuch es erneut.",
  "settings.githubLinked": "Dein GitHub-Konto ist verknüpft.",
  "settings.githubTaken":
    "Dieses GitHub-Konto ist in {product} mit einer anderen Person verknüpft. Melde dich bei GitHub mit einem anderen Konto an und versuch es erneut, oder frag einen Administrator.",
  "settings.kindDecision": "Entscheidungen",
  "settings.kindDecisionDescription":
    "Genehmigungen, die ein Assistent braucht, bevor er handelt.",
  "settings.kindProgress": "Fortschritt",
  "settings.kindProgressDescription":
    "Antworten und Ergebnisse aus Arbeit, die du nicht verfolgt hast.",
  "settings.kindQuestion": "Fragen",
  "settings.kindQuestionDescription":
    "Dinge, zu denen dich ein Assistent gefragt hat und auf die er wartet.",
  "settings.languageChanged":
    "Deine Sprache für das Team: vorher {from}, jetzt {to}.",
  "settings.lastSeen": "zuletzt gesehen {when}",
  "settings.levelAll": "alles",
  "settings.levelNeedsInput": "nur, wenn er dich braucht",
  "settings.linkBroughtCode":
    "Der Link hat einen Code mitgebracht. Gib diesem Browser einen Namen und tippe auf „Koppeln“.",
  "settings.linkSlack": "Dein Slack-Konto verknüpfen",
  "settings.linked": "Verknüpft",
  "settings.loadAccountError":
    "Dein Konto konnte nicht geladen werden: {error}",
  "settings.loading": "Wird geladen…",
  "settings.localAddress":
    "Diese Adresse funktioniert nur auf diesem Computer. Ein Handy braucht die Adresse, unter der FreeDuet von außen erreichbar ist; öffne sie auf dem Handy und gib den Code in den Einstellungen ein.",
  "settings.madeWhen": "erstellt {when}",
  "settings.makeCode": "Code erstellen",
  "settings.memberAdded": "{member} wurde deinem Team hinzugefügt.",
  "settings.name": "Name",
  "settings.nameChanged": "{bot}: dein Name für ihn vorher {from}, jetzt {to}.",
  "settings.nameOwn": "sein eigener Name",
  "settings.needsReconnect": "Muss neu verbunden werden",
  "settings.needsReconnectHandle": "Muss neu verbunden werden · @{handle}",
  "settings.noItalianVoice":
    "Auf diesem Computer gibt es keine lokale italienische Stimme, daher können Antworten hier nicht vorgelesen werden.",
  "settings.notLinked": "Nicht verknüpft",
  "settings.notSetUp": "Nicht eingerichtet",
  "settings.notifyChanged":
    "{bot}: Benachrichtigungen vorher {from}, jetzt {to}.",
  "settings.pairThisDescription":
    "Öffne auf dem Computer, auf dem FreeDuet läuft, die Einstellungen, tippe unter „Ein Handy oder einen anderen Browser koppeln“ auf „Code erstellen“ und öffne dann den Link, den er zeigt, oder gib hier den Code ein.",
  "settings.pairThisTitle": "Diesen Browser koppeln",
  "settings.pairedDescription":
    "Ein gekoppeltes Handy oder ein anderer Browser funktioniert wie dieser. Widerrufst du einen, wird er bei seiner nächsten Anfrage getrennt und abgemeldet.",
  "settings.pairedDone": "Dieser Browser ist mit dem Computer gekoppelt.",
  "settings.pairedTitle": "Ein Handy oder einen anderen Browser koppeln",
  "settings.phone": "Handy",
  "settings.phoneOrBrowser": "Handy oder anderer Browser",
  "settings.qrLabel": "QR-Code mit dem Kopplungslink",
  "settings.readAloudDescription":
    "Fügt unter jeder Antwort eines Assistenten eine Schaltfläche „Vorlesen“ hinzu. Dafür wird nur eine Stimme auf diesem Computer genutzt, und nichts wird anderswohin gesendet.",
  "settings.readAloudTitle": "Antworten vorlesen",
  "settings.rename": "Umbenennen",
  "settings.repositories": "Repositorys",
  "settings.repositoriesDescription":
    "Füge hier ein Repository hinzu und dann in GitHub einen Webhook mit der Adresse unten und demselben Geheimnis. Seine Ereignisse, etwa issues.opened, können dann eine Zuständigkeit starten.",
  "settings.repositoriesEmpty":
    "Noch keine Repositorys. Füge eins mit „Repository hinzufügen“ hinzu.",
  "settings.repository": "Repository",
  "settings.reset": "Zurücksetzen",
  "settings.resetDescription":
    "Vergisst jede Antwort, damit jeder geteilte Assistent erneut fragt.",
  "settings.resetDone": "Zurückgesetzt. Jeder geteilte Assistent fragt erneut.",
  "settings.revoke": "Widerrufen",
  "settings.routingDescription":
    "Wohin jede Art von Neuigkeit geht, wenn du weg bist. {product} im Web zeigt immer alles.",
  "settings.routingError":
    "Wohin deine Neuigkeiten gehen, konnte nicht geladen werden. Lade die Seite neu.",
  "settings.routingTitle": "Wohin Neuigkeiten gehen",
  "settings.runsOut":
    "Auf dem Handy, bei dir angemeldet: scanne das hier oder öffne den Link, oder öffne die Einstellungen und gib den Code ein. Er funktioniert nur einmal und läuft in {time} ab.",
  "settings.sameSecret":
    "Verwende dasselbe Geheimnis, wenn du den Webhook in GitHub hinzufügst.",
  "settings.sampleBot": "Allgemeiner Assistent",
  "settings.sampleTitle": "Nächste Woche planen",
  "settings.save": "Speichern",
  "settings.saved": "Gespeichert",
  "settings.saving": "Wird gespeichert…",
  "settings.setup": "Einrichtung",
  "settings.sharedBots": "Geteilte Assistenten",
  "settings.sharedBotsDescription":
    "Ein mit dir geteilter Assistent nutzt die Apps seines Besitzers. Deine Apps nutzt er nur dort, wo du in einer Unterhaltung Ja gesagt hast.",
  "settings.slackCodeError":
    "Der Slack-Code konnte nicht erstellt werden: {error}",
  "settings.standingDescription":
    "Gilt für jeden Assistenten in jeder Unterhaltung. Die Rolle eines Assistenten legt fest, was er tut. Hier steht, wie du es haben möchtest, zum Beispiel dein Schreibstil.",
  "settings.standingTitle": "Dauerhafte Anweisungen",
  "settings.switchLabel": "{kind} über {transport}",
  "settings.thisBrowserTag": "(dieser Browser)",
  "settings.toneChanged": "{bot}: Tonfall vorher {from}, jetzt {to}.",
  "settings.undo": "Rückgängig machen",
  "settings.undoFailed":
    "Die Änderung konnte nicht rückgängig gemacht werden. Versuch es erneut.",
  "settings.undoGone": "Rückgängigmachen ist nicht mehr möglich",
  "settings.undoing": "Wird rückgängig gemacht…",
  "settings.undone": "Rückgängig gemacht",
  "settings.webhookSecret": "Webhook-Geheimnis",
  "settings.yourAccount": "Dein Konto",
  "bot.activity.kindRoutine": "Routine",
  "bot.activity.kindResponsibility": "Zuständigkeit",
  "bot.activity.kindHandoff": "Delegierte Aufgabe",
  "bot.activity.kindApproval": "Genehmigung",
  "bot.activity.kindQuestion": "Frage",
  "bot.activity.kindFollowUp": "Nachfassen",
  "bot.activity.needsYou": "braucht dich",
  "bot.activity.stop": "Stoppen",
  "bot.activity.stopping": "Wird gestoppt…",
  "bot.activity.cancelling": "Wird abgebrochen…",
  "bot.activity.open": "Öffnen",
  "bot.activity.title": "Aktivität",
  "bot.activity.scheduled": "Geplant",
  "bot.activity.completed": "Abgeschlossen",
  "bot.activity.emptyInProgress": "Nichts läuft gerade oder wartet auf dich.",
  "bot.activity.emptyScheduled": "Nichts ist geplant.",
  "bot.activity.emptyCompleted": "Noch ist nichts fertig.",
  "bot.activity.loadError":
    "Die Aktivität dieses Assistenten konnte nicht geladen werden. Lade die Seite neu.",
  "bot.settings.heading": "Einstellungen für diesen Assistenten",
  "bot.area.responsibilities": "Zuständigkeiten",
  "bot.area.reaching": "Wie er dich erreicht",
  "bot.area.memory": "Gedächtnis",
  "bot.area.access": "Fähigkeiten und Zugriff",
  "bot.area.sharing": "Teilen",
  "bot.settings.activeCount": {
    one: "{count} aktiv",
    other: "{count} aktiv",
  },
  "bot.settings.noneActive": "Nichts aktiv",
  "bot.settings.ruleCount": {
    one: "{count} Regel",
    other: "{count} Regeln",
  },
  "bot.settings.noRules": "Keine Regeln",
  "bot.settings.routineCount": {
    one: "{count} Routine",
    other: "{count} Routinen",
  },
  "bot.settings.noRoutines": "Keine Routinen",
  "bot.access.skillsDescription":
    "Schalte eine Fähigkeit ein, um sie mit diesem Assistenten zu nutzen. Tippe / in einer Unterhaltung, um sie auszuführen.",
  "bot.access.yourSkills": "Deine Fähigkeiten",
  "bot.access.skillsError":
    "Deine Fähigkeiten konnten nicht geladen werden. Lade die Seite neu.",
  "bot.access.noSkills": "Noch keine Fähigkeiten.",
  "bot.access.writeOne": "Schreibe eine",
  "bot.access.title": "Was er nutzen kann",
  "bot.access.grantedDescription":
    "Die Apps und Fähigkeiten, die dieser Assistent nutzen kann, und ob jede App für dich bereit ist. Anderes kann er nicht nutzen.",
  "bot.access.grantedError":
    "Was dieser Assistent nutzen kann, konnte nicht geladen werden. Lade die Seite neu.",
  "bot.access.readyError":
    "Es konnte nicht geprüft werden, ob jede App für dich bereit ist. Lade die Seite neu.",
  "bot.access.noApps":
    "Noch keine Apps. Ein Administrator muss sie hinzufügen. Bis dahin kann dieser Assistent nur mit dir sprechen.",
  "bot.access.toolsAndMore": "{list} und {count} weitere",
  "bot.access.toolCount": {
    one: "{count} Werkzeug",
    other: "{count} Werkzeuge",
  },
  "bot.access.skillLabel": "Fähigkeit",
  "bot.access.manageNamed": "{title} für diesen Assistenten verwalten",
  "bot.reset.conversations": {
    one: "{count} Unterhaltung",
    other: "{count} Unterhaltungen",
  },
  "bot.reset.memorySources": {
    one: "{count} Gedächtnisquelle",
    other: "{count} Gedächtnisquellen",
  },
  "bot.reset.memories": {
    one: "{count} importierte Erinnerung",
    other: "{count} importierte Erinnerungen",
  },
  "bot.reset.routines": {
    one: "{count} Routine",
    other: "{count} Routinen",
  },
  "bot.reset.responsibilities": {
    one: "{count} Zuständigkeit",
    other: "{count} Zuständigkeiten",
  },
  "bot.reset.followUps": {
    one: "{count} geplante Nachfassaktion",
    other: "{count} geplante Nachfassaktionen",
  },
  "bot.reset.formedMemories": {
    one: "{count} Erinnerung, die er angelegt hat",
    other: "{count} Erinnerungen, die er angelegt hat",
  },
  "bot.reset.research": {
    one: "{count} Hintergrundrecherche",
    other: "{count} Hintergrundrecherchen",
  },
  "bot.reset.standing": {
    one: "{count} dauerhafte Erlaubnis",
    other: "{count} dauerhafte Erlaubnisse",
  },
  "bot.reset.title": "{name} zurücksetzen?",
  "bot.reset.description":
    "Das löscht, was {name} mit dir hat. Die Unterhaltungen und Daten anderer Leute bleiben. Das lässt sich nicht rückgängig machen.",
  "bot.reset.planError":
    "Es konnte nicht geprüft werden, was ein Zurücksetzen löschen würde. Versuch es erneut.",
  "bot.reset.done": "Fertig. {name} fängt bei dir neu an.",
  "bot.reset.nothing": "Es gibt nichts von dir zu löschen.",
  "bot.reset.willDelete": "Das wird gelöscht:",
  "bot.reset.sharedKept": {
    one: "{count} Unterhaltung ist mit anderen Personen oder Assistenten geteilt und bleibt erhalten.",
    other:
      "{count} Unterhaltungen sind mit anderen Personen oder Assistenten geteilt und bleiben erhalten.",
  },
  "bot.reset.memoriesKept":
    "Erinnerungen, die du einem Assistenten selbst erzählt hast, bleiben erhalten.",
  "bot.reset.resetting": "Wird zurückgesetzt…",
  "bot.reset.submit": "Löschen und zurücksetzen",
  "bot.manage.pinnedAssigned":
    "Ein Administrator hat ihn dir zugewiesen. Er bleibt oben in deiner Assistentenliste.",
  "bot.manage.pinnedOn":
    "Oben in deiner Assistentenliste. Nur deine Liste ändert sich.",
  "bot.manage.pinnedOff":
    "Oben in deiner Assistentenliste halten. Nur deine Liste ändert sich.",
  "bot.manage.hiddenAssigned":
    "Ein Administrator hat ihn dir zugewiesen. Du kannst ihn nicht ausblenden.",
  "bot.manage.hiddenOn":
    "Unter „Ausgeblendet“ in deiner Assistentenliste. Nur deine Liste ändert sich.",
  "bot.manage.hiddenOff":
    "Aus deiner Assistentenliste nehmen. Nur deine Liste ändert sich.",
  "bot.manage.duplicate": "Duplizieren",
  "bot.manage.duplicateDescription":
    "Erstellt deine eigene Kopie. Seine Unterhaltungen und Schlüssel werden nicht kopiert.",
  "bot.manage.resetDescription":
    "Löscht deine Unterhaltungen mit ihm, was er sich für dich merkt und seine geplante Arbeit. Vorher siehst du die Liste.",
  "bot.manage.delete": "Löschen",
  "bot.manage.deleteDescription":
    "Löscht ihn für alle. Das lässt sich nicht rückgängig machen.",
  "bot.manage.deleteTitle": "{name} löschen?",
  "bot.manage.deleteConfirm":
    "Er wird für alle gelöscht. Das lässt sich nicht rückgängig machen.",
  "bot.manage.deleting": "Wird gelöscht…",
  "bot.setup.title": "Titel",
  "bot.setup.whatItDoes": "Was er tut",
  "bot.setup.identity": "Identität",
  "bot.setup.systemOwned": "Vom System",
  "bot.setup.systemOwnedDescription":
    "Kommt mit {product}. Er gehört keiner Person.",
  "bot.setup.visibility": "Sichtbarkeit",
  "bot.setup.visiblePrivate":
    "Nur du kannst ihn sehen und Unterhaltungen mit ihm beginnen.",
  "bot.setup.visiblePublic": "Alle auf {product} können ihn finden und nutzen.",
  "bot.setup.private": "Privat",
  "bot.setup.public": "Öffentlich",
  "bot.setup.saveError": "Konnte nicht speichern. Versuch es erneut.",
  "bot.setup.checkField": "Prüfe dieses Feld und versuch es erneut.",
  "bot.setup.connection": "Verbindung",
  "bot.setup.builtIn": "Eingebaut",
  "bot.setup.agentUrl": "Agent-URL",
  "bot.setup.builtInDescription":
    "Läuft in {product}. Es gibt nichts zu verbinden.",
  "bot.sharing.published": "Veröffentlicht",
  "bot.sharing.toWholeTeam": "An das ganze Team",
  "bot.sharing.toPeople": "An {who}",
  "bot.sharing.groupNamed": "Gruppe {name}",
  "bot.sharing.teamPrivate":
    "Die Unterhaltungen jeder Person mit ihm sind privat.",
  "bot.sharing.notVisibleYet":
    "Teammitglieder können ihn erst sehen, wenn er einen richtigen Namen und eine Beschreibung hat.",
  "bot.sharing.unpublish": "Veröffentlichung zurückziehen",
  "bot.sharing.link": "Link",
  "bot.sharing.linkDescription": "Öffnet eine private Unterhaltung mit ihm.",
  "bot.sharing.copyLink": "Link kopieren",
  "bot.sharing.publicNotPublished":
    "Nicht an das Team veröffentlicht. Er ist öffentlich, also kann ihn schon jeder auf {product} nutzen.",
  "bot.sharing.onlyYouCanUse":
    "Nicht veröffentlicht. Nur du kannst ihn nutzen.",
  "bot.sharing.notPublished": "Nicht veröffentlicht.",
  "bot.sharing.whoPublishedTo": "Wem er veröffentlicht wird",
  "bot.sharing.publish": "Veröffentlichen",
  "bot.sharing.publishNote":
    "Veröffentlichen ändert seine Sichtbarkeit nicht. Die Veröffentlichung kannst du jederzeit zurückziehen.",
  "bot.sharing.audience": "Zielgruppe",
  "bot.sharing.notPublishedSummary": "Nicht veröffentlicht",
  "bot.sharing.theWholeTeam": "Das ganze Team",
  "bot.sharing.specificPeople": "Bestimmte Personen oder Gruppen",
  "bot.sharing.peopleCount": {
    one: "{count} Person",
    other: "{count} Personen",
  },
  "bot.sharing.groupCount": {
    one: "{count} Gruppe",
    other: "{count} Gruppen",
  },
  "bot.sharing.assignToGroups": "Gruppen zuweisen",
  "bot.sharing.assignDescription":
    "Hält diesen Assistenten oben in der Assistentenliste jedes Mitglieds der Gruppe. Mit * gilt es für das ganze Team.",
  "bot.sharing.publishedTo": "Veröffentlicht für",
  "bot.sharing.peopleByEmail": "Personen, per E-Mail",
  "bot.sharing.commaSeparated": "Durch Kommas getrennt",
  "bot.sharing.groups": "Gruppen",
  "bot.sharing.update": "Aktualisieren",
  "bot.sharing.publishToTeam": "Ans Team veröffentlichen",
  "bot.sharing.assignNamed": "{name} einer Gruppe zuweisen",
  "bot.sharing.assignNote":
    "Er ist oben in der Assistentenliste jedes Mitglieds angeheftet.",
  "bot.sharing.groupOrStar": "Gruppe oder *",
  "bot.sharing.wholeTeamPlaceholder": "* für das ganze Team",
  "bot.sharing.assign": "Zuweisen",
  "bot.sharing.removeNamed": "{name} entfernen",
  "bot.sharing.wholeTeam": "Ganzes Team",
  "bot.sharing.notAssigned": "Keiner Gruppe zugewiesen.",
  "bot.sharing.assignRow": "Einer Gruppe zuweisen",
  "bot.page.accessPurpose":
    "Die Fähigkeiten, Apps und anderen Assistenten, die dieser Assistent nutzen kann.",
  "bot.page.approvalsPurpose":
    "Was dieser Assistent tun darf, ohne dich vorher zu fragen.",
  "bot.page.memoryPurpose":
    "Die Apps, aus denen dieser Assistent lernt, und die Recherche, die er im Hintergrund für dich macht.",
  "bot.page.memoryPointer":
    "Was deine Assistenten sich über dich merken, steht unter",
  "bot.page.reachPurpose":
    "Setze eine Unterhaltung mit diesem Assistenten in Slack, Microsoft Teams oder per SMS fort.",
  "bot.page.responsibilitiesPurpose":
    "Laufende Ziele, an denen dieser Assistent für dich arbeitet. Sieh, was jeden Durchgang angestoßen hat und was er gefunden hat.",
  "bot.page.routinesPurpose":
    "Was dieser Assistent für dich nach einem Zeitplan tut. Schalte eine aus, starte sie jetzt oder lösche sie.",
  "bot.page.setupPurpose":
    "Wer dieser Assistent ist, wer ihn finden kann und wo er läuft.",
  "bot.page.sharingPurpose":
    "Wer sonst diesen Assistenten nutzen kann. Die Unterhaltungen jeder Person mit ihm sind privat.",
  // The Bot sub-pages' contents (D181 stage 2e): memory sources, suggestions, reaching you, responsibilities
  // and routines, the summaries of lib/agents/bot-summaries.ts and the time phrases of lib/relative-time.ts.
  // Shared words reuse their existing keys (`botPage.fallbackTitle` is "Bot"); `bot.choose` is "Choose a Bot".
  "bot.choose": "Wähle einen Assistenten",
  "memory.addSource": "Quelle hinzufügen",
  "memory.title": "App-Quellen",
  "memory.description":
    "Hier erscheinen die Apps, die du verbunden hast und die dieser Assistent lesen kann; du kannst weitere hinzufügen. Quellen werden alle 15 Minuten aktualisiert. Nur dieser Assistent sieht, was sie enthalten.",
  "memory.empty":
    "Noch keine Quellen. Füge eine mit „Quelle hinzufügen“ hinzu.",
  "memory.upToDate": "Auf dem neuesten Stand",
  "memory.off": "Ausgeschaltet",
  "memory.lastRead": "Zuletzt gelesen {when}",
  "memory.syncNow": "Jetzt synchronisieren",
  "memory.readNamed": "{name} lesen",
  "memory.addTitle": "Eine Quelle hinzufügen",
  "memory.addDescription":
    "{product} liest sie jetzt und danach alle 15 Minuten, solange sie aktiv ist.",
  "memory.enterNumber": "Gib eine Zahl für {name} ein.",
  "memory.cantShow":
    "Diese hat Einstellungen, die {product} nicht anzeigen kann. Wähle eine andere.",
  "memory.checkSettings": "Prüfe die Einstellungen der Quelle.",
  "memory.whatToRead": "Was gelesen werden soll",
  "memory.chooseWhat": "Wähle, was gelesen werden soll",
  "memory.sourceName": "Name der Quelle",
  "memory.chooseValue": "Wähle einen Wert",
  "memory.reading": "Quelle wird gelesen…",
  "memory.addAndSync": "Quelle hinzufügen und synchronisieren",
  "suggestions.everyHour": "Jede Stunde",
  "suggestions.every4Hours": "Alle 4 Stunden",
  "suggestions.twiceDay": "Zweimal am Tag",
  "suggestions.onceDay": "Einmal am Tag",
  "suggestions.everyMinutes": {
    one: "Alle {count} Minute",
    other: "Alle {count} Minuten",
  },
  "suggestions.yourBot": "Dein Assistent",
  "suggestions.title": "Vorgeschlagene nächste Schritte",
  "suggestions.from": "Von {app}",
  "suggestions.connectedApp": "eine verbundene App",
  "suggestions.openRecord": "Eintrag öffnen",
  "suggestions.startTask": "Als Aufgabe starten",
  "suggestions.empty":
    "Im Moment gibt es keine Vorschläge. Assistenten mit eingeschalteter Hintergrundrecherche schlagen hier nächste Schritte vor.",
  "suggestions.turnOnResearch": "Recherche einschalten",
  "suggestions.researchDescription":
    "Aus, bis du sie für diesen Assistenten einschaltest, es sei denn, dein Administrator hat sie für alle eingeschaltet. Wenn sie an ist, geht sie alle vier Stunden die Apps durch, die sie schon lesen kann, erstellt Erinnerungen, die du prüfen kannst, und schlägt nächste Schritte vor. Sie kann nur lesen: Sie kann keine Nachrichten senden, nichts in einer App ändern und keinen Browser und keinen Computer benutzen. Schaltest du sie aus oder entfernst sie, bleibt es dabei.",
  "suggestions.researchTitle": "Hintergrundrecherche",
  "suggestions.researchOff": "Die Hintergrundrecherche ist ausgeschaltet.",
  "suggestions.turnOnDialog": "Hintergrundrecherche einschalten",
  "suggestions.turnOnDescription":
    "Sie liest nach einem Zeitplan und liefert ihre Vorschläge in einem Kanal ab, in dem sie ist.",
  "suggestions.deliverTo": "Vorschläge zustellen an",
  "suggestions.chooseChannel": "Wähle einen Kanal",
  "suggestions.howOften": "Wie oft",
  "suggestions.focus": "Wonach suchen (optional)",
  "suggestions.off": "Aus",
  "suggestions.researchingNow": "Recherchiert gerade",
  "suggestions.lastRan": "Zuletzt ausgeführt {when}",
  "suggestions.turnOff": "Ausschalten",
  "reaching.linkSlack": "Slack verknüpfen",
  "reaching.linkTeams": "Microsoft Teams verknüpfen",
  "reaching.connectPhone": "Telefon verbinden",
  "reaching.sumSlack": "Eine Unterhaltung von Slack aus fortsetzen.",
  "reaching.sumTeams": "Eine Unterhaltung von Microsoft Teams aus fortsetzen.",
  "reaching.sumSms": "Eine Unterhaltung per SMS fortsetzen.",
  "reaching.codeOnWay":
    "Ein Bestätigungscode ist unterwegs. Gib ihn ein, um fertig zu werden.",
  "reaching.linkReady":
    "Dein Verknüpfungscode ist bereit zum Senden. Öffne dies, um ihn noch einmal zu sehen.",
  "reaching.smsNotSet":
    "SMS sind noch nicht eingerichtet. Ein Administrator muss sie zuerst einschalten.",
  "reaching.notSet":
    "Noch nicht eingerichtet. Ein Administrator muss zuerst Slack und Teams einschalten.",
  "reaching.pointerBefore":
    "Deine Geräte, die letzten Zustellungen und wohin jede Art von Neuigkeit geht, findest du in",
  "reaching.connected": "Verbundene Ziele",
  "reaching.noDestinations": "Keine Ziele verbunden.",
  "reaching.optedOut":
    "Du hast STOP per SMS gesendet. Sende START, um fortzufahren.",
  "reaching.disconnect": "Trennen",
  "reaching.channelNote":
    "In einem Slack- oder Teams-Kanal, den andere lesen können, antwortet dir der Assistent in einer Direktnachricht.",
  "reaching.connectTitle": "Eine Unterhaltung verbinden",
  "reaching.oneAtATime":
    "Jedes Konto und jede Telefonnummer funktioniert mit jeweils einer Unterhaltung. Wenn du es hier verknüpfst, wird es von der Unterhaltung gelöst, mit der es jetzt verknüpft ist.",
  "reaching.conversation": "Unterhaltung",
  "reaching.chooseConversation": "Wähle eine Unterhaltung",
  "reaching.loadMore": "Weitere Unterhaltungen laden",
  "reaching.phoneNumber": "Telefonnummer",
  "reaching.sendCode": "Bestätigungscode senden",
  "reaching.verificationCode": "Bestätigungscode",
  "reaching.confirmPhone": "Telefon bestätigen",
  "reaching.linkExpires": {
    one: "Sende diese Nachricht innerhalb von {count} Minute an die {product}-App in {platform}. Sie verknüpft dieses Konto mit dieser Unterhaltung und diesem Assistenten.",
    other:
      "Sende diese Nachricht innerhalb von {count} Minuten an die {product}-App in {platform}. Sie verknüpft dieses Konto mit dieser Unterhaltung und diesem Assistenten.",
  },
  "responsibilities.new": "Neue Verantwortung",
  "responsibilities.title": "Ziele",
  "responsibilities.empty":
    "Noch keine Verantwortungen. Füge eine mit „Neue Verantwortung“ hinzu.",
  "responsibilities.emptyBot":
    "Dieser Assistent hat noch keine Verantwortungen. Füge eine mit „Neue Verantwortung“ hinzu.",
  "routines.neverRun": "Noch nicht gelaufen",
  "routines.running": "Läuft…",
  "routines.missed": "Verpasst {when}",
  "routines.failed": "Fehlgeschlagen {when}",
  "routines.skipped": "Übersprungen {when}",
  "routines.ran": "Ausgeführt {when}",
  "routines.finished": "Beendet {when}",
  "routines.noRuns": "Noch keine Läufe.",
  "routines.runNow": "Jetzt ausführen",
  "routines.triggered": "Ausgelöst",
  "routines.scheduled": "Geplant",
  "routines.sweepChecked":
    "{product} hat sie zuletzt {when} geprüft. Keine davon läuft, bis der Dienst wieder anläuft. Frag einen Administrator, wenn das weiter passiert.",
  "routines.sweepNever":
    "{product} hat noch nicht mit dem Ausführen von Routinen begonnen, deshalb läuft keine davon. Frag einen Administrator, das einzurichten.",
  "routines.notRunning": "Routinen laufen nicht.",
  "routines.loadError":
    "Deine Routinen konnten nicht geladen werden. Lade die Seite neu.",
  "routines.emptyBot":
    "Dieser Assistent hat noch keine Routinen. Frag ihn etwas wie „jeden Werktag um 9, schick mir…“, dann erscheint sie hier.",
  "routines.empty":
    "Noch keine Routinen. Frag einen Assistenten etwas wie „jeden Werktag um 9, schick mir…“, dann erscheint sie hier.",
  "routines.enableAria": "Routine mit dem Zeitplan {schedule} aktivieren",
  "routines.channelGone": "Unterhaltung gelöscht",
  "routines.untitledChannel": "Unterhaltung ohne Titel",
  "routines.due": "Fällig",
  "routines.next": "Nächste: {when}",
  "routines.runNowTitle":
    "Führt sie jetzt wirklich aus. Der Assistent erledigt die Arbeit und schreibt in die Unterhaltung.",
  "routines.pausedTurnOn":
    "Diese Routine ist pausiert. Schalte sie zuerst ein.",
  "routines.runNowAria":
    "Die Routine mit dem Zeitplan {schedule} jetzt ausführen",
  "routines.historyAria":
    "Ausführungsverlauf für die Routine mit dem Zeitplan {schedule}",
  "routines.history": "Verlauf",
  "routines.deleteAria": "Routine mit dem Zeitplan {schedule} löschen",
  "routines.deleteTitle": "„{schedule}“ löschen?",
  "routines.deleteDescription":
    "Diese Routine wird endgültig beendet. Das kannst du nicht rückgängig machen.",
  "routines.week": "Woche",
  "routines.list": "Liste",
  "routines.nextRuns": "Nächste Läufe",
  "routines.viewAria": "Ansehen",
  "summary.nothingGranted": "Nichts freigegeben",
  "summary.skills": {
    one: "{count} Fähigkeit",
    other: "{count} Fähigkeiten",
  },
  "summary.apps": {
    one: "{count} App",
    other: "{count} Apps",
  },
  "summary.everyonePublic": "Alle (öffentlich)",
  "summary.notShared": "Nicht geteilt",
  "summary.specificPeople": "Bestimmte Personen und Gruppen",
  "summary.onlyIn": "Nur in {product}",
  "summary.nothingConnected": "Nichts verbunden",
  "summary.sources": {
    one: "{count} Quelle",
    other: "{count} Quellen",
  },
  "summary.researchOn": "Recherche im Hintergrund an",
  "summary.researchOnAfter": "Recherche im Hintergrund an",
  "time.justNow": "gerade eben",
  "time.minutesAgo": {
    one: "vor {count} Minute",
    other: "vor {count} Minuten",
  },
  "time.hoursAgo": {
    one: "vor {count} Stunde",
    other: "vor {count} Stunden",
  },
  "time.yesterday": "gestern",
  "time.daysAgo": {
    one: "vor {count} Tag",
    other: "vor {count} Tagen",
  },
  "time.weeksAgo": {
    one: "vor {count} Woche",
    other: "vor {count} Wochen",
  },
  "time.recently": "kürzlich",
  // Stage 2f (D181): the approval rules, the responsibility dialog, the routine history, Passwords.
  "approvals.behaviour.allow": "Ohne Nachfrage handeln",
  "approvals.behaviour.preApproved": "Handeln, wenn vorab genehmigt",
  "approvals.behaviour.ask": "Vor dem Handeln fragen",
  "approvals.behaviour.handOff": "An dich übergeben",
  "approvals.host.ask": "Jedes Mal fragen",
  "approvals.host.allow": "Immer erlauben",
  "approvals.host.never": "Nie",
  "approvals.teamRule": "{label} (Teamregel)",
  "approvals.matchOn": "bei {scope}",
  "approvals.matchFor": "für {bot}",
  "approvals.locked": "Gesperrt",
  "approvals.behaviourFor": "Verhalten für {tool}",
  "approvals.formLead":
    "Ein Werkzeug oder eine App und was ein Assistent tut, bevor er sie benutzt.",
  "approvals.formHelp":
    "Mit * passt alles. mcp/gmail/* steht für jedes Gmail-Werkzeug. Ein Ziel *.example.com steht für jede Seite dieser Website.",
  "approvals.field.tool": "Werkzeug oder App",
  "approvals.field.effect": "Art der Aktion",
  "approvals.field.scope": "Ziel",
  "approvals.field.scopeHint":
    "*, eine Website, ein Ordner, der Name eines Assistenten",
  "approvals.field.bot": "Assistent",
  "approvals.field.botHint": "* für jeden Assistenten",
  "approvals.field.behaviour": "Verhalten",
  "approvals.saveRule": "Regel speichern",
  "approvals.addRule": "Regel hinzufügen",
  "approvals.rulesOff":
    "Ein Administrator hat persönliche Regeln ausgeschaltet. Deine bleiben gespeichert, gelten aber nicht.",
  "approvals.bot.lead":
    "Es gilt die strengste passende Regel. Eine „Fragen“-Regel schlägt eine „Erlauben“-Regel. Die Regeln für alle Assistenten stehen in",
  "approvals.bot.settingsLink": "Einstellungen → Genehmigungen",
  "approvals.bot.title": "Regeln",
  "approvals.bot.empty": "Keine Regeln für diesen Assistenten.",
  "approvals.adminLead":
    "Die Teameinstellungen und die Anfragen für geteilte Konten findest du in",
  "approvals.adminLink": "Verwaltung → Genehmigungen",
  "approvals.before.title": "Bevor ein Assistent handelt",
  "approvals.before.askTitle": "Vor Änderungen fragen",
  "approvals.before.askLine":
    "Du prüfst die Änderungen eines Assistenten an Websites, verbundenen Apps und Dateien.",
  "approvals.before.autoTitle": "Automatische Prüfung",
  "approvals.before.autoEnforced": "Ein Administrator verlangt das.",
  "approvals.before.autoLine":
    "Bevor ein Assistent etwas tut, das sich auf deine Konten auswirken oder Informationen teilen könnte, gleicht {product} es mit deiner Anfrage und deinen Regeln ab. Wenn es das nicht entscheiden kann, fragt es dich.",
  "approvals.before.hostTitle": "Befehle auf deinem Computer",
  "approvals.before.hostLimited":
    "Ein Administrator beschränkt das auf „{limit}“.",
  "approvals.before.hostLine":
    "Die {product}-Desktop-App zeigt dir trotzdem jeden Befehl, bevor er ausgeführt wird.",
  "approvals.every.lead":
    "Es gilt die strengste passende Regel. Eine „Fragen“-Regel schlägt eine „Erlauben“-Regel. Teamregeln sind gesperrt. Passwörter und Sicherheitseinstellungen gehen immer an dich, ebenso Zahlungen, es sei denn, du schaltest unten Full access für einen Assistenten ein. Die Regeln für einen einzelnen Assistenten stehen auf",
  "approvals.every.botPage": "der Seite dieses Assistenten",
  "approvals.every.title": "Regeln für jeden Assistenten",
  "approvals.every.empty": "Noch keine Regeln.",
  "approvals.other.lead":
    "Diese passen zu keinem Assistenten, den du öffnen kannst. Sie gelten trotzdem für jeden Assistenten, auf den sie passen. Entferne die, die du nicht willst.",
  "approvals.other.title": "Regeln für andere Assistenten",
  "approvals.page.description":
    "Lege fest, wann deine Assistenten fragen, bevor sie etwas ändern. Die Regeln hier gelten für alle.",
  "approvals.admin.description":
    "Was die Assistenten der Mitglieder fragen müssen, bevor sie handeln, Regeln für alle und Anfragen, geteilte Konten zu nutzen.",
  "approvals.team.title": "Teameinstellungen",
  "approvals.team.enforce": "Automatische Prüfung für alle verlangen",
  "approvals.team.custom": "Mitgliedern persönliche Regeln erlauben",
  "approvals.team.hostTitle":
    "Befehle auf den Computern der Mitglieder, höchstens",
  "approvals.team.hostLine":
    "Die strengere eigene Einstellung eines Mitglieds gilt weiterhin.",
  "approvals.team.rulesLead":
    "Diese gelten für die Assistenten jedes Mitglieds. Mitglieder können sie nicht ändern.",
  "approvals.team.rulesTitle": "Teamregeln",
  "approvals.team.empty": "Keine Teamregeln.",
  "approvals.team.addRule": "Teamregel hinzufügen",
  "approvals.shared.title": "Anfragen für geteilte Konten",
  "approvals.shared.wants": "{bot} möchte das geteilte Konto {account}",
  "approvals.shared.why.refusedCall":
    "Eine Aktion wurde blockiert. Dieser Assistent erreicht mehr Personen als genehmigt.",
  "approvals.shared.why.publish":
    "Sein Besitzer hat erweitert, wer ihn erreichen kann.",
  "approvals.shared.why.trigger":
    "Sein Besitzer hat einen Auslöser hinzugefügt, über den Nachrichten von außen ihn steuern können.",
  "approvals.shared.why.grant": "Er hat die Aktionen der App erhalten.",
  "approvals.shared.now": "Jetzt:",
  "approvals.shared.notApproved": "Nicht genehmigt",
  "approvals.shared.asked": "Angefragt:",
  "approvals.shared.approve": "Genehmigen",
  "approvals.shared.decline": "Ablehnen",
  "tasks.updated": "Aktualisiert {ago}",
  "routines.status.running": "Läuft",
  "routines.status.succeeded": "Erfolgreich",
  "routines.status.failed": "Fehlgeschlagen",
  "routines.status.skipped": "Übersprungen",
  "routines.status.waiting": "Wartet auf dich",
  "routines.status.missed": "Verpasst",
  "routines.history.empty":
    "Noch keine Läufe. Ein Lauf erscheint hier, sobald eine Routine ausgelöst wurde oder nachdem du auf „Jetzt ausführen“ gedrückt hast.",
  "routines.history.aBot": "Ein Assistent",
  "routines.history.latest": {
    one: "Es wird {count} Lauf angezeigt.",
    other: "Es werden die letzten {count} Läufe angezeigt.",
  },
  "routines.history.deleted": "Eine Routine, die inzwischen gelöscht wurde",
  "routines.history.waitingNote":
    "Wartet auf deine Genehmigung. Öffne die Unterhaltung, um zu antworten.",
  "responsibilities.status.completed": "Abgeschlossen",
  "responsibilities.summary.paused":
    "Nichts startet sie, bis du sie wieder fortsetzt.",
  "responsibilities.summary.trigger": "{kind}-Auslöser",
  "responsibilities.summary.starts": "Startet am {starts}",
  "responsibilities.summary.asked": "Läuft, wenn du danach fragst",
  "responsibilities.source.manual": "Manuell",
  "responsibilities.source.schedule": "Zeitplan",
  "responsibilities.source.connector": "Verbundene App",
  "responsibilities.progress": "Fortschritt",
  "responsibilities.lastResult": "Letztes Ergebnis",
  "responsibilities.activeOn": "Seine Ereignisse und Auslöser starten sie.",
  "responsibilities.activeOff": "Pausiert. Seine Auslöser starten sie nicht.",
  "responsibilities.runNowLine":
    "Führt sie jetzt aus, wirklich. Der Assistent erledigt die Arbeit und kann Beiträge veröffentlichen und Aktionen ausführen.",
  "responsibilities.complete": "Abschließen",
  "responsibilities.completeLine":
    "Als erledigt markieren. Danach startet sie nichts mehr.",
  "responsibilities.field.title": "Titel",
  "responsibilities.field.instruction": "Anweisung",
  "responsibilities.field.criteria": "Erfolgskriterien",
  "responsibilities.events": "Ereignisse",
  "responsibilities.saving": "Wird gespeichert…",
  "responsibilities.run.queued": "In der Warteschlange",
  "responsibilities.run.waiting":
    "Wartet auf {kind}. Antworte oben auf der Seite dieses Assistenten oder in der Unterhaltung.",
  "responsibilities.runs": "Läufe",
  "responsibilities.viewRuns": "Läufe ansehen",
  "responsibilities.hideRuns": "Läufe ausblenden",
  "passwords.description":
    "Zugangsdaten, die du gespeichert hast, als du einen Assistenten auf einer Website angemeldet hast. Assistenten sehen sie nie, und du bestätigst jede Verwendung.",
  "passwords.saved": "Gespeicherte Zugangsdaten",
  "passwords.loadError":
    "Deine Passwörter konnten nicht geladen werden. Lade die Seite neu.",
  "passwords.off":
    "Ein Administrator hat gespeicherte Passwörter ausgeschaltet. Deine Zugangsdaten bleiben gespeichert, werden aber nicht angeboten.",
  "passwords.empty":
    "Keine gespeicherten Zugangsdaten. Wähle „In Passwörtern speichern“, wenn du einen Assistenten auf einer Website anmeldest.",
  "passwords.lastUsed": "zuletzt verwendet {date}",
  "passwords.neverUsed": "nie verwendet",
  "passwords.deleteAria": "Zugangsdaten für {origin} löschen",
  "settings.notificationsPage":
    "Wo dich die Neuigkeiten deiner Assistenten erreichen, wenn du nicht da bist. Wie viel jeder Assistent von sich aus sendet, stellst du auf seiner eigenen Seite ein.",
  "fullaccess.label.noPayments": "Full access ohne Zahlungen",
  "fullaccess.label.full": "Full access",
  "fullaccess.off": "Aus",
  "fullaccess.description":
    "Standardmäßig sicher: Deine Assistenten fragen, bevor sie etwas senden, bezahlen, unterschreiben, buchen oder löschen. Für jeden Assistenten kannst du festlegen, dass er das ohne Nachfrage tun darf.",
  "fullaccess.offTerm": "Aus:",
  "fullaccess.offText":
    "Der Assistent fragt, bevor er etwas sendet, bezahlt, unterschreibt, bucht oder löscht.",
  "fullaccess.noPaymentsTerm": "Full access ohne Zahlungen:",
  "fullaccess.noPaymentsText":
    "Er sendet, unterschreibt, bucht und löscht ohne Nachfrage. Zahlungen und Käufe fragen dich weiterhin.",
  "fullaccess.fullTerm": "Full access:",
  "fullaccess.fullText":
    "Er bezahlt und kauft auch ohne Nachfrage. Für den Betrag gibt es keine Grenze, bis es Ausgabenlimits gibt (geplant für v0.4).",
  "fullaccess.askTitle": "{name} {label} geben?",
  "fullaccess.give": "{label} geben",
  "fullaccess.full.p1":
    "{name} sendet, bezahlt, unterschreibt, bucht und löscht, ohne dich vorher zu fragen. Er kann auf das reagieren, was er liest, etwa eine E-Mail oder eine Webseite. Schalte das also nur ein, wenn du ihm das zutraust.",
  "fullaccess.full.p2":
    "Für den Betrag, den er bezahlen darf, gibt es keine Grenze: Ausgabenlimits gibt es noch nicht (sie sind für v0.4 geplant). Damit Zahlungen und Käufe dich weiterhin fragen, wähle stattdessen Full access ohne Zahlungen.",
  "fullaccess.full.p3":
    "Passwörter und Sicherheitseinstellungen brauchen weiterhin dich. Ist ein automatischer Prüfer eingerichtet, liest er außerdem einmal jeden Befehl und jedes Skript, das das Mitglied auf seinem Computer ausführt, auch wenn du den Prüfer ausgeschaltet hast; ist keiner eingerichtet, wird ein Befehl nicht gelesen. Das gilt für das, worum du in deinen eigenen Chats bittest, nicht für Routinen oder Check-ins. Du kannst es jederzeit ausschalten, und es endet sofort.",
  "fullaccess.noPayments.p1":
    "{name} sendet, unterschreibt, bucht und löscht, ohne dich vorher zu fragen. Zahlungen und Käufe fragen dich weiterhin. Er kann auf das reagieren, was er liest, etwa eine E-Mail oder eine Webseite. Schalte das also nur ein, wenn du ihm das zutraust.",
  "fullaccess.noPayments.p2":
    "Die App erkennt eine Zahlung an ihren eingebauten Prüfungen. Deshalb kann auch eine Nachricht nachfragen, die eine Zahlung nur erwähnt, und eine ungewöhnlich formulierte Zahlung wird vielleicht nicht erkannt. Passwörter und Sicherheitseinstellungen brauchen weiterhin dich. Ist ein automatischer Prüfer eingerichtet, liest er außerdem einmal jeden Befehl und jedes Skript, das das Mitglied auf seinem Computer ausführt, wenn es um ein Passwort, eine Sicherheitseinstellung oder eine so ausgeführte Zahlung geht, auch wenn du den Prüfer ausgeschaltet hast; ist keiner eingerichtet, wird ein Befehl nicht gelesen. Das gilt für das, worum du in deinen eigenen Chats bittest, nicht für Routinen oder Check-ins. Du kannst es jederzeit ausschalten, und es endet sofort.",
  "fullaccess.noBots": "Noch keine Assistenten.",
  "fullaccess.legend": "Zugriff für {name}",
  "fullaccess.radioAria": "{label} für {name}",
  "fullaccess.summary.off":
    "Fragt, bevor er etwas sendet, bezahlt, unterschreibt, bucht oder löscht.",
  "fullaccess.summary.noPayments":
    "Handelt ohne Nachfrage, nur Zahlungen und Käufe fragen dich weiterhin. Seit {since}.",
  "fullaccess.summary.full":
    "Handelt ohne Nachfrage, Zahlungen eingeschlossen, ohne Grenze für den Betrag. Seit {since}.",
  "fullaccess.doneTitle": "Ohne Nachfrage erledigt",
  "fullaccess.doneDescription":
    "Was ein Assistent mit Full access ohne Nachfrage bei dir getan hat, das Neueste zuerst.",
  "fullaccess.nothingYet": "Noch nichts.",
  "approvals.audience.owner": "Nur der Eigentümer",
  "approvals.audience.team": "Alle",
  "approvals.audience.outside": ", und Eingaben von außen",
  "approvals.audience.nobody": "Niemand genannt",
  "approvals.audience.groups": {
    one: "Die Gruppe {names}",
    other: "Die Gruppen {names}",
  },
  "approvals.audience.people": {
    one: "{count} Person",
    other: "{count} Personen",
  },
  "approvals.audience.join": "{a} und {b}",
  "access.req.title": "Anfragen",
  "access.req.loadError":
    "Die Zugriffsanfragen konnten nicht geladen werden. Lade die Seite neu.",
  "access.req.descApp":
    "Personen, die diese App anfragen. Genehmigen tut sofort, worum sie gebeten haben.",
  "access.req.descAll":
    "Personen, die darum bitten, eine App einzuschalten, einem Assistenten zu geben oder zu verbinden. Genehmigen tut sofort, worum sie gebeten haben.",
  "access.req.aBot": "einen Assistenten",
  "access.req.theBot": "den Assistenten",
  "access.req.somebody": "Jemand",
  "access.req.enable": "{app} für {bot} einschalten",
  "access.req.grantMore": "{bot} mehr von {app} geben: {list}",
  "access.req.grant": "{app} an {bot} geben",
  "access.req.connectShared": "Das gemeinsame {app}-Konto verbinden",
  "access.req.asked": "{who} hat {when}{forBot} gefragt.",
  "access.req.forBot": ", für {bot}",
  "access.req.approving": "Wird genehmigt…",
  "access.req.botPage": "die Seite des Assistenten unter {app}",
  "access.req.toolRead": "{name} (nur lesen)",
  "access.req.toolWrite": "{name} (ändert etwas)",
  "access.req.gives":
    "Genehmigen gibt {bot} genau diese Werkzeuge und sonst nichts: {list}.",
  "access.req.readOnly":
    "Genehmigen gibt {bot} nur die reinen Leseaktionen von {app}. Weitere wählst du unter {page}.",
  "access.req.canSend": {
    one: "{names} kann im Namen der Person senden.",
    other: "{names} können jeweils im Namen der Person senden.",
  },
  "access.req.unreviewed": {
    one: "Keine geprüfte Liste sagt, was {names} in {app} tut, deshalb kann es im Namen der Person senden.",
    other:
      "Keine geprüfte Liste sagt, was {names} in {app} tun, deshalb kann jedes im Namen der Person senden.",
  },
  "access.req.neverGives": {
    one: "Genehmigen gibt nie ein solches Werkzeug: Erlaube es in den Einstellungen unter {page}.",
    other:
      "Genehmigen gibt nie solche Werkzeuge: Erlaube sie in den Einstellungen unter {page}.",
  },
  "access.req.and": "{a} und {b}",
  "passwords.saveTo": "In Passwörtern speichern",
  "responsibilities.run.waitKind.approval": "deine Genehmigung",
  "responsibilities.run.waitKind.question": "deine Antwort",
  "responsibilities.run.waitKind.handoff": "deine Übernahme",
  "responsibilities.run.waitKind.signIn": "deine Anmeldung",
  "responsibilities.run.waitKind.other": "dich",
  "responsibilities.new.description":
    "Ein fortlaufendes Ziel. Der Assistent arbeitet in der Unterhaltung daran, die du auswählst.",
  "responsibilities.new.chooseConversation": "Unterhaltung auswählen",
  "responsibilities.new.loadMore": "Weitere Unterhaltungen laden",
  "responsibilities.new.titleExample": "Den Kundenbericht aktuell halten",
  "responsibilities.new.criteriaExample":
    "Der Bericht enthält die Grafik des laufenden Quartals und einen Quellenlink.",
  "responsibilities.new.eventSource": "Ereignisquelle",
  "responsibilities.new.source.none": "Auf Anfrage ausführen",
  "responsibilities.new.githubHelp":
    "Die Ereignisse kommen aus den Repositories, die du in {link} verbunden hast.",
  "responsibilities.new.eventType": "Ereignistyp",
  "responsibilities.new.creating": "Wird erstellt…",
  "responsibilities.new.create": "Verantwortung erstellen",
  "triggers.kind.email": "E-Mail",
  "triggers.help.webhook":
    "Sende per POST JSON an diese URL, mit dem Authorization-Header oder mit Standard-Webhooks-Signatur-Headern. Ein 200 heißt, dass es empfangen wurde, nicht dass der Lauf beendet ist.",
  "triggers.help.github":
    "Setze in den Einstellungen → Webhooks des Repositorys die Payload-URL auf diese URL, den Content-Type auf application/json und das Secret auf den Schlüssel.",
  "triggers.help.linear":
    "In Linear unter Settings → API → Webhooks: Lege die URL fest und füge dann das Signing Secret ein, das Linear hier anzeigt.",
  "triggers.help.sentry":
    "Lege in einer internen Sentry-Integration die Webhook-URL fest und füge dann das Client Secret der Integration hier ein.",
  "triggers.help.pagerduty":
    "In PagerDuty unter Integrations → Generic Webhooks (v3): Lege die URL fest und füge dann das bei der Erstellung angezeigte Secret hier ein.",
  "triggers.help.email":
    "Sende oder leite eine E-Mail an diese Adresse, um einen Lauf zu starten.",
  "triggers.help.slack":
    "Startet bei Slack-Ereignissen, die dieser Assistent empfängt. Nachrichten, die vor dem Hinzufügen des Auslösers gesendet wurden, werden ignoriert.",
  "triggers.slack.mention": "Der Assistent wird erwähnt",
  "triggers.slack.phrase": "Eine Nachricht enthält eine Wendung",
  "triggers.slack.reaction": "Eine Reaktion wird hinzugefügt",
  "triggers.slack.message": "Jede Nachricht",
  "triggers.f.inChannels": "in {channels}",
  "triggers.f.everyChannel": "in jedem Kanal, in dem der Assistent ist",
  "triggers.f.mention": "wenn der Assistent erwähnt wird",
  "triggers.f.anyMessage": "bei jeder Nachricht",
  "triggers.f.phrases": "bei Nachrichten mit {phrases}",
  "triggers.f.or": " oder ",
  "triggers.f.reactions": "bei Reaktionen",
  "triggers.f.slack": "{what} {where} (Workspace {team})",
  "triggers.f.events": "Ereignisse {types}",
  "triggers.f.everyEvent": "jedes Ereignis",
  "triggers.f.where": "wenn {path} = {equals}",
  "triggers.f.from": "von {from}",
  "triggers.f.fromSenders": "von {senders} (authentifiziert)",
  "triggers.title": "Auslöser",
  "triggers.add": "Auslöser hinzufügen",
  "triggers.notActive.paused":
    "Diese Verantwortung ist pausiert. Ihre Auslöser starten sie nicht.",
  "triggers.notActive.completed":
    "Diese Verantwortung ist abgeschlossen. Ihre Auslöser starten sie nicht.",
  "triggers.none":
    "Keine Auslöser. Sie läuft, wenn du auf Jetzt ausführen drückst, oder bei den Ereignissen oben.",
  "triggers.removeForGood": "Endgültig entfernen",
  "triggers.keep": "Behalten",
  "triggers.runOnAria": "Bei diesem {kind}-Auslöser ausführen",
  "triggers.postTo": "POST an",
  "triggers.copyUrl": "URL kopieren",
  "triggers.copyAddress": "Adresse kopieren",
  "triggers.emailOff":
    "E-Mail ist in {product} noch nicht eingerichtet, deshalb kann diese Adresse keine Post empfangen. Ein Administrator muss sie einschalten.",
  "triggers.key": "Schlüssel",
  "triggers.copyKey": "Schlüssel kopieren",
  "triggers.copyHeader": "Header kopieren",
  "triggers.showKey": "Schlüssel anzeigen",
  "triggers.replaceKey": "Schlüssel ersetzen",
  "triggers.secretSaved": "Signing Secret gespeichert",
  "triggers.secretWaiting": "Warten auf das Signing Secret",
  "triggers.secret": "Signing Secret",
  "triggers.pasteNew": "Neues Secret einfügen, um es zu ersetzen",
  "triggers.paste": "Signing Secret einfügen",
  "triggers.saveSecret": "Secret speichern",
  "triggers.addDescription":
    "Etwas außerhalb von {product}, das diese Verantwortung startet.",
  "triggers.slackTeam": "Slack-Team-ID",
  "triggers.fireOn": "Auslösen bei",
  "triggers.phrases": "Wendungen (durch Komma getrennt)",
  "triggers.reactions": "Reaktionen (leer: alle)",
  "triggers.channelIds": "Kanal-IDs (leer: alle, in denen der Assistent ist)",
  "triggers.eventTypes": "Ereignistypen",
  "triggers.onlyWhen": "Nur wenn das Feld",
  "triggers.equals": "gleich",
  "triggers.repository": "Repository (optional)",
  "triggers.senders": "Erlaubte Absender (leer: niemand)",
  "triggers.secretLater": "Signing Secret (kann später hinzugefügt werden)",
  "triggers.adding": "Wird hinzugefügt…",
  "triggers.addKind": "{kind}-Auslöser hinzufügen",
  "triggers.example.webhook": "deploy.finished (leer: alle)",
  "routines.cal.intro":
    "Die nächsten {days} Tage, für die eingeschalteten Routinen. Die Zeiten gelten in deiner Zeitzone.",
  "routines.cal.none": "Noch keine Routinen, also ist nichts geplant.",
  "routines.cal.noneOn":
    "Keine dieser Routinen ist eingeschaltet, deshalb läuft keine.",
  "routines.cal.nothing": "In den nächsten {days} Tagen ist nichts geplant.",
  "routines.cal.truncated":
    "Es sind nur die ersten {max} Läufe dieser {days} Tage aufgeführt.",
  "routines.cal.paused": {
    one: "{count} Routine pausiert, deshalb hier nicht aufgeführt. Schalte eine ein, um zu sehen, wann sie läuft.",
    other:
      "{count} Routinen pausiert, deshalb hier nicht aufgeführt. Schalte eine ein, um zu sehen, wann sie läuft.",
  },
  "routines.week.nothing": "Für den Rest dieser Woche ist nichts geplant.",
  "routines.week.label": "Diese Woche",
  "routines.week.today": "heute",
  "routines.week.now": "Jetzt, {time}",
  "routines.week.next": "Als Nächstes:",
  "routines.week.nothingElse": "Sonst ist diese Woche nichts geplant.",
  "routines.week.truncated":
    "Es sind nur die ersten Läufe der nächsten Tage aufgeführt, deshalb zeigt eine sehr aktive Routine vielleicht nicht jeden Tag.",
  "routines.week.historyError":
    "Läufe, die schon stattgefunden haben, konnten nicht geladen werden und werden deshalb nicht angezeigt.",
  "routines.week.note":
    "Die Zeiten gelten in deiner Zeitzone. Eine Routine, die öfter als stündlich läuft, erscheint als ein Block für den Tag.",
  "routines.week.summary": "{count} Läufe, etwa alle {minutes} Min.",
  "routines.week.gone": "{label}, Unterhaltung gelöscht",
  "routines.card.label": "Routine",
  "routines.card.cancelled": "Routine abgebrochen",
  "routines.card.readError": "Diese Routine konnte nicht gelesen werden.",
  "routines.card.reading": "Diese Routine wird gelesen…",
  "routines.card.gone": "Diese Routine gibt es nicht mehr",
  "routines.card.cannotSend":
    "Diese Unterhaltung kann gerade keine Nachricht annehmen. Schreibe die Änderung unten ins Nachrichtenfeld.",
  "routines.card.confirm": "Diese Routine abbrechen?",
  "routines.card.yes": "Ja, abbrechen",
  "routines.card.no": "Nein, behalten",
  "routines.card.pause": "Pausieren",
  "routines.card.resume": "Fortsetzen",
  "routines.card.edit": "Bearbeiten",
  "routines.card.whatChange": "Was soll sich ändern?",
  "routines.card.send": "Änderung senden",
  "routines.card.writeBelow":
    "Schreibe die Änderung unten ins Nachrichtenfeld.",
  "routines.card.close": "Schließen",
  "admin.boundaries.title": "Grenzen",
  "admin.boundaries.descLead":
    "Was ein Assistent mit seinem Computer tun darf und was nicht. Jede Aktion wird geprüft, bevor sie passiert. Ablehnungen erscheinen im",
  "admin.boundaries.descAudit": "Audit",
  "admin.boundaries.descTail": "zusammen mit der Regel, die sie abgelehnt hat.",
  "admin.boundaries.whenTitle": "Wenn eine Regel zutrifft",
  "admin.boundaries.whenDesc":
    "Die Aktion stoppen, oder sie aufzeichnen und durchlassen. Mit dem Aufzeichnen kannst du eine Regel an echter Aktivität ausprobieren, bevor sie irgendetwas ablehnt.",
  "admin.boundaries.modeEnforce": "Die Aktion stoppen",
  "admin.boundaries.modeRecord": "Aufzeichnen und erlauben",
  "admin.boundaries.modeEnforceNote":
    "Der Assistent wird gestoppt und erfährt, welche Regel ihn abgelehnt hat.",
  "admin.boundaries.modeRecordNote":
    "Nichts wird gestoppt. Jeder Treffer wird aufgezeichnet, als wäre er abgelehnt worden.",
  "admin.boundaries.neverTitle": "Assistenten dürfen nie",
  "admin.boundaries.neverLead":
    "Wird zuerst geprüft. Ein Treffer stoppt die Aktion, und der Assistent erfährt, welche Regel ihn abgelehnt hat. Die Regeln sind in CEL. Sie können prüfen:",
  "admin.boundaries.neverMid1": ", das Element, die gedrückte",
  "admin.boundaries.neverMid2": ", die Datei, den ausgeführten",
  "admin.boundaries.neverMid3": "sowie",
  "admin.boundaries.neverMid4": "für externe Werkzeuge.",
  "admin.boundaries.neverMid5": "sagt, was den Lauf gestartet hat:",
  "admin.boundaries.neverTail":
    "Ein geplanter Lauf handelt als sein Eigentümer, deshalb kann",
  "admin.boundaries.neverTail2":
    "allein das nicht verraten. Eine Regel, die sich nicht auswerten lässt, zählt als Treffer. Ein Tippfehler lässt nie eine Aktion durch.",
  "admin.boundaries.or": "oder",
  "admin.boundaries.noRules":
    "Keine Regeln. Jede Aktion ist erlaubt und wird aufgezeichnet.",
  "admin.boundaries.remove": "Entfernen",
  "admin.boundaries.ruleLabel": "Eine Regel, in CEL geschrieben",
  "admin.boundaries.testing": "Wird getestet…",
  "admin.boundaries.testFirst": "Erst testen",
  "admin.boundaries.addRule": "Regel hinzufügen",
  "admin.boundaries.preset.form": "Nie ein Formular absenden",
  "admin.boundaries.preset.formCost":
    "Hindert den Assistenten auch daran, anderswo die Eingabetaste zu drücken. Ein Formular kann sich mit der Eingabetaste in jedem Feld absenden. Nicht erfasst ist die Auswahl in einem Menü oder Datumsfeld, deren Änderung ein Formular von selbst absenden kann.",
  "admin.boundaries.preset.password": "Nie in ein Passwortfeld tippen",
  "admin.boundaries.preset.passwordCost":
    "Ein Passwortfeld mit anderer Beschriftung ist nicht erfasst. Die Regel greift auf die Beschriftung.",
  "admin.boundaries.preset.social": "Soziale Medien meiden",
  "admin.boundaries.preset.socialCost":
    "Nur diese beiden Hosts. Ein Link, der von anderswo dorthin weiterleitet, ist erlaubt.",
  "admin.boundaries.otherwiseTitle": "Sonst dürfen sie",
  "admin.boundaries.otherwiseDesc":
    "Gilt für alles, was die Liste oben nicht erfasst hat. Eine leere Liste erlaubt hier nichts, und jede Aktion wird abgelehnt.",
  "admin.boundaries.allowAll": "true, alles, was oben nicht abgelehnt wird",
  "admin.boundaries.saved":
    "Gespeichert. Gilt für die nächste Aktion jedes Assistenten.",
  "admin.boundaries.footer":
    "Änderungen gelten für die nächste Aktion jedes Assistenten. Sie bleiben nach einem Neustart erhalten.",
  "admin.boundaries.dry.none":
    "Es gibt noch keine aufgezeichneten Computeraktionen zum Testen. Die Regel ist gültig. Was sie trifft, siehst du, sobald Assistenten gehandelt haben.",
  "admin.boundaries.dry.zero":
    "An den letzten {scanned} aufgezeichneten Aktionen getestet. Diese Regel hätte keine abgelehnt. Sie kann künftige trotzdem treffen.",
  "admin.boundaries.dry.some":
    "An den letzten {scanned} aufgezeichneten Aktionen getestet. Diese Regel hätte {refused} abgelehnt.",
  "admin.boundaries.dry.wouldRefuse": "Würde ablehnen",
  "admin.boundaries.dry.wouldAllow": "Würde jetzt erlauben",
  "admin.boundaries.dry.on": "auf „{name}“",
  "admin.boundaries.dry.running": "führt aus",
  "admin.boundaries.dry.touching": "berührt {file}",
  "admin.boundaries.dry.first":
    "Gezeigt werden die ersten {shown}. Die Zahl oben umfasst alles Geprüfte.",
  "admin.people.title": "Personen",
  "admin.people.desc":
    "Alle, die sich angemeldet haben. Admins können diese Bildschirme öffnen. Alle anderen sprechen mit Assistenten.",
  "admin.people.whoTitle": "Wer hier ist",
  "admin.people.whoDesc":
    "Adressen in INITIAL_ADMIN_EMAILS sind immer Admins. Du kannst sie hier nicht ändern.",
  "admin.people.stopped": {
    one: "{count} Computer gestoppt",
    other: "{count} Computer gestoppt",
  },
  "admin.people.stoppedFailed": ". {failed} konnten nicht gestoppt werden",
  "admin.people.disksKept": ". Ihre Festplatten bleiben erhalten.",
  "admin.people.searchLabel": "Personen suchen",
  "admin.people.searchPlaceholder": "Nach Name oder Adresse suchen",
  "admin.people.loadError":
    "Personen konnten nicht geladen werden. Lade die Seite neu.",
  "admin.people.noMatch": "Niemand passt zu „{query}“.",
  "admin.people.nobody":
    "Noch hat sich niemand angemeldet. Personen erscheinen hier, sobald sie es tun.",
  "admin.people.lastSignedIn": "zuletzt angemeldet {date}",
  "admin.people.neverSignedIn": "nie angemeldet",
  "admin.people.noProvider": "kein Anbieter",
  "admin.people.accessRemoved": "Zugriff entzogen",
  "admin.people.adminByConfig": "Admin laut Konfiguration",
  "admin.people.stopComputers": "Computer stoppen",
  "admin.people.restore": "Wiederherstellen",
  "admin.people.remove": "Entfernen",
  "admin.people.adminSwitch": "Admin: {email}",
  "admin.people.loading": "Wird geladen…",
  "admin.people.showMore": "Mehr anzeigen",
  "admin.boundaries.and": "und",
  "admin.credentials.title": "Zugangsdaten",
  "admin.credentials.add": "Zugangsdaten hinzufügen",
  "admin.credentials.desc":
    "Schlüssel und Tokens für diese Installation. {product} zeigt ein Geheimnis nie wieder an, sobald es gespeichert ist.",
  "admin.credentials.dialogDesc":
    "Für diese Installation gespeichert. Das Geheimnis siehst du nicht noch einmal.",
  "admin.credentials.type": "Typ",
  "admin.credentials.model": "Modell",
  "admin.credentials.connector": "Konnektor",
  "admin.credentials.provider": "Anbieter",
  "admin.credentials.keyId": "Schlüssel-ID",
  "admin.credentials.secret": "Geheimnis",
  "admin.credentials.replaces":
    "Für diesen Schlüssel gibt es schon aktive Zugangsdaten. Beim Speichern werden sie ersetzt und die alten widerrufen.",
  "admin.credentials.saveError":
    "Die Zugangsdaten konnten nicht gespeichert werden. Versuch es erneut.",
  "admin.credentials.cancel": "Abbrechen",
  "admin.credentials.saving": "Wird gespeichert…",
  "admin.credentials.save": "Zugangsdaten speichern",
  "admin.credentials.savedTitle": "Gespeicherte Zugangsdaten",
  "admin.credentials.loadError":
    "Zugangsdaten konnten nicht geladen werden. Lade die Seite neu.",
  "admin.credentials.empty":
    "Noch keine Zugangsdaten. Füge welche mit „Zugangsdaten hinzufügen“ hinzu.",
  "admin.credentials.revoked": "widerrufen",
  "admin.credentials.active": "aktiv",
  "admin.credentials.revoke": "Widerrufen",
  "admin.idp.title": "Identitätsanbieter",
  "admin.idp.add": "Anbieter hinzufügen",
  "admin.idp.desc":
    "Der SAML- oder OpenID-Connect-Anbieter deines Unternehmens. Die Leute melden sich mit ihrer E-Mail-Adresse an, und deren Domain bestimmt den Anbieter.",
  "admin.idp.registeredTitle": "Registriert",
  "admin.idp.registeredDesc":
    "Google, Microsoft und Okta werden in der Umgebung eingestellt. Sie erscheinen hier nicht.",
  "admin.idp.loadError":
    "Identitätsanbieter konnten nicht geladen werden. Lade die Seite neu.",
  "admin.idp.empty":
    "Noch keine Identitätsanbieter. Füge einen mit den Metadaten deines Identitätsteams hinzu.",
  "admin.idp.remove": "Entfernen",
  "admin.idp.dialogTitle": "Identitätsanbieter hinzufügen",
  "admin.idp.name": "Name",
  "admin.idp.domain": "E-Mail-Domain",
  "admin.idp.domainNote":
    "Alle mit einer Adresse in dieser Domain melden sich hier an. Mehrere trennst du mit Kommas.",
  "admin.idp.issuer": "Aussteller",
  "admin.idp.signOnUrl": "Anmelde-URL",
  "admin.idp.metadata": "Metadaten-XML",
  "admin.idp.metadataNote":
    "Die Datei von deinem Identitätsteam. Sie enthält das Signaturzertifikat.",
  "admin.idp.clientId": "Client-ID",
  "admin.idp.clientSecret": "Client-Geheimnis",
  "admin.idp.cancel": "Abbrechen",
  "admin.idp.adding": "Wird hinzugefügt…",
  "admin.idp.addShort": "Hinzufügen",
  "admin.audit.decision.bot.declined": "Der Assistent hat abgelehnt",
  "admin.audit.decision.agent.stream_stalled":
    "Der Assistent hat nicht mehr geantwortet",
  "admin.audit.decision.computer.policy_loaded": "Grenze beim Start",
  "admin.audit.decision.computer.isolation_loaded": "Isolation beim Start",
  "admin.audit.decision.computer.control_taken":
    "Eine Person hat die Steuerung übernommen",
  "admin.audit.decision.computer.control_released":
    "Die Steuerung ging zurück an den Assistenten",
  "admin.audit.decision.computer.help_requested":
    "Der Assistent hat um Hilfe gebeten",
  "admin.audit.decision.computer.secret_requested":
    "Der Assistent hat nach einem Geheimnis gefragt",
  "admin.audit.decision.computer.secret_supplied":
    "Eine Person hat ein Geheimnis geliefert",
  "admin.audit.decision.computer.reset": "Der Computer wurde zurückgesetzt",
  "admin.audit.decision.computer.updated": "Der Computer wurde aktualisiert",
  "admin.audit.decision.computer.stopped": "Eine Person hat auf Stopp gedrückt",
  "admin.audit.decision.component.granted": "Diesem Assistenten gewährt",
  "admin.audit.decision.component.revoked": "Diesem Assistenten entzogen",
  "admin.audit.decision.component.published":
    "Veröffentlicht. Jeder Assistent kann es nutzen",
  "admin.audit.decision.component.unpublished":
    "Zurückgezogen. Kein Assistent kann es nutzen",
  "admin.audit.decision.component.draft_saved":
    "Entwurf gespeichert, noch nicht veröffentlicht",
  "admin.audit.decision.component.refused": "Abgelehnt",
  "admin.audit.decision.component.function_granted": "Darf dies lesen",
  "admin.audit.decision.component.function_revoked":
    "Darf dies nicht mehr lesen",
  "admin.audit.decision.component.function_called": "Echte Daten gelesen",
  "admin.audit.decision.component.function_refused": "Abgelehnt",
  "admin.audit.decision.component.function_failed":
    "Konnte nicht gelesen werden",
  "admin.audit.decision.mcp.tools_discovered":
    "Werkzeuge für einen Lauf angeboten",
  "admin.audit.decision.mcp.call_succeeded":
    "Im Namen dieses Assistenten aufgerufen",
  "admin.audit.decision.mcp.call_rejected": "Blockiert",
  "admin.audit.decision.mcp.call_failed": "Der Server hat nicht geantwortet",
  "admin.audit.decision.mcp.callback_refused":
    "Konnte nicht bestätigen, welcher Assistent es war",
  "admin.audit.decision.configuration.changed": "Konfiguration geändert",
  "admin.audit.decision.credential.created": "Zugangsdaten gespeichert",
  "admin.audit.discovery.under-floor":
    "So wenige Werkzeuge, dass alle angeboten wurden",
  "admin.audit.discovery.nothing-declared":
    "Kein Skill nennt eines dieser Werkzeuge",
  "admin.audit.discovery.unavailable":
    "Auswahl nicht möglich, deshalb wurden alle angeboten",
  "admin.audit.discovery.nothing-chosen":
    "Kein Skill passte, deshalb wurden alle angeboten",
  "admin.audit.discovery.selected": "Vom Skill ausgewählt",
  "admin.audit.title": "Audit",
  "admin.audit.desc":
    "Jede Aktion, die ein Assistent ausgeführt hat, und jede, die die Richtlinie dieser Installation abgelehnt hat.",
  "admin.audit.export": "CSV exportieren",
  "admin.audit.exporting": "Wird exportiert…",
  "admin.audit.refresh": "Aktualisieren",
  "admin.audit.exportFailed":
    "Die Audit-Ereignisse konnten nicht exportiert werden. Versuch es erneut.",
  "admin.audit.filter.all": "Alles",
  "admin.audit.filter.computer": "Computeraktionen",
  "admin.audit.filter.blocked": "Blockiert",
  "admin.audit.filter.didNot": "Nicht geschehen",
  "admin.audit.filter.nobody": "Niemand schaut zu",
  "admin.audit.capped":
    "Die Datei enthält die neuesten {count} Ereignisse, nicht alle. Grenze den Filter oder die Daten ein, um den Rest zu exportieren.",
  "admin.audit.loadError":
    "Das Audit-Protokoll konnte nicht geladen werden. Lade die Seite neu.",
  "admin.audit.empty": "Noch keine Ereignisse passen zu diesem Filter.",
  "admin.audit.col.when": "Wann",
  "admin.audit.col.what": "Was",
  "admin.audit.col.on": "Auf",
  "admin.audit.col.bot": "Assistent",
  "admin.audit.col.startedBy": "Gestartet von",
  "admin.audit.col.decision": "Entscheidung",
  "admin.audit.by.routine": "Eine Routine",
  "admin.audit.by.handedOnBy": "Weitergegeben von {name}",
  "admin.audit.by.handedOn": "Weitergegeben",
  "admin.audit.by.memory": "Eine Gedächtnisquelle",
  "admin.audit.by.responsibility": "Eine Zuständigkeit",
  "admin.audit.by.deployment": "Diese Installation",
  "admin.audit.by.remote":
    "Ein Browser, der nicht mit dem Computer gekoppelt ist",
  "admin.audit.by.person": "Eine Person",
  "admin.audit.routed.mention": "Die Person hat diesen Assistenten gewählt",
  "admin.audit.routed.default": "An den Standard-Assistenten geschickt",
  "admin.audit.routed.meant":
    "An den Assistenten geschickt, für den es gedacht war",
  "admin.audit.toolsOf": "{offered} von {granted} Werkzeugen",
  "admin.audit.blocked": "Blockiert",
  "admin.audit.didNot": "Nicht geschehen",
  "admin.audit.allowed": "Erlaubt",
  "admin.audit.reportedByBot": ", vom Assistenten selbst gemeldet",
  "admin.audit.dryRun": "Probelauf: aufgezeichnet, nicht durchgesetzt",
  "admin.nav.back": "Zurück zur App",
  "admin.nav.overview": "Übersicht",
  "admin.nav.reach": "Was Assistenten erreichen können",
  "admin.nav.do": "Was Assistenten tun können",
  "admin.nav.in": "Wer hineinkommt",
  "admin.nav.happened": "Was passiert ist",
  "admin.nav.credentials": "Zugangsdaten",
  "admin.nav.boundaries": "Grenzen",
  "admin.nav.approvals": "Genehmigungen",
  "admin.nav.computers": "Computer",
  "admin.nav.plugins": "Plugins",
  "admin.nav.skills": "Skills",
  "admin.nav.learning": "Automatisches Lernen",
  "admin.nav.components": "UI-Komponenten",
  "admin.nav.playground": "Playground",
  "admin.nav.people": "Personen",
  "admin.nav.idp": "Identitätsanbieter",
  "admin.nav.audit": "Audit",
  "admin.enterprise.mode.allow_all": "Gesamten Netzwerkzugriff erlauben",
  "admin.enterprise.mode.defaults_plus_allowlist":
    "Standardliste plus Team-Zulassungsliste",
  "admin.enterprise.mode.allowlist_only": "Nur Team-Zulassungsliste",
  "admin.enterprise.noPolicy":
    "Keine Richtlinie. Die Computer der Assistenten erreichen alles, was der Cluster erlaubt",
  "admin.enterprise.locked": " · gesperrt",
  "admin.enterprise.loadError":
    "Die Unternehmenssteuerung konnte nicht geladen werden. Lade die Seite neu.",
  "admin.enterprise.title": "Unternehmenssteuerung",
  "admin.enterprise.description":
    "Was Mitglieder nutzen können, wie die Computer der Assistenten das Netzwerk erreichen und was aufgezeichnet wird. Jede Änderung erscheint im Audit.",
  "admin.enterprise.signin.description":
    "Adressen in {env} können sich immer per Social-Login anmelden, als Notzugang. Jede dieser Anmeldungen erscheint im Audit.",
  "admin.enterprise.signin.title": "Anmeldung",
  "admin.enterprise.sso.title": "SSO verlangen",
  "admin.enterprise.sso.on":
    "Personen können sich nur über einen registrierten SAML- oder OpenID-Connect-Anbieter anmelden.",
  "admin.enterprise.sso.off":
    "Personen können sich auch mit Google, Microsoft oder Okta anmelden.",
  "admin.enterprise.scim.title": "SCIM-Provisionierung",
  "admin.enterprise.scim.on":
    "Basis-URL des Verzeichnisses {url} mit dem Bearer-Token {env}. Beim Deprovisionieren werden Sitzungen beendet, die Adresse gesperrt, die Zugangsdaten der Konnektoren eingezogen und die Computer der Person gestoppt.",
  "admin.enterprise.scim.unsetUrl": "(BETTER_AUTH_URL setzen)",
  "admin.enterprise.scim.off":
    "Aus. Setze {env}, um die Provisionierung von Okta, Entra oder einem anderen Verzeichnis anzunehmen.",
  "admin.enterprise.on": "An",
  "admin.enterprise.off": "Aus",
  "admin.enterprise.cap.description":
    "Jeder Schalter gilt für die gesamte Organisation. Eine Rolle kann ihn überschreiben, und eine Verzeichnisgruppe kann eine Fähigkeit erhalten, die die Organisation ausgeschaltet hat.",
  "admin.enterprise.cap.title": "Fähigkeiten",
  "admin.enterprise.cap.offFor":
    "Für alle aus, außer eine Rolle oder Gruppe schaltet sie ein.",
  "admin.enterprise.over.title": "Überschreibungen für Rollen und Gruppen",
  "admin.enterprise.over.none": "Keine. Alle bekommen die Schalter oben",
  "admin.enterprise.over.set": "{count} gesetzt",
  "admin.enterprise.net.description":
    "Wohin sich die Computer der Assistenten verbinden dürfen. Änderungen erreichen laufende Computer innerhalb von Sekunden, ohne Neustart. Eine Gruppenrichtlinie ersetzt die der Organisation, außer diese ist gesperrt.",
  "admin.enterprise.net.title": "Netzwerk",
  "admin.enterprise.net.org": "Organisation",
  "admin.enterprise.net.group": "Gruppe: {name}",
  "admin.enterprise.net.addGroup": "Gruppenrichtlinie hinzufügen",
  "admin.enterprise.mcp.description":
    "Bei eingeschalteter Zulassungsliste können Assistenten nur Tools auf den hier genehmigten MCP-Servern aufrufen. Aufrufe an jeden anderen Server werden abgelehnt.",
  "admin.enterprise.mcp.title": "MCP-Server",
  "admin.enterprise.mcp.only": "Nur genehmigte Server",
  "admin.enterprise.mcp.approved": "{count} genehmigt",
  "admin.enterprise.mcp.offDesc":
    "Aus. Assistenten können jeden registrierten Server nutzen, auf den sie Zugriff haben.",
  "admin.enterprise.mcp.onlyAria": "Nur genehmigte MCP-Server",
  "admin.enterprise.mcp.approveAria": "{name} genehmigen",
  "admin.enterprise.models.description":
    "Der integrierte Assistent läuft mit {model}. Ein entfernter Assistent wählt selbst, und das Modell, das er meldet, wird aufgezeichnet.",
  "admin.enterprise.models.configured":
    "dem in dieser Installation konfigurierten Modell",
  "admin.enterprise.models.title": "Modelle",
  "admin.enterprise.models.allowlist": "Modell-Zulassungsliste",
  "admin.enterprise.models.allowlistOn":
    "Ein integrierter Assistent mit einem nicht gelisteten Modell wird abgelehnt, bevor er läuft.",
  "admin.enterprise.models.allowlistOff":
    "Aus. Jedes Modell kann verwendet werden.",
  "admin.enterprise.models.allowed": "Erlaubte Modelle",
  "admin.enterprise.models.none": "Keine aufgeführt",
  "admin.enterprise.models.listDesc":
    "Ein Modell pro Zeile, als Anbieter/Modell, zum Beispiel {example}.",
  "admin.enterprise.rec.description":
    "Setze {env}, um Audit-Ereignisse und Aktionen der Assistenten an deinen OpenTelemetry-Collector oder dein SIEM zu streamen. Sie tragen das Tag {tag}.",
  "admin.enterprise.rec.title": "Aufzeichnung und Export",
  "admin.enterprise.rec.action": "Action Recording",
  "admin.enterprise.rec.actionOn":
    "Shell-Befehle, die Assistenten ausführen, werden ohne Geheimnisse aufgezeichnet und {days} Tage aufbewahrt.",
  "admin.enterprise.rec.actionOff": "Aus. Befehle erscheinen nur im Audit.",
  "admin.enterprise.rec.otel": "OpenTelemetry-Export",
  "admin.enterprise.rec.otelOn": "Export über OTLP/HTTP.",
  "admin.enterprise.rec.otelOff":
    "Nicht eingerichtet. Setze {env} auf dem Server.",
  "admin.enterprise.comp.description":
    "Das Stoppen eines Computers beendet die laufenden Assistenten und behält seine Festplatte. Beim nächsten Einsatz bekommt der Assistent einen frischen Computer. Um die Computer einer einzelnen Person zu stoppen, gehe zu Personen.",
  "admin.enterprise.comp.title": "Computer",
  "admin.enterprise.comp.stopInactive": "Inaktive Computer stoppen",
  "admin.enterprise.comp.afterDays": "Nach {days} Tagen ohne Nutzung",
  "admin.enterprise.usage.error":
    "Die Modellnutzung konnte nicht geladen werden. Lade die Seite neu.",
  "admin.enterprise.usage.empty":
    "Keine Läufe von Assistenten in den letzten 30 Tagen.",
  "admin.enterprise.usage.runs": "{runs} Läufe von {people} {who} in 30 Tagen",
  "admin.enterprise.usage.person": "Person",
  "admin.enterprise.usage.people": "Personen",
  "admin.enterprise.usage.refused": " · {count} nicht auf der Zulassungsliste",
  "admin.enterprise.recorded.error":
    "Die aufgezeichneten Aktionen konnten nicht geladen werden. Lade die Seite neu.",
  "admin.enterprise.recorded.empty": "Noch keine Befehle aufgezeichnet.",
  "admin.enterprise.recorded.local": "Rechner des Mitglieds",
  "admin.enterprise.recorded.bot": "Assistent {id}",
  "admin.enterprise.sweep.stopping": "Wird gestoppt…",
  "admin.enterprise.sweep.now": "Inaktive Computer jetzt stoppen",
  "admin.enterprise.sweep.stopped": "{count} gestoppt.",
  "admin.enterprise.ov.admins": "Admins",
  "admin.enterprise.ov.members": "Mitglieder",
  "admin.enterprise.ov.group": "Gruppe: {name}",
  "admin.enterprise.ov.scope": "Geltungsbereich",
  "admin.enterprise.ov.groupNote":
    "Eine Gruppe kann nur etwas hinzufügen. Erlauben gibt ihren Mitgliedern die Fähigkeit, auch wenn die Organisation sie ausgeschaltet hat.",
  "admin.enterprise.ov.roleNote":
    "Die Einstellung einer Rolle ersetzt den Organisationsschalter für alle mit dieser Rolle.",
  "admin.enterprise.ov.forScope": "{title} für {scope}",
  "admin.enterprise.ov.inherit": "Übernehmen",
  "admin.enterprise.ov.grant": "Erlauben",
  "admin.enterprise.netd.org": "Netzwerkrichtlinie der Organisation",
  "admin.enterprise.netd.group": "Netzwerkrichtlinie der Gruppe",
  "admin.enterprise.netd.groupLabel": "Gruppe",
  "admin.enterprise.netd.mode": "Modus",
  "admin.enterprise.netd.allowlist": "Zulassungsliste",
  "admin.enterprise.netd.help":
    "Eine pro Zeile. Eine Domain umfasst ihre Subdomains. *.name umfasst nur Subdomains. Ein IP-Bereich kann Ports auflisten. Standardmäßig gelten {first} und {more} weitere Paket- und Quell-Hosts.",
  "admin.enterprise.netd.lock":
    "Sperren, damit Gruppen diese Richtlinie nicht ersetzen können",
  "admin.enterprise.netd.remove": "Richtlinie entfernen",
  "admin.enterprise.days.label": "Tage ohne Nutzung",
  "admin.enterprise.days.help": "0 schaltet es aus. Wird stündlich geprüft.",
  "admin.plugins.title": "Plugins",
  "admin.plugins.description":
    "Was diese Installation erreichen kann und welche Assistenten es nutzen dürfen. Ein hinzugefügtes Plugin gilt für alle. Auf seiner Seite wählst du, welche Assistenten seine Tools bekommen.",
  "admin.plugins.loadError":
    "Die Plugins konnten nicht geladen werden. Lade die Seite neu.",
  "admin.plugins.connected.description":
    "Für alle hinzugefügt. Öffne eines, um es einzurichten und zu wählen, welche Assistenten seine Tools bekommen.",
  "admin.plugins.connected.title": "Verbunden",
  "admin.plugins.connected.empty":
    "Noch nichts verbunden. Wähle unten eines aus der Liste.",
  "admin.plugins.explore.description":
    "Geprüfte Server aus erster Hand. Öffne einen, um ihn hinzuzufügen.",
  "admin.plugins.explore.title": "Plugins entdecken",
  "admin.plugins.explore.empty": "Jedes Plugin im Katalog ist verbunden.",
  "admin.plugins.notAdded": "Nicht hinzugefügt",
  "admin.plugins.more.title": "Weitere Apps",
  "admin.plugins.sum.notConnected": "Nicht verbunden",
  "admin.plugins.sum.noTools": "Noch keine Tools",
  "admin.plugins.sum.tools": { one: "{count} Tool", other: "{count} Tools" },
  "admin.plugins.sum.toolsNoBots": "{tools} · keine Assistenten",
  "admin.plugins.sum.bots": {
    one: "{count} Assistent",
    other: "{count} Assistenten",
  },
  "admin.plugins.requests": {
    one: "{count} Anfrage",
    other: "{count} Anfragen",
  },
  "admin.plugins.key.grant.none": "Keine Assistenten",
  "admin.plugins.key.grant.one": "1 Assistent",
  "admin.plugins.key.grant.all": "Alle Assistenten",
  "admin.plugins.key.grant.some": "{held} von {total} Assistenten",
  "admin.plugins.key.held.none": "Keine Tools",
  "admin.plugins.key.held.one": "1 Tool",
  "admin.plugins.key.held.all": "Alle Tools",
  "admin.plugins.key.held.some": "{held} von {total} Tools",
  "admin.plugins.key.notApproved": "Nicht genehmigt",
  "admin.plugins.key.unreadableTitle": "Dein Konto",
  "admin.plugins.key.unreadable":
    "Es konnte nicht geladen werden, ob du hier ein Konto verbunden hast. Lade die Seite neu oder prüfe die Protokolle dieser Installation, falls es weiter auftritt.",
  "admin.plugins.key.noConsent":
    "{product} hat keinen Einwilligungslink zurückbekommen, also wurde nichts verbunden. Versuche es erneut oder prüfe die Einrichtung dieses Konnektors, falls es weiter auftritt.",
  "admin.plugins.key.reassurance":
    "Die Einrichtung ist auch ohne sie abgeschlossen, und sie erreicht nur deine Dokumente.",
  "admin.plugins.key.notPlugin.description":
    "Es gibt kein Plugin mit diesem Namen, weder hier noch im Katalog.",
  "admin.plugins.key.notPlugin.title": "Kein Plugin",
  "admin.plugins.key.notPlugin.empty": "Nichts zu konfigurieren.",
  "admin.plugins.key.enable.title": "Für diese Installation aktivieren",
  "admin.plugins.key.enable.on":
    "Assistenten können seine Tools bekommen. Wenn du das ausschaltest, wird es entfernt, und kein Assistent hat mehr Zugriff auf seine Tools.",
  "admin.plugins.key.enable.off":
    "Kein Assistent kann diesen Anbieter erreichen. Schalte es ein, um es einzurichten und Assistenten seine Tools zu geben.",
  "admin.plugins.key.enable.aria": "{title} für diese Installation aktivieren",
  "admin.plugins.key.whose.title": "Wessen Konto",
  "admin.plugins.key.whose.shared": "Ein gemeinsames Konto für alle.",
  "admin.plugins.key.whose.personal": "Jede Person verbindet ihr eigenes.",
  "admin.plugins.key.whose.makePersonal": "Persönlich machen",
  "admin.plugins.key.whose.makeShared": "Gemeinsam machen",
  "admin.plugins.key.conn.oauth":
    "Dieser Anbieter antwortet als die Person, die fragt. Die Installation registriert einen OAuth-Client, und jede Person verbindet ihr eigenes Konto. Ein Assistent sieht nur, was diese Person sehen kann.",
  "admin.plugins.key.conn.secret":
    "Dieser Anbieter antwortet als die Person, die fragt. Jede Person fügt ihr eigenes App-Passwort auf ihrer Seite Verbindungen ein. Hier gibt es nichts zu registrieren, und die Installation speichert kein eigenes Passwort.",
  "admin.plugins.key.conn.builtin":
    "In diese Installation eingebaut. Es gibt keinen Anbieter, den man erreichen müsste, und keine Zugangsdaten, die man aufbewahrt. Ein Aufruf läuft als die Person, die ihn ausgelöst hat.",
  "admin.plugins.key.conn.bearer":
    "Was diese Installation an den Anbieter sendet. Ein einziger Zugangsdatensatz für alle.",
  "admin.plugins.key.conn.title": "Verbindung",
  "admin.plugins.key.builtin.desc":
    "Nichts einzurichten. Diese Tools laufen innerhalb dieser Installation, mit ihren eigenen Daten.",
  "admin.plugins.key.builtin.badge": "Eingebaut",
  "admin.plugins.key.secret.title": "App-Passwort",
  "admin.plugins.key.secret.desc":
    "Jede Person erstellt ihr eigenes bei Google und fügt es auf ihrer Seite Verbindungen ein. Es erreicht das gesamte Postfach, deshalb legen die Tools, die du unten vergibst, fest, was Assistenten tun dürfen.",
  "admin.plugins.key.secret.badge": "Pro Person",
  "admin.plugins.key.reach.title": "So wird es erreicht",
  "admin.plugins.key.token.title": "Zugriffstoken",
  "admin.plugins.key.token.desc":
    "Wird bei jedem Aufruf an diesen Anbieter mitgesendet.",
  "admin.plugins.key.saved": "Gespeichert",
  "admin.plugins.key.notSet": "Nicht gesetzt",
  "admin.plugins.key.client.title": "OAuth-Client",
  "admin.plugins.key.client.selfDesc":
    "Diese Installation registriert sich beim ersten Verbinden selbst beim Anbieter. Es gibt nichts einzufügen.",
  "admin.plugins.key.client.selfBadge": "Selbst registriert",
  "admin.plugins.key.client.desc":
    "Identifiziert diese Installation gegenüber dem Anbieter. Allein kann er auf niemandes Dokumente zugreifen.",
  "admin.plugins.key.client.registered": "Registriert",
  "admin.plugins.key.client.notRegistered": "Nicht registriert",
  "admin.plugins.key.team.connected":
    "Verbunden{who}. Jeder Assistent mit diesen Tools handelt als dieses Konto.",
  "admin.plugins.key.team.as": " als {name}",
  "admin.plugins.key.team.by": " von {name}",
  "admin.plugins.key.team.disconnected":
    "Es ist kein Team-Konto verbunden. Assistenten mit diesen Tools werden abgelehnt.",
  "admin.plugins.key.team.heading": "Team-Konto",
  "admin.plugins.key.team.notice":
    "Melde dich mit dem Team-Konto an, nicht mit deinem eigenen.",
  "admin.plugins.key.mine.connected":
    "Verbunden. Ein Assistent mit diesen Tools nutzt dein {title} als du. {note}",
  "admin.plugins.key.mine.tryConnect":
    "Verbinde dein eigenes Konto, um diesen Konnektor auszuprobieren. {note}",
  "admin.plugins.key.oauthAcct.connected":
    "Verbunden. Ein Assistent mit diesen Tools nutzt dein {title} als du. Alle anderen verbinden ihr eigenes.",
  "admin.plugins.key.oauthAcct.connect":
    "Verbinde dein eigenes Konto, um diesen Konnektor auszuprobieren. Die Einrichtung ist auch ohne es abgeschlossen, und es erreicht nur deine Dokumente.",
  "admin.plugins.key.connected": "Verbunden",
  "admin.plugins.key.connect": "Verbinden",
  "admin.plugins.key.instance.title": "Instanz-Host",
  "admin.plugins.key.instance.desc":
    "Dieser Anbieter gibt jedem Kunden einen eigenen Hostnamen. Er wird vor dem Speichern gegen das Muster des Anbieters geprüft.",
  "admin.plugins.key.docs.builtin": "Dokumentation",
  "admin.plugins.key.docs.vendor": "Dokumentation des Anbieters",
  "admin.plugins.key.docs.builtinDesc":
    "Was diese Tools bieten, von den Leuten, die sie pflegen.",
  "admin.plugins.key.docs.vendorDesc":
    "Was dieser Server bietet, von den Leuten, die ihn pflegen.",
  "admin.plugins.key.redirect.dynamic":
    "Die Installation registriert ihre Weiterleitungs-URI selbst. Beim Anbieter gibt es nichts hinzuzufügen.",
  "admin.plugins.key.redirect.manual":
    "Füge dies beim Anbieter zu den autorisierten Weiterleitungs-URIs des Clients hinzu, genau so geschrieben. Ein falsches Zeichen scheitert dort, mit einer Fehlermeldung, die {product} nicht erwähnt.",
  "admin.plugins.key.redirect.noUrl":
    "Diese Installation hat keine öffentliche URL, deshalb kann niemand das Verbinden abschließen. Setze {env}.",
  "admin.plugins.key.tools.refresh": "Tools aktualisieren",
  "admin.plugins.key.tools.grant": "Tools vergeben…",
  "admin.plugins.key.tools.description":
    "Ein Assistent sieht nur die Tools, die er bekommen hat. Jeder Aufruf wird geprüft, wenn er stattfindet, deshalb gilt ein Entzug des Zugriffs ab dem nächsten Aufruf.",
  "admin.plugins.key.tools.title": "Tools",
  "admin.plugins.key.tools.empty":
    "Keine Tools aufgeführt. Aktualisiere die Tools, um erneut zu prüfen.",
  "admin.plugins.key.tools.writes": "ändert etwas",
  "admin.plugins.key.tools.reads": "liest",
  "admin.plugins.key.byBot": "Nach Assistent",
  "admin.plugins.key.byBot.hidden":
    "In deiner Liste ausgeblendet. Schalte die Aktionen dieser App einzeln an oder aus.",
  "admin.plugins.key.byBot.shown":
    "Schalte die Aktionen dieser App einzeln an oder aus.",
  "admin.plugins.key.gone.description":
    "Dieser Anbieter listet diese nicht mehr auf. Kein Assistent sieht sie, und keiner kann sie aufrufen. Der Zugriff ist weiterhin gespeichert und kommt zurück, wenn der Anbieter das Tool wieder auflistet. Um ihn zu entfernen, nutze die eigene Seite des Assistenten.",
  "admin.plugins.key.gone.title": "Vergeben, aber nicht mehr aufgelistet",
  "admin.plugins.key.gone.row": "Nicht aufgelistet von {title}{asOf}.",
  "admin.plugins.key.gone.asOf": " seit der letzten Aktualisierung",
  "admin.plugins.key.dlg.client": "OAuth-Client für {title}",
  "admin.plugins.key.dlg.instance": "Instanz-Host für {title}",
  "admin.plugins.key.dlg.token": "Zugriffstoken für {title}",
  "admin.plugins.key.dlg.clientDesc":
    "Aus der Konsole des Anbieters. Das Geheimnis wird im Tresor dieser Installation gespeichert und nie wieder angezeigt.",
  "admin.plugins.key.dlg.instanceDesc":
    "Dein eigener Hostname bei diesem Anbieter. Er wird vor dem Speichern gegen das Muster des Anbieters geprüft.",
  "admin.plugins.key.dlg.tokenDesc":
    "Wird im Tresor dieser Installation gespeichert und nie wieder angezeigt.",
  "admin.plugins.key.dlg.clientId": "Client-ID",
  "admin.plugins.key.dlg.clientSecret": "Client-Geheimnis",
  "admin.plugins.key.gr.title": "Tools vergeben",
  "admin.plugins.key.gr.description":
    "Jede Vergabe ist eine eigene Zeile im Audit. Tools, die etwas ändern, werden bei jedem Aufruf weiterhin gegen die Grenzen geprüft.",
  "admin.plugins.key.gr.to": "An",
  "admin.plugins.key.gr.reads": "Liest",
  "admin.plugins.key.gr.writes": "Ändert etwas",
  "admin.plugins.key.gr.selectAll": "Alle auswählen",
  "admin.plugins.key.gr.button": "Vergeben",
  "admin.plugins.key.gr.progress": "{current} von {total} werden vergeben…",
  "admin.plugins.key.gr.summary": {
    one: "{count} Tool an {names} vergeben.",
    other: "{count} Tools an {names} vergeben.",
  },
  "admin.plugins.key.gr.changing": {
    one: "{count} ändert etwas.",
    other: "{count} ändern etwas.",
  },
  "admin.home.reach.desc":
    "Was ein Assistent außerhalb von {product} berühren darf, und die Grenzen dafür.",
  "admin.home.credentials.desc": "Schlüssel und Tokens für diese Installation.",
  "admin.home.boundaries.desc": "Dinge, die kein Assistent je tun darf.",
  "admin.home.approvals.desc":
    "Wonach die Assistenten der Mitglieder fragen müssen, bevor sie handeln.",
  "admin.home.computers.desc":
    "Die Maschinen, auf denen Assistenten Tools ausführen.",
  "admin.home.do.desc":
    "Apps, Skills und Oberflächenelemente, die jeder Assistent nutzen kann.",
  "admin.home.plugins.desc":
    "Die Dienste, die {product} erreichen kann, und welche Assistenten sie nutzen dürfen.",
  "admin.home.skills.desc":
    "Benannte Anweisungen, die jeder mit / ausführen kann.",
  "admin.home.learning.desc":
    "Aus abgeschlossenen Gesprächen lernen und die Skills prüfen, die dabei vorgeschlagen werden.",
  "admin.home.components.desc":
    "Eigene Elemente, die ein Assistent in einem Gespräch zeichnen kann.",
  "admin.home.playground.desc":
    "Schreibe eine Komponente und sieh zu, wie sie sich beim Tippen darstellt.",
  "admin.home.engines.desc":
    "Die KI-Engines, auf denen Mitglieder laufen, und ob jede gerade antworten kann.",
  "admin.home.people.desc":
    "Alle, die sich angemeldet haben, wer die Admins sind und wem der Zugriff entzogen wurde.",
  "admin.home.enterprise.desc":
    "Rollen und Gruppen, verpflichtendes SSO, SCIM, Netzwerkrichtlinie, MCP- und Modell-Zulassungslisten, Action Recording.",
  "admin.home.idp.desc":
    "Der SAML- oder OpenID-Connect-Anbieter deines Unternehmens, zugeordnet über die E-Mail-Domain.",
  "admin.home.audit.desc":
    "Jede Aktion in {product} und wer sie ausgeführt hat.",
  "admin.home.description":
    "Einstellungen für alle in dieser Installation. Eine Änderung hier betrifft jede Person und jeden Assistenten.",
  "admin.plugins.directoryError":
    "Die Plugin-Einstellungen konnten nicht geladen werden. Lade die Seite neu.",
  "admin.components.description":
    "Womit jeder Assistent antworten kann. Jede veröffentlichte Komponente ist für jeden Assistenten an. Schalte eine aus, und dieser Assistent sieht sie nie. Änderungen und Ablehnungen erscheinen im Audit.",
  "admin.components.loadError":
    "Die Komponenten konnten nicht geladen werden. Lade die Seite neu.",
  "admin.components.emptyTitle": "Noch keine Komponenten",
  "admin.components.emptyDesc":
    "Komponenten, die deine Assistenten nutzen können, erscheinen hier.",
  "admin.audit.silence.quiet": "{seconds} s still",
  "admin.audit.silence.nothing": "{quiet}, ohne überhaupt etwas zu sagen",
  "admin.audit.silence.after": {
    one: "{quiet}, nach {count} Block",
    other: "{quiet}, nach {count} Blöcken",
  },
  "admin.compDetail.title": "Komponenten",
  "admin.compDetail.noSuch.title": "Diese Komponente gibt es nicht",
  "admin.compDetail.noSuch.description":
    "Es gibt keine Komponente mit diesem Namen.",
  "admin.compDetail.noSuch.hint":
    "Sie wurde vielleicht umbenannt, oder diese Installation liefert sie nicht mehr mit.",
  "admin.compDetail.back": "Zurück zu den Komponenten",
  "admin.compDetail.grant.noBots": "Noch keine Assistenten",
  "admin.compDetail.grant.all": {
    one: "Alle {count} Assistenten",
    other: "Alle {count} Assistenten",
  },
  "admin.compDetail.grant.none": "Keine Assistenten",
  "admin.compDetail.grant.some": "{granted} von {total} Assistenten",
  "admin.compDetail.fn.none": "Diese Installation hat keine Datenfunktionen",
  "admin.compDetail.fn.nothing":
    "Nichts. Sie zeigt nur, was der Assistent ihr übergibt.",
  "admin.compDetail.notPublished":
    "Nicht veröffentlicht. Kein Assistent kann sie sehen.",
  "admin.compDetail.config.title": "Konfiguration",
  "admin.compDetail.config.description":
    "Wofür diese Komponente da ist und welche Assistenten damit antworten können.",
  "admin.compDetail.notInBuild.title": "Nicht in diesem Build",
  "admin.compDetail.notInBuild.description":
    "{product} kann sie nicht darstellen. Die Einstellungen unten haben keine Wirkung.",
  "admin.compDetail.published": "Veröffentlicht",
  "admin.compDetail.published.on": "Assistenten können damit antworten.",
  "admin.compDetail.published.off": "Kein Assistent kann sie verwenden.",
  "admin.compDetail.published.changes":
    "Die Beschreibung hat unveröffentlichte Änderungen.",
  "admin.compDetail.description": "Beschreibung",
  "admin.compDetail.nothingYet": "Noch nichts",
  "admin.compDetail.availableTo": "Verfügbar für",
  "admin.compDetail.canRead": "Darf lesen",
  "admin.compDetail.details": "Details",
  "admin.compDetail.kind": "Art",
  "admin.compDetail.calledAs": "Aufgerufen als",
  "admin.compDetail.lastChanged": "Zuletzt geändert",
  "admin.compDetail.by": "von {name}",
  "admin.compDetail.descDlg.description":
    "Was das Modell liest, wenn es entscheidet, ob es diese Komponente verwendet. Ohne Veröffentlichung der Komponente hat das keine Wirkung.",
  "admin.compDetail.grantsDlg.description":
    "Schalte einen Assistenten aus, und er erfährt nie, dass es diese Komponente gibt. Änderungen gelten sofort.",
  "admin.compDetail.grantsDlg.empty": "Noch keine Assistenten.",
  "admin.compDetail.fnDlg.description":
    "Die Daten, die diese Komponente abrufen kann, um sich darzustellen. Das ist getrennt von „Verfügbar für“. Sind alle ausgeschaltet, zeigt sie nur, was der Assistent ihr übergibt. Jeder Lesezugriff erscheint im Audit. Änderungen gelten sofort.",
  "admin.compDetail.fnDlg.empty":
    "Diese Installation hat keine Datenfunktionen.",
  "admin.computers.description":
    "Der Browser jedes Assistenten und das Profil, das er behält. Das Profil hält einen Assistenten angemeldet. Wenn du es zurücksetzt, ist der Assistent überall abgemeldet.",
  "admin.computers.loadError":
    "Die Computer konnten nicht geladen werden. Lade die Seite neu.",
  "admin.computers.shared.lead": "Alle Assistenten teilen sich einen Computer.",
  "admin.computers.shared.before":
    "Sie teilen sich seine Anmeldungen, Dateien und Sitzung. Ein Assistent kann auf das zugreifen, wo sich ein anderer angemeldet hat. Stelle",
  "admin.computers.shared.after":
    "ein, damit jeder Assistent seinen eigenen bekommt.",
  "admin.computers.perBot":
    "Jeder Assistent hat seinen eigenen Computer, mit eigenem Container, eigenen Dateien und eigenem Browser-Profil.",
  "admin.computers.list.title": "Computer in dieser Installation",
  "admin.computers.list.error": "Die Liste konnte nicht geladen werden.",
  "admin.computers.list.empty":
    "Noch keine Computer. Einer erscheint, sobald ein Assistent zum ersten Mal eine Seite öffnet.",
  "admin.computers.running": "Browser läuft seit {time}",
  "admin.computers.notRunning":
    "Kein Browser läuft. Er startet, wenn der Assistent ihn das nächste Mal braucht.",
  "admin.computers.egress.unknown": "Ausgang nicht gemeldet",
  "admin.computers.egress.direct": "Geht direkt hinaus",
  "admin.computers.egress.via": "Geht über {egress} hinaus",
  "admin.computers.updateAvailable": "Update verfügbar",
  "admin.computers.update": "Computer aktualisieren",
  "admin.computers.working": "Wird ausgeführt…",
  "admin.computers.stop": "Browser stoppen",
  "admin.computers.reset": "Zurücksetzen",
  "admin.computers.resetTitle": "Den Computer von {name} zurücksetzen?",
  "admin.computers.resetDesc":
    "Sein Profil wird gelöscht. Der Assistent wird von jedem Dienst abgemeldet und startet neu. Das lässt sich nicht rückgängig machen.",
  "admin.computers.resetting": "Wird zurückgesetzt…",
  "admin.computers.resetIt": "Zurücksetzen",
  "admin.computers.updateTitle": "Den Computer von {name} aktualisieren?",
  "admin.computers.updateDesc":
    "Er wechselt auf das Computer-Image, das diese Installation jetzt verwendet. Seine Dateien und Anmeldungen bleiben erhalten. Läuft er gerade, startet er neu und beendet, was er tut.",
  "admin.computers.updating": "Wird aktualisiert…",
  "admin.computers.updateIt": "Aktualisieren",
  "admin.computers.foot.stopLead": "Stoppen",
  "admin.computers.foot.stopRest":
    "schließt den Browser und behält seine Anmeldungen. Er startet wieder, wenn der Assistent ihn das nächste Mal braucht.",
  "admin.computers.foot.resetLead": "Zurücksetzen",
  "admin.computers.foot.resetRest":
    "löscht das Profil und meldet den Assistenten überall ab.",
  "admin.computers.foot.updateLead": "Computer aktualisieren",
  "admin.computers.foot.updateRest":
    "erscheint, wenn ein Computer ein älteres Image verwendet. Es bringt den Computer auf das neue und behält seine Dateien und Anmeldungen.",
  "admin.computers.foot.audit": "Alle drei erscheinen im",
  "admin.computers.host.description":
    "Wähle Ordner aus, die ein Assistent auf diesem Computer lesen darf. Die Desktop-App fragt vor jeder Änderung und jedem Befehl nach. Der Zugriff endet, wenn du {product} beendest.",
  "admin.computers.host.title": "Ordner auf diesem Computer",
  "admin.computers.host.offline":
    "Die Desktop-App ist offline. Öffne sie, um Ordner zu genehmigen oder Befehle auszuführen.",
  "admin.computers.host.noBots":
    "Noch keine Assistenten. Lege einen an und wähle dann seine Ordner.",
  "admin.computers.host.choose": "Ordner auswählen",
  "admin.computers.host.waiting": "Warten…",
  "admin.computers.host.readOnlyNote":
    "Ordner sind schreibgeschützt. Wenn ein Assistent schreiben muss, fragt dich die Desktop-App zuerst.",
  "admin.computers.host.stopAccess": "Ordnerzugriff beenden",
  "admin.computers.host.stopping": "Wird beendet…",
  "admin.computers.host.viewAudit": "Audit ansehen",
  "admin.computers.host.readOnly": "Schreibgeschützt",
  "admin.computers.host.revoke": "Entziehen",
  "admin.computers.host.revoking": "Wird entzogen…",
  "admin.computers.host.pendingFrom": "{label} von {owner}.",
  "admin.computers.host.pendingFromFor": "{label} von {owner} für {name}.",
  "admin.computers.host.folders": {
    one: "{count} schreibgeschützter Ordner",
    other: "{count} schreibgeschützte Ordner",
  },
  "admin.computers.host.requests": {
    one: "{count} offene Anfrage",
    other: "{count} offene Anfragen",
  },
  "admin.computers.host.none": "Keine Ordner genehmigt.",
  "admin.computers.host.owner": "die Person am Desktop",
  "admin.computers.host.p.write":
    "Dateiänderung wartet auf Genehmigung oder darauf, abgeschlossen zu werden",
  "admin.computers.host.p.run":
    "Befehl wartet auf Genehmigung oder darauf, abgeschlossen zu werden",
  "admin.computers.host.p.list": "Dateien werden aufgelistet",
  "admin.computers.host.p.read": "Eine Datei wird gelesen",
  "admin.computers.host.p.stop": "Ordnerarbeit wird beendet",
  "admin.computers.host.p.default": "Ordnerzugriff wartet auf Genehmigung",
  "admin.learning.description":
    "Aus abgeschlossenen Unterhaltungen lernen, die von Intelligence vorgeschlagenen Skills prüfen und veröffentlichte Skills an Assistenten geben.",
  "admin.learning.auto.assigned":
    "{product} hat dem Intelligence-Projekt den Container „{container}“ automatisch zugewiesen. Du kannst ihn hier ändern.",
  "admin.learning.auto.absent":
    "Dieses Intelligence-Projekt hat noch keinen Learning-Container „{container}“. Es wird nichts gesammelt.",
  "admin.learning.auto.notEntitled":
    "Der Tarif dieses Intelligence-Projekts enthält kein Learning. Es wurde kein Container zugewiesen.",
  "admin.learning.auto.unavailable":
    "Intelligence war nicht erreichbar, um den Learning-Container dieses Projekts zu finden. {product} versucht es erneut.",
  "admin.learning.target.container": "Container-ID: {label}",
  "admin.learning.target.revision": "Genaue Revision (optional)",
  "admin.learning.target.revisionAria": "Revision: {label}",
  "admin.learning.target.latest": "Zuletzt veröffentlicht",
  "admin.learning.create.busy": "Wird erstellt…",
  "admin.learning.create.button": "Container {container} erstellen",
  "admin.learning.create.note":
    "Verwendet die Zugangsdaten dieser Installation, nicht den Laufzeitschlüssel.",
  "admin.learning.create.how": "So erstellst du ihn: ",
  "admin.learning.part.title": "Teilnahme",
  "admin.learning.part.description":
    "Änderungen am Container gelten für neue Unterhaltungen. Bestehende behalten ihren ersten Container. Die Container müssen bereits im selben Intelligence-Projekt existieren. Bis du hier speicherst, verwendet {product} den Container openbot dieses Projekts.",
  "admin.learning.part.loading": "Learning-Einstellungen werden geladen…",
  "admin.learning.part.turnOn":
    "Automatisches Lernen und Skill-Lieferung einschalten",
  "admin.learning.part.default": "Standard",
  "admin.learning.part.hint":
    "Ohne Standard bleiben Assistenten ohne eigenen Container außen vor. IDs bestehen aus 1 bis 64 Kleinbuchstaben, Ziffern und einzelnen Bindestrichen. Lass die Revision leer, um die zuletzt veröffentlichten Skills zu verwenden.",
  "admin.learning.part.perBot": "Teilnahme pro Assistent",
  "admin.learning.part.botListError":
    "Die Liste der Assistenten konnte nicht geladen werden. Die gespeicherten Einstellungen jedes Assistenten stehen unten.",
  "admin.learning.part.botAria": "Teilnahme von {name}",
  "admin.learning.part.inherit": "Standard der Installation verwenden",
  "admin.learning.part.exclude": "Vom Learning ausnehmen",
  "admin.learning.part.container": "Einen bestimmten Container verwenden",
  "admin.learning.part.saving": "Wird gespeichert…",
  "admin.learning.part.save": "Learning-Einstellungen speichern",
  "admin.learning.part.saved": "Einstellungen gespeichert.",
  "admin.learning.rev.title": "Prüfen und veröffentlichen",
  "admin.learning.rev.description":
    "Intelligence untersucht abgeschlossene Unterhaltungen und schlägt Skills vor. Prüfe und veröffentliche sie in Intelligence. Assistenten verwenden nur veröffentlichte Skills.",
  "admin.learning.rev.showFor": "Container anzeigen für",
  "admin.learning.rev.default": "Standard der Installation",
  "admin.learning.rev.checking": "Intelligence wird geprüft…",
  "admin.learning.rev.invalid":
    "Der gewählte Container oder seine Instrumentierung ist nicht verfügbar.",
  "admin.learning.rev.selection":
    "Wähle einen Assistenten oder lege einen Standard-Container fest.",
  "admin.learning.rev.none": "Es ist kein Learning-Container zugewiesen.",
  "admin.learning.rev.threads": "Threads bereit",
  "admin.learning.rev.candidates": "Kandidaten zur Prüfung",
  "admin.learning.rev.published": "Veröffentlichte Skills",
  "admin.learning.rev.insights": "Erkenntnisse",
  "admin.learning.rev.running": "Eine Analyse läuft.",
  "admin.learning.rev.latest": "Letzte Analyse: {status}.",
  "admin.learning.rev.noRun": "Es wurde noch keine Analyse ausgeführt.",
  "admin.learning.rev.manage": "Learning in Intelligence verwalten",
  "admin.learning.rev.reviewCandidates": "Skill-Kandidaten prüfen",
  "admin.learning.rev.viewRuns": "Analyseläufe ansehen",
  "admin.learning.del.title": "Skill-Lieferung",
  "admin.learning.del.checking": "Lieferung wird geprüft…",
  "admin.learning.del.off": "Die Lieferung ist für diesen Assistenten aus.",
  "admin.learning.del.waiting":
    "Warten auf den ersten verifizierten Skill-Snapshot.",
  "admin.learning.del.stale":
    "Der letzte verifizierte Snapshot wird verwendet. Eine Aktualisierung steht aus.",
  "admin.learning.del.ok": "Ein verifizierter Snapshot ist verfügbar.",
  "admin.learning.del.revision": "Geladene Revision: {revision}",
  "admin.learning.del.lastChecked": "Zuletzt geprüft:",
  "admin.learning.rev.refresh": "Status aktualisieren",
  "admin.learning.rev.footer":
    "Das Verwalten von Learning braucht dein Intelligence-Konto und deinen Projektzugriff. {product} hält die Projekt-Zugangsdaten auf dem Server. Wenn du Learning hier ausschaltest, bleiben Einstellungen und Zuordnungen von Unterhaltungen erhalten. Zeitpläne und Veröffentlichung bleiben in Intelligence.",
  "admin.playground.validJson": "{label} muss gültiges JSON sein: {reason}",
  "admin.playground.invalidJson": "ungültiges JSON",
  "admin.playground.notObject":
    "{label} muss ein JSON-Objekt sein, nicht {kind}.",
  "admin.playground.schemaLabel": "Argumente (JSON Schema)",
  "admin.playground.sampleLabel": "Beispielargumente",
  "admin.playground.fixBeforeSave":
    "Korrigiere die JSON-Felder, bevor du speicherst.",
  "admin.playground.draftSaved": "Entwurf gespeichert.",
  "admin.playground.published": "Veröffentlicht.",
  "admin.playground.description":
    "Schreibe eine Komponente und veröffentliche sie, ohne neu zu deployen. Deine Änderungen sind ein Entwurf. Unterhaltungen zeigen nur, was veröffentlicht ist.",
  "admin.playground.saveDraft": "Entwurf speichern",
  "admin.playground.publish": "Veröffentlichen",
  "admin.playground.title": "Titel",
  "admin.playground.titlePlaceholder": "Erstattungskarte",
  "admin.playground.told": "Was dem Modell darüber gesagt wird",
  "admin.playground.toldPlaceholder":
    "Zeige eine Erstattung mit Betrag, Grund und Status.",
  "admin.playground.preview": "Vorschau",
  "admin.playground.noSample": "Die Beispielargumente sind nicht verfügbar.",
  "admin.playground.fixBeforePreview":
    "Korrigiere die JSON-Felder, bevor du die Vorschau ansiehst.",
  "admin.playground.saved.title": "Hier gespeichert",
  "admin.playground.saved.empty":
    "Noch nichts gespeichert. Speichere einen Entwurf, um ihn hier zu sehen.",
  "admin.playground.saved.published": "veröffentlicht, Revision {revision}",
  "admin.playground.saved.draftOnly":
    "nur Entwurf, kein Assistent kann sie darstellen",
  "admin.playground.saved.edited": "seit der Veröffentlichung bearbeitet",
  "admin.playground.open": "Öffnen",
  "admin.playground.delete": "Löschen",
  "admin.playground.saved.note":
    "Durch das Veröffentlichen steht sie jedem Assistenten zur Verfügung. Für einen einzelnen Assistenten schaltest du sie auf der Seite „UI-Komponenten“ aus.",
  "admin.playground.del.title": "{name} löschen?",
  "admin.playground.del.description":
    "Sie wird aus dieser Installation entfernt, und kein Assistent kann sie mehr darstellen. Das lässt sich nicht rückgängig machen.",
  "admin.playground.del.confirm": "Löschen",
  "admin.plugins.tool.title": "Tool",
  "admin.plugins.tool.noTool":
    "Dieser Konnektor hat kein Tool mit diesem Namen.",
  "admin.plugins.tool.removed":
    "Es wurde vielleicht entfernt, seit die Tool-Liste zuletzt aktualisiert wurde.",
  "admin.plugins.tool.notOn": "Dieser Konnektor ist nicht eingeschaltet.",
  "admin.plugins.tool.noDesc": "Dieses Tool hat keine Beschreibung.",
  "admin.plugins.tool.writeDesc":
    "Dieses Tool ändert etwas beim Anbieter. Für es gelten die Grenzen für Schreibzugriffe.",
  "admin.plugins.tool.readDesc":
    "Dieses Tool liest nur. Die Grenzen für Schreibzugriffe gelten für es nicht.",
  "admin.plugins.tool.what": "Was es tut",
  "admin.plugins.tool.effect": "Wirkung",
  "admin.plugins.tool.effectDesc":
    "Vom Konnektor festgelegt, nicht vom Namen des Tools. Alles Unbekannte zählt als Schreibzugriff.",
  "admin.plugins.tool.bots.title": "Assistenten",
  "admin.plugins.tool.bots.description":
    "Ein Assistent kann dieses Tool nur aufrufen, solange sein Schalter an ist. Wenn du ihn ausschaltest, gilt das ab dem nächsten Aufruf.",
  "admin.plugins.tool.bots.empty":
    "Noch keine Assistenten. Lege einen an, um ihm dieses Tool zu geben.",
  "admin.plugins.tool.hidden": "In deiner Liste ausgeblendet.",
  "admin.plugins.tool.canCall":
    "Kann dieses Tool aufrufen. Jeder Aufruf wird weiterhin an den Grenzen geprüft und im Audit protokolliert.",
  "admin.plugins.tool.noToken":
    "Erlaubt, aber dieser Assistent hat kein Callback-Token. Jeder Aufruf wird abgelehnt. Stelle auf seiner Seite eines aus oder setze AGENT_TOOL_TOKEN.",
  "admin.plugins.tool.cantCall":
    "Kann dieses Tool nicht aufrufen. Der Assistent sieht es nie.",
  "admin.plugins.tool.aria": "{bot} {tool} aufrufen lassen",
  "admin.plugins.bot.title": "Assistent",
  "admin.plugins.bot.notOn": "Es ist keine App mit diesem Namen eingeschaltet.",
  "admin.plugins.bot.nothing":
    "Hier gibt es nichts, was man einem Assistenten geben könnte.",
  "admin.plugins.bot.notBot.title": "Kein Assistent",
  "admin.plugins.bot.notBot.description":
    "Es gibt keinen Assistenten mit diesem Namen.",
  "admin.plugins.bot.notBot.hint":
    "Er wurde vielleicht gelöscht, nachdem du diese Seite geöffnet hast.",
  "admin.plugins.bot.noDesc": "Diese Aktion hat keine Beschreibung.",
  "admin.plugins.bot.destroys": "zerstört Dinge",
  "admin.plugins.bot.description":
    "Welche Aktionen von {app} {bot} aufrufen kann. Wenn du eine ausschaltest, gilt das ab dem nächsten Aufruf.",
  "admin.plugins.bot.pageTitle": "{bot} und {app}",
  "admin.plugins.bot.noActions":
    "{app} listet keine Aktionen auf. Aktualisiere die Tools, um erneut zu prüfen.",
  "admin.plugins.bot.searchAria": "Aktionen von {app} durchsuchen",
  "admin.plugins.bot.searchPlaceholder": "Nach Aktionsnamen suchen",
  "admin.plugins.bot.wouldHold": {
    one: "Dieser Assistent hätte dann {count} Tool aus dieser App.",
    other: "Dieser Assistent hätte dann {count} Tools aus dieser App.",
  },
  "admin.plugins.bot.turnOnReads": "Alle rein lesenden Aktionen einschalten",
  "admin.plugins.bot.reads.title": "Lesen",
  "admin.plugins.bot.reads.description":
    "Diese lesen nur. Die Grenzen für Schreibzugriffe gelten für sie nicht.",
  "admin.plugins.bot.reads.noMatch":
    "Nichts, was nur liest, passt zu „{query}“.",
  "admin.plugins.bot.reads.none": "{app} hat keine rein lesenden Aktionen.",
  "admin.plugins.bot.writes.title": "Ändert etwas",
  "admin.plugins.bot.writes.description":
    "Diese ändern etwas beim Anbieter. Für sie gelten die Grenzen für Schreibzugriffe.",
  "admin.plugins.bot.writes.noMatch":
    "Nichts, was etwas ändert, passt zu „{query}“.",
  "admin.plugins.bot.writes.none":
    "{app} hat keine Aktionen, die etwas ändern.",
  "admin.plugins.bot.shared.title":
    "{bot} das gemeinsame Konto von {app} verwenden lassen?",
  "admin.plugins.bot.allowing": "Wird erlaubt…",
  "admin.plugins.bot.allow": "Erlauben",
  "admin.shared.sentence.write":
    "Jede Person, die diesen Assistenten verwenden darf, kann das als gemeinsames Konto tun.",
  "admin.shared.sentence.read":
    "Jede Person, die diesen Assistenten verwenden darf, kann lesen, was dieses Konto lesen kann.",
  "admin.shared.owner": "Nur sein Besitzer",
  "admin.shared.named": "Namentlich: {who}",
  "admin.shared.team": "Alle",
  "admin.shared.legend":
    "Wer das gemeinsame Konto über diesen Assistenten verwenden darf",
  "admin.shared.outside":
    "Nachrichten von außen (E-Mail, Slack, Webhooks) dürfen es verwenden",
  "admin.shared.skipped": {
    one: "Eine Aktion, die diese App auflistet, wurde ausgelassen, weil ein Tool-Name nur Buchstaben, Ziffern, Unterstriche und Bindestriche enthalten darf: ",
    other:
      "{count} Aktionen, die diese App auflistet, wurden ausgelassen, weil ein Tool-Name nur Buchstaben, Ziffern, Unterstriche und Bindestriche enthalten darf: ",
  },
  "admin.vocab.browse": "{name} durchsuchen",
  "admin.vocab.dirDesc.composio":
    "Ein paar hundert Apps. Jede Person verbindet ihr eigenes Konto.",
  "admin.vocab.dirDesc.arcade":
    "Apps, die hier niemand geprüft hat. Jede Person verbindet ihr eigenes Konto.",
  "admin.vocab.readFailure":
    "Das App-Verzeichnis von {name} konnte nicht geladen werden. Lade die Seite neu.",
  "admin.vocab.moreApps": "Apps von {name}. Niemand hier hat sie geprüft.",
  "admin.vocab.notSetUp":
    "Nicht eingerichtet. Setze {envVar} in dieser Installation, um die Apps zu durchsuchen.",
  "admin.vocab.connection":
    "Erreichbar über {name}, das das eigene Konto jeder Person hält.",
  "admin.vocab.reach.description":
    "{name} hält das Konto. Diese Installation sendet einen Schlüssel und wer fragt. Jede Person verbindet ihr eigenes, und ein Assistent sieht nur, was diese Person sehen kann. Es gibt kein Token zum Einfügen.",
  "admin.vocab.reach.badge": "Über {name}",
  "admin.vocab.disconnect": "Beim Trennen endet auch das Konto bei {name}.",
  "admin.vocab.trip.stem":
    "{name} genehmigt jeweils eine Aktion, also gibt es für die ganze App nichts zu verbinden.",
  "admin.vocab.trip.below": "Autorisiere unten die gewünschten Aktionen.",
  "admin.vocab.trip.settings": "Autorisiere sie unter „Verbindungen“.",
  "admin.vocab.keyMissing":
    "Setze {envVar} in dieser Installation. Bis dahin kann dieses Konto hier weder verbunden noch getrennt werden. Die App bleibt eingeschaltet, und ihre Tool-Freigaben bleiben bestehen.",
  "admin.vocab.siblings": {
    one: "Beim Trennen endet auch dein Zugriff auf {names}, das diese Verbindung mitnutzt.",
    other:
      "Beim Trennen endet auch dein Zugriff auf {names}, die diese Verbindung mitnutzen.",
  },
  "admin.vocab.unansweredMore": {
    one: "{count} weitere App konnte nicht geprüft werden und ist vielleicht auch betroffen.",
    other:
      "{count} weitere Apps konnten nicht geprüft werden und sind vielleicht auch betroffen.",
  },
  "admin.vocab.unansweredOnly": {
    one: "{count} App an dieser Verbindung konnte nicht geprüft werden, daher endet vielleicht auch sie beim Trennen.",
    other:
      "{count} Apps an dieser Verbindung konnten nicht geprüft werden, daher enden vielleicht auch sie beim Trennen.",
  },
  "admin.vocab.join2": "{a} und {b}",
  "admin.vocab.joinMany": "{list} und {last}",
  "admin.skills.write": "Skill schreiben",
  "admin.skills.description":
    "Benannte Anweisungen, die jede Person mit / ausführen kann. Ein Skill gibt keinen zusätzlichen Zugriff. Er kann einen Assistenten nur bitten, zu nutzen, was er schon hat.",
  "admin.skills.installed.title": "Installiert",
  "admin.skills.installed.description":
    "Für alle in dieser Installation. Jede Person schreibt eigene auf ihrer Skills-Seite.",
  "admin.skills.loadError":
    "Die Skills konnten nicht geladen werden. Lade die Seite neu.",
  "admin.skills.empty":
    "Noch keine Skills. Schreibe einen mit „Skill schreiben“.",
  "admin.skills.dlg.title": "Einen Skill für alle schreiben",
  "admin.skills.dlg.description":
    "Die Leute tippen den Slug nach /. Der Assistent befolgt dann die Anweisungen. Alle können ihn verwenden, und du legst fest, welche Assistenten ihn haben.",
  "admin.skills.slug": "Slug",
  "admin.skills.title": "Titel",
  "admin.skills.summary": "Zusammenfassung",
  "admin.skills.summaryPlaceholder": "Eine Zeile",
  "admin.skills.instructions": "Anweisungen",
  "admin.skills.instructionsPlaceholder":
    "Was der Assistent tun soll, wenn dieser Skill verwendet wird.",
  "admin.skills.install": "Skill installieren",
  "engines.intro":
    "Die Engine ist das, was für jedes Mitglied denkt. Deine eigenen Anmeldungen antworten zuerst, es sei denn, du wählst eine andere Reihenfolge; alles Kostenpflichtige bleibt aus, bis du es sagst.",
  "engines.loadFailed":
    "Die Engines konnten nicht geladen werden. Lade die Seite neu.",
  "engines.fallback": "Die Engines konnten nicht aufgelistet werden.",
  "engines.noEngines": "Es wurden noch keine Engines gemeldet.",
  "engines.statesTitle": "Engines und ihr Zustand",
  "engines.sectionsLabel": "Bereiche der Engines",
  "engines.tab.overview": "Übersicht",
  "engines.tab.providers": "Anbieter",
  "engines.tab.members": "Zuweisungen der Assistenten",
  "engines.tab.usage": "Nutzung",
  "engines.asideLabel": "Schlüssel und Ausgaben",
  "engines.keys.title": "Schlüssel",
  "engines.keys.text":
    "Hier werden nur Schlüssel für Gateways aufbewahrt. Deine Anmeldungen bei Claude und ChatGPT werden von FreeDuet nie gespeichert.",
  "engines.keys.notBuilt":
    "Ein Schlüssel wird auf der Karte seiner Engine hinzugefügt. Er wird auf dieser Installation aufbewahrt und nie wieder angezeigt.",
  "engines.spending.title": "Ausgaben",
  "engines.spending.text":
    "Die Ausgaben werden auf dieser Seite noch nicht angezeigt. Eine kostenpflichtige Engine läuft nur, wenn diese Installation es erlaubt.",
  "engines.today": "Heute",
  "engines.reason.off":
    "Die Engines sind auf dieser Installation ausgeschaltet (FREEDUET_ROUTER=off), daher gibt es nichts anzuzeigen.",
  "engines.reason.not_set_up":
    "Auf dieser Installation ist kein FreeDuet-Agent eingerichtet, daher gibt es keine Engines anzuzeigen.",
  "engines.reason.unreachable":
    "Der FreeDuet-Agent hat nicht geantwortet, daher können die Engines gerade nicht gelesen werden. Diese Seite fragt alle 30 Sekunden erneut nach.",
  "engines.state.ready": "Bereit",
  "engines.state.degraded": "Bereit, hatte aber zuletzt Fehler",
  "engines.state.limitedAt": "Hat ihr Limit erreicht, bis {at}",
  "engines.state.limited": "Hat ihr Limit vorerst erreicht",
  "engines.state.outOfCreditAt":
    "Guthaben aufgebraucht, nächster Versuch: {at}",
  "engines.state.outOfCredit": "Guthaben aufgebraucht",
  "engines.state.notAnsweringAt": "Antwortet nicht, nächster Versuch: {at}",
  "engines.state.notAnswering": "Antwortet vorerst nicht",
  "engines.state.checking": "Es wird geprüft, ob sie wieder antwortet",
  "engines.state.gatewayKey":
    "Ihr Gateway hat den Schlüssel nicht akzeptiert. Prüfe den Schlüssel, den du angegeben hast.",
  "engines.state.signedOut":
    "Abgemeldet: Melde dich erneut mit der eigenen Anmeldung der Engine an",
  "engines.state.refusedWhy": "Nicht ausgeführt: {reason}",
  "engines.state.refused": "Nicht ausgeführt: Der Grund ist nicht bekannt.",
  "engines.state.unknown": "Zustand nicht bekannt",
  "engines.state.toolsAsText":
    "Ihre letzte Antwort hat die Tool-Aufrufe als Text geschrieben, statt sie zu verwenden: Wähle ein Modell, das Tools unterstützt",
  "engines.pill.working": "Läuft",
  "engines.pill.checking": "Wird geprüft",
  "engines.pill.limited": "Begrenzt",
  "engines.pill.outOfCredit": "Guthaben aufgebraucht",
  "engines.pill.notAnswering": "Antwortet nicht",
  "engines.pill.signedOut": "Abgemeldet",
  "engines.pill.locked": "Gesperrt",
  "engines.pill.unknown": "Nicht bekannt",
  "engines.members.title": "Wer nutzt was",
  "engines.members.description":
    "Die Engines, die jedes Mitglied ausprobiert, in der Reihenfolge, in der es sie ausprobiert, und was passiert, wenn eine aufgebraucht ist. Eine Änderung gilt ab der nächsten Nachricht des Mitglieds, und du kannst sie rückgängig machen.",
  "engines.members.col.member": "Mitglied",
  "engines.members.col.order": "Reihenfolge der Engines",
  "engines.members.col.switching": "Wenn eine Engine aufgebraucht ist",
  "engines.order.note":
    "Verschiebe eine Engine mit den Pfeilen um eine Stelle. Deine eigenen Anmeldungen kommen zuerst, es sei denn, du wählst es anders: Wenn eine Verschiebung eine kostenlose oder eine kostenpflichtige Engine vor sie setzt, musst du das zuerst bestätigen.",
  "engines.order.warnTitle.free_before_login":
    "Eine kostenlose Engine würde vor deiner eigenen Anmeldung antworten",
  "engines.order.warnTitle.paid_before_free_or_login":
    "Eine kostenpflichtige Engine käme vor einer kostenlosen Engine oder einer Anmeldung",
  "engines.order.warnText.free_before_login":
    "Wenn es ein Cloud-Dienst ist, gehen die Nachrichten dieses Mitglieds zuerst an diesen Anbieter, und er könnte sie behalten. Seine Antworten können außerdem von geringerer Qualität sein als die deiner Anmeldung.",
  "engines.order.warnText.paid_before_free_or_login":
    "Eine kostenpflichtige Engine antwortet vor den Engines, die ihr folgen, daher kann es Geld kosten, was sie beantwortet. Steht sie an erster Stelle der Liste, kann jede Nachricht von der ersten an Geld kosten. Sie läuft erst, nachdem du kostenpflichtige Engines eingeschaltet und deine Limits gesetzt hast.",
  "engines.order.newLabel": "Neue Reihenfolge:",
  "engines.order.tick": "Ich habe verstanden, diese Reihenfolge verwenden",
  "engines.order.confirm": "Bestätigen",
  "engines.order.tickLabel":
    "Ich habe verstanden, diese Reihenfolge für {name} verwenden",
  "engines.order.confirmLabel": "Die neue Reihenfolge für {name} bestätigen",
  "engines.order.cancelLabel": "Die neue Reihenfolge für {name} verwerfen",
  "engines.order.own":
    "Deine Reihenfolge: Anmeldungen stehen nicht an erster Stelle",
  "engines.order.recommended": "Empfohlene Reihenfolge verwenden",
  "engines.order.recommendedLabel":
    "Empfohlene Reihenfolge für {name} verwenden",
  "engines.order.moveUp": "{engine} für {name} nach oben verschieben",
  "engines.order.moveDown": "{engine} für {name} nach unten verschieben",
  "engines.order.saveFailed":
    "Die Reihenfolge konnte nicht gespeichert werden.",
  "engines.claude.default": "Standard des Abonnements",
  "engines.claude.effort.low": "Niedrig",
  "engines.claude.effort.medium": "Mittel",
  "engines.claude.effort.high": "Hoch",
  "engines.claude.effort.xhigh": "Sehr hoch",
  "engines.claude.effort.max": "Maximal",
  "engines.claude.effortLabel": "Aufwand",
  "engines.claude.note":
    "Nur Claude Code. Ein Modell, das dein Abonnement nicht nutzen kann, beendet diesen Durchgang mit dem eigenen Fehler von Claude Code. Es wird nichts ausgeschaltet, und „Standard des Abonnements“ macht die Auswahl rückgängig.",
  "engines.claude.modelAria": "Claude-Modell für {name}",
  "engines.claude.effortAria": "Claude-Aufwand für {name}",
  "engines.claude.saved":
    "Claude-Auswahl gespeichert. Sie gilt ab der nächsten Nachricht.",
  "engines.members.saveFailed":
    "Deine Auswahl konnte nicht gespeichert werden.",
  "engines.members.undoFailed":
    "Diese Änderung konnte nicht rückgängig gemacht werden.",
  "engines.mode.groupLabel": "Wenn eine Engine aufgebraucht ist, für {name}",
  "engines.mode.controlLabel": "{label} für {name}",
  "engines.mode.undoLabel": "Die Änderung für {name} rückgängig machen",
  "engines.mode.automatic.label": "Automatisch wechseln",
  "engines.mode.automatic.effect":
    "Wenn eine Engine aufgebraucht ist, antwortet die nächste, und dir wird gesagt, welche.",
  "engines.mode.askFirst.label": "Zuerst fragen",
  "engines.mode.askFirst.effect":
    "Wenn eine Engine aufgebraucht ist, wirst du gefragt: wechseln, warten oder eine andere Engine nennen.",
  "engines.leftOut.line": "Nicht verwendet: {engine}, weil {why}.",
  "engines.leftOut.locked": "die Datei der Installation es nicht erlaubt",
  "engines.leftOut.disabled": "sie ausgeschaltet ist",
  "engines.leftOut.paid_gateway":
    "es ein kostenpflichtiges Gateway ist, das FreeDuet noch nicht ausführt",
  "engines.leftOut.metered_off": "kostenpflichtige Engines ausgeschaltet sind",
  "engines.leftOut.cap_zero": "ihr Ausgabenlimit null ist",
  "engines.leftOut.not_set_up":
    "sie auf dieser Installation nicht eingerichtet ist",
  "engines.leftOut.other": "sie nicht laufen wird",
  "engines.chain.none":
    "Im Moment kann keine Engine für dieses Mitglied antworten.",
  "engines.chain.one": "Versucht nur {engine}.",
  "engines.chain.many": "Versucht {list}.",
  "engines.chain.then": ", dann ",
  "engines.pin":
    "Durch die Datei der Installation auf {engine} festgelegt: Es wechselt nie zu einer anderen Engine.",
  "engines.alone":
    "Für dieses Mitglied ist nur {engine} eingerichtet, daher gibt es noch nichts, zu dem gewechselt werden könnte. Deine Auswahl bleibt erhalten, falls es später so weit ist.",
  "engines.source.yours":
    "Deine Auswahl. Die Datei der Installation sagt: {mode}.",
  "engines.source.file": "Aus der Datei der Installation.",
  "engines.block.not_at_the_computer":
    "Ändere das auf dem Computer, auf dem FreeDuet läuft.",
  "engines.block.not_paired_with_the_computer":
    "Koppele zuerst diesen Browser mit dem Computer, auf dem FreeDuet läuft: Führe dort `bash scripts/open.sh` aus und öffne den Link hier.",
  "engines.block.agent_too_old": "Aktualisiere FreeDuet, um das zu ändern.",
  "engines.block.choices_unreadable":
    "Deine Auswahl konnte nicht gelesen werden, daher gelten die Einstellungen der Installation. Nichts von dem, was du gewählt hast, geht verloren.",
  "engines.saved":
    "Gespeichert. Es gilt ab der nächsten Nachricht des Mitglieds.",
  "engines.undone":
    "Rückgängig gemacht. Die vorherige Einstellung gilt ab der nächsten Nachricht des Mitglieds.",
  "engines.providers.title": "Eine Engine hinzufügen",
  "engines.providers.description":
    "Schalte eine Engine ein, füge ihren Schlüssel ein und drücke Speichern, dann Testen. Eine Änderung gilt ab der nächsten Nachricht.",
  "engines.providers.pickerLabel": "Anbieter",
  "engines.providers.blurb.ollama":
    "Modelle, die auf deinem eigenen Computer laufen.",
  "engines.providers.blurb.llamacpp":
    "Ein llama.cpp-Server auf deinem eigenen Computer oder in deinem Netzwerk.",
  "engines.providers.blurb.lmstudio":
    "Der lokale Server von LM Studio auf deinem eigenen Computer.",
  "engines.providers.blurb.freellmapi":
    "Ein Router, den du selbst betreibst und der die kostenlosen Angebote vieler Anbieter hinter einer Adresse bündelt.",
  "engines.providers.blurb.groq":
    "Schnelle offene Modelle, kostenlos mit Tageslimits.",
  "engines.providers.blurb.google": "Gemini-Modelle, kostenlos mit Limits.",
  "engines.providers.blurb.mistral":
    "Mistral-Modelle im kostenlosen Tarif, mit Limits.",
  "engines.providers.blurb.openrouter":
    "Nur Modelle, die nichts kosten: eine ID, die auf :free endet, oder openrouter/free.",
  "engines.providers.blurb.cloudflare":
    "Offene Modelle bei Cloudflare, kostenlos mit einem Tageskontingent. Trage dein eigenes Konto in die Adresse ein.",
  "engines.providers.blurb.cerebras": "Sehr schnelle offene Modelle.",
  "engines.providers.blurb.anthropic-api":
    "Claude mit nutzungsabhängig bezahltem Guthaben.",
  "engines.providers.tag.local": "Lokal",
  "engines.providers.tag.router": "Fortgeschritten: dein eigener Router",
  "engines.providers.tag.free": "Kostenlos mit Limits",
  "engines.providers.tag.trial": "Testphase, Karte nötig",
  "engines.providers.tag.paid": "Kostenpflichtig",
  "engines.providers.cloudWarning":
    "Daten, die an diesen Dienst gesendet werden, verlassen deinen Computer.",
  "engines.providers.routerWarning":
    "Deine Nachrichten gehen an den Router, der sie an die kostenlosen Anbieter weitergibt, die du darin aktiviert hast. Sie verlassen deinen Computer, und diese Anbieter könnten sie behalten.",
  "engines.providers.routerAdvanced":
    "Fortgeschrittene Option, keine empfohlene Voreinstellung: Das Projekt beschreibt sich selbst als nur für persönliches Experimentieren gedacht. FreeDuet installiert oder betreibt es nicht. Die Schlüssel deiner Anbieter bleiben darin; FreeDuet behält nur das eine Zugriffstoken, das er dir gibt.",
  "engines.providers.routerAddress":
    "Sein eigener Standardport, 3001, gehört FreeDuet. Starte ihn auf einem anderen Port und schreibe die Adresse mit /v1 am Ende. Auf diesem Computer ist http in Ordnung. Außerhalb dieses Computers wird nur dein eigenes Netzwerk akzeptiert (eine LAN-Adresse oder ein .local-Name), über https. Ein öffentlicher Host wird abgelehnt.",
  "engines.providers.address": "Serveradresse",
  "engines.providers.loadList": "Liste laden",
  "engines.providers.saveSettings": "Einstellungen speichern",
  "engines.providers.test": "Testen",
  "engines.providers.freeModelsNote":
    "Kostenlose Modelle ändern sich oft und dürfen möglicherweise behalten, was du sendest.",
  "engines.providers.freeModelsLoading":
    "Die kostenlosen Modelle, die Tools nutzen können, werden geladen.",
  "engines.providers.freeModelsStale":
    "OpenRouter war gerade nicht erreichbar. Das ist die zuletzt geladene Liste.",
  "engines.providers.freeModelsFallback":
    "OpenRouter war gerade nicht erreichbar. Es wird nur der kostenlose Router angeboten.",
  "engines.providers.freeRouterLabel":
    "openrouter/free (OpenRouter wählt ein kostenloses Modell)",
  "engines.providers.keySaved":
    "Schlüssel gespeichert. Er wird nie wieder angezeigt.",
  "engines.providers.keyPlaceholder": "Schlüssel hier einfügen",
  "engines.providers.notOnKey":
    "Noch nicht eingeschaltet. Füge den Schlüssel ein und drücke Speichern.",
  "engines.providers.notOnSettings":
    "Noch nicht eingeschaltet. Wähle ein Modell und drücke Einstellungen speichern.",
  "engines.providers.settingsSaved":
    "Gespeichert. Es gilt ab der nächsten Nachricht.",
  "engines.providers.keyRemoved": "Schlüssel entfernt. Die Engine ist aus.",
  "engines.providers.lockedOwnFile":
    "Du hast eine eigene Engines-Datei geschrieben, daher zeigen diese Karten sie nur an. Ändere sie dort.",
  "engines.providers.users.paid":
    "Aus, bis es Ausgabenlimits gibt. FreeDuet lässt vorher keine kostenpflichtige Engine laufen.",
  "engines.providers.users.trial":
    "Ihr kostenloser Tarif ist eine Testphase, die eine Karte braucht, daher bietet FreeDuet sie nicht als kostenlos an. Sie bleibt aus.",
  "engines.providers.users.members":
    "Für Mitglieder: ja, nach ihrer Claude-Anmeldung. Für die leichten Assistenten: ja.",
  "engines.providers.users.notYet":
    "Für Mitglieder: noch nicht. Für die leichten Assistenten: ja.",
  "engines.providers.check.ok": "Sie hat geantwortet. Sie funktioniert.",
  "engines.providers.check.key_rejected":
    "Der Schlüssel wurde nicht akzeptiert. Prüfe ihn und speichere ihn erneut.",
  "engines.providers.check.model_missing":
    "Der Server kennt dieses Modell nicht. Prüfe den Modellnamen.",
  "engines.providers.check.rate_limited":
    "Das Limit oder das Guthaben ist vorerst aufgebraucht. Versuche es später erneut.",
  "engines.providers.check.other":
    "Nichts hat geantwortet, oder die Antwort wurde nicht verstanden.",
  "engines.providers.freeNote":
    "„Kostenlos“ ist die Bezeichnung von FreeDuet, übernommen aus den Bedingungen des Anbieters. Manche Anbieter (zum Beispiel Google) stellen dir etwas in Rechnung, wenn die Abrechnung für dein Projekt eingeschaltet ist.",
  "engines.providers.useFor": "Verwenden für",
  "engines.providers.useForNone":
    "Noch kein Mitglied nutzt sie. Die leichten Assistenten schon. Hake die Mitglieder an, die ihre Arbeit an diesen Dienst senden dürfen.",
  "engines.providers.warn.inbox": "Sendet deine E-Mails an diesen Dienst.",
  "engines.providers.warn.concierge":
    "Sendet deine Buchungen an diesen Dienst.",
  "engines.providers.modelsEmpty":
    "Die Liste ist leer. Gib den Modellnamen ein.",
  "engines.providers.modelsLoaded": {
    one: "{count} Modell geladen. Wähle eines im Feld aus.",
    other: "{count} Modelle geladen. Wähle eines im Feld aus.",
  },
  "engines.providers.switchOn": "{name} einschalten",
  "engines.providers.changeFailed": "Das konnte nicht geändert werden.",
  "engines.providers.keySaveFailed":
    "Der Schlüssel konnte nicht gespeichert werden.",
  "engines.providers.listFailed": "Die Liste konnte nicht geladen werden.",
  "engines.providers.keyRemoveFailed":
    "Der Schlüssel konnte nicht entfernt werden.",
  "engines.providers.saveFailed": "Das konnte nicht gespeichert werden.",
  "engines.providers.testFailed": "Der Test konnte nicht ausgeführt werden.",
  "engines.tokens.title": "Tokens",
  "engines.tokens.description":
    "Was jedes Mitglied bei jeder Engine verbraucht hat, so wie die Engine selbst es gemeldet hat. Tage werden in UTC gezählt.",
  "engines.tokens.fallback": "Die Token-Zahlen konnten nicht geladen werden.",
  "engines.tokens.empty": "Noch kein Durchgang wurde gezählt.",
  "engines.tokens.unavailable": "Die Token-Zahlen sind gerade nicht verfügbar.",
  "engines.tokens.problem":
    "Die Datei, die die Zahlen aufbewahrt, konnte nicht gelesen werden, daher können einige Zahlen fehlen.",
  "engines.tokens.notReported": "nicht gemeldet",
  "engines.tokens.col.engine": "Engine",
  "engines.tokens.col.week": "Letzte 7 Tage",
  "engines.tokens.allMembers": "Alle Mitglieder",
  "engines.tokens.note":
    "Eingabe zählt jedes Token, das dem Modell gegeben wurde, auch die aus dem Cache. Jede Zeile zählt Versuche der Engine: Ein erneuter Versuch bei derselben Engine zählt erneut. Ein Versuch, bei dem die Engine nichts gemeldet hat, fügt seine Zeit hinzu und keine Tokens. Die Zeit wird hier gemessen, vom Anfang bis zum Ende jedes Versuchs.",
  "engines.tokens.savedWeek": "Gespart in den letzten 7 Tagen",
  "engines.tokens.savedNote":
    "Gespart bedeutet Tokens, die über kostenlose Engines gelaufen sind, in der Cloud oder auf deinem eigenen Computer. Dein Claude-Code-Abonnement ist eine Pauschale und kostenpflichtige Engines kosten Geld, daher zählt keines von beiden.",
  "engines.tokens.currencyHelp":
    "Klicke auf einen Betrag, um zwischen Euro und Dollar zu wechseln.",
  "engines.tokens.reference":
    "Zu den Listenpreisen von {model} ({input} Eingabe, {output} Ausgabe pro Million Tokens, {date}); {euro} = {rate} ({rateDate}).",
  "engines.tokens.under": "unter {amount}",
  "engines.tokens.nothingYet": "noch nichts",
  "engines.tokens.plus": "plus {time}",
  "engines.tokens.toDollars": "{amount}. Beträge in Dollar anzeigen",
  "engines.tokens.toEuros": "{amount}. Beträge in Euro anzeigen",
  "engines.tokens.amount": "{amount} Tokens",
  "engines.tokens.timeLocal": "{time} auf deiner eigenen GPU",
  "engines.tokens.timeCloud": "{time} bei einer kostenlosen Cloud-Engine",
  "engines.tokens.and": " und ",
  "engines.tokens.timeTail": "{parts}, Tokens nicht gemeldet",
  "engines.tokens.cell": "{input} Eingabe · {output} Ausgabe",
  "engines.tokens.partial": "{reported} von {total} Versuchen gemeldet",
  "engines.dur.under": "unter 1 Min.",
  "engines.dur.min": "{minutes} Min.",
  "engines.dur.hourMin": "{hours} Std. {minutes} Min.",
  "engines.usage.bySource": "Nach Herkunft",
  "engines.usage.byMember": "Nach Mitglied",
  "engines.usage.time": "Zeit",
  "engines.usage.source.person": "Du",
  "engines.usage.source.routine": "Routinen",
  "engines.usage.source.handoff": "Zwischen Mitgliedern",
  "engines.usage.source.other": "Sonstiges",
  "engines.usage.source.unknown": "Früher (nicht erfasst)",
  "engines.usage.title": "Wohin die letzten 7 Tage gingen",
  "engines.usage.note":
    "Die Anteile beziehen sich auf die Tokens, die die Engines gemeldet haben (Eingabe plus Ausgabe), oder auf die Zeit, wenn „Zeit“ gewählt ist; Versuche, die keine Tokens gemeldet haben, fügen nur Zeit hinzu. „Du“ sind deine eigenen Nachrichten, „Routinen“ sind Routinen und Nachfassen, „Zwischen Mitgliedern“ sind Übergaben, und „Sonstiges“ ist alles andere, etwa die eigenen Läufe einer Installation.",
  "engines.usage.nothing": "In den letzten 7 Tagen wurde nichts gezählt.",
  "engines.usage.chartsFailed":
    "Die Nutzungsdiagramme konnten nicht gezeichnet werden. Die Tabelle darunter ist davon nicht betroffen.",
  "engines.usage.restMembers": "Andere Mitglieder",
  "engines.usage.limitTitle": "Limits des Tarifs",
  "engines.usage.limitNone":
    "Im Moment wird keine Engine durch ein Limit zurückgehalten.",
  "engines.usage.limitNote":
    "Ein Prozentsatz des Wochenlimits deines Tarifs wird nicht angezeigt: Das Abonnement meldet ihn nicht an FreeDuet. Eine Engine sagt es nur, wenn sie ein Limit erreicht hat, zusammen mit der Zeit, zu der sie zurückerwartet wird.",
  "engines.usage.range": "{from} bis {to}, UTC-Tage",
  "engines.usage.splitBy": "Aufteilen nach",
  "engines.usage.measure": "Messgröße",
  "engines.usage.perDay": "{title}: {metric} pro Tag",
  "engines.usage.perDayUtc": "{title}: {metric} pro Tag, UTC",
  "engines.usage.day": "Tag",
  // connections-begin
  "connections.connect": "Verbinden",
  "connections.reconnect": "Erneut verbinden",
  "connections.connected": "Verbunden",
  "connections.teamAccount": "Team-Konto",
  "connections.disconnect": "Trennen",
  "connections.disconnecting": "Wird getrennt…",
  "connections.startFailed":
    "Das Verbinden konnte nicht gestartet werden, daher wurde nichts verbunden. Versuche es erneut oder frage einen Administrator, wenn es weiter passiert.",
  "connections.list.auth.no-broker":
    "Das Verbinden von Apps ist noch nicht eingerichtet, daher wurde nichts erfasst. Bitte einen Administrator, es einzurichten.",
  "connections.list.auth.not-supported":
    "Apps werden hier einmal verbunden, mit „Verbinden“ auf der Seite der App. Sie werden nicht Aktion für Aktion autorisiert.",
  "connections.list.auth.missing-handle":
    "Dieser Link sagt nicht, welche Autorisierung er abschließt, daher wurde nichts getan. Beginne von vorn auf der Seite der App.",
  "connections.list.auth.no-attempt":
    "Es läuft keine Autorisierung, die du abschließen könntest. Sie ist möglicherweise abgelaufen oder in einer anderen Sitzung gestartet worden. Beginne von vorn auf der Seite der App.",
  "connections.list.auth.vendor-unavailable":
    "Die App hat nicht geantwortet, als {product} versucht hat, diese Autorisierung abzuschließen, daher wurde nichts erfasst. Versuche den Link in einem Moment erneut.",
  "connections.list.auth.not-your-authorization":
    "Dieser Link passt nicht zu der Autorisierung, die du gerade durchführst, daher wurde nichts erfasst. Schließe sie in dem Tab ab, in dem du sie gestartet hast, oder beginne von vorn auf der Seite der App.",
  "connections.list.auth.not-finished":
    "Diese Autorisierung ist noch nicht abgeschlossen, daher wurde nichts erfasst. Schließe sie in der App ab und öffne dann den Link erneut.",
  "connections.list.auth.authorization-failed":
    "Die App hat diese Autorisierung nicht abgeschlossen, daher wurde nichts erfasst. Beginne von vorn auf der Seite der App.",
  "connections.list.auth.context-changed":
    "Das Konto dieser App hat sich geändert, während die Autorisierung offen war, daher wurde nichts erfasst. Der Zugriff, der dem alten Konto gegeben wurde, wurde entfernt. Beginne von vorn auf der Seite der App.",
  "connections.list.auth.not-permitted":
    "Du kannst das Konto dieser App nicht mehr verbinden, daher wurde nichts erfasst. Dein Zugriff oder die Einrichtung der App hat sich geändert, während die Autorisierung offen war. Frage einen Administrator, wenn du erwartet hast, sie abschließen zu können.",
  "connections.list.auth.cancelled":
    "Diese Autorisierung wurde abgebrochen, während sie abgeschlossen wurde, daher wurde nichts erfasst. Der Zugriff, den sie gegeben hatte, wurde entfernt.",
  "connections.list.auth.cancelled-left-live":
    "Diese Autorisierung wurde abgebrochen, während sie abgeschlossen wurde, daher wurde nichts erfasst. Der Zugriff, den sie gegeben hatte, konnte nicht entfernt werden, daher erlaubt die App möglicherweise weiterhin die Aktion, die du abgebrochen hast. Um ihn zu entfernen, trenne die App auf ihrer Seite, verbinde sie dann erneut und autorisiere nur das, was du willst.",
  "connections.list.auth.not-recorded":
    "Diese Autorisierung konnte nicht erfasst werden, daher wurde nichts gespeichert. Beginne von vorn auf der Seite der App oder frage einen Administrator, wenn es weiter passiert.",
  "connections.list.description":
    "Die Apps und Konten, die deine Assistenten als du verwenden. Öffne eines, um es zu verbinden oder zu ändern.",
  "connections.list.connectFailed":
    "Dieses Konto konnte nicht verbunden werden. Es wurde nichts gespeichert. Versuche es erneut.",
  "connections.list.title": "Deine Verbindungen",
  "connections.list.loading": "Verbindungen werden geladen…",
  "connections.list.loadError":
    "Deine Verbindungen konnten nicht geladen werden. Lade die Seite neu oder frage einen Administrator, wenn es weiter passiert.",
  "connections.list.empty":
    "Noch nichts zu verbinden. Apps erscheinen hier, sobald ein Administrator sie einschaltet.",
  "connections.list.count": "{inUse} in Benutzung · {total} insgesamt",
  "connections.list.search": "Verbindungen suchen",
  "connections.list.noMatch": "Nichts passt zu „{query}“.",
  "connections.list.linksError":
    "GitHub und Slack konnten nicht geladen werden, daher sind sie nicht aufgeführt. Lade die Seite neu.",
  "connections.list.connectNamed": "{title} verbinden",
  "connections.list.reconnectNamed": "{title} erneut verbinden",
  "connections.app.landed": "Du hast gerade {action} autorisiert.",
  "connections.app.pendingTitle": "Konto",
  "connections.app.loadError":
    "Diese Verbindung konnte nicht geladen werden. Lade die Seite neu oder frage einen Administrator, wenn es weiter passiert.",
  "connections.app.appLoadError":
    "Diese App konnte nicht geladen werden. Lade die Seite neu oder frage einen Administrator, wenn es weiter passiert.",
  "connections.app.notSetUp":
    "{title} ist noch nicht eingerichtet. Ein Administrator muss es einschalten, bevor es jemand verbinden kann.",
  "connections.app.sharedDesc":
    "Von deiner Organisation geteilt. Assistenten handeln als das Team-Konto.",
  "connections.app.brokeredDesc":
    "Assistenten nutzen das als du und sehen nur, was du sehen kannst.",
  "connections.app.reassurance": "Kein Assistent kann das als du nutzen.",
  "connections.app.tripPerAction":
    "Autorisiere unten die Aktionen, die du willst.",
  "connections.app.tripConnect":
    "Beim Verbinden gelangst du zu {title}, um den Zugriff zu genehmigen.",
  "connections.app.connectedDesc":
    "Assistenten, die du zulässt, nutzen dein {title} als du. Beim Trennen wird ihr Zugriff überall entfernt.",
  "connections.app.notYours": "Du verbindest diese App nicht selbst.",
  "connections.app.oneShared":
    "Assistenten nutzen für diese App ein gemeinsames Konto, dasselbe für alle.",
  "connections.app.noApp": "{product} hat keine App mit diesem Namen.",
  "connections.app.yourAccount": "Dein Konto",
  "connections.app.notAvailable":
    "Noch nicht verfügbar. Ein Administrator muss das zuerst einschalten.",
  "connections.app.connectedAsYou":
    "Assistenten, die du zulässt, nutzen das als du und sehen nur, was du sehen kannst.",
  "connections.app.notConnected":
    "Kein Assistent kann das als du nutzen. Beim Verbinden gelangst du zu {vendor}, um den Zugriff zu genehmigen.",
  "connections.app.disconnectedDone":
    "Getrennt. {product} kann dein {vendor}-Konto nicht mehr nutzen.",
  "connections.app.disconnectedUnconfirmed":
    "Hier getrennt. {vendor} hat es nicht bestätigt, entferne daher {product} auch in den Einstellungen für den Zugriff Dritter in deinem {vendor}-Konto.",
  "connections.app.accessDesc":
    "Was du erlaubt hast, so wie {vendor} es erfasst hat. Das kann weniger sein, als {product} angefragt hat.",
  "connections.app.access": "Zugriff",
  "connections.app.allowed": "Erlaubt",
  "connections.app.vendorDidntSay": "{vendor} hat es nicht gesagt.",
  "connections.identity.toolsDesc":
    "Erlaubt deinen Assistenten, deine Repositories als du zu lesen und zu ändern. Das verbindest du getrennt von deinem Konto oben.",
  "connections.identity.tools": "Tools",
  "connections.identity.githubTools": "GitHub-Tools",
  "connections.identity.notConnected": "Nicht verbunden",
  "connections.mail.neverRun": "Ist noch nicht gelaufen.",
  "connections.mail.lastRun": {
    one: "Zuletzt ausgeführt {when}: {count} Nachricht. {total} insgesamt.",
    other: "Zuletzt ausgeführt {when}: {count} Nachrichten. {total} insgesamt.",
  },
  "connections.mail.on": "Ein. {activity}",
  "connections.mail.off": "Aus",
  "connections.mail.switchOff": "Ausschalten",
  "connections.mail.switchOn": "Einschalten",
  "connections.mail.delete": "Löschen",
  "connections.mail.lastProblem": "Letztes Problem: {error}",
  "connections.mail.description":
    "Dauerhafte Regeln, die du im Chat verlangt hast. Deine Assistenten behalten sie und wenden sie alle paar Minuten auf neue E-Mails an; es sind keine Gmail-Filter. Das Löschen einer Regel macht nicht rückgängig, was sie schon getan hat.",
  "connections.mail.title": "E-Mail-Regeln",
  "connections.mail.search": "E-Mail-Regeln suchen",
  "connections.mail.statusLabel": "Status der Regel",
  "connections.mail.allStatuses": "Alle Status",
  "connections.mail.optActive": "Aktiv",
  "connections.mail.optPaused": "Pausiert",
  "connections.mail.active": "Aktiv",
  "connections.mail.paused": "Pausiert",
  "connections.mail.noMatch": "Keine Regel passt zu diesen Filtern.",
  "connections.mail.paging": {
    one: "{from}–{to} von {count} Regel",
    other: "{from}–{to} von {count} Regeln",
  },
  "connections.mail.previous": "Zurück",
  "connections.mail.next": "Weiter",
  "connections.secret.aMember": "Ein Mitglied",
  "connections.secret.doneMemberCal":
    "Verbunden. {name} kann jetzt deine E-Mails und deinen Kalender als du lesen.",
  "connections.secret.doneMember":
    "Verbunden. {name} kann jetzt deine E-Mails als du lesen.",
  "connections.secret.doneBotsCal":
    "Verbunden. Assistenten, die du zulässt, können jetzt deine E-Mails und deinen Kalender als du lesen.",
  "connections.secret.doneBots":
    "Verbunden. Assistenten, die du zulässt, können jetzt deine E-Mails als du lesen.",
  "connections.secret.notAvailable":
    "Noch nicht verfügbar. Ein Administrator muss das zuerst einschalten.",
  "connections.secret.statusError":
    "Es konnte nicht geladen werden, ob du das schon verbunden hast. Lade die Seite neu oder frage einen Administrator, wenn es weiter passiert.",
  "connections.secret.yourAccount": "Dein Konto",
  "connections.secret.connectedCal":
    "Verbunden als {address}. Dein Kalender ist ebenfalls verbunden. Assistenten, die du zulässt, nutzen das als du.",
  "connections.secret.connectedNoCal":
    "Verbunden als {address}. Es ist kein Kalender verbunden. Assistenten, die du zulässt, nutzen das als du.",
  "connections.secret.notConnected":
    "Kein Assistent kann das als du nutzen. Füge unten ein App-Passwort ein, um dein Gmail zu verbinden.",
  "connections.secret.useDifferent": "Ein anderes App-Passwort verwenden",
  "connections.secret.disconnected":
    "Getrennt. {product} kann deine E-Mails und deinen Kalender nicht mehr lesen. Damit das App-Passwort sicher nicht mehr funktioniert, lösche es auch unter {url}.",
  "connections.secret.formDesc":
    "Zwei Schritte bei Google, dann füge ein, was sie dir geben. Es wird nichts gespeichert, wenn Gmail es nicht akzeptiert.",
  "connections.secret.connectTitle": "Verbinden",
  "connections.secret.memberWillUse": "{name} wird dieses Postfach nutzen.",
  "connections.secret.step1Lead":
    "Schalte die Bestätigung in zwei Schritten für dein Google-Konto ein und erstelle dann ein App-Passwort unter",
  "connections.secret.step1Tail":
    ". Nenne es {product} und kopiere die sechzehn Buchstaben.",
  "connections.secret.step2Lead":
    "Damit deine Assistenten auch deinen Kalender sehen können: Öffne in Google Kalender die Einstellungen, wähle deinen Kalender und kopiere seine",
  "connections.secret.step2Link": "Geheime Adresse im iCal-Format",
  "connections.secret.step2Tail": ". Dieser Schritt ist optional.",
  "connections.secret.address": "Deine Gmail-Adresse",
  "connections.secret.password": "App-Passwort",
  "connections.secret.passwordHint":
    "Die sechzehn Buchstaben von Google, mit oder ohne Leerzeichen. Nicht dein gewohntes Passwort.",
  "connections.secret.calendar": "Geheime Adresse des Kalenders (optional)",
  "connections.secret.calendarHint":
    "Jeder mit dieser Adresse kann deinen Kalender lesen, daher wird sie so sorgfältig aufbewahrt wie das Passwort.",
  "connections.secret.checking": "Wird mit Gmail geprüft…",
  "connections.secret.canDoTitle": "Was deine Assistenten damit tun können",
  "connections.secret.canDoDesc":
    "Ein App-Passwort öffnet dein gesamtes Postfach, daher lohnt es sich zu wissen, was es bewirkt.",
  "connections.secret.canDo":
    "Deine Assistenten können deine E-Mails durchsuchen und lesen und sich deinen Kalender ansehen. Sie können nichts löschen, verschieben oder mit Labels versehen. Eine Antwort wird erst nach deiner Genehmigung gesendet, und nur an Personen, die schon in der Nachricht stehen. Du kannst jederzeit trennen, und du kannst das App-Passwort bei Google löschen, wann immer du willst.",
  "connections.mode.goesShared": "Das gemeinsame Konto wird getrennt.",
  "connections.mode.goesNoShared": "Es ist kein gemeinsames Konto verbunden.",
  "connections.mode.goesPersonal": {
    one: "{count} persönliches Konto wird getrennt.",
    other: "{count} persönliche Konten werden getrennt.",
  },
  "connections.mode.makeShared": "{title} gemeinsam machen",
  "connections.mode.makePersonal": "{title} persönlich machen",
  "connections.mode.titleShared": "Ein einziges {title}-Konto teilen?",
  "connections.mode.titlePersonal": "Jedem sein eigenes {title}-Konto geben?",
  "connections.mode.checking": "Es wird geprüft, was sich ändern würde…",
  "connections.mode.everyone":
    "Alle, die einen Assistenten mit dieser App nutzen, handeln als dieses eine Konto.",
  "connections.cancel": "Abbrechen",
  "connections.dir.description":
    "Das App-Verzeichnis von {name}. Füge eine App hinzu, um ihre Tools für Assistenten verfügbar zu machen. Jede Person verbindet trotzdem ihr eigenes Konto, bevor etwas gelesen wird.",
  "connections.dir.appsTitle": "Apps",
  "connections.dir.appsDesc":
    "Suche nach Namen. Niemand hier hat diese Apps geprüft.",
  "connections.dir.searchAria": "Apps von {name} suchen",
  "connections.dir.searchPlaceholder": "Nach App-Namen suchen",
  "connections.dir.noMatch": "Keine App von {name} passt zu „{query}“.",
  "connections.dir.none": "{name} hat keine Apps zurückgegeben.",
  "connections.dir.actions": {
    one: "{count} Aktion",
    other: "{count} Aktionen",
  },
  "connections.dir.added": "Hinzugefügt",
  "connections.dir.adding": "Wird hinzugefügt…",
  "connections.dir.add": "Hinzufügen",
  "connections.grants.consentFailed":
    "{product} hat ohne Zustimmungslink geantwortet, daher wurde nichts autorisiert. Versuche es erneut oder frage einen Administrator, wenn es weiter passiert.",
  "connections.grants.title": "Aktionen",
  "connections.grants.readError":
    "Was dieses Konto erlaubt, konnte gerade nicht gelesen werden.",
  "connections.grants.retry": "Erneut versuchen",
  "connections.grants.description":
    "Gruppiert nach der Berechtigung, die jede Aktion verlangt. Das entspricht dem, was der Zustimmungsbildschirm zeigt.",
  "connections.grants.search": "Aktionen suchen",
  "connections.grants.wholeApp": "Alles in dieser App, gemeinsam genehmigt",
  "connections.grants.noPermission": "Verlangt keine eigene Berechtigung",
  "connections.grants.needs": "Benötigt {scopes}",
  "connections.grants.authorize": "Autorisieren",
  "connections.grants.hidden": {
    one: "{count} weitere Aktion noch nicht autorisiert. Suche, um sie zu finden.",
    other:
      "{count} weitere Aktionen noch nicht autorisiert. Suche, um eine zu finden.",
  },
  "connections.grants.noMatch": "Keine Aktion passt zu dieser Suche.",
  "connections.grants.before": "Bevor du {action} autorisierst",
  "connections.grants.continue": "Weiter zur Zustimmung",
  "connections.grants.notRequired": "Braucht keine Autorisierung.",
  "connections.grants.authorized": "Autorisiert.",
  "connections.grants.notYet": "Noch nicht autorisiert.",
  "connections.grants.notYetAdmin":
    "Noch nicht autorisiert. Ein Administrator kann sie autorisieren.",
  "connections.grants.missing":
    "Es fehlt {missing}. Ein Administrator muss es festlegen. Autorisieren kann das nicht beheben.",
  "connections.grants.missingSetting":
    "Eine Einstellung fehlt. Ein Administrator muss sie festlegen. Autorisieren kann das nicht beheben.",
  "connections.grants.unknown":
    "Diese Aktion konnte gerade nicht gelesen werden. {reason}",
  "connections.row.connectKey":
    "Diese App wird mit einem Schlüssel verbunden, nicht über eine Anmeldeseite, daher wurde nichts verbunden. Lade die Seite neu und drücke erneut auf „Verbinden“.",
  "connections.row.noAuth":
    "{title} braucht kein Konto. Assistenten, die es haben, können es so verwenden, wie es ist.",
  "connections.row.verified":
    "Mit deinem Schlüssel verbunden. Zuletzt geprüft {date}.",
  "connections.row.failedCheck":
    "Dein Schlüssel hat eine Prüfung bei {title} nicht bestanden. Das kann am Schlüssel liegen oder an {title} selbst. Dein Konto ist weiterhin verbunden. Drücke „Erneut prüfen“, um es noch einmal zu versuchen, oder trenne und verbinde mit einem neuen Schlüssel.",
  "connections.row.noSafeCheck":
    "Mit deinem Schlüssel verbunden. Er wurde nicht bei {title} geprüft. Damals hatte {title} keine sichere Möglichkeit, einen Schlüssel zu prüfen. Das liegt an der App, nicht an deinem Schlüssel.",
  "connections.row.unchecked":
    "Mit deinem Schlüssel verbunden. Er wurde nicht bei {title} geprüft.",
  "connections.row.keyStillWorks":
    "Getrennt. Dein Schlüssel funktioniert bei {title} weiterhin. Ändere ihn dort, um jeden Zugriff zu beenden.",
  "connections.row.asksForKey":
    "{title} wird mit einem Schlüssel verbunden, den du schon hast. „Verbinden“ fragt danach.",
  "connections.row.signedIn": "Mit {title} angemeldet. {description}",
  "connections.row.yourAccount": "Dein Konto",
  "connections.row.keyMissing": "Schlüssel fehlt",
  "connections.row.recheck": "Erneut prüfen",
  "connections.row.rechecking": "Wird geprüft…",
  "connections.row.perAction": "Pro Aktion genehmigt",
  "connections.row.connectYour": "Dein Konto verbinden",
  "connections.row.checkingNeeds": "Es wird geprüft, was die App braucht…",
  "connections.row.noNeeds":
    "Es konnte nicht herausgefunden werden, was diese App braucht. Schließe das und versuche es erneut.",
  // connections-end
  // computer-begin
  "computer.tool.readPage": "",
  "computer.tool.readPageCount": { one: "", other: "" },
  "computer.tool.filledIn": "",
  "computer.tool.choseIn": "",
  "computer.tool.clicked": "",
  "computer.tool.pressed": "",
  "computer.tool.listedFiles": "",
  "computer.tool.itemsInWorkspace": { one: "", other: "" },
  "computer.tool.nothingSaved": "",
  "computer.tool.readFile": "",
  "computer.tool.ranCommand": "",
  "computer.tool.addedToFile": "",
  "computer.tool.savedFile": "",
  "computer.tool.scrolled": "",
  "computer.signIn.waiting": "",
  "computer.signIn.signedIn": "",
  "computer.signIn.failed": "",
  "computer.signIn.open": "",
  "computer.signIn.dialogTitle": "",
  "computer.signIn.dialogBody": "",
  "computer.output.truncated": "",
  "computer.output.nothing": "",
  "computer.output.timedOut": "",
  "computer.output.exitCode": "",
  "computer.activity.ran": "",
  "computer.activity.read": "",
  "computer.activity.saved": "",
  "computer.activity.listed": "",
  "computer.activity.workspace": "",
  "computer.activity.refused": "",
  "computer.activity.empty": "",
  "computer.control.handBack": "",
  "computer.control.take": "",
  "computer.control.finishing": "",
  "computer.control.close": "",
  "computer.control.open": "",
  "computer.panel.sidebar": "",
  "computer.live.cantShow": "",
  "computer.live.drivingLabel": "",
  "computer.live.label": "",
  "computer.view.aPage": "",
  "computer.view.openedDuring": "",
  "computer.view.noPage": "",
  "computer.view.cantShow": "",
  "computer.view.cantShowHelp": "",
  "computer.view.blank": "",
  "computer.view.waiting": "",
  "computer.view.unavailable": "",
  "computer.view.alt": "",
  "computer.view.open": "",
  "computer.view.youHaveControl": "",
  "computer.view.botNeedsYou": "",
  "computer.view.cancelRequest": "",
  "computer.view.finishingBot": "",
  "computer.view.recovery": "",
  "computer.view.interrupted": "",
  "computer.view.secretNeedsHost": "",
  "computer.view.secretNeedsPage": "",
  "computer.view.secretType": "",
  "computer.view.secretPlaceholder": "",
  "computer.view.secretGoesHost": "",
  "computer.view.secretGoesPage": "",
  "computer.view.sending": "",
  "computer.view.send": "",
  "computer.view.checking": "",
  "computer.view.drivingOpen": "",
  "computer.view.botHas": "",
  "computer.view.dialog": "",
  "computer.view.close": "",
  "computer.view.turnAlt": "",
  "computer.view.finishingYou": "",
  "computer.view.drivingClick": "",
  "computer.handoff.noCall": "",
  "computer.handoff.answered": "",
  "computer.handoff.running": "",
  "computer.handoff.unreachable": "",
  "computer.handoff.couldntResume": "",
  "computer.handoff.waiting": "",
  "computer.handoff.paused": "",
  "computer.handoff.stopWaiting": "",
  "computer.handoff.resume": "",
  "computer.demo.everyWeekday": "",
  "computer.demo.everyDay": "",
  "computer.demo.everyMonday": "",
  "computer.demo.everyHour": "",
  "computer.demo.scheduled": "",
  "computer.demo.seeRoutines": "",
  "computer.demo.when": "",
  "computer.demo.custom": "",
  "computer.demo.cron": "",
  "computer.demo.reportIn": "",
  "computer.demo.onlyConversation": "",
  "computer.demo.inputs": "",
  "computer.demo.title": "",
  "computer.demo.intro": "",
  "computer.demo.recording": { one: "", other: "" },
  "computer.demo.left": "",
  "computer.demo.limitReached": "",
  "computer.demo.stop": "",
  "computer.demo.name": "",
  "computer.demo.namePlaceholder": "",
  "computer.demo.record": "",
  "computer.demo.takeControl": "",
  "computer.demo.entry": { one: "", other: "" },
  "computer.demo.stoppedAtLimit": "",
  "computer.demo.edit": "",
  "computer.demo.runSchedule": "",
  "computer.demo.reviewDraft": "",
  "computer.demo.reviewTitle": "",
  "computer.demo.reviewHelp": "",
  "computer.demo.saveUse": "",
  "computer.demo.couldntSave": "",
  "computer.demo.ready": "",
  // computer-end
  // onboarding-begin (D181 stage 2o)
  "onboarding.welcome": "",
  "onboarding.welcomeLabel": "",
  "onboarding.welcomeHandOff": "",
  "onboarding.computerTitle": "",
  "onboarding.rosterTitle": "",
  "onboarding.rosterLabel": "",
  "onboarding.rosterExample": "",
  "onboarding.rosterAvailable": "",
  "onboarding.exampleTag": "",
  "onboarding.ownBot": "",
  "onboarding.localTitle": "",
  "onboarding.localKeptIntelligence": "",
  "onboarding.localKeptDatabase": "",
  "onboarding.localBody": "",
  "onboarding.telemetryOff": "",
  "onboarding.telemetryOn": "",
  "onboarding.agentsTitle": "",
  "onboarding.agentsBody": "",
  "onboarding.frameworksLabel": "",
  "onboarding.moreOpenBot": "",
  "onboarding.moreOpenMuse": "",
  "onboarding.moreOpenDots": "",
  "onboarding.orgTitle": "",
  "onboarding.orgBody": "",
  "onboarding.earlyAccess": "",
  "onboarding.moreFrom": "",
  "onboarding.setupTitle": "",
  "onboarding.setupBody": "",
  "onboarding.continue": "",
  "onboarding.notNow": "",
  "onboarding.gmailFailed": "",
  "onboarding.start": "",
  "onboarding.checklist.noStart": "",
  "onboarding.checklist.checking": "",
  "onboarding.checklist.checkAgain": "",
  "onboarding.checklist.recheckFailed": "",
  "onboarding.checklist.readFailed": "",
  "onboarding.checklist.aria": "",
  "onboarding.checklist.unchecked": { one: "", other: "" },
  "onboarding.checklist.allSet": "",
  "onboarding.checklist.gaps": { one: "", other: "" },
  "onboarding.checklist.required": { one: "", other: "" },
  "onboarding.checklist.gapsRequired": "",
  "onboarding.checklist.optional": { one: "", other: "" },
  "onboarding.checklist.notifTitle": "",
  "onboarding.checklist.notifBrowser": "",
  "onboarding.checklist.notifPhone": "",
  "onboarding.checklist.notifBlocked": "",
  "onboarding.checklist.notifUnsupported": "",
  "onboarding.checklist.notifWithout": "",
  "onboarding.checklist.requiredTag": "",
  "onboarding.checklist.ready": "",
  "onboarding.checklist.notChecked": "",
  "onboarding.checklist.needsSetup": "",
  "onboarding.checklist.guide": "",
  "onboarding.checklist.later": "",
  "onboarding.checklist.connecting": "",
  "onboarding.checklist.connect": "",
  "onboarding.checklist.turnOn": "",
  "onboarding.checklist.openPage": "",
  "onboarding.checklist.setNames": "",
  "onboarding.checklist.orAdd": "",
  "onboarding.checklist.and": "",
  "newbot.title": "",
  "newbot.addressMissing": "",
  "newbot.cancel": "",
  "newbot.back": "",
  "newbot.checking": "",
  "newbot.creating": "",
  "newbot.create": "",
  "newbot.continue": "",
  "newbot.ready": "",
  "newbot.takingYou": "",
  "newbot.private": "",
  "newbot.privateLine": "",
  "newbot.public": "",
  "newbot.publicLine": "",
  "newbot.name": "",
  "newbot.namePlaceholder": "",
  "newbot.titleLabel": "",
  "newbot.optional": "",
  "newbot.titlePlaceholder": "",
  "newbot.titleHelp": "",
  "newbot.instructions": "",
  "newbot.role": "",
  "newbot.instructionsPlaceholder": "",
  "newbot.instructionsHelpHere": "",
  "newbot.instructionsHelpOther": "",
  "newbot.whoCanSee": "",
  "newbot.whereRun": "",
  "newbot.runHere": "",
  "newbot.runHereLine": "",
  "newbot.runHereOff": "",
  "newbot.orConnect": "",
  "newbot.whereReached": "",
  "newbot.address": "",
  "newbot.addressHelp": "",
  "newbot.key": "",
  "newbot.keyHelp": "",
  "make.kind.design-system": "",
  "make.plain.design-system": "",
  "make.starter.design-system": "",
  "make.kind.design": "",
  "make.plain.design": "",
  "make.starter.design": "",
  "make.kind.dashboard": "",
  "make.plain.dashboard": "",
  "make.starter.dashboard": "",
  "make.kind.slides": "",
  "make.plain.slides": "",
  "make.starter.slides": "",
  "make.kind.doc": "",
  "make.plain.doc": "",
  "make.starter.doc": "",
  "make.kind.page": "",
  "make.plain.page": "",
  "make.starter.page": "",
  "make.all": "",
  "make.byName": "",
  "make.byBots": "",
  "make.savedUpNext": "",
  "make.loadError": "",
  "make.empty": "",
  "make.emptyHelp": "",
  "make.yourBot": "",
  "make.noneOfKind": "",
  "make.listAria": "",
  "make.question": "",
  "make.show": "",
  "make.making": "",
  "make.starting": "",
  "make.close": "",
  "make.whatToMake": "",
  "make.makeKind": "",
  "make.something": "",
  "upnext.yourBot": "",
  "upnext.cancel": "",
  "upnext.cancelNamed": "",
  "upnext.aria": "",
  "upnext.comingUp": "",
  "upnext.loadError": "",
  "upnext.noMatch": "",
  "upnext.started": "",
  "upnext.activityError": "",
  "upnext.fromApp": "",
  "upnext.aConnectedApp": "",
  "upnext.youAsked": "",
  "upnext.hideNamed": "",
  "upnext.startNamed": "",
  "upnext.hide": "",
  "upnext.start": "",
  "upnext.conversationsError": "",
  "upnext.plateTitle": "",
  "upnext.plateBody": "",
  "upnext.checks": "",
  "upnext.looking": "",
  "upnext.showMe": "",
  "upnext.nothingNew": "",
  "upnext.checkFailed": "",
  "upnext.slow": "",
  "upnext.suggestTitle": "",
  "upnext.suggestBody": "",
  "upnext.turnOn": "",
  "memory.err.load": "",
  "memory.err.sources": "",
  "memory.err.actions": "",
  "memory.err.create": "",
  "memory.err.update": "",
  "memory.err.delete": "",
  "memory.err.addSource": "",
  "memory.err.changeSource": "",
  "memory.fact.button": "",
  "memory.fact.help": "",
  "memory.fact.label": "",
  "memory.fact.placeholder": "",
  "memory.fact.cancel": "",
  "memory.fact.remember": "",
  "memory.list.title": "",
  "memory.list.yourBot": "",
  "memory.list.empty": "",
  "memory.list.inIntelligence": "",
  "memory.list.off": "",
  "memory.list.formedBy": "",
  "memory.list.formedByReview": "",
  "memory.list.importedReview": "",
  "memory.list.reviewed": "",
  "memory.list.fromSource": "",
  "memory.list.aConversation": "",
  "memory.list.readAt": "",
  "memory.list.openRecord": "",
  "memory.list.edit": "",
  "memory.list.confirm": "",
  "memory.list.forget": "",
  "memory.list.useAria": "",
  "memory.list.editTitle": "",
  "memory.list.memory": "",
  "memory.list.save": "",
  "routines.day.today": "",
  "routines.day.tomorrow": "",
  "routines.untitled": "",
  "routines.blk.done": "",
  "routines.blk.failed": "",
  "routines.blk.running": "",
  "routines.blk.pending": "",
  "routines.blk.missed": "",
  "routines.blk.summary": "",
  "routines.blk.doneOf": "",
  "routines.nextRun": "",
  "routines.nextRunHere": "",
  "routines.err.runs": "",
  "routines.err.list": "",
  "routines.err.change": "",
  "routines.err.start": "",
  "routines.err.calendar": "",
  "routines.err.history": "",
  "proactive.err.settings": "",
  "proactive.err.suggestions": "",
  "proactive.err.suggestion": "",
  "proactive.err.turnOn": "",
  "proactive.err.change": "",
  "proactive.err.run": "",
  "proactive.err.remove": "",
  "proactive.err.start": "",
  "proactive.err.dismiss": "",
  "demo.err.load": "",
  "demo.err.start": "",
  "demo.err.stop": "",
  "demo.err.draft": "",
  "demo.err.publish": "",
  "demo.err.delete": "",
  "demo.err.schedule": "",
  "resp.err.load": "",
  "resp.err.runs": "",
  "resp.err.github": "",
  "resp.err.create": "",
  "resp.err.update": "",
  "resp.err.change": "",
  "resp.err.connectGithub": "",
  "resp.err.disconnectGithub": "",
  "resp.err.triggers": "",
  "resp.err.addTrigger": "",
  "resp.err.secretChange": "",
  "resp.err.secretRead": "",
  "resp.err.removeTrigger": "",
  "resp.err.changeTrigger": "",
  "claude.notConnected.title": "",
  "claude.notConnected.body": "",
  "claude.notInstalled.title": "",
  "claude.notInstalled.body": "",
  "claude.outcome.connected": "",
  "claude.outcome.notConnected": "",
  "claude.outcome.notInstalled": "",
  "claude.outcome.waiting": "",
  "claude.outcome.elsewhere": "",
  "claude.outcome.hosted": "",
  "claude.outcome.noEngine": "",
  "claude.aria": "",
  "claude.checking": "",
  "claude.checkAgain": "",
  "claude.copied": "",
  "claude.copy": "",
  // onboarding-end
  // working-start (D188)
  "working.region": "",
  "working.nobody": "",
  "working.for": "",
  "working.underMinute": "",
  "working.minutes": { one: "", other: "" },
  "working.hours": { one: "", other: "" },
  "working.hoursMinutes": "",
  "working.seconds": "",
  "working.signAgo": "",
  "working.justStarted": "",
  "working.lastStep": "",
  "working.queued": "",
  "working.waiting": "",
  "working.stuck": "",
  "working.didNotFinish": "",
  "working.tryAgain": "",
  "working.ringWaiting": "",
  "working.ringStuck": "",
  "working.step.writing": "",
  "working.step.reading": "",
  "working.step.command": "",
  "working.step.readPage": "",
  "working.step.usePage": "",
  "working.step.searching": "",
  "working.step.mail": "",
  "working.step.calendar": "",
  "working.step.asking": "",
  "working.step.notes": "",
  "working.step.picture": "",
  "working.step.video": "",
  "working.step.working": "",
  "working.checking": "",
  "working.cantTell": "",
  "working.ringElsewhere": "",
  // working-end
  // files-start
  "files.title": "",
  "files.lead": "",
  "files.rowDescription": "",
  "files.empty": "",
  "files.refresh": "",
  "files.refreshing": "",
  "files.download": "",
  "files.downloading": "",
  "files.loading": "",
  "files.loadError": "",
  "files.downloadError": "",
  "files.more": "",
  "files.size": "",
  "files.modified": "",
  "files.purpose": "",
  // files-end
};
