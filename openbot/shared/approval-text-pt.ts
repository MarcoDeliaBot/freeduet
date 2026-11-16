/**
 * PT for `approval-text.ts` (docs/M1_PLAN.md D50). Plain, short, addressed to the person ("you").
 * Product and tool names stay as they are (FreeDuet, Gmail, Full access, Bot, Spam).
 *
 * Typed as a COMPLETE table: an id added to English alone stops `tsc` here.
 */
import type { CompleteApprovalTextTable } from "./approval-text";

export const APPROVAL_TEXT_PT: CompleteApprovalTextTable = {
  "view.sendEmail": "Enviar e-mail",
  "view.sendMessage": "Enviar uma mensagem",
  "rule.title": "Criar uma regra de e-mail",
  "rule.sentence": "A partir de agora, o e-mail {when}: {done}.",
  "rule.when.fromAddress": "de {value}",
  "rule.when.fromDomain": "do domínio {value}",
  "rule.when.toAddress": "enviado para {value}",
  "rule.when.listId": "da lista {value}",
  "rule.when.subjectContains": "com {value} no assunto",
  "rule.when.words": "com as palavras {value} no assunto ou no remetente",
  "rule.does.label": "pôr a etiqueta {names}",
  "rule.does.markRead": "marcar como lido",
  "rule.does.archive": "arquivar",
  "rule.does.spam": "mover para o Spam",
  "rule.does.bin": "mover para o Lixo",
  "rule.does.nothing": "não fazer nada",
  "join.and": " e ",
  "rule.happens":
    "O FreeDuet aplica-a ao e-mail novo de poucos em poucos minutos, sem voltar a perguntar, até a desligares. Não é um filtro do Gmail. Nunca reencaminha, nunca responde e nunca apaga para sempre.",
  "rule.happens.existing":
    " Também é aplicada uma vez ao e-mail correspondente que já está na tua caixa de entrada.",
  "rule.delete.title": "Apagar uma regra de e-mail",
  "rule.enable.title": "Ligar uma regra de e-mail",
  "rule.disable.title": "Desligar uma regra de e-mail",
  "rule.delete.happens":
    "A regra é removida e deixa de se aplicar ao e-mail novo. O e-mail que ela já moveu fica onde está.",
  "rule.enable.happens":
    "A regra volta a aplicar-se, ao e-mail que chegar a partir de agora.",
  "rule.disable.happens":
    "A regra deixa de se aplicar ao e-mail novo. O e-mail que ela já moveu fica onde está.",
  "label.title.named": "Criar a etiqueta {name}",
  "label.title": "Criar uma etiqueta",
  "label.happens":
    "É adicionada ao teu Gmail uma etiqueta nova e vazia. Nenhuma mensagem é alterada.",
  "archive.title": {
    one: "Arquivar {count} mensagem",
    other: "Arquivar {count} mensagens",
  },
  "archive.happens":
    "Saem da caixa de entrada e ficam em Todo o correio, com as suas etiquetas. Nada é apagado.",
  "spam.title": {
    one: "Mover {count} mensagem para o Spam",
    other: "Mover {count} mensagens para o Spam",
  },
  "spam.happens":
    "Vão para a tua pasta de Spam. O Gmail apaga o que está no Spam passados cerca de 30 dias; até lá podes voltar a movê-lo.",
  "bin.title": {
    one: "Mover {count} mensagem para o Lixo",
    other: "Mover {count} mensagens para o Lixo",
  },
  "bin.happens":
    "Vão para o teu Lixo e ficam lá cerca de 30 dias. Podes restaurá-los a partir daí. Depois o Gmail apaga-os para sempre.",
  "mark.read.title": {
    one: "Marcar como lido: {count} mensagem",
    other: "Marcar como lido: {count} mensagens",
  },
  "mark.unread.title": {
    one: "Marcar como não lido: {count} mensagem",
    other: "Marcar como não lido: {count} mensagens",
  },
  "mark.happens": "Só muda se aparecem como lidos ou não. Nada é apagado.",
  "labels.add.one.title": {
    one: "Adicionar a etiqueta {name} a {count} mensagem",
    other: "Adicionar a etiqueta {name} a {count} mensagens",
  },
  "labels.add.many.title": {
    one: "Adicionar {labels} etiquetas a {count} mensagem",
    other: "Adicionar {labels} etiquetas a {count} mensagens",
  },
  "labels.remove.one.title": {
    one: "Tirar a etiqueta {name} de {count} mensagem",
    other: "Tirar a etiqueta {name} de {count} mensagens",
  },
  "labels.remove.many.title": {
    one: "Tirar {labels} etiquetas de {count} mensagem",
    other: "Tirar {labels} etiquetas de {count} mensagens",
  },
  "labels.change.title": {
    one: "Alterar as etiquetas de {count} mensagem",
    other: "Alterar as etiquetas de {count} mensagens",
  },
  "labels.happens":
    "São adicionadas ou retiradas etiquetas. Nenhuma mensagem é movida nem apagada.",
  "messages.unreadable": {
    one: "Não foi possível ler a tua caixa agora, por isso não se mostra de quem são nem sobre o quê. Indicadas: {count}.",
    other:
      "Não foi possível ler a tua caixa agora, por isso não se mostra de quem são nem sobre o quê. Indicadas: {count}.",
  },
  "notFound.text": {
    one: "Das {total} mensagens indicadas, {count} não estão na tua caixa, por isso isto será recusado tal como está.",
    other:
      "Das {total} mensagens indicadas, {count} não estão na tua caixa, por isso isto será recusado tal como está.",
  },
  "reason.credentials":
    "Mudar uma palavra-passe, um código, a verificação em dois passos, um código de recuperação ou outra credencial és sempre tu que fazes.",
  "reason.securitySettings":
    "Mudar as definições de segurança, de partilha ou de acesso de uma conta és sempre tu que fazes.",
  "reason.payments": "Pagar, comprar ou mover dinheiro és sempre tu que fazes.",
  "reason.reviewer.credentials":
    "A verificação automática viu que isto muda uma palavra-passe, um código, a verificação em dois passos ou outra credencial. Isso és sempre tu que fazes.",
  "reason.reviewer.securitySettings":
    "A verificação automática viu que isto muda definições de segurança, de partilha ou de acesso. Isso és sempre tu que fazes.",
  "reason.reviewer.payments":
    "A verificação automática viu que isto paga, compra ou move dinheiro. Isso és sempre tu que fazes.",
  "reason.fullAccess": "O Full access está ligado para este membro.",
  "reason.fullAccessNoPayments":
    "O Full access sem pagamentos está ligado para este membro.",
  "reason.ruleHandsOff": "Uma regra passa este tipo de ação para ti.",
  "reason.ruleAsks": "Uma regra pergunta antes deste tipo de ação.",
  "reason.ruleAllows": "Uma regra permite este tipo de ação.",
  "reason.preApprovedMet": "Pediste esta ação exata neste pedido.",
  "reason.preApprovedNotMet":
    "Uma regra só o permite se o pediste, e o pedido desta vez não o pedia.",
  "reason.askBeforeChanges":
    "Pediste para rever as alterações antes de acontecerem.",
  "reason.noRule": "Nenhuma regra ou preferência pede para rever isto.",
  "reason.mailboxNotAsked":
    "Não pediste esta alteração à tua caixa de correio na tua própria mensagem, por isso pergunta-te primeiro.",
  "reason.unattended":
    "Isto vem de uma rotina ou de um gatilho que corre sozinho, não de uma mensagem tua, por isso pergunta-te sempre primeiro.",
  "reason.automation":
    "As rotinas e os gatilhos agem mais tarde sem ti, por isso criar um, alterá-lo ou apagá-lo pergunta-te sempre primeiro.",
  "reason.setting":
    "Quando um Bot muda uma definição tua a partir do chat, pergunta-te sempre primeiro, com o Full access ligado ou não.",
  "reason.remoteWrite":
    "Enviaste isto de um navegador que não está emparelhado com o computador onde o FreeDuet corre, por isso pergunta-te sempre primeiro, diga o que disser o Full access ou as tuas regras guardadas. Um navegador emparelhado no computador funciona como antes.",
  "reason.newEmail":
    "Um e-mail novo é perguntado de cada vez. Vê a quem vai e o que diz, e depois permite este ou recusa-o.",
  "reason.reviewerNone":
    "Não há nenhum modelo de verificação configurado, por isso é preciso a tua aprovação.",
  "reason.reviewerInvalid":
    "A resposta da verificação não era um veredicto válido.",
  "reason.reviewerUnreachable":
    "Não foi possível contactar a verificação ({error}), por isso é preciso a tua aprovação.",
  "remote.answerSentence":
    "Um navegador que não está emparelhado com o computador onde o FreeDuet corre pode permitir um pedido normal uma vez ou recusá-lo. Este responde-se no computador, onde o podes ler por inteiro. Continua à espera lá.",
};
