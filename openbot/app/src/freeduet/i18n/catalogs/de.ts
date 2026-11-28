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
  // stage-2j begin
  "admin.computers.description": "",
  "admin.computers.loadError": "",
  "admin.computers.shared.lead": "",
  "admin.computers.shared.before": "",
  "admin.computers.shared.after": "",
  "admin.computers.perBot": "",
  "admin.computers.list.title": "",
  "admin.computers.list.error": "",
  "admin.computers.list.empty": "",
  "admin.computers.running": "",
  "admin.computers.notRunning": "",
  "admin.computers.egress.unknown": "",
  "admin.computers.egress.direct": "",
  "admin.computers.egress.via": "",
  "admin.computers.updateAvailable": "",
  "admin.computers.update": "",
  "admin.computers.working": "",
  "admin.computers.stop": "",
  "admin.computers.reset": "",
  "admin.computers.resetTitle": "",
  "admin.computers.resetDesc": "",
  "admin.computers.resetting": "",
  "admin.computers.resetIt": "",
  "admin.computers.updateTitle": "",
  "admin.computers.updateDesc": "",
  "admin.computers.updating": "",
  "admin.computers.updateIt": "",
  "admin.computers.foot.stopLead": "",
  "admin.computers.foot.stopRest": "",
  "admin.computers.foot.resetLead": "",
  "admin.computers.foot.resetRest": "",
  "admin.computers.foot.updateLead": "",
  "admin.computers.foot.updateRest": "",
  "admin.computers.foot.audit": "",
  "admin.computers.host.description": "",
  "admin.computers.host.title": "",
  "admin.computers.host.offline": "",
  "admin.computers.host.noBots": "",
  "admin.computers.host.choose": "",
  "admin.computers.host.waiting": "",
  "admin.computers.host.readOnlyNote": "",
  "admin.computers.host.stopAccess": "",
  "admin.computers.host.stopping": "",
  "admin.computers.host.viewAudit": "",
  "admin.computers.host.readOnly": "",
  "admin.computers.host.revoke": "",
  "admin.computers.host.revoking": "",
  "admin.computers.host.pendingFrom": "",
  "admin.computers.host.pendingFromFor": "",
  "admin.computers.host.folders": { one: "", other: "" },
  "admin.computers.host.requests": { one: "", other: "" },
  "admin.computers.host.none": "",
  "admin.computers.host.owner": "",
  "admin.computers.host.p.write": "",
  "admin.computers.host.p.run": "",
  "admin.computers.host.p.list": "",
  "admin.computers.host.p.read": "",
  "admin.computers.host.p.stop": "",
  "admin.computers.host.p.default": "",
  "admin.learning.description": "",
  "admin.learning.auto.assigned": "",
  "admin.learning.auto.absent": "",
  "admin.learning.auto.notEntitled": "",
  "admin.learning.auto.unavailable": "",
  "admin.learning.target.container": "",
  "admin.learning.target.revision": "",
  "admin.learning.target.revisionAria": "",
  "admin.learning.target.latest": "",
  "admin.learning.create.busy": "",
  "admin.learning.create.button": "",
  "admin.learning.create.note": "",
  "admin.learning.create.how": "",
  "admin.learning.part.title": "",
  "admin.learning.part.description": "",
  "admin.learning.part.loading": "",
  "admin.learning.part.turnOn": "",
  "admin.learning.part.default": "",
  "admin.learning.part.hint": "",
  "admin.learning.part.perBot": "",
  "admin.learning.part.botListError": "",
  "admin.learning.part.botAria": "",
  "admin.learning.part.inherit": "",
  "admin.learning.part.exclude": "",
  "admin.learning.part.container": "",
  "admin.learning.part.saving": "",
  "admin.learning.part.save": "",
  "admin.learning.part.saved": "",
  "admin.learning.rev.title": "",
  "admin.learning.rev.description": "",
  "admin.learning.rev.showFor": "",
  "admin.learning.rev.default": "",
  "admin.learning.rev.checking": "",
  "admin.learning.rev.invalid": "",
  "admin.learning.rev.selection": "",
  "admin.learning.rev.none": "",
  "admin.learning.rev.threads": "",
  "admin.learning.rev.candidates": "",
  "admin.learning.rev.published": "",
  "admin.learning.rev.insights": "",
  "admin.learning.rev.running": "",
  "admin.learning.rev.latest": "",
  "admin.learning.rev.noRun": "",
  "admin.learning.rev.manage": "",
  "admin.learning.rev.reviewCandidates": "",
  "admin.learning.rev.viewRuns": "",
  "admin.learning.del.title": "",
  "admin.learning.del.checking": "",
  "admin.learning.del.off": "",
  "admin.learning.del.waiting": "",
  "admin.learning.del.stale": "",
  "admin.learning.del.ok": "",
  "admin.learning.del.revision": "",
  "admin.learning.del.lastChecked": "",
  "admin.learning.rev.refresh": "",
  "admin.learning.rev.footer": "",
  "admin.skills.write": "",
  "admin.skills.description": "",
  "admin.skills.installed.title": "",
  "admin.skills.installed.description": "",
  "admin.skills.loadError": "",
  "admin.skills.empty": "",
  "admin.skills.dlg.title": "",
  "admin.skills.dlg.description": "",
  "admin.skills.slug": "",
  "admin.skills.title": "",
  "admin.skills.summary": "",
  "admin.skills.summaryPlaceholder": "",
  "admin.skills.instructions": "",
  "admin.skills.instructionsPlaceholder": "",
  "admin.skills.install": "",
  // stage-2j end
};
