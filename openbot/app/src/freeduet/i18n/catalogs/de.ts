import type { Catalog } from "../translate";
import type { EN } from "./en";

/*
 * German: "du", the form the site's German pages use for the reader. The site's German words are
 * "Assistent" for a Bot and "Mitglied" for a member, and "Engine" and "Full access" stay in English there.
 * Not yet checked by a person who reads German.
 */
export const de: Catalog<typeof EN> = {
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
};
