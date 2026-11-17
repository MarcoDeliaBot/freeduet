/**
 * DE for `approval-text.ts` (docs/M1_PLAN.md D50). Plain, short, addressed to the person ("you").
 * Product and tool names stay as they are (FreeDuet, Gmail, Full access, Bot, Spam).
 *
 * Typed as a COMPLETE table: an id added to English alone stops `tsc` here.
 */
import type { CompleteApprovalTextTable } from "./approval-text";

export const APPROVAL_TEXT_DE: CompleteApprovalTextTable = {
  "view.sendEmail": "E-Mail senden",
  "view.sendMessage": "Nachricht senden",
  "rule.title": "Mail-Regel erstellen",
  "rule.sentence": "Ab jetzt gilt für E-Mails {when}: {done}.",
  "rule.when.fromAddress": "von {value}",
  "rule.when.fromDomain": "von der Domain {value}",
  "rule.when.toAddress": "an {value}",
  "rule.when.listId": "von der Liste {value}",
  "rule.when.subjectContains": "mit {value} im Betreff",
  "rule.when.words": "mit den Wörtern {value} im Betreff oder Absender",
  "rule.does.label": "Label {names} setzen",
  "rule.does.markRead": "als gelesen markieren",
  "rule.does.archive": "archivieren",
  "rule.does.spam": "in den Spam verschieben",
  "rule.does.bin": "in den Papierkorb verschieben",
  "rule.does.nothing": "nichts tun",
  "join.and": " und ",
  "rule.happens":
    "FreeDuet wendet sie alle paar Minuten auf neue E-Mails an, ohne erneut zu fragen, bis du sie ausschaltest. Es ist kein Gmail-Filter. Sie leitet nie weiter, antwortet nie und löscht nie endgültig.",
  "rule.happens.existing":
    " Sie wird außerdem einmal auf passende E-Mails angewendet, die schon im Posteingang liegen.",
  "rule.delete.title": "Mail-Regel löschen",
  "rule.enable.title": "Mail-Regel einschalten",
  "rule.disable.title": "Mail-Regel ausschalten",
  "rule.delete.happens":
    "Die Regel wird entfernt und gilt nicht mehr für neue E-Mails. E-Mails, die sie schon verschoben hat, bleiben, wo sie sind.",
  "rule.enable.happens":
    "Die Regel gilt wieder, für E-Mails, die ab jetzt eintreffen.",
  "rule.disable.happens":
    "Die Regel gilt nicht mehr für neue E-Mails. E-Mails, die sie schon verschoben hat, bleiben, wo sie sind.",
  "label.title.named": "Label {name} erstellen",
  "label.title": "Label erstellen",
  "label.happens":
    "In deinem Gmail wird ein neues, leeres Label angelegt. Keine Nachricht wird verändert.",
  "archive.title": {
    one: "{count} Nachricht archivieren",
    other: "{count} Nachrichten archivieren",
  },
  "archive.happens":
    "Sie verlassen den Posteingang und bleiben unter „Alle Nachrichten“, mit ihren Labels. Nichts wird gelöscht.",
  "spam.title": {
    one: "{count} Nachricht in den Spam verschieben",
    other: "{count} Nachrichten in den Spam verschieben",
  },
  "spam.happens":
    "Sie landen im Spam-Ordner. Gmail löscht Spam nach etwa 30 Tagen; bis dahin kannst du sie zurückholen.",
  "bin.title": {
    one: "{count} Nachricht in den Papierkorb verschieben",
    other: "{count} Nachrichten in den Papierkorb verschieben",
  },
  "bin.happens":
    "Sie landen im Papierkorb und bleiben dort etwa 30 Tage. Du kannst sie von dort wiederherstellen. Danach löscht Gmail sie endgültig.",
  "mark.read.title": {
    one: "{count} Nachricht als gelesen markieren",
    other: "{count} Nachrichten als gelesen markieren",
  },
  "mark.unread.title": {
    one: "{count} Nachricht als ungelesen markieren",
    other: "{count} Nachrichten als ungelesen markieren",
  },
  "mark.happens":
    "Es ändert sich nur, ob sie als gelesen angezeigt werden. Nichts wird gelöscht.",
  "labels.add.one.title": {
    one: "Label {name} zu {count} Nachricht hinzufügen",
    other: "Label {name} zu {count} Nachrichten hinzufügen",
  },
  "labels.add.many.title": {
    one: "{labels} Labels zu {count} Nachricht hinzufügen",
    other: "{labels} Labels zu {count} Nachrichten hinzufügen",
  },
  "labels.remove.one.title": {
    one: "Label {name} von {count} Nachricht entfernen",
    other: "Label {name} von {count} Nachrichten entfernen",
  },
  "labels.remove.many.title": {
    one: "{labels} Labels von {count} Nachricht entfernen",
    other: "{labels} Labels von {count} Nachrichten entfernen",
  },
  "labels.change.title": {
    one: "Labels von {count} Nachricht ändern",
    other: "Labels von {count} Nachrichten ändern",
  },
  "labels.happens":
    "Labels werden hinzugefügt oder entfernt. Keine Nachricht wird verschoben oder gelöscht.",
  "messages.unreadable": {
    one: "Dein Postfach konnte gerade nicht gelesen werden, deshalb werden Absender und Betreff nicht angezeigt. Genannt: {count} Nachricht.",
    other:
      "Dein Postfach konnte gerade nicht gelesen werden, deshalb werden Absender und Betreff nicht angezeigt. Genannt: {count} Nachrichten.",
  },
  "notFound.text": {
    one: "Von den {total} genannten Nachrichten fehlen in deinem Postfach: {count}. Deshalb wird das so abgelehnt.",
    other:
      "Von den {total} genannten Nachrichten fehlen in deinem Postfach: {count}. Deshalb wird das so abgelehnt.",
  },
  "reason.credentials":
    "Ein Passwort, einen Code, die Zwei-Faktor-Einstellung, einen Wiederherstellungscode oder andere Zugangsdaten änderst immer du selbst.",
  "reason.securitySettings":
    "Sicherheits-, Freigabe- oder Zugriffseinstellungen eines Kontos änderst immer du selbst.",
  "reason.payments": "Zahlen, Kaufen oder Geld bewegen machst immer du selbst.",
  "reason.reviewer.credentials":
    "Die automatische Prüfung hat festgestellt, dass dies ein Passwort, einen Code, die Zwei-Faktor-Einstellung oder andere Zugangsdaten ändert. Das machst immer du selbst.",
  "reason.reviewer.securitySettings":
    "Die automatische Prüfung hat festgestellt, dass dies Sicherheits-, Freigabe- oder Zugriffseinstellungen ändert. Das machst immer du selbst.",
  "reason.reviewer.payments":
    "Die automatische Prüfung hat festgestellt, dass dies zahlt, kauft oder Geld bewegt. Das machst immer du selbst.",
  "reason.fullAccess": "Full access ist für dieses Mitglied eingeschaltet.",
  "reason.fullAccessNoPayments":
    "Full access ohne Zahlungen ist für dieses Mitglied eingeschaltet.",
  "reason.ruleHandsOff": "Eine Regel übergibt diese Art von Aktion an dich.",
  "reason.ruleAsks": "Eine Regel fragt vor dieser Art von Aktion nach.",
  "reason.ruleAllows": "Eine Regel erlaubt diese Art von Aktion.",
  "reason.preApprovedMet":
    "Du hast genau diese Aktion in dieser Anfrage angefordert.",
  "reason.preApprovedNotMet":
    "Eine Regel erlaubt das nur, wenn du es verlangt hast, und deine Anfrage diesmal enthielt das nicht.",
  "reason.askBeforeChanges":
    "Du hast darum gebeten, Änderungen vor der Ausführung zu prüfen.",
  "reason.noRule":
    "Keine Regel und keine Einstellung verlangt hier eine Rückfrage.",
  "reason.mailboxNotAsked":
    "Du hast diese Änderung an deinem Postfach nicht in deiner eigenen Nachricht verlangt, deshalb fragt es dich zuerst.",
  "reason.unattended":
    "Das kommt von einer Routine oder einem Trigger, die von allein laufen, nicht von einer Nachricht von dir. Deshalb fragt FreeDuet dich immer zuerst.",
  "reason.tooLongToReview":
    "Dieser Befehl oder dieses Skript ist zu lang, als dass der automatische Prüfer es vollständig lesen könnte. Deshalb entscheidest du.",
  "reason.automation":
    "Routinen und Trigger handeln später ohne dich. Deshalb fragt FreeDuet dich immer zuerst, wenn eine eingerichtet, geändert oder gelöscht wird.",
  "reason.setting":
    "Wenn ein Bot eine deiner Einstellungen im Chat ändert, fragt es immer zuerst, egal ob Full access an ist oder nicht.",
  "reason.remoteWrite":
    "Das hast du von einem Browser gesendet, der nicht mit dem Computer gekoppelt ist, auf dem FreeDuet läuft. Deshalb fragt FreeDuet dich immer zuerst, egal was Full access oder deine gespeicherten Regeln sagen. Ein am Computer gekoppelter Browser funktioniert wie bisher.",
  "reason.newEmail":
    "Bei einer neuen E-Mail wird jedes Mal gefragt. Prüfe, an wen sie geht und was drinsteht, dann erlaube sie oder lehne sie ab.",
  "reason.reviewerNone":
    "Es ist kein Prüfmodell eingerichtet, deshalb braucht das deine Zustimmung.",
  "reason.reviewerInvalid":
    "Die Antwort der Prüfung war kein gültiges Ergebnis.",
  "reason.reviewerUnreachable":
    "Die Prüfung war nicht erreichbar ({error}), deshalb braucht das deine Zustimmung.",
  "remote.answerSentence":
    "Ein Browser, der nicht mit dem Computer gekoppelt ist, auf dem FreeDuet läuft, kann eine normale Anfrage einmal erlauben oder ablehnen. Diese hier wird am Computer beantwortet, wo du sie vollständig lesen kannst. Sie wartet dort noch.",
};
