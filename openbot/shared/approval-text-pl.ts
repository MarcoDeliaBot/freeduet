/**
 * PL for `approval-text.ts` (docs/M1_PLAN.md D50). Plain, short, addressed to the person ("you").
 * Product and tool names stay as they are (FreeDuet, Gmail, Full access, Bot, Spam).
 *
 * Typed as a COMPLETE table: an id added to English alone stops `tsc` here.
 */
import type { CompleteApprovalTextTable } from "./approval-text";

export const APPROVAL_TEXT_PL: CompleteApprovalTextTable = {
  "view.sendEmail": "Wyślij e-mail",
  "view.sendMessage": "Wyślij wiadomość",
  "rule.title": "Utwórz regułę poczty",
  "rule.sentence": "Od teraz dla poczty {when}: {done}.",
  "rule.when.fromAddress": "od {value}",
  "rule.when.fromDomain": "z domeny {value}",
  "rule.when.toAddress": "wysłanej do {value}",
  "rule.when.listId": "z listy {value}",
  "rule.when.subjectContains": "z {value} w temacie",
  "rule.when.words": "ze słowami {value} w temacie lub nadawcy",
  "rule.does.label": "dodaj etykietę {names}",
  "rule.does.markRead": "oznacz jako przeczytaną",
  "rule.does.archive": "archiwizuj",
  "rule.does.spam": "przenieś do Spamu",
  "rule.does.bin": "przenieś do Kosza",
  "rule.does.nothing": "nic nie rób",
  "join.and": " i ",
  "rule.happens":
    "FreeDuet stosuje ją do nowej poczty co kilka minut, bez ponownego pytania, aż ją wyłączysz. To nie jest filtr Gmaila. Nigdy nie przekazuje dalej, nie odpowiada i nie usuwa na stałe.",
  "rule.happens.existing":
    " Jest też raz zastosowana do pasującej poczty, która już jest w Odebranych.",
  "rule.delete.title": "Usuń regułę poczty",
  "rule.enable.title": "Włącz regułę poczty",
  "rule.disable.title": "Wyłącz regułę poczty",
  "rule.delete.happens":
    "Reguła zostaje usunięta i nie działa już na nową pocztę. Poczta, którą już przeniosła, zostaje tam, gdzie jest.",
  "rule.enable.happens":
    "Reguła znów działa, na pocztę, która przyjdzie od teraz.",
  "rule.disable.happens":
    "Reguła nie działa już na nową pocztę. Poczta, którą już przeniosła, zostaje tam, gdzie jest.",
  "label.title.named": "Utwórz etykietę {name}",
  "label.title": "Utwórz etykietę",
  "label.happens":
    "Do Twojego Gmaila zostanie dodana nowa, pusta etykieta. Żadna wiadomość się nie zmieni.",
  "archive.title": {
    one: "Archiwizuj: {count} wiadomość",
    few: "Archiwizuj: {count} wiadomości",
    many: "Archiwizuj: {count} wiadomości",
    other: "Archiwizuj: {count} wiadomości",
  },
  "archive.happens":
    "Znikają z Odebranych i zostają we Wszystkich, z etykietami. Nic nie jest usuwane.",
  "spam.title": {
    one: "Przenieś do Spamu: {count} wiadomość",
    few: "Przenieś do Spamu: {count} wiadomości",
    many: "Przenieś do Spamu: {count} wiadomości",
    other: "Przenieś do Spamu: {count} wiadomości",
  },
  "spam.happens":
    "Trafiają do folderu Spam. Gmail usuwa pocztę ze Spamu po około 30 dniach; do tego czasu możesz ją przywrócić.",
  "bin.title": {
    one: "Przenieś do Kosza: {count} wiadomość",
    few: "Przenieś do Kosza: {count} wiadomości",
    many: "Przenieś do Kosza: {count} wiadomości",
    other: "Przenieś do Kosza: {count} wiadomości",
  },
  "bin.happens":
    "Trafiają do Kosza i zostają tam około 30 dni. Możesz je stamtąd przywrócić. Potem Gmail usuwa je na stałe.",
  "mark.read.title": {
    one: "Oznacz jako przeczytane: {count} wiadomość",
    few: "Oznacz jako przeczytane: {count} wiadomości",
    many: "Oznacz jako przeczytane: {count} wiadomości",
    other: "Oznacz jako przeczytane: {count} wiadomości",
  },
  "mark.unread.title": {
    one: "Oznacz jako nieprzeczytane: {count} wiadomość",
    few: "Oznacz jako nieprzeczytane: {count} wiadomości",
    many: "Oznacz jako nieprzeczytane: {count} wiadomości",
    other: "Oznacz jako nieprzeczytane: {count} wiadomości",
  },
  "mark.happens":
    "Zmienia się tylko to, czy widać je jako przeczytane. Nic nie jest usuwane.",
  "labels.add.one.title": {
    one: "Dodaj etykietę {name}: {count} wiadomość",
    few: "Dodaj etykietę {name}: {count} wiadomości",
    many: "Dodaj etykietę {name}: {count} wiadomości",
    other: "Dodaj etykietę {name}: {count} wiadomości",
  },
  "labels.add.many.title": {
    one: "Dodaj etykiety ({labels}): {count} wiadomość",
    few: "Dodaj etykiety ({labels}): {count} wiadomości",
    many: "Dodaj etykiety ({labels}): {count} wiadomości",
    other: "Dodaj etykiety ({labels}): {count} wiadomości",
  },
  "labels.remove.one.title": {
    one: "Zdejmij etykietę {name}: {count} wiadomość",
    few: "Zdejmij etykietę {name}: {count} wiadomości",
    many: "Zdejmij etykietę {name}: {count} wiadomości",
    other: "Zdejmij etykietę {name}: {count} wiadomości",
  },
  "labels.remove.many.title": {
    one: "Zdejmij etykiety ({labels}): {count} wiadomość",
    few: "Zdejmij etykiety ({labels}): {count} wiadomości",
    many: "Zdejmij etykiety ({labels}): {count} wiadomości",
    other: "Zdejmij etykiety ({labels}): {count} wiadomości",
  },
  "labels.change.title": {
    one: "Zmień etykiety: {count} wiadomość",
    few: "Zmień etykiety: {count} wiadomości",
    many: "Zmień etykiety: {count} wiadomości",
    other: "Zmień etykiety: {count} wiadomości",
  },
  "labels.happens":
    "Etykiety są dodawane lub zdejmowane. Żadna wiadomość nie jest przenoszona ani usuwana.",
  "messages.unreadable": {
    one: "Nie udało się teraz odczytać Twojej skrzynki, więc nie widać, od kogo są i czego dotyczą. Wskazane: {count}.",
    few: "Nie udało się teraz odczytać Twojej skrzynki, więc nie widać, od kogo są i czego dotyczą. Wskazane: {count}.",
    many: "Nie udało się teraz odczytać Twojej skrzynki, więc nie widać, od kogo są i czego dotyczą. Wskazane: {count}.",
    other:
      "Nie udało się teraz odczytać Twojej skrzynki, więc nie widać, od kogo są i czego dotyczą. Wskazane: {count}.",
  },
  "notFound.text": {
    one: "Spośród {total} wskazanych wiadomości w Twojej skrzynce nie ma: {count}. Dlatego ta prośba zostanie odrzucona w tej postaci.",
    few: "Spośród {total} wskazanych wiadomości w Twojej skrzynce nie ma: {count}. Dlatego ta prośba zostanie odrzucona w tej postaci.",
    many: "Spośród {total} wskazanych wiadomości w Twojej skrzynce nie ma: {count}. Dlatego ta prośba zostanie odrzucona w tej postaci.",
    other:
      "Spośród {total} wskazanych wiadomości w Twojej skrzynce nie ma: {count}. Dlatego ta prośba zostanie odrzucona w tej postaci.",
  },
  "reason.credentials":
    "Zmianę hasła, kodu, weryfikacji dwuetapowej, kodu odzyskiwania lub innych danych logowania zawsze robisz Ty.",
  "reason.securitySettings":
    "Zmianę ustawień bezpieczeństwa, udostępniania lub dostępu do konta zawsze robisz Ty.",
  "reason.payments":
    "Płacenie, kupowanie i przenoszenie pieniędzy zawsze robisz Ty.",
  "reason.reviewer.credentials":
    "Automatyczna kontrola uznała, że to zmienia hasło, kod, weryfikację dwuetapową lub inne dane logowania. To zawsze robisz Ty.",
  "reason.reviewer.securitySettings":
    "Automatyczna kontrola uznała, że to zmienia ustawienia bezpieczeństwa, udostępniania lub dostępu. To zawsze robisz Ty.",
  "reason.reviewer.payments":
    "Automatyczna kontrola uznała, że to płaci, kupuje lub przenosi pieniądze. To zawsze robisz Ty.",
  "reason.fullAccess": "Full access jest włączony dla tego członka.",
  "reason.fullAccessNoPayments":
    "Full access bez płatności jest włączony dla tego członka.",
  "reason.ruleHandsOff": "Reguła przekazuje Tobie ten rodzaj działania.",
  "reason.ruleAsks": "Reguła pyta przed tym rodzajem działania.",
  "reason.ruleAllows": "Reguła zezwala na ten rodzaj działania.",
  "reason.preApprovedMet": "Poprosiłeś o dokładnie to działanie w tej prośbie.",
  "reason.preApprovedNotMet":
    "Reguła zezwala na to tylko wtedy, gdy o to poprosisz, a tym razem prośba tego nie zawierała.",
  "reason.askBeforeChanges":
    "Poprosiłeś o sprawdzanie zmian, zanim się wydarzą.",
  "reason.noRule": "Żadna reguła ani preferencja nie wymaga tu pytania.",
  "reason.mailboxNotAsked":
    "Nie poprosiłeś o tę zmianę w skrzynce w swojej własnej wiadomości, więc najpierw pyta Ciebie.",
  "reason.unattended":
    "To pochodzi z rutyny lub wyzwalacza działającego samodzielnie, a nie z Twojej wiadomości, więc zawsze najpierw pyta Ciebie.",
  "reason.tooLongToReview":
    "To polecenie lub skrypt jest zbyt długie, by automatyczny recenzent mógł przeczytać je w całości, więc decydujesz Ty.",
  "reason.automation":
    "Rutyny i wyzwalacze działają później bez Ciebie, więc ich tworzenie, zmiana lub usunięcie zawsze najpierw pyta Ciebie.",
  "reason.setting":
    "Gdy Bot zmienia jedno z Twoich ustawień z czatu, zawsze najpierw pyta Ciebie, niezależnie od tego, czy Full access jest włączony.",
  "reason.remoteWrite":
    "Ta wiadomość została wysłana z przeglądarki, która nie jest sparowana z komputerem, na którym działa FreeDuet, więc zawsze najpierw pyta Ciebie, cokolwiek mówi Full access lub Twoje zapisane reguły. Przeglądarka sparowana na komputerze działa jak dawniej.",
  "reason.newEmail":
    "O nowy e-mail pytamy za każdym razem. Sprawdź, do kogo idzie i co zawiera, potem zezwól na ten albo odrzuć.",
  "reason.reviewerNone":
    "Nie skonfigurowano modelu kontroli, więc potrzebna jest Twoja zgoda.",
  "reason.reviewerInvalid": "Odpowiedź kontroli nie była prawidłową decyzją.",
  "reason.reviewerUnreachable":
    "Nie udało się połączyć z kontrolą ({error}), więc potrzebna jest Twoja zgoda.",
  "remote.answerSentence":
    "Przeglądarka niesparowana z komputerem, na którym działa FreeDuet, może jednorazowo zezwolić na zwykłą prośbę albo ją odrzucić. Tę rozstrzyga się na komputerze, gdzie możesz ją przeczytać w całości. Wciąż tam czeka.",
};
