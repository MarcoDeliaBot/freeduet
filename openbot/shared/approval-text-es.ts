/**
 * ES for `approval-text.ts` (docs/M1_PLAN.md D50). Plain, short, addressed to the person ("you").
 * Product and tool names stay as they are (FreeDuet, Gmail, Full access, Bot, Spam).
 *
 * Typed as a COMPLETE table: an id added to English alone stops `tsc` here.
 */
import type { CompleteApprovalTextTable } from "./approval-text";

export const APPROVAL_TEXT_ES: CompleteApprovalTextTable = {
  "view.sendEmail": "Enviar correo",
  "view.sendMessage": "Enviar un mensaje",
  "rule.title": "Crear una regla de correo",
  "rule.sentence": "A partir de ahora, el correo {when}: {done}.",
  "rule.when.fromAddress": "de {value}",
  "rule.when.fromDomain": "del dominio {value}",
  "rule.when.toAddress": "enviado a {value}",
  "rule.when.listId": "de la lista {value}",
  "rule.when.subjectContains": "con {value} en el asunto",
  "rule.when.words": "con las palabras {value} en el asunto o el remitente",
  "rule.does.label": "poner la etiqueta {names}",
  "rule.does.markRead": "marcar como leído",
  "rule.does.archive": "archivar",
  "rule.does.spam": "mover a Spam",
  "rule.does.bin": "mover a la Papelera",
  "rule.does.nothing": "no hacer nada",
  "join.and": " y ",
  "rule.happens":
    "FreeDuet la aplica al correo nuevo cada pocos minutos, sin volver a preguntar, hasta que la apagues. No es un filtro de Gmail. Nunca reenvía, nunca responde y nunca borra para siempre.",
  "rule.happens.existing":
    " También se aplica una vez al correo que coincide y ya está en tu bandeja de entrada.",
  "rule.delete.title": "Eliminar una regla de correo",
  "rule.enable.title": "Activar una regla de correo",
  "rule.disable.title": "Desactivar una regla de correo",
  "rule.delete.happens":
    "La regla se quita y deja de aplicarse al correo nuevo. El correo que ya movió se queda donde está.",
  "rule.enable.happens":
    "La regla vuelve a aplicarse, al correo que llegue a partir de ahora.",
  "rule.disable.happens":
    "La regla deja de aplicarse al correo nuevo. El correo que ya movió se queda donde está.",
  "label.title.named": "Crear la etiqueta {name}",
  "label.title": "Crear una etiqueta",
  "label.happens":
    "Se añade a tu Gmail una etiqueta nueva y vacía. No se cambia ningún mensaje.",
  "archive.title": {
    one: "Archivar {count} mensaje",
    other: "Archivar {count} mensajes",
  },
  "archive.happens":
    "Salen de la bandeja de entrada y se quedan en Todos los mensajes, con sus etiquetas. No se borra nada.",
  "spam.title": {
    one: "Mover {count} mensaje a Spam",
    other: "Mover {count} mensajes a Spam",
  },
  "spam.happens":
    "Van a tu carpeta de Spam. Gmail borra el correo de Spam tras unos 30 días; hasta entonces puedes devolverlo.",
  "bin.title": {
    one: "Mover {count} mensaje a la Papelera",
    other: "Mover {count} mensajes a la Papelera",
  },
  "bin.happens":
    "Van a tu Papelera y se quedan unos 30 días. Puedes restaurarlos desde ahí. Después Gmail los borra para siempre.",
  "mark.read.title": {
    one: "Marcar como leído: {count} mensaje",
    other: "Marcar como leído: {count} mensajes",
  },
  "mark.unread.title": {
    one: "Marcar como no leído: {count} mensaje",
    other: "Marcar como no leído: {count} mensajes",
  },
  "mark.happens": "Solo cambia si aparecen como leídos o no. No se borra nada.",
  "labels.add.one.title": {
    one: "Añadir la etiqueta {name} a {count} mensaje",
    other: "Añadir la etiqueta {name} a {count} mensajes",
  },
  "labels.add.many.title": {
    one: "Añadir {labels} etiquetas a {count} mensaje",
    other: "Añadir {labels} etiquetas a {count} mensajes",
  },
  "labels.remove.one.title": {
    one: "Quitar la etiqueta {name} de {count} mensaje",
    other: "Quitar la etiqueta {name} de {count} mensajes",
  },
  "labels.remove.many.title": {
    one: "Quitar {labels} etiquetas de {count} mensaje",
    other: "Quitar {labels} etiquetas de {count} mensajes",
  },
  "labels.change.title": {
    one: "Cambiar las etiquetas de {count} mensaje",
    other: "Cambiar las etiquetas de {count} mensajes",
  },
  "labels.happens":
    "Se añaden o se quitan etiquetas. No se mueve ni se borra ningún mensaje.",
  "messages.unreadable": {
    one: "No se pudo leer tu buzón ahora mismo, así que no se muestra de quién son ni de qué tratan. Indicados: {count}.",
    other:
      "No se pudo leer tu buzón ahora mismo, así que no se muestra de quién son ni de qué tratan. Indicados: {count}.",
  },
  "notFound.text": {
    one: "De los {total} mensajes indicados, {count} no están en tu buzón, así que esto se rechazará tal como está.",
    other:
      "De los {total} mensajes indicados, {count} no están en tu buzón, así que esto se rechazará tal como está.",
  },
  "reason.credentials":
    "Cambiar una contraseña, un código, la verificación en dos pasos, un código de recuperación u otra credencial lo haces siempre tú.",
  "reason.securitySettings":
    "Cambiar los ajustes de seguridad, de uso compartido o de acceso de una cuenta lo haces siempre tú.",
  "reason.payments": "Pagar, comprar o mover dinero lo haces siempre tú.",
  "reason.reviewer.credentials":
    "La revisión automática vio que esto cambia una contraseña, un código, la verificación en dos pasos u otra credencial. Eso lo haces siempre tú.",
  "reason.reviewer.securitySettings":
    "La revisión automática vio que esto cambia ajustes de seguridad, de uso compartido o de acceso. Eso lo haces siempre tú.",
  "reason.reviewer.payments":
    "La revisión automática vio que esto paga, compra o mueve dinero. Eso lo haces siempre tú.",
  "reason.fullAccess": "Full access está activado para este miembro.",
  "reason.fullAccessNoPayments":
    "Full access sin pagos está activado para este miembro.",
  "reason.ruleHandsOff": "Una regla te pasa este tipo de acción a ti.",
  "reason.ruleAsks": "Una regla pregunta antes de este tipo de acción.",
  "reason.ruleAllows": "Una regla permite este tipo de acción.",
  "reason.preApprovedMet": "Pediste esta acción exacta en esta solicitud.",
  "reason.preApprovedNotMet":
    "Una regla solo lo permite si lo pediste tú, y la solicitud de esta vez no lo pedía.",
  "reason.askBeforeChanges":
    "Pediste revisar los cambios antes de que ocurran.",
  "reason.noRule": "Ninguna regla ni preferencia pide revisar esto.",
  "reason.mailboxNotAsked":
    "No pediste este cambio en tu buzón en tu propio mensaje, así que te pregunta primero.",
  "reason.unattended":
    "Esto viene de una rutina o un disparador que funciona solo, no de un mensaje tuyo, así que siempre te pregunta primero.",
  "reason.tooLongToReview":
    "Este comando o script es demasiado largo para que el revisor automático lo lea entero, así que decides tú.",
  "reason.automation":
    "Las rutinas y los disparadores actúan más tarde sin ti, así que crear uno, cambiarlo o borrarlo siempre te pregunta primero.",
  "reason.setting":
    "Cuando un Bot cambia uno de tus ajustes desde el chat, siempre te pregunta primero, con Full access activado o no.",
  "reason.remoteWrite":
    "Esto lo enviaste desde un navegador que no está emparejado con el ordenador donde funciona FreeDuet, así que siempre te pregunta primero, digan lo que digan Full access o tus reglas guardadas. Un navegador emparejado en el ordenador funciona como antes.",
  "reason.newEmail":
    "Un correo nuevo se pregunta cada vez. Mira a quién va y qué dice, y luego permite este o recházalo.",
  "reason.reviewerNone":
    "No hay ningún modelo de revisión configurado, así que hace falta tu aprobación.",
  "reason.reviewerInvalid":
    "La respuesta de la revisión no era un veredicto válido.",
  "reason.reviewerUnreachable":
    "No se pudo contactar con la revisión ({error}), así que hace falta tu aprobación.",
  "remote.answerSentence":
    "Un navegador que no está emparejado con el ordenador donde funciona FreeDuet puede permitir una solicitud normal una vez o rechazarla. Esta se responde en el ordenador, donde puedes leerla entera. Sigue esperando allí.",
};
