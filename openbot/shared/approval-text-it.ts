/**
 * Italian for `approval-text.ts` (docs/M1_PLAN.md D50). Plain, short, the "tu" form, no jargon.
 * Product and tool names stay as they are (FreeDuet, Gmail, Full access, Spam, Bot).
 *
 * Typed as a COMPLETE table: an id added to English alone stops `tsc` here.
 */
import type { CompleteApprovalTextTable } from "./approval-text";

export const APPROVAL_TEXT_IT: CompleteApprovalTextTable = {
  "view.sendEmail": "Invia un'email",
  "view.sendMessage": "Invia un messaggio",
  "rule.title": "Crea una regola per la posta",
  "rule.sentence": "D'ora in poi, la posta {when}: {done}.",
  "rule.when.fromAddress": "da {value}",
  "rule.when.fromDomain": "dal dominio {value}",
  "rule.when.toAddress": "inviata a {value}",
  "rule.when.listId": "dalla lista {value}",
  "rule.when.subjectContains": "con {value} nell'oggetto",
  "rule.when.words": "con le parole {value} nell'oggetto o nel mittente",
  "rule.does.label": "metti l'etichetta {names}",
  "rule.does.markRead": "segna come letta",
  "rule.does.archive": "archivia",
  "rule.does.spam": "sposta in Spam",
  "rule.does.bin": "sposta nel Cestino",
  "rule.does.nothing": "non fare nulla",
  "join.and": " e ",
  "rule.happens":
    "FreeDuet la applica alla posta nuova ogni pochi minuti, senza chiedere di nuovo, finché non la spegni. Non è un filtro di Gmail. Non inoltra, non risponde e non cancella mai in modo definitivo.",
  "rule.happens.existing":
    " La applica anche una volta alla posta che corrisponde ed è già nella Posta in arrivo.",
  "rule.delete.title": "Elimina una regola per la posta",
  "rule.enable.title": "Attiva una regola per la posta",
  "rule.disable.title": "Disattiva una regola per la posta",
  "rule.delete.happens":
    "La regola viene tolta e non si applica più alla posta nuova. La posta che ha già spostato resta dove sta.",
  "rule.enable.happens":
    "La regola torna a funzionare, sulla posta che arriva da adesso.",
  "rule.disable.happens":
    "La regola non si applica più alla posta nuova. La posta che ha già spostato resta dove sta.",
  "label.title.named": "Crea l'etichetta {name}",
  "label.title": "Crea un'etichetta",
  "label.happens":
    "Viene aggiunta a Gmail una nuova etichetta vuota. Nessun messaggio viene modificato.",
  "archive.title": {
    one: "Archivia {count} messaggio",
    other: "Archivia {count} messaggi",
  },
  "archive.happens":
    "Escono dalla Posta in arrivo e restano in Tutti i messaggi, con le loro etichette. Non viene cancellato nulla.",
  "spam.title": {
    one: "Sposta {count} messaggio in Spam",
    other: "Sposta {count} messaggi in Spam",
  },
  "spam.happens":
    "Vanno nella cartella Spam. Gmail cancella la posta in Spam dopo circa 30 giorni; fino ad allora puoi rimetterla a posto.",
  "bin.title": {
    one: "Sposta {count} messaggio nel Cestino",
    other: "Sposta {count} messaggi nel Cestino",
  },
  "bin.happens":
    "Vanno nel Cestino e ci restano per circa 30 giorni. Puoi ripristinarli da lì. Dopo, Gmail li cancella per sempre.",
  "mark.read.title": {
    one: "Segna {count} messaggio come letto",
    other: "Segna {count} messaggi come letti",
  },
  "mark.unread.title": {
    one: "Segna {count} messaggio come non letto",
    other: "Segna {count} messaggi come non letti",
  },
  "mark.happens":
    "Cambia solo se risultano letti o no. Non viene cancellato nulla.",
  "labels.add.one.title": {
    one: "Aggiungi l'etichetta {name} a {count} messaggio",
    other: "Aggiungi l'etichetta {name} a {count} messaggi",
  },
  "labels.add.many.title": {
    one: "Aggiungi {labels} etichette a {count} messaggio",
    other: "Aggiungi {labels} etichette a {count} messaggi",
  },
  "labels.remove.one.title": {
    one: "Togli l'etichetta {name} da {count} messaggio",
    other: "Togli l'etichetta {name} da {count} messaggi",
  },
  "labels.remove.many.title": {
    one: "Togli {labels} etichette da {count} messaggio",
    other: "Togli {labels} etichette da {count} messaggi",
  },
  "labels.change.title": {
    one: "Cambia le etichette di {count} messaggio",
    other: "Cambia le etichette di {count} messaggi",
  },
  "labels.happens":
    "Le etichette vengono aggiunte o tolte. Nessun messaggio viene spostato o cancellato.",
  "messages.unreadable": {
    one: "Non è stato possibile leggere la tua casella in questo momento, quindi non si vede da chi è né di cosa parla. {count} messaggio indicato.",
    other:
      "Non è stato possibile leggere la tua casella in questo momento, quindi non si vede da chi sono né di cosa parlano. {count} messaggi indicati.",
  },
  "notFound.text": {
    one: "{count} messaggio dei {total} indicati non è nella tua casella, quindi verrà rifiutato così com'è.",
    other:
      "{count} messaggi dei {total} indicati non sono nella tua casella, quindi verrà rifiutato così com'è.",
  },
  "reason.credentials":
    "Cambiare una password, un codice di accesso, la verifica in due passaggi, un codice di recupero o un'altra credenziale lo fai sempre tu.",
  "reason.securitySettings":
    "Cambiare le impostazioni di sicurezza, di condivisione o di accesso di un account lo fai sempre tu.",
  "reason.payments": "Pagare, acquistare o spostare denaro lo fai sempre tu.",
  "reason.reviewer.credentials":
    "Il controllo automatico ha trovato che questa azione cambia una password, un codice di accesso, la verifica in due passaggi o un'altra credenziale: lo fai sempre tu.",
  "reason.reviewer.securitySettings":
    "Il controllo automatico ha trovato che questa azione cambia le impostazioni di sicurezza, di condivisione o di accesso: lo fai sempre tu.",
  "reason.reviewer.payments":
    "Il controllo automatico ha trovato che questa azione paga, acquista o sposta denaro: lo fai sempre tu.",
  "reason.fullAccess": "Full access è attivo per questo membro.",
  "reason.fullAccessNoPayments":
    "Full access senza pagamenti è attivo per questo membro.",
  "reason.ruleHandsOff": "Una regola affida a te questo tipo di azione.",
  "reason.ruleAsks": "Una regola chiede prima di questo tipo di azione.",
  "reason.ruleAllows": "Una regola consente questo tipo di azione.",
  "reason.preApprovedMet":
    "Hai chiesto tu questa azione precisa in questa richiesta.",
  "reason.preApprovedNotMet":
    "Una regola consente questa azione solo se l'hai chiesta tu, e la richiesta di questa volta non la chiedeva.",
  "reason.askBeforeChanges":
    "Hai chiesto di controllare le modifiche prima che avvengano.",
  "reason.noRule":
    "Nessuna regola o preferenza chiede di controllare questa azione.",
  "reason.mailboxNotAsked":
    "Nel tuo messaggio non hai chiesto questa modifica alla tua casella, quindi te lo chiede prima.",
  "reason.unattended":
    "Questa richiesta arriva da una routine o da un trigger che gira da solo, non da un tuo messaggio, quindi te lo chiede sempre prima.",
  "reason.tooLongToReview":
    "Questo comando o script è troppo lungo perché il revisore automatico lo legga per intero, quindi decidi tu.",
  "reason.automation":
    "Le routine e i trigger agiscono più tardi senza di te, quindi crearne uno, cambiarlo o eliminarlo te lo chiede sempre prima.",
  "reason.setting":
    "Quando un Bot cambia una tua impostazione dalla chat, te lo chiede sempre prima, con Full access attivo o no.",
  "reason.remoteWrite":
    "Questo l'hai inviato da un browser non abbinato al computer su cui gira FreeDuet, quindi te lo chiede sempre prima, qualunque cosa dicano Full access o le tue regole salvate. Un browser abbinato al computer funziona come prima.",
  "reason.newEmail":
    "Una nuova email te la chiede ogni volta. Controlla a chi arriva e cosa dice, poi consenti questa o rifiutala.",
  "reason.reviewerNone":
    "Non è configurato nessun controllo automatico, quindi serve la tua approvazione.",
  "reason.reviewerInvalid": "La risposta del controllo non era valida.",
  "reason.reviewerUnreachable":
    "Il controllo non è raggiungibile ({error}), quindi serve la tua approvazione.",
  "remote.answerSentence":
    "Un browser non abbinato al computer su cui gira FreeDuet può consentire una richiesta normale una volta o rifiutarla. Questa si decide al computer, dove puoi leggerla per intero. È ancora in attesa lì.",
};
