import type { Catalog } from "../translate";
import type { EN } from "./en";

/*
 * French (D181, stage 2): natural and short, "tu", with the words the site's French page and the
 * French approval cards already use ("Bot", "Full access", "moteurs", "passation", "approbation").
 * Plurals take one, many (for exact millions, "de" before the noun) and other, as French rules have
 * them. Not yet checked by a person who reads French.
 */
export const fr: Catalog<typeof EN> = {
  "sign.title": "Se connecter à {product}",
  "sign.continueWith": "Continuer avec {provider}",
  "sign.opening": "Ouverture de {provider}…",
  "sign.openError":
    "Impossible d'ouvrir la connexion avec {provider}. Réessaie.",
  "sign.ssoRequired":
    "Ton organisation exige que tu te connectes avec ton compte professionnel.",
  "sign.pairLead":
    "Ce navigateur n'est pas encore associé à {product}. Sur l'ordinateur où tourne l'application, exécute",
  "sign.pairTail": " : {product} s'ouvre ici, prêt à l'emploi.",
  "sign.notSetUp":
    "La connexion n'est pas encore configurée. Un administrateur doit d'abord la configurer.",
  "sign.or": "ou",
  "sign.emailPlaceholder": "toi@entreprise.com",
  "sign.openingCompany": "Ouverture…",
  "sign.continueCompany": "Continuer avec ton compte professionnel",
  "sign.adminSignIn": "Connexion administrateur",
  "sign.noCompany":
    "Aucune connexion professionnelle n'est configurée pour cette adresse.",
  "shell.menu": "Menu",
  "shell.everything": "Tout",
  "shell.everythingLine": "Tout le contexte des chats, tous canaux confondus",
  "shell.channelsError": "Impossible de charger tes canaux. Recharge la page.",
  "shell.channels": "Canaux",
  "shell.newChannel": "Nouveau canal",
  "shell.archived": "Archivés",
  "shell.archivedChannels": "Canaux archivés",
  "shell.unarchive": "Désarchiver",
  "shell.unarchiveNamed": "Désarchiver {name}",
  "shell.earlier": "Conversations précédentes",
  "shell.manage": "Gérer",
  "shell.signOut": "Se déconnecter",
  "nav.bots": "Bots",
  "nav.connections": "Comptes et applis",
  "nav.capabilities": "Compétences",
  "nav.routines": "Routines",
  "nav.approvalRules": "Règles d'approbation",
  "nav.admin": "Administration",
  "nav.dashboard": "Tableau de bord",
  "nav.settings": "Réglages",
  "tab.main": "Principal",
  "tab.chat": "Chat",
  "tab.tasks": "Tâches",
  "tab.make": "Créer",
  "tab.waiting": "{tab}, {badge} en attente",
  "header.chat": "Chat {product}",
  "header.settings": "Tes réglages",
  "header.back": "Retour",
  "header.more": "Plus",
  "composer.ask": "Demande ce que tu veux",
  "composer.message": "Message",
  "composer.queue": "Mettre en file d'attente",
  "composer.send": "Envoyer le message",
  "composer.stop": "Arrêter le Bot",
  "composer.showCall": "Afficher l'appel vocal",
  "composer.startCall": "Démarrer l'appel vocal",
  "composer.callBot": "Appeler ce Bot",
  "composer.callUnsupported":
    "Les appels vocaux demandent un micro et une connexion sécurisée (HTTPS)",
  "composer.speak": "Dicter un message",
  "composer.dictateTitle": "Dis tout ce qu'il faut faire",
  "composer.attach": "Joindre un fichier",
  "composer.moreUnavailable": "Autres options de message indisponibles",
  "composer.messageNamed": "Message à {name}",
  "chat.botsError": "Impossible de charger tes Bots. Recharge la page.",
  "chat.noBots": "Il n'y a pas encore de Bot.",
  "chat.conversationError":
    "Impossible de charger ta conversation. Recharge la page.",
  "chat.stillStarting":
    "La conversation démarre encore. Réessaie dans un instant.",
  "chat.startError": "Impossible de démarrer la conversation. Réessaie.",
  "attention.questions": {
    one: "{count} question",
    other: "{count} questions",
    many: "{count} de questions",
  },
  "attention.approvals": {
    one: "{count} approbation",
    other: "{count} approbations",
    many: "{count} d'approbations",
  },
  "attention.handoffs": {
    one: "{count} passation bloquée",
    other: "{count} passations bloquées",
    many: "{count} de passations bloquées",
  },
  "attention.unread": {
    one: "{count} conversation non lue",
    other: "{count} conversations non lues",
    many: "{count} de conversations non lues",
  },
  "attention.needYou": {
    one: "{count} chose a besoin de toi",
    other: "{count} choses ont besoin de toi",
    many: "{count} de choses ont besoin de toi",
  },
  "attention.open": "{summary}. Ouvre Bots pour les traiter.",
  "attention.unreadMessages": "Messages non lus",
  "bots.new": "Nouveau Bot",
  "bots.purpose":
    "Tes Bots et ceux partagés avec toi. Vois ce que fait chacun et ce qu'il attend de toi.",
  "bots.loadError": "Impossible de charger tes Bots. Recharge la page.",
  "bots.needsYou": "Attend ta réponse",
  "bots.pinned": "Épinglés",
  "bots.yours": "Les tiens",
  "bots.shared": "Partagés avec toi",
  "bots.allPinned": "Tous tes Bots sont épinglés plus haut.",
  "bots.allNeedYou": "Tous tes Bots sont sous « Attend ta réponse ».",
  "bots.none": "Tu n'as pas encore de Bot. Crées-en un avec « Nouveau Bot ».",
  "bots.nobodyShared": "Personne ne t'a encore partagé de Bot.",
  "bots.hide": "Masquer",
  "bots.show": "Afficher",
  "bots.hidden": "Masqués",
  "bots.hiddenDescription": {
    one: "{count} Bot masqué. Seule ta liste change.",
    other: "{count} Bots masqués. Seule ta liste change.",
    many: "{count} de Bots masqués. Seule ta liste change.",
  },
  "bots.paused": "En pause",
  "bots.message": "Message",
  "bots.wroteIn": {
    one: "{name} a écrit dans {count} conversation que tu n'as pas lue.",
    other: "{name} a écrit dans {count} conversations que tu n'as pas lues.",
    many: "{name} a écrit dans {count} de conversations que tu n'as pas lues.",
  },
  "bots.readNewest": "Lire le plus récent",
  "bots.resuming": "Reprise en cours…",
  "bots.pausedResume": "En pause. Reprendre",
  "botPage.purpose": "Ce que ce Bot fait pour toi et comment il est configuré.",
  "botPage.fallbackTitle": "Bot",
  "botPage.openError":
    "Impossible d'ouvrir ce Bot. Il n'est peut-être pas partagé avec toi.",
  "profile.forYou": "Pour toi",
  "profile.settingsError":
    "Impossible de charger les réglages de ce Bot. Recharge la page.",
  "profile.active": "Actif",
  "profile.pausedDescription":
    "En pause. Rien ne tourne pour toi tant que tu ne le réactives pas.",
  "profile.activeDescription":
    "Il fait tourner pour toi ses routines, ses responsabilités, ses passations et ses relances.",
  "profile.notifications": "Notifications",
  "profile.notifyDescription":
    "{level}. Les badges de la barre latérale restent toujours visibles.",
  "profile.notify.all": "Tout",
  "profile.notify.needsInput": "Seulement quand il a besoin de moi",
  "profile.notify.none": "Rien (badges seulement)",
  "profile.browserNotifications": "Notifications du navigateur",
  "profile.browserOff":
    "Désactivées dans ce navigateur. Active-les pour être prévenu quand un Bot a besoin de toi.",
  "profile.turnOn": "Activer",
  "profile.startConversation": "Lance une conversation.",
  "stalled.what": "{name} n'a pas terminé : {task}",
  "stalled.why": "Pourquoi : {reason}.",
  "stalled.retryError": "Impossible de réessayer. Cela tourne peut-être déjà.",
  "stalled.dismissError":
    "Impossible de la mettre de côté. Cela tourne peut-être déjà.",
  "stalled.dismissing": "Mise de côté…",
  "stalled.dismissed": "Mise de côté",
  "stalled.dismiss": "Mettre de côté",
  "stalled.retrying": "Nouvelle tentative…",
  "stalled.queued": "Remise en file",
  "stalled.retry": "Réessayer",
  "stalled.open": "Ouvrir la conversation",
  "dash.title": "Tableau de bord",
  "dash.notAvailable": "Pas encore disponible",
  "dash.tokensNotCounted": "Aucun échange n'a encore été compté aujourd'hui.",
  "dash.countsUnavailable":
    "Les décomptes de jetons ne sont pas disponibles pour le moment.",
  "dash.enginesLink": "Gérer les moteurs",
  "dash.teamLink": "Tous les membres",
  "dash.waitingForYou": "En attente de toi",
  "dash.available": "Disponible",
  "dash.loading": "Chargement de ton équipe…",
  "dash.nothingWaits": "Rien n'attend ta réponse.",
  "dash.thingsWait": {
    one: "{count} chose attend ta réponse.",
    other: "{count} choses attendent ta réponse.",
    many: "{count} de choses attendent ta réponse.",
  },
  "dash.partialCount":
    "{reported} tentatives sur {turns} ont signalé un décompte",
  "dash.inputPlusOutput":
    "Entrée plus sortie, telles que chaque moteur les a signalées",
  "dash.nothingSaved":
    "Rien n'est encore passé par un moteur gratuit aujourd'hui",
  "dash.firstFor": {
    one: "d'abord pour {count} membre",
    other: "d'abord pour {count} membres",
    many: "d'abord pour {count} de membres",
  },
  "dash.members": {
    one: "{count} membre",
    other: "{count} membres",
    many: "{count} de membres",
  },
  "dash.indicators": "Indicateurs",
  "dash.tokensToday": "Jetons aujourd'hui",
  "dash.savedToday": "Économisés grâce aux moteurs gratuits aujourd'hui",
  "dash.waitingSub": "Questions, approbations et passations bloquées",
  "dash.nextRoutine": "Prochaine routine",
  "dash.noRoutine": "Aucune routine n'est prévue.",
  "dash.team": "Équipe",
  "dash.engines": "Moteurs",
  "dash.noEngine": "Aucun moteur n'est encore configuré.",
  "dash.perMemberAria": "Jetons par membre",
  "dash.perMember": "Jetons par membre, aujourd'hui",
  "dash.foot":
    "Les décomptes sont ceux que chaque moteur a signalés, en jours UTC. Un journal d'activité récente et une jauge de limite de forfait ne sont pas encore disponibles.",
  "voice.heardNothing":
    "Je n'ai rien entendu. Touche le micro pour réessayer, ou écris.",
  "voice.tapWhenDone": "Touche le micro quand tu as fini",
  "voice.discard": "Effacer",
  "voice.start": "Commencer la dictée",
  "voice.stopAndSend": "Arrêter la dictée et envoyer",
  "voice.typeInstead": "Écrire à la place",
  "voice.retry": "Réessayer",
  "voice.recordAgain": "Enregistrer à nouveau",
  "voice.writing": "Transcription de ce que tu as dit…",
  "voice.listeningStop": "J'écoute… je m'arrête quand tu fais une pause",
  "voice.listening": "J'écoute, parle simplement",
  "voice.permission": "En attente de l'autorisation du micro…",
  "home.bots": "Fais connaissance avec ton équipe et gère chaque Bot.",
  "home.capabilities": "Compétences et mémoire.",
  "home.connectionsLabel": "Comptes, applis et règles de messagerie",
  "home.connections": "Connecte un compte, une appli ou ta messagerie.",
  "home.setupLabel": "Liste de mise en place",
  "home.setup": "Vois ce qui est en place et ce qui reste à faire.",
  "home.approvalsLabel": "Règles d'approbation et Full access",
  "home.approvals": "Ce qu'un Bot peut faire sans te le demander.",
  "home.passwordsLabel": "Mots de passe",
  "home.passwords": "Les mots de passe que ton équipe peut utiliser.",
  "home.routines":
    "Le travail qui se répète tout seul, et la vue de la semaine.",
  "home.notifications": "Où les mises à jour t'arrivent.",
  "home.admin":
    "Ordinateurs, identifiants, limites, personnes et journal d'audit.",
  "home.engines":
    "Qui répond pour chaque Bot, dans quel ordre, et combien il a utilisé aujourd'hui. Ton abonnement reste en premier tant que tu ne changes pas l'ordre.",
  "home.safety": "Sécurité",
  "home.jobs": "Travaux",
  "home.system": "Système",
  "settings.description":
    "Gère ton équipe, tes comptes connectés et tes préférences personnelles.",
  "settings.sections": "Sections des réglages",
  "settings.workspace": "Espace de travail",
  "settings.preferences": "Préférences",
  "settings.devices": "Appareils et infos",
  "settings.appearance": "Apparence",
  "settings.matchPhone": "Comme le téléphone",
  "settings.light": "Clair",
  "settings.dark": "Sombre",
  "settings.voice": "Voix",
  "settings.shortcuts": "Raccourcis clavier",
  "language.section": "Langue",
  "language.title": "Langue de l'application",
  "language.description":
    "La langue des menus et des boutons. Ton équipe t'écrit dans la langue réglée dans le chat.",
  "language.auto": "Automatique (navigateur)",
  "settings.descriptionPlain":
    "Comment {product} s'affiche et fonctionne pour toi.",
  "wide.yourTeam": "Ton équipe",
  "wide.team": "Équipe",
  "wide.stateWaiting": "En attente de toi",
  "wide.stateWorking": "Au travail",
  "wide.memberLabel": "{name}, {line}",
  "chat.loadingConversation": "Chargement de cette conversation",
  "chat.readAloud": "Lire à voix haute",
  "chat.stopReading": "Arrêter la lecture",
  "chat.thinking": "Je réfléchis",
  "chat.queued": "En file d'attente",
  "chat.removeQueued": "Retirer le message en file d'attente : {what}",
  "chat.remove": "Retirer",
  "chat.routineRan": "Routine exécutée.",
  "chat.firstDayYes": "Ça me semble juste",
  "chat.firstDayNo": "Quelque chose cloche",
  "chat.tryingAgain": "Je réessaie.",
  "chat.responsibilityRan": "Responsabilité exécutée.",
  "chat.trigger": "Déclencheur :",
  "chat.details": "Détails",
  "chat.via": "via {source}",
  "chat.untitledFile": "Fichier sans titre",
  "chat.attachment": "Pièce jointe",
  "chat.attachmentLower": "pièce jointe",
  "chat.attachmentNamed": "Pièce jointe : {name}",
  "chat.unavailableNamed": "{name} n'est pas disponible.",
  "chat.unavailable": "Cette pièce jointe n'est pas disponible.",
  "chat.openNamed": "Ouvrir {name}",
  "chat.close": "Fermer",
  "chat.generatedInterface": "L'interface générée par ce Bot",
  "chat.usedBrowser": "Navigateur utilisé",
  "chat.hostAndMore": "{host} et {amount} de plus",
  "chat.searchedWeb": "recherche sur le web",
  "chat.readPages": {
    one: "{amount} page lue",
    other: "{amount} pages lues",
    many: "{amount} de pages lues",
  },
  "chat.browsedPages": {
    one: "{amount} page parcourue",
    other: "{amount} pages parcourues",
    many: "{amount} de pages parcourues",
  },
  "chat.usedBrowserPhrase": "navigateur utilisé",
  "chat.usedNamed": "{name} utilisé",
  "chat.usedConnectors": {
    one: "{amount} connecteur utilisé",
    other: "{amount} connecteurs utilisés",
    many: "{amount} de connecteurs utilisés",
  },
  "chat.usedTools": {
    one: "{amount} outil utilisé",
    other: "{amount} outils utilisés",
    many: "{amount} d'outils utilisés",
  },
  "chat.andJoin": "{head} et {last}",
  "chat.inProgress": "En cours",
  "chat.waitingForYou": "En attente de toi",
  "chat.notCompleted": "Non terminé",
  "chat.blocked": "Bloqué",
  "chat.didntWork": "Ça n'a pas marché",
  "chat.couldntFinishStep": "Je n'ai pas pu terminer cette étape.",
  "chat.issues": {
    one: "{amount} problème",
    other: "{amount} problèmes",
    many: "{amount} de problèmes",
  },
  "settings.addRepository": "Ajouter un dépôt",
  "settings.approvals": "Approbations",
  "settings.appsSharedBots": "Applis que tu laisses utiliser aux Bots partagés",
  "settings.backToApp": "Retour à l'appli",
  "settings.cancel": "Annuler",
  "settings.cannotMakeCode":
    "Un code se crée dans le navigateur associé à l'ordinateur. Celui-ci ne peut pas en créer.",
  "settings.cantLink":
    "Tu ne peux pas encore lier un compte {provider}. Un administrateur doit d'abord le configurer.",
  "settings.changesDescription":
    "Réglages qu'un Bot a modifiés depuis le chat. Annuler remet l'ancienne valeur pendant sept jours, tant que le réglage garde celle que la modification a fixée.",
  "settings.changesEmpty":
    "Aucune modification faite dans le chat pour l'instant.",
  "settings.changesLoading": "Chargement des modifications…",
  "settings.changesTitle": "Modifications faites dans le chat",
  "settings.charactersOf": "{used} sur {limit} caractères",
  "settings.checkLinkError":
    "Impossible de vérifier si tu peux lier ce compte : {error}",
  "settings.code": "Code",
  "settings.codeExpires":
    "Le code ne fonctionne qu'une fois et expire dans 10 minutes.",
  "settings.codeRanOut": "Ce code a expiré. Crées-en un nouveau.",
  "settings.componentsGallery": "Galerie des composants",
  "settings.computer": "Ordinateur",
  "settings.connect": "Connecter",
  "settings.connectEvents": "Connecter les événements",
  "settings.connectNamed": "Connecter {name}",
  "settings.copied": "Copié",
  "settings.copy": "Copier",
  "settings.copyFailed":
    "Impossible de copier. Sélectionne le code et copie-le toi-même.",
  "settings.deliveriesEmpty": "Aucun envoi pour l'instant.",
  "settings.deliveriesTitle": "Envois récents",
  "settings.deploymentOwn": "celle de l'installation",
  "settings.devicesDescription":
    "Connecte-toi à l'appli {product} sur ton téléphone et active les notifications pour l'ajouter ici.",
  "settings.devicesEmpty": "Aucun appareil pour l'instant.",
  "settings.devicesTitle": "Tes appareils",
  "settings.disconnect": "Déconnecter",
  "settings.disconnectError": "Impossible de déconnecter {name} : {error}",
  "settings.disconnectNamed": "Déconnecter {name}",
  "settings.done": "Terminé",
  "settings.emphasisBot": "Nom du Bot",
  "settings.emphasisConversation": "Titre de la conversation",
  "settings.emphasisDescription":
    "Choisis la ligne qui ressort dans la barre latérale.",
  "settings.emphasisPreview": "Aperçu de la liste des messages",
  "settings.emphasisTitle": "Mise en avant dans la liste des messages",
  "settings.general": "Général",
  "settings.githubConnectError": "Impossible de connecter GitHub : {error}",
  "settings.githubLinkFailed":
    "Impossible de lier ton compte GitHub. Réessaie.",
  "settings.githubLinked": "Ton compte GitHub est lié.",
  "settings.githubTaken":
    "Ce compte GitHub est lié à une autre personne dans {product}. Connecte-toi à GitHub avec un autre compte et réessaie, ou demande à un administrateur.",
  "settings.kindDecision": "Décisions",
  "settings.kindDecisionDescription":
    "Approbations dont un Bot a besoin avant d'agir.",
  "settings.kindProgress": "Avancement",
  "settings.kindProgressDescription":
    "Réponses et résultats de travaux que tu ne suivais pas.",
  "settings.kindQuestion": "Questions",
  "settings.kindQuestionDescription":
    "Ce qu'un Bot t'a demandé et qu'il attend.",
  "settings.languageChanged":
    "Ta langue pour l'équipe est passée de {from} à {to}",
  "settings.lastSeen": "vu pour la dernière fois {when}",
  "settings.levelAll": "tout",
  "settings.levelNeedsInput": "seulement quand il a besoin de toi",
  "settings.linkBroughtCode":
    "Le lien contient un code. Donne un nom à ce navigateur, puis clique sur Associer.",
  "settings.linkSlack": "Lie ton compte Slack",
  "settings.linked": "Lié",
  "settings.loadAccountError": "Impossible de charger ton compte : {error}",
  "settings.loading": "Chargement…",
  "settings.localAddress":
    "Cette adresse ne fonctionne que sur cet ordinateur. Un téléphone a besoin de l'adresse à laquelle FreeDuet est joignable depuis l'extérieur : ouvre-la sur le téléphone et saisis le code dans Réglages.",
  "settings.madeWhen": "créé {when}",
  "settings.makeCode": "Créer un code",
  "settings.memberAdded": "{member} a été ajouté à ton équipe",
  "settings.name": "Nom",
  "settings.nameChanged": "{bot} : ton nom pour lui est passé de {from} à {to}",
  "settings.nameOwn": "son propre nom",
  "settings.needsReconnect": "À reconnecter",
  "settings.needsReconnectHandle": "À reconnecter · @{handle}",
  "settings.noItalianVoice":
    "Aucune voix italienne locale sur cet ordinateur, donc les réponses ne peuvent pas être lues à voix haute ici.",
  "settings.notLinked": "Non lié",
  "settings.notSetUp": "Non configuré",
  "settings.notifyChanged":
    "{bot} : les notifications sont passées de {from} à {to}",
  "settings.pairThisDescription":
    "Sur l'ordinateur où tourne FreeDuet, ouvre la page Réglages, clique sur Créer un code sous Associer un téléphone ou un autre navigateur, puis ouvre le lien affiché ou saisis le code ici.",
  "settings.pairThisTitle": "Associer ce navigateur",
  "settings.pairedDescription":
    "Un téléphone ou un autre navigateur associé fonctionne comme celui-ci. Si tu en révoques un, il est coupé à sa prochaine requête et déconnecté.",
  "settings.pairedDone": "Ce navigateur est associé à l'ordinateur.",
  "settings.pairedTitle": "Associer un téléphone ou un autre navigateur",
  "settings.phone": "Téléphone",
  "settings.phoneOrBrowser": "Téléphone ou autre navigateur",
  "settings.qrLabel": "Code QR avec le lien d'association",
  "settings.readAloudDescription":
    "Ajoute un bouton Lire à voix haute sous chaque réponse d'un Bot. Il utilise une voix de cet ordinateur seulement, et rien n'est envoyé ailleurs.",
  "settings.readAloudTitle": "Lire les réponses à voix haute",
  "settings.rename": "Renommer",
  "settings.repositories": "Dépôts",
  "settings.repositoriesDescription":
    "Ajoute ici un dépôt, puis ajoute un webhook dans GitHub avec l'adresse ci-dessous et le même secret. Ses événements, comme issues.opened, peuvent ensuite lancer une responsabilité.",
  "settings.repositoriesEmpty":
    "Aucun dépôt pour l'instant. Ajoutes-en un avec « Ajouter un dépôt ».",
  "settings.repository": "Dépôt",
  "settings.reset": "Réinitialiser",
  "settings.resetDescription":
    "Oublie chaque réponse, pour que chaque Bot partagé repose la question.",
  "settings.resetDone": "Réinitialisé. Chaque Bot partagé te redemandera.",
  "settings.revoke": "Révoquer",
  "settings.routingDescription":
    "Où va chaque type de mise à jour quand tu es absent. {product} sur le web affiche toujours tout.",
  "settings.routingError":
    "Impossible de charger où vont tes mises à jour. Recharge la page.",
  "settings.routingTitle": "Où vont les mises à jour",
  "settings.runsOut":
    "Sur le téléphone, connecté avec ton compte, scanne ceci ou ouvre le lien, ou ouvre la page Réglages et saisis le code. Il ne fonctionne qu'une fois et expire dans {time}.",
  "settings.sameSecret":
    "Utilise le même secret quand tu ajoutes le webhook dans GitHub.",
  "settings.sampleBot": "Assistant général",
  "settings.sampleTitle": "Planifier la semaine prochaine",
  "settings.save": "Enregistrer",
  "settings.saved": "Enregistré",
  "settings.saving": "Enregistrement…",
  "settings.setup": "Configuration",
  "settings.sharedBots": "Bots partagés",
  "settings.sharedBotsDescription":
    "Un Bot partagé avec toi utilise les applis de son propriétaire. Il utilise les tiennes seulement là où tu as dit oui dans une conversation.",
  "settings.slackCodeError": "Impossible de créer un code Slack : {error}",
  "settings.standingDescription":
    "S'applique à chaque Bot dans chaque conversation. Le rôle d'un Bot dit ce qu'il fait. Ceci indique comment tu veux qu'il le fasse, comme ton style d'écriture.",
  "settings.standingTitle": "Consignes permanentes",
  "settings.switchLabel": "{kind} par {transport}",
  "settings.thisBrowserTag": "(ce navigateur)",
  "settings.toneChanged": "{bot} : le ton est passé de {from} à {to}",
  "settings.undo": "Annuler",
  "settings.undoFailed": "Impossible d'annuler la modification. Réessaie.",
  "settings.undoGone": "Annuler n'est plus possible",
  "settings.undoing": "Annulation…",
  "settings.undone": "Annulée",
  "settings.webhookSecret": "Secret du webhook",
  "settings.yourAccount": "Ton compte",
  "bot.activity.kindRoutine": "Routine",
  "bot.activity.kindResponsibility": "Responsabilité",
  "bot.activity.kindHandoff": "Tâche déléguée",
  "bot.activity.kindApproval": "Approbation",
  "bot.activity.kindQuestion": "Question",
  "bot.activity.kindFollowUp": "Relance",
  "bot.activity.needsYou": "Attend ta réponse",
  "bot.activity.stop": "Arrêter",
  "bot.activity.stopping": "Arrêt en cours…",
  "bot.activity.cancelling": "Annulation…",
  "bot.activity.open": "Ouvrir",
  "bot.activity.title": "Activité",
  "bot.activity.scheduled": "À venir",
  "bot.activity.completed": "Terminées",
  "bot.activity.emptyInProgress": "Rien n'est en cours ni en attente de toi.",
  "bot.activity.emptyScheduled": "Rien n'est prévu.",
  "bot.activity.emptyCompleted": "Rien n'est encore terminé.",
  "bot.activity.loadError":
    "Impossible de charger l'activité de ce Bot. Recharge la page.",
  "bot.settings.heading": "Réglages de ce Bot",
  "bot.area.responsibilities": "Responsabilités",
  "bot.area.reaching": "Comment il te contacte",
  "bot.area.memory": "Mémoire",
  "bot.area.access": "Compétences et accès",
  "bot.area.sharing": "Partage",
  "bot.settings.activeCount": {
    one: "{count} active",
    other: "{count} actives",
    many: "{count} d'actives",
  },
  "bot.settings.noneActive": "Aucune active",
  "bot.settings.ruleCount": {
    one: "{count} règle",
    other: "{count} règles",
    many: "{count} de règles",
  },
  "bot.settings.noRules": "Aucune règle",
  "bot.settings.routineCount": {
    one: "{count} routine",
    other: "{count} routines",
    many: "{count} de routines",
  },
  "bot.settings.noRoutines": "Aucune routine",
  "bot.access.skillsDescription":
    "Active une compétence pour l'utiliser avec ce Bot. Tape / dans une conversation pour la lancer.",
  "bot.access.yourSkills": "Tes compétences",
  "bot.access.skillsError":
    "Impossible de charger tes compétences. Recharge la page.",
  "bot.access.noSkills": "Aucune compétence pour l'instant.",
  "bot.access.writeOne": "Écris-en une",
  "bot.access.title": "Ce qu'il peut utiliser",
  "bot.access.grantedDescription":
    "Les applis et les compétences que ce Bot peut utiliser, et si chaque appli est prête pour toi. Il ne peut rien utiliser d'autre.",
  "bot.access.grantedError":
    "Impossible de charger ce que ce Bot peut utiliser. Recharge la page.",
  "bot.access.readyError":
    "Impossible de vérifier si chaque appli est prête pour toi. Recharge la page.",
  "bot.access.noApps":
    "Aucune appli pour l'instant. Un administrateur doit les ajouter. D'ici là, ce Bot ne peut que discuter avec toi.",
  "bot.access.toolsAndMore": "{list} et {count} de plus",
  "bot.access.toolCount": {
    one: "{count} outil",
    other: "{count} outils",
    many: "{count} d'outils",
  },
  "bot.access.skillLabel": "Compétence",
  "bot.access.manageNamed": "Gérer {title} sur ce Bot",
  "bot.reset.conversations": {
    one: "{count} conversation",
    other: "{count} conversations",
    many: "{count} de conversations",
  },
  "bot.reset.memorySources": {
    one: "{count} source de mémoire",
    other: "{count} sources de mémoire",
    many: "{count} de sources de mémoire",
  },
  "bot.reset.memories": {
    one: "{count} mémoire importée",
    other: "{count} mémoires importées",
    many: "{count} de mémoires importées",
  },
  "bot.reset.routines": {
    one: "{count} routine",
    other: "{count} routines",
    many: "{count} de routines",
  },
  "bot.reset.responsibilities": {
    one: "{count} responsabilité",
    other: "{count} responsabilités",
    many: "{count} de responsabilités",
  },
  "bot.reset.followUps": {
    one: "{count} relance programmée",
    other: "{count} relances programmées",
    many: "{count} de relances programmées",
  },
  "bot.reset.formedMemories": {
    one: "{count} mémoire créée par le Bot",
    other: "{count} mémoires créées par le Bot",
    many: "{count} de mémoires créées par le Bot",
  },
  "bot.reset.research": {
    one: "{count} recherche en arrière-plan",
    other: "{count} recherches en arrière-plan",
    many: "{count} de recherches en arrière-plan",
  },
  "bot.reset.standing": {
    one: "{count} autorisation permanente",
    other: "{count} autorisations permanentes",
    many: "{count} d'autorisations permanentes",
  },
  "bot.reset.title": "Réinitialiser {name} ?",
  "bot.reset.description":
    "Cela supprime ce que {name} a avec toi. Les conversations et données des autres personnes restent. Tu ne peux pas annuler cette action.",
  "bot.reset.planError":
    "Impossible de vérifier ce que la réinitialisation supprimerait. Réessaie.",
  "bot.reset.done": "Terminé. {name} repart de zéro avec toi.",
  "bot.reset.nothing": "Il n'y a rien à supprimer qui soit à toi.",
  "bot.reset.willDelete": "Cela supprimera :",
  "bot.reset.sharedKept": {
    one: "{count} conversation est partagée avec d'autres personnes ou Bots et sera conservée.",
    other:
      "{count} conversations sont partagées avec d'autres personnes ou Bots et seront conservées.",
    many: "{count} de conversations sont partagées avec d'autres personnes ou Bots et seront conservées.",
  },
  "bot.reset.memoriesKept":
    "Les mémoires que tu as données toi-même à un Bot sont conservées.",
  "bot.reset.resetting": "Réinitialisation…",
  "bot.reset.submit": "Supprimer et réinitialiser",
  "bot.manage.pinnedAssigned":
    "Un administrateur te l'a attribué. Il reste en haut de ta liste de Bots.",
  "bot.manage.pinnedOn": "En haut de ta liste de Bots. Seule ta liste change.",
  "bot.manage.pinnedOff":
    "Garde-le en haut de ta liste de Bots. Seule ta liste change.",
  "bot.manage.hiddenAssigned":
    "Un administrateur te l'a attribué. Tu ne peux pas le masquer.",
  "bot.manage.hiddenOn":
    "Dans Masqués, sur ta liste de Bots. Seule ta liste change.",
  "bot.manage.hiddenOff":
    "Retire-le de ta liste de Bots. Seule ta liste change.",
  "bot.manage.duplicate": "Dupliquer",
  "bot.manage.duplicateDescription":
    "Crée ta propre copie. Ses conversations et ses clés ne sont pas copiées.",
  "bot.manage.resetDescription":
    "Supprime tes conversations avec lui, ce qu'il retient pour toi et son travail programmé. Tu verras d'abord la liste.",
  "bot.manage.delete": "Supprimer",
  "bot.manage.deleteDescription":
    "Le supprime pour tout le monde. Tu ne peux pas annuler cette action.",
  "bot.manage.deleteTitle": "Supprimer {name} ?",
  "bot.manage.deleteConfirm":
    "Il est supprimé pour tout le monde. Tu ne peux pas annuler cette action.",
  "bot.manage.deleting": "Suppression…",
  "bot.setup.title": "Titre",
  "bot.setup.whatItDoes": "Ce qu'il fait",
  "bot.setup.identity": "Identité",
  "bot.setup.systemOwned": "Propriété du système",
  "bot.setup.systemOwnedDescription":
    "Fourni avec {product}. Il n'appartient à aucune personne.",
  "bot.setup.visibility": "Visibilité",
  "bot.setup.visiblePrivate":
    "Toi seul peux le voir et démarrer des conversations avec lui.",
  "bot.setup.visiblePublic":
    "Tout le monde sur {product} peut le trouver et l'utiliser.",
  "bot.setup.private": "Privé",
  "bot.setup.public": "Public",
  "bot.setup.saveError": "Impossible d'enregistrer. Réessaie.",
  "bot.setup.checkField": "Vérifie ce champ et réessaie.",
  "bot.setup.connection": "Connexion",
  "bot.setup.builtIn": "Intégré",
  "bot.setup.agentUrl": "URL de l'agent",
  "bot.setup.builtInDescription":
    "Tourne dans {product}. Il n'y a rien à connecter.",
  "bot.sharing.published": "Publié",
  "bot.sharing.toWholeTeam": "À toute l'équipe",
  "bot.sharing.toPeople": "À {who}",
  "bot.sharing.groupNamed": "groupe {name}",
  "bot.sharing.teamPrivate":
    "Les conversations de chacun avec lui sont privées.",
  "bot.sharing.notVisibleYet":
    "Les membres de l'équipe ne le voient pas tant qu'il n'a pas un vrai nom et une description.",
  "bot.sharing.unpublish": "Dépublier",
  "bot.sharing.link": "Lien",
  "bot.sharing.linkDescription": "Ouvre une conversation privée avec lui.",
  "bot.sharing.copyLink": "Copier le lien",
  "bot.sharing.publicNotPublished":
    "Non publié pour l'équipe. Il est public, donc tout le monde sur {product} peut déjà l'utiliser.",
  "bot.sharing.onlyYouCanUse": "Non publié. Toi seul peux l'utiliser.",
  "bot.sharing.notPublished": "Non publié.",
  "bot.sharing.whoPublishedTo": "À qui il est publié",
  "bot.sharing.publish": "Publier",
  "bot.sharing.publishNote":
    "Publier ne change pas sa visibilité. Tu peux dépublier à tout moment.",
  "bot.sharing.audience": "Destinataires",
  "bot.sharing.notPublishedSummary": "Non publié",
  "bot.sharing.theWholeTeam": "Toute l'équipe",
  "bot.sharing.specificPeople": "Personnes ou groupes précis",
  "bot.sharing.peopleCount": {
    one: "{count} personne",
    other: "{count} personnes",
    many: "{count} de personnes",
  },
  "bot.sharing.groupCount": {
    one: "{count} groupe",
    other: "{count} groupes",
    many: "{count} de groupes",
  },
  "bot.sharing.assignToGroups": "Attribuer à des groupes",
  "bot.sharing.assignDescription":
    "Épingle ce Bot en haut de la liste des Bots de chaque membre du groupe. Utilise * pour toute l'équipe.",
  "bot.sharing.publishedTo": "Publié à",
  "bot.sharing.peopleByEmail": "Personnes, par e-mail",
  "bot.sharing.commaSeparated": "Séparés par des virgules",
  "bot.sharing.groups": "Groupes",
  "bot.sharing.update": "Mettre à jour",
  "bot.sharing.publishToTeam": "Publier pour l'équipe",
  "bot.sharing.assignNamed": "Attribuer {name} à un groupe",
  "bot.sharing.assignNote":
    "Il est épinglé en haut de la liste des Bots de chaque membre.",
  "bot.sharing.groupOrStar": "Groupe, ou *",
  "bot.sharing.wholeTeamPlaceholder": "* pour toute l'équipe",
  "bot.sharing.assign": "Attribuer",
  "bot.sharing.removeNamed": "Retirer {name}",
  "bot.sharing.wholeTeam": "Toute l'équipe",
  "bot.sharing.notAssigned": "Non attribué à un groupe.",
  "bot.sharing.assignRow": "Attribuer à un groupe",
  "bot.page.accessPurpose":
    "Les compétences, applis et autres Bots que ce Bot peut utiliser.",
  "bot.page.approvalsPurpose":
    "Ce que ce Bot peut faire sans te demander d'abord.",
  "bot.page.memoryPurpose":
    "Les applis dont ce Bot apprend, et les recherches qu'il fait pour toi en arrière-plan.",
  "bot.page.memoryPointer": "Ce que tes Bots retiennent de toi se trouve dans",
  "bot.page.reachPurpose":
    "Continue une conversation avec ce Bot dans Slack, Microsoft Teams ou par SMS.",
  "bot.page.responsibilitiesPurpose":
    "Objectifs continus sur lesquels ce Bot travaille pour toi. Vois ce qui a lancé chaque exécution et ce qu'il a trouvé.",
  "bot.page.routinesPurpose":
    "Ce que ce Bot fait pour toi selon un calendrier. Désactive-en une, lance-la maintenant ou supprime-la.",
  "bot.page.setupPurpose":
    "Qui est ce Bot, qui peut le trouver, et où il tourne.",
  "bot.page.sharingPurpose":
    "Qui d'autre peut utiliser ce Bot. Les conversations de chacun avec lui sont privées.",
  // The Bot sub-pages' contents (D181 stage 2e): memory sources, suggestions, reaching you, responsibilities
  // and routines, the summaries of lib/agents/bot-summaries.ts and the time phrases of lib/relative-time.ts.
  // Shared words reuse their existing keys (`botPage.fallbackTitle` is "Bot"); `bot.choose` is "Choose a Bot".
  "bot.choose": "Choisis un Bot",
  "memory.addSource": "Ajouter une source",
  "memory.title": "Sources des applis",
  "memory.description":
    "Les applis que tu as connectées et que ce Bot peut lire apparaissent ici, et tu peux en ajouter. Les sources se mettent à jour toutes les 15 minutes. Seul ce Bot voit ce qu'elles contiennent.",
  "memory.empty":
    "Aucune source pour l'instant. Ajoutes-en une avec « Ajouter une source ».",
  "memory.upToDate": "À jour",
  "memory.off": "Désactivée",
  "memory.lastRead": "Dernière lecture {when}",
  "memory.syncNow": "Synchroniser maintenant",
  "memory.readNamed": "Lire {name}",
  "memory.addTitle": "Ajouter une source",
  "memory.addDescription":
    "{product} la lit maintenant, puis toutes les 15 minutes tant qu'elle est active.",
  "memory.enterNumber": "Saisis un nombre pour {name}.",
  "memory.cantShow":
    "Celle-ci a des réglages que {product} ne peut pas afficher. Choisis-en une autre.",
  "memory.checkSettings": "Vérifie les réglages de la source.",
  "memory.whatToRead": "Ce qu'il faut lire",
  "memory.chooseWhat": "Choisis ce qu'il faut lire",
  "memory.sourceName": "Nom de la source",
  "memory.chooseValue": "Choisis une valeur",
  "memory.reading": "Lecture de la source…",
  "memory.addAndSync": "Ajouter et synchroniser la source",
  "suggestions.everyHour": "Toutes les heures",
  "suggestions.every4Hours": "Toutes les 4 heures",
  "suggestions.twiceDay": "Deux fois par jour",
  "suggestions.onceDay": "Une fois par jour",
  "suggestions.everyMinutes": {
    one: "Chaque minute",
    other: "Toutes les {count} minutes",
    many: "Toutes les {count} de minutes",
  },
  "suggestions.yourBot": "Ton Bot",
  "suggestions.title": "Prochaines étapes suggérées",
  "suggestions.from": "Depuis {app}",
  "suggestions.connectedApp": "une appli connectée",
  "suggestions.openRecord": "Ouvrir l'enregistrement",
  "suggestions.startTask": "Lancer comme tâche",
  "suggestions.empty":
    "Aucune suggestion pour l'instant. Les Bots avec la recherche en arrière-plan activée proposeront ici leurs prochaines étapes.",
  "suggestions.turnOnResearch": "Activer la recherche",
  "suggestions.researchDescription":
    "Désactivée tant que tu ne l'actives pas pour ce Bot, sauf si ton administrateur l'a activée pour tout le monde. Quand elle est active, elle parcourt toutes les quatre heures les applis qu'elle peut déjà lire, crée des mémoires pour que tu les relises et suggère des prochaines étapes. Elle ne peut que lire : elle ne peut ni envoyer de messages, ni modifier quoi que ce soit dans une appli, ni utiliser de navigateur ni d'ordinateur. Désactive-la ou supprime-la, et elle reste ainsi.",
  "suggestions.researchTitle": "Recherche en arrière-plan",
  "suggestions.researchOff": "La recherche en arrière-plan est désactivée.",
  "suggestions.turnOnDialog": "Activer la recherche en arrière-plan",
  "suggestions.turnOnDescription":
    "Elle lit selon un calendrier et envoie ce qu'elle suggère dans un canal où elle se trouve.",
  "suggestions.deliverTo": "Envoyer les suggestions à",
  "suggestions.chooseChannel": "Choisis un canal",
  "suggestions.howOften": "Fréquence",
  "suggestions.focus": "Ce qu'il faut chercher (facultatif)",
  "suggestions.off": "Désactivée",
  "suggestions.researchingNow": "Recherche en cours",
  "suggestions.lastRan": "Dernière exécution {when}",
  "suggestions.turnOff": "Désactiver",
  "reaching.linkSlack": "Lier Slack",
  "reaching.linkTeams": "Lier Microsoft Teams",
  "reaching.connectPhone": "Connecter un téléphone",
  "reaching.sumSlack": "Poursuivre une conversation depuis Slack.",
  "reaching.sumTeams": "Poursuivre une conversation depuis Microsoft Teams.",
  "reaching.sumSms": "Poursuivre une conversation par SMS.",
  "reaching.codeOnWay":
    "Un code de vérification est en route. Saisis-le pour terminer.",
  "reaching.linkReady":
    "Ton code de liaison est prêt à être envoyé. Ouvre-le pour le revoir.",
  "reaching.smsNotSet":
    "Les SMS ne sont pas encore configurés. Un administrateur doit d'abord les activer.",
  "reaching.notSet":
    "Pas encore configuré. Un administrateur doit d'abord activer Slack et Teams.",
  "reaching.pointerBefore":
    "Tes appareils, les envois récents et l'endroit où va chaque type de mise à jour se trouvent dans",
  "reaching.connected": "Destinations connectées",
  "reaching.noDestinations": "Aucune destination connectée.",
  "reaching.optedOut": "Tu as envoyé STOP. Envoie START pour reprendre.",
  "reaching.disconnect": "Déconnecter",
  "reaching.channelNote":
    "Dans un canal Slack ou Teams que d'autres peuvent lire, le Bot te répond en message privé.",
  "reaching.connectTitle": "Connecter une conversation",
  "reaching.oneAtATime":
    "Chaque compte ou numéro de téléphone ne fonctionne qu'avec une conversation à la fois. Le lier ici le retire de celle à laquelle il est lié actuellement.",
  "reaching.conversation": "Conversation",
  "reaching.chooseConversation": "Choisis une conversation",
  "reaching.loadMore": "Afficher plus de conversations",
  "reaching.phoneNumber": "Numéro de téléphone",
  "reaching.sendCode": "Envoyer le code de vérification",
  "reaching.verificationCode": "Code de vérification",
  "reaching.confirmPhone": "Confirmer le numéro",
  "reaching.linkExpires": {
    one: "Envoie ce message à l'appli {product} sur {platform} dans {count} minute. Il lie ce compte à cette conversation et à ce Bot.",
    other:
      "Envoie ce message à l'appli {product} sur {platform} dans {count} minutes. Il lie ce compte à cette conversation et à ce Bot.",
    many: "Envoie ce message à l'appli {product} sur {platform} dans {count} de minutes. Il lie ce compte à cette conversation et à ce Bot.",
  },
  "responsibilities.new": "Nouvelle responsabilité",
  "responsibilities.title": "Objectifs",
  "responsibilities.empty":
    "Aucune responsabilité pour l'instant. Ajoutes-en une avec « Nouvelle responsabilité ».",
  "responsibilities.emptyBot":
    "Aucune responsabilité pour ce Bot pour l'instant. Ajoutes-en une avec « Nouvelle responsabilité ».",
  "routines.neverRun": "Pas encore exécutée",
  "routines.running": "En cours…",
  "routines.missed": "Manquée {when}",
  "routines.failed": "Échouée {when}",
  "routines.skipped": "Ignorée {when}",
  "routines.ran": "Exécutée {when}",
  "routines.finished": "Terminée {when}",
  "routines.noRuns": "Aucune exécution pour l'instant.",
  "routines.runNow": "Lancer maintenant",
  "routines.triggered": "Déclenchée",
  "routines.scheduled": "Planifiée",
  "routines.sweepChecked":
    "{product} les a vérifiées pour la dernière fois {when}. Aucune ne s'exécutera tant que {product} n'a pas redémarré. Demande à un administrateur si cela se reproduit.",
  "routines.sweepNever":
    "{product} n'a pas encore commencé à exécuter les routines, donc aucune de celles-ci ne s'exécutera. Demande à un administrateur de mettre cela en place.",
  "routines.notRunning": "Les routines ne tournent pas.",
  "routines.loadError": "Impossible de charger tes routines. Recharge la page.",
  "routines.emptyBot":
    "Aucune routine pour ce Bot pour l'instant. Demande-lui quelque chose comme « chaque jour ouvrable à 9 h, envoie-moi… » et elle apparaît ici.",
  "routines.empty":
    "Aucune routine pour l'instant. Demande à un Bot quelque chose comme « chaque jour ouvrable à 9 h, envoie-moi… » et elle apparaît ici.",
  "routines.enableAria": "Activer la routine planifiée {schedule}",
  "routines.channelGone": "Conversation supprimée",
  "routines.untitledChannel": "Conversation sans titre",
  "routines.due": "À lancer",
  "routines.next": "Prochaine : {when}",
  "routines.runNowTitle":
    "Lance la routine maintenant, pour de vrai. Le Bot fait le travail et publie dans la conversation.",
  "routines.pausedTurnOn": "Cette routine est en pause. Active-la d'abord.",
  "routines.runNowAria": "Lancer maintenant la routine planifiée {schedule}",
  "routines.historyAria":
    "Historique des exécutions de la routine planifiée {schedule}",
  "routines.history": "Historique",
  "routines.deleteAria": "Supprimer la routine planifiée {schedule}",
  "routines.deleteTitle": "Supprimer « {schedule} » ?",
  "routines.deleteDescription":
    "Cette routine s'arrête définitivement. Tu ne peux pas annuler cette action.",
  "routines.week": "Semaine",
  "routines.nextRuns": "Prochaines exécutions",
  "routines.viewAria": "Voir",
  "summary.nothingGranted": "Rien d'accordé",
  "summary.skills": {
    one: "{count} compétence",
    other: "{count} compétences",
    many: "{count} de compétences",
  },
  "summary.apps": {
    one: "{count} appli",
    other: "{count} applis",
    many: "{count} d'applis",
  },
  "summary.everyonePublic": "Tout le monde (public)",
  "summary.notShared": "Non partagé",
  "summary.specificPeople": "Personnes et groupes précis",
  "summary.onlyIn": "Seulement dans {product}",
  "summary.nothingConnected": "Rien de connecté",
  "summary.sources": {
    one: "{count} source",
    other: "{count} sources",
    many: "{count} de sources",
  },
  "summary.researchOn": "Recherche en arrière-plan activée",
  "summary.researchOnAfter": "recherche en arrière-plan activée",
  "time.justNow": "à l'instant",
  "time.minutesAgo": {
    one: "il y a {count} min",
    other: "il y a {count} min",
    many: "il y a {count} min",
  },
  "time.hoursAgo": {
    one: "il y a {count} h",
    other: "il y a {count} h",
    many: "il y a {count} h",
  },
  "time.yesterday": "hier",
  "time.daysAgo": {
    one: "il y a {count} jour",
    other: "il y a {count} jours",
    many: "il y a {count} de jours",
  },
  "time.weeksAgo": {
    one: "il y a {count} sem.",
    other: "il y a {count} sem.",
    many: "il y a {count} sem.",
  },
  "time.recently": "récemment",
  // Stage 2f (D181): the approval rules, the responsibility dialog, the routine history, Passwords.
  "approvals.behaviour.allow": "Agir sans demander",
  "approvals.behaviour.preApproved": "Agir si c'est déjà approuvé à l'avance",
  "approvals.behaviour.ask": "Demander avant d'agir",
  "approvals.behaviour.handOff": "Te passer la main",
  "approvals.host.ask": "Demander à chaque fois",
  "approvals.host.allow": "Toujours autoriser",
  "approvals.host.never": "Jamais",
  "approvals.teamRule": "{label} (règle d'équipe)",
  "approvals.matchOn": "sur {scope}",
  "approvals.matchFor": "pour {bot}",
  "approvals.locked": "Verrouillée",
  "approvals.behaviourFor": "Comportement pour {tool}",
  "approvals.formLead":
    "Un outil ou une appli, et ce qu'un Bot fait avant de l'utiliser.",
  "approvals.formHelp":
    "Utilise * pour correspondre à tout. mcp/gmail/* désigne chaque outil Gmail. Une cible *.example.com désigne chaque page de ce site.",
  "approvals.field.tool": "Outil ou appli",
  "approvals.field.effect": "Type d'action",
  "approvals.field.scope": "Cible",
  "approvals.field.scopeHint": "*, un site, un dossier, le nom d'un Bot",
  "approvals.field.bot": "Bot",
  "approvals.field.botHint": "* pour tous les Bots",
  "approvals.field.behaviour": "Comportement",
  "approvals.saveRule": "Enregistrer la règle",
  "approvals.addRule": "Ajouter une règle",
  "approvals.rulesOff":
    "Un administrateur a désactivé les règles personnelles. Les tiennes sont conservées, mais ne s'appliquent pas.",
  "approvals.bot.lead":
    "La règle la plus stricte qui correspond l'emporte. Une règle « demander » l'emporte sur une règle « autoriser ». Les règles de tous les Bots sont dans",
  "approvals.bot.settingsLink": "Réglages → Approbations",
  "approvals.bot.title": "Règles",
  "approvals.bot.empty": "Aucune règle pour ce Bot.",
  "approvals.adminLead":
    "Les réglages de l'équipe et les demandes de comptes partagés sont dans",
  "approvals.adminLink": "Administration → Approbations",
  "approvals.before.title": "Avant qu'un Bot agisse",
  "approvals.before.askTitle": "Demander avant d'apporter des modifications",
  "approvals.before.askLine":
    "Vérifie les modifications qu'un Bot apporte aux sites web, aux applis connectées et aux fichiers.",
  "approvals.before.autoTitle": "Vérification automatique",
  "approvals.before.autoEnforced": "Un administrateur l'impose.",
  "approvals.before.autoLine":
    "Avant qu'un Bot fasse quelque chose qui pourrait toucher à tes comptes ou partager des informations, {product} le vérifie par rapport à ta demande et à tes règles. Si ce n'est pas clair, {product} te le demande.",
  "approvals.before.hostTitle": "Commandes sur ton ordinateur",
  "approvals.before.hostLimited":
    "Un administrateur limite cela à « {limit} ».",
  "approvals.before.hostLine":
    "L'appli de bureau {product} te montre quand même chaque commande avant qu'elle s'exécute.",
  "approvals.every.lead":
    "La règle la plus stricte qui correspond l'emporte. Une règle « demander » l'emporte sur une règle « autoriser ». Les règles d'équipe sont verrouillées. Les mots de passe et les réglages de sécurité te reviennent toujours. Les paiements aussi, sauf si tu actives Full access pour un Bot ci-dessous. Les règles d'un Bot sont sur",
  "approvals.every.botPage": "la page de ce Bot",
  "approvals.every.title": "Règles de tous les Bots",
  "approvals.every.empty": "Pas encore de règle.",
  "approvals.other.lead":
    "Elles ne correspondent à aucun Bot que tu peux ouvrir. Elles s'appliquent quand même à tout Bot qui leur correspond. Supprime celles que tu ne veux pas.",
  "approvals.other.title": "Règles pour d'autres Bots",
  "approvals.page.description":
    "Choisis quand tes Bots demandent avant de changer quoi que ce soit. Les règles ici s'appliquent à tous.",
  "approvals.admin.description":
    "Ce que les Bots des membres doivent demander avant d'agir, les règles pour tout le monde et les demandes d'utilisation de comptes partagés.",
  "approvals.team.title": "Réglages de l'équipe",
  "approvals.team.enforce":
    "Exiger la vérification automatique pour tout le monde",
  "approvals.team.custom":
    "Laisser les membres définir leurs règles personnelles",
  "approvals.team.hostTitle":
    "Commandes sur les ordinateurs des membres, au maximum",
  "approvals.team.hostLine":
    "Le réglage plus strict d'un membre s'applique toujours.",
  "approvals.team.rulesLead":
    "Elles s'appliquent aux Bots de chaque membre. Les membres ne peuvent pas les modifier.",
  "approvals.team.rulesTitle": "Règles d'équipe",
  "approvals.team.empty": "Aucune règle d'équipe.",
  "approvals.team.addRule": "Ajouter une règle d'équipe",
  "approvals.shared.title": "Demandes de comptes partagés",
  "approvals.shared.wants": "{bot} veut le compte partagé {account}",
  "approvals.shared.why.refusedCall":
    "Une action a été bloquée. Ce Bot joint plus de personnes que ce qui a été approuvé.",
  "approvals.shared.why.publish":
    "Son propriétaire a élargi qui peut le joindre.",
  "approvals.shared.why.trigger":
    "Son propriétaire a ajouté un déclencheur qui laisse des messages extérieurs l'orienter.",
  "approvals.shared.why.grant": "On lui a donné les actions de l'appli.",
  "approvals.shared.now": "Actuellement :",
  "approvals.shared.notApproved": "Non approuvé",
  "approvals.shared.asked": "Demandé :",
  "approvals.shared.approve": "Approuver",
  "approvals.shared.decline": "Refuser",
  "tasks.updated": "Mis à jour {ago}",
  "routines.status.running": "En cours",
  "routines.status.succeeded": "Réussie",
  "routines.status.failed": "Échouée",
  "routines.status.skipped": "Ignorée",
  "routines.status.waiting": "En attente de toi",
  "routines.status.missed": "Manquée",
  "routines.history.empty":
    "Aucune exécution pour l'instant. Une exécution apparaît ici dès qu'une routine s'est déclenchée, ou après que tu as appuyé sur « Lancer maintenant ».",
  "routines.history.aBot": "Un Bot",
  "routines.history.latest": {
    one: "Affichage de la dernière exécution.",
    other: "Affichage des {count} dernières exécutions.",
    many: "Affichage de {count} de dernières exécutions.",
  },
  "routines.history.deleted": "Une routine depuis supprimée",
  "routines.history.waitingNote":
    "En attente de ton approbation. Ouvre la conversation pour y répondre.",
  "responsibilities.status.completed": "Terminée",
  "responsibilities.summary.paused":
    "Rien ne la lance tant que tu ne la reprends pas.",
  "responsibilities.summary.trigger": "Déclencheur {kind}",
  "responsibilities.summary.starts": "Démarre sur {starts}",
  "responsibilities.summary.asked": "Se lance sur demande",
  "responsibilities.source.manual": "Manuel",
  "responsibilities.source.schedule": "Planification",
  "responsibilities.source.connector": "Appli connectée",
  "responsibilities.progress": "Avancement",
  "responsibilities.lastResult": "Dernier résultat",
  "responsibilities.activeOn": "Ses événements et ses déclencheurs la lancent.",
  "responsibilities.activeOff":
    "En pause. Ses déclencheurs ne la lanceront pas.",
  "responsibilities.runNowLine":
    "Lance la responsabilité maintenant, pour de vrai. Le Bot fait le travail et peut publier et agir.",
  "responsibilities.complete": "Terminer",
  "responsibilities.completeLine":
    "Marque-la comme terminée. Rien ne la lance après cela.",
  "responsibilities.field.title": "Titre",
  "responsibilities.field.instruction": "Consigne",
  "responsibilities.field.criteria": "Critères de réussite",
  "responsibilities.events": "Événements",
  "responsibilities.saving": "Enregistrement…",
  "responsibilities.run.queued": "En file d'attente",
  "responsibilities.run.waiting":
    "En attente de {kind}. Réponds en haut de la page de ce Bot ou dans la conversation.",
  "responsibilities.runs": "Exécutions",
  "responsibilities.viewRuns": "Voir les exécutions",
  "responsibilities.hideRuns": "Masquer les exécutions",
  "passwords.description":
    "Identifiants que tu as enregistrés quand tu connectes un Bot à un site web. Les Bots ne les voient jamais, et tu confirmes chaque utilisation.",
  "passwords.saved": "Identifiants enregistrés",
  "passwords.loadError":
    "Impossible de charger tes mots de passe. Recharge la page.",
  "passwords.off":
    "Un administrateur a désactivé les mots de passe enregistrés. Tes identifiants sont conservés, mais ne seront pas proposés.",
  "passwords.empty":
    "Aucun identifiant enregistré. Choisis « Enregistrer dans Mots de passe » quand tu connectes un Bot à un site web.",
  "passwords.lastUsed": "utilisé pour la dernière fois {date}",
  "passwords.neverUsed": "jamais utilisé",
  "passwords.deleteAria": "Supprimer l'identifiant pour {origin}",
  "settings.notificationsPage":
    "Où les mises à jour de tes Bots t'arrivent quand tu es absent. Règle ce que chaque Bot envoie sur sa propre page.",
  "fullaccess.label.noPayments": "Full access sans paiements",
  "fullaccess.label.full": "Full access",
  "fullaccess.off": "Désactivé",
  "fullaccess.description":
    "Sûr par défaut : tes Bots demandent avant d'envoyer, de payer, de signer, de réserver ou de supprimer. Pour chaque Bot, tu peux choisir de le laisser faire cela sans demander.",
  "fullaccess.offTerm": "Désactivé :",
  "fullaccess.offText":
    "le Bot demande avant d'envoyer, de payer, de signer, de réserver ou de supprimer.",
  "fullaccess.noPaymentsTerm": "Full access sans paiements :",
  "fullaccess.noPaymentsText":
    "il envoie, signe, réserve et supprime sans demander. Les paiements et les achats te sont toujours demandés.",
  "fullaccess.fullTerm": "Full access :",
  "fullaccess.fullText":
    "il paie et achète aussi sans demander. Il n'y a pas de limite de montant tant que les plafonds de dépenses n'existent pas (prévus pour la v0.4).",
  "fullaccess.askTitle": "Donner {label} à {name} ?",
  "fullaccess.give": "Donner {label}",
  "fullaccess.full.p1":
    "{name} enverra, paiera, signera, réservera et supprimera sans te demander d'abord. Il peut agir d'après ce qu'il lit, comme un e-mail ou une page web : n'active cette option que si tu lui fais confiance pour cela.",
  "fullaccess.full.p2":
    "Il n'y a pas de limite sur le montant qu'il peut payer : les plafonds de dépenses n'existent pas encore (ils sont prévus pour la v0.4). Pour que les paiements et les achats te soient toujours demandés, choisis plutôt Full access sans paiements.",
  "fullaccess.full.p3":
    "Les mots de passe et les réglages de sécurité te concernent toujours. Quand un relecteur automatique est configuré, il lit aussi, une fois, chaque commande et chaque script que le membre exécute sur son ordinateur, même si tu as désactivé le relecteur ; quand aucun n'est configuré, une commande n'est pas lue. Cela s'applique à ce que tu demandes dans tes propres chats, pas aux routines ni aux check-ins. Tu peux le désactiver à tout moment, et cela s'arrête aussitôt.",
  "fullaccess.noPayments.p1":
    "{name} enverra, signera, réservera et supprimera sans te demander d'abord. Les paiements et les achats te sont toujours demandés. Il peut agir d'après ce qu'il lit, comme un e-mail ou une page web : n'active cette option que si tu lui fais confiance pour cela.",
  "fullaccess.noPayments.p2":
    "L'app reconnaît un paiement grâce à ses contrôles intégrés : un message qui ne fait que mentionner un paiement peut donc aussi demander, et un paiement formulé de manière inhabituelle pourrait ne pas être repéré. Les mots de passe et les réglages de sécurité te concernent toujours. Quand un relecteur automatique est configuré, il lit aussi, une fois, chaque commande et chaque script que le membre exécute sur son ordinateur pour un mot de passe, un réglage de sécurité ou un paiement fait ainsi, même si tu as désactivé le relecteur ; quand aucun n'est configuré, une commande n'est pas lue. Cela s'applique à ce que tu demandes dans tes propres chats, pas aux routines ni aux check-ins. Tu peux le désactiver à tout moment, et cela s'arrête aussitôt.",
  "fullaccess.noBots": "Aucun Bot pour l'instant.",
  "fullaccess.legend": "Accès pour {name}",
  "fullaccess.radioAria": "{label} pour {name}",
  "fullaccess.summary.off":
    "Demande avant d'envoyer, de payer, de signer, de réserver ou de supprimer.",
  "fullaccess.summary.noPayments":
    "Agit sans demander, sauf que les paiements et les achats te sont toujours demandés. Depuis {since}.",
  "fullaccess.summary.full":
    "Agit sans demander, paiements compris, sans limite de montant. Depuis {since}.",
  "fullaccess.doneTitle": "Fait sans demander",
  "fullaccess.doneDescription":
    "Ce qu'un Bot avec Full access a fait sans te demander, du plus récent au plus ancien.",
  "fullaccess.nothingYet": "Rien pour l'instant.",
  "approvals.audience.owner": "Seulement son propriétaire",
  "approvals.audience.team": "Tout le monde",
  "approvals.audience.outside": ", et les entrées extérieures",
  "approvals.audience.nobody": "Personne de nommé",
  "approvals.audience.groups": {
    one: "Le groupe {names}",
    other: "Les groupes {names}",
    many: "Les groupes {names}",
  },
  "approvals.audience.people": {
    one: "{count} personne",
    other: "{count} personnes",
    many: "{count} de personnes",
  },
  "approvals.audience.join": "{a} et {b}",
  "access.req.title": "Demandes",
  "access.req.loadError":
    "Impossible de charger les demandes d'accès. Recharge la page.",
  "access.req.descApp":
    "Des personnes demandent cette app. Approuver fait aussitôt ce qu'elles ont demandé.",
  "access.req.descAll":
    "Des personnes demandent qu'une app soit activée, donnée à un Bot ou connectée. Approuver fait aussitôt ce qu'elles ont demandé.",
  "access.req.aBot": "un Bot",
  "access.req.theBot": "le Bot",
  "access.req.somebody": "Quelqu'un",
  "access.req.enable": "Activer {app} pour {bot}",
  "access.req.grantMore": "Donner à {bot} plus de {app} : {list}",
  "access.req.grant": "Donner {app} à {bot}",
  "access.req.connectShared": "Connecter le compte {app} partagé",
  "access.req.asked": "{who} l'a demandé {when}{forBot}.",
  "access.req.forBot": ", pour {bot}",
  "access.req.approving": "Approbation…",
  "access.req.botPage": "la page du Bot sous {app}",
  "access.req.toolRead": "{name} (lecture seule)",
  "access.req.toolWrite": "{name} (modifie quelque chose)",
  "access.req.gives":
    "Approuver donne à {bot} exactement ces outils et rien d'autre : {list}.",
  "access.req.readOnly":
    "Approuver donne à {bot} uniquement les actions en lecture seule de {app}. Choisis les autres dans {page}.",
  "access.req.canSend": {
    one: "{names} peut envoyer au nom de la personne.",
    other: "{names} peuvent chacun envoyer au nom de la personne.",
    many: "{names} peuvent chacun envoyer au nom de la personne.",
  },
  "access.req.unreviewed": {
    one: "Aucune liste vérifiée n'indique ce que fait {names} dans {app} : il peut donc envoyer au nom de la personne.",
    other:
      "Aucune liste vérifiée n'indique ce que font {names} dans {app} : chacun peut donc envoyer au nom de la personne.",
    many: "Aucune liste vérifiée n'indique ce que font {names} dans {app} : chacun peut donc envoyer au nom de la personne.",
  },
  "access.req.neverGives": {
    one: "Approuver ne donne jamais un tel outil : autorise-le dans les réglages, dans {page}.",
    other:
      "Approuver ne donne jamais de tels outils : autorise-les dans les réglages, dans {page}.",
    many: "Approuver ne donne jamais de tels outils : autorise-les dans les réglages, dans {page}.",
  },
  "access.req.and": "{a} et {b}",
  "passwords.saveTo": "Enregistrer dans Mots de passe",
  "responsibilities.run.waitKind.approval": "ton approbation",
  "responsibilities.run.waitKind.question": "ta réponse",
  "responsibilities.run.waitKind.handoff": "ta prise de relais",
  "responsibilities.run.waitKind.signIn": "ta connexion",
  "responsibilities.run.waitKind.other": "toi",
  "responsibilities.new.description":
    "Un objectif continu. Le Bot y travaille dans la conversation que tu choisis.",
  "responsibilities.new.chooseConversation": "Choisis une conversation",
  "responsibilities.new.loadMore": "Charger plus de conversations",
  "responsibilities.new.titleExample": "Tenir à jour le rapport client",
  "responsibilities.new.criteriaExample":
    "Le rapport contient le graphique du trimestre en cours et un lien vers la source.",
  "responsibilities.new.eventSource": "Source d'événements",
  "responsibilities.new.source.none": "Lancer sur demande",
  "responsibilities.new.githubHelp":
    "Les événements viennent des dépôts que tu as connectés dans {link}.",
  "responsibilities.new.eventType": "Type d'événement",
  "responsibilities.new.creating": "Création…",
  "responsibilities.new.create": "Créer la responsabilité",
  "triggers.kind.email": "E-mail",
  "triggers.help.webhook":
    "Envoie un POST JSON à cette URL avec l'en-tête Authorization, ou avec les en-têtes de signature Standard Webhooks. Un 200 signifie que c'est reçu, pas que l'exécution est terminée.",
  "triggers.help.github":
    "Dans Settings → Webhooks du dépôt, mets cette URL comme payload URL, application/json comme content type, et la clé comme secret.",
  "triggers.help.linear":
    "Dans Linear, Settings → API → Webhooks : indique l'URL, puis colle ici le signing secret que Linear affiche.",
  "triggers.help.sentry":
    "Dans une intégration interne Sentry, indique l'URL du webhook, puis colle ici le client secret de l'intégration.",
  "triggers.help.pagerduty":
    "Dans PagerDuty, Integrations → Generic Webhooks (v3) : indique l'URL, puis colle ici le secret affiché à la création.",
  "triggers.help.email":
    "Envoie ou transfère un e-mail à cette adresse pour lancer une exécution.",
  "triggers.help.slack":
    "Se lance sur les événements Slack que ce Bot reçoit. Les messages envoyés avant l'ajout du déclencheur sont ignorés.",
  "triggers.slack.mention": "Le Bot est mentionné",
  "triggers.slack.phrase": "Un message contient une expression",
  "triggers.slack.reaction": "Une réaction est ajoutée",
  "triggers.slack.message": "N'importe quel message",
  "triggers.f.inChannels": "dans {channels}",
  "triggers.f.everyChannel": "dans chaque canal où se trouve le Bot",
  "triggers.f.mention": "quand le Bot est mentionné",
  "triggers.f.anyMessage": "sur n'importe quel message",
  "triggers.f.phrases": "sur les messages contenant {phrases}",
  "triggers.f.or": " ou ",
  "triggers.f.reactions": "sur les réactions",
  "triggers.f.slack": "{what} {where} (espace de travail {team})",
  "triggers.f.events": "événements {types}",
  "triggers.f.everyEvent": "chaque événement",
  "triggers.f.where": "quand {path} = {equals}",
  "triggers.f.from": "de {from}",
  "triggers.f.fromSenders": "de {senders} (authentifié)",
  "triggers.title": "Déclencheurs",
  "triggers.add": "Ajouter un déclencheur",
  "triggers.notActive.paused":
    "Cette responsabilité est en pause. Ses déclencheurs ne la lanceront pas.",
  "triggers.notActive.completed":
    "Cette responsabilité est terminée. Ses déclencheurs ne la lanceront pas.",
  "triggers.none":
    "Aucun déclencheur. Elle s'exécute quand tu appuies sur Lancer maintenant, ou sur les événements ci-dessus.",
  "triggers.removeForGood": "Supprimer définitivement",
  "triggers.keep": "Garder",
  "triggers.runOnAria": "Lancer sur ce déclencheur {kind}",
  "triggers.postTo": "POST vers",
  "triggers.copyUrl": "Copier l'URL",
  "triggers.copyAddress": "Copier l'adresse",
  "triggers.emailOff":
    "L'e-mail n'est pas encore configuré sur {product} : cette adresse ne peut donc pas recevoir de messages. Un administrateur doit l'activer.",
  "triggers.key": "Clé",
  "triggers.copyKey": "Copier la clé",
  "triggers.copyHeader": "Copier l'en-tête",
  "triggers.showKey": "Afficher la clé",
  "triggers.replaceKey": "Remplacer la clé",
  "triggers.secretSaved": "Signing secret enregistré",
  "triggers.secretWaiting": "En attente du signing secret",
  "triggers.secret": "Signing secret",
  "triggers.pasteNew": "Colle un nouveau secret pour le remplacer",
  "triggers.paste": "Colle le signing secret",
  "triggers.saveSecret": "Enregistrer le secret",
  "triggers.addDescription":
    "Quelque chose d'extérieur à {product} qui lance cette responsabilité.",
  "triggers.slackTeam": "ID de l'équipe Slack",
  "triggers.fireOn": "Déclencher sur",
  "triggers.phrases": "Expressions (séparées par des virgules)",
  "triggers.reactions": "Réactions (vide : toutes)",
  "triggers.channelIds": "ID de canaux (vide : tous ceux où se trouve le Bot)",
  "triggers.eventTypes": "Types d'événements",
  "triggers.onlyWhen": "Seulement quand le champ",
  "triggers.equals": "est égal à",
  "triggers.repository": "Dépôt (facultatif)",
  "triggers.senders": "Expéditeurs autorisés (vide : personne)",
  "triggers.secretLater": "Signing secret (peut être ajouté plus tard)",
  "triggers.adding": "Ajout…",
  "triggers.addKind": "Ajouter un déclencheur {kind}",
  "triggers.example.webhook": "deploy.finished (vide : tous)",
  "routines.cal.intro":
    "Les {days} prochains jours, pour les routines activées. Les heures sont dans ton fuseau horaire.",
  "routines.cal.none":
    "Aucune routine pour l'instant : rien n'est donc planifié.",
  "routines.cal.noneOn":
    "Aucune de ces routines n'est activée : aucune ne s'exécutera donc.",
  "routines.cal.nothing":
    "Rien n'est planifié dans les {days} prochains jours.",
  "routines.cal.truncated":
    "Seules les {max} premières exécutions de ces {days} jours sont listées.",
  "routines.cal.paused": {
    one: "{count} routine en pause, donc non listée ici. Active-en une pour voir quand elle s'exécute.",
    other:
      "{count} routines en pause, donc non listées ici. Active-en une pour voir quand elle s'exécute.",
    many: "{count} de routines en pause, donc non listées ici. Active-en une pour voir quand elle s'exécute.",
  },
  "routines.week.nothing":
    "Rien n'est planifié pour le reste de cette semaine.",
  "routines.week.label": "Cette semaine",
  "routines.week.today": "aujourd'hui",
  "routines.week.now": "Maintenant, {time}",
  "routines.week.next": "Ensuite :",
  "routines.week.nothingElse": "Rien d'autre n'est planifié cette semaine.",
  "routines.week.truncated":
    "Seules les premières exécutions des prochains jours sont listées : une routine très active peut donc ne pas apparaître tous les jours.",
  "routines.week.historyError":
    "Les exécutions déjà passées n'ont pas pu être chargées : elles ne sont donc pas affichées.",
  "routines.week.note":
    "Les heures sont dans ton fuseau horaire. Une routine qui s'exécute plus d'une fois par heure apparaît comme un seul bloc pour la journée.",
  "routines.week.summary": "{count} exécutions, toutes les ~{minutes} min",
  "routines.week.gone": "{label}, conversation supprimée",
  "routines.card.label": "Routine",
  "routines.card.cancelled": "Routine annulée",
  "routines.card.readError": "Cette routine n'a pas pu être lue.",
  "routines.card.reading": "Lecture de cette routine…",
  "routines.card.gone": "Cette routine n'existe plus",
  "routines.card.cannotSend":
    "Cette conversation ne peut pas recevoir de message pour le moment. Écris la modification dans la zone de message ci-dessous.",
  "routines.card.confirm": "Annuler cette routine ?",
  "routines.card.yes": "Oui, l'annuler",
  "routines.card.no": "Non, la garder",
  "routines.card.pause": "Mettre en pause",
  "routines.card.resume": "Reprendre",
  "routines.card.edit": "Modifier",
  "routines.card.whatChange": "Qu'est-ce qui doit changer ?",
  "routines.card.send": "Envoyer la modification",
  "routines.card.writeBelow":
    "Écris la modification dans la zone de message ci-dessous.",
  "routines.card.close": "Fermer",
  "admin.boundaries.title": "Limites",
  "admin.boundaries.descLead":
    "Ce qu'un Bot peut et ne peut pas faire avec son ordinateur. Chaque action est vérifiée avant d'avoir lieu. Les refus apparaissent dans",
  "admin.boundaries.descAudit": "Audit",
  "admin.boundaries.descTail": "avec la règle qui les a refusés.",
  "admin.boundaries.whenTitle": "Quand une règle correspond",
  "admin.boundaries.whenDesc":
    "Arrêter l'action, ou l'enregistrer et la laisser passer. Enregistrer te permet d'essayer une règle sur une activité réelle avant qu'elle ne refuse quoi que ce soit.",
  "admin.boundaries.modeEnforce": "Arrêter l'action",
  "admin.boundaries.modeRecord": "L'enregistrer et l'autoriser",
  "admin.boundaries.modeEnforceNote":
    "Le Bot est arrêté et on lui dit quelle règle l'a refusé.",
  "admin.boundaries.modeRecordNote":
    "Rien n'est arrêté. Chaque correspondance est enregistrée comme si elle avait été refusée.",
  "admin.boundaries.neverTitle": "Les Bots ne peuvent jamais",
  "admin.boundaries.neverLead":
    "Vérifiées en premier. Une correspondance arrête l'action, et on dit au Bot quelle règle l'a refusée. Les règles sont en CEL. Elles peuvent vérifier",
  "admin.boundaries.neverMid1": ", l'élément, la touche",
  "admin.boundaries.neverMid2": "pressée, le fichier, la",
  "admin.boundaries.neverMid3": "exécutée, et",
  "admin.boundaries.neverMid4": "pour les outils externes.",
  "admin.boundaries.neverMid5": "dit ce qui a lancé l'exécution :",
  "admin.boundaries.neverTail":
    "Une exécution planifiée agit comme son propriétaire, donc",
  "admin.boundaries.neverTail2":
    "seul ne peut pas te le dire. Une règle qui ne peut pas être évaluée compte comme une correspondance. Une faute de frappe ne laisse jamais passer une action.",
  "admin.boundaries.or": "ou",
  "admin.boundaries.noRules":
    "Aucune règle. Chaque action est autorisée et enregistrée.",
  "admin.boundaries.remove": "Retirer",
  "admin.boundaries.ruleLabel": "Une règle, écrite en CEL",
  "admin.boundaries.testing": "Test en cours…",
  "admin.boundaries.testFirst": "Tester d'abord",
  "admin.boundaries.addRule": "Ajouter une règle",
  "admin.boundaries.preset.form": "Ne jamais envoyer un formulaire",
  "admin.boundaries.preset.formCost":
    "Empêche aussi le Bot d'appuyer sur Entrée ailleurs. Un formulaire peut s'envoyer avec Entrée dans n'importe quel champ. Cela ne couvre pas un choix dans un menu ou un champ de date, dont le changement peut envoyer un formulaire tout seul.",
  "admin.boundaries.preset.password":
    "Ne jamais taper dans un champ de mot de passe",
  "admin.boundaries.preset.passwordCost":
    "Un champ de mot de passe avec un autre libellé n'est pas couvert. La règle s'appuie sur le libellé.",
  "admin.boundaries.preset.social": "Rester hors des réseaux sociaux",
  "admin.boundaries.preset.socialCost":
    "Seulement ces deux hôtes. Un lien qui redirige vers eux depuis ailleurs est autorisé.",
  "admin.boundaries.otherwiseTitle": "Sinon ils peuvent",
  "admin.boundaries.otherwiseDesc":
    "S'applique à tout ce que la liste ci-dessus n'a pas retenu. Une liste vide ici n'autorise rien, et chaque action est refusée.",
  "admin.boundaries.allowAll": "true, tout ce qui n'est pas refusé ci-dessus",
  "admin.boundaries.saved":
    "Enregistré. S'applique à la prochaine action de n'importe quel Bot.",
  "admin.boundaries.footer":
    "Les changements s'appliquent à la prochaine action de n'importe quel Bot. Ils restent après un redémarrage.",
  "admin.boundaries.dry.none":
    "Aucune action d'ordinateur enregistrée pour tester pour l'instant. La règle est valide. Tu verras ce qu'elle retient une fois que les Bots auront agi.",
  "admin.boundaries.dry.zero":
    "Testée sur les {scanned} dernières actions enregistrées. Cette règle n'en aurait refusé aucune. Elle peut quand même correspondre à des actions futures.",
  "admin.boundaries.dry.some":
    "Testée sur les {scanned} dernières actions enregistrées. Cette règle en aurait refusé {refused}.",
  "admin.boundaries.dry.wouldRefuse": "Refuserait",
  "admin.boundaries.dry.wouldAllow": "Autoriserait maintenant",
  "admin.boundaries.dry.on": "sur « {name} »",
  "admin.boundaries.dry.running": "exécute",
  "admin.boundaries.dry.touching": "touche {file}",
  "admin.boundaries.dry.first":
    "Affichage des {shown} premières. Le total ci-dessus couvre tout ce qui a été vérifié.",
  "admin.people.title": "Personnes",
  "admin.people.desc":
    "Toutes les personnes qui se sont connectées. Les admins peuvent ouvrir ces écrans. Tous les autres parlent aux Bots.",
  "admin.people.whoTitle": "Qui est ici",
  "admin.people.whoDesc":
    "Les adresses de INITIAL_ADMIN_EMAILS sont toujours admins. Tu ne peux pas les changer ici.",
  "admin.people.stopped": {
    one: "{count} ordinateur arrêté",
    many: "{count} d'ordinateurs arrêtés",
    other: "{count} ordinateurs arrêtés",
  },
  "admin.people.stoppedFailed": ". {failed} n'ont pas pu être arrêtés",
  "admin.people.disksKept": ". Leurs disques sont conservés.",
  "admin.people.searchLabel": "Rechercher des personnes",
  "admin.people.searchPlaceholder": "Rechercher par nom ou adresse",
  "admin.people.loadError":
    "Impossible de charger les personnes. Recharge la page.",
  "admin.people.noMatch": "Personne ne correspond à « {query} ».",
  "admin.people.nobody":
    "Personne ne s'est encore connecté. Les personnes apparaîtront ici dès qu'elles le feront.",
  "admin.people.lastSignedIn": "dernière connexion {date}",
  "admin.people.neverSignedIn": "jamais connecté",
  "admin.people.noProvider": "aucun fournisseur",
  "admin.people.accessRemoved": "Accès retiré",
  "admin.people.adminByConfig": "Admin par configuration",
  "admin.people.stopComputers": "Arrêter les ordinateurs",
  "admin.people.restore": "Rétablir",
  "admin.people.remove": "Retirer",
  "admin.people.adminSwitch": "Admin : {email}",
  "admin.people.loading": "Chargement…",
  "admin.people.showMore": "Afficher plus",
  "admin.boundaries.and": "et",
  "admin.credentials.title": "Identifiants",
  "admin.credentials.add": "Ajouter un identifiant",
  "admin.credentials.desc":
    "Clés et jetons de ce déploiement. {product} n'affiche jamais un secret une fois enregistré.",
  "admin.credentials.dialogDesc":
    "Enregistré pour ce déploiement. Tu ne reverras pas le secret.",
  "admin.credentials.type": "Type",
  "admin.credentials.model": "Modèle",
  "admin.credentials.connector": "Connecteur",
  "admin.credentials.provider": "Fournisseur",
  "admin.credentials.keyId": "ID de la clé",
  "admin.credentials.secret": "Secret",
  "admin.credentials.replaces":
    "Cette clé a déjà un identifiant actif. L'enregistrement le remplace et révoque l'ancien.",
  "admin.credentials.saveError":
    "Impossible d'enregistrer l'identifiant. Réessaie.",
  "admin.credentials.cancel": "Annuler",
  "admin.credentials.saving": "Enregistrement…",
  "admin.credentials.save": "Enregistrer l'identifiant",
  "admin.credentials.savedTitle": "Identifiants enregistrés",
  "admin.credentials.loadError":
    "Impossible de charger les identifiants. Recharge la page.",
  "admin.credentials.empty":
    "Aucun identifiant pour l'instant. Ajoutes-en un avec Ajouter un identifiant.",
  "admin.credentials.revoked": "révoqué",
  "admin.credentials.active": "actif",
  "admin.credentials.revoke": "Révoquer",
  "admin.idp.title": "Fournisseurs d'identité",
  "admin.idp.add": "Ajouter un fournisseur",
  "admin.idp.desc":
    "Le fournisseur SAML ou OpenID Connect propre à ton entreprise. Les gens se connectent avec leur e-mail, et son domaine choisit le fournisseur.",
  "admin.idp.registeredTitle": "Enregistrés",
  "admin.idp.registeredDesc":
    "Google, Microsoft et Okta sont définis dans l'environnement. Ils n'apparaissent pas ici.",
  "admin.idp.loadError":
    "Impossible de charger les fournisseurs d'identité. Recharge la page.",
  "admin.idp.empty":
    "Aucun fournisseur d'identité pour l'instant. Ajoutes-en un avec les métadonnées de ton équipe d'identité.",
  "admin.idp.remove": "Retirer",
  "admin.idp.dialogTitle": "Ajouter un fournisseur d'identité",
  "admin.idp.name": "Nom",
  "admin.idp.domain": "Domaine de l'e-mail",
  "admin.idp.domainNote":
    "Toute personne ayant une adresse de ce domaine se connecte ici. Sépare plusieurs domaines par des virgules.",
  "admin.idp.issuer": "Émetteur",
  "admin.idp.signOnUrl": "URL de connexion",
  "admin.idp.metadata": "XML de métadonnées",
  "admin.idp.metadataNote":
    "Le fichier de ton équipe d'identité. Il comprend le certificat de signature.",
  "admin.idp.clientId": "ID client",
  "admin.idp.clientSecret": "Secret client",
  "admin.idp.cancel": "Annuler",
  "admin.idp.adding": "Ajout…",
  "admin.idp.addShort": "Ajouter",
  "admin.audit.decision.bot.declined": "Le Bot a refusé",
  "admin.audit.decision.agent.stream_stalled": "Le Bot a cessé de répondre",
  "admin.audit.decision.computer.policy_loaded": "Limite au démarrage",
  "admin.audit.decision.computer.isolation_loaded": "Isolation au démarrage",
  "admin.audit.decision.computer.control_taken": "Une personne a pris la main",
  "admin.audit.decision.computer.control_released":
    "La main est revenue au Bot",
  "admin.audit.decision.computer.help_requested": "Le Bot a demandé de l'aide",
  "admin.audit.decision.computer.secret_requested":
    "Le Bot a demandé un secret",
  "admin.audit.decision.computer.secret_supplied":
    "Une personne a fourni un secret",
  "admin.audit.decision.computer.reset": "L'ordinateur a été réinitialisé",
  "admin.audit.decision.computer.updated": "L'ordinateur a été mis à jour",
  "admin.audit.decision.computer.stopped": "Une personne a appuyé sur arrêt",
  "admin.audit.decision.component.granted": "Accordé à ce Bot",
  "admin.audit.decision.component.revoked": "Retiré à ce Bot",
  "admin.audit.decision.component.published":
    "Publié. Tous les Bots peuvent l'utiliser",
  "admin.audit.decision.component.unpublished":
    "Dépublié. Aucun Bot ne peut l'utiliser",
  "admin.audit.decision.component.draft_saved":
    "Brouillon enregistré, pas encore publié",
  "admin.audit.decision.component.refused": "Refusé",
  "admin.audit.decision.component.function_granted": "Peut lire ceci",
  "admin.audit.decision.component.function_revoked": "Ne peut plus lire ceci",
  "admin.audit.decision.component.function_called": "A lu de vraies données",
  "admin.audit.decision.component.function_refused": "Refusé",
  "admin.audit.decision.component.function_failed": "N'a pas pu le lire",
  "admin.audit.decision.mcp.tools_discovered":
    "Outils proposés pour une exécution",
  "admin.audit.decision.mcp.call_succeeded": "Appelé au nom de ce Bot",
  "admin.audit.decision.mcp.call_rejected": "Bloqué",
  "admin.audit.decision.mcp.call_failed": "Le serveur n'a pas répondu",
  "admin.audit.decision.mcp.callback_refused":
    "N'a pas pu confirmer de quel Bot il s'agissait",
  "admin.audit.decision.configuration.changed": "Configuration modifiée",
  "admin.audit.decision.credential.created": "Identifiant enregistré",
  "admin.audit.discovery.under-floor":
    "Assez peu d'outils pour tous les proposer",
  "admin.audit.discovery.nothing-declared":
    "Aucune compétence ne déclare un de ces outils",
  "admin.audit.discovery.unavailable":
    "Choix impossible, donc tous ont été proposés",
  "admin.audit.discovery.nothing-chosen":
    "Aucune compétence appliquée, donc tous ont été proposés",
  "admin.audit.discovery.selected": "Choisis par compétence",
  "admin.audit.title": "Audit",
  "admin.audit.desc":
    "Chaque action d'un Bot, et chacune que la politique de ce déploiement a refusée.",
  "admin.audit.export": "Exporter en CSV",
  "admin.audit.exporting": "Export en cours…",
  "admin.audit.refresh": "Actualiser",
  "admin.audit.exportFailed":
    "Impossible d'exporter les événements d'audit. Réessaie.",
  "admin.audit.filter.all": "Tout",
  "admin.audit.filter.computer": "Actions d'ordinateur",
  "admin.audit.filter.blocked": "Bloqué",
  "admin.audit.filter.didNot": "N'a pas eu lieu",
  "admin.audit.filter.nobody": "Personne ne surveille",
  "admin.audit.capped":
    "Le fichier contient les {count} événements les plus récents, pas tous. Resserre le filtre ou les dates pour exporter le reste.",
  "admin.audit.loadError":
    "Impossible de charger le journal d'audit. Recharge la page.",
  "admin.audit.empty": "Aucun événement ne correspond encore à ce filtre.",
  "admin.audit.col.when": "Quand",
  "admin.audit.col.what": "Quoi",
  "admin.audit.col.on": "Sur",
  "admin.audit.col.bot": "Bot",
  "admin.audit.col.startedBy": "Lancé par",
  "admin.audit.col.decision": "Décision",
  "admin.audit.by.routine": "Une routine",
  "admin.audit.by.handedOnBy": "Transmis par {name}",
  "admin.audit.by.handedOn": "Transmis",
  "admin.audit.by.memory": "Une source de mémoire",
  "admin.audit.by.responsibility": "Une responsabilité",
  "admin.audit.by.deployment": "Ce déploiement",
  "admin.audit.by.remote": "Un navigateur non associé à l'ordinateur",
  "admin.audit.by.person": "Une personne",
  "admin.audit.routed.mention": "La personne a choisi ce Bot",
  "admin.audit.routed.default": "Envoyé au Bot par défaut",
  "admin.audit.routed.meant": "Envoyé au Bot auquel il était destiné",
  "admin.audit.toolsOf": "{offered} outils sur {granted}",
  "admin.audit.blocked": "Bloqué",
  "admin.audit.didNot": "N'a pas eu lieu",
  "admin.audit.allowed": "Autorisé",
  "admin.audit.reportedByBot": ", signalé par le Bot lui-même",
  "admin.audit.dryRun": "essai à blanc : enregistré, non appliqué",
  "admin.nav.back": "Retour à l'app",
  "admin.nav.overview": "Vue d'ensemble",
  "admin.nav.reach": "Ce que les Bots peuvent atteindre",
  "admin.nav.do": "Ce que les Bots peuvent faire",
  "admin.nav.in": "Qui peut entrer",
  "admin.nav.happened": "Ce qui s'est passé",
  "admin.nav.credentials": "Identifiants",
  "admin.nav.boundaries": "Limites",
  "admin.nav.approvals": "Approbations",
  "admin.nav.computers": "Ordinateurs",
  "admin.nav.plugins": "Plugins",
  "admin.nav.skills": "Compétences",
  "admin.nav.learning": "Apprentissage automatique",
  "admin.nav.components": "Composants d'interface",
  "admin.nav.playground": "Playground",
  "admin.nav.people": "Personnes",
  "admin.nav.idp": "Fournisseurs d'identité",
  "admin.nav.audit": "Audit",
  "admin.enterprise.mode.allow_all": "Autoriser tout accès au réseau",
  "admin.enterprise.mode.defaults_plus_allowlist":
    "Valeurs par défaut plus liste autorisée de l'équipe",
  "admin.enterprise.mode.allowlist_only":
    "Liste autorisée de l'équipe uniquement",
  "admin.enterprise.noPolicy":
    "Aucune politique. Les ordinateurs des Bots peuvent atteindre tout ce que le cluster autorise",
  "admin.enterprise.locked": " · verrouillé",
  "admin.enterprise.loadError":
    "Impossible de charger les contrôles d'entreprise. Recharge la page.",
  "admin.enterprise.title": "Contrôles d'entreprise",
  "admin.enterprise.description":
    "Ce que les membres peuvent utiliser, comment les ordinateurs des Bots accèdent au réseau et ce qui est enregistré. Chaque modification apparaît dans l'Audit.",
  "admin.enterprise.signin.description":
    "Les adresses de {env} peuvent toujours utiliser la connexion via un réseau social, comme accès de secours. Chacune de ces connexions apparaît dans l'Audit.",
  "admin.enterprise.signin.title": "Connexion",
  "admin.enterprise.sso.title": "Exiger le SSO",
  "admin.enterprise.sso.on":
    "Les personnes ne peuvent se connecter que via un fournisseur SAML ou OpenID Connect enregistré.",
  "admin.enterprise.sso.off":
    "Les personnes peuvent aussi se connecter avec Google, Microsoft ou Okta.",
  "admin.enterprise.scim.title": "Provisionnement SCIM",
  "admin.enterprise.scim.on":
    "URL de base de l'annuaire {url} avec le jeton porteur {env}. Le déprovisionnement met fin aux sessions, bloque l'adresse, retire les identifiants des connecteurs et arrête leurs ordinateurs.",
  "admin.enterprise.scim.unsetUrl": "(définis BETTER_AUTH_URL)",
  "admin.enterprise.scim.off":
    "Désactivé. Définis {env} pour accepter le provisionnement depuis Okta, Entra ou un autre annuaire.",
  "admin.enterprise.on": "Activé",
  "admin.enterprise.off": "Désactivé",
  "admin.enterprise.cap.description":
    "Chaque interrupteur s'applique à toute l'organisation. Un rôle peut le remplacer, et un groupe de l'annuaire peut recevoir une capacité que l'organisation a désactivée.",
  "admin.enterprise.cap.title": "Capacités",
  "admin.enterprise.cap.offFor":
    "Désactivée pour tout le monde, sauf si un rôle ou un groupe l'active.",
  "admin.enterprise.over.title": "Exceptions par rôle et par groupe",
  "admin.enterprise.over.none":
    "Aucune. Tout le monde reçoit les interrupteurs ci-dessus",
  "admin.enterprise.over.set": "{count} définies",
  "admin.enterprise.net.description":
    "Où les ordinateurs des Bots peuvent se connecter. Les modifications atteignent les ordinateurs en marche en quelques secondes, sans redémarrage. La politique d'un groupe remplace celle de l'organisation, sauf si elle est verrouillée.",
  "admin.enterprise.net.title": "Réseau",
  "admin.enterprise.net.org": "Organisation",
  "admin.enterprise.net.group": "Groupe : {name}",
  "admin.enterprise.net.addGroup": "Ajouter une politique de groupe",
  "admin.enterprise.mcp.description":
    "Avec la liste autorisée activée, les Bots ne peuvent appeler que les outils des serveurs MCP approuvés ici. Les appels vers tout autre serveur sont refusés.",
  "admin.enterprise.mcp.title": "Serveurs MCP",
  "admin.enterprise.mcp.only": "Serveurs approuvés uniquement",
  "admin.enterprise.mcp.approved": "{count} approuvés",
  "admin.enterprise.mcp.offDesc":
    "Désactivé. Les Bots peuvent utiliser tout serveur enregistré auquel ils ont accès.",
  "admin.enterprise.mcp.onlyAria": "Serveurs MCP approuvés uniquement",
  "admin.enterprise.mcp.approveAria": "Approuver {name}",
  "admin.enterprise.models.description":
    "Le Bot intégré fonctionne avec {model}. Un Bot distant choisit le sien, et le modèle qu'il indique est enregistré.",
  "admin.enterprise.models.configured":
    "le modèle configuré pour ce déploiement",
  "admin.enterprise.models.title": "Modèles",
  "admin.enterprise.models.allowlist": "Liste de modèles autorisés",
  "admin.enterprise.models.allowlistOn":
    "Un Bot intégré qui utilise un modèle absent de la liste est refusé avant de s'exécuter.",
  "admin.enterprise.models.allowlistOff":
    "Désactivée. N'importe quel modèle peut être utilisé.",
  "admin.enterprise.models.allowed": "Modèles autorisés",
  "admin.enterprise.models.none": "Aucun listé",
  "admin.enterprise.models.listDesc":
    "Un modèle par ligne, sous la forme fournisseur/modèle, par exemple {example}.",
  "admin.enterprise.rec.description":
    "Définis {env} pour envoyer en continu les événements d'audit et les actions des Bots vers ton collecteur OpenTelemetry ou ton SIEM. Ils portent l'étiquette {tag}.",
  "admin.enterprise.rec.title": "Enregistrement et export",
  "admin.enterprise.rec.action": "Action Recording",
  "admin.enterprise.rec.actionOn":
    "Les commandes shell exécutées par les Bots sont enregistrées sans leurs secrets et conservées {days} jours.",
  "admin.enterprise.rec.actionOff":
    "Désactivé. Les commandes n'apparaissent que dans l'Audit.",
  "admin.enterprise.rec.otel": "Export OpenTelemetry",
  "admin.enterprise.rec.otelOn": "Export en cours via OTLP/HTTP.",
  "admin.enterprise.rec.otelOff":
    "Non configuré. Définis {env} sur le serveur.",
  "admin.enterprise.comp.description":
    "Arrêter un ordinateur met fin aux Bots qui y tournent et garde son disque. Le Bot reçoit un ordinateur neuf à la session suivante. Pour arrêter les ordinateurs d'une seule personne, va dans Personnes.",
  "admin.enterprise.comp.title": "Ordinateurs",
  "admin.enterprise.comp.stopInactive": "Arrêter les ordinateurs inactifs",
  "admin.enterprise.comp.afterDays": "Après {days} jours sans utilisation",
  "admin.enterprise.usage.error":
    "Impossible de charger l'utilisation des modèles. Recharge la page.",
  "admin.enterprise.usage.empty":
    "Aucune exécution de Bot ces 30 derniers jours.",
  "admin.enterprise.usage.runs":
    "{runs} exécutions par {people} {who} en 30 jours",
  "admin.enterprise.usage.person": "personne",
  "admin.enterprise.usage.people": "personnes",
  "admin.enterprise.usage.refused": " · {count} hors de la liste autorisée",
  "admin.enterprise.recorded.error":
    "Impossible de charger les actions enregistrées. Recharge la page.",
  "admin.enterprise.recorded.empty":
    "Aucune commande enregistrée pour l'instant.",
  "admin.enterprise.recorded.local": "Machine du membre",
  "admin.enterprise.recorded.bot": "Bot {id}",
  "admin.enterprise.sweep.stopping": "Arrêt en cours…",
  "admin.enterprise.sweep.now": "Arrêter les ordinateurs inactifs maintenant",
  "admin.enterprise.sweep.stopped": "{count} arrêtés.",
  "admin.enterprise.ov.admins": "Admins",
  "admin.enterprise.ov.members": "Membres",
  "admin.enterprise.ov.group": "Groupe : {name}",
  "admin.enterprise.ov.scope": "Portée",
  "admin.enterprise.ov.groupNote":
    "Un groupe ne peut qu'ajouter. Accorder donne la capacité à ses membres même si l'organisation l'a désactivée.",
  "admin.enterprise.ov.roleNote":
    "Le réglage d'un rôle remplace l'interrupteur de l'organisation pour toutes les personnes qui ont ce rôle.",
  "admin.enterprise.ov.forScope": "{title} pour {scope}",
  "admin.enterprise.ov.inherit": "Hériter",
  "admin.enterprise.ov.grant": "Accorder",
  "admin.enterprise.netd.org": "Politique réseau de l'organisation",
  "admin.enterprise.netd.group": "Politique réseau du groupe",
  "admin.enterprise.netd.groupLabel": "Groupe",
  "admin.enterprise.netd.mode": "Mode",
  "admin.enterprise.netd.allowlist": "Liste autorisée",
  "admin.enterprise.netd.help":
    "Un par ligne. Un domaine couvre ses sous-domaines. *.nom ne couvre que les sous-domaines. Une plage d'IP peut lister des ports. Par défaut, il y a {first} et {more} autres hôtes de paquets et de sources.",
  "admin.enterprise.netd.lock":
    "Verrouiller pour que les groupes ne puissent pas remplacer cette politique",
  "admin.enterprise.netd.remove": "Supprimer la politique",
  "admin.enterprise.days.label": "Jours sans utilisation",
  "admin.enterprise.days.help": "0 le désactive. Vérifié toutes les heures.",
  "admin.plugins.title": "Plugins",
  "admin.plugins.description":
    "Ce que ce déploiement peut atteindre, et quels Bots peuvent l'utiliser. Un plugin que tu ajoutes est pour tout le monde. Choisis sur sa page quels Bots reçoivent ses outils.",
  "admin.plugins.loadError":
    "Impossible de charger les plugins. Recharge la page.",
  "admin.plugins.connected.description":
    "Ajoutés pour tout le monde. Ouvres-en un pour le configurer et choisir quels Bots reçoivent ses outils.",
  "admin.plugins.connected.title": "Connectés",
  "admin.plugins.connected.empty":
    "Rien n'est connecté pour l'instant. Choisis-en un dans la liste ci-dessous.",
  "admin.plugins.explore.description":
    "Des serveurs officiels, vérifiés. Ouvres-en un pour l'ajouter.",
  "admin.plugins.explore.title": "Découvrir les plugins",
  "admin.plugins.explore.empty":
    "Tous les plugins du catalogue sont connectés.",
  "admin.plugins.notAdded": "Non ajouté",
  "admin.plugins.more.title": "Plus d'applis",
  "admin.plugins.sum.notConnected": "Non connecté",
  "admin.plugins.sum.noTools": "Pas encore d'outils",
  "admin.plugins.sum.tools": {
    one: "{count} outil",
    other: "{count} outils",
    many: "{count} d'outils",
  },
  "admin.plugins.sum.toolsNoBots": "{tools} · aucun Bot",
  "admin.plugins.sum.bots": {
    one: "{count} Bot",
    other: "{count} Bots",
    many: "{count} de Bots",
  },
  "admin.plugins.requests": {
    one: "{count} demande",
    other: "{count} demandes",
    many: "{count} de demandes",
  },
  "admin.plugins.key.grant.none": "Aucun Bot",
  "admin.plugins.key.grant.one": "1 Bot",
  "admin.plugins.key.grant.all": "Tous les Bots",
  "admin.plugins.key.grant.some": "{held} Bots sur {total}",
  "admin.plugins.key.held.none": "Aucun outil",
  "admin.plugins.key.held.one": "1 outil",
  "admin.plugins.key.held.all": "Tous les outils",
  "admin.plugins.key.held.some": "{held} outils sur {total}",
  "admin.plugins.key.notApproved": "Non approuvé",
  "admin.plugins.key.unreadableTitle": "Ton compte",
  "admin.plugins.key.unreadable":
    "Impossible de savoir si tu as connecté un compte ici. Recharge la page, ou consulte les journaux de ce déploiement si cela continue.",
  "admin.plugins.key.noConsent":
    "{product} n'a reçu aucun lien de consentement, donc rien n'a été connecté. Réessaie, ou vérifie la configuration de ce connecteur si cela continue.",
  "admin.plugins.key.reassurance":
    "La configuration est terminée sans elle, et elle n'atteint que tes documents.",
  "admin.plugins.key.notPlugin.description":
    "Il n'y a aucun plugin portant ce nom, ni ici ni dans le catalogue.",
  "admin.plugins.key.notPlugin.title": "Pas un plugin",
  "admin.plugins.key.notPlugin.empty": "Rien à configurer.",
  "admin.plugins.key.enable.title": "Activer pour ce déploiement",
  "admin.plugins.key.enable.on":
    "Les Bots peuvent recevoir ses outils. Le désactiver le retire et supprime l'accès de chaque Bot à ses outils.",
  "admin.plugins.key.enable.off":
    "Aucun Bot ne peut atteindre ce fournisseur. Active-le pour le configurer et donner ses outils aux Bots.",
  "admin.plugins.key.enable.aria": "Activer {title} pour ce déploiement",
  "admin.plugins.key.whose.title": "À qui est le compte",
  "admin.plugins.key.whose.shared":
    "Un seul compte partagé pour tout le monde.",
  "admin.plugins.key.whose.personal": "Chaque personne connecte le sien.",
  "admin.plugins.key.whose.makePersonal": "Rendre personnel",
  "admin.plugins.key.whose.makeShared": "Rendre partagé",
  "admin.plugins.key.conn.oauth":
    "Ce fournisseur répond comme la personne qui le sollicite. Le déploiement enregistre un client OAuth, et chaque personne connecte son propre compte. Un Bot ne voit que ce que cette personne peut voir.",
  "admin.plugins.key.conn.secret":
    "Ce fournisseur répond comme la personne qui le sollicite. Chaque personne colle son propre mot de passe d'application sur sa page Comptes et applis. Il n'y a rien à enregistrer ici, et le déploiement ne garde aucun mot de passe à lui.",
  "admin.plugins.key.conn.builtin":
    "Intégré à ce déploiement. Il n'y a pas de fournisseur à joindre ni d'identifiant à conserver. Un appel s'exécute comme la personne qui l'a demandé.",
  "admin.plugins.key.conn.bearer":
    "Ce que ce déploiement envoie au fournisseur. Un seul identifiant pour tout le monde.",
  "admin.plugins.key.conn.title": "Connexion",
  "admin.plugins.key.builtin.desc":
    "Rien à configurer. Ces outils s'exécutent à l'intérieur de ce déploiement, sur ses propres données.",
  "admin.plugins.key.builtin.badge": "Intégré",
  "admin.plugins.key.secret.title": "Mot de passe d'application",
  "admin.plugins.key.secret.desc":
    "Chaque personne crée le sien chez Google et le colle sur sa page Comptes et applis. Il donne accès à toute la boîte mail, donc ce que les Bots peuvent faire est décidé par les outils que tu accordes ci-dessous.",
  "admin.plugins.key.secret.badge": "Par personne",
  "admin.plugins.key.reach.title": "Comment on y accède",
  "admin.plugins.key.token.title": "Jeton d'accès",
  "admin.plugins.key.token.desc": "Envoyé avec chaque appel à ce fournisseur.",
  "admin.plugins.key.saved": "Enregistré",
  "admin.plugins.key.notSet": "Non défini",
  "admin.plugins.key.client.title": "Client OAuth",
  "admin.plugins.key.client.selfDesc":
    "Ce déploiement s'enregistre lui-même auprès du fournisseur à la première connexion. Il n'y a rien à coller.",
  "admin.plugins.key.client.selfBadge": "Auto-enregistré",
  "admin.plugins.key.client.desc":
    "Identifie ce déploiement auprès du fournisseur. À lui seul, il ne peut accéder aux documents de personne.",
  "admin.plugins.key.client.registered": "Enregistré",
  "admin.plugins.key.client.notRegistered": "Non enregistré",
  "admin.plugins.key.team.connected":
    "Connecté{who}. Chaque Bot qui a ces outils agit avec ce compte.",
  "admin.plugins.key.team.as": " en tant que {name}",
  "admin.plugins.key.team.by": " par {name}",
  "admin.plugins.key.team.disconnected":
    "Aucun compte d'équipe n'est connecté. Les Bots qui ont ces outils sont refusés.",
  "admin.plugins.key.team.heading": "Compte d'équipe",
  "admin.plugins.key.team.notice":
    "Connecte-toi avec le compte d'équipe, pas avec le tien.",
  "admin.plugins.key.mine.connected":
    "Connecté. Un Bot qui a ces outils utilise ton {title} comme toi. {note}",
  "admin.plugins.key.mine.tryConnect":
    "Connecte ton propre compte pour essayer ce connecteur. {note}",
  "admin.plugins.key.oauthAcct.connected":
    "Connecté. Un Bot qui a ces outils utilise ton {title} comme toi. Tous les autres connectent le leur.",
  "admin.plugins.key.oauthAcct.connect":
    "Connecte ton propre compte pour essayer ce connecteur. La configuration est terminée sans lui, et il n'atteint que tes documents.",
  "admin.plugins.key.connected": "Connecté",
  "admin.plugins.key.connect": "Connecter",
  "admin.plugins.key.instance.title": "Hôte de l'instance",
  "admin.plugins.key.instance.desc":
    "Ce fournisseur donne à chaque client son propre nom d'hôte. Il est vérifié avec le modèle du fournisseur avant d'être enregistré.",
  "admin.plugins.key.docs.builtin": "Documentation",
  "admin.plugins.key.docs.vendor": "Documentation du fournisseur",
  "admin.plugins.key.docs.builtinDesc":
    "Ce que proposent ces outils, par les personnes qui les maintiennent.",
  "admin.plugins.key.docs.vendorDesc":
    "Ce que propose ce serveur, par les personnes qui le maintiennent.",
  "admin.plugins.key.redirect.dynamic":
    "Le déploiement enregistre lui-même son URI de redirection. Il n'y a rien à ajouter chez le fournisseur.",
  "admin.plugins.key.redirect.manual":
    "Ajoute ceci aux URI de redirection autorisées du client chez le fournisseur, exactement comme écrit. Un seul caractère faux échoue là-bas, avec une erreur qui ne mentionne pas {product}.",
  "admin.plugins.key.redirect.noUrl":
    "Ce déploiement n'a pas d'URL publique, donc personne ne peut finir de se connecter. Définis {env}.",
  "admin.plugins.key.tools.refresh": "Actualiser les outils",
  "admin.plugins.key.tools.grant": "Accorder des outils…",
  "admin.plugins.key.tools.description":
    "Un Bot ne voit que les outils qu'on lui a donnés. Chaque appel est vérifié au moment où il a lieu, donc retirer un accès s'applique dès l'appel suivant.",
  "admin.plugins.key.tools.title": "Outils",
  "admin.plugins.key.tools.empty":
    "Aucun outil listé. Actualise les outils pour vérifier à nouveau.",
  "admin.plugins.key.tools.writes": "modifie des choses",
  "admin.plugins.key.tools.reads": "lit",
  "admin.plugins.key.byBot": "Par Bot",
  "admin.plugins.key.byBot.hidden":
    "Masquée dans ta liste. Active ou désactive les actions de cette appli une par une.",
  "admin.plugins.key.byBot.shown":
    "Active ou désactive les actions de cette appli une par une.",
  "admin.plugins.key.gone.description":
    "Ce fournisseur ne les liste plus. Aucun Bot ne les voit, et aucun ne peut les appeler. L'accès est toujours enregistré et revient si le fournisseur liste de nouveau l'outil. Pour le retirer, utilise la page du Bot lui-même.",
  "admin.plugins.key.gone.title": "Accordés mais plus listés",
  "admin.plugins.key.gone.row": "Non listé par {title}{asOf}.",
  "admin.plugins.key.gone.asOf": " à la dernière actualisation",
  "admin.plugins.key.dlg.client": "Client OAuth pour {title}",
  "admin.plugins.key.dlg.instance": "Hôte de l'instance pour {title}",
  "admin.plugins.key.dlg.token": "Jeton d'accès pour {title}",
  "admin.plugins.key.dlg.clientDesc":
    "Depuis la console du fournisseur. Le secret est enregistré dans le coffre de ce déploiement et n'est plus jamais affiché.",
  "admin.plugins.key.dlg.instanceDesc":
    "Ton propre nom d'hôte chez ce fournisseur. Il est vérifié avec le modèle du fournisseur avant d'être enregistré.",
  "admin.plugins.key.dlg.tokenDesc":
    "Enregistré dans le coffre de ce déploiement et n'est plus jamais affiché.",
  "admin.plugins.key.dlg.clientId": "ID client",
  "admin.plugins.key.dlg.clientSecret": "Secret client",
  "admin.plugins.key.gr.title": "Accorder des outils",
  "admin.plugins.key.gr.description":
    "Chaque octroi a sa propre ligne dans l'Audit. Les outils qui modifient des choses restent vérifiés par rapport aux limites à chaque appel.",
  "admin.plugins.key.gr.to": "À",
  "admin.plugins.key.gr.reads": "Lit",
  "admin.plugins.key.gr.writes": "Modifie des choses",
  "admin.plugins.key.gr.selectAll": "Tout sélectionner",
  "admin.plugins.key.gr.button": "Accorder",
  "admin.plugins.key.gr.progress": "Octroi de {current} sur {total}…",
  "admin.plugins.key.gr.summary": {
    one: "Accorder {count} outil à {names}.",
    other: "Accorder {count} outils à {names}.",
    many: "Accorder {count} d'outils à {names}.",
  },
  "admin.plugins.key.gr.changing": {
    one: "{count} modifie des choses.",
    other: "{count} modifient des choses.",
    many: "{count} d'entre eux modifient des choses.",
  },
  "admin.home.reach.desc":
    "Ce qu'un Bot peut toucher en dehors de {product}, et les limites qui s'y appliquent.",
  "admin.home.credentials.desc": "Clés et jetons de ce déploiement.",
  "admin.home.boundaries.desc": "Ce qu'aucun Bot ne doit jamais faire.",
  "admin.home.approvals.desc":
    "Ce que les Bots des membres doivent demander avant d'agir.",
  "admin.home.computers.desc":
    "Les machines sur lesquelles les Bots exécutent des outils.",
  "admin.home.do.desc":
    "Applis, compétences et éléments d'interface que tout Bot peut utiliser.",
  "admin.home.plugins.desc":
    "Les services que {product} peut atteindre, et quels Bots peuvent les utiliser.",
  "admin.home.skills.desc":
    "Des instructions nommées que n'importe qui peut lancer avec /.",
  "admin.home.learning.desc":
    "Apprendre des conversations terminées et examiner les compétences qu'il propose.",
  "admin.home.components.desc":
    "Des éléments personnalisés qu'un Bot peut dessiner dans une conversation.",
  "admin.home.playground.desc":
    "Écris un composant et regarde-le s'afficher pendant que tu tapes.",
  "admin.home.engines.desc":
    "Les moteurs d'IA sur lesquels tournent les membres, et si chacun peut répondre maintenant.",
  "admin.home.people.desc":
    "Toutes les personnes qui se sont connectées, qui sont les admins, et à qui l'accès a été retiré.",
  "admin.home.enterprise.desc":
    "Rôles et groupes, SSO obligatoire, SCIM, politique réseau, listes autorisées MCP et de modèles, Action Recording.",
  "admin.home.idp.desc":
    "Le fournisseur SAML ou OpenID Connect de ton entreprise, associé par domaine d'e-mail.",
  "admin.home.audit.desc":
    "Chaque action effectuée dans {product}, et qui l'a effectuée.",
  "admin.home.description":
    "Réglages pour tout le monde dans ce déploiement. Une modification ici touche chaque personne et chaque Bot.",
  "admin.plugins.directoryError":
    "Impossible de charger les réglages des plugins. Recharge la page.",
  "admin.components.description":
    "Ce que chaque Bot peut utiliser pour répondre. Chaque composant publié est activé pour tous les Bots. Désactive-en un et ce Bot ne le voit jamais. Les modifications et les refus apparaissent dans l'Audit.",
  "admin.components.loadError":
    "Impossible de charger les composants. Recharge la page.",
  "admin.components.emptyTitle": "Pas encore de composants",
  "admin.components.emptyDesc":
    "Les composants que tes Bots peuvent utiliser apparaîtront ici.",
  "admin.audit.silence.quiet": "Silencieux pendant {seconds} s",
  "admin.audit.silence.nothing": "{quiet}, sans rien avoir dit du tout",
  "admin.audit.silence.after": {
    one: "{quiet}, après {count} fragment",
    other: "{quiet}, après {count} fragments",
    many: "{quiet}, après {count} de fragments",
  },
  "admin.compDetail.title": "Composants",
  "admin.compDetail.noSuch.title": "Ce composant n'existe pas",
  "admin.compDetail.noSuch.description": "Aucun composant ne porte ce nom.",
  "admin.compDetail.noSuch.hint":
    "Il a peut-être été renommé, ou ce déploiement ne le fournit plus.",
  "admin.compDetail.back": "Retour aux composants",
  "admin.compDetail.grant.noBots": "Aucun Bot pour l'instant",
  "admin.compDetail.grant.all": {
    one: "Les {count} Bots",
    many: "Les {count} de Bots",
    other: "Les {count} Bots",
  },
  "admin.compDetail.grant.none": "Aucun Bot",
  "admin.compDetail.grant.some": "{granted} Bots sur {total}",
  "admin.compDetail.fn.none": "Ce déploiement n'a aucune fonction de données",
  "admin.compDetail.fn.nothing":
    "Rien. Il n'affiche que ce que le Bot lui transmet.",
  "admin.compDetail.notPublished": "Non publié. Aucun Bot ne peut le voir.",
  "admin.compDetail.config.title": "Configuration",
  "admin.compDetail.config.description":
    "À quoi sert ce composant, et quels Bots peuvent répondre avec.",
  "admin.compDetail.notInBuild.title": "Absent de cette version",
  "admin.compDetail.notInBuild.description":
    "{product} ne peut pas l'afficher. Les réglages ci-dessous n'ont aucun effet.",
  "admin.compDetail.published": "Publié",
  "admin.compDetail.published.on": "Les Bots peuvent répondre avec.",
  "admin.compDetail.published.off": "Aucun Bot ne peut l'utiliser.",
  "admin.compDetail.published.changes":
    "La description a des modifications non publiées.",
  "admin.compDetail.description": "Description",
  "admin.compDetail.nothingYet": "Rien pour l'instant",
  "admin.compDetail.availableTo": "Disponible pour",
  "admin.compDetail.canRead": "Peut lire",
  "admin.compDetail.details": "Détails",
  "admin.compDetail.kind": "Type",
  "admin.compDetail.calledAs": "Appelé",
  "admin.compDetail.lastChanged": "Dernière modification",
  "admin.compDetail.by": "par {name}",
  "admin.compDetail.descDlg.description":
    "Ce que le modèle lit quand il décide de l'utiliser. Cela n'a aucun effet tant que le composant n'est pas publié.",
  "admin.compDetail.grantsDlg.description":
    "Désactive un Bot et il ne saura jamais que ce composant existe. Les changements s'appliquent tout de suite.",
  "admin.compDetail.grantsDlg.empty": "Aucun Bot pour l'instant.",
  "admin.compDetail.fnDlg.description":
    "Les données que ce composant peut aller chercher pour s'afficher. C'est distinct de « Disponible pour ». Si tout est désactivé, il n'affiche que ce que le Bot lui transmet. Chaque lecture apparaît dans l'Audit. Les changements s'appliquent tout de suite.",
  "admin.compDetail.fnDlg.empty":
    "Ce déploiement n'a aucune fonction de données.",
  "admin.computers.description":
    "Le navigateur de chaque Bot et le profil qu'il garde. Le profil garde un Bot connecté. Le réinitialiser déconnecte le Bot de tout.",
  "admin.computers.loadError":
    "Impossible de charger les ordinateurs. Recharge la page.",
  "admin.computers.shared.lead": "Tous les Bots partagent un seul ordinateur.",
  "admin.computers.shared.before":
    "Ils en partagent les connexions, les fichiers et la session. Un Bot peut atteindre ce à quoi un autre s'est connecté. Règle",
  "admin.computers.shared.after": "pour donner à chaque Bot le sien.",
  "admin.computers.perBot":
    "Chaque Bot a son propre ordinateur, avec son propre conteneur, ses propres fichiers et son propre profil de navigateur.",
  "admin.computers.list.title": "Ordinateurs de ce déploiement",
  "admin.computers.list.error": "Impossible de charger la liste.",
  "admin.computers.list.empty":
    "Aucun ordinateur pour l'instant. Il en apparaît un la première fois qu'un Bot ouvre une page.",
  "admin.computers.running": "Navigateur en marche depuis {time}",
  "admin.computers.notRunning":
    "Aucun navigateur en marche. Il démarre quand le Bot en a de nouveau besoin.",
  "admin.computers.egress.unknown": "Sortie non indiquée",
  "admin.computers.egress.direct": "Sort directement",
  "admin.computers.egress.via": "Sort par {egress}",
  "admin.computers.updateAvailable": "Mise à jour disponible",
  "admin.computers.update": "Mettre à jour l'ordinateur",
  "admin.computers.working": "En cours…",
  "admin.computers.stop": "Arrêter le navigateur",
  "admin.computers.reset": "Réinitialiser",
  "admin.computers.resetTitle": "Réinitialiser l'ordinateur de {name} ?",
  "admin.computers.resetDesc":
    "Son profil est supprimé. Le Bot est déconnecté de tous les services et repart de zéro. Tu ne peux pas annuler.",
  "admin.computers.resetting": "Réinitialisation…",
  "admin.computers.resetIt": "Réinitialiser",
  "admin.computers.updateTitle": "Mettre à jour l'ordinateur de {name} ?",
  "admin.computers.updateDesc":
    "Il passe à l'image d'ordinateur que ce déploiement utilise maintenant. Ses fichiers et ses connexions sont conservés. S'il tourne, il redémarre et interrompt ce qu'il fait.",
  "admin.computers.updating": "Mise à jour…",
  "admin.computers.updateIt": "Mettre à jour",
  "admin.computers.foot.stopLead": "Arrêter",
  "admin.computers.foot.stopRest":
    "ferme le navigateur et garde ses connexions. Il redémarre la prochaine fois que le Bot en a besoin.",
  "admin.computers.foot.resetLead": "Réinitialiser",
  "admin.computers.foot.resetRest":
    "supprime le profil et déconnecte le Bot de tout.",
  "admin.computers.foot.updateLead": "Mettre à jour l'ordinateur",
  "admin.computers.foot.updateRest":
    "apparaît quand un ordinateur tourne sur une image plus ancienne. Il passe l'ordinateur à la nouvelle et garde ses fichiers et ses connexions.",
  "admin.computers.foot.audit": "Les trois apparaissent dans",
  "admin.computers.host.description":
    "Choisis les dossiers qu'un Bot peut lire sur cet ordinateur. L'appli de bureau demande avant chaque modification ou commande. L'accès prend fin quand tu arrêtes {product}.",
  "admin.computers.host.title": "Dossiers de cet ordinateur",
  "admin.computers.host.offline":
    "L'appli de bureau est hors ligne. Ouvre-la pour approuver des dossiers ou lancer des commandes.",
  "admin.computers.host.noBots":
    "Aucun Bot pour l'instant. Crées-en un, puis choisis ses dossiers.",
  "admin.computers.host.choose": "Choisir un dossier",
  "admin.computers.host.waiting": "En attente…",
  "admin.computers.host.readOnlyNote":
    "Les dossiers sont en lecture seule. Quand un Bot doit écrire, l'appli de bureau te demande d'abord.",
  "admin.computers.host.stopAccess": "Arrêter l'accès aux dossiers",
  "admin.computers.host.stopping": "Arrêt…",
  "admin.computers.host.viewAudit": "Voir l'audit",
  "admin.computers.host.readOnly": "Lecture seule",
  "admin.computers.host.revoke": "Révoquer",
  "admin.computers.host.revoking": "Révocation…",
  "admin.computers.host.pendingFrom": "{label} de {owner}.",
  "admin.computers.host.pendingFromFor": "{label} de {owner} pour {name}.",
  "admin.computers.host.folders": {
    one: "{count} dossier en lecture seule",
    many: "{count} de dossiers en lecture seule",
    other: "{count} dossiers en lecture seule",
  },
  "admin.computers.host.requests": {
    one: "{count} demande en attente",
    many: "{count} de demandes en attente",
    other: "{count} demandes en attente",
  },
  "admin.computers.host.none": "Aucun dossier approuvé.",
  "admin.computers.host.owner": "le propriétaire du bureau",
  "admin.computers.host.p.write":
    "Modification de fichier en attente d'approbation ou de fin",
  "admin.computers.host.p.run": "Commande en attente d'approbation ou de fin",
  "admin.computers.host.p.list": "Liste des fichiers",
  "admin.computers.host.p.read": "Lecture d'un fichier",
  "admin.computers.host.p.stop": "Arrêt du travail sur les dossiers",
  "admin.computers.host.p.default":
    "L'accès aux dossiers attend une approbation",
  "admin.learning.description":
    "Apprendre des conversations terminées, passer en revue les compétences proposées par Intelligence et donner les compétences publiées aux Bots.",
  "admin.learning.auto.assigned":
    "{product} a attribué automatiquement le conteneur « {container} » à ce projet Intelligence. Tu peux le changer ici.",
  "admin.learning.auto.absent":
    "Ce projet Intelligence n'a pas encore de conteneur Learning « {container} ». Rien n'est collecté.",
  "admin.learning.auto.notEntitled":
    "L'offre de ce projet Intelligence n'inclut pas Learning. Aucun conteneur n'a été attribué.",
  "admin.learning.auto.unavailable":
    "Impossible de joindre Intelligence pour trouver le conteneur Learning de ce projet. {product} va réessayer.",
  "admin.learning.target.container": "ID du conteneur : {label}",
  "admin.learning.target.revision": "Révision exacte (facultatif)",
  "admin.learning.target.revisionAria": "Révision : {label}",
  "admin.learning.target.latest": "Dernière publiée",
  "admin.learning.create.busy": "Création…",
  "admin.learning.create.button": "Créer le conteneur {container}",
  "admin.learning.create.note":
    "Utilise l'identifiant de ce déploiement, pas la clé d'exécution.",
  "admin.learning.create.how": "Pour le créer : ",
  "admin.learning.part.title": "Participation",
  "admin.learning.part.description":
    "Les changements de conteneur valent pour les nouvelles conversations. Les conversations existantes gardent leur premier conteneur. Les conteneurs doivent déjà exister dans le même projet Intelligence. Tant que tu n'enregistres pas ici, {product} utilise le conteneur openbot de ce projet.",
  "admin.learning.part.loading": "Chargement des réglages Learning…",
  "admin.learning.part.turnOn":
    "Activer l'apprentissage automatique et la livraison des compétences",
  "admin.learning.part.default": "Par défaut",
  "admin.learning.part.hint":
    "Sans valeur par défaut, les Bots sans conteneur propre sont laissés de côté. Les ID font de 1 à 64 lettres minuscules, chiffres et tirets simples. Laisse la révision vide pour utiliser les dernières compétences publiées.",
  "admin.learning.part.perBot": "Participation par Bot",
  "admin.learning.part.botListError":
    "Impossible de charger la liste des Bots. Les réglages enregistrés pour chaque Bot sont ci-dessous.",
  "admin.learning.part.botAria": "Participation de {name}",
  "admin.learning.part.inherit": "Utiliser la valeur par défaut du déploiement",
  "admin.learning.part.exclude": "Exclure de Learning",
  "admin.learning.part.container": "Utiliser un conteneur précis",
  "admin.learning.part.saving": "Enregistrement…",
  "admin.learning.part.save": "Enregistrer les réglages Learning",
  "admin.learning.part.saved": "Réglages enregistrés.",
  "admin.learning.rev.title": "Relire et publier",
  "admin.learning.rev.description":
    "Intelligence étudie les conversations terminées et propose des compétences. Relis-les et publie-les dans Intelligence. Les Bots n'utilisent que les compétences publiées.",
  "admin.learning.rev.showFor": "Afficher le conteneur de",
  "admin.learning.rev.default": "Valeur par défaut du déploiement",
  "admin.learning.rev.checking": "Vérification d'Intelligence…",
  "admin.learning.rev.invalid":
    "Le conteneur choisi ou son instrumentation n'est pas disponible.",
  "admin.learning.rev.selection":
    "Choisis un Bot, ou définis un conteneur par défaut.",
  "admin.learning.rev.none": "Aucun conteneur Learning n'est attribué.",
  "admin.learning.rev.threads": "Fils prêts",
  "admin.learning.rev.candidates": "Candidats à relire",
  "admin.learning.rev.published": "Compétences publiées",
  "admin.learning.rev.insights": "Enseignements",
  "admin.learning.rev.running": "Une analyse est en cours.",
  "admin.learning.rev.latest": "Dernière analyse : {status}.",
  "admin.learning.rev.noRun": "Aucune analyse n'a encore été lancée.",
  "admin.learning.rev.manage": "Gérer Learning dans Intelligence",
  "admin.learning.rev.reviewCandidates": "Relire les compétences candidates",
  "admin.learning.rev.viewRuns": "Voir les analyses lancées",
  "admin.learning.del.title": "Livraison des compétences",
  "admin.learning.del.checking": "Vérification de la livraison…",
  "admin.learning.del.off": "La livraison est désactivée pour ce Bot.",
  "admin.learning.del.waiting":
    "En attente du premier instantané de compétences vérifié.",
  "admin.learning.del.stale":
    "Utilisation du dernier instantané vérifié. Une actualisation est en attente.",
  "admin.learning.del.ok": "Un instantané vérifié est disponible.",
  "admin.learning.del.revision": "Révision chargée : {revision}",
  "admin.learning.del.lastChecked": "Dernière vérification :",
  "admin.learning.rev.refresh": "Actualiser l'état",
  "admin.learning.rev.footer":
    "Gérer Learning demande ton compte Intelligence et l'accès au projet. {product} garde les identifiants du projet sur le serveur. Désactiver Learning ici conserve les réglages et les attributions de conversations. Les planifications et la publication restent dans Intelligence.",
  "admin.playground.validJson": "{label} doit être du JSON valide : {reason}",
  "admin.playground.invalidJson": "JSON non valide",
  "admin.playground.notObject": "{label} doit être un objet JSON, pas {kind}.",
  "admin.playground.schemaLabel": "Arguments (JSON Schema)",
  "admin.playground.sampleLabel": "Exemple d'arguments",
  "admin.playground.fixBeforeSave":
    "Corrige les champs JSON avant d'enregistrer.",
  "admin.playground.draftSaved": "Brouillon enregistré.",
  "admin.playground.published": "Publié.",
  "admin.playground.description":
    "Écris un composant et publie-le sans redéployer. Tes modifications forment un brouillon. Les conversations n'affichent que ce qui est publié.",
  "admin.playground.saveDraft": "Enregistrer le brouillon",
  "admin.playground.publish": "Publier",
  "admin.playground.title": "Titre",
  "admin.playground.titlePlaceholder": "Carte de remboursement",
  "admin.playground.told": "Ce qu'on dit au modèle à son sujet",
  "admin.playground.toldPlaceholder":
    "Affiche un remboursement avec son montant, son motif et son état.",
  "admin.playground.preview": "Aperçu",
  "admin.playground.noSample": "L'exemple d'arguments n'est pas disponible.",
  "admin.playground.fixBeforePreview":
    "Corrige les champs JSON avant l'aperçu.",
  "admin.playground.saved.title": "Enregistré ici",
  "admin.playground.saved.empty":
    "Rien d'enregistré pour l'instant. Enregistre un brouillon pour le voir ici.",
  "admin.playground.saved.published": "publié, révision {revision}",
  "admin.playground.saved.draftOnly":
    "brouillon seulement, aucun Bot ne peut l'afficher",
  "admin.playground.saved.edited": "modifié depuis la publication",
  "admin.playground.open": "Ouvrir",
  "admin.playground.delete": "Supprimer",
  "admin.playground.saved.note":
    "Publier le rend disponible à tous les Bots. Pour un seul Bot, désactive-le sur la page Composants d'interface.",
  "admin.playground.del.title": "Supprimer {name} ?",
  "admin.playground.del.description":
    "Il est retiré de ce déploiement, et aucun Bot ne peut l'afficher. Tu ne peux pas annuler.",
  "admin.playground.del.confirm": "Supprimer",
  "admin.plugins.tool.title": "Outil",
  "admin.plugins.tool.noTool": "Ce connecteur n'a aucun outil de ce nom.",
  "admin.plugins.tool.removed":
    "Il a peut-être été retiré depuis la dernière actualisation de la liste des outils.",
  "admin.plugins.tool.notOn": "Ce connecteur n'est pas activé.",
  "admin.plugins.tool.noDesc": "Cet outil n'a pas de description.",
  "admin.plugins.tool.writeDesc":
    "Cet outil modifie quelque chose chez le fournisseur. Les limites sur les écritures s'y appliquent.",
  "admin.plugins.tool.readDesc":
    "Cet outil ne fait que lire. Les limites sur les écritures ne s'y appliquent pas.",
  "admin.plugins.tool.what": "Ce qu'il fait",
  "admin.plugins.tool.effect": "Effet",
  "admin.plugins.tool.effectDesc":
    "Défini par le connecteur, pas par le nom de l'outil. Tout ce qui est inconnu compte comme une écriture.",
  "admin.plugins.tool.bots.title": "Bots",
  "admin.plugins.tool.bots.description":
    "Un Bot ne peut appeler cet outil que tant que son interrupteur est activé. Le désactiver s'applique dès l'appel suivant.",
  "admin.plugins.tool.bots.empty":
    "Aucun Bot pour l'instant. Crées-en un pour lui donner cet outil.",
  "admin.plugins.tool.hidden": "Masqué de ta liste.",
  "admin.plugins.tool.canCall":
    "Peut appeler cet outil. Chaque appel est toujours vérifié selon les limites et journalisé dans l'Audit.",
  "admin.plugins.tool.noToken":
    "Autorisé, mais ce Bot n'a pas de jeton de rappel. Chaque appel est refusé. Génères-en un sur sa page, ou définis AGENT_TOOL_TOKEN.",
  "admin.plugins.tool.cantCall":
    "Ne peut pas appeler cet outil. Le Bot ne le voit jamais.",
  "admin.plugins.tool.aria": "Laisser {bot} appeler {tool}",
  "admin.plugins.bot.title": "Bot",
  "admin.plugins.bot.notOn": "Aucune appli de ce nom n'est activée.",
  "admin.plugins.bot.nothing": "Rien à donner à un Bot ici.",
  "admin.plugins.bot.notBot.title": "Pas un Bot",
  "admin.plugins.bot.notBot.description": "Aucun Bot ne porte ce nom.",
  "admin.plugins.bot.notBot.hint":
    "Il a peut-être été supprimé après l'ouverture de cette page.",
  "admin.plugins.bot.noDesc": "Cette action n'a pas de description.",
  "admin.plugins.bot.destroys": "détruit des choses",
  "admin.plugins.bot.description":
    "Les actions de {app} que {bot} peut appeler. En désactiver une s'applique dès l'appel suivant.",
  "admin.plugins.bot.pageTitle": "{bot} et {app}",
  "admin.plugins.bot.noActions":
    "{app} ne liste aucune action. Actualise ses outils pour vérifier de nouveau.",
  "admin.plugins.bot.searchAria": "Rechercher dans les actions de {app}",
  "admin.plugins.bot.searchPlaceholder": "Rechercher par nom d'action",
  "admin.plugins.bot.wouldHold": {
    one: "Ce Bot aurait alors {count} outil de cette appli.",
    many: "Ce Bot aurait alors {count} d'outils de cette appli.",
    other: "Ce Bot aurait alors {count} outils de cette appli.",
  },
  "admin.plugins.bot.turnOnReads":
    "Activer toutes les actions en lecture seule",
  "admin.plugins.bot.reads.title": "Lectures",
  "admin.plugins.bot.reads.description":
    "Celles-ci ne font que lire. Les limites sur les écritures ne s'y appliquent pas.",
  "admin.plugins.bot.reads.noMatch":
    "Aucune action de lecture seule ne correspond à « {query} ».",
  "admin.plugins.bot.reads.none": "{app} n'a aucune action en lecture seule.",
  "admin.plugins.bot.writes.title": "Modifie des choses",
  "admin.plugins.bot.writes.description":
    "Celles-ci modifient quelque chose chez le fournisseur. Les limites sur les écritures s'y appliquent.",
  "admin.plugins.bot.writes.noMatch":
    "Aucune action qui modifie des choses ne correspond à « {query} ».",
  "admin.plugins.bot.writes.none":
    "{app} n'a aucune action qui modifie des choses.",
  "admin.plugins.bot.shared.title":
    "Laisser {bot} utiliser le compte {app} partagé ?",
  "admin.plugins.bot.allowing": "Autorisation…",
  "admin.plugins.bot.allow": "Autoriser",
  "admin.shared.sentence.write":
    "Toute personne qui peut utiliser ce Bot peut le faire avec le compte partagé.",
  "admin.shared.sentence.read":
    "Toute personne qui peut utiliser ce Bot peut lire ce que ce compte peut lire.",
  "admin.shared.owner": "Seulement son propriétaire",
  "admin.shared.named": "Nommément : {who}",
  "admin.shared.team": "Tout le monde",
  "admin.shared.legend": "Qui peut utiliser le compte partagé via ce Bot",
  "admin.shared.outside":
    "Les messages venus de l'extérieur (e-mail, Slack, webhooks) peuvent l'utiliser",
  "admin.shared.skipped": {
    one: "Une action listée par cette appli a été écartée, car un nom d'outil ne peut contenir que des lettres, des chiffres, des tirets bas et des tirets : ",
    many: "{count} d'actions listées par cette appli ont été écartées, car un nom d'outil ne peut contenir que des lettres, des chiffres, des tirets bas et des tirets : ",
    other:
      "{count} actions listées par cette appli ont été écartées, car un nom d'outil ne peut contenir que des lettres, des chiffres, des tirets bas et des tirets : ",
  },
  "admin.vocab.browse": "Parcourir {name}",
  "admin.vocab.dirDesc.composio":
    "Quelques centaines d'applis. Chaque personne connecte son propre compte.",
  "admin.vocab.dirDesc.arcade":
    "Des applis que personne ici n'a examinées. Chaque personne connecte son propre compte.",
  "admin.vocab.readFailure":
    "Impossible de charger l'annuaire d'applis de {name}. Recharge la page.",
  "admin.vocab.moreApps":
    "Des applis de {name}. Personne ici ne les a examinées.",
  "admin.vocab.notSetUp":
    "Non configuré. Définis {envVar} sur ce déploiement pour parcourir ses applis.",
  "admin.vocab.connection":
    "Atteint via {name}, qui garde le compte propre de chaque personne.",
  "admin.vocab.reach.description":
    "{name} garde le compte. Ce déploiement envoie une clé et qui demande. Chaque personne connecte le sien, et un Bot ne voit que ce que cette personne peut voir. Il n'y a aucun jeton à coller.",
  "admin.vocab.reach.badge": "Via {name}",
  "admin.vocab.disconnect": "Déconnecter met aussi fin au compte chez {name}.",
  "admin.vocab.trip.stem":
    "{name} approuve une action à la fois, donc il n'y a rien à connecter pour toute l'appli.",
  "admin.vocab.trip.below": "Autorise ci-dessous les actions que tu veux.",
  "admin.vocab.trip.settings": "Autorise-les depuis Comptes et applis.",
  "admin.vocab.keyMissing":
    "Définis {envVar} sur ce déploiement. D'ici là, ce compte ne peut être ni connecté ni déconnecté ici. L'appli reste activée, et ses autorisations d'outils restent valables.",
  "admin.vocab.siblings": {
    one: "Déconnecter met aussi fin à ton accès à {names}, qui partage cette connexion.",
    many: "Déconnecter met aussi fin à ton accès à {names}, qui partagent cette connexion.",
    other:
      "Déconnecter met aussi fin à ton accès à {names}, qui partagent cette connexion.",
  },
  "admin.vocab.unansweredMore": {
    one: "{count} autre appli n'a pas pu être vérifiée et peut aussi être touchée.",
    many: "{count} d'autres applis n'ont pas pu être vérifiées et peuvent aussi être touchées.",
    other:
      "{count} autres applis n'ont pas pu être vérifiées et peuvent aussi être touchées.",
  },
  "admin.vocab.unansweredOnly": {
    one: "{count} appli de cette connexion n'a pas pu être vérifiée, donc déconnecter peut aussi y mettre fin.",
    many: "{count} d'applis de cette connexion n'ont pas pu être vérifiées, donc déconnecter peut aussi y mettre fin.",
    other:
      "{count} applis de cette connexion n'ont pas pu être vérifiées, donc déconnecter peut aussi y mettre fin.",
  },
  "admin.vocab.join2": "{a} et {b}",
  "admin.vocab.joinMany": "{list} et {last}",
  "admin.skills.write": "Écrire une compétence",
  "admin.skills.description":
    "Des instructions nommées que tout le monde peut lancer avec /. Une compétence n'ajoute aucun accès. Elle peut seulement demander à un Bot d'utiliser ce qu'il a déjà.",
  "admin.skills.installed.title": "Installées",
  "admin.skills.installed.description":
    "Pour tout le monde dans ce déploiement. Chacun écrit les siennes sur sa page Compétences.",
  "admin.skills.loadError":
    "Impossible de charger les compétences. Recharge la page.",
  "admin.skills.empty":
    "Aucune compétence pour l'instant. Écris-en une avec Écrire une compétence.",
  "admin.skills.dlg.title": "Écrire une compétence pour tout le monde",
  "admin.skills.dlg.description":
    "Les gens tapent le slug après /. Le Bot suit alors les instructions. Tout le monde peut l'utiliser, et tu choisis quels Bots l'ont.",
  "admin.skills.slug": "Slug",
  "admin.skills.title": "Titre",
  "admin.skills.summary": "Résumé",
  "admin.skills.summaryPlaceholder": "Une ligne",
  "admin.skills.instructions": "Instructions",
  "admin.skills.instructionsPlaceholder":
    "Ce que le Bot doit faire quand cette compétence est utilisée.",
  "admin.skills.install": "Installer la compétence",
  "engines.intro":
    "Le moteur est ce qui réfléchit pour chaque membre. Tes propres connexions répondent en premier, sauf si tu choisis un autre ordre ; tout ce qui est payant reste désactivé tant que tu ne le demandes pas.",
  "engines.loadFailed": "Impossible de charger les moteurs. Recharge la page.",
  "engines.fallback": "Impossible de lister les moteurs.",
  "engines.noEngines": "Aucun moteur n'a encore été signalé.",
  "engines.statesTitle": "Les moteurs et leur état",
  "engines.sectionsLabel": "Sections des moteurs",
  "engines.tab.overview": "Vue d'ensemble",
  "engines.tab.providers": "Fournisseurs",
  "engines.tab.members": "Attributions des Bots",
  "engines.tab.usage": "Utilisation",
  "engines.asideLabel": "Clés et dépenses",
  "engines.keys.title": "Clés",
  "engines.keys.text":
    "Seules les clés des passerelles seront conservées ici. FreeDuet ne stocke jamais tes connexions à Claude et à ChatGPT.",
  "engines.keys.notBuilt":
    "Une clé s'ajoute sur la carte de son moteur. Elle est conservée sur cette installation et n'est plus jamais affichée.",
  "engines.spending.title": "Dépenses",
  "engines.spending.text":
    "Les dépenses ne sont pas encore affichées sur cette page. Un moteur payant ne tourne que si cette installation l'autorise.",
  "engines.today": "Aujourd'hui",
  "engines.reason.off":
    "Les moteurs sont désactivés sur cette installation (FREEDUET_ROUTER=off), il n'y a donc rien à afficher.",
  "engines.reason.not_set_up":
    "Aucun agent FreeDuet n'est configuré sur cette installation, il n'y a donc aucun moteur à afficher.",
  "engines.reason.unreachable":
    "L'agent FreeDuet n'a pas répondu, les moteurs ne peuvent donc pas être lus pour le moment. Cette page redemande toutes les 30 secondes.",
  "engines.state.ready": "Prêt",
  "engines.state.degraded": "Prêt, mais il a eu des erreurs récentes",
  "engines.state.limitedAt": "A atteint sa limite jusqu'à {at}",
  "engines.state.limited": "A atteint sa limite pour le moment",
  "engines.state.outOfCreditAt": "Crédit épuisé, nouvel essai : {at}",
  "engines.state.outOfCredit": "Crédit épuisé",
  "engines.state.notAnsweringAt": "Ne répond pas, nouvel essai : {at}",
  "engines.state.notAnswering": "Ne répond pas pour le moment",
  "engines.state.checking": "Vérification de sa reprise de réponse",
  "engines.state.gatewayKey":
    "Sa passerelle n'a pas accepté la clé. Vérifie la clé que tu lui as donnée.",
  "engines.state.signedOut":
    "Déconnecté : reconnecte-toi avec la connexion propre au moteur",
  "engines.state.refusedWhy": "Non exécuté : {reason}",
  "engines.state.refused": "Non exécuté : le motif n'est pas connu.",
  "engines.state.unknown": "État inconnu",
  "engines.state.toolsAsText":
    "Sa dernière réponse a écrit ses appels d'outils sous forme de texte au lieu de les utiliser : choisis un modèle qui gère les outils",
  "engines.pill.working": "Fonctionne",
  "engines.pill.checking": "Vérification",
  "engines.pill.limited": "Limité",
  "engines.pill.outOfCredit": "Crédit épuisé",
  "engines.pill.notAnswering": "Ne répond pas",
  "engines.pill.signedOut": "Déconnecté",
  "engines.pill.locked": "Verrouillé",
  "engines.pill.unknown": "Inconnu",
  "engines.members.title": "Qui utilise quoi",
  "engines.members.description":
    "Les moteurs que chaque membre essaie, dans l'ordre où il les essaie, et ce qui se passe quand l'un d'eux est épuisé. Un changement s'applique dès le prochain message du membre, et tu peux l'annuler.",
  "engines.members.col.member": "Membre",
  "engines.members.col.order": "Ordre des moteurs",
  "engines.members.col.switching": "Quand un moteur est épuisé",
  "engines.order.note":
    "Utilise les flèches pour déplacer un moteur d'un cran. Tes propres connexions passent en premier sauf si tu choisis autrement : si un déplacement place un moteur gratuit ou payant avant elles, on te demande d'abord de le confirmer.",
  "engines.order.warnTitle.free_before_login":
    "Un moteur gratuit répondrait avant ta propre connexion",
  "engines.order.warnTitle.paid_before_free_or_login":
    "Un moteur payant passerait avant un moteur gratuit ou une connexion",
  "engines.order.warnText.free_before_login":
    "Si c'est un service cloud, les messages de ce membre vont d'abord à ce fournisseur, qui peut les conserver. Ses réponses peuvent aussi être de moindre qualité que celles de ta connexion.",
  "engines.order.warnText.paid_before_free_or_login":
    "Un moteur payant répond avant les moteurs qui le suivent, donc ce à quoi il répond peut coûter de l'argent. S'il est en tête de liste, chaque message peut coûter de l'argent dès le premier. Il ne tourne qu'après que tu as activé les moteurs payants et fixé tes limites.",
  "engines.order.newLabel": "Nouvel ordre :",
  "engines.order.tick": "J'ai compris, utiliser cet ordre",
  "engines.order.confirm": "Confirmer",
  "engines.order.tickLabel": "J'ai compris, utiliser cet ordre pour {name}",
  "engines.order.confirmLabel": "Confirmer le nouvel ordre pour {name}",
  "engines.order.cancelLabel": "Annuler le nouvel ordre pour {name}",
  "engines.order.own": "Ton ordre : les connexions ne passent pas en premier",
  "engines.order.recommended": "Utiliser l'ordre recommandé",
  "engines.order.recommendedLabel": "Utiliser l'ordre recommandé pour {name}",
  "engines.order.moveUp": "Monter {engine} pour {name}",
  "engines.order.moveDown": "Descendre {engine} pour {name}",
  "engines.order.saveFailed": "Impossible d'enregistrer l'ordre.",
  "engines.claude.default": "Par défaut de l'abonnement",
  "engines.claude.effort.low": "Faible",
  "engines.claude.effort.medium": "Moyen",
  "engines.claude.effort.high": "Élevé",
  "engines.claude.effort.xhigh": "Très élevé",
  "engines.claude.effort.max": "Maximum",
  "engines.claude.effortLabel": "Effort",
  "engines.claude.note":
    "Claude Code uniquement. Un modèle que ton abonnement ne peut pas utiliser termine ce tour avec l'erreur propre à Claude Code. Rien n'est désactivé, et « Par défaut de l'abonnement » annule le choix.",
  "engines.claude.modelAria": "Modèle Claude pour {name}",
  "engines.claude.effortAria": "Effort de Claude pour {name}",
  "engines.claude.saved":
    "Choix de Claude enregistré. Il s'applique dès le prochain message.",
  "engines.members.saveFailed": "Impossible d'enregistrer ton choix.",
  "engines.members.undoFailed": "Impossible d'annuler ce changement.",
  "engines.mode.groupLabel": "Quand un moteur est épuisé, pour {name}",
  "engines.mode.controlLabel": "{label} pour {name}",
  "engines.mode.undoLabel": "Annuler le changement pour {name}",
  "engines.mode.automatic.label": "Changer automatiquement",
  "engines.mode.automatic.effect":
    "Quand un moteur est épuisé, le suivant répond et on te dit lequel.",
  "engines.mode.askFirst.label": "Me demander d'abord",
  "engines.mode.askFirst.effect":
    "Quand un moteur est épuisé, on te demande : changer, attendre ou nommer un autre moteur.",
  "engines.leftOut.line": "Non utilisé : {engine}, parce que {why}.",
  "engines.leftOut.locked": "le fichier de l'installation ne l'autorise pas",
  "engines.leftOut.disabled": "il est désactivé",
  "engines.leftOut.paid_gateway":
    "c'est une passerelle payante, que FreeDuet ne fait pas encore tourner",
  "engines.leftOut.metered_off": "les moteurs payants sont désactivés",
  "engines.leftOut.cap_zero": "son plafond de dépenses est à zéro",
  "engines.leftOut.not_set_up": "il n'est pas configuré sur cette installation",
  "engines.leftOut.other": "il ne tournera pas",
  "engines.chain.none":
    "Aucun moteur ne peut répondre pour ce membre pour le moment.",
  "engines.chain.one": "Essaie seulement {engine}.",
  "engines.chain.many": "Essaie {list}.",
  "engines.chain.then": ", puis ",
  "engines.pin":
    "Fixé sur {engine} par le fichier de l'installation : il ne passe jamais à un autre moteur.",
  "engines.alone":
    "Seul {engine} est configuré pour ce membre, il n'y a donc encore rien vers quoi basculer. Ton choix est conservé pour le jour où il y en aura.",
  "engines.source.yours":
    "Ton choix. Le fichier de l'installation dit : {mode}.",
  "engines.source.file": "Du fichier de l'installation.",
  "engines.block.not_at_the_computer":
    "Change ces réglages sur l'ordinateur où tourne FreeDuet.",
  "engines.block.not_paired_with_the_computer":
    "Associe d'abord ce navigateur à l'ordinateur où tourne FreeDuet : lance-y `bash scripts/open.sh` et ouvre le lien ici.",
  "engines.block.agent_too_old": "Mets FreeDuet à jour pour changer cela.",
  "engines.block.choices_unreadable":
    "Tes choix n'ont pas pu être lus, ce sont donc les réglages de l'installation qui sont utilisés. Rien de ce que tu as choisi n'est perdu.",
  "engines.saved":
    "Enregistré. Cela s'applique dès le prochain message du membre.",
  "engines.undone":
    "Annulé. Le réglage précédent s'applique dès le prochain message du membre.",
  "engines.providers.title": "Ajouter un moteur",
  "engines.providers.description":
    "Active un moteur, colle sa clé et appuie sur Enregistrer, puis sur Tester. Un changement s'applique dès le prochain message.",
  "engines.providers.pickerLabel": "Fournisseur",
  "engines.providers.blurb.ollama":
    "Des modèles qui tournent sur ton propre ordinateur.",
  "engines.providers.blurb.llamacpp":
    "Un serveur llama.cpp sur ton propre ordinateur ou ton réseau.",
  "engines.providers.blurb.lmstudio":
    "Le serveur local de LM Studio sur ton propre ordinateur.",
  "engines.providers.blurb.freellmapi":
    "Un routeur que tu fais tourner toi-même et qui regroupe les offres gratuites de nombreux fournisseurs derrière une seule adresse.",
  "engines.providers.blurb.groq":
    "Des modèles ouverts rapides, gratuits avec des limites quotidiennes.",
  "engines.providers.blurb.google":
    "Des modèles Gemini, gratuits avec des limites.",
  "engines.providers.blurb.mistral":
    "Des modèles Mistral dans l'offre gratuite, avec des limites.",
  "engines.providers.blurb.openrouter":
    "Uniquement des modèles qui ne coûtent rien : un id qui se termine par :free, ou openrouter/free.",
  "engines.providers.blurb.cloudflare":
    "Des modèles ouverts sur Cloudflare, gratuits avec un quota quotidien. Mets ton propre compte dans l'adresse.",
  "engines.providers.blurb.cerebras": "Des modèles ouverts très rapides.",
  "engines.providers.blurb.anthropic-api":
    "Claude avec des crédits payés à l'usage.",
  "engines.providers.tag.local": "Local",
  "engines.providers.tag.router": "Avancé : ton propre routeur",
  "engines.providers.tag.free": "Gratuit avec limites",
  "engines.providers.tag.trial": "Essai, carte requise",
  "engines.providers.tag.paid": "Payant",
  "engines.providers.cloudWarning":
    "Les données envoyées à ce service quittent ton ordinateur.",
  "engines.providers.routerWarning":
    "Tes messages vont au routeur, qui les transmet aux fournisseurs gratuits que tu as activés à l'intérieur. Ils quittent ton ordinateur, et ces fournisseurs peuvent les conserver.",
  "engines.providers.routerAdvanced":
    "Option avancée, pas un réglage par défaut recommandé : le projet se décrit lui-même comme réservé à l'expérimentation personnelle. FreeDuet ne l'installe pas et ne le fait pas tourner. Les clés de tes fournisseurs restent à l'intérieur ; FreeDuet ne conserve que le seul jeton d'accès qu'il te donne.",
  "engines.providers.routerAddress":
    "Son port par défaut, 3001, est celui de FreeDuet. Lance-le sur un autre port et écris l'adresse avec /v1 à la fin. Sur cet ordinateur, http convient. En dehors de cet ordinateur, seul ton propre réseau est accepté (une adresse LAN ou un nom .local), en https. Un hôte public est refusé.",
  "engines.providers.address": "Adresse du serveur",
  "engines.providers.loadList": "Charger la liste",
  "engines.providers.saveSettings": "Enregistrer les réglages",
  "engines.providers.test": "Tester",
  "engines.providers.freeModelsNote":
    "Les modèles gratuits changent souvent et peuvent conserver ce que tu envoies.",
  "engines.providers.freeModelsLoading":
    "Chargement des modèles gratuits qui peuvent utiliser des outils.",
  "engines.providers.freeModelsStale":
    "OpenRouter n'a pas pu être joint à l'instant. Voici la dernière liste chargée.",
  "engines.providers.freeModelsFallback":
    "OpenRouter n'a pas pu être joint à l'instant. Seul le routeur gratuit est proposé.",
  "engines.providers.freeRouterLabel":
    "openrouter/free (OpenRouter choisit un modèle gratuit)",
  "engines.providers.keySaved":
    "Clé enregistrée. Elle n'est plus jamais affichée.",
  "engines.providers.keyPlaceholder": "Colle la clé ici",
  "engines.providers.notOnKey":
    "Pas encore activé. Colle la clé et appuie sur Enregistrer.",
  "engines.providers.notOnSettings":
    "Pas encore activé. Choisis un modèle et appuie sur Enregistrer les réglages.",
  "engines.providers.settingsSaved":
    "Enregistré. Cela s'applique dès le prochain message.",
  "engines.providers.keyRemoved": "Clé supprimée. Le moteur est désactivé.",
  "engines.providers.lockedOwnFile":
    "Tu as écrit un fichier de moteurs à toi, ces cartes ne font donc que l'afficher. Modifie-le là-bas.",
  "engines.providers.users.paid":
    "Désactivé tant que les plafonds de dépenses n'existent pas. FreeDuet ne laissera pas un moteur payant tourner avant.",
  "engines.providers.users.trial":
    "Son offre gratuite est un essai qui demande une carte, donc FreeDuet ne la propose pas comme gratuite. Il reste désactivé.",
  "engines.providers.users.members":
    "Pour les membres : oui, après leur connexion à Claude. Pour les assistants légers : oui.",
  "engines.providers.users.notYet":
    "Pour les membres : pas encore. Pour les assistants légers : oui.",
  "engines.providers.check.ok": "Il a répondu. Ça fonctionne.",
  "engines.providers.check.key_rejected":
    "La clé n'a pas été acceptée. Vérifie-la et enregistre-la de nouveau.",
  "engines.providers.check.model_missing":
    "Le serveur ne connaît pas ce modèle. Vérifie le nom du modèle.",
  "engines.providers.check.rate_limited":
    "La limite ou le crédit est épuisé pour le moment. Réessaie plus tard.",
  "engines.providers.check.other":
    "Rien n'a répondu, ou la réponse n'a pas été comprise.",
  "engines.providers.freeNote":
    "« Gratuit » est l'étiquette de FreeDuet, tirée des conditions du fournisseur. Certains fournisseurs (Google, par exemple) te facturent si la facturation est activée pour ton projet.",
  "engines.providers.useFor": "Utiliser pour",
  "engines.providers.useForNone":
    "Aucun membre ne l'utilise encore. Les assistants légers, si. Coche les membres qui peuvent envoyer leur travail à ce service.",
  "engines.providers.warn.inbox": "Envoie ton courrier à ce service.",
  "engines.providers.warn.concierge": "Envoie tes réservations à ce service.",
  "engines.providers.modelsEmpty":
    "La liste est vide. Saisis le nom du modèle.",
  "engines.providers.modelsLoaded": {
    one: "{count} modèle chargé. Choisis-en un dans la case.",
    many: "{count} de modèles chargés. Choisis-en un dans la case.",
    other: "{count} modèles chargés. Choisis-en un dans la case.",
  },
  "engines.providers.switchOn": "Activer {name}",
  "engines.providers.changeFailed": "Impossible de modifier cela.",
  "engines.providers.keySaveFailed": "Impossible d'enregistrer la clé.",
  "engines.providers.listFailed": "Impossible de charger la liste.",
  "engines.providers.keyRemoveFailed": "Impossible de supprimer la clé.",
  "engines.providers.saveFailed": "Impossible d'enregistrer cela.",
  "engines.providers.testFailed": "Impossible d'exécuter le test.",
  "engines.tokens.title": "Jetons",
  "engines.tokens.description":
    "Ce que chaque membre a utilisé sur chaque moteur, tel que le moteur lui-même l'a signalé. Les jours sont comptés en UTC.",
  "engines.tokens.fallback": "Impossible de charger les décomptes de jetons.",
  "engines.tokens.empty": "Aucun tour n'a encore été compté.",
  "engines.tokens.unavailable":
    "Les décomptes de jetons ne sont pas disponibles pour le moment.",
  "engines.tokens.problem":
    "Le fichier qui conserve les décomptes n'a pas pu être lu, certains chiffres peuvent donc manquer.",
  "engines.tokens.notReported": "non signalé",
  "engines.tokens.col.engine": "Moteur",
  "engines.tokens.col.week": "7 derniers jours",
  "engines.tokens.allMembers": "Tous les membres",
  "engines.tokens.note":
    "L'entrée compte chaque jeton donné au modèle, y compris ceux du cache. Chaque ligne compte des tentatives du moteur : un nouvel essai sur le même moteur compte de nouveau. Une tentative dont le moteur n'a rien signalé ajoute son temps et aucun jeton. Le temps est mesuré ici, du début à la fin de chaque tentative.",
  "engines.tokens.savedWeek": "Économisé sur les 7 derniers jours",
  "engines.tokens.savedNote":
    "Économisé désigne les jetons passés par des moteurs gratuits, dans le cloud ou sur ton propre ordinateur. Ton abonnement à Claude Code est au forfait et les moteurs payants coûtent de l'argent, donc ni l'un ni l'autre ne comptent.",
  "engines.tokens.currencyHelp":
    "Clique sur un montant pour passer des euros aux dollars.",
  "engines.tokens.reference":
    "Aux prix catalogue de {model} ({input} en entrée, {output} en sortie par million de jetons, {date}) ; {euro} = {rate} ({rateDate}).",
  "engines.tokens.under": "moins de {amount}",
  "engines.tokens.nothingYet": "rien pour l'instant",
  "engines.tokens.plus": "plus {time}",
  "engines.tokens.toDollars": "{amount}. Afficher les montants en dollars",
  "engines.tokens.toEuros": "{amount}. Afficher les montants en euros",
  "engines.tokens.amount": "{amount} jetons",
  "engines.tokens.timeLocal": "{time} sur ton propre GPU",
  "engines.tokens.timeCloud": "{time} sur un moteur cloud gratuit",
  "engines.tokens.and": " et ",
  "engines.tokens.timeTail": "{parts}, jetons non signalés",
  "engines.tokens.cell": "{input} en entrée · {output} en sortie",
  "engines.tokens.partial": "{reported} tentatives sur {total} signalées",
  "engines.dur.under": "moins de 1 min",
  "engines.dur.min": "{minutes} min",
  "engines.dur.hourMin": "{hours} h {minutes} min",
  "engines.usage.bySource": "Par origine",
  "engines.usage.byMember": "Par membre",
  "engines.usage.time": "Temps",
  "engines.usage.source.person": "Toi",
  "engines.usage.source.routine": "Routines",
  "engines.usage.source.handoff": "Entre membres",
  "engines.usage.source.other": "Autre",
  "engines.usage.source.unknown": "Avant (non enregistré)",
  "engines.usage.title": "Où sont passés les 7 derniers jours",
  "engines.usage.note":
    "Les parts portent sur les jetons signalés par les moteurs (entrée plus sortie), ou sur le temps quand « Temps » est choisi ; les tentatives qui n'ont signalé aucun jeton n'ajoutent que du temps. « Toi » désigne tes propres messages, « Routines » les routines et les relances, « Entre membres » les passations, et « Autre » tout le reste, comme les exécutions propres à un déploiement.",
  "engines.usage.nothing": "Rien n'a été compté sur les 7 derniers jours.",
  "engines.usage.chartsFailed":
    "Les graphiques d'utilisation n'ont pas pu être dessinés. Le tableau ci-dessous n'est pas touché.",
  "engines.usage.restMembers": "Autres membres",
  "engines.usage.limitTitle": "Limites du forfait",
  "engines.usage.limitNone":
    "Aucun moteur n'est retenu par une limite pour le moment.",
  "engines.usage.limitNote":
    "Un pourcentage de la limite hebdomadaire de ton forfait n'est pas affiché : l'abonnement ne le communique pas à FreeDuet. Un moteur ne le signale que lorsqu'il a atteint une limite, avec l'heure à laquelle il est attendu de nouveau.",
  "engines.usage.range": "du {from} au {to}, jours UTC",
  "engines.usage.splitBy": "Répartir par",
  "engines.usage.measure": "Mesure",
  "engines.usage.perDay": "{title} : {metric} par jour",
  "engines.usage.perDayUtc": "{title} : {metric} par jour, UTC",
  "engines.usage.day": "Jour",
  // connections-begin
  "connections.connect": "Connecter",
  "connections.reconnect": "Reconnecter",
  "connections.connected": "Connecté",
  "connections.teamAccount": "Compte d'équipe",
  "connections.disconnect": "Déconnecter",
  "connections.disconnecting": "Déconnexion…",
  "connections.startFailed":
    "Impossible de lancer la connexion, rien n'a donc été connecté. Réessaie, ou demande à un administrateur si cela continue.",
  "connections.list.auth.no-broker":
    "La connexion des applis n'est pas encore configurée, rien n'a donc été enregistré. Demande à un administrateur de la configurer.",
  "connections.list.auth.not-supported":
    "Ici, les applis se connectent une seule fois, avec Connecter sur la page de l'appli. Elles ne sont pas autorisées une action à la fois.",
  "connections.list.auth.missing-handle":
    "Ce lien ne dit pas quelle autorisation il termine, rien n'a donc été fait. Recommence depuis la page de l'appli.",
  "connections.list.auth.no-attempt":
    "Aucune autorisation n'est en cours que tu puisses terminer. Elle a peut-être expiré, ou été lancée dans une autre session. Recommence depuis la page de l'appli.",
  "connections.list.auth.vendor-unavailable":
    "L'appli n'a pas répondu quand {product} a essayé de terminer cette autorisation, rien n'a donc été enregistré. Réessaie le lien dans un instant.",
  "connections.list.auth.not-your-authorization":
    "Ce lien ne correspond pas à l'autorisation que tu as en cours, rien n'a donc été enregistré. Termine-la dans l'onglet où tu l'as lancée, ou recommence depuis la page de l'appli.",
  "connections.list.auth.not-finished":
    "Cette autorisation n'est pas encore terminée, rien n'a donc été enregistré. Termine-la dans l'appli, puis rouvre le lien.",
  "connections.list.auth.authorization-failed":
    "L'appli n'a pas terminé cette autorisation, rien n'a donc été enregistré. Recommence depuis la page de l'appli.",
  "connections.list.auth.context-changed":
    "Le compte de cette appli a changé pendant que l'autorisation était ouverte, rien n'a donc été enregistré. L'accès donné à l'ancien compte a été retiré. Recommence depuis la page de l'appli.",
  "connections.list.auth.not-permitted":
    "Tu ne peux plus connecter le compte de cette appli, rien n'a donc été enregistré. Ton accès ou la configuration de l'appli ont changé pendant que l'autorisation était ouverte. Demande à un administrateur si tu t'attendais à pouvoir la terminer.",
  "connections.list.auth.cancelled":
    "Cette autorisation a été annulée pendant qu'elle se terminait, rien n'a donc été enregistré. L'accès qu'elle avait donné a été retiré.",
  "connections.list.auth.cancelled-left-live":
    "Cette autorisation a été annulée pendant qu'elle se terminait, rien n'a donc été enregistré. L'accès qu'elle avait donné n'a pas pu être retiré, donc l'appli peut encore autoriser l'action que tu as annulée. Pour le retirer, déconnecte l'appli depuis sa page, puis reconnecte-la et autorise seulement ce que tu veux.",
  "connections.list.auth.not-recorded":
    "Impossible d'enregistrer cette autorisation, rien n'a donc été sauvegardé. Recommence depuis la page de l'appli, ou demande à un administrateur si cela continue.",
  "connections.list.description":
    "Les applis et les comptes que tes Bots utilisent en ton nom. Ouvres-en un pour le connecter ou le modifier.",
  "connections.list.connectFailed":
    "Impossible de connecter ce compte. Rien n'a été sauvegardé. Réessaie.",
  "connections.list.title": "Tes connexions",
  "connections.list.loading": "Chargement des connexions…",
  "connections.list.loadError":
    "Impossible de charger tes connexions. Recharge la page, ou demande à un administrateur si cela continue.",
  "connections.list.empty":
    "Rien à connecter pour l'instant. Les applis apparaissent ici une fois qu'un administrateur les active.",
  "connections.list.count": "{inUse} en cours d'utilisation · {total} au total",
  "connections.list.search": "Rechercher des connexions",
  "connections.list.noMatch": "Rien ne correspond à « {query} ».",
  "connections.list.linksError":
    "Impossible de charger GitHub et Slack, ils ne sont donc pas listés. Recharge la page.",
  "connections.list.connectNamed": "Connecter {title}",
  "connections.list.reconnectNamed": "Reconnecter {title}",
  "connections.app.landed": "Tu viens d'autoriser {action}.",
  "connections.app.pendingTitle": "Compte",
  "connections.app.loadError":
    "Impossible de charger cette connexion. Recharge la page, ou demande à un administrateur si cela continue.",
  "connections.app.appLoadError":
    "Impossible de charger cette appli. Recharge la page, ou demande à un administrateur si cela continue.",
  "connections.app.notSetUp":
    "{title} n'est pas encore configuré. Un administrateur doit l'activer avant que quiconque puisse le connecter.",
  "connections.app.sharedDesc":
    "Partagé par ton organisation. Les Bots agissent avec le compte d'équipe.",
  "connections.app.brokeredDesc":
    "Les Bots l'utilisent en ton nom et ne voient que ce que tu peux voir.",
  "connections.app.reassurance": "Aucun Bot ne peut l'utiliser en ton nom.",
  "connections.app.tripPerAction":
    "Autorise ci-dessous les actions que tu veux.",
  "connections.app.tripConnect":
    "En connectant, tu vas sur {title} pour approuver l'accès.",
  "connections.app.connectedDesc":
    "Les Bots que tu autorises utilisent ton {title} en ton nom. En déconnectant, leur accès est retiré partout.",
  "connections.app.notYours": "Tu ne connectes pas cette appli toi-même.",
  "connections.app.oneShared":
    "Les Bots utilisent un seul compte partagé pour cette appli, le même pour tout le monde.",
  "connections.app.noApp": "{product} n'a aucune appli de ce nom.",
  "connections.app.yourAccount": "Ton compte",
  "connections.app.notAvailable":
    "Pas encore disponible. Un administrateur doit d'abord l'activer.",
  "connections.app.connectedAsYou":
    "Les Bots que tu autorises l'utilisent en ton nom et ne voient que ce que tu peux voir.",
  "connections.app.notConnected":
    "Aucun Bot ne peut l'utiliser en ton nom. En connectant, tu vas sur {vendor} pour approuver l'accès.",
  "connections.app.disconnectedDone":
    "Déconnecté. {product} ne peut plus utiliser ton compte {vendor}.",
  "connections.app.disconnectedUnconfirmed":
    "Déconnecté ici. {vendor} ne l'a pas confirmé, retire donc aussi {product} dans les réglages d'accès des tiers de ton compte {vendor}.",
  "connections.app.accessDesc":
    "Ce que tu as autorisé, tel que {vendor} l'a enregistré. Cela peut être moins que ce que {product} a demandé.",
  "connections.app.access": "Accès",
  "connections.app.allowed": "Autorisé",
  "connections.app.vendorDidntSay": "{vendor} ne l'a pas dit.",
  "connections.identity.toolsDesc":
    "Permet à tes Bots de lire et de modifier tes dépôts en ton nom. Tu le connectes séparément de ton compte ci-dessus.",
  "connections.identity.tools": "Outils",
  "connections.identity.githubTools": "Outils GitHub",
  "connections.identity.notConnected": "Non connecté",
  "connections.mail.neverRun": "Ne s'est pas encore exécutée.",
  "connections.mail.lastRun": {
    one: "Dernière exécution {when} : {count} message. {total} au total.",
    many: "Dernière exécution {when} : {count} de messages. {total} au total.",
    other: "Dernière exécution {when} : {count} messages. {total} au total.",
  },
  "connections.mail.on": "Activée. {activity}",
  "connections.mail.off": "Désactivée",
  "connections.mail.switchOff": "Désactiver",
  "connections.mail.switchOn": "Activer",
  "connections.mail.delete": "Supprimer",
  "connections.mail.lastProblem": "Dernier problème : {error}",
  "connections.mail.description":
    "Des règles permanentes que tu as demandées dans le chat. Tes Bots les conservent et les appliquent au nouveau courrier toutes les quelques minutes ; ce ne sont pas des filtres Gmail. Supprimer une règle n'annule pas ce qu'elle a déjà fait.",
  "connections.mail.title": "Règles de courrier",
  "connections.mail.search": "Rechercher des règles de courrier",
  "connections.mail.statusLabel": "État de la règle",
  "connections.mail.allStatuses": "Tous les états",
  "connections.mail.optActive": "Actives",
  "connections.mail.optPaused": "En pause",
  "connections.mail.active": "Active",
  "connections.mail.paused": "En pause",
  "connections.mail.noMatch": "Aucune règle ne correspond à ces filtres.",
  "connections.mail.paging": {
    one: "{from}–{to} sur {count} règle",
    many: "{from}–{to} sur {count} de règles",
    other: "{from}–{to} sur {count} règles",
  },
  "connections.mail.previous": "Précédent",
  "connections.mail.next": "Suivant",
  "connections.secret.aMember": "Un membre",
  "connections.secret.doneMemberCal":
    "Connecté. {name} peut maintenant lire ton courrier et ton agenda en ton nom.",
  "connections.secret.doneMember":
    "Connecté. {name} peut maintenant lire ton courrier en ton nom.",
  "connections.secret.doneBotsCal":
    "Connecté. Les Bots que tu autorises peuvent maintenant lire ton courrier et ton agenda en ton nom.",
  "connections.secret.doneBots":
    "Connecté. Les Bots que tu autorises peuvent maintenant lire ton courrier en ton nom.",
  "connections.secret.notAvailable":
    "Pas encore disponible. Un administrateur doit d'abord l'activer.",
  "connections.secret.statusError":
    "Impossible de charger si tu l'as déjà connecté. Recharge la page, ou demande à un administrateur si cela continue.",
  "connections.secret.yourAccount": "Ton compte",
  "connections.secret.connectedCal":
    "Connecté en tant que {address}. Ton agenda est connecté aussi. Les Bots que tu autorises l'utilisent en ton nom.",
  "connections.secret.connectedNoCal":
    "Connecté en tant que {address}. Aucun agenda n'est connecté. Les Bots que tu autorises l'utilisent en ton nom.",
  "connections.secret.notConnected":
    "Aucun Bot ne peut l'utiliser en ton nom. Colle ci-dessous un mot de passe d'application pour connecter ton Gmail.",
  "connections.secret.useDifferent":
    "Utiliser un autre mot de passe d'application",
  "connections.secret.disconnected":
    "Déconnecté. {product} ne peut plus lire ton courrier ni ton agenda. Pour être sûr que le mot de passe d'application ne fonctionne plus, supprime-le aussi sur {url}.",
  "connections.secret.formDesc":
    "Deux étapes chez Google, puis colle ce qu'ils te donnent. Rien n'est enregistré si Gmail ne l'accepte pas.",
  "connections.secret.connectTitle": "Connecter",
  "connections.secret.memberWillUse": "{name} utilisera cette boîte mail.",
  "connections.secret.step1Lead":
    "Active la validation en deux étapes pour ton compte Google, puis crée un mot de passe d'application sur",
  "connections.secret.step1Tail":
    ". Nomme-le {product} et copie les seize lettres.",
  "connections.secret.step2Lead":
    "Pour que tes Bots voient aussi ton agenda : dans Google Agenda, ouvre les Paramètres, choisis ton agenda et copie son",
  "connections.secret.step2Link": "Adresse secrète au format iCal",
  "connections.secret.step2Tail": ". Cette étape est facultative.",
  "connections.secret.address": "Ton adresse Gmail",
  "connections.secret.password": "Mot de passe d'application",
  "connections.secret.passwordHint":
    "Les seize lettres données par Google, avec ou sans les espaces. Pas ton mot de passe habituel.",
  "connections.secret.calendar": "Adresse secrète de l'agenda (facultatif)",
  "connections.secret.calendarHint":
    "Toute personne qui a cette adresse peut lire ton agenda, elle est donc conservée avec le même soin que le mot de passe.",
  "connections.secret.checking": "Vérification auprès de Gmail…",
  "connections.secret.canDoTitle": "Ce que cela permet à tes Bots de faire",
  "connections.secret.canDoDesc":
    "Un mot de passe d'application ouvre toute ta boîte mail, il vaut donc la peine de savoir ce que cela fait.",
  "connections.secret.canDo":
    "Tes Bots peuvent chercher et lire ton courrier et consulter ton agenda. Ils ne peuvent rien supprimer, déplacer ni étiqueter. Une réponse ne part qu'après ton approbation, et seulement vers des personnes déjà présentes dans le message. Tu peux te déconnecter à tout moment, et tu peux supprimer le mot de passe d'application chez Google quand tu veux.",
  "connections.mode.goesShared": "Le compte partagé sera déconnecté.",
  "connections.mode.goesNoShared": "Aucun compte partagé n'est connecté.",
  "connections.mode.goesPersonal": {
    one: "{count} compte personnel sera déconnecté.",
    many: "{count} de comptes personnels seront déconnectés.",
    other: "{count} comptes personnels seront déconnectés.",
  },
  "connections.mode.makeShared": "Rendre {title} partagé",
  "connections.mode.makePersonal": "Rendre {title} personnel",
  "connections.mode.titleShared": "Partager un seul compte {title} ?",
  "connections.mode.titlePersonal":
    "Donner à chacun son propre compte {title} ?",
  "connections.mode.checking": "Vérification de ce que cela changerait…",
  "connections.mode.everyone":
    "Toute personne qui utilise un Bot avec cette appli agira avec ce seul compte.",
  "connections.cancel": "Annuler",
  "connections.dir.description":
    "Le répertoire d'applis de {name}. Ajoute une appli pour rendre ses outils disponibles aux Bots. Chaque personne connecte tout de même son propre compte avant qu'elle ne lise quoi que ce soit.",
  "connections.dir.appsTitle": "Applis",
  "connections.dir.appsDesc":
    "Cherche par nom. Personne ici n'a examiné ces applis.",
  "connections.dir.searchAria": "Rechercher dans les applis de {name}",
  "connections.dir.searchPlaceholder": "Rechercher par nom d'appli",
  "connections.dir.noMatch":
    "Aucune appli de {name} ne correspond à « {query} ».",
  "connections.dir.none": "{name} n'a renvoyé aucune appli.",
  "connections.dir.actions": {
    one: "{count} action",
    many: "{count} d'actions",
    other: "{count} actions",
  },
  "connections.dir.added": "Ajoutée",
  "connections.dir.adding": "Ajout…",
  "connections.dir.add": "Ajouter",
  "connections.grants.consentFailed":
    "{product} a répondu sans lien de consentement, rien n'a donc été autorisé. Réessaie, ou demande à un administrateur si cela continue.",
  "connections.grants.title": "Actions",
  "connections.grants.readError":
    "Impossible de lire pour le moment ce que ce compte autorise.",
  "connections.grants.retry": "Réessayer",
  "connections.grants.description":
    "Regroupées selon la permission que demande chaque action. Cela correspond à ce qu'affiche l'écran de consentement.",
  "connections.grants.search": "Rechercher des actions",
  "connections.grants.wholeApp": "Tout dans cette appli, approuvé ensemble",
  "connections.grants.noPermission": "Ne demande aucune permission propre",
  "connections.grants.needs": "Nécessite {scopes}",
  "connections.grants.authorize": "Autoriser",
  "connections.grants.hidden": {
    one: "{count} autre action pas encore autorisée. Fais une recherche pour la trouver.",
    many: "{count} d'autres actions pas encore autorisées. Fais une recherche pour en trouver une.",
    other:
      "{count} autres actions pas encore autorisées. Fais une recherche pour en trouver une.",
  },
  "connections.grants.noMatch":
    "Aucune action ne correspond à cette recherche.",
  "connections.grants.before": "Avant d'autoriser {action}",
  "connections.grants.continue": "Continuer vers le consentement",
  "connections.grants.notRequired": "Ne nécessite aucune autorisation.",
  "connections.grants.authorized": "Autorisée.",
  "connections.grants.notYet": "Pas encore autorisée.",
  "connections.grants.notYetAdmin":
    "Pas encore autorisée. Un administrateur peut l'autoriser.",
  "connections.grants.missing":
    "{missing} manque. Un administrateur doit le définir. Autoriser ne peut pas y remédier.",
  "connections.grants.missingSetting":
    "Un réglage manque. Un administrateur doit le définir. Autoriser ne peut pas y remédier.",
  "connections.grants.unknown":
    "Impossible de lire celle-ci pour le moment. {reason}",
  "connections.row.connectKey":
    "Cette appli se connecte avec une clé, pas avec une page de connexion, rien n'a donc été connecté. Recharge la page et appuie de nouveau sur Connecter.",
  "connections.row.noAuth":
    "{title} n'a pas besoin de compte. Les Bots qui l'ont peuvent l'utiliser tel quel.",
  "connections.row.verified":
    "Connecté avec ta clé. Dernière vérification : {date}.",
  "connections.row.failedCheck":
    "Ta clé n'a pas passé une vérification auprès de {title}. Cela peut venir de la clé, ou de {title} lui-même. Ton compte est toujours connecté. Appuie sur Revérifier pour réessayer, ou déconnecte puis connecte avec une nouvelle clé.",
  "connections.row.noSafeCheck":
    "Connecté avec ta clé. Elle n'a pas été vérifiée auprès de {title}. À ce moment-là, {title} n'avait aucun moyen sûr de vérifier une clé. Cela concerne l'appli, pas ta clé.",
  "connections.row.unchecked":
    "Connecté avec ta clé. Elle n'a pas été vérifiée auprès de {title}.",
  "connections.row.keyStillWorks":
    "Déconnecté. Ta clé fonctionne toujours chez {title}. Change-la là-bas pour couper tout accès.",
  "connections.row.asksForKey":
    "{title} se connecte avec une clé que tu as déjà. Connecter te la demande.",
  "connections.row.signedIn": "Connecté avec {title}. {description}",
  "connections.row.yourAccount": "Ton compte",
  "connections.row.keyMissing": "Clé manquante",
  "connections.row.recheck": "Revérifier",
  "connections.row.rechecking": "Vérification…",
  "connections.row.perAction": "Approuvé par action",
  "connections.row.connectYour": "Connecter ton compte",
  "connections.row.checkingNeeds": "Vérification de ce dont l'appli a besoin…",
  "connections.row.noNeeds":
    "Impossible de savoir ce dont cette appli a besoin. Ferme ceci et réessaie.",
  // connections-end
};
