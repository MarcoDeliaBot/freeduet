/**
 * ZH for `approval-text.ts` (docs/M1_PLAN.md D50). Plain, short, addressed to the person ("you").
 * Product and tool names stay as they are (FreeDuet, Gmail, Full access, Bot, Spam).
 *
 * Typed as a COMPLETE table: an id added to English alone stops `tsc` here.
 */
import type { CompleteApprovalTextTable } from "./approval-text";

export const APPROVAL_TEXT_ZH: CompleteApprovalTextTable = {
  "view.sendEmail": "发送邮件",
  "view.sendMessage": "发送消息",
  "rule.title": "创建邮件规则",
  "rule.sentence": "从现在起,{when}的邮件:{done}。",
  "rule.when.fromAddress": "来自 {value}",
  "rule.when.fromDomain": "来自域名 {value}",
  "rule.when.toAddress": "发给 {value}",
  "rule.when.listId": "来自列表 {value}",
  "rule.when.subjectContains": "主题含有 {value}",
  "rule.when.words": "主题或发件人含有 {value}",
  "rule.does.label": "添加标签 {names}",
  "rule.does.markRead": "标为已读",
  "rule.does.archive": "归档",
  "rule.does.spam": "移到垃圾邮件",
  "rule.does.bin": "移到废纸篓",
  "rule.does.nothing": "什么也不做",
  "join.and": "并",
  "rule.happens":
    "FreeDuet 每隔几分钟对新邮件执行,不再询问,直到你关掉它。它不是 Gmail 过滤器。它从不转发、不回复,也从不永久删除。",
  "rule.happens.existing": " 它还会对收件箱里已有的匹配邮件执行一次。",
  "rule.delete.title": "删除邮件规则",
  "rule.enable.title": "打开邮件规则",
  "rule.disable.title": "关闭邮件规则",
  "rule.delete.happens":
    "规则会被移除,不再作用于新邮件。它已移动的邮件保持原位。",
  "rule.enable.happens": "规则重新生效,作用于从现在起收到的邮件。",
  "rule.disable.happens": "规则不再作用于新邮件。它已移动的邮件保持原位。",
  "label.title.named": "创建标签 {name}",
  "label.title": "创建标签",
  "label.happens": "你的 Gmail 会新增一个空标签。不会更改任何邮件。",
  "archive.title": { one: "归档 {count} 封邮件", other: "归档 {count} 封邮件" },
  "archive.happens":
    "它们会离开收件箱,保留在“所有邮件”中,标签不变。不会删除任何内容。",
  "spam.title": {
    one: "将 {count} 封邮件 移到垃圾邮件",
    other: "将 {count} 封邮件 移到垃圾邮件",
  },
  "spam.happens":
    "它们会进入垃圾邮件文件夹。Gmail 约 30 天后删除垃圾邮件;在此之前你可以移回。",
  "bin.title": {
    one: "将 {count} 封邮件 移到废纸篓",
    other: "将 {count} 封邮件 移到废纸篓",
  },
  "bin.happens":
    "它们会进入废纸篓并保留约 30 天。你可以从那里恢复。之后 Gmail 会永久删除。",
  "mark.read.title": {
    one: "将 {count} 封邮件 标为已读",
    other: "将 {count} 封邮件 标为已读",
  },
  "mark.unread.title": {
    one: "将 {count} 封邮件 标为未读",
    other: "将 {count} 封邮件 标为未读",
  },
  "mark.happens": "只改变是否显示为已读。不会删除任何内容。",
  "labels.add.one.title": {
    one: "给 {count} 封邮件 添加标签 {name}",
    other: "给 {count} 封邮件 添加标签 {name}",
  },
  "labels.add.many.title": {
    one: "给 {count} 封邮件 添加 {labels} 个标签",
    other: "给 {count} 封邮件 添加 {labels} 个标签",
  },
  "labels.remove.one.title": {
    one: "从 {count} 封邮件 移除标签 {name}",
    other: "从 {count} 封邮件 移除标签 {name}",
  },
  "labels.remove.many.title": {
    one: "从 {count} 封邮件 移除 {labels} 个标签",
    other: "从 {count} 封邮件 移除 {labels} 个标签",
  },
  "labels.change.title": {
    one: "更改 {count} 封邮件 的标签",
    other: "更改 {count} 封邮件 的标签",
  },
  "labels.happens": "标签会被添加或移除。不会移动或删除任何邮件。",
  "messages.unreadable": {
    one: "现在无法读取你的邮箱,所以不显示发件人和内容。指定的数量:{count}。",
    other: "现在无法读取你的邮箱,所以不显示发件人和内容。指定的数量:{count}。",
  },
  "notFound.text": {
    one: "指定的 {total} 封中有 {count} 封不在你的邮箱里,所以这个请求会按原样被拒绝。",
    other:
      "指定的 {total} 封中有 {count} 封不在你的邮箱里,所以这个请求会按原样被拒绝。",
  },
  "reason.credentials":
    "更改密码、验证码、两步验证、恢复码或其他凭据,始终由你自己来做。",
  "reason.securitySettings":
    "更改账户的安全、共享或访问设置,始终由你自己来做。",
  "reason.payments": "付款、购买或转账,始终由你自己来做。",
  "reason.reviewer.credentials":
    "自动检查发现这会更改密码、验证码、两步验证或其他凭据。这始终由你自己来做。",
  "reason.reviewer.securitySettings":
    "自动检查发现这会更改安全、共享或访问设置。这始终由你自己来做。",
  "reason.reviewer.payments":
    "自动检查发现这会付款、购买或转账。这始终由你自己来做。",
  "reason.fullAccess": "这位成员已开启 Full access。",
  "reason.fullAccessNoPayments": "这位成员已开启不含付款的 Full access。",
  "reason.ruleHandsOff": "有一条规则把这类操作交给你处理。",
  "reason.ruleAsks": "有一条规则要求在这类操作前先询问。",
  "reason.ruleAllows": "有一条规则允许这类操作。",
  "reason.preApprovedMet": "你在这次请求里明确要求了这个操作。",
  "reason.preApprovedNotMet": "规则只在你提出要求时才允许,而这次请求里没有。",
  "reason.askBeforeChanges": "你设置了在更改发生之前先让你确认。",
  "reason.noRule": "没有任何规则或偏好要求为此询问。",
  "reason.mailboxNotAsked":
    "你在自己的消息里没有要求对邮箱做这个更改,所以先问你。",
  "reason.unattended":
    "这来自自动运行的例行任务或触发器,而不是你发的消息,所以总是先问你。",
  "reason.automation":
    "例行任务和触发器之后会在没有你的情况下运行,所以创建、更改或删除它们总是先问你。",
  "reason.setting":
    "Bot 在聊天中更改你的某项设置时,无论 Full access 是否开启,总是先问你。",
  "reason.remoteWrite":
    "这是你从一个没有与运行 FreeDuet 的电脑配对的浏览器发出的,所以无论 Full access 或你保存的规则怎么说,总是先问你。在电脑上配对的浏览器和以前一样。",
  "reason.newEmail":
    "新邮件每次都会询问。请检查发给谁、写了什么,然后允许这封或拒绝它。",
  "reason.reviewerNone": "没有配置检查模型,所以需要你的批准。",
  "reason.reviewerInvalid": "检查的回答不是有效的结论。",
  "reason.reviewerUnreachable": "无法连接检查({error}),所以需要你的批准。",
  "remote.answerSentence":
    "没有与运行 FreeDuet 的电脑配对的浏览器,只能对普通请求允许一次或拒绝。这个请求要在电脑上回答,你可以在那里读到全部内容。它仍在那里等待。",
};
