import type { Catalog } from "../translate";
import type { EN } from "./en";

/*
 * Polish, the app's own words (D181, stage 2). The reader is addressed as "ty", as on the Polish site.
 * A Bot is "asystent" (plural "asystenci"), the word the Polish site uses for each member. The other
 * terms are the site's too: "zespół", "silniki", "rutyny", "przekazanie", "zatwierdzenie", "poczta".
 * Not yet checked by a person who reads Polish; approval labels need the native review D50 asks for.
 */
export const pl: Catalog<typeof EN> = {
  "sign.title": "Zaloguj się do {product}",
  "sign.continueWith": "Kontynuuj z {provider}",
  "sign.opening": "Otwieranie {provider}…",
  "sign.openError":
    "Nie udało się otworzyć logowania przez {provider}. Spróbuj ponownie.",
  "sign.ssoRequired": "Twoja organizacja wymaga logowania na konto firmowe.",
  "sign.pairLead":
    "Ta przeglądarka nie jest jeszcze sparowana z {product}. Na komputerze, na którym działa aplikacja, uruchom",
  "sign.pairTail": ": {product} otworzy się tutaj, gotowy do użycia.",
  "sign.notSetUp":
    "Logowanie nie jest jeszcze skonfigurowane. Najpierw musi je ustawić administrator.",
  "sign.or": "lub",
  "sign.emailPlaceholder": "ty@firma.com",
  "sign.openingCompany": "Otwieranie…",
  "sign.continueCompany": "Kontynuuj z kontem firmowym",
  "sign.adminSignIn": "Logowanie administratora",
  "sign.noCompany":
    "Dla tego adresu nie jest skonfigurowane logowanie firmowe.",
  "shell.menu": "Menu",
  "shell.everything": "Wszystko",
  "shell.everythingLine": "Cały kontekst czatów we wszystkich kanałach",
  "shell.channelsError":
    "Nie udało się wczytać Twoich kanałów. Odśwież stronę.",
  "shell.channels": "Kanały",
  "shell.newChannel": "Nowy kanał",
  "shell.archived": "Zarchiwizowane",
  "shell.archivedChannels": "Zarchiwizowane kanały",
  "shell.unarchive": "Przywróć",
  "shell.unarchiveNamed": "Przywróć kanał „{name}”",
  "shell.earlier": "Wcześniejsze rozmowy",
  "shell.manage": "Zarządzaj",
  "shell.signOut": "Wyloguj się",
  "nav.bots": "Asystenci",
  "nav.connections": "Połączenia",
  "nav.capabilities": "Możliwości",
  "nav.routines": "Rutyny",
  "nav.approvalRules": "Reguły zatwierdzania",
  "nav.admin": "Administracja",
  "nav.dashboard": "Pulpit",
  "nav.settings": "Ustawienia",
  "tab.main": "Główne",
  "tab.chat": "Czat",
  "tab.tasks": "Zadania",
  "tab.make": "Utwórz",
  "tab.waiting": "{tab}, oczekujących: {badge}",
  "header.chat": "Czat {product}",
  "header.settings": "Twoje ustawienia",
  "header.back": "Wstecz",
  "header.more": "Więcej",
  "composer.ask": "Zapytaj o cokolwiek",
  "composer.message": "Wiadomość",
  "composer.queue": "Dodaj wiadomość do kolejki",
  "composer.send": "Wyślij wiadomość",
  "composer.stop": "Zatrzymaj asystenta",
  "composer.showCall": "Pokaż połączenie głosowe",
  "composer.startCall": "Rozpocznij połączenie głosowe",
  "composer.callBot": "Zadzwoń do tego asystenta",
  "composer.callUnsupported":
    "Połączenia głosowe wymagają mikrofonu i bezpiecznego połączenia (HTTPS)",
  "composer.speak": "Podyktuj wiadomość",
  "composer.dictateTitle": "Powiedz wszystko, co masz do zrobienia",
  "composer.attach": "Dołącz plik",
  "composer.moreUnavailable": "Dodatkowe opcje wiadomości są niedostępne",
  "composer.messageNamed": "{name} – napisz wiadomość",
  "chat.botsError": "Nie udało się wczytać Twoich asystentów. Odśwież stronę.",
  "chat.noBots": "Nie ma jeszcze żadnych asystentów.",
  "chat.conversationError": "Nie udało się wczytać rozmowy. Odśwież stronę.",
  "chat.stillStarting":
    "Rozmowa jeszcze się uruchamia. Spróbuj ponownie za chwilę.",
  "chat.startError": "Nie udało się rozpocząć rozmowy. Spróbuj ponownie.",
  "attention.questions": {
    one: "{count} pytanie",
    few: "{count} pytania",
    many: "{count} pytań",
    other: "{count} pytań",
  },
  "attention.approvals": {
    one: "{count} zatwierdzenie",
    few: "{count} zatwierdzenia",
    many: "{count} zatwierdzeń",
    other: "{count} zatwierdzeń",
  },
  "attention.handoffs": {
    one: "{count} przekazanie utknęło",
    few: "{count} przekazania utknęły",
    many: "{count} przekazań utknęło",
    other: "{count} przekazań utknęło",
  },
  "attention.unread": {
    one: "{count} nieprzeczytana rozmowa",
    few: "{count} nieprzeczytane rozmowy",
    many: "{count} nieprzeczytanych rozmów",
    other: "{count} nieprzeczytanych rozmów",
  },
  "attention.needYou": {
    one: "{count} sprawa czeka na Ciebie",
    few: "{count} sprawy czekają na Ciebie",
    many: "{count} spraw czeka na Ciebie",
    other: "{count} spraw czeka na Ciebie",
  },
  "attention.open": "{summary}. Otwórz asystentów, żeby się nimi zająć.",
  "attention.unreadMessages": "Nieprzeczytane wiadomości",
  "bots.new": "Nowy asystent",
  "bots.purpose":
    "Twoi asystenci i ci, których udostępniono Tobie. Zobacz, co każdy z nich robi i czego od Ciebie potrzebuje.",
  "bots.loadError": "Nie udało się wczytać Twoich asystentów. Odśwież stronę.",
  "bots.needsYou": "Potrzebują Ciebie",
  "bots.pinned": "Przypięte",
  "bots.yours": "Twoi",
  "bots.shared": "Udostępnieni Ci",
  "bots.allPinned": "Wszyscy Twoi asystenci są przypięci wyżej.",
  "bots.allNeedYou": "Wszyscy Twoi asystenci są w sekcji „Potrzebują Ciebie”.",
  "bots.none":
    "Nie masz jeszcze żadnych asystentów. Utwórz pierwszego przyciskiem „Nowy asystent”.",
  "bots.nobodyShared": "Nikt jeszcze nie udostępnił Ci asystenta.",
  "bots.hide": "Ukryj",
  "bots.show": "Pokaż",
  "bots.hidden": "Ukryte",
  "bots.hiddenDescription": {
    one: "{count} asystent ukryty przez Ciebie. Zmienia się tylko Twoja lista.",
    few: "{count} asystenci ukryci przez Ciebie. Zmienia się tylko Twoja lista.",
    many: "{count} asystentów ukrytych przez Ciebie. Zmienia się tylko Twoja lista.",
    other:
      "{count} asystentów ukrytych przez Ciebie. Zmienia się tylko Twoja lista.",
  },
  "bots.paused": "Wstrzymani",
  "bots.message": "Napisz",
  "bots.wroteIn": {
    one: "{name}: nowe wiadomości w {count} rozmowie, której nie przeczytano.",
    few: "{name}: nowe wiadomości w {count} rozmowach, których nie przeczytano.",
    many: "{name}: nowe wiadomości w {count} rozmowach, których nie przeczytano.",
    other:
      "{name}: nowe wiadomości w {count} rozmowach, których nie przeczytano.",
  },
  "bots.readNewest": "Przeczytaj najnowszą",
  "bots.resuming": "Wznawianie…",
  "bots.pausedResume": "Wstrzymany. Wznów",
  "botPage.purpose": "Co ten asystent robi dla Ciebie i jak jest ustawiony.",
  "botPage.fallbackTitle": "Asystent",
  "botPage.openError":
    "Nie udało się otworzyć tego asystenta. Być może nie jest Ci udostępniony.",
  "profile.forYou": "Dla Ciebie",
  "profile.settingsError":
    "Nie udało się wczytać ustawień tego asystenta. Odśwież stronę.",
  "profile.active": "Aktywny",
  "profile.pausedDescription":
    "Wstrzymany. Nic nie działa dla Ciebie, dopóki go nie włączysz.",
  "profile.activeDescription":
    "Prowadzi dla Ciebie rutyny, obowiązki, przekazania i ponaglenia.",
  "profile.notifications": "Powiadomienia",
  "profile.notifyDescription":
    "{level}. Liczniki w pasku bocznym są zawsze widoczne.",
  "profile.notify.all": "Wszystko",
  "profile.notify.needsInput": "Tylko gdy potrzebuje Ciebie",
  "profile.notify.none": "Nic (tylko liczniki)",
  "profile.browserNotifications": "Powiadomienia przeglądarki",
  "profile.browserOff":
    "Wyłączone w tej przeglądarce. Włącz je, aby wiedzieć, kiedy asystent potrzebuje Ciebie.",
  "profile.turnOn": "Włącz",
  "profile.startConversation": "Rozpocznij rozmowę.",
  "stalled.what": "{name}: nie dokończono zadania „{task}”.",
  "stalled.why": "Powód: {reason}.",
  "stalled.retryError":
    "Nie udało się spróbować ponownie. Być może już działa.",
  "stalled.dismissError": "Nie udało się tego odrzucić. Być może już działa.",
  "stalled.dismissing": "Odrzucanie…",
  "stalled.dismissed": "Odrzucone",
  "stalled.dismiss": "Odrzuć",
  "stalled.retrying": "Ponawianie…",
  "stalled.queued": "Ponownie w kolejce",
  "stalled.retry": "Spróbuj ponownie",
  "stalled.open": "Otwórz rozmowę",
  "dash.title": "Pulpit",
  "dash.notAvailable": "Jeszcze niedostępne",
  "dash.tokensNotCounted": "Dziś nie policzono jeszcze żadnej wymiany.",
  "dash.countsUnavailable": "Liczniki tokenów są teraz niedostępne.",
  "dash.enginesLink": "Zarządzaj silnikami",
  "dash.teamLink": "Wszyscy członkowie",
  "dash.waitingForYou": "Czeka na Ciebie",
  "dash.available": "Dostępny",
  "dash.loading": "Wczytywanie zespołu…",
  "dash.nothingWaits": "Nic nie czeka na Ciebie.",
  "dash.thingsWait": {
    one: "{count} sprawa czeka na Ciebie.",
    few: "{count} sprawy czekają na Ciebie.",
    many: "{count} spraw czeka na Ciebie.",
    other: "{count} spraw czeka na Ciebie.",
  },
  "dash.partialCount": "{reported} z {turns} prób podało liczbę tokenów",
  "dash.inputPlusOutput": "Wejście plus wyjście, tak jak podał każdy silnik",
  "dash.nothingSaved": "Dziś nic jeszcze nie przeszło przez darmowy silnik",
  "dash.firstFor": {
    one: "pierwszy dla {count} członka",
    few: "pierwszy dla {count} członków",
    many: "pierwszy dla {count} członków",
    other: "pierwszy dla {count} członków",
  },
  "dash.members": {
    one: "{count} członek",
    few: "{count} członkowie",
    many: "{count} członków",
    other: "{count} członków",
  },
  "dash.indicators": "Wskaźniki",
  "dash.tokensToday": "Tokeny dzisiaj",
  "dash.savedToday": "Zaoszczędzone dziś dzięki darmowym silnikom",
  "dash.waitingSub": "Pytania, zatwierdzenia i utknięte przekazania",
  "dash.nextRoutine": "Następna rutyna",
  "dash.noRoutine": "Żadna rutyna nie jest zaplanowana.",
  "dash.team": "Zespół",
  "dash.engines": "Silniki",
  "dash.noEngine": "Żaden silnik nie jest jeszcze skonfigurowany.",
  "dash.perMemberAria": "Tokeny na członka",
  "dash.perMember": "Tokeny na członka, dziś",
  "dash.foot":
    "Liczby to dane podane przez każdy silnik, w dniach UTC. Dziennik ostatniej aktywności i wskaźnik limitu planu nie są jeszcze dostępne.",
  "voice.heardNothing":
    "Nic nie słychać. Dotknij mikrofonu, aby spróbować ponownie, albo napisz.",
  "voice.tapWhenDone": "Dotknij mikrofonu, gdy skończysz",
  "voice.discard": "Odrzuć",
  "voice.start": "Rozpocznij dyktowanie",
  "voice.stopAndSend": "Zakończ dyktowanie i wyślij",
  "voice.typeInstead": "Napisz zamiast tego",
  "voice.retry": "Ponów",
  "voice.recordAgain": "Nagraj ponownie",
  "voice.writing": "Zapisuję to, co powiedziano…",
  "voice.listeningStop": "Słucham… Zatrzymam się, gdy zrobisz przerwę",
  "voice.listening": "Słucham, zacznij mówić",
  "voice.permission": "Czekam na zgodę na mikrofon…",
  "home.bots": "Poznaj swój zespół i zarządzaj każdym asystentem.",
  "home.capabilities": "Umiejętności i pamięć.",
  "home.connectionsLabel": "Konta, aplikacje i reguły poczty",
  "home.connections": "Połącz konto, aplikację albo pocztę.",
  "home.setupLabel": "Lista konfiguracji",
  "home.setup": "Zobacz, co jest skonfigurowane, a co zostało.",
  "home.approvalsLabel": "Reguły zatwierdzania i Full access",
  "home.approvals": "Co asystent może zrobić bez Twojej zgody.",
  "home.passwordsLabel": "Hasła",
  "home.passwords": "Hasła, z których może korzystać Twój zespół.",
  "home.routines": "Prace, które powtarzają się same, i widok tygodnia.",
  "home.notifications": "Gdzie docierają do Ciebie aktualizacje.",
  "home.admin":
    "Komputery, dane logowania, granice dostępu, osoby i rejestr zdarzeń.",
  "home.engines":
    "Kto odpowiada za każdego asystenta, w jakiej kolejności i ile dziś zużył. Twój abonament zostaje pierwszy, dopóki nie zmienisz kolejności.",
  "home.safety": "Bezpieczeństwo",
  "home.jobs": "Zadania",
  "home.system": "System",
  "settings.description":
    "Zarządzaj zespołem, połączonymi kontami i własnymi preferencjami.",
  "settings.sections": "Sekcje ustawień",
  "settings.workspace": "Przestrzeń robocza",
  "settings.preferences": "Preferencje",
  "settings.devices": "Urządzenia i informacje",
  "settings.appearance": "Wygląd",
  "settings.matchPhone": "Jak w telefonie",
  "settings.light": "Jasny",
  "settings.dark": "Ciemny",
  "settings.voice": "Głos",
  "settings.shortcuts": "Skróty klawiaturowe",
  "language.section": "Język",
  "language.title": "Język aplikacji",
  "language.description":
    "Język menu i przycisków. Twój zespół pisze do Ciebie w języku ustawionym w czacie.",
  "language.auto": "Automatyczny (przeglądarka)",
  "settings.descriptionPlain": "Jak {product} wygląda i działa dla Ciebie.",
  "wide.yourTeam": "Twój zespół",
  "wide.team": "Zespół",
  "wide.stateWaiting": "Czeka na Ciebie",
  "wide.stateWorking": "Pracuje nad tym",
  "wide.memberLabel": "{name}, {line}",
  "chat.loadingConversation": "Wczytywanie tej rozmowy",
  "chat.readAloud": "Przeczytaj na głos",
  "chat.stopReading": "Zatrzymaj czytanie",
  "chat.thinking": "Myślę…",
  "chat.queued": "W kolejce",
  "chat.removeQueued": "Usuń wiadomość z kolejki: {what}",
  "chat.remove": "Usuń",
  "chat.routineRan": "Rutyna została uruchomiona.",
  "chat.firstDayYes": "Brzmi dobrze",
  "chat.firstDayNo": "Coś jest nie tak",
  "chat.tryingAgain": "Próbuję ponownie.",
  "chat.responsibilityRan": "Obowiązek został uruchomiony.",
  "chat.trigger": "Wyzwalacz:",
  "chat.details": "Szczegóły",
  "chat.via": "przez {source}",
  "chat.untitledFile": "Plik bez nazwy",
  "chat.attachment": "Załącznik",
  "chat.attachmentLower": "załącznik",
  "chat.attachmentNamed": "Załącznik: {name}",
  "chat.unavailableNamed": "Plik {name} jest niedostępny.",
  "chat.unavailable": "Ten załącznik jest niedostępny.",
  "chat.openNamed": "Otwórz {name}",
  "chat.close": "Zamknij",
  "chat.generatedInterface": "Wygenerowany interfejs tego asystenta",
  "chat.usedBrowser": "Użyto przeglądarki",
  "chat.hostAndMore": "{host} i {amount} więcej",
  "chat.searchedWeb": "przeszukano internet",
  "chat.readPages": {
    one: "przeczytano {amount} stronę",
    few: "przeczytano {amount} strony",
    many: "przeczytano {amount} stron",
    other: "przeczytano {amount} strony",
  },
  "chat.browsedPages": {
    one: "przejrzano {amount} stronę",
    few: "przejrzano {amount} strony",
    many: "przejrzano {amount} stron",
    other: "przejrzano {amount} strony",
  },
  "chat.usedBrowserPhrase": "użyto przeglądarki",
  "chat.usedNamed": "użyto {name}",
  "chat.usedConnectors": {
    one: "użyto {amount} łącznik",
    few: "użyto {amount} łączniki",
    many: "użyto {amount} łączników",
    other: "użyto {amount} łącznika",
  },
  "chat.usedTools": {
    one: "użyto {amount} narzędzie",
    few: "użyto {amount} narzędzia",
    many: "użyto {amount} narzędzi",
    other: "użyto {amount} narzędzia",
  },
  "chat.andJoin": "{head} i {last}",
  "chat.inProgress": "W toku",
  "chat.waitingForYou": "Czeka na Ciebie",
  "chat.notCompleted": "Nie ukończono",
  "chat.blocked": "Zablokowane",
  "chat.didntWork": "Nie zadziałało",
  "chat.couldntFinishStep": "Nie udało się dokończyć tego kroku.",
  "chat.issues": {
    one: "{amount} problem",
    few: "{amount} problemy",
    many: "{amount} problemów",
    other: "{amount} problemu",
  },
  "settings.addRepository": "Dodaj repozytorium",
  "settings.approvals": "Zatwierdzenia",
  "settings.appsSharedBots":
    "Aplikacje, z których mogą korzystać udostępnieni Ci asystenci",
  "settings.backToApp": "Wróć do aplikacji",
  "settings.cancel": "Anuluj",
  "settings.cannotMakeCode":
    "Kod tworzy się w przeglądarce sparowanej z komputerem. Ta przeglądarka nie może go utworzyć.",
  "settings.cantLink":
    "Nie możesz jeszcze połączyć konta {provider}. Najpierw musi to ustawić administrator.",
  "settings.changesDescription":
    "Ustawienia, które asystent zmienił w czacie. Cofnięcie przywraca poprzednią wartość przez siedem dni i tylko wtedy, gdy ustawienie ma nadal wartość, którą ustawiła ta zmiana.",
  "settings.changesEmpty": "Nie zmieniono jeszcze niczego w czacie.",
  "settings.changesLoading": "Wczytywanie zmian…",
  "settings.changesTitle": "Zmiany wprowadzone w czacie",
  "settings.charactersOf": "{used} z {limit} znaków",
  "settings.checkLinkError":
    "Nie udało się sprawdzić, czy możesz połączyć to konto: {error}",
  "settings.code": "Kod",
  "settings.codeExpires": "Kod działa jeden raz i wygasa za 10 minut.",
  "settings.codeRanOut": "Ten kod wygasł. Utwórz nowy.",
  "settings.componentsGallery": "Galeria komponentów",
  "settings.computer": "Komputer",
  "settings.connect": "Połącz",
  "settings.connectEvents": "Połącz zdarzenia",
  "settings.connectNamed": "Połącz {name}",
  "settings.copied": "Skopiowano",
  "settings.copy": "Kopiuj",
  "settings.copyFailed":
    "Nie udało się skopiować. Zaznacz kod i skopiuj go ręcznie.",
  "settings.deliveriesEmpty": "Nie ma jeszcze żadnych dostaw.",
  "settings.deliveriesTitle": "Ostatnie dostawy",
  "settings.deploymentOwn": "ustawienie wdrożenia",
  "settings.devicesDescription":
    "Zaloguj się w aplikacji {product} na telefonie i włącz powiadomienia, aby dodać je tutaj.",
  "settings.devicesEmpty": "Nie ma jeszcze żadnych urządzeń.",
  "settings.devicesTitle": "Twoje urządzenia",
  "settings.disconnect": "Rozłącz",
  "settings.disconnectError": "Nie udało się rozłączyć {name}: {error}",
  "settings.disconnectNamed": "Rozłącz {name}",
  "settings.done": "Gotowe",
  "settings.emphasisBot": "Nazwa asystenta",
  "settings.emphasisConversation": "Tytuł rozmowy",
  "settings.emphasisDescription":
    "Wybierz, która linia ma się wyróżniać na pasku bocznym.",
  "settings.emphasisPreview": "Podgląd listy wiadomości",
  "settings.emphasisTitle": "Wyróżnienie na liście wiadomości",
  "settings.general": "Ogólne",
  "settings.githubConnectError": "Nie udało się połączyć z GitHubem: {error}",
  "settings.githubLinkFailed":
    "Nie udało się połączyć Twojego konta GitHub. Spróbuj ponownie.",
  "settings.githubLinked": "Twoje konto GitHub jest połączone.",
  "settings.githubTaken":
    "To konto GitHub jest połączone z kimś innym w {product}. Zaloguj się w GitHubie na inne konto i spróbuj ponownie albo poproś administratora.",
  "settings.kindDecision": "Decyzje",
  "settings.kindDecisionDescription":
    "Zatwierdzenia, których asystent potrzebuje, zanim podejmie działanie.",
  "settings.kindProgress": "Postęp",
  "settings.kindProgressDescription":
    "Odpowiedzi i wyniki z pracy, której nie śledzisz.",
  "settings.kindQuestion": "Pytania",
  "settings.kindQuestionDescription":
    "Pytania, które asystent Ci zadał i na które czeka.",
  "settings.languageChanged":
    "Twój język dla zespołu zmienił się: {from} → {to}",
  "settings.lastSeen": "ostatnio widziano {when}",
  "settings.levelAll": "wszystko",
  "settings.levelNeedsInput": "tylko gdy potrzebuje Ciebie",
  "settings.linkBroughtCode":
    "Link zawiera kod. Nazwij tę przeglądarkę i kliknij „Sparuj”.",
  "settings.linkSlack": "Połącz konto Slack",
  "settings.linked": "Połączone",
  "settings.loadAccountError": "Nie udało się wczytać Twojego konta: {error}",
  "settings.loading": "Wczytywanie…",
  "settings.localAddress":
    "Ten adres działa tylko na tym komputerze. Telefon potrzebuje adresu, pod którym FreeDuet jest dostępny z zewnątrz; otwórz go w telefonie i wpisz kod w Ustawieniach.",
  "settings.madeWhen": "utworzono {when}",
  "settings.makeCode": "Utwórz kod",
  "settings.memberAdded": "{member} jest już w Twoim zespole.",
  "settings.name": "Nazwa",
  "settings.nameChanged":
    "{bot}: Twoja nazwa dla niego zmieniła się: {from} → {to}",
  "settings.nameOwn": "własna nazwa",
  "settings.needsReconnect": "Wymaga ponownego połączenia",
  "settings.needsReconnectHandle": "Wymaga ponownego połączenia · @{handle}",
  "settings.noItalianVoice":
    "Na tym komputerze nie ma lokalnego włoskiego głosu, więc odpowiedzi nie mogą być tu czytane na głos.",
  "settings.notLinked": "Nie połączono",
  "settings.notSetUp": "Nie skonfigurowano",
  "settings.notifyChanged": "{bot}: powiadomienia zmieniły się: {from} → {to}",
  "settings.pairThisDescription":
    "Na komputerze, na którym działa FreeDuet, otwórz Ustawienia i naciśnij „Utwórz kod” w sekcji „Sparuj telefon lub inną przeglądarkę”. Potem otwórz pokazany link albo wpisz tutaj kod.",
  "settings.pairThisTitle": "Sparuj tę przeglądarkę",
  "settings.pairedDescription":
    "Sparowany telefon lub inna przeglądarka działa jak ta. Po odwołaniu urządzenie zostaje odcięte przy następnym żądaniu i wylogowane.",
  "settings.pairedDone": "Ta przeglądarka jest sparowana z komputerem.",
  "settings.pairedTitle": "Sparuj telefon lub inną przeglądarkę",
  "settings.phone": "Telefon",
  "settings.phoneOrBrowser": "Telefon lub inna przeglądarka",
  "settings.qrLabel": "Kod QR z linkiem do sparowania",
  "settings.readAloudDescription":
    "Dodaje przycisk „Przeczytaj na głos” pod każdą odpowiedzią asystenta. Używa głosu tylko na tym komputerze i nic nigdzie nie jest wysyłane.",
  "settings.readAloudTitle": "Czytaj odpowiedzi na głos",
  "settings.rename": "Zmień nazwę",
  "settings.repositories": "Repozytoria",
  "settings.repositoriesDescription":
    "Dodaj tu repozytorium, a potem dodaj w GitHubie webhook z poniższym adresem i tym samym sekretem. Jego zdarzenia, na przykład issues.opened, mogą wtedy uruchomić obowiązek.",
  "settings.repositoriesEmpty":
    "Nie ma jeszcze repozytoriów. Dodaj pierwsze przyciskiem „Dodaj repozytorium”.",
  "settings.repository": "Repozytorium",
  "settings.reset": "Resetuj",
  "settings.resetDescription":
    "Zapomnij wszystkie odpowiedzi, żeby każdy udostępniony asystent pytał ponownie.",
  "settings.resetDone":
    "Zresetowano. Każdy udostępniony asystent zapyta ponownie.",
  "settings.revoke": "Odwołaj",
  "settings.routingDescription":
    "Dokąd trafia każdy rodzaj aktualizacji, gdy Cię nie ma. {product} w przeglądarce zawsze pokazuje wszystko.",
  "settings.routingError":
    "Nie udało się wczytać tego, dokąd trafiają Twoje aktualizacje. Odśwież stronę.",
  "settings.routingTitle": "Dokąd trafiają aktualizacje",
  "settings.runsOut":
    "W telefonie zalogowanym na Twoje konto zeskanuj to albo otwórz link, albo wejdź w Ustawienia i wpisz kod. Działa jeden raz i wygasa za {time}.",
  "settings.sameSecret":
    "Użyj tego samego sekretu, gdy dodajesz webhook w GitHubie.",
  "settings.sampleBot": "Asystent ogólny",
  "settings.sampleTitle": "Zaplanuj przyszły tydzień",
  "settings.save": "Zapisz",
  "settings.saved": "Zapisano",
  "settings.saving": "Zapisywanie…",
  "settings.setup": "Konfiguracja",
  "settings.sharedBots": "Udostępnieni asystenci",
  "settings.sharedBotsDescription":
    "Udostępniony Ci asystent korzysta z aplikacji swojego właściciela. Z Twoich aplikacji korzysta tylko tam, gdzie w rozmowie wyrażono zgodę.",
  "settings.slackCodeError": "Nie udało się utworzyć kodu Slack: {error}",
  "settings.standingDescription":
    "Dotyczy każdego asystenta w każdej rozmowie. Rola asystenta mówi, co robi, a to, jak ma to robić, na przykład Twój styl pisania.",
  "settings.standingTitle": "Stałe instrukcje",
  "settings.switchLabel": "{kind} przez {transport}",
  "settings.thisBrowserTag": "(ta przeglądarka)",
  "settings.toneChanged": "{bot}: ton zmienił się: {from} → {to}",
  "settings.undo": "Cofnij",
  "settings.undoFailed": "Nie udało się cofnąć zmiany. Spróbuj ponownie.",
  "settings.undoGone": "Cofnięcie nie jest już możliwe",
  "settings.undoing": "Cofanie…",
  "settings.undone": "Cofnięto",
  "settings.webhookSecret": "Sekret webhooka",
  "settings.yourAccount": "Twoje konto",
  "bot.activity.kindRoutine": "Rutyna",
  "bot.activity.kindResponsibility": "Obowiązek",
  "bot.activity.kindHandoff": "Przekazane zadanie",
  "bot.activity.kindApproval": "Zatwierdzenie",
  "bot.activity.kindQuestion": "Pytanie",
  "bot.activity.kindFollowUp": "Kontynuacja",
  "bot.activity.needsYou": "potrzebuje Ciebie",
  "bot.activity.stop": "Zatrzymaj",
  "bot.activity.stopping": "Zatrzymywanie…",
  "bot.activity.cancelling": "Anulowanie…",
  "bot.activity.open": "Otwórz",
  "bot.activity.title": "Aktywność",
  "bot.activity.scheduled": "Zaplanowane",
  "bot.activity.completed": "Ukończone",
  "bot.activity.emptyInProgress": "Nic nie działa i nic nie czeka na Ciebie.",
  "bot.activity.emptyScheduled": "Nic nie jest zaplanowane.",
  "bot.activity.emptyCompleted": "Nic jeszcze się nie zakończyło.",
  "bot.activity.loadError":
    "Nie udało się wczytać aktywności tego asystenta. Odśwież stronę.",
  "bot.settings.heading": "Ustawienia tego asystenta",
  "bot.area.responsibilities": "Obowiązki",
  "bot.area.reaching": "Kontakt z Tobą",
  "bot.area.memory": "Pamięć",
  "bot.area.access": "Umiejętności i dostęp",
  "bot.area.sharing": "Udostępnianie",
  "bot.settings.activeCount": {
    one: "{count} aktywny",
    few: "{count} aktywne",
    many: "{count} aktywnych",
    other: "{count} aktywnego",
  },
  "bot.settings.noneActive": "Brak aktywnych",
  "bot.settings.ruleCount": {
    one: "{count} reguła",
    few: "{count} reguły",
    many: "{count} reguł",
    other: "{count} reguły",
  },
  "bot.settings.noRules": "Brak reguł",
  "bot.settings.routineCount": {
    one: "{count} rutyna",
    few: "{count} rutyny",
    many: "{count} rutyn",
    other: "{count} rutyny",
  },
  "bot.settings.noRoutines": "Brak rutyn",
  "bot.access.skillsDescription":
    "Włącz umiejętność, żeby używać jej z tym asystentem. Wpisz / w rozmowie, aby ją uruchomić.",
  "bot.access.yourSkills": "Twoje umiejętności",
  "bot.access.skillsError":
    "Nie udało się wczytać Twoich umiejętności. Odśwież stronę.",
  "bot.access.noSkills": "Nie ma jeszcze żadnych umiejętności.",
  "bot.access.writeOne": "Napisz jedną",
  "bot.access.title": "Z czego może korzystać",
  "bot.access.grantedDescription":
    "Aplikacje i umiejętności, z których ten asystent może korzystać, oraz to, czy każda aplikacja jest dla Ciebie gotowa. Nie może używać niczego innego.",
  "bot.access.grantedError":
    "Nie udało się wczytać tego, z czego ten asystent może korzystać. Odśwież stronę.",
  "bot.access.readyError":
    "Nie udało się sprawdzić, czy każda aplikacja jest dla Ciebie gotowa. Odśwież stronę.",
  "bot.access.noApps":
    "Nie ma jeszcze żadnych aplikacji. Dodać je musi administrator. Do tego czasu ten asystent może tylko rozmawiać z Tobą.",
  "bot.access.toolsAndMore": "{list} i {count} więcej",
  "bot.access.toolCount": {
    one: "{count} narzędzie",
    few: "{count} narzędzia",
    many: "{count} narzędzi",
    other: "{count} narzędzia",
  },
  "bot.access.skillLabel": "Umiejętność",
  "bot.access.manageNamed": "Zarządzaj: {title} w tym asystencie",
  "bot.reset.conversations": {
    one: "{count} rozmowa",
    few: "{count} rozmowy",
    many: "{count} rozmów",
    other: "{count} rozmowy",
  },
  "bot.reset.memorySources": {
    one: "{count} źródło pamięci",
    few: "{count} źródła pamięci",
    many: "{count} źródeł pamięci",
    other: "{count} źródła pamięci",
  },
  "bot.reset.memories": {
    one: "{count} zaimportowane wspomnienie",
    few: "{count} zaimportowane wspomnienia",
    many: "{count} zaimportowanych wspomnień",
    other: "{count} zaimportowanego wspomnienia",
  },
  "bot.reset.routines": {
    one: "{count} rutyna",
    few: "{count} rutyny",
    many: "{count} rutyn",
    other: "{count} rutyny",
  },
  "bot.reset.responsibilities": {
    one: "{count} obowiązek",
    few: "{count} obowiązki",
    many: "{count} obowiązków",
    other: "{count} obowiązku",
  },
  "bot.reset.followUps": {
    one: "{count} zaplanowana kontynuacja",
    few: "{count} zaplanowane kontynuacje",
    many: "{count} zaplanowanych kontynuacji",
    other: "{count} zaplanowanej kontynuacji",
  },
  "bot.reset.formedMemories": {
    one: "{count} wspomnienie, które utworzył",
    few: "{count} wspomnienia, które utworzył",
    many: "{count} wspomnień, które utworzył",
    other: "{count} wspomnienia, które utworzył",
  },
  "bot.reset.research": {
    one: "{count} badanie w tle",
    few: "{count} badania w tle",
    many: "{count} badań w tle",
    other: "{count} badania w tle",
  },
  "bot.reset.standing": {
    one: "{count} stałe zezwolenie",
    few: "{count} stałe zezwolenia",
    many: "{count} stałych zezwoleń",
    other: "{count} stałego zezwolenia",
  },
  "bot.reset.title": "Resetowanie: {name}",
  "bot.reset.description":
    "To usuwa wszystko, co {name} ma z Tobą. Rozmowy i dane innych osób zostają. Nie da się tego cofnąć.",
  "bot.reset.planError":
    "Nie udało się sprawdzić, co zostałoby usunięte. Spróbuj ponownie.",
  "bot.reset.done": "Gotowe. {name} zaczyna z Tobą od nowa.",
  "bot.reset.nothing": "Nie ma nic Twojego do usunięcia.",
  "bot.reset.willDelete": "Zostanie usunięte:",
  "bot.reset.sharedKept": {
    one: "{count} rozmowa jest udostępniona innym osobom lub asystentom i zostanie zachowana.",
    few: "{count} rozmowy są udostępnione innym osobom lub asystentom i zostaną zachowane.",
    many: "{count} rozmów jest udostępnionych innym osobom lub asystentom i zostanie zachowanych.",
    other:
      "{count} rozmowy są udostępnione innym osobom lub asystentom i zostaną zachowane.",
  },
  "bot.reset.memoriesKept":
    "Wspomnienia przekazane asystentowi osobiście zostają.",
  "bot.reset.resetting": "Resetowanie…",
  "bot.reset.submit": "Usuń i zresetuj",
  "bot.manage.pinnedAssigned":
    "Administrator przypisał Ci go. Zostaje na górze Twojej listy asystentów.",
  "bot.manage.pinnedOn":
    "Na górze Twojej listy asystentów. Zmienia się tylko Twoja lista.",
  "bot.manage.pinnedOff":
    "Przypnij na górze Twojej listy asystentów. Zmienia się tylko Twoja lista.",
  "bot.manage.hiddenAssigned":
    "Administrator przypisał Ci go. Nie możesz go ukryć.",
  "bot.manage.hiddenOn":
    "W sekcji „Ukryte” na Twojej liście asystentów. Zmienia się tylko Twoja lista.",
  "bot.manage.hiddenOff":
    "Ukryj go na Twojej liście asystentów. Zmienia się tylko Twoja lista.",
  "bot.manage.duplicate": "Duplikuj",
  "bot.manage.duplicateDescription":
    "Utwórz własną kopię. Jej rozmowy i klucze nie są kopiowane.",
  "bot.manage.resetDescription":
    "Usuń swoje rozmowy z tym asystentem, to, co pamięta o Tobie, i jego zaplanowaną pracę. Najpierw zobaczysz listę.",
  "bot.manage.delete": "Usuń",
  "bot.manage.deleteDescription":
    "Usuwa go dla wszystkich. Nie da się tego cofnąć.",
  "bot.manage.deleteTitle": "Usunięcie: {name}",
  "bot.manage.deleteConfirm":
    "Zostanie usunięty dla wszystkich. Nie da się tego cofnąć.",
  "bot.manage.deleting": "Usuwanie…",
  "bot.setup.title": "Tytuł",
  "bot.setup.whatItDoes": "Co robi",
  "bot.setup.identity": "Tożsamość",
  "bot.setup.systemOwned": "Należy do systemu",
  "bot.setup.systemOwnedDescription":
    "Jest częścią {product}. Nie należy do żadnej osoby.",
  "bot.setup.visibility": "Widoczność",
  "bot.setup.visiblePrivate":
    "Tylko Ty możesz go zobaczyć i rozpocząć z nim rozmowę.",
  "bot.setup.visiblePublic": "Każdy w {product} może go znaleźć i użyć.",
  "bot.setup.private": "Prywatny",
  "bot.setup.public": "Publiczny",
  "bot.setup.saveError": "Nie udało się zapisać. Spróbuj ponownie.",
  "bot.setup.checkField": "Sprawdź to pole i spróbuj ponownie.",
  "bot.setup.connection": "Połączenie",
  "bot.setup.builtIn": "Wbudowany",
  "bot.setup.agentUrl": "Adres URL agenta",
  "bot.setup.builtInDescription":
    "Działa wewnątrz {product}. Nie ma nic do połączenia.",
  "bot.sharing.published": "Opublikowany",
  "bot.sharing.toWholeTeam": "Dla całego zespołu",
  "bot.sharing.toPeople": "Dla: {who}",
  "bot.sharing.groupNamed": "grupa {name}",
  "bot.sharing.teamPrivate": "Rozmowy każdej osoby z nim są prywatne.",
  "bot.sharing.notVisibleYet":
    "Członkowie zespołu nie zobaczą go, dopóki nie będzie miał prawdziwej nazwy i opisu.",
  "bot.sharing.unpublish": "Cofnij publikację",
  "bot.sharing.link": "Link",
  "bot.sharing.linkDescription": "Otwiera prywatną rozmowę z nim.",
  "bot.sharing.copyLink": "Kopiuj link",
  "bot.sharing.publicNotPublished":
    "Nie opublikowano dla zespołu. Jest publiczny, więc każdy w {product} może już z niego korzystać.",
  "bot.sharing.onlyYouCanUse":
    "Nieopublikowany. Tylko Ty możesz z niego korzystać.",
  "bot.sharing.notPublished": "Nieopublikowany.",
  "bot.sharing.whoPublishedTo": "Dla kogo jest opublikowany",
  "bot.sharing.publish": "Opublikuj",
  "bot.sharing.publishNote":
    "Publikacja nie zmienia jego widoczności. Publikację można cofnąć w każdej chwili.",
  "bot.sharing.audience": "Odbiorcy",
  "bot.sharing.notPublishedSummary": "Nieopublikowany",
  "bot.sharing.theWholeTeam": "Cały zespół",
  "bot.sharing.specificPeople": "Konkretne osoby lub grupy",
  "bot.sharing.peopleCount": {
    one: "{count} osoba",
    few: "{count} osoby",
    many: "{count} osób",
    other: "{count} osoby",
  },
  "bot.sharing.groupCount": {
    one: "{count} grupa",
    few: "{count} grupy",
    many: "{count} grup",
    other: "{count} grupy",
  },
  "bot.sharing.assignToGroups": "Przypisz do grup",
  "bot.sharing.assignDescription":
    "Przypina tego asystenta na górze listy asystentów każdego członka grupy. Użyj * dla całego zespołu.",
  "bot.sharing.publishedTo": "Opublikowano dla",
  "bot.sharing.peopleByEmail": "Osoby, po adresie e-mail",
  "bot.sharing.commaSeparated": "Oddzielone przecinkami",
  "bot.sharing.groups": "Grupy",
  "bot.sharing.update": "Zaktualizuj",
  "bot.sharing.publishToTeam": "Opublikuj dla zespołu",
  "bot.sharing.assignNamed": "Przypisz do grupy: {name}",
  "bot.sharing.assignNote":
    "Jest przypięty na górze listy asystentów każdego członka zespołu.",
  "bot.sharing.groupOrStar": "Grupa lub *",
  "bot.sharing.wholeTeamPlaceholder": "* dla całego zespołu",
  "bot.sharing.assign": "Przypisz",
  "bot.sharing.removeNamed": "Usuń: {name}",
  "bot.sharing.wholeTeam": "Cały zespół",
  "bot.sharing.notAssigned": "Nie przypisano do żadnej grupy.",
  "bot.sharing.assignRow": "Przypisz do grupy",
  "bot.page.accessPurpose":
    "Umiejętności, aplikacje i inni asystenci, z których ten asystent może korzystać.",
  "bot.page.approvalsPurpose":
    "Co ten asystent może zrobić, nie pytając Cię najpierw.",
  "bot.page.memoryPurpose":
    "Aplikacje, z których ten asystent się uczy, i badania, które wykonuje dla Ciebie w tle.",
  "bot.page.memoryPointer":
    "To, co Twoi asystenci pamiętają o Tobie, znajdziesz w sekcji",
  "bot.page.reachPurpose":
    "Kontynuuj rozmowę z tym asystentem w Slacku, Microsoft Teams albo przez wiadomość tekstową.",
  "bot.page.responsibilitiesPurpose":
    "Stałe cele, nad którymi ten asystent dla Ciebie pracuje. Zobacz, co uruchomiło każdy przebieg i co znalazł.",
  "bot.page.routinesPurpose":
    "Co ten asystent robi dla Ciebie według harmonogramu. Wyłącz jedną, uruchom ją teraz albo usuń.",
  "bot.page.setupPurpose":
    "Kim jest ten asystent, kto może go znaleźć i gdzie działa.",
  "bot.page.sharingPurpose":
    "Kto jeszcze może z niego korzystać. Rozmowy każdej osoby z nim są prywatne.",
  // The Bot sub-pages' contents (D181 stage 2e): memory sources, suggestions, reaching you, responsibilities
  // and routines, the summaries of lib/agents/bot-summaries.ts and the time phrases of lib/relative-time.ts.
  // Shared words reuse their existing keys (`botPage.fallbackTitle` is "Bot"); `bot.choose` is "Choose a Bot".
  "bot.choose": "Wybierz asystenta",
  "memory.addSource": "Dodaj źródło",
  "memory.title": "Źródła aplikacji",
  "memory.description":
    "Połączone przez Ciebie aplikacje, które ten asystent może czytać, pojawiają się tutaj i możesz dodać kolejne. Źródła odświeżają się co 15 minut. Tylko ten asystent widzi, co one zawierają.",
  "memory.empty":
    "Nie ma jeszcze żadnych źródeł. Dodaj pierwsze przyciskiem „Dodaj źródło”.",
  "memory.upToDate": "Aktualne",
  "memory.off": "Wyłączone",
  "memory.lastRead": "Ostatni odczyt: {when}",
  "memory.syncNow": "Synchronizuj teraz",
  "memory.readNamed": "Odczytaj {name}",
  "memory.addTitle": "Dodaj źródło",
  "memory.addDescription":
    "{product} odczytuje je teraz, a potem co 15 minut, dopóki jest włączone.",
  "memory.enterNumber": "Wpisz liczbę dla {name}.",
  "memory.cantShow":
    "To źródło ma ustawienia, których {product} nie potrafi pokazać. Wybierz inne.",
  "memory.checkSettings": "Sprawdź ustawienia źródła.",
  "memory.whatToRead": "Co czytać",
  "memory.chooseWhat": "Wybierz, co czytać",
  "memory.sourceName": "Nazwa źródła",
  "memory.chooseValue": "Wybierz wartość",
  "memory.reading": "Odczytywanie źródła…",
  "memory.addAndSync": "Dodaj i zsynchronizuj źródło",
  "suggestions.everyHour": "Co godzinę",
  "suggestions.every4Hours": "Co 4 godziny",
  "suggestions.twiceDay": "Dwa razy dziennie",
  "suggestions.onceDay": "Raz dziennie",
  "suggestions.everyMinutes": {
    one: "Co {count} minutę",
    few: "Co {count} minuty",
    many: "Co {count} minut",
    other: "Co {count} minuty",
  },
  "suggestions.yourBot": "Twój asystent",
  "suggestions.title": "Proponowane kolejne kroki",
  "suggestions.from": "Źródło: {app}",
  "suggestions.connectedApp": "połączona aplikacja",
  "suggestions.openRecord": "Otwórz rekord",
  "suggestions.startTask": "Uruchom jako zadanie",
  "suggestions.empty":
    "Na razie brak propozycji. Asystenci z włączonym badaniem w tle będą tutaj proponować kolejne kroki.",
  "suggestions.turnOnResearch": "Włącz badanie",
  "suggestions.researchDescription":
    "Wyłączone, dopóki nie włączysz badania w tle dla tego asystenta, chyba że administrator włączył je dla wszystkich. Gdy jest włączone, co cztery godziny przegląda aplikacje, które już może czytać, tworzy dla Ciebie wspomnienia do przejrzenia i proponuje kolejne kroki. Może tylko czytać: nie może wysyłać wiadomości, zmieniać niczego w aplikacji ani używać przeglądarki lub komputera. Jeśli je wyłączysz albo usuniesz, tak już zostanie.",
  "suggestions.researchTitle": "Badanie w tle",
  "suggestions.researchOff": "Badanie w tle jest wyłączone.",
  "suggestions.turnOnDialog": "Włącz badanie w tle",
  "suggestions.turnOnDescription":
    "Czyta według harmonogramu i dostarcza swoje propozycje na kanał, w którym się znajduje.",
  "suggestions.deliverTo": "Dostarczaj propozycje do",
  "suggestions.chooseChannel": "Wybierz kanał",
  "suggestions.howOften": "Jak często",
  "suggestions.focus": "Czego szukać (opcjonalnie)",
  "suggestions.off": "Wyłączone",
  "suggestions.researchingNow": "Badanie w toku",
  "suggestions.lastRan": "Ostatnie uruchomienie: {when}",
  "suggestions.turnOff": "Wyłącz",
  "reaching.linkSlack": "Połącz Slack",
  "reaching.linkTeams": "Połącz Microsoft Teams",
  "reaching.connectPhone": "Połącz telefon",
  "reaching.sumSlack": "Kontynuuj rozmowę na Slacku.",
  "reaching.sumTeams": "Kontynuuj rozmowę w Microsoft Teams.",
  "reaching.sumSms": "Kontynuuj rozmowę przez wiadomość tekstową.",
  "reaching.codeOnWay":
    "Kod weryfikacyjny jest w drodze. Wpisz go, aby dokończyć.",
  "reaching.linkReady":
    "Twój kod połączenia jest gotowy do wysłania. Otwórz to, aby zobaczyć go ponownie.",
  "reaching.smsNotSet":
    "Wiadomości tekstowe nie są jeszcze skonfigurowane. Najpierw musi je włączyć administrator.",
  "reaching.notSet":
    "Nie skonfigurowano jeszcze. Najpierw administrator musi włączyć Slack i Teams.",
  "reaching.pointerBefore":
    "Twoje urządzenia, ostatnie dostawy i to, dokąd trafia każdy rodzaj aktualizacji, są w",
  "reaching.connected": "Połączone miejsca docelowe",
  "reaching.noDestinations": "Nie połączono żadnych miejsc docelowych.",
  "reaching.optedOut": "Wysłano SMS-em STOP. Wyślij SMS-em START, aby wznowić.",
  "reaching.disconnect": "Rozłącz",
  "reaching.channelNote":
    "Na kanale Slack lub Teams, który mogą czytać inni, asystent odpowiada Ci w wiadomości prywatnej.",
  "reaching.connectTitle": "Połącz rozmowę",
  "reaching.oneAtATime":
    "Każde konto lub numer telefonu działa z jedną rozmową naraz. Połączenie tutaj przenosi je z rozmowy, z którą są połączone teraz.",
  "reaching.conversation": "Rozmowa",
  "reaching.chooseConversation": "Wybierz rozmowę",
  "reaching.loadMore": "Wczytaj więcej rozmów",
  "reaching.phoneNumber": "Numer telefonu",
  "reaching.sendCode": "Wyślij kod weryfikacyjny",
  "reaching.verificationCode": "Kod weryfikacyjny",
  "reaching.confirmPhone": "Potwierdź telefon",
  "reaching.linkExpires": {
    one: "Wyślij tę wiadomość do aplikacji {product} na platformie {platform} w ciągu {count} minuty. Połączy to konto z tą rozmową i tym asystentem.",
    few: "Wyślij tę wiadomość do aplikacji {product} na platformie {platform} w ciągu {count} minut. Połączy to konto z tą rozmową i tym asystentem.",
    many: "Wyślij tę wiadomość do aplikacji {product} na platformie {platform} w ciągu {count} minut. Połączy to konto z tą rozmową i tym asystentem.",
    other:
      "Wyślij tę wiadomość do aplikacji {product} na platformie {platform} w ciągu {count} minuty. Połączy to konto z tą rozmową i tym asystentem.",
  },
  "responsibilities.new": "Nowy obowiązek",
  "responsibilities.title": "Cele",
  "responsibilities.empty":
    "Nie ma jeszcze żadnych obowiązków. Dodaj pierwszy przyciskiem „Nowy obowiązek”.",
  "responsibilities.emptyBot":
    "Ten asystent nie ma jeszcze żadnych obowiązków. Dodaj pierwszy przyciskiem „Nowy obowiązek”.",
  "routines.neverRun": "Jeszcze nie uruchomiono",
  "routines.running": "W toku…",
  "routines.missed": "Przegapiona {when}",
  "routines.failed": "Nieudana {when}",
  "routines.skipped": "Pominięta {when}",
  "routines.ran": "Uruchomiona {when}",
  "routines.finished": "Zakończona {when}",
  "routines.noRuns": "Nie było jeszcze żadnych uruchomień.",
  "routines.runNow": "Uruchom teraz",
  "routines.triggered": "Wyzwolona",
  "routines.scheduled": "Zaplanowana",
  "routines.sweepChecked":
    "{product} ostatnio sprawdził je {when}. Żadna nie zostanie uruchomiona, dopóki {product} znów nie wystartuje. Jeśli to się powtarza, poproś administratora.",
  "routines.sweepNever":
    "{product} nie zaczął jeszcze uruchamiać rutyn, więc żadna z nich nie zostanie uruchomiona. Poproś administratora o skonfigurowanie tego.",
  "routines.notRunning": "Rutyny nie działają.",
  "routines.loadError": "Nie udało się wczytać Twoich rutyn. Odśwież stronę.",
  "routines.emptyBot":
    "Ten asystent nie ma jeszcze żadnych rutyn. Poproś go o coś w rodzaju „w każdy dzień roboczy o 9, wyślij mi…”, a pojawi się tutaj.",
  "routines.empty":
    "Nie ma jeszcze żadnych rutyn. Poproś asystenta o coś w rodzaju „w każdy dzień roboczy o 9, wyślij mi…”, a pojawi się tutaj.",
  "routines.enableAria": "Włącz rutynę zaplanowaną na {schedule}",
  "routines.channelGone": "Rozmowa usunięta",
  "routines.untitledChannel": "Rozmowa bez tytułu",
  "routines.due": "Do uruchomienia",
  "routines.next": "Następna {when}",
  "routines.runNowTitle":
    "Uruchamia ją teraz, naprawdę. Asystent wykonuje pracę i publikuje w rozmowie.",
  "routines.pausedTurnOn": "Ta rutyna jest wstrzymana. Najpierw ją włącz.",
  "routines.runNowAria": "Uruchom teraz rutynę zaplanowaną na {schedule}",
  "routines.historyAria":
    "Historia uruchomień rutyny zaplanowanej na {schedule}",
  "routines.history": "Historia",
  "routines.deleteAria": "Usuń rutynę zaplanowaną na {schedule}",
  "routines.deleteTitle": "Usunąć „{schedule}”?",
  "routines.deleteDescription":
    "Ta rutyna zostaje zatrzymana na dobre. Nie da się tego cofnąć.",
  "routines.week": "Tydzień",
  "routines.nextRuns": "Następne uruchomienia",
  "routines.viewAria": "Zobacz",
  "summary.nothingGranted": "Nic nie przyznano",
  "summary.skills": {
    one: "{count} umiejętność",
    few: "{count} umiejętności",
    many: "{count} umiejętności",
    other: "{count} umiejętności",
  },
  "summary.apps": {
    one: "{count} aplikacja",
    few: "{count} aplikacje",
    many: "{count} aplikacji",
    other: "{count} aplikacji",
  },
  "summary.everyonePublic": "Wszyscy (publicznie)",
  "summary.notShared": "Nieudostępniony",
  "summary.specificPeople": "Konkretne osoby i grupy",
  "summary.onlyIn": "Tylko w {product}",
  "summary.nothingConnected": "Nic nie jest połączone",
  "summary.sources": {
    one: "{count} źródło",
    few: "{count} źródła",
    many: "{count} źródeł",
    other: "{count} źródła",
  },
  "summary.researchOn": "Badanie w tle włączone",
  "summary.researchOnAfter": "badanie w tle włączone",
  "time.justNow": "przed chwilą",
  "time.minutesAgo": {
    one: "{count} min temu",
    few: "{count} min temu",
    many: "{count} min temu",
    other: "{count} min temu",
  },
  "time.hoursAgo": {
    one: "{count} godz. temu",
    few: "{count} godz. temu",
    many: "{count} godz. temu",
    other: "{count} godz. temu",
  },
  "time.yesterday": "wczoraj",
  "time.daysAgo": {
    one: "{count} dzień temu",
    few: "{count} dni temu",
    many: "{count} dni temu",
    other: "{count} dnia temu",
  },
  "time.weeksAgo": {
    one: "{count} tyg. temu",
    few: "{count} tyg. temu",
    many: "{count} tyg. temu",
    other: "{count} tyg. temu",
  },
  "time.recently": "niedawno",
  // Stage 2f (D181): the approval rules, the responsibility dialog, the routine history, Passwords.
  "approvals.behaviour.allow": "Działa bez pytania",
  "approvals.behaviour.preApproved": "Działa, jeśli jest zatwierdzone z góry",
  "approvals.behaviour.ask": "Pyta, zanim zadziała",
  "approvals.behaviour.handOff": "Przekazuje sprawę Tobie",
  "approvals.host.ask": "Pyta za każdym razem",
  "approvals.host.allow": "Zawsze zezwala",
  "approvals.host.never": "Nigdy",
  "approvals.teamRule": "{label} (reguła zespołu)",
  "approvals.matchOn": "na {scope}",
  "approvals.matchFor": "dla {bot}",
  "approvals.locked": "Zablokowana",
  "approvals.behaviourFor": "Zachowanie dla {tool}",
  "approvals.formLead":
    "Narzędzie lub aplikacja oraz to, co asystent robi, zanim z nich skorzysta.",
  "approvals.formHelp":
    "Znak * pasuje do wszystkiego. mcp/gmail/* oznacza każde narzędzie Gmail. Cel *.example.com oznacza każdą stronę w tym serwisie.",
  "approvals.field.tool": "Narzędzie lub aplikacja",
  "approvals.field.effect": "Rodzaj działania",
  "approvals.field.scope": "Cel",
  "approvals.field.scopeHint": "*, witryna, folder, nazwa asystenta",
  "approvals.field.bot": "Asystent",
  "approvals.field.botHint": "* dla każdego asystenta",
  "approvals.field.behaviour": "Zachowanie",
  "approvals.saveRule": "Zapisz regułę",
  "approvals.addRule": "Dodaj regułę",
  "approvals.rulesOff":
    "Administrator wyłączył reguły osobiste. Twoje są zachowane, ale nie obowiązują.",
  "approvals.bot.lead":
    "Wygrywa najbardziej restrykcyjna z pasujących reguł. Reguła „Pyta, zanim zadziała” wygrywa z regułą „Działa bez pytania”. Reguły dla każdego asystenta są w",
  "approvals.bot.settingsLink": "Ustawienia → Zatwierdzenia",
  "approvals.bot.title": "Reguły",
  "approvals.bot.empty": "Brak reguł dla tego asystenta.",
  "approvals.adminLead": "Ustawienia zespołu i prośby o wspólne konta są w",
  "approvals.adminLink": "Administracja → Zatwierdzenia",
  "approvals.before.title": "Zanim asystent zadziała",
  "approvals.before.askTitle": "Pytaj przed wprowadzaniem zmian",
  "approvals.before.askLine":
    "Sprawdzaj zmiany asystenta w witrynach, połączonych aplikacjach i plikach.",
  "approvals.before.autoTitle": "Automatyczne sprawdzanie",
  "approvals.before.autoEnforced": "Administrator tego wymaga.",
  "approvals.before.autoLine":
    "Zanim asystent zrobi coś, co może wpłynąć na Twoje konta lub udostępnić informacje, {product} sprawdza to względem Twojej prośby i Twoich reguł. Jeśli nie może tego ocenić, pyta Ciebie.",
  "approvals.before.hostTitle": "Polecenia na Twoim komputerze",
  "approvals.before.hostLimited": "Administrator ogranicza to do „{limit}”.",
  "approvals.before.hostLine":
    "Aplikacja komputerowa {product} nadal pokazuje Ci każde polecenie przed jego uruchomieniem.",
  "approvals.every.lead":
    "Wygrywa najbardziej restrykcyjna z pasujących reguł. Reguła „Pyta, zanim zadziała” wygrywa z regułą „Działa bez pytania”. Reguły zespołu są zablokowane. Hasła i ustawienia bezpieczeństwa zawsze są przekazywane Tobie, tak samo jak płatności, chyba że włączysz Full access dla asystenta poniżej. Reguły jednego asystenta są na",
  "approvals.every.botPage": "stronie tego asystenta",
  "approvals.every.title": "Reguły dla każdego asystenta",
  "approvals.every.empty": "Nie ma jeszcze żadnych reguł.",
  "approvals.other.lead":
    "Te nie pasują do żadnego asystenta, którego możesz otworzyć. Nadal obowiązują każdego pasującego asystenta. Usuń te, których nie chcesz.",
  "approvals.other.title": "Reguły pozostałych asystentów",
  "approvals.page.description":
    "Wybierz, kiedy Twoi asystenci mają pytać, zanim coś zmienią. Reguły tutaj obowiązują ich wszystkich.",
  "approvals.admin.description":
    "Przed jakimi działaniami asystenci członków zespołu muszą pytać, reguły dla wszystkich oraz prośby o użycie wspólnych kont.",
  "approvals.team.title": "Ustawienia zespołu",
  "approvals.team.enforce": "Wymagaj automatycznego sprawdzania od wszystkich",
  "approvals.team.custom": "Pozwól członkom ustawiać reguły osobiste",
  "approvals.team.hostTitle": "Polecenia na komputerach członków, co najwyżej",
  "approvals.team.hostLine":
    "Własne, ostrzejsze ustawienie członka nadal obowiązuje.",
  "approvals.team.rulesLead":
    "Dotyczą asystentów każdego członka zespołu. Członkowie nie mogą ich zmieniać.",
  "approvals.team.rulesTitle": "Reguły zespołu",
  "approvals.team.empty": "Brak reguł zespołu.",
  "approvals.team.addRule": "Dodaj regułę zespołu",
  "approvals.shared.title": "Prośby o wspólne konta",
  "approvals.shared.wants": "{bot} chce wspólnego konta {account}",
  "approvals.shared.why.refusedCall":
    "Działanie zostało zablokowane. Ten asystent dociera do większej liczby osób, niż zatwierdzono.",
  "approvals.shared.why.publish":
    "Jego właściciel rozszerzył, kto może do niego dotrzeć.",
  "approvals.shared.why.trigger":
    "Jego właściciel dodał wyzwalacz, dzięki któremu wiadomości z zewnątrz mogą nim kierować.",
  "approvals.shared.why.grant": "Przyznano mu działania aplikacji.",
  "approvals.shared.now": "Teraz:",
  "approvals.shared.notApproved": "Niezatwierdzone",
  "approvals.shared.asked": "Poproszono o:",
  "approvals.shared.approve": "Zatwierdź",
  "approvals.shared.decline": "Odrzuć",
  "tasks.updated": "Zaktualizowano {ago}",
  "routines.status.running": "W toku",
  "routines.status.succeeded": "Udana",
  "routines.status.failed": "Nieudana",
  "routines.status.skipped": "Pominięta",
  "routines.status.waiting": "Czeka na Ciebie",
  "routines.status.missed": "Przegapiona",
  "routines.history.empty":
    "Nie było jeszcze żadnych uruchomień. Uruchomienie pojawi się tutaj, gdy rutyna zadziała, albo po naciśnięciu „Uruchom teraz”.",
  "routines.history.aBot": "Asystent",
  "routines.history.latest": {
    one: "Pokazuje ostatnie {count} uruchomienie.",
    few: "Pokazuje ostatnie {count} uruchomienia.",
    many: "Pokazuje ostatnich {count} uruchomień.",
    other: "Pokazuje ostatnie {count} uruchomienia.",
  },
  "routines.history.deleted": "Rutyna, która została później usunięta",
  "routines.history.waitingNote":
    "Czeka na Twoje zatwierdzenie. Otwórz rozmowę, aby na nie odpowiedzieć.",
  "responsibilities.status.completed": "Ukończony",
  "responsibilities.summary.paused":
    "Nic go nie uruchomi, dopóki go nie wznowisz",
  "responsibilities.summary.trigger": "Wyzwalacz: {kind}",
  "responsibilities.summary.starts": "Startuje {starts}",
  "responsibilities.summary.asked": "Uruchamia się na żądanie",
  "responsibilities.source.manual": "Ręcznie",
  "responsibilities.source.schedule": "Harmonogram",
  "responsibilities.source.connector": "Połączona aplikacja",
  "responsibilities.progress": "Postęp",
  "responsibilities.lastResult": "Ostatni wynik",
  "responsibilities.activeOn": "Jego zdarzenia i wyzwalacze go uruchamiają.",
  "responsibilities.activeOff": "Wstrzymany. Jego wyzwalacze go nie uruchomią.",
  "responsibilities.runNowLine":
    "Uruchamia go teraz, naprawdę. Asystent wykonuje pracę i może publikować oraz podejmować działania.",
  "responsibilities.complete": "Ukończ",
  "responsibilities.completeLine":
    "Oznacz jako zakończony. Po tym nic go już nie uruchomi.",
  "responsibilities.field.title": "Tytuł",
  "responsibilities.field.instruction": "Instrukcja",
  "responsibilities.field.criteria": "Kryteria sukcesu",
  "responsibilities.events": "Zdarzenia",
  "responsibilities.saving": "Zapisywanie…",
  "responsibilities.run.queued": "W kolejce",
  "responsibilities.run.waiting":
    "Czeka na {kind}. Odpowiedz u góry strony tego asystenta albo w rozmowie.",
  "responsibilities.runs": "Uruchomienia",
  "responsibilities.viewRuns": "Pokaż uruchomienia",
  "responsibilities.hideRuns": "Ukryj uruchomienia",
  "passwords.description":
    "Dane logowania zapisane przy logowaniu asystenta do strony. Asystenci nigdy ich nie widzą, a każde użycie potwierdzasz.",
  "passwords.saved": "Zapisane dane logowania",
  "passwords.loadError": "Nie udało się wczytać Twoich haseł. Odśwież stronę.",
  "passwords.off":
    "Administrator wyłączył zapisane hasła. Twoje dane logowania są zachowane, ale nie będą proponowane.",
  "passwords.empty":
    "Brak zapisanych danych logowania. Wybierz „Zapisz w Hasłach”, gdy logujesz asystenta do strony.",
  "passwords.lastUsed": "ostatnio użyto {date}",
  "passwords.neverUsed": "nigdy nie użyto",
  "passwords.deleteAria": "Usuń dane logowania dla {origin}",
  "settings.notificationsPage":
    "Gdzie docierają do Ciebie aktualizacje Twoich asystentów, gdy Cię nie ma. Ile każdy z nich wysyła, ustawisz na jego własnej stronie.",
  "fullaccess.label.noPayments": "Full access bez płatności",
  "fullaccess.label.full": "Full access",
  "fullaccess.off": "Wyłączony",
  "fullaccess.description":
    "Domyślnie bezpiecznie: Twoi asystenci pytają, zanim coś wyślą, zapłacą, podpiszą, zarezerwują lub usuną. Dla każdego asystenta możesz wybrać, że zrobi to bez pytania.",
  "fullaccess.offTerm": "Wyłączony:",
  "fullaccess.offText":
    "asystent pyta, zanim coś wyśle, zapłaci, podpisze, zarezerwuje lub usunie.",
  "fullaccess.noPaymentsTerm": "Full access bez płatności:",
  "fullaccess.noPaymentsText":
    "wysyła, podpisuje, rezerwuje i usuwa bez pytania. Płatności i zakupy nadal wymagają Twojego pytania.",
  "fullaccess.fullTerm": "Full access:",
  "fullaccess.fullText":
    "płaci i kupuje również bez pytania. Kwota nie ma limitu, dopóki nie pojawią się limity wydatków (planowane w v0.4).",
  "fullaccess.askTitle": "Dać {name} {label}?",
  "fullaccess.give": "Daj {label}",
  "fullaccess.full.p1":
    "{name} będzie wysyłać, płacić, podpisywać, rezerwować i usuwać bez pytania Cię wcześniej. Może działać na podstawie tego, co czyta, na przykład e-maila lub strony internetowej, więc włącz to tylko wtedy, gdy mu w tym ufasz.",
  "fullaccess.full.p2":
    "Nie ma limitu kwoty, którą może zapłacić: limity wydatków jeszcze nie istnieją (są planowane w v0.4). Aby płatności i zakupy nadal pytały Ciebie, wybierz zamiast tego Full access bez płatności.",
  "fullaccess.full.p3":
    "Hasła i ustawienia bezpieczeństwa nadal wymagają Ciebie. Gdy skonfigurowany jest automatyczny recenzent, czyta on też jednokrotnie każde polecenie i skrypt, które członek uruchamia na swoim komputerze, nawet jeśli wyłączyłeś recenzenta; gdy żaden nie jest skonfigurowany, polecenia nie są czytane. Dotyczy to tego, o co prosisz w swoich czatach, a nie rutyn ani check-inów. Możesz to wyłączyć w dowolnej chwili, a przestaje działać natychmiast.",
  "fullaccess.noPayments.p1":
    "{name} będzie wysyłać, podpisywać, rezerwować i usuwać bez pytania Cię wcześniej. Płatności i zakupy nadal pytają Ciebie. Może działać na podstawie tego, co czyta, na przykład e-maila lub strony internetowej, więc włącz to tylko wtedy, gdy mu w tym ufasz.",
  "fullaccess.noPayments.p2":
    "Aplikacja rozpoznaje płatność dzięki wbudowanym kontrolom, więc wiadomość, która tylko wspomina o płatności, też może pytać, a płatność sformułowana w nietypowy sposób może nie zostać wykryta. Hasła i ustawienia bezpieczeństwa nadal wymagają Ciebie. Gdy skonfigurowany jest automatyczny recenzent, czyta on też jednokrotnie każde polecenie i skrypt, które członek uruchamia na swoim komputerze w sprawie hasła, ustawienia bezpieczeństwa lub płatności wykonanej w ten sposób, nawet jeśli wyłączyłeś recenzenta; gdy żaden nie jest skonfigurowany, polecenia nie są czytane. Dotyczy to tego, o co prosisz w swoich czatach, a nie rutyn ani check-inów. Możesz to wyłączyć w dowolnej chwili, a przestaje działać natychmiast.",
  "fullaccess.noBots": "Nie ma jeszcze asystentów.",
  "fullaccess.legend": "Dostęp dla {name}",
  "fullaccess.radioAria": "{label} dla {name}",
  "fullaccess.summary.off":
    "Pyta, zanim coś wyśle, zapłaci, podpisze, zarezerwuje lub usunie.",
  "fullaccess.summary.noPayments":
    "Działa bez pytania, z tym że płatności i zakupy nadal pytają Ciebie. Od {since}.",
  "fullaccess.summary.full":
    "Działa bez pytania, także przy płatnościach, bez limitu kwoty. Od {since}.",
  "fullaccess.doneTitle": "Zrobione bez pytania",
  "fullaccess.doneDescription":
    "Co asystent z Full access zrobił bez pytania Ciebie, od najnowszych.",
  "fullaccess.nothingYet": "Jeszcze nic.",
  "approvals.audience.owner": "Tylko jego właściciel",
  "approvals.audience.team": "Wszyscy",
  "approvals.audience.outside": ", i dane z zewnątrz",
  "approvals.audience.nobody": "Nikt nie wskazany",
  "approvals.audience.groups": {
    one: "Grupa {names}",
    few: "Grupy {names}",
    many: "Grupy {names}",
    other: "Grupy {names}",
  },
  "approvals.audience.people": {
    one: "{count} osoba",
    few: "{count} osoby",
    many: "{count} osób",
    other: "{count} osoby",
  },
  "approvals.audience.join": "{a} i {b}",
  "access.req.title": "Prośby",
  "access.req.loadError":
    "Nie udało się wczytać próśb o dostęp. Odśwież stronę.",
  "access.req.descApp":
    "Osoby proszące o tę aplikację. Zatwierdzenie od razu robi to, o co poprosiły.",
  "access.req.descAll":
    "Osoby proszące o włączenie aplikacji, przekazanie jej asystentowi lub połączenie. Zatwierdzenie od razu robi to, o co poprosiły.",
  "access.req.aBot": "asystenta",
  "access.req.theBot": "asystenta",
  "access.req.somebody": "Ktoś",
  "access.req.enable": "Włącz {app} dla {bot}",
  "access.req.grantMore": "Daj więcej z {app} dla {bot}: {list}",
  "access.req.grant": "Daj {app} dla {bot}",
  "access.req.connectShared": "Połącz wspólne konto {app}",
  "access.req.asked": "Prośba od {who}, {when}{forBot}.",
  "access.req.forBot": ", dla {bot}",
  "access.req.approving": "Zatwierdzanie…",
  "access.req.botPage": "strona asystenta w {app}",
  "access.req.toolRead": "{name} (tylko odczyt)",
  "access.req.toolWrite": "{name} (coś zmienia)",
  "access.req.gives":
    "Zatwierdzenie daje dla {bot} dokładnie te narzędzia i nic więcej: {list}.",
  "access.req.readOnly":
    "Zatwierdzenie daje dla {bot} tylko akcje {app} wyłącznie do odczytu. Pozostałe wybierz w {page}.",
  "access.req.canSend": {
    one: "{names} może wysyłać w imieniu osoby.",
    few: "{names} mogą wysyłać, każdy w imieniu osoby.",
    many: "{names} mogą wysyłać, każdy w imieniu osoby.",
    other: "{names} mogą wysyłać, każdy w imieniu osoby.",
  },
  "access.req.unreviewed": {
    one: "Żadna sprawdzona lista nie mówi, co {names} robi w {app}, więc może wysyłać w imieniu osoby.",
    few: "Żadna sprawdzona lista nie mówi, co robią {names} w {app}, więc każdy może wysyłać w imieniu osoby.",
    many: "Żadna sprawdzona lista nie mówi, co robią {names} w {app}, więc każdy może wysyłać w imieniu osoby.",
    other:
      "Żadna sprawdzona lista nie mówi, co robią {names} w {app}, więc każdy może wysyłać w imieniu osoby.",
  },
  "access.req.neverGives": {
    one: "Zatwierdzenie nigdy nie daje takiego narzędzia: zezwól na nie w ustawieniach, w {page}.",
    few: "Zatwierdzenie nigdy nie daje takich narzędzi: zezwól na nie w ustawieniach, w {page}.",
    many: "Zatwierdzenie nigdy nie daje takich narzędzi: zezwól na nie w ustawieniach, w {page}.",
    other:
      "Zatwierdzenie nigdy nie daje takich narzędzi: zezwól na nie w ustawieniach, w {page}.",
  },
  "access.req.and": "{a} i {b}",
  "passwords.saveTo": "Zapisz w Hasłach",
  "responsibilities.run.waitKind.approval": "Twoje zatwierdzenie",
  "responsibilities.run.waitKind.question": "Twoją odpowiedź",
  "responsibilities.run.waitKind.handoff": "Twoje przejęcie sprawy",
  "responsibilities.run.waitKind.signIn": "Twoje zalogowanie",
  "responsibilities.run.waitKind.other": "Ciebie",
  "responsibilities.new.description":
    "Stały cel. Asystent pracuje nad nim w rozmowie, którą wybierzesz.",
  "responsibilities.new.chooseConversation": "Wybierz rozmowę",
  "responsibilities.new.loadMore": "Wczytaj więcej rozmów",
  "responsibilities.new.titleExample": "Aktualizuj raport dla klientów",
  "responsibilities.new.criteriaExample":
    "Raport zawiera wykres z bieżącego kwartału i link do źródła.",
  "responsibilities.new.eventSource": "Źródło zdarzeń",
  "responsibilities.new.source.none": "Uruchom na życzenie",
  "responsibilities.new.githubHelp":
    "Zdarzenia pochodzą z repozytoriów, które połączyłeś w {link}.",
  "responsibilities.new.eventType": "Typ zdarzenia",
  "responsibilities.new.creating": "Tworzenie…",
  "responsibilities.new.create": "Utwórz obowiązek",
  "triggers.kind.email": "E-mail",
  "triggers.help.webhook":
    "Wyślij POST z JSON na ten adres URL z nagłówkiem Authorization lub z nagłówkami podpisu Standard Webhooks. Odpowiedź 200 oznacza, że dotarło, a nie że uruchomienie się zakończyło.",
  "triggers.help.github":
    "W Settings → Webhooks repozytorium ustaw payload URL na ten adres, content type na application/json, a secret na klucz.",
  "triggers.help.linear":
    "W Linear, Settings → API → Webhooks: ustaw adres URL, a potem wklej tutaj signing secret, który pokazuje Linear.",
  "triggers.help.sentry":
    "W wewnętrznej integracji Sentry ustaw adres URL webhooka, a potem wklej tutaj client secret integracji.",
  "triggers.help.pagerduty":
    "W PagerDuty, Integrations → Generic Webhooks (v3): ustaw adres URL, a potem wklej tutaj secret pokazany przy tworzeniu.",
  "triggers.help.email":
    "Wyślij lub przekaż pocztę na ten adres, aby rozpocząć uruchomienie.",
  "triggers.help.slack":
    "Uruchamia się przy zdarzeniach Slacka, które odbiera ten asystent. Wiadomości wysłane przed dodaniem wyzwalacza są ignorowane.",
  "triggers.slack.mention": "Asystent zostaje wspomniany",
  "triggers.slack.phrase": "Wiadomość zawiera frazę",
  "triggers.slack.reaction": "Dodano reakcję",
  "triggers.slack.message": "Dowolna wiadomość",
  "triggers.f.inChannels": "w {channels}",
  "triggers.f.everyChannel": "w każdym kanale, w którym jest asystent",
  "triggers.f.mention": "gdy asystent zostaje wspomniany",
  "triggers.f.anyMessage": "przy każdej wiadomości",
  "triggers.f.phrases": "przy wiadomościach zawierających {phrases}",
  "triggers.f.or": " lub ",
  "triggers.f.reactions": "przy reakcjach",
  "triggers.f.slack": "{what} {where} (workspace {team})",
  "triggers.f.events": "zdarzenia {types}",
  "triggers.f.everyEvent": "każde zdarzenie",
  "triggers.f.where": "gdy {path} = {equals}",
  "triggers.f.from": "od {from}",
  "triggers.f.fromSenders": "od {senders} (uwierzytelnione)",
  "triggers.title": "Wyzwalacze",
  "triggers.add": "Dodaj wyzwalacz",
  "triggers.notActive.paused":
    "Ten obowiązek jest wstrzymany. Jego wyzwalacze go nie uruchomią.",
  "triggers.notActive.completed":
    "Ten obowiązek jest ukończony. Jego wyzwalacze go nie uruchomią.",
  "triggers.none":
    "Brak wyzwalaczy. Uruchamia się, gdy naciśniesz Uruchom teraz, albo przy zdarzeniach powyżej.",
  "triggers.removeForGood": "Usuń na stałe",
  "triggers.keep": "Zachowaj",
  "triggers.runOnAria": "Uruchamiaj przy tym wyzwalaczu {kind}",
  "triggers.postTo": "POST na",
  "triggers.copyUrl": "Kopiuj URL",
  "triggers.copyAddress": "Kopiuj adres",
  "triggers.emailOff":
    "E-mail nie jest jeszcze skonfigurowany w {product}, więc ten adres nie może odbierać poczty. Musi go włączyć administrator.",
  "triggers.key": "Klucz",
  "triggers.copyKey": "Kopiuj klucz",
  "triggers.copyHeader": "Kopiuj nagłówek",
  "triggers.showKey": "Pokaż klucz",
  "triggers.replaceKey": "Zastąp klucz",
  "triggers.secretSaved": "Signing secret zapisany",
  "triggers.secretWaiting": "Oczekiwanie na signing secret",
  "triggers.secret": "Signing secret",
  "triggers.pasteNew": "Wklej nowy secret, aby go zastąpić",
  "triggers.paste": "Wklej signing secret",
  "triggers.saveSecret": "Zapisz secret",
  "triggers.addDescription": "Coś spoza {product}, co uruchamia ten obowiązek.",
  "triggers.slackTeam": "ID zespołu Slack",
  "triggers.fireOn": "Uruchamiaj przy",
  "triggers.phrases": "Frazy (oddzielone przecinkami)",
  "triggers.reactions": "Reakcje (puste: dowolne)",
  "triggers.channelIds":
    "ID kanałów (puste: wszystkie, w których jest asystent)",
  "triggers.eventTypes": "Typy zdarzeń",
  "triggers.onlyWhen": "Tylko gdy pole",
  "triggers.equals": "jest równe",
  "triggers.repository": "Repozytorium (opcjonalnie)",
  "triggers.senders": "Dozwoleni nadawcy (puste: nikt)",
  "triggers.secretLater": "Signing secret (można dodać później)",
  "triggers.adding": "Dodawanie…",
  "triggers.addKind": "Dodaj wyzwalacz {kind}",
  "triggers.example.webhook": "deploy.finished (puste: dowolne)",
  "routines.cal.intro":
    "Następne {days} dni, dla włączonych rutyn. Godziny są w Twojej strefie czasowej.",
  "routines.cal.none": "Nie ma jeszcze rutyn, więc nic nie jest zaplanowane.",
  "routines.cal.noneOn":
    "Żadna z tych rutyn nie jest włączona, więc żadna się nie uruchomi.",
  "routines.cal.nothing":
    "W następnych {days} dniach nic nie jest zaplanowane.",
  "routines.cal.truncated":
    "Wypisano tylko pierwsze {max} uruchomień z tych {days} dni.",
  "routines.cal.paused": {
    one: "{count} rutyna wstrzymana, więc nie ma jej tutaj. Włącz jedną, aby zobaczyć, kiedy się uruchamia.",
    few: "{count} rutyny wstrzymane, więc nie ma ich tutaj. Włącz jedną, aby zobaczyć, kiedy się uruchamia.",
    many: "{count} rutyn wstrzymanych, więc nie ma ich tutaj. Włącz jedną, aby zobaczyć, kiedy się uruchamia.",
    other:
      "{count} rutyny wstrzymanej, więc nie ma jej tutaj. Włącz jedną, aby zobaczyć, kiedy się uruchamia.",
  },
  "routines.week.nothing": "Na resztę tego tygodnia nic nie jest zaplanowane.",
  "routines.week.label": "Ten tydzień",
  "routines.week.today": "dziś",
  "routines.week.now": "Teraz, {time}",
  "routines.week.next": "Następne:",
  "routines.week.nothingElse":
    "Nic więcej nie jest zaplanowane na ten tydzień.",
  "routines.week.truncated":
    "Wypisano tylko pierwsze uruchomienia z najbliższych dni, więc bardzo często uruchamiana rutyna może nie pokazać się każdego dnia.",
  "routines.week.historyError":
    "Nie udało się wczytać uruchomień, które już się odbyły, więc ich nie pokazano.",
  "routines.week.note":
    "Godziny są w Twojej strefie czasowej. Rutyna uruchamiana częściej niż co godzinę pojawia się jako jeden blok na dany dzień.",
  "routines.week.summary": "{count} uruchomień, co ~{minutes} min",
  "routines.week.gone": "{label}, rozmowa usunięta",
  "routines.card.label": "Rutyna",
  "routines.card.cancelled": "Rutyna anulowana",
  "routines.card.readError": "Nie udało się odczytać tej rutyny.",
  "routines.card.reading": "Odczytywanie tej rutyny…",
  "routines.card.gone": "Ta rutyna już nie istnieje",
  "routines.card.cannotSend":
    "Ta rozmowa nie może teraz przyjąć wiadomości. Napisz zmianę w polu wiadomości poniżej.",
  "routines.card.confirm": "Anulować tę rutynę?",
  "routines.card.yes": "Tak, anuluj",
  "routines.card.no": "Nie, zachowaj",
  "routines.card.pause": "Wstrzymaj",
  "routines.card.resume": "Wznów",
  "routines.card.edit": "Edytuj",
  "routines.card.whatChange": "Co ma się zmienić?",
  "routines.card.send": "Wyślij zmianę",
  "routines.card.writeBelow": "Napisz zmianę w polu wiadomości poniżej.",
  "routines.card.close": "Zamknij",
  "admin.boundaries.title": "Granice",
  "admin.boundaries.descLead":
    "Co asystent może, a czego nie może robić ze swoim komputerem. Każda akcja jest sprawdzana, zanim się wydarzy. Odmowy widać w",
  "admin.boundaries.descAudit": "Audyt",
  "admin.boundaries.descTail": "razem z regułą, która ich odmówiła.",
  "admin.boundaries.whenTitle": "Gdy reguła pasuje",
  "admin.boundaries.whenDesc":
    "Zatrzymać akcję albo ją zapisać i przepuścić. Zapisywanie pozwala wypróbować regułę na prawdziwej aktywności, zanim cokolwiek odmówi.",
  "admin.boundaries.modeEnforce": "Zatrzymaj akcję",
  "admin.boundaries.modeRecord": "Zapisz ją i zezwól",
  "admin.boundaries.modeEnforceNote":
    "Asystent zostaje zatrzymany i dowiaduje się, która reguła mu odmówiła.",
  "admin.boundaries.modeRecordNote":
    "Nic nie jest zatrzymywane. Każde dopasowanie jest zapisywane tak, jakby zostało odrzucone.",
  "admin.boundaries.neverTitle": "Asystenci nigdy nie mogą",
  "admin.boundaries.neverLead":
    "Sprawdzane najpierw. Dopasowanie zatrzymuje akcję, a asystent dowiaduje się, która reguła jej odmówiła. Reguły są w CEL. Mogą sprawdzać",
  "admin.boundaries.neverMid1": ", element, naciśnięty",
  "admin.boundaries.neverMid2": ", plik, uruchomione",
  "admin.boundaries.neverMid3": "oraz",
  "admin.boundaries.neverMid4": "dla zewnętrznych narzędzi.",
  "admin.boundaries.neverMid5": "mówi, co uruchomiło wykonanie:",
  "admin.boundaries.neverTail":
    "Zaplanowane wykonanie działa jako jego właściciel, więc samo",
  "admin.boundaries.neverTail2":
    "tego nie powie. Reguła, której nie da się ocenić, liczy się jako dopasowanie. Literówka nigdy nie przepuści akcji.",
  "admin.boundaries.or": "lub",
  "admin.boundaries.noRules":
    "Brak reguł. Każda akcja jest dozwolona i zapisywana.",
  "admin.boundaries.remove": "Usuń",
  "admin.boundaries.ruleLabel": "Reguła zapisana w CEL",
  "admin.boundaries.testing": "Testowanie…",
  "admin.boundaries.testFirst": "Najpierw przetestuj",
  "admin.boundaries.addRule": "Dodaj regułę",
  "admin.boundaries.preset.form": "Nigdy nie wysyłaj formularza",
  "admin.boundaries.preset.formCost":
    "Powstrzymuje też asystenta przed naciskaniem Enter w innych miejscach. Formularz może się wysłać po Enter w dowolnym polu. Nie obejmuje wyboru z menu ani pola daty, których zmiana może sama wysłać formularz.",
  "admin.boundaries.preset.password": "Nigdy nie wpisuj w pole hasła",
  "admin.boundaries.preset.passwordCost":
    "Pole hasła z inną etykietą nie jest objęte. Reguła dopasowuje etykietę.",
  "admin.boundaries.preset.social":
    "Trzymaj się z dala od mediów społecznościowych",
  "admin.boundaries.preset.socialCost":
    "Tylko te dwa hosty. Link, który przekierowuje tam z innego miejsca, jest dozwolony.",
  "admin.boundaries.otherwiseTitle": "W pozostałych przypadkach mogą",
  "admin.boundaries.otherwiseDesc":
    "Dotyczy wszystkiego, czego nie złapała lista powyżej. Pusta lista tutaj nie pozwala na nic, a każda akcja jest odrzucana.",
  "admin.boundaries.allowAll": "true, wszystko, co nie jest odrzucone powyżej",
  "admin.boundaries.saved":
    "Zapisano. Obowiązuje przy następnej akcji dowolnego asystenta.",
  "admin.boundaries.footer":
    "Zmiany obowiązują przy następnej akcji dowolnego asystenta. Zostają po ponownym uruchomieniu.",
  "admin.boundaries.dry.none":
    "Nie ma jeszcze zapisanych akcji komputera do testu. Reguła jest poprawna. Zobaczysz, co łapie, gdy asystenci zaczną działać.",
  "admin.boundaries.dry.zero":
    "Przetestowano na ostatnich {scanned} zapisanych akcjach. Ta reguła nie odrzuciłaby żadnej. Nadal może pasować do przyszłych.",
  "admin.boundaries.dry.some":
    "Przetestowano na ostatnich {scanned} zapisanych akcjach. Ta reguła odrzuciłaby {refused}.",
  "admin.boundaries.dry.wouldRefuse": "Odrzuciłaby",
  "admin.boundaries.dry.wouldAllow": "Teraz by dopuściła",
  "admin.boundaries.dry.on": "na „{name}”",
  "admin.boundaries.dry.running": "uruchamia",
  "admin.boundaries.dry.touching": "dotyka {file}",
  "admin.boundaries.dry.first":
    "Pokazano pierwsze {shown}. Liczba powyżej obejmuje wszystko, co sprawdzono.",
  "admin.people.title": "Osoby",
  "admin.people.desc":
    "Wszyscy, którzy się zalogowali. Administratorzy mogą otwierać te ekrany. Wszyscy pozostali rozmawiają z asystentami.",
  "admin.people.whoTitle": "Kto tu jest",
  "admin.people.whoDesc":
    "Adresy z INITIAL_ADMIN_EMAILS są zawsze administratorami. Nie możesz ich tu zmienić.",
  "admin.people.stopped": {
    one: "Zatrzymano {count} komputer",
    few: "Zatrzymano {count} komputery",
    many: "Zatrzymano {count} komputerów",
    other: "Zatrzymano {count} komputera",
  },
  "admin.people.stoppedFailed": ". Nie udało się zatrzymać: {failed}",
  "admin.people.disksKept": ". Ich dyski zostają zachowane.",
  "admin.people.searchLabel": "Szukaj osób",
  "admin.people.searchPlaceholder": "Szukaj po nazwie lub adresie",
  "admin.people.loadError": "Nie udało się wczytać osób. Odśwież stronę.",
  "admin.people.noMatch": "Nikt nie pasuje do „{query}”.",
  "admin.people.nobody":
    "Nikt jeszcze się nie zalogował. Osoby pojawią się tutaj, gdy to zrobią.",
  "admin.people.lastSignedIn": "ostatnie logowanie {date}",
  "admin.people.neverSignedIn": "brak logowania",
  "admin.people.noProvider": "brak dostawcy",
  "admin.people.accessRemoved": "Dostęp odebrany",
  "admin.people.adminByConfig": "Administrator z konfiguracji",
  "admin.people.stopComputers": "Zatrzymaj komputery",
  "admin.people.restore": "Przywróć",
  "admin.people.remove": "Usuń",
  "admin.people.adminSwitch": "Administrator: {email}",
  "admin.people.loading": "Wczytywanie…",
  "admin.people.showMore": "Pokaż więcej",
  "admin.boundaries.and": "i",
  "admin.credentials.title": "Dane logowania",
  "admin.credentials.add": "Dodaj dane logowania",
  "admin.credentials.desc":
    "Klucze i tokeny tej instalacji. {product} nigdy nie pokazuje sekretu po jego zapisaniu.",
  "admin.credentials.dialogDesc":
    "Zapisane dla tej instalacji. Sekretu nie zobaczysz ponownie.",
  "admin.credentials.type": "Typ",
  "admin.credentials.model": "Model",
  "admin.credentials.connector": "Konektor",
  "admin.credentials.provider": "Dostawca",
  "admin.credentials.keyId": "ID klucza",
  "admin.credentials.secret": "Sekret",
  "admin.credentials.replaces":
    "Ten klucz ma już aktywne dane logowania. Zapis zastępuje je i unieważnia stare.",
  "admin.credentials.saveError":
    "Nie udało się zapisać danych logowania. Spróbuj ponownie.",
  "admin.credentials.cancel": "Anuluj",
  "admin.credentials.saving": "Zapisywanie…",
  "admin.credentials.save": "Zapisz dane logowania",
  "admin.credentials.savedTitle": "Zapisane dane logowania",
  "admin.credentials.loadError":
    "Nie udało się wczytać danych logowania. Odśwież stronę.",
  "admin.credentials.empty":
    "Nie ma jeszcze danych logowania. Dodaj je przyciskiem Dodaj dane logowania.",
  "admin.credentials.revoked": "unieważnione",
  "admin.credentials.active": "aktywne",
  "admin.credentials.revoke": "Unieważnij",
  "admin.idp.title": "Dostawcy tożsamości",
  "admin.idp.add": "Dodaj dostawcę",
  "admin.idp.desc":
    "Własny dostawca SAML lub OpenID Connect twojej firmy. Ludzie logują się swoim adresem e-mail, a jego domena wybiera dostawcę.",
  "admin.idp.registeredTitle": "Zarejestrowani",
  "admin.idp.registeredDesc":
    "Google, Microsoft i Okta są ustawiane w środowisku. Nie pokazują się tutaj.",
  "admin.idp.loadError":
    "Nie udało się wczytać dostawców tożsamości. Odśwież stronę.",
  "admin.idp.empty":
    "Nie ma jeszcze dostawców tożsamości. Dodaj jednego z metadanymi od swojego zespołu tożsamości.",
  "admin.idp.remove": "Usuń",
  "admin.idp.dialogTitle": "Dodaj dostawcę tożsamości",
  "admin.idp.name": "Nazwa",
  "admin.idp.domain": "Domena e-mail",
  "admin.idp.domainNote":
    "Każdy z adresem w tej domenie loguje się tutaj. Kilka domen oddziel przecinkami.",
  "admin.idp.issuer": "Wystawca",
  "admin.idp.signOnUrl": "Adres URL logowania",
  "admin.idp.metadata": "XML metadanych",
  "admin.idp.metadataNote":
    "Plik od twojego zespołu tożsamości. Zawiera certyfikat podpisu.",
  "admin.idp.clientId": "ID klienta",
  "admin.idp.clientSecret": "Sekret klienta",
  "admin.idp.cancel": "Anuluj",
  "admin.idp.adding": "Dodawanie…",
  "admin.idp.addShort": "Dodaj",
  "admin.audit.decision.bot.declined": "Asystent odmówił",
  "admin.audit.decision.agent.stream_stalled": "Asystent przestał odpowiadać",
  "admin.audit.decision.computer.policy_loaded": "Granica przy uruchomieniu",
  "admin.audit.decision.computer.isolation_loaded":
    "Izolacja przy uruchomieniu",
  "admin.audit.decision.computer.control_taken": "Osoba przejęła kontrolę",
  "admin.audit.decision.computer.control_released":
    "Kontrola wróciła do asystenta",
  "admin.audit.decision.computer.help_requested": "Asystent poprosił o pomoc",
  "admin.audit.decision.computer.secret_requested":
    "Asystent poprosił o sekret",
  "admin.audit.decision.computer.secret_supplied": "Osoba podała sekret",
  "admin.audit.decision.computer.reset": "Komputer został zresetowany",
  "admin.audit.decision.computer.updated": "Komputer został zaktualizowany",
  "admin.audit.decision.computer.stopped": "Osoba nacisnęła stop",
  "admin.audit.decision.component.granted": "Przyznano temu asystentowi",
  "admin.audit.decision.component.revoked": "Odebrano temu asystentowi",
  "admin.audit.decision.component.published":
    "Opublikowano. Każdy asystent może tego używać",
  "admin.audit.decision.component.unpublished":
    "Wycofano z publikacji. Żaden asystent nie może tego używać",
  "admin.audit.decision.component.draft_saved":
    "Szkic zapisany, jeszcze nieopublikowany",
  "admin.audit.decision.component.refused": "Odmówiono",
  "admin.audit.decision.component.function_granted": "Może to czytać",
  "admin.audit.decision.component.function_revoked": "Nie może już tego czytać",
  "admin.audit.decision.component.function_called": "Odczytano prawdziwe dane",
  "admin.audit.decision.component.function_refused": "Odmówiono",
  "admin.audit.decision.component.function_failed": "Nie udało się odczytać",
  "admin.audit.decision.mcp.tools_discovered":
    "Narzędzia zaoferowane na jedno wykonanie",
  "admin.audit.decision.mcp.call_succeeded":
    "Wywołano w imieniu tego asystenta",
  "admin.audit.decision.mcp.call_rejected": "Zablokowano",
  "admin.audit.decision.mcp.call_failed": "Serwer nie odpowiedział",
  "admin.audit.decision.mcp.callback_refused":
    "Nie udało się potwierdzić, który to był asystent",
  "admin.audit.decision.configuration.changed": "Zmieniono konfigurację",
  "admin.audit.decision.credential.created": "Zapisano dane logowania",
  "admin.audit.discovery.under-floor":
    "Tak mało narzędzi, że zaoferowano wszystkie",
  "admin.audit.discovery.nothing-declared":
    "Żadna umiejętność nie deklaruje żadnego z tych narzędzi",
  "admin.audit.discovery.unavailable":
    "Nie udało się wybrać, więc zaoferowano wszystkie",
  "admin.audit.discovery.nothing-chosen":
    "Żadna umiejętność nie pasowała, więc zaoferowano wszystkie",
  "admin.audit.discovery.selected": "Wybrane przez umiejętność",
  "admin.audit.title": "Audyt",
  "admin.audit.desc":
    "Każda akcja asystenta i każda, której odmówiła polityka tej instalacji.",
  "admin.audit.export": "Eksportuj CSV",
  "admin.audit.exporting": "Eksportowanie…",
  "admin.audit.refresh": "Odśwież",
  "admin.audit.exportFailed":
    "Nie udało się wyeksportować zdarzeń audytu. Spróbuj ponownie.",
  "admin.audit.filter.all": "Wszystko",
  "admin.audit.filter.computer": "Akcje komputera",
  "admin.audit.filter.blocked": "Zablokowane",
  "admin.audit.filter.didNot": "Nie doszło do skutku",
  "admin.audit.filter.nobody": "Nikt nie obserwuje",
  "admin.audit.capped":
    "Plik zawiera najnowsze zdarzenia ({count}), nie wszystkie. Zawęź filtr lub daty, aby wyeksportować resztę.",
  "admin.audit.loadError":
    "Nie udało się wczytać dziennika audytu. Odśwież stronę.",
  "admin.audit.empty": "Żadne zdarzenia nie pasują jeszcze do tego filtra.",
  "admin.audit.col.when": "Kiedy",
  "admin.audit.col.what": "Co",
  "admin.audit.col.on": "Na",
  "admin.audit.col.bot": "Asystent",
  "admin.audit.col.startedBy": "Uruchomił",
  "admin.audit.col.decision": "Decyzja",
  "admin.audit.by.routine": "Rutyna",
  "admin.audit.by.handedOnBy": "Przekazane przez {name}",
  "admin.audit.by.handedOn": "Przekazane",
  "admin.audit.by.memory": "Źródło pamięci",
  "admin.audit.by.responsibility": "Obowiązek",
  "admin.audit.by.deployment": "Ta instalacja",
  "admin.audit.by.remote": "Przeglądarka niesparowana z komputerem",
  "admin.audit.by.person": "Osoba",
  "admin.audit.routed.mention": "Osoba wybrała tego asystenta",
  "admin.audit.routed.default": "Wysłano do domyślnego asystenta",
  "admin.audit.routed.meant":
    "Wysłano do asystenta, dla którego było przeznaczone",
  "admin.audit.toolsOf": "{offered} z {granted} narzędzi",
  "admin.audit.blocked": "Zablokowane",
  "admin.audit.didNot": "Nie doszło do skutku",
  "admin.audit.allowed": "Dozwolone",
  "admin.audit.reportedByBot": ", zgłoszone przez samego asystenta",
  "admin.audit.dryRun": "próba: zapisane, niewymuszone",
  "admin.nav.back": "Wróć do aplikacji",
  "admin.nav.overview": "Przegląd",
  "admin.nav.reach": "Do czego asystenci mają dostęp",
  "admin.nav.do": "Co asystenci mogą robić",
  "admin.nav.in": "Kto może wejść",
  "admin.nav.happened": "Co się stało",
  "admin.nav.credentials": "Dane logowania",
  "admin.nav.boundaries": "Granice",
  "admin.nav.approvals": "Zatwierdzenia",
  "admin.nav.computers": "Komputery",
  "admin.nav.plugins": "Wtyczki",
  "admin.nav.skills": "Umiejętności",
  "admin.nav.learning": "Automatyczne uczenie",
  "admin.nav.components": "Komponenty interfejsu",
  "admin.nav.playground": "Playground",
  "admin.nav.people": "Osoby",
  "admin.nav.idp": "Dostawcy tożsamości",
  "admin.nav.audit": "Audyt",
  "admin.enterprise.mode.allow_all": "Zezwalaj na cały dostęp do sieci",
  "admin.enterprise.mode.defaults_plus_allowlist":
    "Ustawienia domyślne plus lista dozwolonych zespołu",
  "admin.enterprise.mode.allowlist_only": "Tylko lista dozwolonych zespołu",
  "admin.enterprise.noPolicy":
    "Brak polityki. Komputery asystentów mogą dotrzeć do wszystkiego, na co pozwala klaster",
  "admin.enterprise.locked": " · zablokowana",
  "admin.enterprise.loadError":
    "Nie udało się wczytać ustawień firmowych. Odśwież stronę.",
  "admin.enterprise.title": "Ustawienia firmowe",
  "admin.enterprise.description":
    "Z czego mogą korzystać członkowie, jak komputery asystentów łączą się z siecią i co jest rejestrowane. Każda zmiana pojawia się w Audycie.",
  "admin.enterprise.signin.description":
    "Adresy z {env} zawsze mogą logować się przez konta społecznościowe, jako awaryjne wejście. Każde takie logowanie pojawia się w Audycie.",
  "admin.enterprise.signin.title": "Logowanie",
  "admin.enterprise.sso.title": "Wymagaj SSO",
  "admin.enterprise.sso.on":
    "Osoby mogą logować się wyłącznie przez zarejestrowanego dostawcę SAML lub OpenID Connect.",
  "admin.enterprise.sso.off":
    "Osoby mogą logować się także przez Google, Microsoft lub Okta.",
  "admin.enterprise.scim.title": "Provisioning SCIM",
  "admin.enterprise.scim.on":
    "Bazowy adres URL katalogu {url} z tokenem okaziciela {env}. Deprovisioning kończy sesje, blokuje adres, odbiera dane logowania konektorów i zatrzymuje ich komputery.",
  "admin.enterprise.scim.unsetUrl": "(ustaw BETTER_AUTH_URL)",
  "admin.enterprise.scim.off":
    "Wyłączone. Ustaw {env}, aby przyjmować provisioning z Okta, Entra lub innego katalogu.",
  "admin.enterprise.on": "Włączone",
  "admin.enterprise.off": "Wyłączone",
  "admin.enterprise.cap.description":
    "Każdy przełącznik dotyczy całej organizacji. Rola może go nadpisać, a grupa z katalogu może dostać możliwość, którą organizacja ma wyłączoną.",
  "admin.enterprise.cap.title": "Możliwości",
  "admin.enterprise.cap.offFor":
    "Wyłączona dla wszystkich, chyba że rola lub grupa ją włączy.",
  "admin.enterprise.over.title": "Wyjątki dla ról i grup",
  "admin.enterprise.over.none": "Brak. Wszyscy mają przełączniki powyżej",
  "admin.enterprise.over.set": "{count} ustawionych",
  "admin.enterprise.net.description":
    "Gdzie komputery asystentów mogą się łączyć. Zmiany docierają do działających komputerów w ciągu kilku sekund, bez restartu. Polityka grupy zastępuje politykę organizacji, chyba że ta jest zablokowana.",
  "admin.enterprise.net.title": "Sieć",
  "admin.enterprise.net.org": "Organizacja",
  "admin.enterprise.net.group": "Grupa: {name}",
  "admin.enterprise.net.addGroup": "Dodaj politykę grupy",
  "admin.enterprise.mcp.description":
    "Gdy lista dozwolonych jest włączona, asystenci mogą wywoływać narzędzia tylko na serwerach MCP zatwierdzonych tutaj. Wywołania do każdego innego serwera są odrzucane.",
  "admin.enterprise.mcp.title": "Serwery MCP",
  "admin.enterprise.mcp.only": "Tylko zatwierdzone serwery",
  "admin.enterprise.mcp.approved": "{count} zatwierdzonych",
  "admin.enterprise.mcp.offDesc":
    "Wyłączone. Asystenci mogą korzystać z każdego zarejestrowanego serwera, do którego mają dostęp.",
  "admin.enterprise.mcp.onlyAria": "Tylko zatwierdzone serwery MCP",
  "admin.enterprise.mcp.approveAria": "Zatwierdź {name}",
  "admin.enterprise.models.description":
    "Wbudowany asystent działa na {model}. Zdalny asystent wybiera własny, a model, który zgłasza, jest rejestrowany.",
  "admin.enterprise.models.configured":
    "modelu skonfigurowanym w tej instalacji",
  "admin.enterprise.models.title": "Modele",
  "admin.enterprise.models.allowlist": "Lista dozwolonych modeli",
  "admin.enterprise.models.allowlistOn":
    "Wbudowany asystent na modelu spoza listy zostaje odrzucony, zanim się uruchomi.",
  "admin.enterprise.models.allowlistOff":
    "Wyłączona. Można używać dowolnego modelu.",
  "admin.enterprise.models.allowed": "Dozwolone modele",
  "admin.enterprise.models.none": "Brak na liście",
  "admin.enterprise.models.listDesc":
    "Jeden model w wierszu, w postaci dostawca/model, na przykład {example}.",
  "admin.enterprise.rec.description":
    "Ustaw {env}, aby przesyłać strumieniowo zdarzenia audytu i akcje asystentów do twojego kolektora OpenTelemetry lub SIEM. Mają znacznik {tag}.",
  "admin.enterprise.rec.title": "Rejestrowanie i eksport",
  "admin.enterprise.rec.action": "Action Recording",
  "admin.enterprise.rec.actionOn":
    "Polecenia powłoki uruchamiane przez asystentów są rejestrowane bez sekretów i przechowywane przez {days} dni.",
  "admin.enterprise.rec.actionOff":
    "Wyłączone. Polecenia widać tylko w Audycie.",
  "admin.enterprise.rec.otel": "Eksport OpenTelemetry",
  "admin.enterprise.rec.otelOn": "Eksport przez OTLP/HTTP.",
  "admin.enterprise.rec.otelOff":
    "Nie skonfigurowano. Ustaw {env} na serwerze.",
  "admin.enterprise.comp.description":
    "Zatrzymanie komputera kończy działających na nim asystentów i zachowuje jego dysk. Asystent dostaje świeży komputer w następnej sesji. Aby zatrzymać komputery jednej osoby, przejdź do Osób.",
  "admin.enterprise.comp.title": "Komputery",
  "admin.enterprise.comp.stopInactive": "Zatrzymuj nieaktywne komputery",
  "admin.enterprise.comp.afterDays": "Po {days} dniach bez użycia",
  "admin.enterprise.usage.error":
    "Nie udało się wczytać użycia modeli. Odśwież stronę.",
  "admin.enterprise.usage.empty":
    "Brak uruchomień asystentów w ostatnich 30 dniach.",
  "admin.enterprise.usage.runs":
    "{runs} uruchomień w ciągu 30 dni · {who}: {people}",
  "admin.enterprise.usage.person": "osoba",
  "admin.enterprise.usage.people": "osób",
  "admin.enterprise.usage.refused": " · {count} spoza listy dozwolonych",
  "admin.enterprise.recorded.error":
    "Nie udało się wczytać zarejestrowanych akcji. Odśwież stronę.",
  "admin.enterprise.recorded.empty":
    "Nie zarejestrowano jeszcze żadnych poleceń.",
  "admin.enterprise.recorded.local": "Komputer członka",
  "admin.enterprise.recorded.bot": "Asystent {id}",
  "admin.enterprise.sweep.stopping": "Zatrzymywanie…",
  "admin.enterprise.sweep.now": "Zatrzymaj teraz nieaktywne komputery",
  "admin.enterprise.sweep.stopped": "Zatrzymano: {count}.",
  "admin.enterprise.ov.admins": "Administratorzy",
  "admin.enterprise.ov.members": "Członkowie",
  "admin.enterprise.ov.group": "Grupa: {name}",
  "admin.enterprise.ov.scope": "Zakres",
  "admin.enterprise.ov.groupNote":
    "Grupa może tylko dodawać. Przyznanie daje jej członkom możliwość, nawet gdy organizacja ma ją wyłączoną.",
  "admin.enterprise.ov.roleNote":
    "Ustawienie roli zastępuje przełącznik organizacji dla wszystkich z tą rolą.",
  "admin.enterprise.ov.forScope": "{title} dla: {scope}",
  "admin.enterprise.ov.inherit": "Dziedzicz",
  "admin.enterprise.ov.grant": "Przyznaj",
  "admin.enterprise.netd.org": "Polityka sieciowa organizacji",
  "admin.enterprise.netd.group": "Polityka sieciowa grupy",
  "admin.enterprise.netd.groupLabel": "Grupa",
  "admin.enterprise.netd.mode": "Tryb",
  "admin.enterprise.netd.allowlist": "Lista dozwolonych",
  "admin.enterprise.netd.help":
    "Po jednym w wierszu. Domena obejmuje swoje subdomeny. *.nazwa obejmuje tylko subdomeny. Zakres IP może wymieniać porty. Domyślnie jest {first} i {more} innych hostów pakietów i źródeł.",
  "admin.enterprise.netd.lock":
    "Zablokuj, aby grupy nie mogły zastąpić tej polityki",
  "admin.enterprise.netd.remove": "Usuń politykę",
  "admin.enterprise.days.label": "Dni bez użycia",
  "admin.enterprise.days.help": "0 wyłącza. Sprawdzane co godzinę.",
  "admin.plugins.title": "Wtyczki",
  "admin.plugins.description":
    "Do czego ta instalacja może dotrzeć i którzy asystenci mogą z tego korzystać. Dodana wtyczka jest dla wszystkich. Na jej stronie wybierasz, którzy asystenci dostają jej narzędzia.",
  "admin.plugins.loadError": "Nie udało się wczytać wtyczek. Odśwież stronę.",
  "admin.plugins.connected.description":
    "Dodane dla wszystkich. Otwórz jedną, aby ją skonfigurować i wybrać, którzy asystenci dostają jej narzędzia.",
  "admin.plugins.connected.title": "Połączone",
  "admin.plugins.connected.empty":
    "Nic jeszcze nie jest połączone. Wybierz jedną z listy poniżej.",
  "admin.plugins.explore.description":
    "Sprawdzone serwery własne. Otwórz jeden, aby go dodać.",
  "admin.plugins.explore.title": "Przeglądaj wtyczki",
  "admin.plugins.explore.empty": "Wszystkie wtyczki z katalogu są połączone.",
  "admin.plugins.notAdded": "Nie dodano",
  "admin.plugins.more.title": "Więcej aplikacji",
  "admin.plugins.sum.notConnected": "Nie połączono",
  "admin.plugins.sum.noTools": "Jeszcze bez narzędzi",
  "admin.plugins.sum.tools": {
    one: "{count} narzędzie",
    few: "{count} narzędzia",
    many: "{count} narzędzi",
    other: "{count} narzędzi",
  },
  "admin.plugins.sum.toolsNoBots": "{tools} · bez asystentów",
  "admin.plugins.sum.bots": {
    one: "{count} asystent",
    few: "{count} asystentów",
    many: "{count} asystentów",
    other: "{count} asystentów",
  },
  "admin.plugins.requests": {
    one: "{count} prośba",
    few: "{count} prośby",
    many: "{count} próśb",
    other: "{count} próśb",
  },
  "admin.plugins.key.grant.none": "Brak asystentów",
  "admin.plugins.key.grant.one": "1 asystent",
  "admin.plugins.key.grant.all": "Wszyscy asystenci",
  "admin.plugins.key.grant.some": "{held} z {total} asystentów",
  "admin.plugins.key.held.none": "Brak narzędzi",
  "admin.plugins.key.held.one": "1 narzędzie",
  "admin.plugins.key.held.all": "Wszystkie narzędzia",
  "admin.plugins.key.held.some": "{held} z {total} narzędzi",
  "admin.plugins.key.notApproved": "Niezatwierdzone",
  "admin.plugins.key.unreadableTitle": "Twoje konto",
  "admin.plugins.key.unreadable":
    "Nie udało się sprawdzić, czy twoje konto zostało tu połączone. Odśwież stronę lub sprawdź logi tej instalacji, jeśli to się powtarza.",
  "admin.plugins.key.noConsent":
    "{product} nie dostał z powrotem linku do zgody, więc nic nie zostało połączone. Spróbuj ponownie lub sprawdź konfigurację tego konektora, jeśli to się powtarza.",
  "admin.plugins.key.reassurance":
    "Konfiguracja jest kompletna bez niego, a on sięga tylko do twoich dokumentów.",
  "admin.plugins.key.notPlugin.description":
    "Nie ma wtyczki o tej nazwie, ani tutaj, ani w katalogu.",
  "admin.plugins.key.notPlugin.title": "To nie jest wtyczka",
  "admin.plugins.key.notPlugin.empty": "Nie ma czego konfigurować.",
  "admin.plugins.key.enable.title": "Włącz dla tej instalacji",
  "admin.plugins.key.enable.on":
    "Asystenci mogą dostać jej narzędzia. Wyłączenie usuwa ją i odbiera każdemu asystentowi dostęp do jej narzędzi.",
  "admin.plugins.key.enable.off":
    "Żaden asystent nie może dotrzeć do tego dostawcy. Włącz, aby ją skonfigurować i dać asystentom jej narzędzia.",
  "admin.plugins.key.enable.aria": "Włącz {title} dla tej instalacji",
  "admin.plugins.key.whose.title": "Czyje konto",
  "admin.plugins.key.whose.shared": "Jedno wspólne konto dla wszystkich.",
  "admin.plugins.key.whose.personal": "Każda osoba łączy własne.",
  "admin.plugins.key.whose.makePersonal": "Zmień na osobiste",
  "admin.plugins.key.whose.makeShared": "Zmień na wspólne",
  "admin.plugins.key.conn.oauth":
    "Ten dostawca odpowiada jako osoba, która pyta. Instalacja rejestruje klienta OAuth, a każda osoba łączy własne konto. Asystent widzi tylko to, co może zobaczyć ta osoba.",
  "admin.plugins.key.conn.secret":
    "Ten dostawca odpowiada jako osoba, która pyta. Każda osoba wkleja własne hasło aplikacji na swojej stronie Połączenia. Nie ma tu nic do rejestrowania, a instalacja nie przechowuje żadnego własnego hasła.",
  "admin.plugins.key.conn.builtin":
    "Wbudowane w tę instalację. Nie ma dostawcy, do którego trzeba dotrzeć, ani danych logowania do przechowywania. Wywołanie działa jako osoba, która o nie poprosiła.",
  "admin.plugins.key.conn.bearer":
    "To, co ta instalacja wysyła do dostawcy. Jedne dane logowania dla wszystkich.",
  "admin.plugins.key.conn.title": "Połączenie",
  "admin.plugins.key.builtin.desc":
    "Nie ma nic do skonfigurowania. Te narzędzia działają wewnątrz tej instalacji, na jej własnych danych.",
  "admin.plugins.key.builtin.badge": "Wbudowane",
  "admin.plugins.key.secret.title": "Hasło aplikacji",
  "admin.plugins.key.secret.desc":
    "Każda osoba tworzy własne w Google i wkleja je na swojej stronie Połączenia. Daje dostęp do całej skrzynki, więc to, co asystenci mogą robić, zależy od narzędzi, które przyznasz poniżej.",
  "admin.plugins.key.secret.badge": "Dla każdej osoby",
  "admin.plugins.key.reach.title": "Jak się do tego dociera",
  "admin.plugins.key.token.title": "Token dostępu",
  "admin.plugins.key.token.desc":
    "Wysyłany z każdym wywołaniem do tego dostawcy.",
  "admin.plugins.key.saved": "Zapisano",
  "admin.plugins.key.notSet": "Nie ustawiono",
  "admin.plugins.key.client.title": "Klient OAuth",
  "admin.plugins.key.client.selfDesc":
    "Ta instalacja sama rejestruje się u dostawcy przy pierwszym połączeniu. Nie ma nic do wklejenia.",
  "admin.plugins.key.client.selfBadge": "Samorejestrujący się",
  "admin.plugins.key.client.desc":
    "Identyfikuje tę instalację wobec dostawcy. Sam nie może dotrzeć do niczyich dokumentów.",
  "admin.plugins.key.client.registered": "Zarejestrowany",
  "admin.plugins.key.client.notRegistered": "Nie zarejestrowano",
  "admin.plugins.key.team.connected":
    "Połączono{who}. Każdy asystent z tymi narzędziami działa jako to konto.",
  "admin.plugins.key.team.as": " jako {name}",
  "admin.plugins.key.team.by": " przez {name}",
  "admin.plugins.key.team.disconnected":
    "Nie połączono żadnego konta zespołu. Asystenci z tymi narzędziami są odrzucani.",
  "admin.plugins.key.team.heading": "Konto zespołu",
  "admin.plugins.key.team.notice":
    "Zaloguj się na konto zespołu, nie na własne.",
  "admin.plugins.key.mine.connected":
    "Połączono. Asystent z tymi narzędziami używa twojego konta {title} jako ciebie. {note}",
  "admin.plugins.key.mine.tryConnect":
    "Połącz własne konto, aby wypróbować ten konektor. {note}",
  "admin.plugins.key.oauthAcct.connected":
    "Połączono. Asystent z tymi narzędziami używa twojego konta {title} jako ciebie. Wszyscy pozostali łączą własne.",
  "admin.plugins.key.oauthAcct.connect":
    "Połącz własne konto, aby wypróbować ten konektor. Konfiguracja jest kompletna bez niego, a on sięga tylko do twoich dokumentów.",
  "admin.plugins.key.connected": "Połączono",
  "admin.plugins.key.connect": "Połącz",
  "admin.plugins.key.instance.title": "Host instancji",
  "admin.plugins.key.instance.desc":
    "Ten dostawca daje każdemu klientowi własną nazwę hosta. Przed zapisaniem jest sprawdzana ze wzorcem dostawcy.",
  "admin.plugins.key.docs.builtin": "Dokumentacja",
  "admin.plugins.key.docs.vendor": "Dokumentacja dostawcy",
  "admin.plugins.key.docs.builtinDesc":
    "Co oferują te narzędzia, od osób, które je utrzymują.",
  "admin.plugins.key.docs.vendorDesc":
    "Co oferuje ten serwer, od osób, które go utrzymują.",
  "admin.plugins.key.redirect.dynamic":
    "Instalacja sama rejestruje swój URI przekierowania. U dostawcy nie ma nic do dodania.",
  "admin.plugins.key.redirect.manual":
    "Dodaj to do autoryzowanych URI przekierowania klienta u dostawcy, dokładnie tak, jak napisano. Jeden zły znak powoduje tam błąd, z komunikatem, który nie wspomina o {product}.",
  "admin.plugins.key.redirect.noUrl":
    "Ta instalacja nie ma publicznego adresu URL, więc nikt nie może dokończyć łączenia. Ustaw {env}.",
  "admin.plugins.key.tools.refresh": "Odśwież narzędzia",
  "admin.plugins.key.tools.grant": "Przyznaj narzędzia…",
  "admin.plugins.key.tools.description":
    "Asystent widzi tylko narzędzia, które dostał. Każde wywołanie jest sprawdzane w chwili, gdy następuje, więc odebranie dostępu działa od następnego wywołania.",
  "admin.plugins.key.tools.title": "Narzędzia",
  "admin.plugins.key.tools.empty":
    "Brak narzędzi na liście. Odśwież narzędzia, aby sprawdzić ponownie.",
  "admin.plugins.key.tools.writes": "zmienia dane",
  "admin.plugins.key.tools.reads": "odczytuje",
  "admin.plugins.key.byBot": "Według asystenta",
  "admin.plugins.key.byBot.hidden":
    "Ukryta na twojej liście. Włączaj lub wyłączaj akcje tej aplikacji po jednej.",
  "admin.plugins.key.byBot.shown":
    "Włączaj lub wyłączaj akcje tej aplikacji po jednej.",
  "admin.plugins.key.gone.description":
    "Ten dostawca już ich nie wymienia. Żaden asystent ich nie widzi i żaden nie może ich wywołać. Dostęp nadal jest zapisany i wraca, jeśli dostawca znów wymieni to narzędzie. Aby go usunąć, użyj strony samego asystenta.",
  "admin.plugins.key.gone.title": "Przyznane, ale już niewymieniane",
  "admin.plugins.key.gone.row": "{title} tego nie wymienia{asOf}.",
  "admin.plugins.key.gone.asOf": " według ostatniego odświeżenia",
  "admin.plugins.key.dlg.client": "Klient OAuth dla {title}",
  "admin.plugins.key.dlg.instance": "Host instancji dla {title}",
  "admin.plugins.key.dlg.token": "Token dostępu dla {title}",
  "admin.plugins.key.dlg.clientDesc":
    "Z konsoli dostawcy. Sekret jest zapisywany w sejfie tej instalacji i nigdy więcej nie jest pokazywany.",
  "admin.plugins.key.dlg.instanceDesc":
    "Twoja własna nazwa hosta u tego dostawcy. Przed zapisaniem jest sprawdzana ze wzorcem dostawcy.",
  "admin.plugins.key.dlg.tokenDesc":
    "Zapisywany w sejfie tej instalacji i nigdy więcej nie pokazywany.",
  "admin.plugins.key.dlg.clientId": "ID klienta",
  "admin.plugins.key.dlg.clientSecret": "Sekret klienta",
  "admin.plugins.key.gr.title": "Przyznaj narzędzia",
  "admin.plugins.key.gr.description":
    "Każde przyznanie to osobny wiersz w Audycie. Narzędzia, które zmieniają dane, są przy każdym wywołaniu nadal sprawdzane względem granic.",
  "admin.plugins.key.gr.to": "Komu",
  "admin.plugins.key.gr.reads": "Odczytuje",
  "admin.plugins.key.gr.writes": "Zmienia dane",
  "admin.plugins.key.gr.selectAll": "Zaznacz wszystko",
  "admin.plugins.key.gr.button": "Przyznaj",
  "admin.plugins.key.gr.progress": "Przyznawanie {current} z {total}…",
  "admin.plugins.key.gr.summary": {
    one: "Przyznaj {count} narzędzie: {names}.",
    few: "Przyznaj {count} narzędzia: {names}.",
    many: "Przyznaj {count} narzędzi: {names}.",
    other: "Przyznaj {count} narzędzi: {names}.",
  },
  "admin.plugins.key.gr.changing": {
    one: "{count} zmienia dane.",
    few: "{count} zmieniają dane.",
    many: "{count} zmienia dane.",
    other: "{count} zmienia dane.",
  },
  "admin.home.reach.desc":
    "Czego asystent może dotykać poza {product} i jakie obowiązują go ograniczenia.",
  "admin.home.credentials.desc": "Klucze i tokeny tej instalacji.",
  "admin.home.boundaries.desc":
    "Rzeczy, których żaden asystent nigdy nie może robić.",
  "admin.home.approvals.desc":
    "O co asystenci członków muszą zapytać, zanim zadziałają.",
  "admin.home.computers.desc":
    "Maszyny, na których asystenci uruchamiają narzędzia.",
  "admin.home.do.desc":
    "Aplikacje, umiejętności i elementy interfejsu, z których może korzystać każdy asystent.",
  "admin.home.plugins.desc":
    "Usługi, do których {product} może dotrzeć, i którzy asystenci mogą z nich korzystać.",
  "admin.home.skills.desc":
    "Nazwane instrukcje, które każdy może uruchomić przez /.",
  "admin.home.learning.desc":
    "Ucz się z zakończonych rozmów i przeglądaj umiejętności, które proponuje.",
  "admin.home.components.desc":
    "Własne elementy, które asystent może narysować w rozmowie.",
  "admin.home.playground.desc":
    "Napisz komponent i patrz, jak się rysuje, gdy piszesz.",
  "admin.home.engines.desc":
    "Silniki AI, na których działają członkowie, i czy każdy może teraz odpowiadać.",
  "admin.home.people.desc":
    "Wszyscy, którzy się zalogowali, kim są administratorzy i komu odebrano dostęp.",
  "admin.home.enterprise.desc":
    "Role i grupy, wymagane SSO, SCIM, polityka sieciowa, listy dozwolonych MCP i modeli, Action Recording.",
  "admin.home.idp.desc":
    "Dostawca SAML lub OpenID Connect twojej firmy, dopasowywany po domenie e-mail.",
  "admin.home.audit.desc": "Każda akcja wykonana w {product} i kto ją wykonał.",
  "admin.home.description":
    "Ustawienia dla wszystkich w tej instalacji. Zmiana tutaj dotyczy każdej osoby i każdego asystenta.",
  "admin.plugins.directoryError":
    "Nie udało się wczytać ustawień wtyczek. Odśwież stronę.",
  "admin.components.description":
    "Czym może odpowiadać każdy asystent. Każdy opublikowany komponent jest włączony dla każdego asystenta. Wyłącz jeden, a ten asystent nigdy go nie zobaczy. Zmiany i odmowy pojawiają się w Audycie.",
  "admin.components.loadError":
    "Nie udało się wczytać komponentów. Odśwież stronę.",
  "admin.components.emptyTitle": "Jeszcze nie ma komponentów",
  "admin.components.emptyDesc":
    "Komponenty, z których mogą korzystać twoi asystenci, pojawią się tutaj.",
  "admin.audit.silence.quiet": "Cisza przez {seconds} s",
  "admin.audit.silence.nothing": "{quiet}, bez powiedzenia czegokolwiek",
  "admin.audit.silence.after": {
    one: "{quiet}, po {count} fragmencie",
    few: "{quiet}, po {count} fragmentach",
    many: "{quiet}, po {count} fragmentach",
    other: "{quiet}, po {count} fragmentach",
  },
  "admin.compDetail.title": "Komponenty",
  "admin.compDetail.noSuch.title": "Nie ma takiego komponentu",
  "admin.compDetail.noSuch.description": "Nie ma komponentu o tej nazwie.",
  "admin.compDetail.noSuch.hint":
    "Mógł zostać przemianowany albo ta instalacja już go nie zawiera.",
  "admin.compDetail.back": "Wróć do komponentów",
  "admin.compDetail.grant.noBots": "Nie ma jeszcze asystentów",
  "admin.compDetail.grant.all": {
    one: "Wszyscy asystenci ({count})",
    few: "Wszyscy asystenci ({count})",
    many: "Wszyscy asystenci ({count})",
    other: "Wszyscy asystenci ({count})",
  },
  "admin.compDetail.grant.none": "Brak asystentów",
  "admin.compDetail.grant.some": "{granted} z {total} asystentów",
  "admin.compDetail.fn.none": "Ta instalacja nie ma funkcji danych",
  "admin.compDetail.fn.nothing":
    "Nic. Pokazuje tylko to, co przekaże mu asystent.",
  "admin.compDetail.notPublished":
    "Nieopublikowany. Żaden asystent go nie widzi.",
  "admin.compDetail.config.title": "Konfiguracja",
  "admin.compDetail.config.description":
    "Do czego służy ten komponent i którzy asystenci mogą z niego odpowiadać.",
  "admin.compDetail.notInBuild.title": "Nie ma go w tej wersji",
  "admin.compDetail.notInBuild.description":
    "{product} nie potrafi go narysować. Poniższe ustawienia nie mają żadnego skutku.",
  "admin.compDetail.published": "Opublikowany",
  "admin.compDetail.published.on": "Asystenci mogą z niego odpowiadać.",
  "admin.compDetail.published.off": "Żaden asystent nie może go używać.",
  "admin.compDetail.published.changes": "Opis ma nieopublikowane zmiany.",
  "admin.compDetail.description": "Opis",
  "admin.compDetail.nothingYet": "Jeszcze nic",
  "admin.compDetail.availableTo": "Dostępny dla",
  "admin.compDetail.canRead": "Może czytać",
  "admin.compDetail.details": "Szczegóły",
  "admin.compDetail.kind": "Rodzaj",
  "admin.compDetail.calledAs": "Wywoływany jako",
  "admin.compDetail.lastChanged": "Ostatnia zmiana",
  "admin.compDetail.by": "przez {name}",
  "admin.compDetail.descDlg.description":
    "To, co model czyta, gdy decyduje, czy go użyć. Nie ma to skutku, dopóki komponent nie zostanie opublikowany.",
  "admin.compDetail.grantsDlg.description":
    "Wyłącz asystenta, a nigdy nie dowie się, że ten komponent istnieje. Zmiany działają od razu.",
  "admin.compDetail.grantsDlg.empty": "Nie ma jeszcze asystentów.",
  "admin.compDetail.fnDlg.description":
    "Dane, które ten komponent może pobrać, żeby się narysować. To coś innego niż „Dostępny dla”. Gdy wszystkie są wyłączone, pokazuje tylko to, co przekaże mu asystent. Każdy odczyt widać w Audycie. Zmiany działają od razu.",
  "admin.compDetail.fnDlg.empty": "Ta instalacja nie ma funkcji danych.",
  "admin.computers.description":
    "Przeglądarka każdego asystenta i profil, który zachowuje. Profil utrzymuje zalogowanie asystenta. Jego zresetowanie wylogowuje asystenta ze wszystkiego.",
  "admin.computers.loadError":
    "Nie udało się wczytać komputerów. Odśwież stronę.",
  "admin.computers.shared.lead": "Wszyscy asystenci dzielą jeden komputer.",
  "admin.computers.shared.before":
    "Dzielą jego logowania, pliki i sesję. Asystent może dotrzeć do tego, do czego zalogował się inny. Ustaw",
  "admin.computers.shared.after": "aby dać każdemu asystentowi własny.",
  "admin.computers.perBot":
    "Każdy asystent ma własny komputer, z własnym kontenerem, plikami i profilem przeglądarki.",
  "admin.computers.list.title": "Komputery w tej instalacji",
  "admin.computers.list.error": "Nie udało się wczytać listy.",
  "admin.computers.list.empty":
    "Nie ma jeszcze komputerów. Pierwszy pojawi się, gdy asystent po raz pierwszy otworzy stronę.",
  "admin.computers.running": "Przeglądarka działa od {time}",
  "admin.computers.notRunning":
    "Żadna przeglądarka nie działa. Uruchomi się, gdy asystent znów jej potrzebuje.",
  "admin.computers.egress.unknown": "Ruch wychodzący niezgłoszony",
  "admin.computers.egress.direct": "Wychodzi bezpośrednio",
  "admin.computers.egress.via": "Wychodzi przez {egress}",
  "admin.computers.updateAvailable": "Dostępna aktualizacja",
  "admin.computers.update": "Zaktualizuj komputer",
  "admin.computers.working": "Trwa praca…",
  "admin.computers.stop": "Zatrzymaj przeglądarkę",
  "admin.computers.reset": "Zresetuj",
  "admin.computers.resetTitle": "Zresetować komputer asystenta {name}?",
  "admin.computers.resetDesc":
    "Jego profil zostanie usunięty. Asystent zostanie wylogowany ze wszystkich usług i zacznie od zera. Tego nie można cofnąć.",
  "admin.computers.resetting": "Resetowanie…",
  "admin.computers.resetIt": "Zresetuj go",
  "admin.computers.updateTitle": "Zaktualizować komputer asystenta {name}?",
  "admin.computers.updateDesc":
    "Przechodzi na obraz komputera, którego ta instalacja używa teraz. Jego pliki i logowania zostają zachowane. Jeśli działa, uruchamia się ponownie i przerywa to, co robi.",
  "admin.computers.updating": "Aktualizowanie…",
  "admin.computers.updateIt": "Zaktualizuj go",
  "admin.computers.foot.stopLead": "Zatrzymaj",
  "admin.computers.foot.stopRest":
    "zamyka przeglądarkę i zachowuje jej logowania. Uruchomi się ponownie, gdy asystent znów jej potrzebuje.",
  "admin.computers.foot.resetLead": "Zresetuj",
  "admin.computers.foot.resetRest":
    "usuwa profil i wylogowuje asystenta ze wszystkiego.",
  "admin.computers.foot.updateLead": "Zaktualizuj komputer",
  "admin.computers.foot.updateRest":
    "pojawia się, gdy komputer działa na starszym obrazie. Przenosi komputer na nowy i zachowuje jego pliki i logowania.",
  "admin.computers.foot.audit": "Wszystkie trzy widać w",
  "admin.computers.host.description":
    "Wybierz foldery, które asystent może czytać na tym komputerze. Aplikacja desktopowa pyta przed każdą zmianą lub poleceniem. Dostęp kończy się, gdy zatrzymasz {product}.",
  "admin.computers.host.title": "Foldery na tym komputerze",
  "admin.computers.host.offline":
    "Aplikacja desktopowa jest offline. Otwórz ją, aby zatwierdzić foldery lub uruchomić polecenia.",
  "admin.computers.host.noBots":
    "Nie ma jeszcze asystentów. Utwórz jednego, a potem wybierz jego foldery.",
  "admin.computers.host.choose": "Wybierz folder",
  "admin.computers.host.waiting": "Czekam…",
  "admin.computers.host.readOnlyNote":
    "Foldery są tylko do odczytu. Gdy asystent musi zapisać, aplikacja desktopowa najpierw zapyta Ciebie.",
  "admin.computers.host.stopAccess": "Zatrzymaj dostęp do folderów",
  "admin.computers.host.stopping": "Zatrzymywanie…",
  "admin.computers.host.viewAudit": "Zobacz audyt",
  "admin.computers.host.readOnly": "Tylko do odczytu",
  "admin.computers.host.revoke": "Odwołaj",
  "admin.computers.host.revoking": "Odwoływanie…",
  "admin.computers.host.pendingFrom": "{label} od {owner}.",
  "admin.computers.host.pendingFromFor": "{label} od {owner} dla {name}.",
  "admin.computers.host.folders": {
    one: "{count} folder tylko do odczytu",
    few: "{count} foldery tylko do odczytu",
    many: "{count} folderów tylko do odczytu",
    other: "{count} folderów tylko do odczytu",
  },
  "admin.computers.host.requests": {
    one: "{count} oczekująca prośba",
    few: "{count} oczekujące prośby",
    many: "{count} oczekujących próśb",
    other: "{count} oczekujących próśb",
  },
  "admin.computers.host.none": "Żaden folder nie jest zatwierdzony.",
  "admin.computers.host.owner": "właściciel komputera",
  "admin.computers.host.p.write":
    "Zmiana pliku czeka na zatwierdzenie lub zakończenie",
  "admin.computers.host.p.run":
    "Polecenie czeka na zatwierdzenie lub zakończenie",
  "admin.computers.host.p.list": "Wypisywanie plików",
  "admin.computers.host.p.read": "Czytanie pliku",
  "admin.computers.host.p.stop": "Zatrzymywanie pracy na folderach",
  "admin.computers.host.p.default": "Dostęp do folderów czeka na zatwierdzenie",
  "admin.learning.description":
    "Ucz się z zakończonych rozmów, przeglądaj umiejętności proponowane przez Intelligence i przekazuj opublikowane umiejętności asystentom.",
  "admin.learning.auto.assigned":
    "{product} automatycznie przypisał kontener „{container}” do tego projektu Intelligence. Możesz go tu zmienić.",
  "admin.learning.auto.absent":
    "Ten projekt Intelligence nie ma jeszcze kontenera Learning „{container}”. Nic nie jest zbierane.",
  "admin.learning.auto.notEntitled":
    "Plan tego projektu Intelligence nie obejmuje Learning. Nie przypisano żadnego kontenera.",
  "admin.learning.auto.unavailable":
    "Nie udało się połączyć z Intelligence, aby znaleźć kontener Learning tego projektu. {product} spróbuje ponownie.",
  "admin.learning.target.container": "ID kontenera: {label}",
  "admin.learning.target.revision": "Dokładna rewizja (opcjonalnie)",
  "admin.learning.target.revisionAria": "Rewizja: {label}",
  "admin.learning.target.latest": "Ostatnio opublikowana",
  "admin.learning.create.busy": "Tworzenie…",
  "admin.learning.create.button": "Utwórz kontener {container}",
  "admin.learning.create.note":
    "Używa danych logowania tej instalacji, nie klucza środowiska uruchomieniowego.",
  "admin.learning.create.how": "Aby go utworzyć: ",
  "admin.learning.part.title": "Udział",
  "admin.learning.part.description":
    "Zmiany kontenera dotyczą nowych rozmów. Istniejące zachowują swój pierwszy kontener. Kontenery muszą już istnieć w tym samym projekcie Intelligence. Dopóki tu nie zapiszesz, {product} używa kontenera openbot tego projektu.",
  "admin.learning.part.loading": "Wczytywanie ustawień Learning…",
  "admin.learning.part.turnOn":
    "Włącz automatyczne uczenie i dostarczanie umiejętności",
  "admin.learning.part.default": "Domyślny",
  "admin.learning.part.hint":
    "Bez domyślnego kontenera asystenci bez własnego są pomijani. ID ma od 1 do 64 małych liter, cyfr i pojedynczych łączników. Zostaw rewizję pustą, aby używać najnowszych opublikowanych umiejętności.",
  "admin.learning.part.perBot": "Udział poszczególnych asystentów",
  "admin.learning.part.botListError":
    "Nie udało się wczytać listy asystentów. Zapisane ustawienia każdego asystenta są poniżej.",
  "admin.learning.part.botAria": "Udział: {name}",
  "admin.learning.part.inherit": "Użyj domyślnego ustawienia instalacji",
  "admin.learning.part.exclude": "Pomiń w Learning",
  "admin.learning.part.container": "Użyj konkretnego kontenera",
  "admin.learning.part.saving": "Zapisywanie…",
  "admin.learning.part.save": "Zapisz ustawienia Learning",
  "admin.learning.part.saved": "Ustawienia zapisane.",
  "admin.learning.rev.title": "Przejrzyj i opublikuj",
  "admin.learning.rev.description":
    "Intelligence analizuje zakończone rozmowy i proponuje umiejętności. Przejrzyj je i opublikuj w Intelligence. Asystenci używają tylko opublikowanych umiejętności.",
  "admin.learning.rev.showFor": "Pokaż kontener dla",
  "admin.learning.rev.default": "Domyślny dla instalacji",
  "admin.learning.rev.checking": "Sprawdzanie Intelligence…",
  "admin.learning.rev.invalid":
    "Wybrany kontener lub jego instrumentacja jest niedostępna.",
  "admin.learning.rev.selection":
    "Wybierz asystenta albo ustaw domyślny kontener.",
  "admin.learning.rev.none": "Nie przypisano żadnego kontenera Learning.",
  "admin.learning.rev.threads": "Gotowe wątki",
  "admin.learning.rev.candidates": "Kandydaci do przejrzenia",
  "admin.learning.rev.published": "Opublikowane umiejętności",
  "admin.learning.rev.insights": "Wnioski",
  "admin.learning.rev.running": "Trwa analiza.",
  "admin.learning.rev.latest": "Ostatnia analiza: {status}.",
  "admin.learning.rev.noRun": "Nie uruchomiono jeszcze żadnej analizy.",
  "admin.learning.rev.manage": "Zarządzaj Learning w Intelligence",
  "admin.learning.rev.reviewCandidates": "Przejrzyj kandydatów na umiejętności",
  "admin.learning.rev.viewRuns": "Zobacz uruchomienia analiz",
  "admin.learning.del.title": "Dostarczanie umiejętności",
  "admin.learning.del.checking": "Sprawdzanie dostarczania…",
  "admin.learning.del.off": "Dostarczanie jest wyłączone dla tego asystenta.",
  "admin.learning.del.waiting":
    "Czekam na pierwszą zweryfikowaną migawkę umiejętności.",
  "admin.learning.del.stale":
    "Używana jest ostatnia zweryfikowana migawka. Odświeżenie oczekuje.",
  "admin.learning.del.ok": "Dostępna jest zweryfikowana migawka.",
  "admin.learning.del.revision": "Wczytana rewizja: {revision}",
  "admin.learning.del.lastChecked": "Ostatnie sprawdzenie:",
  "admin.learning.rev.refresh": "Odśwież status",
  "admin.learning.rev.footer":
    "Zarządzanie Learning wymaga Twojego konta Intelligence i dostępu do projektu. {product} trzyma dane logowania projektu na serwerze. Wyłączenie tu Learning zachowuje ustawienia i przypisania rozmów. Harmonogramy i publikowanie zostają w Intelligence.",
  "admin.playground.validJson": "{label} musi być poprawnym JSON-em: {reason}",
  "admin.playground.invalidJson": "niepoprawny JSON",
  "admin.playground.notObject": "{label} musi być obiektem JSON, a nie {kind}.",
  "admin.playground.schemaLabel": "Argumenty (JSON Schema)",
  "admin.playground.sampleLabel": "Przykładowe argumenty",
  "admin.playground.fixBeforeSave": "Popraw pola JSON przed zapisaniem.",
  "admin.playground.draftSaved": "Wersja robocza zapisana.",
  "admin.playground.published": "Opublikowano.",
  "admin.playground.description":
    "Napisz komponent i opublikuj go bez ponownego wdrażania. Twoje zmiany to wersja robocza. Rozmowy pokazują tylko to, co opublikowane.",
  "admin.playground.saveDraft": "Zapisz wersję roboczą",
  "admin.playground.publish": "Opublikuj",
  "admin.playground.title": "Tytuł",
  "admin.playground.titlePlaceholder": "Karta zwrotu",
  "admin.playground.told": "Co mówi się o nim modelowi",
  "admin.playground.toldPlaceholder":
    "Pokaż zwrot z kwotą, powodem i statusem.",
  "admin.playground.preview": "Podgląd",
  "admin.playground.noSample": "Przykładowe argumenty są niedostępne.",
  "admin.playground.fixBeforePreview": "Popraw pola JSON przed podglądem.",
  "admin.playground.saved.title": "Zapisane tutaj",
  "admin.playground.saved.empty":
    "Nic jeszcze nie zapisano. Zapisz wersję roboczą, aby zobaczyć ją tutaj.",
  "admin.playground.saved.published": "opublikowany, rewizja {revision}",
  "admin.playground.saved.draftOnly":
    "tylko wersja robocza, żaden asystent nie może go narysować",
  "admin.playground.saved.edited": "edytowany po publikacji",
  "admin.playground.open": "Otwórz",
  "admin.playground.delete": "Usuń",
  "admin.playground.saved.note":
    "Publikacja udostępnia go każdemu asystentowi. Aby wyłączyć go dla jednego asystenta, zrób to na stronie Komponenty interfejsu.",
  "admin.playground.del.title": "Usunąć {name}?",
  "admin.playground.del.description":
    "Zostanie usunięty z tej instalacji i żaden asystent nie będzie mógł go narysować. Tego nie można cofnąć.",
  "admin.playground.del.confirm": "Usuń go",
  "admin.plugins.tool.title": "Narzędzie",
  "admin.plugins.tool.noTool": "Ten konektor nie ma narzędzia o tej nazwie.",
  "admin.plugins.tool.removed":
    "Mogło zostać usunięte od ostatniego odświeżenia listy narzędzi.",
  "admin.plugins.tool.notOn": "Ten konektor nie jest włączony.",
  "admin.plugins.tool.noDesc": "To narzędzie nie ma opisu.",
  "admin.plugins.tool.writeDesc":
    "To narzędzie coś zmienia u dostawcy. Dotyczą go granice dotyczące zapisów.",
  "admin.plugins.tool.readDesc":
    "To narzędzie tylko czyta. Granice dotyczące zapisów go nie dotyczą.",
  "admin.plugins.tool.what": "Co robi",
  "admin.plugins.tool.effect": "Skutek",
  "admin.plugins.tool.effectDesc":
    "Ustawia go konektor, nie nazwa narzędzia. Wszystko nieznane liczy się jako zapis.",
  "admin.plugins.tool.bots.title": "Asystenci",
  "admin.plugins.tool.bots.description":
    "Asystent może wywołać to narzędzie tylko wtedy, gdy jego przełącznik jest włączony. Wyłączenie działa od następnego wywołania.",
  "admin.plugins.tool.bots.empty":
    "Nie ma jeszcze asystentów. Utwórz jednego, aby dać mu to narzędzie.",
  "admin.plugins.tool.hidden": "Ukryty na Twojej liście.",
  "admin.plugins.tool.canCall":
    "Może wywoływać to narzędzie. Każde wywołanie jest nadal sprawdzane względem granic i zapisywane w Audycie.",
  "admin.plugins.tool.noToken":
    "Dozwolone, ale ten asystent nie ma tokena zwrotnego. Każde wywołanie jest odrzucane. Wygeneruj go na jego stronie albo ustaw AGENT_TOOL_TOKEN.",
  "admin.plugins.tool.cantCall":
    "Nie może wywoływać tego narzędzia. Asystent nigdy go nie widzi.",
  "admin.plugins.tool.aria": "Pozwól asystentowi {bot} wywoływać {tool}",
  "admin.plugins.bot.title": "Asystent",
  "admin.plugins.bot.notOn": "Żadna aplikacja o tej nazwie nie jest włączona.",
  "admin.plugins.bot.nothing": "Nie ma tu nic, co można dać asystentowi.",
  "admin.plugins.bot.notBot.title": "To nie asystent",
  "admin.plugins.bot.notBot.description": "Nie ma asystenta o tej nazwie.",
  "admin.plugins.bot.notBot.hint":
    "Mógł zostać usunięty po otwarciu tej strony.",
  "admin.plugins.bot.noDesc": "Ta akcja nie ma opisu.",
  "admin.plugins.bot.destroys": "niszczy rzeczy",
  "admin.plugins.bot.description":
    "Które akcje aplikacji {app} może wywoływać {bot}. Wyłączenie jednej działa od następnego wywołania.",
  "admin.plugins.bot.pageTitle": "{bot} i {app}",
  "admin.plugins.bot.noActions":
    "Aplikacja {app} nie wymienia żadnych akcji. Odśwież jej narzędzia, aby sprawdzić ponownie.",
  "admin.plugins.bot.searchAria": "Szukaj akcji aplikacji {app}",
  "admin.plugins.bot.searchPlaceholder": "Szukaj po nazwie akcji",
  "admin.plugins.bot.wouldHold": {
    one: "Ten asystent miałby wtedy {count} narzędzie z tej aplikacji.",
    few: "Ten asystent miałby wtedy {count} narzędzia z tej aplikacji.",
    many: "Ten asystent miałby wtedy {count} narzędzi z tej aplikacji.",
    other: "Ten asystent miałby wtedy {count} narzędzi z tej aplikacji.",
  },
  "admin.plugins.bot.turnOnReads": "Włącz wszystkie akcje tylko do odczytu",
  "admin.plugins.bot.reads.title": "Odczyty",
  "admin.plugins.bot.reads.description":
    "Te tylko czytają. Granice dotyczące zapisów ich nie dotyczą.",
  "admin.plugins.bot.reads.noMatch":
    "Nic, co tylko czyta, nie pasuje do „{query}”.",
  "admin.plugins.bot.reads.none":
    "Aplikacja {app} nie ma akcji tylko do odczytu.",
  "admin.plugins.bot.writes.title": "Coś zmienia",
  "admin.plugins.bot.writes.description":
    "Te coś zmieniają u dostawcy. Dotyczą ich granice dotyczące zapisów.",
  "admin.plugins.bot.writes.noMatch":
    "Nic, co coś zmienia, nie pasuje do „{query}”.",
  "admin.plugins.bot.writes.none":
    "Aplikacja {app} nie ma akcji, które coś zmieniają.",
  "admin.plugins.bot.shared.title":
    "Pozwolić asystentowi {bot} używać współdzielonego konta {app}?",
  "admin.plugins.bot.allowing": "Zezwalanie…",
  "admin.plugins.bot.allow": "Zezwól",
  "admin.shared.sentence.write":
    "Każdy, kto może używać tego asystenta, może to robić jako współdzielone konto.",
  "admin.shared.sentence.read":
    "Każdy, kto może używać tego asystenta, może czytać to, co to konto może czytać.",
  "admin.shared.owner": "Tylko jego właściciel",
  "admin.shared.named": "Wskazani: {who}",
  "admin.shared.team": "Wszyscy",
  "admin.shared.legend":
    "Kto może używać współdzielonego konta przez tego asystenta",
  "admin.shared.outside":
    "Wiadomości z zewnątrz (e-mail, Slack, webhooki) mogą z niego korzystać",
  "admin.shared.skipped": {
    one: "Pominięto {count} akcję wymienioną przez tę aplikację, ponieważ nazwa narzędzia może zawierać tylko litery, cyfry, podkreślenia i łączniki: ",
    few: "Pominięto {count} akcje wymienione przez tę aplikację, ponieważ nazwa narzędzia może zawierać tylko litery, cyfry, podkreślenia i łączniki: ",
    many: "Pominięto {count} akcji wymienionych przez tę aplikację, ponieważ nazwa narzędzia może zawierać tylko litery, cyfry, podkreślenia i łączniki: ",
    other:
      "Pominięto {count} akcji wymienionych przez tę aplikację, ponieważ nazwa narzędzia może zawierać tylko litery, cyfry, podkreślenia i łączniki: ",
  },
  "admin.vocab.browse": "Przeglądaj {name}",
  "admin.vocab.dirDesc.composio":
    "Kilkaset aplikacji. Każda osoba łączy własne konto.",
  "admin.vocab.dirDesc.arcade":
    "Aplikacje, których nikt tu nie sprawdzał. Każda osoba łączy własne konto.",
  "admin.vocab.readFailure":
    "Nie udało się wczytać katalogu aplikacji {name}. Odśwież stronę.",
  "admin.vocab.moreApps": "Aplikacje z {name}. Nikt tu ich nie sprawdzał.",
  "admin.vocab.notSetUp":
    "Nie skonfigurowano. Ustaw {envVar} w tej instalacji, aby przeglądać jego aplikacje.",
  "admin.vocab.connection":
    "Dostęp przez {name}, które przechowuje własne konto każdej osoby.",
  "admin.vocab.reach.description":
    "{name} przechowuje konto. Ta instalacja wysyła jeden klucz i informację, kto pyta. Każda osoba łączy własne konto, a asystent widzi tylko to, co może zobaczyć ta osoba. Nie ma tokena do wklejenia.",
  "admin.vocab.reach.badge": "Przez {name}",
  "admin.vocab.disconnect": "Rozłączenie kończy też konto w {name}.",
  "admin.vocab.trip.stem":
    "{name} zatwierdza po jednej akcji, więc nie ma czego łączyć dla całej aplikacji.",
  "admin.vocab.trip.below": "Autoryzuj poniżej akcje, których chcesz.",
  "admin.vocab.trip.settings": "Autoryzuj je w sekcji Połączenia.",
  "admin.vocab.keyMissing":
    "Ustaw {envVar} w tej instalacji. Do tego czasu tego konta nie można tu połączyć ani rozłączyć. Aplikacja pozostaje włączona, a przyznane jej narzędzia nadal obowiązują.",
  "admin.vocab.siblings": {
    one: "Rozłączenie kończy też Twój dostęp do aplikacji {names}, która współdzieli to połączenie.",
    few: "Rozłączenie kończy też Twój dostęp do aplikacji {names}, które współdzielą to połączenie.",
    many: "Rozłączenie kończy też Twój dostęp do aplikacji {names}, które współdzielą to połączenie.",
    other:
      "Rozłączenie kończy też Twój dostęp do aplikacji {names}, które współdzielą to połączenie.",
  },
  "admin.vocab.unansweredMore": {
    one: "Nie udało się sprawdzić {count} innej aplikacji, a ona też może zostać dotknięta.",
    few: "Nie udało się sprawdzić {count} innych aplikacji, a one też mogą zostać dotknięte.",
    many: "Nie udało się sprawdzić {count} innych aplikacji, a one też mogą zostać dotknięte.",
    other:
      "Nie udało się sprawdzić {count} innych aplikacji, a one też mogą zostać dotknięte.",
  },
  "admin.vocab.unansweredOnly": {
    one: "Nie udało się sprawdzić {count} aplikacji na tym połączeniu, więc rozłączenie może ją również zakończyć.",
    few: "Nie udało się sprawdzić {count} aplikacji na tym połączeniu, więc rozłączenie może je również zakończyć.",
    many: "Nie udało się sprawdzić {count} aplikacji na tym połączeniu, więc rozłączenie może je również zakończyć.",
    other:
      "Nie udało się sprawdzić {count} aplikacji na tym połączeniu, więc rozłączenie może je również zakończyć.",
  },
  "admin.vocab.join2": "{a} i {b}",
  "admin.vocab.joinMany": "{list} i {last}",
  "admin.skills.write": "Napisz umiejętność",
  "admin.skills.description":
    "Nazwane instrukcje, które każdy może uruchomić przez /. Umiejętność nie dodaje żadnego dostępu. Może tylko poprosić asystenta, aby użył tego, co już ma.",
  "admin.skills.installed.title": "Zainstalowane",
  "admin.skills.installed.description":
    "Dla wszystkich w tej instalacji. Każdy pisze własne na swojej stronie Umiejętności.",
  "admin.skills.loadError":
    "Nie udało się wczytać umiejętności. Odśwież stronę.",
  "admin.skills.empty":
    "Nie ma jeszcze umiejętności. Napisz jedną przyciskiem Napisz umiejętność.",
  "admin.skills.dlg.title": "Napisz umiejętność dla wszystkich",
  "admin.skills.dlg.description":
    "Ludzie wpisują slug po /. Asystent wykonuje wtedy instrukcje. Każdy może jej używać, a Ty wybierasz, którzy asystenci ją mają.",
  "admin.skills.slug": "Slug",
  "admin.skills.title": "Tytuł",
  "admin.skills.summary": "Podsumowanie",
  "admin.skills.summaryPlaceholder": "Jedna linia",
  "admin.skills.instructions": "Instrukcje",
  "admin.skills.instructionsPlaceholder":
    "Co asystent ma zrobić, gdy ta umiejętność jest używana.",
  "admin.skills.install": "Zainstaluj umiejętność",
  "engines.intro":
    "Silnik to to, co myśli za każdego członka. Najpierw odpowiadają Twoje własne logowania, chyba że wybierzesz inną kolejność; wszystko, co płatne, pozostaje wyłączone, dopóki tego nie powiesz.",
  "engines.loadFailed": "Nie udało się wczytać silników. Odśwież stronę.",
  "engines.fallback": "Nie udało się wyświetlić listy silników.",
  "engines.noEngines": "Nie zgłoszono jeszcze żadnych silników.",
  "engines.statesTitle": "Silniki i ich stan",
  "engines.sectionsLabel": "Sekcje silników",
  "engines.tab.overview": "Przegląd",
  "engines.tab.providers": "Dostawcy",
  "engines.tab.members": "Przydziały asystentów",
  "engines.tab.usage": "Zużycie",
  "engines.asideLabel": "Klucze i wydatki",
  "engines.keys.title": "Klucze",
  "engines.keys.text":
    "Tutaj będą przechowywane tylko klucze do bramek. FreeDuet nigdy nie zapisuje Twoich logowań do Claude i ChatGPT.",
  "engines.keys.notBuilt":
    "Klucz dodaje się na karcie jego silnika. Jest przechowywany w tej instalacji i nigdy więcej nie jest pokazywany.",
  "engines.spending.title": "Wydatki",
  "engines.spending.text":
    "Wydatki nie są jeszcze pokazywane na tej stronie. Płatny silnik działa tylko wtedy, gdy ta instalacja na to pozwala.",
  "engines.today": "Dziś",
  "engines.reason.off":
    "Silniki są wyłączone w tej instalacji (FREEDUET_ROUTER=off), więc nie ma nic do pokazania.",
  "engines.reason.not_set_up":
    "W tej instalacji nie jest skonfigurowany żaden agent FreeDuet, więc nie ma silników do pokazania.",
  "engines.reason.unreachable":
    "Agent FreeDuet nie odpowiedział, więc silników nie można teraz odczytać. Ta strona pyta ponownie co 30 sekund.",
  "engines.state.ready": "Gotowy",
  "engines.state.degraded": "Gotowy, ale ostatnio występowały błędy",
  "engines.state.limitedAt": "Osiągnął swój limit do {at}",
  "engines.state.limited": "Osiągnął swój limit na razie",
  "engines.state.outOfCreditAt": "Brak środków, kolejna próba: {at}",
  "engines.state.outOfCredit": "Brak środków",
  "engines.state.notAnsweringAt": "Nie odpowiada, kolejna próba: {at}",
  "engines.state.notAnswering": "Na razie nie odpowiada",
  "engines.state.checking": "Sprawdzanie, czy znowu odpowiada",
  "engines.state.gatewayKey":
    "Jego bramka nie przyjęła klucza. Sprawdź klucz, który jej podałeś.",
  "engines.state.signedOut":
    "Wylogowany: zaloguj się ponownie własnym logowaniem silnika",
  "engines.state.refusedWhy": "Nie uruchomiono: {reason}",
  "engines.state.refused": "Nie uruchomiono: powód nie jest znany.",
  "engines.state.unknown": "Stan nieznany",
  "engines.state.toolsAsText":
    "Jego ostatnia odpowiedź zapisała wywołania narzędzi jako tekst zamiast ich użyć: wybierz model, który obsługuje narzędzia",
  "engines.pill.working": "Działa",
  "engines.pill.checking": "Sprawdzanie",
  "engines.pill.limited": "Ograniczony",
  "engines.pill.outOfCredit": "Brak środków",
  "engines.pill.notAnswering": "Nie odpowiada",
  "engines.pill.signedOut": "Wylogowany",
  "engines.pill.locked": "Zablokowany",
  "engines.pill.unknown": "Nieznany",
  "engines.members.title": "Kto czego używa",
  "engines.members.description":
    "Silniki, które próbuje każdy członek, w kolejności, w jakiej je próbuje, oraz co się dzieje, gdy któryś się wyczerpie. Zmiana obowiązuje od następnej wiadomości członka i możesz ją cofnąć.",
  "engines.members.col.member": "Członek",
  "engines.members.col.order": "Kolejność silników",
  "engines.members.col.switching": "Gdy silnik się wyczerpie",
  "engines.order.note":
    "Użyj strzałek, aby przesunąć silnik o jedno miejsce. Twoje własne logowania są pierwsze, chyba że wybierzesz inaczej: jeśli przesunięcie ustawia darmowy lub płatny silnik przed nimi, najpierw zostaniesz poproszony o potwierdzenie.",
  "engines.order.warnTitle.free_before_login":
    "Darmowy silnik odpowiadałby przed Twoim własnym logowaniem",
  "engines.order.warnTitle.paid_before_free_or_login":
    "Płatny silnik byłby przed darmowym silnikiem lub logowaniem",
  "engines.order.warnText.free_before_login":
    "Jeśli to usługa w chmurze, wiadomości tego członka trafiają najpierw do tego dostawcy, który może je zachować. Jego odpowiedzi mogą być też gorszej jakości niż te z Twojego logowania.",
  "engines.order.warnText.paid_before_free_or_login":
    "Płatny silnik odpowiada przed silnikami, które po nim następują, więc to, na co odpowie, może kosztować pieniądze. Jeśli jest pierwszy na liście, każda wiadomość może kosztować pieniądze od pierwszej. Działa dopiero po tym, jak włączysz płatne silniki i ustawisz swoje limity.",
  "engines.order.newLabel": "Nowa kolejność:",
  "engines.order.tick": "Rozumiem, użyj tej kolejności",
  "engines.order.confirm": "Potwierdź",
  "engines.order.tickLabel": "Rozumiem, użyj tej kolejności dla: {name}",
  "engines.order.confirmLabel": "Potwierdź nową kolejność dla: {name}",
  "engines.order.cancelLabel": "Anuluj nową kolejność dla: {name}",
  "engines.order.own": "Twoja kolejność: logowania nie są pierwsze",
  "engines.order.recommended": "Użyj zalecanej kolejności",
  "engines.order.recommendedLabel": "Użyj zalecanej kolejności dla: {name}",
  "engines.order.moveUp": "Przesuń {engine} w górę dla: {name}",
  "engines.order.moveDown": "Przesuń {engine} w dół dla: {name}",
  "engines.order.saveFailed": "Nie udało się zapisać kolejności.",
  "engines.claude.default": "Domyślne z subskrypcji",
  "engines.claude.effort.low": "Niski",
  "engines.claude.effort.medium": "Średni",
  "engines.claude.effort.high": "Wysoki",
  "engines.claude.effort.xhigh": "Bardzo wysoki",
  "engines.claude.effort.max": "Maksymalny",
  "engines.claude.effortLabel": "Wysiłek",
  "engines.claude.note":
    "Tylko Claude Code. Model, którego Twoja subskrypcja nie może używać, kończy tę turę własnym błędem Claude Code. Nic nie jest wyłączane, a „Domyślne z subskrypcji” cofa wybór.",
  "engines.claude.modelAria": "Model Claude dla: {name}",
  "engines.claude.effortAria": "Wysiłek Claude dla: {name}",
  "engines.claude.saved":
    "Wybór Claude zapisany. Obowiązuje od następnej wiadomości.",
  "engines.members.saveFailed": "Nie udało się zapisać Twojego wyboru.",
  "engines.members.undoFailed": "Nie udało się cofnąć tej zmiany.",
  "engines.mode.groupLabel": "Gdy silnik się wyczerpie, dla: {name}",
  "engines.mode.controlLabel": "{label} dla: {name}",
  "engines.mode.undoLabel": "Cofnij zmianę dla: {name}",
  "engines.mode.automatic.label": "Przełączaj automatycznie",
  "engines.mode.automatic.effect":
    "Gdy silnik się wyczerpie, odpowiada następny i dowiadujesz się, który.",
  "engines.mode.askFirst.label": "Najpierw zapytaj mnie",
  "engines.mode.askFirst.effect":
    "Gdy silnik się wyczerpie, zostaniesz zapytany: przełączyć, poczekać albo wskazać inny silnik.",
  "engines.leftOut.line": "Nieużywany: {engine}, ponieważ {why}.",
  "engines.leftOut.locked": "plik instalacji na to nie pozwala",
  "engines.leftOut.disabled": "jest wyłączony",
  "engines.leftOut.paid_gateway":
    "to płatna bramka, której FreeDuet jeszcze nie uruchamia",
  "engines.leftOut.metered_off": "płatne silniki są wyłączone",
  "engines.leftOut.cap_zero": "jego limit wydatków wynosi zero",
  "engines.leftOut.not_set_up": "nie jest skonfigurowany w tej instalacji",
  "engines.leftOut.other": "nie zostanie uruchomiony",
  "engines.chain.none":
    "Żaden silnik nie może teraz odpowiadać za tego członka.",
  "engines.chain.one": "Próbuje tylko {engine}.",
  "engines.chain.many": "Próbuje {list}.",
  "engines.chain.then": ", potem ",
  "engines.pin":
    "Przypięty do {engine} przez plik instalacji: nigdy nie przełącza się na inny silnik.",
  "engines.alone":
    "Dla tego członka skonfigurowano tylko {engine}, więc nie ma jeszcze na co przełączyć. Twój wybór zostaje zachowany na czas, gdy już będzie.",
  "engines.source.yours": "Twój wybór. Plik instalacji mówi: {mode}.",
  "engines.source.file": "Z pliku instalacji.",
  "engines.block.not_at_the_computer":
    "Zmień to na komputerze, na którym działa FreeDuet.",
  "engines.block.not_paired_with_the_computer":
    "Najpierw sparuj tę przeglądarkę z komputerem, na którym działa FreeDuet: uruchom tam `bash scripts/open.sh` i otwórz link tutaj.",
  "engines.block.agent_too_old": "Zaktualizuj FreeDuet, aby to zmienić.",
  "engines.block.choices_unreadable":
    "Nie udało się odczytać Twoich wyborów, więc używane są ustawienia instalacji. Nic z tego, co wybrałeś, nie przepada.",
  "engines.saved": "Zapisano. Obowiązuje od następnej wiadomości członka.",
  "engines.undone":
    "Cofnięto. Poprzednie ustawienie obowiązuje od następnej wiadomości członka.",
  "engines.providers.title": "Dodaj silnik",
  "engines.providers.description":
    "Włącz silnik, wklej jego klucz i naciśnij Zapisz, a potem Testuj. Zmiana obowiązuje od następnej wiadomości.",
  "engines.providers.pickerLabel": "Dostawca",
  "engines.providers.blurb.ollama":
    "Modele działające na Twoim własnym komputerze.",
  "engines.providers.blurb.llamacpp":
    "Serwer llama.cpp na Twoim własnym komputerze lub w Twojej sieci.",
  "engines.providers.blurb.lmstudio":
    "Lokalny serwer LM Studio na Twoim własnym komputerze.",
  "engines.providers.blurb.freellmapi":
    "Router, który uruchamiasz sam i który zbiera darmowe plany wielu dostawców pod jednym adresem.",
  "engines.providers.blurb.groq":
    "Szybkie otwarte modele, darmowe z dziennymi limitami.",
  "engines.providers.blurb.google": "Modele Gemini, darmowe z limitami.",
  "engines.providers.blurb.mistral":
    "Modele Mistral w darmowym planie, z limitami.",
  "engines.providers.blurb.openrouter":
    "Tylko modele, które nic nie kosztują: identyfikator kończący się na :free albo openrouter/free.",
  "engines.providers.blurb.cloudflare":
    "Otwarte modele w Cloudflare, darmowe z dziennym limitem. Wpisz własne konto w adresie.",
  "engines.providers.blurb.cerebras": "Bardzo szybkie otwarte modele.",
  "engines.providers.blurb.anthropic-api":
    "Claude z kredytami płatnymi za zużycie.",
  "engines.providers.tag.local": "Lokalny",
  "engines.providers.tag.router": "Zaawansowane: Twój własny router",
  "engines.providers.tag.free": "Darmowy z limitami",
  "engines.providers.tag.trial": "Okres próbny, wymaga karty",
  "engines.providers.tag.paid": "Płatny",
  "engines.providers.cloudWarning":
    "Dane wysłane do tej usługi opuszczają Twój komputer.",
  "engines.providers.routerWarning":
    "Twoje wiadomości trafiają do routera, który przekazuje je darmowym dostawcom włączonym w jego wnętrzu. Opuszczają Twój komputer, a ci dostawcy mogą je zachować.",
  "engines.providers.routerAdvanced":
    "Opcja zaawansowana, nie zalecane ustawienie domyślne: sam projekt opisuje się jako przeznaczony wyłącznie do osobistych eksperymentów. FreeDuet go nie instaluje ani nie uruchamia. Klucze Twoich dostawców zostają w jego wnętrzu; FreeDuet zachowuje tylko jeden token dostępu, który Ci wydaje.",
  "engines.providers.routerAddress":
    "Jego własny domyślny port, 3001, jest portem FreeDuet. Uruchom go na innym porcie i wpisz adres z /v1 na końcu. Na tym komputerze http wystarczy. Poza tym komputerem akceptowana jest tylko Twoja własna sieć (adres LAN lub nazwa .local), przez https. Publiczny host jest odrzucany.",
  "engines.providers.address": "Adres serwera",
  "engines.providers.loadList": "Wczytaj listę",
  "engines.providers.saveSettings": "Zapisz ustawienia",
  "engines.providers.test": "Testuj",
  "engines.providers.freeModelsNote":
    "Darmowe modele często się zmieniają i mogą zachować to, co wyślesz.",
  "engines.providers.freeModelsLoading":
    "Wczytywanie darmowych modeli, które mogą używać narzędzi.",
  "engines.providers.freeModelsStale":
    "Przed chwilą nie udało się połączyć z OpenRouter. To ostatnia wczytana lista.",
  "engines.providers.freeModelsFallback":
    "Przed chwilą nie udało się połączyć z OpenRouter. Oferowany jest tylko darmowy router.",
  "engines.providers.freeRouterLabel":
    "openrouter/free (OpenRouter wybiera darmowy model)",
  "engines.providers.keySaved":
    "Klucz zapisany. Nigdy więcej nie jest pokazywany.",
  "engines.providers.keyPlaceholder": "Wklej tutaj klucz",
  "engines.providers.notOnKey":
    "Jeszcze nie włączony. Wklej klucz i naciśnij Zapisz.",
  "engines.providers.notOnSettings":
    "Jeszcze nie włączony. Wybierz model i naciśnij Zapisz ustawienia.",
  "engines.providers.settingsSaved":
    "Zapisano. Obowiązuje od następnej wiadomości.",
  "engines.providers.keyRemoved": "Klucz usunięty. Silnik jest wyłączony.",
  "engines.providers.lockedOwnFile":
    "Napisałeś własny plik silników, więc te karty tylko go pokazują. Zmień go tam.",
  "engines.providers.users.paid":
    "Wyłączony, dopóki nie będzie limitów wydatków. FreeDuet nie pozwoli płatnemu silnikowi działać wcześniej.",
  "engines.providers.users.trial":
    "Jego darmowy plan to okres próbny, który wymaga karty, więc FreeDuet nie oferuje go jako darmowego. Pozostaje wyłączony.",
  "engines.providers.users.members":
    "Dla członków: tak, po ich logowaniu do Claude. Dla lekkich asystentów: tak.",
  "engines.providers.users.notYet":
    "Dla członków: jeszcze nie. Dla lekkich asystentów: tak.",
  "engines.providers.check.ok": "Odpowiedział. Działa.",
  "engines.providers.check.key_rejected":
    "Klucz nie został przyjęty. Sprawdź go i zapisz ponownie.",
  "engines.providers.check.model_missing":
    "Serwer nie zna tego modelu. Sprawdź nazwę modelu.",
  "engines.providers.check.rate_limited":
    "Limit lub środki są na razie wyczerpane. Spróbuj ponownie później.",
  "engines.providers.check.other":
    "Nic nie odpowiedziało albo odpowiedź nie została zrozumiana.",
  "engines.providers.freeNote":
    "„Darmowy” to etykieta FreeDuet, wzięta z warunków dostawcy. Niektórzy dostawcy (na przykład Google) naliczą Ci opłatę, jeśli dla Twojego projektu włączone jest rozliczanie.",
  "engines.providers.useFor": "Używaj dla",
  "engines.providers.useForNone":
    "Żaden członek jeszcze go nie używa. Używają go lekcy asystenci. Zaznacz członków, którzy mogą wysyłać swoją pracę do tej usługi.",
  "engines.providers.warn.inbox": "Wysyła Twoją pocztę do tej usługi.",
  "engines.providers.warn.concierge": "Wysyła Twoje rezerwacje do tej usługi.",
  "engines.providers.modelsEmpty": "Lista jest pusta. Wpisz nazwę modelu.",
  "engines.providers.modelsLoaded": {
    one: "Wczytano {count} model. Wybierz jeden w polu.",
    few: "Wczytano {count} modele. Wybierz jeden w polu.",
    many: "Wczytano {count} modeli. Wybierz jeden w polu.",
    other: "Wczytano {count} modelu. Wybierz jeden w polu.",
  },
  "engines.providers.switchOn": "Włącz {name}",
  "engines.providers.changeFailed": "Nie udało się tego zmienić.",
  "engines.providers.keySaveFailed": "Nie udało się zapisać klucza.",
  "engines.providers.listFailed": "Nie udało się wczytać listy.",
  "engines.providers.keyRemoveFailed": "Nie udało się usunąć klucza.",
  "engines.providers.saveFailed": "Nie udało się tego zapisać.",
  "engines.providers.testFailed": "Nie udało się uruchomić testu.",
  "engines.tokens.title": "Tokeny",
  "engines.tokens.description":
    "Co każdy członek zużył w każdym silniku, tak jak zgłosił to sam silnik. Dni liczone są w UTC.",
  "engines.tokens.fallback": "Nie udało się wczytać liczników tokenów.",
  "engines.tokens.empty": "Nie policzono jeszcze żadnej tury.",
  "engines.tokens.unavailable": "Liczniki tokenów są teraz niedostępne.",
  "engines.tokens.problem":
    "Nie udało się odczytać pliku z licznikami, więc niektórych liczb może brakować.",
  "engines.tokens.notReported": "niezgłoszone",
  "engines.tokens.col.engine": "Silnik",
  "engines.tokens.col.week": "Ostatnie 7 dni",
  "engines.tokens.allMembers": "Wszyscy członkowie",
  "engines.tokens.note":
    "Wejście liczy każdy token podany modelowi, także te z pamięci podręcznej. Każdy wiersz liczy próby silnika: ponowna próba na tym samym silniku liczy się znowu. Próba, w której silnik nic nie zgłosił, dodaje swój czas i żadnych tokenów. Czas jest mierzony tutaj, od początku do końca każdej próby.",
  "engines.tokens.savedWeek": "Zaoszczędzone w ostatnich 7 dniach",
  "engines.tokens.savedNote":
    "Zaoszczędzone oznacza tokeny, które przeszły przez darmowe silniki, w chmurze lub na Twoim własnym komputerze. Twoja subskrypcja Claude Code ma stałą opłatę, a płatne silniki kosztują pieniądze, więc żadne z nich się nie liczy.",
  "engines.tokens.currencyHelp":
    "Kliknij kwotę, aby przełączać między euro a dolarami.",
  "engines.tokens.reference":
    "Według cen katalogowych {model} ({input} wejścia, {output} wyjścia za milion tokenów, {date}); {euro} = {rate} ({rateDate}).",
  "engines.tokens.under": "poniżej {amount}",
  "engines.tokens.nothingYet": "jeszcze nic",
  "engines.tokens.plus": "plus {time}",
  "engines.tokens.toDollars": "{amount}. Pokaż kwoty w dolarach",
  "engines.tokens.toEuros": "{amount}. Pokaż kwoty w euro",
  "engines.tokens.amount": "{amount} tokenów",
  "engines.tokens.timeLocal": "{time} na Twoim własnym GPU",
  "engines.tokens.timeCloud": "{time} na darmowym silniku w chmurze",
  "engines.tokens.and": " i ",
  "engines.tokens.timeTail": "{parts}, tokeny niezgłoszone",
  "engines.tokens.cell": "{input} wejścia · {output} wyjścia",
  "engines.tokens.partial": "zgłoszono {reported} z {total} prób",
  "engines.dur.under": "poniżej 1 min",
  "engines.dur.min": "{minutes} min",
  "engines.dur.hourMin": "{hours} godz. {minutes} min",
  "engines.usage.bySource": "Według źródła",
  "engines.usage.byMember": "Według członka",
  "engines.usage.time": "Czas",
  "engines.usage.source.person": "Ty",
  "engines.usage.source.routine": "Rutyny",
  "engines.usage.source.handoff": "Między członkami",
  "engines.usage.source.other": "Inne",
  "engines.usage.source.unknown": "Wcześniej (niezapisane)",
  "engines.usage.title": "Gdzie poszło ostatnie 7 dni",
  "engines.usage.note":
    "Udziały dotyczą tokenów zgłoszonych przez silniki (wejście plus wyjście) albo czasu, gdy wybrano „Czas”; próby, które nie zgłosiły tokenów, dodają tylko czas. „Ty” to Twoje własne wiadomości, „Rutyny” to rutyny i kontrole, „Między członkami” to przekazania, a „Inne” to wszystko pozostałe, na przykład własne uruchomienia wdrożenia.",
  "engines.usage.nothing": "W ostatnich 7 dniach nic nie policzono.",
  "engines.usage.chartsFailed":
    "Nie udało się narysować wykresów zużycia. Tabela poniżej nie jest tym dotknięta.",
  "engines.usage.restMembers": "Pozostali członkowie",
  "engines.usage.limitTitle": "Limity planu",
  "engines.usage.limitNone":
    "Żaden silnik nie jest teraz wstrzymany przez limit.",
  "engines.usage.limitNote":
    "Procent tygodniowego limitu Twojego planu nie jest pokazywany: subskrypcja nie zgłasza go FreeDuet. Silnik mówi o tym tylko wtedy, gdy osiągnął limit, wraz z godziną, o której ma wrócić.",
  "engines.usage.range": "{from} do {to}, dni UTC",
  "engines.usage.splitBy": "Podziel według",
  "engines.usage.measure": "Miara",
  "engines.usage.perDay": "{title}: {metric} dziennie",
  "engines.usage.perDayUtc": "{title}: {metric} dziennie, UTC",
  "engines.usage.day": "Dzień",
  // connections-begin
  "connections.connect": "Połącz",
  "connections.reconnect": "Połącz ponownie",
  "connections.connected": "Połączono",
  "connections.teamAccount": "Konto zespołu",
  "connections.disconnect": "Rozłącz",
  "connections.disconnecting": "Rozłączanie…",
  "connections.startFailed":
    "Nie udało się rozpocząć łączenia, więc nic nie zostało połączone. Spróbuj ponownie albo zapytaj administratora, jeśli to się powtarza.",
  "connections.list.auth.no-broker":
    "Łączenie aplikacji nie jest jeszcze skonfigurowane, więc nic nie zostało zapisane. Poproś administratora, aby je skonfigurował.",
  "connections.list.auth.not-supported":
    "Aplikacje łączysz tutaj jednorazowo, przyciskiem Połącz na stronie aplikacji. Nie są autoryzowane akcja po akcji.",
  "connections.list.auth.missing-handle":
    "Ten link nie mówi, którą autoryzację kończy, więc nic nie zostało zrobione. Zacznij od nowa na stronie aplikacji.",
  "connections.list.auth.no-attempt":
    "Nie ma autoryzacji w toku, którą mógłbyś dokończyć. Mogła wygasnąć albo rozpocząć się w innej sesji. Zacznij od nowa na stronie aplikacji.",
  "connections.list.auth.vendor-unavailable":
    "Aplikacja nie odpowiedziała, gdy {product} próbował dokończyć tę autoryzację, więc nic nie zostało zapisane. Spróbuj linku ponownie za chwilę.",
  "connections.list.auth.not-your-authorization":
    "Ten link nie pasuje do autoryzacji, którą masz w toku, więc nic nie zostało zapisane. Dokończ ją w karcie, w której ją rozpocząłeś, albo zacznij od nowa na stronie aplikacji.",
  "connections.list.auth.not-finished":
    "Ta autoryzacja nie została jeszcze zakończona, więc nic nie zostało zapisane. Dokończ ją w aplikacji, a potem otwórz link ponownie.",
  "connections.list.auth.authorization-failed":
    "Aplikacja nie dokończyła tej autoryzacji, więc nic nie zostało zapisane. Zacznij od nowa na stronie aplikacji.",
  "connections.list.auth.context-changed":
    "Konto tej aplikacji zmieniło się, gdy autoryzacja była otwarta, więc nic nie zostało zapisane. Dostęp nadany staremu kontu został usunięty. Zacznij od nowa na stronie aplikacji.",
  "connections.list.auth.not-permitted":
    "Nie możesz już połączyć konta tej aplikacji, więc nic nie zostało zapisane. Twój dostęp lub konfiguracja aplikacji zmieniły się, gdy autoryzacja była otwarta. Zapytaj administratora, jeśli spodziewałeś się, że ją dokończysz.",
  "connections.list.auth.cancelled":
    "Ta autoryzacja została anulowana w trakcie kończenia, więc nic nie zostało zapisane. Dostęp, który nadała, został usunięty.",
  "connections.list.auth.cancelled-left-live":
    "Ta autoryzacja została anulowana w trakcie kończenia, więc nic nie zostało zapisane. Dostępu, który nadała, nie udało się usunąć, więc aplikacja może nadal pozwalać na akcję, którą anulowałeś. Aby go usunąć, rozłącz aplikację na jej stronie, potem połącz ją ponownie i autoryzuj tylko to, czego chcesz.",
  "connections.list.auth.not-recorded":
    "Nie udało się zapisać tej autoryzacji, więc nic nie zostało zachowane. Zacznij od nowa na stronie aplikacji albo zapytaj administratora, jeśli to się powtarza.",
  "connections.list.description":
    "Aplikacje i konta, których Twoi asystenci używają jako Ty. Otwórz jedno, aby je połączyć lub zmienić.",
  "connections.list.connectFailed":
    "Nie udało się połączyć tego konta. Nic nie zostało zapisane. Spróbuj ponownie.",
  "connections.list.title": "Twoje połączenia",
  "connections.list.loading": "Wczytywanie połączeń…",
  "connections.list.loadError":
    "Nie udało się wczytać Twoich połączeń. Odśwież stronę albo zapytaj administratora, jeśli to się powtarza.",
  "connections.list.empty":
    "Na razie nie ma nic do połączenia. Aplikacje pojawią się tutaj, gdy administrator je włączy.",
  "connections.list.count": "{inUse} w użyciu · {total} łącznie",
  "connections.list.search": "Szukaj połączeń",
  "connections.list.noMatch": "Nic nie pasuje do „{query}”.",
  "connections.list.linksError":
    "Nie udało się wczytać GitHub i Slack, więc nie ma ich na liście. Odśwież stronę.",
  "connections.list.connectNamed": "Połącz {title}",
  "connections.list.reconnectNamed": "Połącz ponownie {title}",
  "connections.app.landed": "Właśnie autoryzowałeś: {action}.",
  "connections.app.pendingTitle": "Konto",
  "connections.app.loadError":
    "Nie udało się wczytać tego połączenia. Odśwież stronę albo zapytaj administratora, jeśli to się powtarza.",
  "connections.app.appLoadError":
    "Nie udało się wczytać tej aplikacji. Odśwież stronę albo zapytaj administratora, jeśli to się powtarza.",
  "connections.app.notSetUp":
    "{title} nie jest jeszcze skonfigurowany. Administrator musi go włączyć, zanim ktokolwiek będzie mógł go połączyć.",
  "connections.app.sharedDesc":
    "Udostępnione przez Twoją organizację. Asystenci działają jako konto zespołu.",
  "connections.app.brokeredDesc":
    "Asystenci używają tego jako Ty i widzą tylko to, co Ty możesz zobaczyć.",
  "connections.app.reassurance": "Żaden asystent nie może używać tego jako Ty.",
  "connections.app.tripPerAction": "Autoryzuj poniżej akcje, które chcesz.",
  "connections.app.tripConnect":
    "Łącząc, przechodzisz do {title}, aby zatwierdzić dostęp.",
  "connections.app.connectedDesc":
    "Asystenci, których dopuścisz, używają Twojego {title} jako Ty. Rozłączenie usuwa ich dostęp wszędzie.",
  "connections.app.notYours": "Tej aplikacji nie łączysz sam.",
  "connections.app.oneShared":
    "Asystenci używają dla tej aplikacji jednego wspólnego konta, takiego samego dla wszystkich.",
  "connections.app.noApp": "{product} nie ma aplikacji o tej nazwie.",
  "connections.app.yourAccount": "Twoje konto",
  "connections.app.notAvailable":
    "Jeszcze niedostępne. Administrator musi to najpierw włączyć.",
  "connections.app.connectedAsYou":
    "Asystenci, których dopuścisz, używają tego jako Ty i widzą tylko to, co Ty możesz zobaczyć.",
  "connections.app.notConnected":
    "Żaden asystent nie może używać tego jako Ty. Łącząc, przechodzisz do {vendor}, aby zatwierdzić dostęp.",
  "connections.app.disconnectedDone":
    "Rozłączono. {product} nie może już używać Twojego konta {vendor}.",
  "connections.app.disconnectedUnconfirmed":
    "Rozłączono tutaj. {vendor} tego nie potwierdził, więc usuń też {product} w ustawieniach dostępu stron trzecich na swoim koncie {vendor}.",
  "connections.app.accessDesc":
    "To, na co pozwoliłeś, tak jak zapisał to {vendor}. Może to być mniej, niż zażądał {product}.",
  "connections.app.access": "Dostęp",
  "connections.app.allowed": "Dozwolone",
  "connections.app.vendorDidntSay": "{vendor} tego nie podał.",
  "connections.identity.toolsDesc":
    "Pozwala Twoim asystentom czytać i zmieniać Twoje repozytoria jako Ty. Łączysz to osobno od swojego konta powyżej.",
  "connections.identity.tools": "Narzędzia",
  "connections.identity.githubTools": "Narzędzia GitHub",
  "connections.identity.notConnected": "Niepołączone",
  "connections.mail.neverRun": "Jeszcze nie była uruchomiona.",
  "connections.mail.lastRun": {
    one: "Ostatnie uruchomienie {when}: {count} wiadomość. Łącznie {total}.",
    few: "Ostatnie uruchomienie {when}: {count} wiadomości. Łącznie {total}.",
    many: "Ostatnie uruchomienie {when}: {count} wiadomości. Łącznie {total}.",
    other: "Ostatnie uruchomienie {when}: {count} wiadomości. Łącznie {total}.",
  },
  "connections.mail.on": "Włączona. {activity}",
  "connections.mail.off": "Wyłączona",
  "connections.mail.switchOff": "Wyłącz",
  "connections.mail.switchOn": "Włącz",
  "connections.mail.delete": "Usuń",
  "connections.mail.lastProblem": "Ostatni problem: {error}",
  "connections.mail.description":
    "Stałe reguły, o które poprosiłeś na czacie. Twoi asystenci je przechowują i stosują do nowej poczty co kilka minut; to nie są filtry Gmaila. Usunięcie reguły nie cofa tego, co już zrobiła.",
  "connections.mail.title": "Reguły poczty",
  "connections.mail.search": "Szukaj reguł poczty",
  "connections.mail.statusLabel": "Stan reguły",
  "connections.mail.allStatuses": "Wszystkie stany",
  "connections.mail.optActive": "Aktywne",
  "connections.mail.optPaused": "Wstrzymane",
  "connections.mail.active": "Aktywna",
  "connections.mail.paused": "Wstrzymana",
  "connections.mail.noMatch": "Żadna reguła nie pasuje do tych filtrów.",
  "connections.mail.paging": {
    one: "{from}–{to} z {count} reguły",
    few: "{from}–{to} z {count} reguł",
    many: "{from}–{to} z {count} reguł",
    other: "{from}–{to} z {count} reguły",
  },
  "connections.mail.previous": "Poprzednie",
  "connections.mail.next": "Następne",
  "connections.secret.aMember": "Członek",
  "connections.secret.doneMemberCal":
    "Połączono. {name} może teraz czytać Twoją pocztę i Twój kalendarz jako Ty.",
  "connections.secret.doneMember":
    "Połączono. {name} może teraz czytać Twoją pocztę jako Ty.",
  "connections.secret.doneBotsCal":
    "Połączono. Asystenci, których dopuścisz, mogą teraz czytać Twoją pocztę i Twój kalendarz jako Ty.",
  "connections.secret.doneBots":
    "Połączono. Asystenci, których dopuścisz, mogą teraz czytać Twoją pocztę jako Ty.",
  "connections.secret.notAvailable":
    "Jeszcze niedostępne. Administrator musi to najpierw włączyć.",
  "connections.secret.statusError":
    "Nie udało się wczytać, czy już to połączyłeś. Odśwież stronę albo zapytaj administratora, jeśli to się powtarza.",
  "connections.secret.yourAccount": "Twoje konto",
  "connections.secret.connectedCal":
    "Połączono jako {address}. Twój kalendarz też jest połączony. Asystenci, których dopuścisz, używają tego jako Ty.",
  "connections.secret.connectedNoCal":
    "Połączono jako {address}. Żaden kalendarz nie jest połączony. Asystenci, których dopuścisz, używają tego jako Ty.",
  "connections.secret.notConnected":
    "Żaden asystent nie może używać tego jako Ty. Wklej poniżej hasło aplikacji, aby połączyć swój Gmail.",
  "connections.secret.useDifferent": "Użyj innego hasła aplikacji",
  "connections.secret.disconnected":
    "Rozłączono. {product} nie może już czytać Twojej poczty ani Twojego kalendarza. Aby mieć pewność, że hasło aplikacji przestanie działać, usuń je także na {url}.",
  "connections.secret.formDesc":
    "Dwa kroki w Google, potem wklej to, co Ci dadzą. Nic nie jest zapisywane, jeśli Gmail tego nie przyjmie.",
  "connections.secret.connectTitle": "Połącz",
  "connections.secret.memberWillUse":
    "{name} będzie używać tej skrzynki pocztowej.",
  "connections.secret.step1Lead":
    "Włącz weryfikację dwuetapową dla swojego konta Google, a potem utwórz hasło aplikacji na",
  "connections.secret.step1Tail":
    ". Nazwij je {product} i skopiuj szesnaście liter.",
  "connections.secret.step2Lead":
    "Aby Twoi asystenci widzieli też Twój kalendarz: w Kalendarzu Google otwórz Ustawienia, wybierz swój kalendarz i skopiuj jego",
  "connections.secret.step2Link": "Tajny adres w formacie iCal",
  "connections.secret.step2Tail": ". Ten krok jest opcjonalny.",
  "connections.secret.address": "Twój adres Gmail",
  "connections.secret.password": "Hasło aplikacji",
  "connections.secret.passwordHint":
    "Szesnaście liter od Google, ze spacjami lub bez. To nie jest Twoje zwykłe hasło.",
  "connections.secret.calendar": "Tajny adres kalendarza (opcjonalnie)",
  "connections.secret.calendarHint":
    "Każdy, kto ma ten adres, może czytać Twój kalendarz, więc jest przechowywany równie starannie jak hasło.",
  "connections.secret.checking": "Sprawdzanie w Gmailu…",
  "connections.secret.canDoTitle": "Co to pozwala robić Twoim asystentom",
  "connections.secret.canDoDesc":
    "Hasło aplikacji otwiera całą Twoją skrzynkę, więc warto wiedzieć, co to daje.",
  "connections.secret.canDo":
    "Twoi asystenci mogą przeszukiwać i czytać Twoją pocztę oraz zaglądać do Twojego kalendarza. Nie mogą niczego usuwać, przenosić ani oznaczać etykietami. Odpowiedź wychodzi dopiero po Twoim zatwierdzeniu i tylko do osób, które już są w wiadomości. Możesz rozłączyć w dowolnej chwili i możesz usunąć hasło aplikacji w Google, kiedy zechcesz.",
  "connections.mode.goesShared": "Wspólne konto zostanie rozłączone.",
  "connections.mode.goesNoShared": "Żadne wspólne konto nie jest połączone.",
  "connections.mode.goesPersonal": {
    one: "{count} konto osobiste zostanie rozłączone.",
    few: "{count} konta osobiste zostaną rozłączone.",
    many: "{count} kont osobistych zostanie rozłączonych.",
    other: "{count} konta osobistego zostanie rozłączonych.",
  },
  "connections.mode.makeShared": "Ustaw {title} jako wspólne",
  "connections.mode.makePersonal": "Ustaw {title} jako osobiste",
  "connections.mode.titleShared": "Udostępnić jedno konto {title}?",
  "connections.mode.titlePersonal": "Dać każdemu własne konto {title}?",
  "connections.mode.checking": "Sprawdzanie, co by się zmieniło…",
  "connections.mode.everyone":
    "Każdy, kto używa asystenta z tą aplikacją, będzie działać jako to jedno konto.",
  "connections.cancel": "Anuluj",
  "connections.dir.description":
    "Katalog aplikacji {name}. Dodaj aplikację, aby jej narzędzia były dostępne dla asystentów. Każda osoba nadal łączy własne konto, zanim cokolwiek zostanie odczytane.",
  "connections.dir.appsTitle": "Aplikacje",
  "connections.dir.appsDesc":
    "Szukaj po nazwie. Nikt tutaj nie sprawdził tych aplikacji.",
  "connections.dir.searchAria": "Szukaj w aplikacjach {name}",
  "connections.dir.searchPlaceholder": "Szukaj po nazwie aplikacji",
  "connections.dir.noMatch": 'Żadna aplikacja {name} nie pasuje do "{query}".',
  "connections.dir.none": "{name} nie zwrócił żadnych aplikacji.",
  "connections.dir.actions": {
    one: "{count} akcja",
    few: "{count} akcje",
    many: "{count} akcji",
    other: "{count} akcji",
  },
  "connections.dir.added": "Dodana",
  "connections.dir.adding": "Dodawanie…",
  "connections.dir.add": "Dodaj",
  "connections.grants.consentFailed":
    "{product} odpowiedział bez linku do zgody, więc nic nie zostało autoryzowane. Spróbuj ponownie albo zapytaj administratora, jeśli to się powtarza.",
  "connections.grants.title": "Akcje",
  "connections.grants.readError":
    "Nie udało się teraz odczytać, na co pozwala to konto.",
  "connections.grants.retry": "Spróbuj ponownie",
  "connections.grants.description":
    "Pogrupowane według uprawnienia, którego wymaga każda akcja. Odpowiada to temu, co pokazuje ekran zgody.",
  "connections.grants.search": "Szukaj akcji",
  "connections.grants.wholeApp": "Wszystko w tej aplikacji, zatwierdzane razem",
  "connections.grants.noPermission": "Nie wymaga własnego uprawnienia",
  "connections.grants.needs": "Wymaga {scopes}",
  "connections.grants.authorize": "Autoryzuj",
  "connections.grants.hidden": {
    one: "{count} kolejna akcja jeszcze nieautoryzowana. Wyszukaj, aby ją znaleźć.",
    few: "{count} kolejne akcje jeszcze nieautoryzowane. Wyszukaj, aby znaleźć jedną.",
    many: "{count} kolejnych akcji jeszcze nieautoryzowanych. Wyszukaj, aby znaleźć jedną.",
    other:
      "{count} kolejnej akcji jeszcze nieautoryzowanej. Wyszukaj, aby znaleźć jedną.",
  },
  "connections.grants.noMatch": "Żadna akcja nie pasuje do tego wyszukiwania.",
  "connections.grants.before": "Zanim autoryzujesz: {action}",
  "connections.grants.continue": "Przejdź do zgody",
  "connections.grants.notRequired": "Nie wymaga autoryzacji.",
  "connections.grants.authorized": "Autoryzowana.",
  "connections.grants.notYet": "Jeszcze nieautoryzowana.",
  "connections.grants.notYetAdmin":
    "Jeszcze nieautoryzowana. Administrator może ją autoryzować.",
  "connections.grants.missing":
    "Brakuje: {missing}. Administrator musi to ustawić. Autoryzacja tego nie naprawi.",
  "connections.grants.missingSetting":
    "Brakuje ustawienia. Administrator musi je ustawić. Autoryzacja tego nie naprawi.",
  "connections.grants.unknown":
    "Nie udało się teraz odczytać tej akcji. {reason}",
  "connections.row.connectKey":
    "Ta aplikacja łączy się kluczem, a nie przez stronę logowania, więc nic nie zostało połączone. Odśwież stronę i naciśnij Połącz jeszcze raz.",
  "connections.row.noAuth":
    "{title} nie potrzebuje konta. Asystenci, którzy go mają, mogą go używać tak, jak jest.",
  "connections.row.verified":
    "Połączono Twoim kluczem. Ostatnio sprawdzono {date}.",
  "connections.row.failedCheck":
    "Twój klucz nie przeszedł sprawdzenia w {title}. Przyczyną może być klucz albo sam {title}. Twoje konto jest nadal połączone. Naciśnij Sprawdź ponownie, aby spróbować jeszcze raz, albo rozłącz i połącz z nowym kluczem.",
  "connections.row.noSafeCheck":
    "Połączono Twoim kluczem. Nie został sprawdzony w {title}. W tamtym czasie {title} nie miał bezpiecznego sposobu sprawdzenia klucza. Dotyczy to aplikacji, a nie Twojego klucza.",
  "connections.row.unchecked":
    "Połączono Twoim kluczem. Nie został sprawdzony w {title}.",
  "connections.row.keyStillWorks":
    "Rozłączono. Twój klucz nadal działa w {title}. Zmień go tam, aby zakończyć cały dostęp.",
  "connections.row.asksForKey":
    "{title} łączy się kluczem, który już masz. Połącz o niego poprosi.",
  "connections.row.signedIn": "Zalogowano przez {title}. {description}",
  "connections.row.yourAccount": "Twoje konto",
  "connections.row.keyMissing": "Brak klucza",
  "connections.row.recheck": "Sprawdź ponownie",
  "connections.row.rechecking": "Sprawdzanie…",
  "connections.row.perAction": "Zatwierdzane dla każdej akcji",
  "connections.row.connectYour": "Połącz swoje konto",
  "connections.row.checkingNeeds": "Sprawdzanie, czego potrzebuje aplikacja…",
  "connections.row.noNeeds":
    "Nie udało się ustalić, czego potrzebuje ta aplikacja. Zamknij to i spróbuj ponownie.",
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
};
