/**
 * FreeDuet, D131 (docs/M1_PLAN.md section 89): the words of the three built-in safety requirements
 * (credentials, security settings, payments) in the other ten languages of the site: German, Spanish,
 * French, Japanese, Korean, Polish, Portuguese, Russian, Turkish and Chinese. English and Italian stay in
 * `policy.ts`, unchanged. The same concepts, no more and no fewer:
 *
 * - payments: paying, buying, placing or confirming an order, the checkout, bank transfers and sending
 *   money, cards and their number and security code, subscriptions, renewing a plan, topping up, gift cards,
 *   billing details, and (by tool name only) transactions, transfers, subscriptions, gift cards;
 * - credentials: password, one-time and verification codes, two-factor, recovery details, security
 *   questions, API keys and tokens, the sign-in method, "credentials", a PIN written with its word;
 * - security settings: the security, sharing, privacy and permission settings, account security, making
 *   something public or sharing it with anyone, the admin role, deleting or closing the account.
 *
 * How the text is read. The gate matches on the words of an action (tool, scope, arguments, target), and
 * the words below are matched on a FOLDED copy of them ({@link foldWords}): Unicode NFKC (full-width and
 * compatibility forms, "ＰＡＹ", "ｶｰﾄﾞ"), lower case, accents removed (ü ä ö é è ç ã ñ ą ę ó ś ź ż ğ ş and the
 * Cyrillic й and ё), "ß" as "ss", the Turkish dotless i and the Polish ł as plain letters, curly
 * apostrophes as a straight one, and zero-width characters and soft hyphens dropped. So "Überweisung",
 * "Uberweisung", "ÜBERWEISUNG" and a decomposed "Überweisung" are one word, and "Ueberweisung" is written
 * as an alternative where it is common. The terms below are written in that folded form (accents are
 * folded again when they are compiled, so a term may be written with its accents).
 *
 * Scripts with no spaces between words (Japanese, Chinese) and Korean, where a particle is glued to the
 * noun ("결제를", "支払いを"), cannot use word edges: their terms are matched as substrings, and each term was
 * chosen to be specific enough for that (see the false-friend notes). German compounds ("Kreditkartenzahlung",
 * "Banküberweisung") are the same: a few German nouns are matched as substrings, only where they have no
 * other meaning as a part of a word.
 *
 * Known limits, by design: the lists are words, so another wording can still pass ("Gib mir die Ware, ich
 * melde mich später" is not a payment to them); a word with two meanings is left out or tied to a second word
 * (German "Zahlen" is "numbers", French "régler" is also "to adjust", Russian "перевод" is also "translation",
 * Turkish "şifreleme" is "encryption", Japanese "更新" is also "update", Portuguese "assinatura" is also a
 * "signature" and "caixa" a "box"), and the reviewer model behind the gate and the person's own approval
 * rules still apply.
 */

const LETTERS = "\\p{L}\\p{M}\\p{N}";
const EDGE_START = `(?<![${LETTERS}])`;
const EDGE_END = `(?![${LETTERS}])`;
const SEP = "[-_ ]+";
const SEP0 = "[-_ ]*";
const REST = "[\\p{L}\\p{M}]*";

/** The folding every term and every text goes through (see the file's comment). */
export function foldWords(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[­​-‏⁠﻿]/g, "")
    .replace(/[‘’ʼ`´]/g, "'")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/ı/g, "i")
    .replace(/ł/g, "l")
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .normalize("NFC");
}

/**
 * One term of a list, as a regular expression source. A term is written in lower case with the syntax
 * `(?:a|b)`, `?`, `[xy]`, `.`, `\w` and three marks of its own: a space is a separator (a space, hyphen
 * or underscore, so a tool name in snake_case reads like the label), `~` is an optional separator, and `@`
 * is the rest of the word (any letters).
 */
function source(term: string): string {
  return foldWords(term)
    .replace(/\\w/g, "[\\p{L}\\p{M}]")
    .replace(/ /g, SEP)
    .replace(/~/g, SEP0)
    .replace(/@/g, REST);
}

export type WordList = {
  /** Terms with word edges: not inside a longer word. Spaced scripts. */
  words?: readonly string[];
  /** Terms matched as a substring, for scripts with no spaces, for Korean, and for German compounds. */
  parts?: readonly string[];
  /** Terms for the tool's own name only. */
  tools?: readonly string[];
};

/** The compiled form: what is tested on the folded words of an action, and on the folded tool name. */
export type CompiledWords = {
  inWords: readonly RegExp[];
  inToolName: readonly RegExp[];
};

export function compileWords(lists: readonly WordList[]): CompiledWords {
  const words = lists.flatMap((list) => list.words ?? []).map(source);
  const parts = lists.flatMap((list) => list.parts ?? []).map(source);
  const tools = lists.flatMap((list) => list.tools ?? []).map(source);
  const inWords: RegExp[] = [];
  if (words.length)
    inWords.push(
      new RegExp(`${EDGE_START}(?:${words.join("|")})${EDGE_END}`, "u"),
    );
  if (parts.length) inWords.push(new RegExp(`(?:${parts.join("|")})`, "u"));
  return {
    inWords,
    inToolName: tools.length ? [new RegExp(`(?:${tools.join("|")})`, "u")] : [],
  };
}

/** "Renew the subscription now" and "subscription, renew": a verb with a time word or an object, either way round. */
const renew = (verbs: string, nows: string, objects: string, art = "") => [
  `(?:${verbs}) (?:${nows}|${art}(?:${objects})@)`,
  `(?:${objects})@ (?:(?:${nows}) )?(?:${verbs})`,
];

/** "Top up the balance": a verb and a money object, either way round. The phone is left out on purpose (see the notes). */
const topUp = (verbs: string, objects: string, art = "") => [
  `(?:${verbs}) ${art}(?:${objects})@`,
  `(?:${objects})@ (?:${verbs})`,
];

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// German
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const DE_PAYMENTS: WordList = {
  words: [
    "bezahl(?:en|e|t|st|te|ung|ungen|vorgang)",
    "zahl(?:e|en|t) (?:jetzt|sofort|ihre rechnung|die rechnung|den betrag)",
    "jetzt zahlen",
    "zahlen sie",
    "(?:rechnung|betrag|gebuhr|gebuhren|abo|bestellung|summe) (?:jetzt |sofort )?zahlen",
    "kauf(?:e|en|t)?",
    "kaufabschluss",
    "(?:jetzt|kostenpflichtig|zahlungspflichtig|verbindlich) bestellen",
    "bestellen sie (?:jetzt|verbindlich|kostenpflichtig)",
    "bestellung (?:aufgeben|abschicken|absenden|abschliessen|bestatigen|senden|tatigen|platzieren|ausfuhren)",
    "bestellvorgang (?:abschliessen|fortsetzen)",
    "bestellabschluss",
    "zur kasse",
    "geld (?:senden|schicken|versenden|transferieren|ubermitteln)",
    "abonnier@",
    "abonnement@",
    "abos?",
    ...renew(
      "verlangern|verlangere|erneuern|erneuere",
      "jetzt|sofort|automatisch",
      "abo|abonnement|tarif|mitgliedschaft|lizenz|domain|hosting|vertrag",
      "(?:(?:mein|dein|ihr|das|den|die|ein)@ )?",
    ),
    ...topUp(
      "aufladen|auflade|lade auf",
      "guthaben|konto|wallet|karte|prepaid@",
      "(?:(?:das|dein|ihr|mein|die|den)@? )?",
    ),
    "geschenkkarte@",
    "geschenkgutschein@",
    "/kasse",
  ],
  parts: [
    "zahlung",
    "u(?:e)?berweis(?:en|e|ung|ungen|t)",
    "kreditkarte",
    "debitkarte",
    "bankkarte",
    "girocard",
    "ec-?karte",
    "prepaid-?karte",
    "kartennummer",
    "kartenpruf(?:nummer|ziffer)",
    "bankleitzahl",
    "rechnungsadresse",
    "rechnungsdaten",
    "abrechnungs(?:adresse|daten|informationen)",
  ],
  tools: [
    "transaktion",
    "u(?:e)?berweis",
    "abonnement",
    "abonnier",
    "geschenkkarte",
    "gutschein",
    "aufladung",
  ],
};
const DE_CREDENTIALS: WordList = {
  parts: [
    "passwort",
    "kennwort",
    "zugangsdaten",
    "anmeldedaten",
    "login-?daten",
    "zugangscode",
    "(?:einmal|bestatigungs|verifizierungs|sicherheits|wiederherstellungs|authentifizierungs|sms|backup)-?code",
    "(?:m|photo|push|chip)tan",
    "tan-?(?:code|nummer|liste)",
    "(?:zwei|mehr)-?faktor",
    "2-?faktor",
    "zweistufig",
    "in zwei schritten",
    "api-?schlussel",
    "(?:wiederherstellungs|geheim|zugriffs|privat)-?schlussel",
    "zugriffstoken",
    "zugangstoken",
    "sicherheitsfrage",
    "wiederherstellungs-?(?:e-?mail|mail|adresse|nummer|telefon)",
    "anmeldemethode",
    "anmeldeverfahren",
    "geheimzahl",
    "pin-?code",
    "pin-?nummer",
  ],
};
const DE_SECURITY: WordList = {
  parts: [
    "sicherheitseinstellung",
    "kontosicherheit",
    "freigabeeinstellung",
    "datenschutzeinstellung",
    "berechtigungseinstellung",
    "adminrechte",
  ],
  words: [
    "einstellungen (?:zur |fur die |der |zu )?(?:sicherheit|freigabe|freigaben|privatsphare|datenschutz|berechtigungen)",
    "sicherheit (?:des|ihres|deines|meines) kontos",
    "(?:mit )?(?:jedem|allen|jedermann|der offentlichkeit) teilen",
    "offentlich (?:machen|freigeben|zuganglich machen|teilen)",
    "(?:mach|machen|setze|setzen|stelle|stellen|mache)@? (?:\\w+ ){0,2}offentlich",
    "admin(?:istrator)?-?(?:rolle|rechte|berechtigung@)",
    "(?:zum|als) admin(?:istrator)? (?:ernennen|machen|festlegen|hinzufugen|einsetzen)",
    "(?:konto|account|benutzerkonto|nutzerkonto) (?:endgultig )?(?:loschen|schliessen|deaktivieren|kundigen)",
    "(?:loschen|schliessen|deaktivieren|kundigen)@? (?:sie |bitte )?(?:mein|dein|ihr|das|den|dieses)@? (?:benutzer|nutzer)?(?:konto|account)",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Spanish
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const ES_ART = "(?:(?:el|la|su|tu|mi|un|una|este|esta) )*";
const ES_PAYMENTS: WordList = {
  words: [
    "pag(?:ar|ado|ando|ue|o|os|a|amos)",
    "pagos?",
    "compr(?:a|as|ar|ado|ando|e|o)",
    "adquir(?:ir|e|ido)",
    "adquisicion",
    `(?:confirmar|confirma|confirme|finalizar|finaliza|finalice|realizar|realiza|realice|completar|completa|complete|enviar|envia|envie|hacer|haz|haga|efectuar|efectua|efectue|tramitar|tramita|tramite|formalizar|formaliza|formalice|colocar|coloca|coloque) ${ES_ART}pedido(?! de (?!compra))`,
    `(?:confirmar|confirma|confirme|finalizar|finaliza|finalice|realizar|realiza|realice|completar|completa|complete|enviar|envia|envie|hacer|haz|haga|efectuar|efectua|efectue|tramitar|tramita|tramite|formalizar|formaliza|formalice|colocar|coloca|coloque) ${ES_ART}orden(?! (?:del dia|alfabetic@|de busqueda|ascendente|descendente))`,
    "pedido(?! de (?!compra))",
    "(?:ir|vaya|vamos|pasar|pasa|proceder|procede|continuar|continua|ve) (?:a|por|hacia) (?:la )?caja(?! de)",
    "transferencia (?:bancaria|electronica|de dinero|de fondos|de pago|inmediata|internacional)",
    "transferir (?:dinero|fondos|el importe|la cantidad|el monto)",
    "(?:hacer|realizar|enviar|efectuar|ordenar|programar|haz|realiza|envia) (?:una |la |mi |su |tu )?transferencia",
    "giro (?:bancario|postal)",
    "(?:enviar|mandar|envia|manda|girar) (?:dinero|fondos)",
    "tarjeta (?:de )?(?:credito|debito|prepago|prepagada|bancaria)",
    "numero (?:de |de la )?(?:la )?tarjeta",
    "numero de enrutamiento",
    "suscri(?:birse|bete|be|bir|bimos|pcion|pciones|bo)",
    "abon(?:ar|arse|ate|o|os)",
    ...renew(
      "renov(?:ar|a|e|acion)",
      "ahora|ya|automaticamente",
      "suscripcion|plan|membresia|licencia|dominio|hosting|alojamiento|abono|contrato",
      ES_ART,
    ),
    ...topUp(
      "recargar|recarga|recargue|anadir|agregar|ingresar",
      "saldo|cuenta|monedero|cartera|tarjeta|credito|fondos",
      "(?:(?:el|la|su|tu|mi) )?",
    ),
    "recarga (?:de )?(?:saldo|movil|telefonica|credito|cuenta|tarjeta)",
    "tarjeta (?:de )?regalo",
    "(?:cheque|vale|bono|certificado) (?:de )?regalo",
    "facturacion",
  ],
  parts: [],
  tools: ["transferencia", "suscripcion", "tarjeta_regalo", "recarga"],
};
const ES_CREDENTIALS: WordList = {
  words: [
    "contrasena@",
    "clave (?:de )?(?:acceso|secreta|privada|de seguridad|de recuperacion|api|unica|de un solo uso)",
    "(?:palabra|frase) (?:secreta|de contrasena|de recuperacion|semilla)",
    "credenciales?",
    "codigo (?:otp|de un solo uso|de uso unico|unico|de verificacion|de acceso|de seguridad|de recuperacion|de confirmacion|sms|de autenticacion|pin)",
    "(?:autenticacion|verificacion|validacion) (?:en|de) (?:dos|2) (?:pasos|factores)",
    "(?:autenticacion|verificacion) (?:de )?(?:dos|2|doble|multi)-?(?:factor|pasos)",
    "doble (?:autenticacion|factor|verificacion)",
    "pregunta (?:de )?seguridad",
    "(?:correo|email|e-?mail|telefono|numero|movil)(?: electronico)? de recuperacion",
    "(?:metodo|forma) de (?:inicio de sesion|acceso)",
    "token (?:de )?acceso",
    "token api",
    "numero pin",
  ],
};
const ES_SECURITY: WordList = {
  words: [
    "(?:configuracion|configuraciones|ajustes|opciones|preferencias) (?:de |del |para )?(?:la )?(?:seguridad|privacidad|uso compartido|permisos|acceso|comparticion)",
    "seguridad (?:de |de la )?(?:la |mi |su |tu )?cuenta",
    "(?:compartir|comparte|compartas) (?:con )?(?:todos|todo el mundo|cualquiera|cualquier persona|publicamente|el publico)",
    "(?:hazlo|hazla|hacerlo|hacerla|hacer|haz|haga|hagas|volver|vuelve|establecer|establece|configura|configurar)@? (?:(?!para)\\w+ ){0,2}public[oa]s?",
    "(?:permisos|rol|derechos|privilegios|acceso) de (?:administrador|admin)",
    "(?:hacer|haz|nombrar|nombra|convertir|convierte|designar|designa|otorgar|otorga|conceder|concede|dar|da|asignar|asigna)@? (?:\\w+ ){0,3}(?:administrador|admin)",
    "(?:eliminar|elimina|borrar|borra|cerrar|cierra|desactivar|desactiva|cancelar|cancela|dar de baja|da de baja) (?:mi |tu |su |la |el |esta )?(?:cuenta|account)",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// French
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const FR_ART =
  "(?:(?:la|le|l'|ma|mon|votre|notre|cette|ce|une|un|ta|ton|mes|vos)~)*";
const FR_PAYMENTS: WordList = {
  words: [
    "paiements?",
    "pay(?:er|ez|ons|e|es|ement|ements)",
    "regler (?:la facture|le montant|votre commande|votre achat|par carte|maintenant)",
    "ach(?:eter|ete|etez|etes|at|ats)",
    `(?:confirmer|confirmez|confirme|valider|validez|valide|finaliser|finalisez|finalise|passer|passez|passe|effectuer|effectuez|effectue|envoyer|envoyez|envoie|terminer|terminez|termine|completer|completez|complete|soumettre|soumettez|soumet) ${FR_ART}commande`,
    "(?:valider|validez|valide) (?:le |mon |votre |ce )?panier",
    "(?:passer|passez) (?:en|a la) caisse",
    "(?:aller|allez|va|passer|passez|proceder|procedez|continuer|continuez) (?:a|en|vers) (?:la )?caisse",
    "virements?",
    "(?:envoyer|envoyez|envoie|transferer|transferez|transfere|verser|versez|verse) (?:de l'|l'|des |de |du |votre |mon )?(?:argent|fonds|somme|montant)",
    "transfert (?:d'argent|de fonds)",
    "mandat (?:postal|cash)",
    "releve d'identite bancaire",
    "coordonnees bancaires",
    "code guichet",
    "cartes? (?:de )?(?:credit|debit|bancaires?|bleue|prepayee)",
    "numero (?:de |de la |d'une |de votre )?carte(?! (?:d'identite|vitale|grise|de securite sociale|de fidelite|nationale))",
    "cryptogramme",
    "abonn(?:er|ez|e|es|ement|ements|ons)",
    ...renew(
      "renouvel(?:er|ez|ons|le|lement)",
      "maintenant|automatiquement",
      "abonnement|forfait|adhesion|licence|domaine|hebergement|contrat|plan",
      FR_ART,
    ),
    ...topUp(
      "recharg(?:er|ez|e|ement)",
      "compte|solde|credit|carte|portefeuille|porte-monnaie|forfait|sim",
      FR_ART,
    ),
    "cartes? cadeaux?",
    "bons? cadeaux?",
    "cheques? cadeaux?",
    "facturation",
  ],
  tools: ["virement", "abonnement", "carte_cadeau", "recharge", "transaction"],
};
const FR_CREDENTIALS: WordList = {
  words: [
    "mots? de passe",
    "mdp",
    "motdepasse",
    "identifiants",
    "identifiant de connexion",
    "informations? (?:d'identification|de connexion)",
    "donnees de connexion",
    "code (?:otp|a usage unique|de verification|de confirmation|d'acces|de securite|de recuperation|secret|pin|sms|d'authentification|temporaire)",
    "authentification (?:a|en) (?:deux|2|double|multi)-?(?:facteurs?|etapes)",
    "(?:double|forte) authentification",
    "(?:validation|verification) en (?:deux|2) etapes",
    "question (?:secrete|de securite)",
    "(?:e-?mail|courriel|adresse e-?mail|adresse mail|numero|telephone|mail) de (?:recuperation|secours)",
    "cle (?:api|secrete|privee|de recuperation|d'acces|de securite|de secours)",
    "jeton (?:d'acces|api)",
    "token d'acces",
    "phrase (?:secrete|de passe|de recuperation|de secours)",
    "methode (?:de connexion|d'authentification)",
    "numero pin",
  ],
};
const FR_SECURITY: WordList = {
  words: [
    "(?:parametres|reglages) (?:de |du |d')?(?:securite|confidentialite|partage|autorisations|acces|permissions)",
    "securite (?:du |de votre |de mon |de ton )?compte",
    "partager (?:avec )?(?:tout le monde|tous|n'importe qui|publiquement|le public)",
    "partage public",
    "(?:rendre|rends|rendez) (?:\\w+ ){0,2}publi(?:c|que)s?",
    "(?:mettre|mets|mettez|passer|passez) en (?:acces )?public",
    "(?:droits?|role|roles|permissions?|privileges?) (?:d')?admin(?:istrateur)?",
    "(?:nommer|nomme|nommez|promouvoir|promeus|promouvez|definir|definissez|donner|donne|donnez|accorder|accorde|accordez|attribuer|attribue|attribuez|rendre|rends|rendez|faire)@? (?:\\w+ ){0,3}(?:administrateur|admin)",
    "(?:supprimer|supprime|supprimez|effacer|efface|effacez|fermer|ferme|fermez|desactiver|desactive|desactivez|cloturer|cloture|resilier|resilie|resiliez) (?:mon |ton |votre |le |ce |son |la |l')?compte(?!~-?(?:rendu|a rebours))",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Portuguese (Brazil and Portugal)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const PT_ART =
  "(?:(?:o|a|seu|sua|meu|minha|um|uma|este|esta|esse|essa|do|da) )*";
const PT_PAYMENTS: WordList = {
  words: [
    "pag(?:ar|ue|amento|amentos|ando|ado|o|os|a)",
    "quitar",
    "quitacao",
    "compr(?:a|as|ar|e|o|ando|ado)",
    "adquir(?:ir|e)",
    "aquisicao",
    `(?:confirmar|confirme|finalizar|finalize|concluir|conclua|enviar|envie|fazer|faca|realizar|realize|efetuar|efetue|efectuar|efectue|submeter|submeta|fechar|feche) ${PT_ART}pedido(?! de (?!compra))`,
    `(?:confirmar|confirme|finalizar|finalize|concluir|conclua|fazer|faca|realizar|realize|efetuar|efetue|efectuar|efectue|submeter|submeta|fechar|feche) ${PT_ART}encomenda`,
    "ordem de compra",
    "(?:ir|vai|va|siga|seguir|passe|passar|prossiga|prosseguir) (?:para|ao|a|pela|pelo|no|na)(?: o| a)? caixa(?! de)",
    "transferencias? (?:bancaria|eletronica|electronica|de dinheiro|de fundos|de valor)",
    "transferir (?:dinheiro|fundos|valor|quantia|montante)",
    "(?:fazer|faca|realizar|efetuar|efectuar|agendar|programar|enviar|envie) (?:uma |a |minha |sua )?transferencia",
    "(?:enviar|mandar|envie|mande) dinheiro",
    "chave pix",
    "boleto bancario",
    "cart(?:ao|oes) (?:de )?(?:credito|debito|bancario|pre-?pago|prepago|virtual)",
    "numero (?:do |de )?cartao",
    "codigo de seguranca do cartao",
    "assinar (?:agora|plano|o plano|a assinatura|premium)",
    "assinatura (?:mensal|anual|premium|do plano|de plano|recorrente|paga|semanal)",
    "planos? de assinatura",
    "assine (?:agora|ja)",
    "subscri(?:cao|coes|ver|va|tor)",
    ...renew(
      "renov(?:ar|e|acao)",
      "agora|ja|automaticamente",
      "assinatura|plano|adesao|licenca|dominio|hospedagem|alojamento|contrato|subscricao",
      PT_ART,
    ),
    ...topUp(
      "recarregar|recarregue|carregar|carregue|adicionar|adicione",
      "saldo|credito|conta|carteira|cartao|fundos",
      PT_ART,
    ),
    "recarga (?:de |do )?(?:celular|telemovel|saldo|credito|conta|cartao|telefonica)",
    "cart(?:ao|oes) (?:de )?presente",
    "(?:vale|cartao|cheque) presente",
    "faturacao",
    "faturamento",
    "(?:dados|endereco) de cobranca",
  ],
  tools: [
    "transferencia",
    "assinatura",
    "subscricao",
    "cartao_presente",
    "recarga",
  ],
};
const PT_CREDENTIALS: WordList = {
  words: [
    "senhas?",
    "palavras?-?passe",
    "credenciais",
    "credencial",
    "codigo (?:otp|de uso unico|unico|de verificacao|de confirmacao|de acesso|de seguranca|de recuperacao|de autenticacao|sms|pin)",
    "autenticacao (?:de |em )?(?:dois|2|duplo|multi)-?(?:fatores|fator|etapas|passos)",
    "(?:verificacao|autenticacao) (?:em )?(?:duas|2|dois) (?:etapas|passos|fatores)",
    "dupla autenticacao",
    "duplo fator",
    "pergunta (?:de )?seguranca",
    "(?:e-?mail|telefone|numero|celular|telemovel|endereco) de recuperacao",
    "chave (?:de )?(?:api|secreta|privada|recuperacao|acesso|seguranca)",
    "token (?:de )?acesso",
    "token api",
    "frase (?:secreta|de recuperacao|de seguranca|de senha)",
    "metodo de (?:login|acesso|entrada|autenticacao)",
    "dados de (?:login|acesso)",
    "numero pin",
  ],
};
const PT_SECURITY: WordList = {
  words: [
    "(?:configuracoes|definicoes|ajustes|opcoes|preferencias) (?:de |da |do |das )?(?:seguranca|privacidade|compartilhamento|partilha|permissoes|acesso)",
    "seguranca da conta",
    "(?:compartilh|partilh)(?:ar|e) (?:com )?(?:todos|qualquer pessoa|qualquer um|publicamente|o publico)",
    "(?:tornar|torne|deixar|deixe|definir|defina|fazer|faca)@? (?:\\w+ ){0,2}public[oa]s?",
    "(?:permissao|permissoes|funcao|papel|cargo|direitos) de (?:administrador|admin)",
    "(?:tornar|torne|nomear|nomeie|promover|promova|definir|defina|conceder|conceda|dar|de|atribuir|atribua|fazer|faca)@? (?:\\w+ ){0,3}(?:administrador|admin)",
    "(?:excluir|exclua|apagar|apague|encerrar|encerre|fechar|feche|desativar|desative|eliminar|elimine|cancelar|cancele|deletar|delete) (?:minha |sua |a |esta |essa |nossa )?conta(?! (?:corrente|a pagar|a receber|poupanca))",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Polish
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const PL_PAYMENTS: WordList = {
  words: [
    "platnos(?:c|ci|cia|ciom|ciami|ciach)",
    "(?:za|o)plac(?:ic|e|i|my|cie|ono)?",
    "zaplat(?:a|y|e|ie)",
    "obowiazkiem zaplaty",
    "zamawiam",
    "kup(?:ic|uj|ie|my|cie|no)?",
    "zakup(?:y|u|ow|em|ie)?",
    "(?:zloz|zlozyc|zlozenie|potwierdz|potwierdzic|zatwierdz|zatwierdzic|sfinalizuj|sfinalizowac|wyslij|wyslac|zamow|zlozone) (?:swoje |twoje |to |te )?zamowieni(?:e|a|u)",
    "(?:do kasy|przejdz do kasy)",
    "przelew@",
    "przelej",
    "przelac",
    "kart[aeyi]? (?:kredytow|debetow|platnicz|przedplacon)@",
    "numer(?:u)? karty",
    "numer rozliczeniowy",
    "subskryb@",
    "subskrypcj@",
    "abonament@",
    "prenumerat@",
    ...renew(
      "odnow@|przedluz@",
      "teraz|automatycznie",
      "subskrypcj|abonament|plan|czlonkostw|licencj|domen|hosting",
    ),
    ...topUp(
      "dolad(?:uj|owac|owanie)|zasil(?:ic|enie|aj)",
      "konto|konta|salda|saldo|portfel|karte|karty",
    ),
    "kart(?:a|y|e) podarunkow@",
    "bon(?:u)? podarunkow@",
    "(?:bon|karta) prezentow@",
    "(?:adres|dane) rozliczeniow@",
    "dane do faktury",
  ],
  parts: [],
  tools: [
    "przelew",
    "subskrypcj",
    "platnosc",
    "doladowanie",
    "karta_podarunkowa",
  ],
};
const PL_CREDENTIALS: WordList = {
  words: [
    "hasl(?:o|a|e|u|em|om|ach)",
    "hasel",
    "kod (?:jednorazowy|weryfikacyjny|dostepu|bezpieczenstwa|odzyskiwania|sms|autoryzacyjny|pin)",
    "jednorazowy kod",
    "uwierzytelnian@ (?:dwuskladnikow@|dwuetapow@|wieloskladnikow@)",
    "(?:weryfikacj@|logowani@) (?:dwuetapow@|dwuskladnikow@)",
    "dwuetapow@",
    "klucz (?:api|odzyskiwania|dostepu|prywatny|sekretny)",
    "token (?:dostepu|api)",
    "dane (?:logowania|uwierzytelniajace)",
    "poswiadczeni@",
    "pytani(?:e|a|u) (?:bezpieczenstwa|pomocnicze|weryfikacyjne)",
    "(?:adres (?:e-?mail )?|e-?mail |numer (?:telefonu )?|telefon )odzyskiwania",
    "(?:metoda|sposob) logowania",
    "fraz(?:a|y|e) (?:hasla|odzyskiwania|seed)",
    "numer pin",
  ],
};
const PL_SECURITY: WordList = {
  words: [
    "ustawieni(?:a|e|ach|om) (?:bezpieczenstwa|prywatnosci|udostepniania|uprawnien|dostepu)",
    "bezpieczenstw(?:o|a|u) konta",
    "udostepni(?:j|c|anie) (?:wszystkim|publicznie|kazdemu)",
    "(?:zrob|uczyn|ustaw)@? (?:\\w+ ){0,2}publiczn@",
    "(?:rola|role|roli|uprawnieni(?:a|ach|ami)) (?:administratora|admina)",
    "(?:przyznaj|nadaj|nadac|przyznac|mianuj|ustaw|zrob)@? (?:\\w+ ){0,2}(?:administrator@|admin@)",
    "(?:usun|usunac|usuwanie|zamknij|zamknac|dezaktywuj|dezaktywowac|skasuj|skasowac)@? (?:moje |swoje |twoje |to |te )?konto",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Russian (folded: "й" is "и", "ё" is "е")
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const RU_PAYMENTS: WordList = {
  words: [
    "оплат@",
    "платеж@",
    "(?:за)?плат(?:ить|ите|им)",
    "плати",
    "заплат(?:и|ишь|ят)",
    "куп(?:ить|и|ите|им|лю|ишь|ят|ил|ила|ило)",
    "покуп(?:ка|ки|ку|ок|ать|аю|ай|айте)",
    "приобрет(?:ить|ите|ение|и|ай)",
    "(?:оформ(?:ить|ите|ление|ляю|ляйте)|подтверд(?:ить|ите|ждение|и)|размест(?:ить|ите)|размещение|отправ(?:ить|ьте|ка|ь)|завер(?:шить|шите|шение)|сдел(?:ать|айте)|подать|подайте|сформир(?:овать|уйте)) (?:(?:ваш|ваши|свой|этот|мой|весь|текущий|последний) )*заказ@",
    "(?:к оформлению (?:заказа|покупки)|к оплате|на кассу|к кассе|в кассу)",
    "(?:банковск|денежн|почтов|платежн|международн|быстр)@ перевод@",
    "перевод (?:денег|средств|денежных средств|на карту|на счет|с карты|по реквизитам)",
    "(?:перевести|переведи|переведите|переведу|перевожу|отправить|отправьте|отправь|пошлите|пошли|переслать) (?:\\w+ ){0,2}(?:деньги|денег|средства|средств|денежные|сумму|платеж@|плату|аванс|рубл@|доллар@|евро)",
    "перечисл@",
    "(?:банковские|платежные) реквизиты",
    "реквизиты (?:для )?(?:оплаты|платежа|перевода|банка|карты|счета)",
    "корреспондентск@ счет",
    "(?:банковск|кредитн|дебетов|предоплачен|виртуальн)@ карт@",
    "номер (?:банковской )?карты",
    "cvv2?",
    "cvc2?",
    "подписк@",
    "подписа(?:ться|лся|лась)|подписывайтесь|подпишитесь",
    "абонемент@",
    "абонентск@ плат@",
    ...renew(
      "продл(?:ить|ите|ение|и)|возобнов(?:ить|ите|ление)",
      "сейчас|автоматически",
      "подписк|тариф|план|членств|лицензи|домен|хостинг|абонемент",
    ),
    "автопродлен@",
    ...topUp(
      "пополн(?:ить|ите|ение|ения|и|яйте)",
      "баланс|счет|кошел(?:ек|ька|ьк)|карт|депозит|предоплат",
    ),
    "подарочн@ (?:карт@|сертификат@|купон@|ваучер@)",
    "платежн@ (?:данн@|адрес@|информаци@)",
    "биллинг@",
    "выставит@ счет@|выставлени@ счет@",
  ],
  tools: ["перевод", "подписка", "платеж", "оплата", "transaction"],
};
const RU_CREDENTIALS: WordList = {
  words: [
    "парол@",
    "кодов@ слов@",
    "учетн@ данн@",
    "данн@ для входа",
    "реквизит@ доступа",
    "ключ@? доступа",
    "api-?ключ@",
    "ключ@? api",
    "(?:секретн|закрыт|приватн)@ ключ@",
    "токен@? (?:доступа|api)",
    "одноразов@ (?:код@|парол@|пин@)",
    "код (?:подтверждения|проверки|доступа|безопасности|восстановления|из смс|из sms|авторизации|аутентификации|верификации|активации)",
    "(?:sms|смс)-?(?:код@|парол@)",
    "(?:двух|двуx|2|много|мульти)-?(?:факторн|этапн|шагов)@",
    "(?:проверк|верификаци|аутентификаци|подтвержден)@ в (?:два|2) (?:шага|этапа)",
    "(?:контрольн|секретн)@ вопрос@",
    "вопрос безопасности",
    "(?:резервн@ |запасн@ )?(?:почта|email|e-?mail|адрес|номер|телефон) для (?:восстановления|сброса)",
    "резервн@ (?:код@|ключ@)",
    "(?:сид|seed)-?фраз@",
    "(?:секретн|мнемоническ)@ фраз@",
    "фраз@ восстановления",
    "(?:способ|метод) входа",
    "пин-?код@",
  ],
};
const RU_SECURITY: WordList = {
  words: [
    "настройк@ (?:безопасности|конфиденциальности|доступа|общего доступа|приватности|разрешений|прав|защиты)",
    "безопасност@ (?:аккаунта|учетной записи)",
    "защит@ аккаунта",
    "(?:поделиться|делиться|открыть доступ|дать доступ|предоставить доступ|откройте доступ) (?:\\w+ ){0,2}(?:со всеми|всем|любому|любым|публично|для всех|кому угодно)",
    "(?:сделать|сделайте|сделай|делать) (?:\\w+ ){0,2}(?:публичн|общедоступн)@",
    "публичн@ доступ@",
    "общий доступ",
    "доступ (?:для всех|всем|по ссылке)",
    "(?:прав@|роль|роли) администратора",
    "админ(?:истратор@)?-?(?:прав@|роль)",
    "(?:назначить|назначьте|сделать|сделайте|дать|дайте|выдать|выдайте|предоставить|предоставьте|повысить|повысьте) (?:\\w+ ){0,3}(?:администратор@|админ@)",
    "(?:удалить|удалите|удали|закрыть|закройте|закрой|деактивировать|деактивируйте|отключить|отключите|заблокировать) (?:(?:мой|свой|ваш|этот|весь) )?(?:аккаунт@|акаунт@|учетн@ запис@)",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Turkish (folded: dotless i is i; ş ç ğ ö ü are s c g o u)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const TR_PAYMENTS: WordList = {
  words: [
    "odeme@",
    "ode(?:mek|yin|yiniz|dim|dik|yorum|yecek)",
    "simdi ode",
    "satin al@",
    "satinalma@",
    "alisveris@ (?:tamamla|bitir)@",
    "siparis@ (?:ver|onayl|tamamla|gonder|olustur)@",
    "siparis ver",
    "sepeti (?:onayl|tamamla)@",
    "kasa(?:ya|ye) (?:git|gec|ilerle)@",
    "havale@",
    "eft",
    "para (?:transfer|gonder|yolla|aktar|yatir)@",
    "(?:fon|banka) transfer@",
    "(?:kredi|banka|sanal|debit|on odemeli) kart@",
    "kart (?:numaras@|no|bilgi@)",
    "swift kodu",
    "cvv2?",
    "cvc2?",
    "abonelik@",
    "abone ol@",
    "abone ol",
    ...renew(
      "yenile@",
      "simdi|otomatik",
      "abonelik|aboneli|uyelik|uyeli|lisans|alan adi|domain|hosting|plan|paket|sozlesme",
    ),
    "bakiye (?:yukle|ekle)@",
    "(?:hesaba|cuzdana|karta) para (?:yukle|ekle|yatir)@",
    "kontor yukle@",
    "hediye (?:kart|cek|kupon|sertifika|kod)@",
    "fatura (?:adres|bilgi|detay)@",
    "faturalandirma@",
  ],
  tools: ["havale", "abonelik", "odeme", "hediye_kart", "bakiye"],
};
const TR_CREDENTIALS: WordList = {
  words: [
    "sifre(?:yi|si|m|mi|n|ni|ler|leri|de|den|ye|miz|niz|nizi|miz)?",
    // Bare "parola" is the Italian "word": only forms that carry a Turkish ending, or a Turkish verb or adjective.
    "parola(?:yi|ya|da|dan|nin|niz|nizi|miz|mi|ni|si|lar|lari|larin)",
    "(?:yeni|eski|mevcut|gecici|tek kullanimlik) parola",
    "parola (?:degistir|gir|sifirla|olustur|belirle|ayarla)@",
    "kimlik bilgi@",
    "giris (?:bilgi|yontem)@",
    "oturum acma (?:bilgi|yontem)@",
    "iki (?:faktorlu|adimli|asamali)@",
    "(?:2|cok) (?:adimli|faktorlu)@",
    "tek kullanimlik (?:kod|sifre|parola)@",
    "(?:dogrulama|onay|guvenlik|erisim|kurtarma|sms|giris) kod@",
    "kurtarma (?:e-?posta|telefon|anahtar|numara|adres)@",
    "guvenlik sor@",
    "api (?:anahtar@|key)",
    "(?:gizli|ozel|erisim) anahtar@",
    "erisim (?:belirte|token)@",
    "(?:kurtarma|gizli) (?:ifade|cumle)@",
    "pin (?:kod|numara)@",
  ],
};
const TR_SECURITY: WordList = {
  words: [
    "guvenlik ayar@",
    "(?:gizlilik|paylasim|izin|erisim|yetki) ayar@",
    "hesap guvenli@",
    "herkesle paylas@",
    "(?:herkese|kamuya) acik",
    "(?:yonetici|admin) (?:rol|yetki|izin|hak|erisim)@",
    "(?:yonetici|admin) (?:yap|ata|ekle|olarak ata)@",
    "hesa(?:p|bi|bimi|bini|binizi|biniz|bim|bin) (?:sil|kapat|devre disi birak|dondur|kaldir)@",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Japanese (substring)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const JA_PAYMENTS: WordList = {
  parts: [
    "支払",
    "決済",
    "課金",
    "入金",
    "振込",
    "振り込み",
    "送金",
    "購入",
    "買う",
    "買います",
    "注文を(?:確定|確認|完了|送信)",
    "注文(?:確定|完了|する)",
    "ご注文を(?:確定|確認|完了|送信)",
    "(?:カート|レジ)(?:に|へ)進",
    "お会計",
    "クレジットカード",
    "デビットカード",
    "プリペイドカード",
    "カード番号",
    "セキュリティコード",
    "cvv",
    "サブスクリプション",
    "サブスク(?:を)?(?:購入|登録|申し込み)",
    "定期購入",
    "購読",
    "自動更新",
    "(?:契約|サブスク(?:リプション)?|プラン|会員|メンバーシップ|ライセンス|ドメイン|ホスティング)(?:を|の)?(?:今すぐ)?(?:更新|延長)",
    "今すぐ更新",
    "チャージ",
    "ギフトカード",
    "ギフト券",
    "商品券",
    "請求先",
    "請求情報",
    "請求書払い",
  ],
  tools: ["送金", "振込", "決済", "支払"],
};
const JA_CREDENTIALS: WordList = {
  parts: [
    "パスワード",
    "パスコード",
    "パスフレーズ",
    "暗証番号",
    "認証情報",
    "認証コード",
    "確認コード",
    "認証キー",
    "ワンタイム(?:パスワード|コード|パス)",
    "(?:二|2)段階認証",
    "(?:二|2)要素認証",
    "多要素認証",
    "sms認証",
    "2fa",
    "リカバリー(?:コード|キー|メール|用メール|電話)",
    "復旧(?:コード|キー|用メール|用電話番号)",
    "回復(?:コード|用メール|用電話)",
    "秘密の質問",
    "セキュリティの質問",
    "api(?:キー|トークン)",
    "アクセストークン",
    "アクセスキー",
    "シークレットキー",
    "秘密鍵",
    "秘密キー",
    "合言葉",
    "(?:ログイン|サインイン)(?:方法|情報)",
  ],
};
const JA_SECURITY: WordList = {
  parts: [
    "セキュリティ(?:設定|の設定)",
    "アカウント(?:の)?セキュリティ",
    "共有(?:設定|の設定)",
    "プライバシー(?:設定|の設定)",
    "権限(?:設定|の設定)",
    "アクセス権(?:限)?の(?:設定|変更)",
    "全員に(?:公開|共有)",
    "誰でも(?:閲覧|アクセス|編集)できる",
    "一般公開",
    "公開に(?:する|設定|変更)",
    "リンクを知っている(?:全員|人)",
    "管理者(?:権限|ロール)",
    "管理者(?:に|として)(?:する|設定|昇格|任命|追加)",
    "管理者を追加",
    "アカウント(?:を)?(?:削除|閉鎖|無効化|停止|解約)",
    "退会",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Korean (substring: a particle is glued to the noun)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const KO_PAYMENTS: WordList = {
  parts: [
    "결제",
    "지불",
    "납부",
    "입금",
    "송금",
    "계좌~이체",
    "무통장",
    "구매",
    "구입",
    "주문~(?:을|를)?~(?:확정|완료|제출|접수|신청|진행)",
    "주문(?:을|를)?~확인하",
    "주문하(?:기|다|ㅂ니다|세요|십시오)",
    "바로~구매",
    "장바구니(?:로| 결제)",
    "신용~카드",
    "체크~카드",
    "직불~카드",
    "선불~카드",
    "카드~번호",
    "보안~코드",
    "cvv",
    "cvc",
    "구독",
    "정기~(?:결제|구독)",
    "자동~갱신",
    "(?:구독|멤버십|회원권|라이선스|도메인|호스팅|계약|요금제)(?:~을|~를)?~(?:갱신|연장)",
    "지금~갱신",
    "(?:잔액|포인트|머니|캐시|예치금|지갑|카드|계좌|크레딧)~충전",
    "충전~금액",
    "상품권",
    "기프트~카드",
    "기프티콘",
    "청구(?:서)?~(?:주소|정보)",
    "청구지",
  ],
  tools: ["결제", "송금", "구독", "이체"],
};
const KO_CREDENTIALS: WordList = {
  parts: [
    "비밀~번호",
    "패스워드",
    "암호(?!화)",
    "비번",
    "인증~(?:번호|코드)",
    "일회용~(?:비밀번호|코드|암호|패스워드)",
    "otp",
    "(?:2|두|이)~단계~(?:인증|확인|보안)",
    "이중~(?:인증|확인)",
    "다중~인증",
    "2차~인증",
    "2fa",
    "복구~(?:코드|키|이메일|전화|전화번호|구문)",
    "보안~(?:질문|코드|키|번호)",
    "자격~증명",
    "로그인~(?:정보|방법)",
    "api~(?:키|토큰)",
    "(?:액세스|접근)~토큰",
    "(?:비밀|개인)~키",
    "시드~구문",
    "핀~번호",
    "pin~번호",
  ],
};
const KO_SECURITY: WordList = {
  parts: [
    "보안~설정",
    "계정~보안",
    "공유~설정",
    "개인~정보~(?:보호~)?설정",
    "프라이버시~설정",
    "권한~설정",
    "접근~권한~(?:설정|변경)",
    "모든~사람(?:에게)?~(?:공유|공개)",
    "누구나~(?:볼|접근|편집|열람)",
    "전체~공개",
    "공개(?:로)?~(?:설정|변경|전환)",
    "링크가 있는~(?:모든~사람|누구나)",
    "관리자~(?:권한|역할)",
    "관리자(?:로|~(?:을|를))~(?:지정|설정|변경|승격|추가)",
    "계정~(?:을|를)?~(?:삭제|탈퇴|해지|폐쇄|비활성화)",
    "회원~탈퇴",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Chinese (simplified and traditional; substring)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const ZH_PAYMENTS: WordList = {
  parts: [
    "付款",
    "付费",
    "付費",
    "支付",
    "去结算",
    "去結算",
    "立即结算",
    "立即結算",
    "结算订单",
    "結算訂單",
    "下单",
    "下單",
    "(?:提交|确认|確認|完成)(?:订单|訂單)",
    "(?:立即)?(?:购买|購買)",
    "转账",
    "轉帳",
    "轉賬",
    "汇款",
    "匯款",
    "发红包",
    "發紅包",
    "信用卡",
    "借记卡",
    "借記卡",
    "储蓄卡",
    "儲蓄卡",
    "(?:预付|預付)卡",
    "卡号",
    "卡號",
    "安全码",
    "安全碼",
    "cvv",
    "订阅",
    "訂閱",
    "续费",
    "續費",
    "续订",
    "續訂",
    "自动续费",
    "自動續費",
    "充值",
    "储值",
    "儲值",
    "礼品卡",
    "禮品卡",
    "礼券",
    "禮券",
    "代金券",
    "(?:账单|賬單|帳單)(?:地址|信息|資訊|设置|設定)",
    "(?:计费|計費)(?:信息|資訊|地址)",
  ],
  tools: ["转账", "轉帳", "支付", "付款", "订阅"],
};
const ZH_CREDENTIALS: WordList = {
  parts: [
    "密码(?!学)",
    "密碼(?!學)",
    "口令",
    "验证码",
    "驗證碼",
    "动态码",
    "動態碼",
    "一次性(?:密码|密碼|验证码|驗證碼|口令)",
    "(?:二次|两步|兩步|双重|雙重|多重)(?:验证|驗證)",
    "(?:双|雙|多)(?:因素|因子)",
    "2fa",
    "(?:恢复|恢復)(?:码|碼|密钥|密鑰|邮箱|郵箱|邮件|郵件|电话|電話|手机|手機)",
    "(?:备用|備用)(?:码|碼)",
    "(?:安全问题|安全問題|密保问题|密保問題)",
    "api(?:密钥|密鑰|密碼|~key)",
    "(?:访问|訪問|存取)(?:令牌|权杖|權杖|密钥|密鑰|金鑰)",
    "令牌",
    "凭据",
    "憑據",
    "(?:登录|登錄|登入)(?:凭证|憑證|方式)",
    "私钥",
    "私鑰",
    "(?:助记词|助記詞)",
    "pin~(?:码|碼)",
  ],
};
const ZH_SECURITY: WordList = {
  parts: [
    "(?:安全)(?:设置|設定|設置)",
    "(?:账户|賬戶|帳戶|账号|帳號|帐号)(?:安全)",
    "(?:共享|分享)(?:设置|設定|設置)",
    "(?:隐私|隱私)(?:设置|設定|設置)",
    "(?:权限|權限)(?:设置|設定|設置)",
    "(?:公开给|公開給)所有人",
    "(?:对|對)所有人(?:公开|公開)",
    "所有人(?:可见|可見)",
    "(?:设为|設為|设置为|設置為|设置成|設置成)(?:公开|公開)",
    "(?:公开|公開)分享",
    "任何人都可以(?:查看|访问|訪問|编辑|編輯)",
    "(?:获得|取得|知道)(?:链接|連結)的(?:任何人|所有人)",
    "(?:管理员|管理員)(?:权限|權限|角色)",
    "(?:设为|設為|设置为|設置為|授予|提升为|提升為)(?:管理员|管理員)",
    "(?:添加|新增)(?:管理员|管理員)",
    "(?:删除|刪除|注销|註銷|关闭|關閉|停用)(?:我的|此|该|該)?(?:账户|賬戶|帳戶|账号|帳號|帐号)",
  ],
};

type Language = {
  payments: WordList;
  credentials: WordList;
  security: WordList;
};

/** The ten languages added by D131, in the order of the site's language list. */
export const SAFETY_LANGUAGES: Readonly<Record<string, Language>> = {
  de: {
    payments: DE_PAYMENTS,
    credentials: DE_CREDENTIALS,
    security: DE_SECURITY,
  },
  es: {
    payments: ES_PAYMENTS,
    credentials: ES_CREDENTIALS,
    security: ES_SECURITY,
  },
  fr: {
    payments: FR_PAYMENTS,
    credentials: FR_CREDENTIALS,
    security: FR_SECURITY,
  },
  ja: {
    payments: JA_PAYMENTS,
    credentials: JA_CREDENTIALS,
    security: JA_SECURITY,
  },
  ko: {
    payments: KO_PAYMENTS,
    credentials: KO_CREDENTIALS,
    security: KO_SECURITY,
  },
  pl: {
    payments: PL_PAYMENTS,
    credentials: PL_CREDENTIALS,
    security: PL_SECURITY,
  },
  pt: {
    payments: PT_PAYMENTS,
    credentials: PT_CREDENTIALS,
    security: PT_SECURITY,
  },
  ru: {
    payments: RU_PAYMENTS,
    credentials: RU_CREDENTIALS,
    security: RU_SECURITY,
  },
  tr: {
    payments: TR_PAYMENTS,
    credentials: TR_CREDENTIALS,
    security: TR_SECURITY,
  },
  zh: {
    payments: ZH_PAYMENTS,
    credentials: ZH_CREDENTIALS,
    security: ZH_SECURITY,
  },
};

const all = Object.values(SAFETY_LANGUAGES);

/** What `policy.ts` adds to each requirement. */
export const PAYMENTS_OTHER_LANGUAGES = compileWords(
  all.map((language) => language.payments),
);
export const CREDENTIALS_OTHER_LANGUAGES = compileWords(
  all.map((language) => language.credentials),
);
export const SECURITY_SETTINGS_OTHER_LANGUAGES = compileWords(
  all.map((language) => language.security),
);

/**
 * The text of `agent-freeduet/freeduet/safety_words_gen.py`: the compiled words above in Python's regular
 * expression syntax, for the cannot guard's mirror. `scripts/generate-safety-words-py.ts` writes it and
 * `tests/approvals-safety-languages.test.ts` fails when the file on disk is not this text.
 */
export function renderPythonMirror(): string {
  const python = (re: RegExp) =>
    re.source
      .replace(/\[\\p\{L\}\\p\{M\}\\p\{N\}\]/g, "[^\\W_]")
      .replace(/\[\\p\{L\}\\p\{M\}\]/g, "[^\\W\\d_]");
  const group = (name: string, compiled: CompiledWords) =>
    `${name} = [\n${compiled.inWords.map((re) => `    ${JSON.stringify(python(re))},`).join("\n")}\n]\n`;
  return (
    `# Generated by openbot/server/scripts/generate-safety-words-py.ts from approvals/safety-words.ts (D131).\n` +
    `# Do not edit by hand: run \`bun scripts/generate-safety-words-py.ts\` from openbot/server.\n` +
    `# Regular expressions for the text folded like \`safety-words.ts\` folds it (see cannot_guard._fold).\n\n` +
    group("PAYMENTS", PAYMENTS_OTHER_LANGUAGES) +
    "\n" +
    group("CREDENTIALS", CREDENTIALS_OTHER_LANGUAGES) +
    "\n" +
    group("SECURITY_SETTINGS", SECURITY_SETTINGS_OTHER_LANGUAGES)
  );
}
