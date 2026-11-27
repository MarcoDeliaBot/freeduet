import type { Catalog } from "../translate";
import type { EN } from "./en";

/*
 * Japanese (D181, stage 2): polite (です・ます) where a sentence needs it, and short labels without a
 * pronoun. The words are the ones the site's Japanese pages use: アシスタント for Bot (their word for
 * the members), メンバー for member, チーム for team, 引き継ぎ for hand-off, ルーティン for routine,
 * エンジン for engine, 承認 for approval. Full access and FreeDuet stay as they are. The approval
 * cards (openbot/shared/approval-text-ja.ts) still say Bot, and this file does not change them.
 * Japanese has one plural form, so `one` and `other` hold the same text: Intl.PluralRules("ja")
 * selects only "other". Not yet checked by a person who reads Japanese.
 */
export const ja: Catalog<typeof EN> = {
  "sign.title": "{product} にログイン",
  "sign.continueWith": "{provider}で続行",
  "sign.opening": "{provider}を開いています…",
  "sign.openError":
    "{provider}のログインを開けませんでした。もう一度お試しください。",
  "sign.ssoRequired":
    "組織の方針により、会社のアカウントでログインする必要があります。",
  "sign.pairLead":
    "このブラウザはまだ{product}とペアリングされていません。{product}が動いているコンピューターで",
  "sign.pairTail":
    "を実行してください。{product}がここで開き、すぐに使えます。",
  "sign.notSetUp":
    "ログインはまだ設定されていません。先に管理者が設定する必要があります。",
  "sign.or": "または",
  "sign.emailPlaceholder": "you@company.com",
  "sign.openingCompany": "開いています…",
  "sign.continueCompany": "会社のアカウントで続行",
  "sign.adminSignIn": "管理者のログイン",
  "sign.noCompany": "このアドレスには会社のログインが設定されていません。",
  "shell.menu": "メニュー",
  "shell.everything": "すべて",
  "shell.everythingLine": "すべてのチャンネルにまたがるチャットの内容",
  "shell.channelsError":
    "チャンネルを読み込めませんでした。ページを再読み込みしてください。",
  "shell.channels": "チャンネル",
  "shell.newChannel": "新しいチャンネル",
  "shell.archived": "アーカイブ済み",
  "shell.archivedChannels": "アーカイブ済みのチャンネル",
  "shell.unarchive": "アーカイブを解除",
  "shell.unarchiveNamed": "{name}のアーカイブを解除",
  "shell.earlier": "以前の会話",
  "shell.manage": "管理",
  "shell.signOut": "ログアウト",
  "nav.bots": "アシスタント",
  "nav.connections": "接続",
  "nav.capabilities": "機能",
  "nav.routines": "ルーティン",
  "nav.approvalRules": "承認ルール",
  "nav.admin": "管理",
  "nav.dashboard": "ダッシュボード",
  "nav.settings": "設定",
  "tab.main": "メイン",
  "tab.chat": "チャット",
  "tab.tasks": "タスク",
  "tab.make": "作成",
  "tab.waiting": "{tab}、{badge}件待機中",
  "header.chat": "{product}のチャット",
  "header.settings": "あなたの設定",
  "header.back": "戻る",
  "header.more": "その他",
  "composer.ask": "何でも聞いてください",
  "composer.message": "メッセージ",
  "composer.queue": "メッセージをキューに入れる",
  "composer.send": "メッセージを送信",
  "composer.stop": "アシスタントを停止",
  "composer.showCall": "音声通話を表示",
  "composer.startCall": "音声通話を開始",
  "composer.callBot": "このアシスタントと通話",
  "composer.callUnsupported":
    "音声通話には、マイクと安全な（HTTPS）接続が必要です",
  "composer.speak": "音声でメッセージを入力",
  "composer.dictateTitle": "やることを、すべて話してください",
  "composer.attach": "ファイルを添付",
  "composer.moreUnavailable": "メッセージのその他の操作は使えません",
  "composer.messageNamed": "{name}へのメッセージ",
  "chat.botsError":
    "アシスタントを読み込めませんでした。ページを再読み込みしてください。",
  "chat.noBots": "まだアシスタントがいません。",
  "chat.conversationError":
    "会話を読み込めませんでした。ページを再読み込みしてください。",
  "chat.stillStarting":
    "会話をまだ開始しています。少し待ってから、もう一度お試しください。",
  "chat.startError": "会話を開始できませんでした。もう一度お試しください。",
  "attention.questions": {
    one: "{count}件の質問",
    other: "{count}件の質問",
  },
  "attention.approvals": {
    one: "{count}件の承認待ち",
    other: "{count}件の承認待ち",
  },
  "attention.handoffs": {
    one: "{count}件の止まった引き継ぎ",
    other: "{count}件の止まった引き継ぎ",
  },
  "attention.unread": {
    one: "{count}件の未読の会話",
    other: "{count}件の未読の会話",
  },
  "attention.needYou": {
    one: "あなたの対応が必要なことが{count}件あります",
    other: "あなたの対応が必要なことが{count}件あります",
  },
  "attention.open": "{summary}。アシスタントを開いて対応してください。",
  "attention.unreadMessages": "未読のメッセージ",
  "bots.new": "新しいアシスタント",
  "bots.purpose":
    "あなたのアシスタントと、あなたと共有されたアシスタントです。それぞれが何をしていて、あなたに何が必要かを確認できます。",
  "bots.loadError":
    "アシスタントを読み込めませんでした。ページを再読み込みしてください。",
  "bots.needsYou": "対応が必要",
  "bots.pinned": "ピン留め",
  "bots.yours": "あなたのアシスタント",
  "bots.shared": "共有されたアシスタント",
  "bots.allPinned": "あなたのアシスタントは、すべて上にピン留めされています。",
  "bots.allNeedYou":
    "あなたのアシスタントは、すべて「対応が必要」の下にあります。",
  "bots.none":
    "まだアシスタントがいません。「新しいアシスタント」から作成できます。",
  "bots.nobodyShared": "まだ、アシスタントを共有してくれた人はいません。",
  "bots.hide": "非表示にする",
  "bots.show": "表示する",
  "bots.hidden": "非表示",
  "bots.hiddenDescription": {
    one: "非表示にしたアシスタントが{count}人います。変わるのは一覧だけです。",
    other:
      "非表示にしたアシスタントが{count}人います。変わるのは一覧だけです。",
  },
  "bots.paused": "一時停止中",
  "bots.message": "メッセージ",
  "bots.wroteIn": {
    one: "{name}が、まだ読んでいない会話{count}件に書き込みました。",
    other: "{name}が、まだ読んでいない会話{count}件に書き込みました。",
  },
  "bots.readNewest": "最新を読む",
  "bots.resuming": "再開しています…",
  "bots.pausedResume": "一時停止中。再開",
  "botPage.purpose":
    "このアシスタントがあなたのために何をしているか、どのように設定されているか。",
  "botPage.fallbackTitle": "アシスタント",
  "botPage.openError":
    "このアシスタントを開けませんでした。あなたと共有されていない可能性があります。",
  "profile.forYou": "あなたのため",
  "profile.settingsError":
    "このアシスタントの設定を読み込めませんでした。ページを再読み込みしてください。",
  "profile.active": "稼働中",
  "profile.pausedDescription":
    "一時停止中です。オンに戻すまで、あなたのために何も動きません。",
  "profile.activeDescription":
    "ルーティン、担当業務、引き継ぎ、フォローアップを、あなたのために実行します。",
  "profile.notifications": "通知",
  "profile.notifyDescription":
    "{level}。サイドバーのバッジは、いつも表示されます。",
  "profile.notify.all": "すべて",
  "profile.notify.needsInput": "対応が必要なときだけ",
  "profile.notify.none": "なし（バッジのみ）",
  "profile.browserNotifications": "ブラウザーの通知",
  "profile.browserOff":
    "このブラウザーではオフです。オンにすると、アシスタントに対応が必要なときに知らせます。",
  "profile.turnOn": "オンにする",
  "profile.startConversation": "会話を始めてください。",
  "stalled.what": "{name}は完了しませんでした：{task}",
  "stalled.why": "理由：{reason}。",
  "stalled.retryError":
    "もう一度試せませんでした。すでに実行中の可能性があります。",
  "stalled.dismissError":
    "閉じられませんでした。すでに実行中の可能性があります。",
  "stalled.dismissing": "閉じています…",
  "stalled.dismissed": "閉じました",
  "stalled.dismiss": "閉じる",
  "stalled.retrying": "もう一度試しています…",
  "stalled.queued": "再びキューに入りました",
  "stalled.retry": "もう一度試す",
  "stalled.open": "会話を開く",
  "dash.title": "ダッシュボード",
  "dash.notAvailable": "まだ利用できません",
  "dash.tokensNotCounted": "今日はまだ、集計されたやり取りがありません。",
  "dash.countsUnavailable": "トークン数は、今は確認できません。",
  "dash.enginesLink": "エンジンを管理",
  "dash.teamLink": "すべてのメンバー",
  "dash.waitingForYou": "あなたの対応待ち",
  "dash.available": "利用可能",
  "dash.loading": "チームを読み込んでいます…",
  "dash.nothingWaits": "あなたの対応待ちはありません。",
  "dash.thingsWait": {
    one: "あなたの対応待ちが{count}件あります。",
    other: "あなたの対応待ちが{count}件あります。",
  },
  "dash.partialCount": "{turns}回の試行のうち{reported}回が数を報告しました",
  "dash.inputPlusOutput": "入力と出力の合計（各エンジンの報告どおり）",
  "dash.nothingSaved": "今日はまだ、無料のエンジンを通ったものはありません",
  "dash.firstFor": {
    one: "{count}人のメンバーで初めて",
    other: "{count}人のメンバーで初めて",
  },
  "dash.members": {
    one: "{count}人のメンバー",
    other: "{count}人のメンバー",
  },
  "dash.indicators": "指標",
  "dash.tokensToday": "今日のトークン",
  "dash.savedToday": "今日、無料のエンジンで節約できた分",
  "dash.waitingSub": "質問、承認、止まった引き継ぎ",
  "dash.nextRoutine": "次のルーティン",
  "dash.noRoutine": "予定されているルーティンはありません。",
  "dash.team": "チーム",
  "dash.engines": "エンジン",
  "dash.noEngine": "まだエンジンが設定されていません。",
  "dash.perMemberAria": "メンバーごとのトークン",
  "dash.perMember": "メンバーごとのトークン（今日）",
  "dash.foot":
    "数は、各エンジンが報告した値を、UTCの日単位で集計したものです。最近の活動のログと、プランの上限のゲージは、まだ利用できません。",
  "voice.heardNothing":
    "何も聞き取れませんでした。マイクをタップしてもう一度試すか、入力してください。",
  "voice.tapWhenDone": "話し終えたら、マイクをタップしてください",
  "voice.discard": "破棄",
  "voice.start": "音声入力を開始",
  "voice.stopAndSend": "音声入力を止めて送信",
  "voice.typeInstead": "代わりに入力する",
  "voice.retry": "やり直す",
  "voice.recordAgain": "もう一度録音",
  "voice.writing": "話した内容を書き起こしています…",
  "voice.listeningStop": "聞いています…話が途切れたら止まります",
  "voice.listening": "聞いています。そのまま話し始めてください。",
  "voice.permission": "マイクの許可を待っています…",
  "home.bots": "チームを確認して、アシスタントごとに管理します。",
  "home.capabilities": "スキルと記憶。",
  "home.connectionsLabel": "アカウント、アプリ、メールのルール",
  "home.connections": "アカウント、アプリ、メールのどれかを接続します。",
  "home.setupLabel": "セットアップの確認リスト",
  "home.setup": "設定済みのものと、残りを確認します。",
  "home.approvalsLabel": "承認ルールとFull access",
  "home.approvals": "アシスタントが、あなたに確認せずにできること。",
  "home.passwordsLabel": "パスワード",
  "home.passwords": "チームが使ってよいパスワードです。",
  "home.routines": "自動で繰り返される作業と、週の表示です。",
  "home.notifications": "更新のお知らせが届く場所です。",
  "home.admin": "コンピューター、認証情報、制限、人、監査ログ。",
  "home.engines":
    "アシスタントごとに、どのエンジンが、どの順番で答えるか、今日どれだけ使ったか。順番を変えるまで、あなたのサブスクリプションが最初です。",
  "home.safety": "安全性",
  "home.jobs": "仕事",
  "home.system": "システム",
  "settings.description":
    "チーム、接続したアカウント、個人の設定を管理します。",
  "settings.sections": "設定のセクション",
  "settings.workspace": "ワークスペース",
  "settings.preferences": "環境設定",
  "settings.devices": "デバイスと情報",
  "settings.appearance": "外観",
  "settings.matchPhone": "スマートフォンに合わせる",
  "settings.light": "ライト",
  "settings.dark": "ダーク",
  "settings.voice": "音声",
  "settings.shortcuts": "キーボードショートカット",
  "language.section": "言語",
  "language.title": "アプリの言語",
  "language.description":
    "メニューとボタンの言語です。チームは、チャットで設定した言語であなたに書きます。",
  "language.auto": "自動（ブラウザー）",
  "settings.descriptionPlain":
    "{product}の見た目と動作を、あなた向けに整えます。",
  "wide.yourTeam": "あなたのチーム",
  "wide.team": "チーム",
  "wide.stateWaiting": "あなたの対応待ち",
  "wide.stateWorking": "作業中",
  "wide.memberLabel": "{name}、{line}",
  "chat.loadingConversation": "この会話を読み込んでいます",
  "chat.readAloud": "読み上げる",
  "chat.stopReading": "読み上げを止める",
  "chat.thinking": "考え中",
  "chat.queued": "キュー待ち",
  "chat.removeQueued": "キュー待ちのメッセージを削除：{what}",
  "chat.remove": "削除",
  "chat.routineRan": "ルーティンが実行されました。",
  "chat.firstDayYes": "そのとおりです",
  "chat.firstDayNo": "何か違います",
  "chat.tryingAgain": "もう一度試しています。",
  "chat.responsibilityRan": "担当業務が実行されました。",
  "chat.trigger": "きっかけ：",
  "chat.details": "詳細",
  "chat.via": "{source}経由",
  "chat.untitledFile": "無題のファイル",
  "chat.attachment": "添付ファイル",
  "chat.attachmentLower": "添付ファイル",
  "chat.attachmentNamed": "添付ファイル：{name}",
  "chat.unavailableNamed": "{name}は利用できません。",
  "chat.unavailable": "この添付ファイルは利用できません。",
  "chat.openNamed": "{name}を開く",
  "chat.close": "閉じる",
  "chat.generatedInterface": "このアシスタントが作成した画面",
  "chat.usedBrowser": "ブラウザーを使用",
  "chat.hostAndMore": "{host}ほか{amount}件",
  "chat.searchedWeb": "ウェブ検索",
  "chat.readPages": {
    one: "{amount}ページの読み取り",
    other: "{amount}ページの読み取り",
  },
  "chat.browsedPages": {
    one: "{amount}ページの閲覧",
    other: "{amount}ページの閲覧",
  },
  "chat.usedBrowserPhrase": "ブラウザーの利用",
  "chat.usedNamed": "{name}の利用",
  "chat.usedConnectors": {
    one: "{amount}件のコネクターの利用",
    other: "{amount}件のコネクターの利用",
  },
  "chat.usedTools": {
    one: "{amount}件のツールの利用",
    other: "{amount}件のツールの利用",
  },
  "chat.andJoin": "{head}と{last}",
  "chat.inProgress": "進行中",
  "chat.waitingForYou": "あなたの対応待ち",
  "chat.notCompleted": "完了していません",
  "chat.blocked": "ブロック中",
  "chat.didntWork": "うまくいきませんでした",
  "chat.couldntFinishStep": "このステップを完了できませんでした。",
  "chat.issues": {
    one: "{amount}件の問題",
    other: "{amount}件の問題",
  },
  "settings.addRepository": "リポジトリを追加",
  "settings.approvals": "承認",
  "settings.appsSharedBots": "共有されたアシスタントに使わせるアプリ",
  "settings.backToApp": "アプリに戻る",
  "settings.cancel": "キャンセル",
  "settings.cannotMakeCode":
    "コードは、コンピューターとペアリングされたブラウザーで作成します。このブラウザーでは作成できません。",
  "settings.cantLink":
    "{provider}のアカウントはまだ連携できません。先に管理者が設定する必要があります。",
  "settings.changesDescription":
    "アシスタントがチャットから変更した設定です。「元に戻す」を押すと、7日間は古い値に戻せます。ただし、その設定が変更後の値のままである場合に限ります。",
  "settings.changesEmpty": "チャットでの変更は、まだありません。",
  "settings.changesLoading": "変更を読み込んでいます…",
  "settings.changesTitle": "チャットでの変更",
  "settings.charactersOf": "{used}/{limit}文字",
  "settings.checkLinkError":
    "このアカウントを連携できるかどうかを確認できませんでした：{error}",
  "settings.code": "コード",
  "settings.codeExpires":
    "このコードは一度だけ使えて、10分で期限切れになります。",
  "settings.codeRanOut":
    "そのコードは期限切れです。新しいコードを作成してください。",
  "settings.componentsGallery": "コンポーネントのギャラリー",
  "settings.computer": "コンピューター",
  "settings.connect": "接続",
  "settings.connectEvents": "イベントを接続",
  "settings.connectNamed": "{name}に接続",
  "settings.copied": "コピーしました",
  "settings.copy": "コピー",
  "settings.copyFailed":
    "コピーできませんでした。コードを選択して、手動でコピーしてください。",
  "settings.deliveriesEmpty": "まだ配信はありません。",
  "settings.deliveriesTitle": "最近の配信",
  "settings.deploymentOwn": "導入先の既定値",
  "settings.devicesDescription":
    "スマートフォンの{product}アプリにログインし、通知をオンにすると、ここに追加されます。",
  "settings.devicesEmpty": "まだデバイスはありません。",
  "settings.devicesTitle": "あなたのデバイス",
  "settings.disconnect": "切断",
  "settings.disconnectError": "{name}を切断できませんでした：{error}",
  "settings.disconnectNamed": "{name}を切断",
  "settings.done": "完了",
  "settings.emphasisBot": "アシスタント名",
  "settings.emphasisConversation": "会話のタイトル",
  "settings.emphasisDescription": "サイドバーで目立たせる行を選びます。",
  "settings.emphasisPreview": "メッセージ一覧のプレビュー",
  "settings.emphasisTitle": "メッセージ一覧の強調",
  "settings.general": "一般",
  "settings.githubConnectError": "GitHubに接続できませんでした：{error}",
  "settings.githubLinkFailed":
    "GitHubアカウントを連携できませんでした。もう一度お試しください。",
  "settings.githubLinked": "GitHubアカウントが連携されています。",
  "settings.githubTaken":
    "そのGitHubアカウントは、{product}で別の人と連携されています。別のアカウントでGitHubにログインしてから、もう一度お試しいただくか、管理者にご相談ください。",
  "settings.kindDecision": "判断",
  "settings.kindDecisionDescription": "アシスタントが動く前に必要な承認です。",
  "settings.kindProgress": "進捗",
  "settings.kindProgressDescription":
    "あなたが見ていなかった作業からの返信と結果です。",
  "settings.kindQuestion": "質問",
  "settings.kindQuestionDescription":
    "アシスタントがあなたに尋ね、回答を待っていることです。",
  "settings.languageChanged":
    "チーム向けのあなたの言語が、{from}から{to}に変わりました。",
  "settings.lastSeen": "最終利用：{when}",
  "settings.levelAll": "すべて",
  "settings.levelNeedsInput": "対応が必要なときだけ",
  "settings.linkBroughtCode":
    "リンクからコードが届きました。このブラウザーに名前を付けて、「ペアリング」を押してください。",
  "settings.linkSlack": "Slackアカウントを連携",
  "settings.linked": "連携済み",
  "settings.loadAccountError": "アカウントを読み込めませんでした：{error}",
  "settings.loading": "読み込んでいます…",
  "settings.localAddress":
    "このアドレスは、このコンピューターでのみ使えます。スマートフォンには、外部からFreeDuetにアクセスするためのアドレスが必要です。そのアドレスをスマートフォンで開き、設定でコードを入力してください。",
  "settings.madeWhen": "作成：{when}",
  "settings.makeCode": "コードを作成",
  "settings.memberAdded": "{member}がチームに追加されました。",
  "settings.name": "名前",
  "settings.nameChanged":
    "{bot}：あなたがつけた名前が、{from}から{to}に変わりました。",
  "settings.nameOwn": "アシスタント自身の名前",
  "settings.needsReconnect": "再接続が必要",
  "settings.needsReconnectHandle": "再接続が必要 · @{handle}",
  "settings.noItalianVoice":
    "このコンピューターには、イタリア語の音声がありません。そのため、ここでは返信を読み上げられません。",
  "settings.notLinked": "未連携",
  "settings.notSetUp": "未設定",
  "settings.notifyChanged": "{bot}：通知が{from}から{to}に変わりました。",
  "settings.pairThisDescription":
    "FreeDuetが動いているコンピューターで「設定」を開き、「スマートフォンや別のブラウザーをペアリング」の下にある「コードを作成」を押してから、表示されたリンクを開くか、ここにコードを入力してください。",
  "settings.pairThisTitle": "このブラウザーをペアリング",
  "settings.pairedDescription":
    "ペアリングされたスマートフォンや別のブラウザーは、このブラウザーと同じように動きます。取り消すと、次のリクエストで接続が切れ、ログアウトされます。",
  "settings.pairedDone":
    "このブラウザーは、コンピューターとペアリングされています。",
  "settings.pairedTitle": "スマートフォンや別のブラウザーをペアリング",
  "settings.phone": "スマートフォン",
  "settings.phoneOrBrowser": "スマートフォンまたは別のブラウザー",
  "settings.qrLabel": "ペアリング用のリンクを含むQRコード",
  "settings.readAloudDescription":
    "アシスタントの返信ごとに「読み上げ」ボタンを追加します。読み上げには、このコンピューターの音声だけを使い、どこにも送信しません。",
  "settings.readAloudTitle": "返信を読み上げる",
  "settings.rename": "名前を変更",
  "settings.repositories": "リポジトリ",
  "settings.repositoriesDescription":
    "ここでリポジトリを追加し、下のアドレスと同じシークレットを使って、GitHubでWebhookを追加してください。そうすると、そのイベント（issues.opened など）で担当業務を開始できます。",
  "settings.repositoriesEmpty":
    "まだリポジトリはありません。「リポジトリを追加」から追加してください。",
  "settings.repository": "リポジトリ",
  "settings.reset": "リセット",
  "settings.resetDescription":
    "すべての回答を忘れて、共有されたアシスタントがそれぞれ改めて尋ねるようにします。",
  "settings.resetDone":
    "リセットしました。共有されたアシスタントが、それぞれ改めて尋ねます。",
  "settings.revoke": "取り消す",
  "settings.routingDescription":
    "離れているときに、各種の更新がどこに届くかを設定します。Web版の{product}では、常にすべてが表示されます。",
  "settings.routingError":
    "更新の届き先を読み込めませんでした。ページを再読み込みしてください。",
  "settings.routingTitle": "更新の届き先",
  "settings.runsOut":
    "あなたとしてログインしているスマートフォンで、このQRコードを読み取るか、リンクを開いてください。または、「設定」を開いてコードを入力してください。コードは一度だけ使え、{time}で期限切れになります。",
  "settings.sameSecret":
    "GitHubでWebhookを追加するときは、同じシークレットを使ってください。",
  "settings.sampleBot": "汎用アシスタント",
  "settings.sampleTitle": "来週の計画",
  "settings.save": "保存",
  "settings.saved": "保存しました",
  "settings.saving": "保存しています…",
  "settings.setup": "セットアップ",
  "settings.sharedBots": "共有されたアシスタント",
  "settings.sharedBotsDescription":
    "あなたと共有されたアシスタントは、持ち主のアプリを使います。あなたのアプリは、会話の中で許可したときにだけ使います。",
  "settings.slackCodeError": "Slackのコードを作成できませんでした：{error}",
  "settings.standingDescription":
    "すべての会話で、すべてのアシスタントに適用されます。アシスタントの役割は、何をするかを示します。ここでは、文章のスタイルのように、どう進めてほしいかを書きます。",
  "settings.standingTitle": "常設の指示",
  "settings.switchLabel": "{transport}の{kind}",
  "settings.thisBrowserTag": "（このブラウザー）",
  "settings.toneChanged": "{bot}：口調が{from}から{to}に変わりました。",
  "settings.undo": "元に戻す",
  "settings.undoFailed": "変更を元に戻せませんでした。もう一度お試しください。",
  "settings.undoGone": "もう元に戻せません",
  "settings.undoing": "元に戻しています…",
  "settings.undone": "元に戻しました",
  "settings.webhookSecret": "Webhookのシークレット",
  "settings.yourAccount": "あなたのアカウント",
  "bot.activity.kindRoutine": "ルーティン",
  "bot.activity.kindResponsibility": "担当業務",
  "bot.activity.kindHandoff": "引き継ぎ",
  "bot.activity.kindApproval": "承認",
  "bot.activity.kindQuestion": "質問",
  "bot.activity.kindFollowUp": "フォローアップ",
  "bot.activity.needsYou": "対応が必要",
  "bot.activity.stop": "停止",
  "bot.activity.stopping": "停止しています…",
  "bot.activity.cancelling": "キャンセルしています…",
  "bot.activity.open": "開く",
  "bot.activity.title": "アクティビティ",
  "bot.activity.scheduled": "予定",
  "bot.activity.completed": "完了",
  "bot.activity.emptyInProgress":
    "実行中のものも、あなたの対応待ちのものもありません。",
  "bot.activity.emptyScheduled": "予定されているものはありません。",
  "bot.activity.emptyCompleted": "まだ完了したものはありません。",
  "bot.activity.loadError":
    "このアシスタントのアクティビティを読み込めませんでした。ページを再読み込みしてください。",
  "bot.settings.heading": "このアシスタントの設定",
  "bot.area.responsibilities": "担当業務",
  "bot.area.reaching": "連絡手段",
  "bot.area.memory": "記憶",
  "bot.area.access": "スキルとアクセス",
  "bot.area.sharing": "共有",
  "bot.settings.activeCount": {
    one: "{count}件が有効",
    other: "{count}件が有効",
  },
  "bot.settings.noneActive": "有効なものはありません",
  "bot.settings.ruleCount": {
    one: "{count}件のルール",
    other: "{count}件のルール",
  },
  "bot.settings.noRules": "ルールはありません",
  "bot.settings.routineCount": {
    one: "{count}件のルーティン",
    other: "{count}件のルーティン",
  },
  "bot.settings.noRoutines": "ルーティンはありません",
  "bot.access.skillsDescription":
    "このアシスタントで使うには、スキルをオンにしてください。会話で / と入力すると実行できます。",
  "bot.access.yourSkills": "あなたのスキル",
  "bot.access.skillsError":
    "スキルを読み込めませんでした。ページを再読み込みしてください。",
  "bot.access.noSkills": "まだスキルはありません。",
  "bot.access.writeOne": "作成する",
  "bot.access.title": "利用できるもの",
  "bot.access.grantedDescription":
    "このアシスタントが利用できるアプリとスキル、そして各アプリがあなたにとって使える状態かどうかです。それ以外は利用できません。",
  "bot.access.grantedError":
    "このアシスタントが利用できるものを読み込めませんでした。ページを再読み込みしてください。",
  "bot.access.readyError":
    "各アプリが使える状態かどうかを確認できませんでした。ページを再読み込みしてください。",
  "bot.access.noApps":
    "まだアプリはありません。管理者が追加する必要があります。それまで、このアシスタントはあなたと話すことしかできません。",
  "bot.access.toolsAndMore": "{list}ほか{count}件",
  "bot.access.toolCount": {
    one: "{count}件のツール",
    other: "{count}件のツール",
  },
  "bot.access.skillLabel": "スキル",
  "bot.access.manageNamed": "このアシスタントの{title}を管理",
  "bot.reset.conversations": {
    one: "会話{count}件",
    other: "会話{count}件",
  },
  "bot.reset.memorySources": {
    one: "記憶の情報源{count}件",
    other: "記憶の情報源{count}件",
  },
  "bot.reset.memories": {
    one: "取り込まれた記憶{count}件",
    other: "取り込まれた記憶{count}件",
  },
  "bot.reset.routines": {
    one: "ルーティン{count}件",
    other: "ルーティン{count}件",
  },
  "bot.reset.responsibilities": {
    one: "担当業務{count}件",
    other: "担当業務{count}件",
  },
  "bot.reset.followUps": {
    one: "予定されたフォローアップ{count}件",
    other: "予定されたフォローアップ{count}件",
  },
  "bot.reset.formedMemories": {
    one: "アシスタントが作った記憶{count}件",
    other: "アシスタントが作った記憶{count}件",
  },
  "bot.reset.research": {
    one: "バックグラウンドでの調査{count}件",
    other: "バックグラウンドでの調査{count}件",
  },
  "bot.reset.standing": {
    one: "常設の許可{count}件",
    other: "常設の許可{count}件",
  },
  "bot.reset.title": "{name}をリセットしますか？",
  "bot.reset.description":
    "これにより、{name}があなたとの間に持っているものが削除されます。ほかの人の会話やデータは残ります。この操作は元に戻せません。",
  "bot.reset.planError":
    "リセットで何が削除されるかを確認できませんでした。もう一度お試しください。",
  "bot.reset.done":
    "完了しました。{name}は、あなたとまっさらな状態から始まります。",
  "bot.reset.nothing": "削除できるものはありません。",
  "bot.reset.willDelete": "次のものが削除されます：",
  "bot.reset.sharedKept": {
    one: "{count}件の会話は、ほかの人やアシスタントと共有されているため、残ります。",
    other:
      "{count}件の会話は、ほかの人やアシスタントと共有されているため、残ります。",
  },
  "bot.reset.memoriesKept": "あなたがアシスタントに直接伝えた記憶は残ります。",
  "bot.reset.resetting": "リセットしています…",
  "bot.reset.submit": "削除してリセット",
  "bot.manage.pinnedAssigned":
    "管理者があなたに割り当てました。あなたのアシスタント一覧の一番上に固定されたままになります。",
  "bot.manage.pinnedOn":
    "あなたのアシスタント一覧の一番上にあります。変わるのは一覧だけです。",
  "bot.manage.pinnedOff":
    "あなたのアシスタント一覧の一番上に固定します。変わるのは一覧だけです。",
  "bot.manage.hiddenAssigned":
    "管理者があなたに割り当てました。非表示にはできません。",
  "bot.manage.hiddenOn":
    "あなたのアシスタント一覧の「非表示」の下にあります。変わるのは一覧だけです。",
  "bot.manage.hiddenOff":
    "あなたのアシスタント一覧から外します。変わるのは一覧だけです。",
  "bot.manage.duplicate": "複製",
  "bot.manage.duplicateDescription":
    "自分用のコピーを作成します。会話とキーはコピーされません。",
  "bot.manage.resetDescription":
    "このアシスタントとの会話、あなたについて覚えていること、予定された作業を削除します。先に一覧が表示されます。",
  "bot.manage.delete": "削除",
  "bot.manage.deleteDescription":
    "すべての人から削除します。この操作は元に戻せません。",
  "bot.manage.deleteTitle": "{name}を削除しますか？",
  "bot.manage.deleteConfirm":
    "全員から削除されます。この操作は元に戻せません。",
  "bot.manage.deleting": "削除しています…",
  "bot.setup.title": "タイトル",
  "bot.setup.whatItDoes": "役割",
  "bot.setup.identity": "基本情報",
  "bot.setup.systemOwned": "システム所有",
  "bot.setup.systemOwnedDescription":
    "{product}に付属しています。個人の所有ではありません。",
  "bot.setup.visibility": "公開範囲",
  "bot.setup.visiblePrivate": "あなただけが見られ、会話を始められます。",
  "bot.setup.visiblePublic": "{product}のすべての人が見つけて使えます。",
  "bot.setup.private": "非公開",
  "bot.setup.public": "公開",
  "bot.setup.saveError": "保存できませんでした。もう一度お試しください。",
  "bot.setup.checkField": "この項目を確認して、もう一度お試しください。",
  "bot.setup.connection": "接続",
  "bot.setup.builtIn": "内蔵",
  "bot.setup.agentUrl": "エージェントのURL",
  "bot.setup.builtInDescription":
    "{product}の中で動きます。接続するものはありません。",
  "bot.sharing.published": "公開済み",
  "bot.sharing.toWholeTeam": "チーム全体へ",
  "bot.sharing.toPeople": "{who}へ",
  "bot.sharing.groupNamed": "グループ{name}",
  "bot.sharing.teamPrivate":
    "それぞれの人がこのアシスタントと行う会話は、非公開です。",
  "bot.sharing.notVisibleYet":
    "正式な名前と説明が設定されるまで、チームメンバーには表示されません。",
  "bot.sharing.unpublish": "公開を取り消す",
  "bot.sharing.link": "リンク",
  "bot.sharing.linkDescription": "このアシスタントとの非公開の会話を開きます。",
  "bot.sharing.copyLink": "リンクをコピー",
  "bot.sharing.publicNotPublished":
    "チームには公開されていません。このアシスタントは公開設定なので、{product}のすべての人がすでに使えます。",
  "bot.sharing.onlyYouCanUse": "公開されていません。あなただけが使えます。",
  "bot.sharing.notPublished": "公開されていません。",
  "bot.sharing.whoPublishedTo": "公開先",
  "bot.sharing.publish": "公開",
  "bot.sharing.publishNote":
    "公開しても、公開範囲は変わりません。いつでも公開を取り消せます。",
  "bot.sharing.audience": "対象",
  "bot.sharing.notPublishedSummary": "未公開",
  "bot.sharing.theWholeTeam": "チーム全体",
  "bot.sharing.specificPeople": "特定の人またはグループ",
  "bot.sharing.peopleCount": {
    one: "{count}人",
    other: "{count}人",
  },
  "bot.sharing.groupCount": {
    one: "{count}グループ",
    other: "{count}グループ",
  },
  "bot.sharing.assignToGroups": "グループに割り当てる",
  "bot.sharing.assignDescription":
    "このアシスタントを、グループの各メンバーのアシスタント一覧の一番上にピン留めします。チーム全体には * を使います。",
  "bot.sharing.publishedTo": "公開先",
  "bot.sharing.peopleByEmail": "メールアドレスで指定する人",
  "bot.sharing.commaSeparated": "カンマで区切る",
  "bot.sharing.groups": "グループ",
  "bot.sharing.update": "更新",
  "bot.sharing.publishToTeam": "チームに公開",
  "bot.sharing.assignNamed": "{name}をグループに割り当てる",
  "bot.sharing.assignNote":
    "すべてのメンバーのアシスタント一覧の一番上にピン留めされます。",
  "bot.sharing.groupOrStar": "グループ、または *",
  "bot.sharing.wholeTeamPlaceholder": "* でチーム全体を指定",
  "bot.sharing.assign": "割り当てる",
  "bot.sharing.removeNamed": "{name}を削除",
  "bot.sharing.wholeTeam": "チーム全体",
  "bot.sharing.notAssigned": "どのグループにも割り当てられていません。",
  "bot.sharing.assignRow": "グループに割り当てる",
  "bot.page.accessPurpose":
    "このアシスタントが使えるスキル、アプリ、ほかのアシスタントです。",
  "bot.page.approvalsPurpose":
    "このアシスタントが、先にあなたに尋ねずにできること。",
  "bot.page.memoryPurpose":
    "このアシスタントが学習元にするアプリと、バックグラウンドであなたのために行う調査です。",
  "bot.page.memoryPointer":
    "アシスタントがあなたについて覚えていることは、次にあります：",
  "bot.page.reachPurpose":
    "Slack、Microsoft Teams、またはSMSで、このアシスタントとの会話を続けられます。",
  "bot.page.responsibilitiesPurpose":
    "このアシスタントがあなたのために取り組む、継続的な目標です。各実行のきっかけと、見つかったことを確認できます。",
  "bot.page.routinesPurpose":
    "このアシスタントが、予定に沿ってあなたのために行うことです。オフにする、今すぐ実行する、削除するのいずれかができます。",
  "bot.page.setupPurpose":
    "このアシスタントが何者か、誰が見つけられるか、どこで動くか。",
  "bot.page.sharingPurpose":
    "ほかに誰がこのアシスタントを使えるか。それぞれの人がこのアシスタントと行う会話は非公開です。",
};
