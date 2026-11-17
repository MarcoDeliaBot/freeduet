/**
 * FR for `approval-text.ts` (docs/M1_PLAN.md D50). Plain, short, addressed to the person ("you").
 * Product and tool names stay as they are (FreeDuet, Gmail, Full access, Bot, Spam).
 *
 * Typed as a COMPLETE table: an id added to English alone stops `tsc` here.
 */
import type { CompleteApprovalTextTable } from "./approval-text";

export const APPROVAL_TEXT_FR: CompleteApprovalTextTable = {
  "view.sendEmail": "Envoyer un e-mail",
  "view.sendMessage": "Envoyer un message",
  "rule.title": "Créer une règle de messagerie",
  "rule.sentence": "Désormais, pour les e-mails {when} : {done}.",
  "rule.when.fromAddress": "de {value}",
  "rule.when.fromDomain": "du domaine {value}",
  "rule.when.toAddress": "envoyés à {value}",
  "rule.when.listId": "de la liste {value}",
  "rule.when.subjectContains": "avec {value} dans l'objet",
  "rule.when.words": "avec les mots {value} dans l'objet ou l'expéditeur",
  "rule.does.label": "mettre le libellé {names}",
  "rule.does.markRead": "marquer comme lu",
  "rule.does.archive": "archiver",
  "rule.does.spam": "déplacer dans Spam",
  "rule.does.bin": "déplacer dans la Corbeille",
  "rule.does.nothing": "ne rien faire",
  "join.and": " et ",
  "rule.happens":
    "FreeDuet l'applique aux nouveaux e-mails toutes les quelques minutes, sans redemander, jusqu'à ce que tu la désactives. Ce n'est pas un filtre Gmail. Elle ne transfère jamais, ne répond jamais et ne supprime jamais définitivement.",
  "rule.happens.existing":
    " Elle est aussi appliquée une fois aux e-mails correspondants déjà dans ta boîte de réception.",
  "rule.delete.title": "Supprimer une règle de messagerie",
  "rule.enable.title": "Activer une règle de messagerie",
  "rule.disable.title": "Désactiver une règle de messagerie",
  "rule.delete.happens":
    "La règle est retirée et ne s'applique plus aux nouveaux e-mails. Les e-mails qu'elle a déjà déplacés restent où ils sont.",
  "rule.enable.happens":
    "La règle s'applique de nouveau, aux e-mails qui arrivent à partir de maintenant.",
  "rule.disable.happens":
    "La règle ne s'applique plus aux nouveaux e-mails. Les e-mails qu'elle a déjà déplacés restent où ils sont.",
  "label.title.named": "Créer le libellé {name}",
  "label.title": "Créer un libellé",
  "label.happens":
    "Un nouveau libellé vide est ajouté à ton Gmail. Aucun message n'est modifié.",
  "archive.title": {
    one: "Archiver {count} message",
    other: "Archiver {count} messages",
  },
  "archive.happens":
    "Ils quittent la boîte de réception et restent dans Tous les messages, avec leurs libellés. Rien n'est supprimé.",
  "spam.title": {
    one: "Déplacer {count} message dans Spam",
    other: "Déplacer {count} messages dans Spam",
  },
  "spam.happens":
    "Ils vont dans ton dossier Spam. Gmail supprime les messages du Spam après environ 30 jours ; d'ici là, tu peux les remettre.",
  "bin.title": {
    one: "Déplacer {count} message dans la Corbeille",
    other: "Déplacer {count} messages dans la Corbeille",
  },
  "bin.happens":
    "Ils vont dans ta Corbeille et y restent environ 30 jours. Tu peux les y restaurer. Ensuite, Gmail les supprime définitivement.",
  "mark.read.title": {
    one: "Marquer {count} message comme lu",
    other: "Marquer {count} messages comme lus",
  },
  "mark.unread.title": {
    one: "Marquer {count} message comme non lu",
    other: "Marquer {count} messages comme non lus",
  },
  "mark.happens":
    "Seul change le fait qu'ils apparaissent comme lus ou non. Rien n'est supprimé.",
  "labels.add.one.title": {
    one: "Ajouter le libellé {name} à {count} message",
    other: "Ajouter le libellé {name} à {count} messages",
  },
  "labels.add.many.title": {
    one: "Ajouter {labels} libellés à {count} message",
    other: "Ajouter {labels} libellés à {count} messages",
  },
  "labels.remove.one.title": {
    one: "Retirer le libellé {name} de {count} message",
    other: "Retirer le libellé {name} de {count} messages",
  },
  "labels.remove.many.title": {
    one: "Retirer {labels} libellés de {count} message",
    other: "Retirer {labels} libellés de {count} messages",
  },
  "labels.change.title": {
    one: "Modifier les libellés de {count} message",
    other: "Modifier les libellés de {count} messages",
  },
  "labels.happens":
    "Des libellés sont ajoutés ou retirés. Aucun message n'est déplacé ni supprimé.",
  "messages.unreadable": {
    one: "Ta boîte n'a pas pu être lue à l'instant, donc l'expéditeur et le sujet ne sont pas affichés. Nombre indiqué : {count}.",
    other:
      "Ta boîte n'a pas pu être lue à l'instant, donc l'expéditeur et le sujet ne sont pas affichés. Nombre indiqué : {count}.",
  },
  "notFound.text": {
    one: "Sur les {total} messages indiqués, {count} ne sont pas dans ta boîte. Cette demande sera donc refusée telle quelle.",
    other:
      "Sur les {total} messages indiqués, {count} ne sont pas dans ta boîte. Cette demande sera donc refusée telle quelle.",
  },
  "reason.credentials":
    "Changer un mot de passe, un code, la validation en deux étapes, un code de récupération ou un autre identifiant, c'est toujours toi qui le fais.",
  "reason.securitySettings":
    "Changer les réglages de sécurité, de partage ou d'accès d'un compte, c'est toujours toi qui le fais.",
  "reason.payments":
    "Payer, acheter ou déplacer de l'argent, c'est toujours toi qui le fais.",
  "reason.reviewer.credentials":
    "Le contrôle automatique a vu que cette action change un mot de passe, un code, la validation en deux étapes ou un autre identifiant. C'est toujours toi qui le fais.",
  "reason.reviewer.securitySettings":
    "Le contrôle automatique a vu que cette action change des réglages de sécurité, de partage ou d'accès. C'est toujours toi qui le fais.",
  "reason.reviewer.payments":
    "Le contrôle automatique a vu que cette action paie, achète ou déplace de l'argent. C'est toujours toi qui le fais.",
  "reason.fullAccess": "Full access est activé pour ce membre.",
  "reason.fullAccessNoPayments":
    "Full access sans paiements est activé pour ce membre.",
  "reason.ruleHandsOff": "Une règle te confie ce type d'action.",
  "reason.ruleAsks": "Une règle demande avant ce type d'action.",
  "reason.ruleAllows": "Une règle autorise ce type d'action.",
  "reason.preApprovedMet":
    "Tu as demandé précisément cette action dans cette demande.",
  "reason.preApprovedNotMet":
    "Une règle ne l'autorise que si tu l'as demandée, et ta demande cette fois-ci ne la contenait pas.",
  "reason.askBeforeChanges":
    "Tu as demandé à vérifier les changements avant qu'ils aient lieu.",
  "reason.noRule": "Aucune règle ni préférence ne demande de vérification ici.",
  "reason.mailboxNotAsked":
    "Tu n'as pas demandé ce changement dans ta boîte mail dans ton propre message, donc on te demande d'abord.",
  "reason.unattended":
    "Cela vient d'une routine ou d'un déclencheur qui tourne tout seul, pas d'un message de toi, donc on te demande toujours d'abord.",
  "reason.tooLongToReview":
    "Cette commande ou ce script est trop long pour que le relecteur automatique le lise en entier, donc c'est toi qui décides.",
  "reason.automation":
    "Les routines et les déclencheurs agissent plus tard sans toi : en créer un, le modifier ou le supprimer te demande toujours d'abord.",
  "reason.setting":
    "Quand un Bot change un de tes réglages depuis le chat, on te demande toujours d'abord, que Full access soit activé ou non.",
  "reason.remoteWrite":
    "Tu as envoyé ceci depuis un navigateur qui n'est pas associé à l'ordinateur sur lequel tourne FreeDuet, donc on te demande toujours d'abord, quoi que disent Full access ou tes règles enregistrées. Un navigateur associé à l'ordinateur fonctionne comme avant.",
  "reason.newEmail":
    "Pour un nouvel e-mail, on demande à chaque fois. Vérifie à qui il va et ce qu'il dit, puis autorise celui-ci ou refuse-le.",
  "reason.reviewerNone":
    "Aucun modèle de contrôle n'est configuré, donc ton accord est nécessaire.",
  "reason.reviewerInvalid":
    "La réponse du contrôle n'était pas un verdict valide.",
  "reason.reviewerUnreachable":
    "Le contrôle n'a pas pu être joint ({error}), donc ton accord est nécessaire.",
  "remote.answerSentence":
    "Un navigateur non associé à l'ordinateur sur lequel tourne FreeDuet peut autoriser une demande ordinaire une fois ou la refuser. Celle-ci se décide sur l'ordinateur, où tu peux la lire en entier. Elle y attend toujours.",
};
