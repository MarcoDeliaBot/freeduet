"""The hand-off claim guard: a member that says a colleague has the work, with no hand-off made, is asked once (D184).

THE PROBLEM. In a live run (27-28 November 2026) the person answered Kai's read-back with "via". Iris wrote
"Ottimo, procedo con Kai... Kai riceve il go... Esito: in corso" and made no `message_bot` call. Asked "sicuro che
stia lavorando?", she answered "Si, Kai sta lavorando" and quoted a line from the registro that was her own claim.
Only when pressed twice did she say she had never called the tool. No card, no ring and no hop existed. Her prompt
already says that the work has started only after the go: a prompt is not a guarantee, so this is the same thing
in code, in the way of the cannot guard (cannot_guard.py, D128).

THE RULE. When a segment ends the turn and ALL of these hold, the segment asks the member once more, in the same
segment, on the same engine, with the same tools:

- the run is the person's own live turn (`is_live_person_turn`: as cannot_guard decides it, but an envelope earlier in the conversation does not end it);
- the member was offered `message_bot` in this run;
- the turn made no `message_bot` call (this segment, or since the person's message);
- the final answer claims that a named colleague has the work now (`claimed_colleagues`): an in-progress outcome
  line, or words such as "receives the go", "I passed it to", "is working", "riceve il via", "sta lavorando",
  "gliel'ho passato", in English, Italian, Spanish, French, German, Portuguese, Polish, Turkish, Russian, Chinese,
  Japanese and Korean, in a sentence that is not a
  question, not a negation and not a condition or a promise ("when you say go, Kai starts"). The colleague names
  are read from the members' own prompts ("You are <Name>,"); the member itself is never one;
- no hand-off to that colleague is open in this conversation (`open_handoffs`).

THE SOURCE OF "OPEN" (the brief's question B). agent-freeduet holds no list of hops: the queue lives in the
server (`server/src/work/queue`, read by `GET /api/freeduet/work-status` behind the person's own session), and the
one authenticated door agent-freeduet has (`POST /api/agent-tools/call`, bridge/callback.py) runs the tools the
deployment granted and has no read of the queue; a new tool on it would widen that route. The team log is written
after a segment ends, so a running hop is not in it, and a hop's own thread is not the asking one. What the member
does see is this conversation's own transcript: its `message_bot` calls and, when a colleague finishes or gives
up, the envelope OpenBot writes back into the asking conversation ("You asked <Name> to help with this: ... It
answered:" or "... and it never answered:", agents/handoff-runner.ts). So a hand-off to a colleague counts as OPEN
when the transcript holds a `message_bot` call to that colleague that was not refused and that no later envelope
from that colleague closes. This errs toward "open": an unanswered hop that has in fact failed silently is read as
open and the guard stays quiet, which is the safe side (no second hand-off, no second card).

WHAT IT DOES. A new `claude -p` turn of the same engine with `reminder` in place of the usual last line: it wrote
that <colleague> has the work, but no `message_bot` call was made and no hand-off to <colleague> is open; if it
meant to hand the work over it calls `message_bot` now (through the same bridge and the same approval gate as any
hand-off: nothing is approved here); otherwise it tells the person plainly that nothing was handed over.

AT MOST ONE RETRY, and the cannot guard and this guard share it: the second answer is the answer. IT NEVER BREAKS
A TURN: any exception is logged and swallowed. `FREEDUET_HANDOFF_CLAIM_GUARD=off` switches it off.

The team log records it (`handoff_claim_guard`, team_log.py): "retried" when the second turn made a tool call,
"unchanged" when it did not, "failed" when the retry could not run.
"""

from __future__ import annotations

import json
import logging
import os
import re

from . import cannot_guard, members, origin, report_guard, team_log
from .members import MemberError
from .origin import latest_user_message, message_text

log = logging.getLogger("freeduet.handoff_claim_guard")

HANDOFF_TOOL = "message_bot"

RETRIED, UNCHANGED, FAILED = team_log.HANDOFF_CLAIM_GUARD_VALUES


def enabled(environment: dict[str, str] | None = None) -> bool:
    value = (environment if environment is not None else os.environ).get("FREEDUET_HANDOFF_CLAIM_GUARD", "")
    return value.strip().lower() not in {"off", "0", "false", "no"}


# ── the claim ────────────────────────────────────────────────────────────────────────────────────

# Phrases that say a colleague has the work now. They are matched on the text folded as cannot_guard folds it
# (lower case, no accents, apostrophes as '), so none carries an accent. Kept plain: a longer list is a longer
# list of wrong matches, and a wrong match costs one more turn, never a wrong action.
_CLAIMS = (
    # English
    r"(?:receives?|got|gets|has|have|received) (?:the|your) [\"'«»“”]?(?:go|green light|go-ahead|okay|ok)\b",
    r"\b(?:i|i'?ve|i have) (?:just )?(?:passed|handed|sent|forwarded|given|delegated|briefed)\b",
    r"(?:passed|handed|sent|forwarded|delegated) (?:it|this|that|everything|the (?:work|task|brief|job)) (?:over )?to\b",
    r"(?:is|are) (?:now |already |currently )?(?:working|on it|building|writing|making|drafting|editing|started)\b",
    r"(?:has|have) (?:now |already )?(?:started|begun|taken (?:it|this) on)\b",
    r"\bproceeding with\b",
    # Italian
    r"(?:riceve|ricevono|ha ricevuto) (?:il |tuo |il tuo )?[\"'«»“”]?(?:via|go)\b",
    r"\bha il [\"'«»“”]?(?:via|go)\b",
    r"\b(?:sta|stanno) (?:gia |ora |adesso )?(?:lavorando|costruendo|scrivendo|preparando|montando)\b",
    r"\bci (?:sta|stanno) lavorando\b",
    r"\b(?:gliel|glielo|gliela|l)'?ho (?:passato|passata|girato|girata|affidato|affidata|inoltrato|inoltrata|dato|data)\b",
    r"\bho (?:passato|girato|affidato|inoltrato) (?:il lavoro|tutto|l'incarico|la richiesta|a)\b",
    r"\bprocedo con\b",
    r"\b(?:ha|hanno) (?:gia )?(?:iniziato|cominciato|preso in carico)\b",
    r"\be (?:gia )?al lavoro\b",
    # Spanish
    r"\b(?:recibe|ha recibido) (?:el|la) (?:go|luz verde|visto bueno|via libre)\b",
    r"\b(?:esta|estan) (?:ya |ahora )?(?:trabajando|construyendo|escribiendo|preparando)\b",
    r"\b(?:se lo|lo|le|se la|la) he (?:pasado|dado|encargado|reenviado)\b",
    r"\bhe (?:pasado|encargado)\b",
    r"\b(?:ha|han) (?:ya )?(?:empezado|comenzado)\b",
    # French
    r"\b(?:recoit|a recu) (?:le|la) (?:go|feu vert)\b",
    r"\best (?:deja |maintenant )?en train de\b",
    r"\btravaille (?:deja |maintenant )?(?:dessus|sur)\b",
    r"\b(?:je|j') ?(?:lui |le |l')?(?:ai|a) (?:transmis|passe|confie|donne)\b",
    r"\ba (?:deja )?(?:commence|demarre)\b",
    # German
    r"\b(?:bekommt|erhalt|hat) (?:jetzt |schon )?(?:das|den|dein) (?:go|startschuss|okay|gruene licht)\b",
    r"\barbeitet (?:jetzt |schon |bereits )?(?:daran|dran|damit|an)\b",
    r"\bich habe (?:es|das|alles|ihm|ihr)?.{0,30}?(?:weitergegeben|uebergeben|weitergeleitet|beauftragt|gebeten)\b",
    r"\bhat (?:schon |bereits )?(?:angefangen|begonnen)\b",
    # Portuguese
    r"\b(?:recebe|recebeu) o (?:go|sinal verde|ok)\b",
    r"\bestao? (?:ja |agora )?(?:trabalhando|a trabalhar|construindo|escrevendo)\b",
    r"\besta (?:ja |agora )?(?:trabalhando|a trabalhar)\b",
    r"\b(?:passei|repassei|entreguei|encaminhei) (?:o|a|isso|tudo|para|ao|a)\b",
    r"\b(?:comecou|iniciou)\b",
)

# Six more languages (amendment of D184): Polish, Turkish, Russian, Chinese, Japanese, Korean. What the fold does to
# them (tests/test_handoff_claim_guard.py pins it): Latin-script Polish and Turkish lose their diacritics as the six
# above do (ł -> l, ı -> i, ş -> s); Cyrillic loses the breve and the diaeresis (й -> и, ё -> е); Chinese, Japanese and
# Korean are kept as they are (Hangul is recomposed, kana with a voiced mark are recomposed) except that full-width
# punctuation becomes ASCII (：-> :, ？ -> ?, ！ -> !, ；-> ;) and 。 stays. So these phrases are written naturally and
# folded once here, with the same function, so a pattern can never disagree with the text it meets. Chinese, Japanese
# and Korean have no spaces between words, so they carry no \b. The wording reuses the app's own catalogues
# ("wide.stateWorking", "chat.inProgress", "admin.audit.by.handedOn"). The colleague is named in Latin letters.
_CLAIMS_MORE = (
    # Polish
    r"\b(?:dostaje|dostal|dostala|otrzymuje|otrzymal|otrzymala) (?:ode mnie |moje |twoje |juz )?[\"'«»“”]?(?:go|zielone swiatlo|sygnal|start|zgode)\b",
    r"\b(?:pracuje|pracuja) (?:juz |teraz |obecnie )?(?:nad|przy)\b",
    r"\bzajmuje sie (?:tym|juz|teraz)\b",
    r"\bjest w trakcie\b",
    r"\b(?:przekazalem|przekazalam|zleciłem|zleciłam|powierzylem|powierzylam|delegowalem|delegowalam|przeslalem|przeslalam)\b",
    r"\b(?:juz )?(?:zaczal|zaczela|rozpoczal|rozpoczela|przystapil|przystapila)\b",
    # Turkish
    r"(?:go|yesil isik|sinyal|baslama emri)\w*(?:'\w+)? (?:aldi|aldilar|verildi|geldi)\b",
    r"\b(?:calisiyor|calisiyorlar|ugrasiyor|ilgileniyor|calismaya basladi)\b",
    r"\b(?:ilettim|devrettim|aktardim|yonlendirdim|havale ettim|emanet ettim|iletildi|devredildi)\b",
    r"\b(?:basladi|baslamis|baslandi|ise koyuldu)\b",
    r"\bile (?:ilerliyorum|devam ediyorum)\b",
    # Russian
    r"(?<![а-я])(?:получает|получил|получила|получили) (?:мое |твое |ваше |от меня )?[\"'«»“”]?(?:go|го|команду|сигнал|зеленый свет|добро|старт)",
    r"(?<![а-я])(?:работает|работают) (?:уже |сейчас |теперь )?(?:над|уже|сейчас|теперь)(?![а-я])",
    r"(?<![а-я])занимается (?:этим|задачей|проектом|уже|сейчас)",
    r"(?<![а-я])(?:взял|взяла) в работу",
    r"(?<![а-я])я (?:уже )?(?:передал|передала|поручил|поручила|делегировал|делегировала|переслал|переслала|отдал|отдала)(?![а-я])",
    r"(?<![а-я])(?:передал|передала|поручил|поручила|делегировал|делегировала) (?:ему|ей|им|это|эту|задачу|задание|работу|все|его|ее)(?![а-я])",
    r"(?<![а-я])(?:приступил|приступила|стартовал|стартовала|взялся|взялась)(?![а-я])",
    r"(?<![а-я])нач(?:ал|ала|али) (?:уже )?(?:работ|делать|писать|строить|собирать)",
    r"(?<![а-я])продолжаю с(?![а-я])",
    # Chinese
    r"(?:收到|接到|得到|拿到|获得|獲得)(?:了)?(?:你的|您的|我的)?[\"'“”「」«»]?(?:go|开始|開始|指令|信号|信號|绿灯|綠燈|许可|許可|确认|確認)",
    r"(?:正在|已经在|已經在|现在在|現在在|目前在)(?:工作|处理|處理|制作|製作|构建|構建|开发|開發|编写|編寫|搭建|设计|設計|准备|準備|着手|著手)",
    r"(?:已经|已經|已|刚刚|剛剛|我把|我已).{0,24}?(?:交给|交給|转给|轉給|转交|轉交|委托|委託|分配给|分配給|转发|轉發)",
    r"(?:开始了|開始了|已开始|已開始|已经开始|已經開始|着手了|著手了|开始工作|開始工作|开始处理|開始處理|开始制作|開始製作|开始构建|開始構建)",
    # Japanese
    r"(?:ゴーサイン|ゴー|go|合図|青信号|開始指示|承認|許可)(?:の?指示)?を(?:受け取|受領|受け|もらい|もらっ)",
    r"(?:作業|対応|制作|製作|開発|執筆|構築|準備|処理|編集|実装|設計)(?:中|して(?:い(?:ま|る)|お(?:り|る))|を進めて)",
    r"(?:取り組んで|取りかかって|着手して)(?:い|お)",
    r"(?:依頼し|引き継ぎ|引継ぎ|任せ|渡し|回し|託し|委任し|割り当て|転送し)(?:ました|た(?!い)|てあります|ておきました)",
    r"(?:開始し(?:ま[しす]?た|て(?:い|お)ま)|始めま[しす]た|始めて(?:い|お)ま|スタートしま[しす]た|着手しまし?た)",
    # Korean
    r"(?:go|시작 ?신호|시작 ?지시|출발 ?신호|신호|지시|승인|허가|그린 ?라이트|사인|오케이)[\"'“”」]?\s?(?:를|을)?\s?(?:받았|받고|받아)",
    r"[\"'“”「]고[\"'“”」]\s?(?:를|을)?\s?받",
    r"(?:작업|처리|제작|개발|구축|작성|준비|편집|구현|설계|진행)\s?(?:중(?:이|입|에|인)|하고 ?있)",
    r"일하고 ?있",
    r"(?:에게|한테|께)\s?(?:[^\s.!?]+\s){0,4}?(?:전달|위임|인계|배정|이관|넘겼|넘겨|맡겼|맡겨)",
    r"(?:시작했|시작됐|시작되었|시작하였|착수했|착수하였|돌입했)",
)
_CLAIM = re.compile("|".join(f"(?:{phrase})" for phrase in (*_CLAIMS, *(cannot_guard._fold(p) for p in _CLAIMS_MORE))))

# An in-progress outcome line, the report format's own ("Outcome: in progress", "Esito: in corso").
_OUTCOME_IN_PROGRESS = re.compile(
    r"(?:^|\n)\W*(?:outcome|esito|resultado|resultat|ergebnis|estado|statut|status)\W*[:\-]\W*"
    r"(?:in progress|in corso|en curso|en cours|in arbeit|in bearbeitung|em andamento|em curso)"
)
# The same line in the six more languages (see _CLAIMS_MORE); the colon is ASCII after the fold. [^\w], not \W: the
# fold lower-cases the pattern, and a lower-case \w would mean the opposite.
_OUTCOME_IN_PROGRESS_MORE = re.compile(
    cannot_guard._fold(
        r"(?:^|\n)[^\w]*(?:wynik|rezultat|efekt|stan|status|sonuc|durum|исход|результат|итог|статус|состояние|"
        r"结果|結果|状态|狀態|进度|進度|进展|進展|状況|ステータス|状態|進捗|결과|상태|진행 ?상황|현황)"
        r"[^\w]*[:\-][^\w]*"
        r"(?:w toku|w trakcie|w realizacji|devam ediyor|devam etmekte|surecte|islemde|в работе|в процессе|выполняется|"
        r"进行中|進行中|处理中|處理中|执行中|執行中|作業中|対応中|処理中|実行中|진행 ?중|작업 ?중|처리 ?중)"
    )
)

# A sentence that denies, asks, conditions or promises is not a claim that the work is with the colleague.
_NEGATION = re.compile(
    r"(?<![\w'])(?:not|never|no|non|mai|nessun\w*|nada|nunca|jamais|pas|ne|nicht|kein\w*|nie|nao|ainda nao|"
    r"haven't|hasn't|didn't|isn't|aren't|wasn't|don't|doesn't|cannot|can't|nothing|"
    r"nigdy|nic|zadn\w*|brak|degil|yok|hic|asla|henuz|hicbir|нет|никогда|ничего|никто|"
    + cannot_guard._fold(r"не|ни|ещё не")
    + r")(?![\w])|n't\b"
)
_NOT_NOW = re.compile(
    r"(?<![\w'])(?:if|once|when|whenever|unless|as soon as|after you|will|would|could|can|shall|"
    r"want me|do you want|should i|quando|appena|vuoi che|se vuoi|se dici|se confermi|posso|potrei|faro|passero|"
    r"cuando|en cuanto|quieres que|puedo|pasare|quand|des que|lorsque|veux-tu|voulez-vous|je pourrais|"
    r"wenn|sobald|soll ich|moechtest du|quando voce|assim que|quer que|posso|passarei|vou|"
    r"jesli|gdy|kiedy|gdyby|bede|bedzie|beda|moge|mozesz|chcesz|czy mam|czy|zrobie|przekaze|"
    r"eger|istersen|ister misin|istiyor musun|onaylarsan|dersen|olursa|ne zaman|"
    + cannot_guard._fold(r"если|когда|как только|после того как|буду|будет|будут|смогу|могу|хочешь|хотите|нужно ли|стоит ли|давай|собираюсь|"
                         r"передам|поручу")
    + r")(?![\w])|'ll\b|\b\w{2,}(?:acak|ecek|acagim|ecegim)\b"
)

# Chinese, Japanese and Korean have no spaces between words, so these have no word boundary: each is a short, specific
# fragment. A negation, a question or a condition anywhere in the sentence makes it not a claim, as above.
_NEGATION_CJK = re.compile(
    r"没有(?!问题|問題)|沒有(?!問題)|没(?!问题|關係|关系|有)|沒(?!問題|有)|尚未|还未|還未|并未|並未|未曾|从未|從未|不是|不会|不會|不能|不再|无法|無法|并没|並沒|"
    r"ません|ていない|てない|なかった|(?<!問題)(?<!間違い)ない|まだ|未だ|いません|"
    r"않|아니|없|아직|전혀|결코|(?<!\S)못\s?|(?<!\S)안\s"
)
_NOT_NOW_CJK = re.compile(
    r"如果|若是|要是|假如|一旦|等你|等到|当你|當你|(?<![机機])会(?!议|議|话|話)|將會|将会|即将|即將|就将|就將|"
    r"可以|能否|是否|吗|嗎|需要我|想让我|想讓我|要我|由我来|由我來|准备|準備|打算|"
    r"もし|なら|たら|れば|場合|とき|時(?!点|間)|際|次第|予定|つもり|ましょう|でしょう|だろう|ください|ほしい|たい|"
    r"ませんか|ますか|ですか|でしょうか|てもよ|良ければ|"
    r"만약|만일|경우|때(?!문)|겠|(?<![화표지단])면(?:\s|,|$)|까요|나요|습니까|입니까|합니까|인가요|예정|려고|려면"
)
_QUESTION_END_CJK = re.compile(r"(?:か|ですか|ますか|吗|嗎|呢)[。.]?$")


def _not_a_claim(sentence: str) -> bool:
    """The sentence asks, denies, conditions or promises (any language here)."""
    return bool(
        sentence.endswith("?")
        or _QUESTION_END_CJK.search(sentence)
        or _NEGATION.search(sentence)
        or _NOT_NOW.search(sentence)
        or _NEGATION_CJK.search(sentence)
        or _NOT_NOW_CJK.search(sentence)
    )


def _in_progress(text: str) -> bool:
    return _OUTCOME_IN_PROGRESS.search(text) is not None or _OUTCOME_IN_PROGRESS_MORE.search(text) is not None


def _sentences(folded: str) -> list[str]:
    # Chinese and Japanese end a sentence with 。 or a full-width mark that the fold made ASCII (！？：；), and put no
    # space after it: so a mark after a CJK character, or 。, also ends a sentence.
    parts = re.split(r"(?<=[.!?:;])\s+|(?<=。)\s*|(?<=[\u3000-\u9fff\uac00-\ud7af][!?:;])\s*|\n+", folded)
    return [part.strip() for part in parts if part and part.strip()]


def _names_of(prompts: dict[str, str]) -> dict[str, str]:
    """Folded colleague name -> member id, from each member's own prompt."""
    names: dict[str, str] = {}
    for member_id, prompt in prompts.items():
        name = cannot_guard._name_of(prompt)
        if name:
            names[cannot_guard._fold(name)] = member_id
    return names


def _prompts(prompts: dict[str, str] | None) -> dict[str, str]:
    try:
        return members.load_prompts() if prompts is None else prompts
    except MemberError:
        return {}


def claimed_colleagues(reply: str, member_id: str, prompts: dict[str, str] | None = None) -> list[tuple[str, str]]:
    """(member id, name) of each colleague, in order of appearance, that `reply` says has the work now. The member
    itself is never one. A sentence that denies, asks, makes a condition or promises does not count."""
    prompts = _prompts(prompts)
    names = {name: other for name, other in _names_of(prompts).items() if other != member_id}
    if not reply or not names:
        return []
    folded = cannot_guard._fold(reply)
    sentences = _sentences(folded)
    found: dict[str, str] = {}
    outcome_in_progress = _in_progress(folded)
    if outcome_in_progress:
        # The report's outcome line is split at its colon like any sentence, so it is read here as a line: a colleague
        # named in that line, in the line just before it, or in a later line of the same report, in a line that is not
        # a denial, a question or a condition.
        lines = [line.strip() for line in folded.split("\n") if line.strip()]
        start = next((i for i, line in enumerate(lines) if _in_progress("\n" + line)), None)
        if start is not None:
            for line in lines[max(0, start - 1):]:
                if _not_a_claim(line):
                    continue
                for name, other in names.items():
                    if re.search(rf"(?<![a-z0-9_]){re.escape(name)}(?![a-z0-9_])", line):
                        found.setdefault(other, name)
    for index, sentence in enumerate(sentences):
        if _not_a_claim(sentence):
            continue
        if not (_CLAIM.search(sentence) or (outcome_in_progress and _in_progress(sentence))):
            continue
        # The colleague is named in this sentence or in the one before it ("Kai has it. He is working on it.").
        here = [(name, other) for name, other in names.items() if re.search(rf"(?<![a-z0-9_]){re.escape(name)}(?![a-z0-9_])", sentence)]
        if not here and index > 0:
            before = sentences[index - 1]
            here = [(name, other) for name, other in names.items() if re.search(rf"(?<![a-z0-9_]){re.escape(name)}(?![a-z0-9_])", before)]
        for name, other in here:
            found.setdefault(other, name)
    display = {other: cannot_guard._name_of(prompts.get(other, "")) or name for other, name in found.items()}
    return [(other, display[other]) for other in found]


# ── is a hand-off open ───────────────────────────────────────────────────────────────────────────


def _handoff_target(call: dict) -> tuple[str, str] | None:
    """(call id, folded `bot` argument) of a message_bot call, else None."""
    function = call.get("function") if isinstance(call, dict) else None
    if not isinstance(function, dict) or not isinstance(call.get("id"), str):
        return None
    if not str(function.get("name") or "").endswith(HANDOFF_TOOL):
        return None
    try:
        arguments = json.loads(function.get("arguments") or "{}")
    except ValueError:
        return None
    bot = arguments.get("bot") if isinstance(arguments, dict) else None
    return (call["id"], cannot_guard._fold(str(bot))) if isinstance(bot, str) else (call["id"], "")


def made_handoff_call(messages: list[dict]) -> bool:
    """A message_bot call (any target) in these messages."""
    for message in messages:
        for call in message.get("toolCalls") or []:
            if _handoff_target(call) is not None:
                return True
    return False


def _refused(result: dict | None) -> bool:
    """The hand-off was not sent: the tool said so, or the call came back as an error."""
    if result is None:
        return False  # no result yet: a hand-off waiting for an approval card is open
    text = str(result.get("content") or "")
    return bool(result.get("error")) or text.startswith(("That handoff was not sent", "Refused", "REFUSED"))


def open_handoffs(messages: list[dict], member_id: str, prompts: dict[str, str] | None = None) -> set[str]:
    """Member ids with a hand-off open in this conversation's transcript: a message_bot call that was not refused
    and that no later envelope from that colleague closed (see the module text for why this is the source)."""
    return handoff_states(messages, member_id, prompts)[0]


def handoff_states(
    messages: list[dict], member_id: str, prompts: dict[str, str] | None = None,
) -> tuple[set[str], set[str]]:
    """(open, answered): member ids with a hand-off still open, and member ids whose last hand-off in this
    conversation an envelope already closed (it answered, or never answered and gave up)."""
    prompts = _prompts(prompts)
    names = _names_of(prompts)
    ids = {cannot_guard._fold(member): member for member in prompts}
    results = {m.get("toolCallId"): m for m in messages if m.get("role") == "tool"}
    opened: set[str] = set()
    answered: set[str] = set()
    for position, message in enumerate(messages):
        for call in message.get("toolCalls") or []:
            target = _handoff_target(call)
            if target is None:
                continue
            call_id, bot = target
            other = names.get(bot) or ids.get(bot)
            if other is None:
                continue
            if _refused(results.get(call_id)):
                continue
            name = cannot_guard._fold(cannot_guard._name_of(prompts.get(other, "")) or other)
            closed = False
            for later in messages[position + 1:]:
                if later.get("role") != "user":
                    continue
                text = cannot_guard._fold(message_text(later))
                if re.search(rf"you asked (?:{re.escape(name)}|{re.escape(cannot_guard._fold(other))}) to help with this", text) and (
                    "it answered:" in text or "never answered" in text
                ):
                    closed = True
                    break
            if closed:
                answered.add(other)
            else:
                opened.add(other)
    return opened, answered - opened


# ── when it applies ──────────────────────────────────────────────────────────────────────────────


def is_live_person_turn(messages: list[dict], assertion: str) -> bool:
    """As cannot_guard.is_live_person_turn, except that an envelope earlier in the conversation (a colleague's
    answer relayed on an earlier turn) does not end it: this guard is about the person's latest message, and the
    thread where a colleague has answered is exactly where Iris can claim a second job started."""
    claims = origin.run_claims(assertion)
    initiator = claims.get("initiator")
    if not isinstance(initiator, dict) or initiator.get("kind") not in cannot_guard.LIVE_INITIATORS:
        return False
    if origin.claims_a_handoff(claims):
        return False
    latest = latest_user_message(messages)
    return latest is not None and not origin.is_envelope(latest)


def applies(
    messages: list[dict], story_messages: list[dict], reply: str, assertion: str, offered: set[str] | frozenset[str],
    member_id: str, prompts: dict[str, str] | None = None,
) -> tuple[str, str, bool] | None:
    """(member id, name, answered) of the colleague to name when the turn that ends with `reply` gets the retry, else
    None. `answered` is True when an earlier hand-off to that colleague in this conversation was already closed."""
    if not is_live_person_turn(messages, assertion) or HANDOFF_TOOL not in offered:
        return None
    latest = latest_user_message(messages)
    start = next((i for i, message in enumerate(messages) if message is latest), -1) + 1
    if made_handoff_call(story_messages) or made_handoff_call(messages[start:]):
        return None
    if report_guard.ends_with_question(reply):
        return None
    prompts = _prompts(prompts)
    claimed = claimed_colleagues(reply, member_id, prompts)
    if not claimed:
        return None
    open_now, answered = handoff_states(messages, member_id, prompts)
    for other, name in claimed:
        if other not in open_now:
            return other, name, other in answered
    return None


def reminder(member_id: str, name: str, answered: bool = False) -> str:
    """The last line of the retry's prompt (transcript.render, `closing`). When the colleague's last hand-off was
    already answered, the reply may be reporting that answer, so the note asks which it is instead of saying that
    the colleague received nothing."""
    if answered:
        return (
            f"Your reply above says that {name} has the work now. But no {HANDOFF_TOOL} call was made in this turn, and "
            f"the last hand-off to {name} in this conversation has already come back, so {name} is not working on "
            f"anything from you now. If you meant to give {name} the go or new work, call the {HANDOFF_TOOL} tool now "
            f"with bot \"{name}\" and the task, and say it has started only after the call has returned. If you were "
            f"reporting {name}'s answer, say plainly, in the language of the person's last message, that it is an answer "
            "that came back and not work in progress. Write nothing about this note."
        )
    return (
        f"Your reply above says that {name} has the work. But no {HANDOFF_TOOL} call was made in this turn, and no "
        f"hand-off to {name} is open in this conversation, so {name} has received nothing. If you meant to hand the "
        f"work over, call the {HANDOFF_TOOL} tool now with bot \"{name}\" and a task that states what the person "
        f"asked and what a good answer holds, and say it has started only after the call has returned. Otherwise "
        f"tell the person plainly, in the language of their last message, that nothing was handed over yet, and "
        "what you will do next. Write nothing about this note."
    )
