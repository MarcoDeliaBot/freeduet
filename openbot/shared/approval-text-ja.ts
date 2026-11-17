/**
 * JA for `approval-text.ts` (docs/M1_PLAN.md D50). Plain, short, addressed to the person ("you").
 * Product and tool names stay as they are (FreeDuet, Gmail, Full access, Bot, Spam).
 *
 * Typed as a COMPLETE table: an id added to English alone stops `tsc` here.
 */
import type { CompleteApprovalTextTable } from "./approval-text";

export const APPROVAL_TEXT_JA: CompleteApprovalTextTable = {
  "view.sendEmail": "メールを送信",
  "view.sendMessage": "メッセージを送信",
  "rule.title": "メールのルールを作成",
  "rule.sentence": "今後、{when}メールは、{done}。",
  "rule.when.fromAddress": "{value}からの",
  "rule.when.fromDomain": "ドメイン{value}からの",
  "rule.when.toAddress": "{value}宛ての",
  "rule.when.listId": "リスト{value}からの",
  "rule.when.subjectContains": "件名に{value}を含む",
  "rule.when.words": "件名または送信者に{value}を含む",
  "rule.does.label": "ラベル{names}を付ける",
  "rule.does.markRead": "既読にする",
  "rule.does.archive": "アーカイブする",
  "rule.does.spam": "迷惑メールに移動する",
  "rule.does.bin": "ゴミ箱に移動する",
  "rule.does.nothing": "何もしない",
  "join.and": "、",
  "rule.happens":
    "FreeDuetは、あなたがオフにするまで、数分ごとに新着メールへ、あらためて確認せずに適用します。Gmailのフィルタではありません。転送、返信、完全な削除は一切しません。",
  "rule.happens.existing":
    "また、受信トレイにある一致するメールにも一度だけ適用します。",
  "rule.delete.title": "メールのルールを削除",
  "rule.enable.title": "メールのルールをオン",
  "rule.disable.title": "メールのルールをオフ",
  "rule.delete.happens":
    "ルールは削除され、新着メールには適用されなくなります。すでに移動したメールはそのままです。",
  "rule.enable.happens":
    "ルールが再び有効になり、今後届くメールに適用されます。",
  "rule.disable.happens":
    "ルールは新着メールに適用されなくなります。すでに移動したメールはそのままです。",
  "label.title.named": "ラベル{name}を作成",
  "label.title": "ラベルを作成",
  "label.happens":
    "Gmailに新しい空のラベルが追加されます。メッセージは変更されません。",
  "archive.title": {
    one: "アーカイブ: {count}件のメッセージ",
    other: "アーカイブ: {count}件のメッセージ",
  },
  "archive.happens":
    "受信トレイから外れ、ラベルはそのまま「すべてのメール」に残ります。何も削除されません。",
  "spam.title": {
    one: "迷惑メールに移動: {count}件のメッセージ",
    other: "迷惑メールに移動: {count}件のメッセージ",
  },
  "spam.happens":
    "迷惑メールフォルダに移動します。Gmailは迷惑メールを約30日後に削除します。それまでは元に戻せます。",
  "bin.title": {
    one: "ゴミ箱に移動: {count}件のメッセージ",
    other: "ゴミ箱に移動: {count}件のメッセージ",
  },
  "bin.happens":
    "ゴミ箱に移動し、約30日間そこに残ります。そこから復元できます。その後、Gmailが完全に削除します。",
  "mark.read.title": {
    one: "既読にする: {count}件のメッセージ",
    other: "既読にする: {count}件のメッセージ",
  },
  "mark.unread.title": {
    one: "未読にする: {count}件のメッセージ",
    other: "未読にする: {count}件のメッセージ",
  },
  "mark.happens": "既読かどうかの表示だけが変わります。何も削除されません。",
  "labels.add.one.title": {
    one: "ラベル{name}を追加: {count}件のメッセージ",
    other: "ラベル{name}を追加: {count}件のメッセージ",
  },
  "labels.add.many.title": {
    one: "ラベル{labels}個を追加: {count}件のメッセージ",
    other: "ラベル{labels}個を追加: {count}件のメッセージ",
  },
  "labels.remove.one.title": {
    one: "ラベル{name}を外す: {count}件のメッセージ",
    other: "ラベル{name}を外す: {count}件のメッセージ",
  },
  "labels.remove.many.title": {
    one: "ラベル{labels}個を外す: {count}件のメッセージ",
    other: "ラベル{labels}個を外す: {count}件のメッセージ",
  },
  "labels.change.title": {
    one: "ラベルを変更: {count}件のメッセージ",
    other: "ラベルを変更: {count}件のメッセージ",
  },
  "labels.happens":
    "ラベルが追加または外されます。メッセージの移動や削除はありません。",
  "messages.unreadable": {
    one: "今はメールボックスを読み込めなかったため、送信者や内容は表示されません。指定された数: {count}。",
    other:
      "今はメールボックスを読み込めなかったため、送信者や内容は表示されません。指定された数: {count}。",
  },
  "notFound.text": {
    one: "指定された{total}件のうち{count}件がメールボックスにないため、このままでは拒否されます。",
    other:
      "指定された{total}件のうち{count}件がメールボックスにないため、このままでは拒否されます。",
  },
  "reason.credentials":
    "パスワード、コード、2段階認証、リカバリーコードなどの認証情報の変更は、いつもあなた自身が行います。",
  "reason.securitySettings":
    "アカウントのセキュリティ、共有、アクセスの設定の変更は、いつもあなた自身が行います。",
  "reason.payments": "支払い、購入、送金は、いつもあなた自身が行います。",
  "reason.reviewer.credentials":
    "自動チェックで、これがパスワード、コード、2段階認証などの認証情報を変更すると分かりました。これはいつもあなた自身が行います。",
  "reason.reviewer.securitySettings":
    "自動チェックで、これがセキュリティ、共有、アクセスの設定を変更すると分かりました。これはいつもあなた自身が行います。",
  "reason.reviewer.payments":
    "自動チェックで、これが支払い、購入、送金を行うと分かりました。これはいつもあなた自身が行います。",
  "reason.fullAccess": "このメンバーはFull accessがオンです。",
  "reason.fullAccessNoPayments":
    "このメンバーは支払いなしのFull accessがオンです。",
  "reason.ruleHandsOff": "ルールにより、この種の操作はあなたに任されます。",
  "reason.ruleAsks": "ルールにより、この種の操作の前に確認します。",
  "reason.ruleAllows": "ルールでこの種の操作は許可されています。",
  "reason.preApprovedMet": "あなたはこの依頼で、まさにこの操作を求めました。",
  "reason.preApprovedNotMet":
    "ルールは、あなたが求めた場合だけ許可しますが、今回の依頼にはありませんでした。",
  "reason.askBeforeChanges": "変更が起こる前に確認したい、と設定されています。",
  "reason.noRule": "これについて確認を求めるルールや設定はありません。",
  "reason.mailboxNotAsked":
    "メールボックスへのこの変更は、あなた自身のメッセージでは求められていないため、先に確認します。",
  "reason.unattended":
    "これはあなたのメッセージではなく、自動で動くルーティンまたはトリガーからのため、必ず先に確認します。",
  "reason.tooLongToReview":
    "このコマンドまたはスクリプトは長すぎて、自動レビュアーが全文を読めないため、あなたが判断します。",
  "reason.automation":
    "ルーティンやトリガーは後からあなたなしで動くため、作成・変更・削除は必ず先に確認します。",
  "reason.setting":
    "BotがチャットからあなたのFull accessの有無にかかわらず設定を変更するときは、必ず先に確認します。",
  "reason.remoteWrite":
    "これは、FreeDuetが動くコンピューターとペアリングされていないブラウザーから送られたため、Full accessや保存したルールに関係なく、必ず先に確認します。コンピューターでペアリングしたブラウザーは、これまでどおりです。",
  "reason.newEmail":
    "新しいメールは毎回確認します。宛先と内容を確かめて、このメールを許可するか拒否してください。",
  "reason.reviewerNone":
    "チェック用のモデルが設定されていないため、あなたの承認が必要です。",
  "reason.reviewerInvalid": "チェックの回答が有効な判定ではありませんでした。",
  "reason.reviewerUnreachable":
    "チェックに接続できなかったため({error})、あなたの承認が必要です。",
  "remote.answerSentence":
    "FreeDuetが動くコンピューターとペアリングされていないブラウザーでは、通常の依頼を一度だけ許可するか拒否できます。この依頼はコンピューターで答えます。そこで全文を読めます。まだそこで待っています。",
};
