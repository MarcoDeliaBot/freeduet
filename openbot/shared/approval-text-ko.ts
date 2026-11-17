/**
 * KO for `approval-text.ts` (docs/M1_PLAN.md D50). Plain, short, addressed to the person ("you").
 * Product and tool names stay as they are (FreeDuet, Gmail, Full access, Bot, Spam).
 *
 * Typed as a COMPLETE table: an id added to English alone stops `tsc` here.
 */
import type { CompleteApprovalTextTable } from "./approval-text";

export const APPROVAL_TEXT_KO: CompleteApprovalTextTable = {
  "view.sendEmail": "이메일 보내기",
  "view.sendMessage": "메시지 보내기",
  "rule.title": "메일 규칙 만들기",
  "rule.sentence": "앞으로 {when} 메일은 {done}.",
  "rule.when.fromAddress": "{value}에서 온",
  "rule.when.fromDomain": "{value} 도메인에서 온",
  "rule.when.toAddress": "{value}로 보낸",
  "rule.when.listId": "{value} 목록에서 온",
  "rule.when.subjectContains": "제목에 {value} 포함",
  "rule.when.words": "제목이나 보낸 사람에 {value} 단어가 들어 있는",
  "rule.does.label": "{names} 라벨을 붙입니다",
  "rule.does.markRead": "읽음으로 표시합니다",
  "rule.does.archive": "보관합니다",
  "rule.does.spam": "스팸으로 옮깁니다",
  "rule.does.bin": "휴지통으로 옮깁니다",
  "rule.does.nothing": "아무것도 하지 않습니다",
  "join.and": ", ",
  "rule.happens":
    "당신이 끄기 전까지 FreeDuet이 몇 분마다 새 메일에 다시 묻지 않고 적용합니다. Gmail 필터가 아닙니다. 전달, 답장, 영구 삭제는 절대 하지 않습니다.",
  "rule.happens.existing":
    " 받은편지함에 이미 있는 일치하는 메일에도 한 번 적용합니다.",
  "rule.delete.title": "메일 규칙 삭제",
  "rule.enable.title": "메일 규칙 켜기",
  "rule.disable.title": "메일 규칙 끄기",
  "rule.delete.happens":
    "규칙이 삭제되어 새 메일에 더는 적용되지 않습니다. 이미 옮긴 메일은 그대로 있습니다.",
  "rule.enable.happens":
    "규칙이 다시 적용됩니다. 지금부터 도착하는 메일에 적용됩니다.",
  "rule.disable.happens":
    "규칙이 새 메일에 더는 적용되지 않습니다. 이미 옮긴 메일은 그대로 있습니다.",
  "label.title.named": "{name} 라벨 만들기",
  "label.title": "라벨 만들기",
  "label.happens":
    "Gmail에 비어 있는 새 라벨이 추가됩니다. 메시지는 바뀌지 않습니다.",
  "archive.title": {
    one: "보관: {count}개의 메시지",
    other: "보관: {count}개의 메시지",
  },
  "archive.happens":
    "받은편지함에서 빠지고 라벨은 그대로 두고 전체 메일에 남습니다. 아무것도 삭제되지 않습니다.",
  "spam.title": {
    one: "스팸으로 이동: {count}개의 메시지",
    other: "스팸으로 이동: {count}개의 메시지",
  },
  "spam.happens":
    "스팸 폴더로 갑니다. Gmail은 스팸 메일을 약 30일 뒤에 삭제하며, 그 전에는 되돌릴 수 있습니다.",
  "bin.title": {
    one: "휴지통으로 이동: {count}개의 메시지",
    other: "휴지통으로 이동: {count}개의 메시지",
  },
  "bin.happens":
    "휴지통으로 가서 약 30일 동안 남습니다. 거기서 복원할 수 있습니다. 그 뒤에는 Gmail이 영구 삭제합니다.",
  "mark.read.title": {
    one: "읽음으로 표시: {count}개의 메시지",
    other: "읽음으로 표시: {count}개의 메시지",
  },
  "mark.unread.title": {
    one: "읽지 않음으로 표시: {count}개의 메시지",
    other: "읽지 않음으로 표시: {count}개의 메시지",
  },
  "mark.happens": "읽음 표시 여부만 바뀝니다. 아무것도 삭제되지 않습니다.",
  "labels.add.one.title": {
    one: "{name} 라벨 추가: {count}개의 메시지",
    other: "{name} 라벨 추가: {count}개의 메시지",
  },
  "labels.add.many.title": {
    one: "라벨 {labels}개 추가: {count}개의 메시지",
    other: "라벨 {labels}개 추가: {count}개의 메시지",
  },
  "labels.remove.one.title": {
    one: "{name} 라벨 제거: {count}개의 메시지",
    other: "{name} 라벨 제거: {count}개의 메시지",
  },
  "labels.remove.many.title": {
    one: "라벨 {labels}개 제거: {count}개의 메시지",
    other: "라벨 {labels}개 제거: {count}개의 메시지",
  },
  "labels.change.title": {
    one: "라벨 변경: {count}개의 메시지",
    other: "라벨 변경: {count}개의 메시지",
  },
  "labels.happens":
    "라벨이 추가되거나 제거됩니다. 메시지를 옮기거나 삭제하지 않습니다.",
  "messages.unreadable": {
    one: "지금은 메일함을 읽을 수 없어서 보낸 사람과 내용이 표시되지 않습니다. 지정된 수: {count}.",
    other:
      "지금은 메일함을 읽을 수 없어서 보낸 사람과 내용이 표시되지 않습니다. 지정된 수: {count}.",
  },
  "notFound.text": {
    one: "지정된 {total}개 중 {count}개가 메일함에 없어서 이대로는 거절됩니다.",
    other:
      "지정된 {total}개 중 {count}개가 메일함에 없어서 이대로는 거절됩니다.",
  },
  "reason.credentials":
    "비밀번호, 코드, 2단계 인증, 복구 코드 같은 인증 정보를 바꾸는 일은 항상 당신이 직접 합니다.",
  "reason.securitySettings":
    "계정의 보안, 공유, 접근 설정을 바꾸는 일은 항상 당신이 직접 합니다.",
  "reason.payments": "결제, 구매, 송금은 항상 당신이 직접 합니다.",
  "reason.reviewer.credentials":
    "자동 검토에서 이 작업이 비밀번호, 코드, 2단계 인증 같은 인증 정보를 바꾼다는 것을 확인했습니다. 이 일은 항상 당신이 직접 합니다.",
  "reason.reviewer.securitySettings":
    "자동 검토에서 이 작업이 보안, 공유, 접근 설정을 바꾼다는 것을 확인했습니다. 이 일은 항상 당신이 직접 합니다.",
  "reason.reviewer.payments":
    "자동 검토에서 이 작업이 결제, 구매, 송금을 한다는 것을 확인했습니다. 이 일은 항상 당신이 직접 합니다.",
  "reason.fullAccess": "이 멤버는 Full access가 켜져 있습니다.",
  "reason.fullAccessNoPayments":
    "이 멤버는 결제 제외 Full access가 켜져 있습니다.",
  "reason.ruleHandsOff": "규칙에 따라 이런 작업은 당신에게 넘어옵니다.",
  "reason.ruleAsks": "규칙에 따라 이런 작업 전에 먼저 묻습니다.",
  "reason.ruleAllows": "규칙이 이런 작업을 허용합니다.",
  "reason.preApprovedMet": "당신이 이번 요청에서 바로 이 작업을 요청했습니다.",
  "reason.preApprovedNotMet":
    "규칙은 당신이 요청한 경우에만 허용하는데, 이번 요청에는 없었습니다.",
  "reason.askBeforeChanges": "변경이 일어나기 전에 확인하도록 설정하셨습니다.",
  "reason.noRule": "이에 대해 확인을 요구하는 규칙이나 설정이 없습니다.",
  "reason.mailboxNotAsked":
    "메일함의 이 변경은 당신의 메시지에서 요청한 것이 아니어서 먼저 묻습니다.",
  "reason.unattended":
    "이것은 당신이 보낸 메시지가 아니라 저절로 실행되는 루틴이나 트리거에서 왔으므로 항상 먼저 묻습니다.",
  "reason.tooLongToReview":
    "이 명령이나 스크립트는 너무 길어서 자동 검토기가 전체를 읽을 수 없으므로 당신이 직접 결정합니다.",
  "reason.automation":
    "루틴과 트리거는 나중에 당신 없이 실행되므로, 만들거나 바꾸거나 삭제할 때는 항상 먼저 묻습니다.",
  "reason.setting":
    "Bot이 채팅에서 당신의 설정을 바꿀 때는 Full access가 켜져 있든 아니든 항상 먼저 묻습니다.",
  "reason.remoteWrite":
    "이것은 FreeDuet이 실행되는 컴퓨터와 연결되지 않은 브라우저에서 보낸 것이므로, Full access나 저장된 규칙과 상관없이 항상 먼저 묻습니다. 컴퓨터에서 연결한 브라우저는 전과 같이 작동합니다.",
  "reason.newEmail":
    "새 이메일은 매번 묻습니다. 받는 사람과 내용을 확인한 뒤 이 메일을 허용하거나 거절하세요.",
  "reason.reviewerNone":
    "검토 모델이 설정되어 있지 않아 당신의 승인이 필요합니다.",
  "reason.reviewerInvalid": "검토의 답이 올바른 판정이 아니었습니다.",
  "reason.reviewerUnreachable":
    "검토에 연결할 수 없어서({error}) 당신의 승인이 필요합니다.",
  "remote.answerSentence":
    "FreeDuet이 실행되는 컴퓨터와 연결되지 않은 브라우저에서는 일반 요청을 한 번 허용하거나 거절할 수만 있습니다. 이 요청은 컴퓨터에서 답합니다. 거기서 전체 내용을 읽을 수 있습니다. 아직 그곳에서 기다리고 있습니다.",
};
