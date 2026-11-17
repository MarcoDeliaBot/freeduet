/**
 * TR for `approval-text.ts` (docs/M1_PLAN.md D50). Plain, short, addressed to the person ("you").
 * Product and tool names stay as they are (FreeDuet, Gmail, Full access, Bot, Spam).
 *
 * Typed as a COMPLETE table: an id added to English alone stops `tsc` here.
 */
import type { CompleteApprovalTextTable } from "./approval-text";

export const APPROVAL_TEXT_TR: CompleteApprovalTextTable = {
  "view.sendEmail": "E-posta gönder",
  "view.sendMessage": "Mesaj gönder",
  "rule.title": "Posta kuralı oluştur",
  "rule.sentence": "Bundan sonra {when} gelen postalar için: {done}.",
  "rule.when.fromAddress": "{value} adresinden",
  "rule.when.fromDomain": "{value} alan adından",
  "rule.when.toAddress": "{value} adresine gönderilen",
  "rule.when.listId": "{value} listesinden",
  "rule.when.subjectContains": "konusunda {value} geçen",
  "rule.when.words": "konusunda veya göndereninde {value} sözcükleri geçen",
  "rule.does.label": "{names} etiketini koy",
  "rule.does.markRead": "okundu olarak işaretle",
  "rule.does.archive": "arşivle",
  "rule.does.spam": "Spam'e taşı",
  "rule.does.bin": "Çöp kutusuna taşı",
  "rule.does.nothing": "hiçbir şey yapma",
  "join.and": " ve ",
  "rule.happens":
    "FreeDuet bunu yeni postalara birkaç dakikada bir, yeniden sormadan, sen kapatana kadar uygular. Gmail filtresi değildir. Hiçbir zaman iletmez, yanıtlamaz ve kalıcı olarak silmez.",
  "rule.happens.existing":
    " Ayrıca Gelen Kutusu'ndaki eşleşen postalara bir kez uygulanır.",
  "rule.delete.title": "Posta kuralını sil",
  "rule.enable.title": "Posta kuralını aç",
  "rule.disable.title": "Posta kuralını kapat",
  "rule.delete.happens":
    "Kural kaldırılır ve yeni postalara uygulanmaz. Daha önce taşıdığı postalar olduğu yerde kalır.",
  "rule.enable.happens":
    "Kural, bundan sonra gelen postalara yeniden uygulanır.",
  "rule.disable.happens":
    "Kural yeni postalara uygulanmaz. Daha önce taşıdığı postalar olduğu yerde kalır.",
  "label.title.named": "{name} etiketini oluştur",
  "label.title": "Etiket oluştur",
  "label.happens":
    "Gmail'ine yeni, boş bir etiket eklenir. Hiçbir ileti değişmez.",
  "archive.title": {
    one: "{count} ileti arşivle",
    other: "{count} ileti arşivle",
  },
  "archive.happens":
    "Gelen Kutusu'ndan çıkar, etiketleriyle birlikte Tüm Postalar'da kalır. Hiçbir şey silinmez.",
  "spam.title": {
    one: "{count} ileti Spam'e taşı",
    other: "{count} ileti Spam'e taşı",
  },
  "spam.happens":
    "Spam klasörüne gider. Gmail, Spam'deki postaları yaklaşık 30 gün sonra siler; o zamana kadar geri taşıyabilirsin.",
  "bin.title": {
    one: "{count} ileti Çöp kutusuna taşı",
    other: "{count} ileti Çöp kutusuna taşı",
  },
  "bin.happens":
    "Çöp kutusuna gider ve orada yaklaşık 30 gün kalır. Oradan geri yükleyebilirsin. Sonra Gmail kalıcı olarak siler.",
  "mark.read.title": {
    one: "Okundu olarak işaretle: {count} ileti",
    other: "Okundu olarak işaretle: {count} ileti",
  },
  "mark.unread.title": {
    one: "Okunmadı olarak işaretle: {count} ileti",
    other: "Okunmadı olarak işaretle: {count} ileti",
  },
  "mark.happens":
    "Yalnızca okundu görünüp görünmedikleri değişir. Hiçbir şey silinmez.",
  "labels.add.one.title": {
    one: "{name} etiketini {count} ileti için ekle",
    other: "{name} etiketini {count} ileti için ekle",
  },
  "labels.add.many.title": {
    one: "{labels} etiketi {count} ileti için ekle",
    other: "{labels} etiketi {count} ileti için ekle",
  },
  "labels.remove.one.title": {
    one: "{name} etiketini {count} ileti üzerinden kaldır",
    other: "{name} etiketini {count} ileti üzerinden kaldır",
  },
  "labels.remove.many.title": {
    one: "{labels} etiketi {count} ileti üzerinden kaldır",
    other: "{labels} etiketi {count} ileti üzerinden kaldır",
  },
  "labels.change.title": {
    one: "{count} ileti için etiketleri değiştir",
    other: "{count} ileti için etiketleri değiştir",
  },
  "labels.happens":
    "Etiketler eklenir veya kaldırılır. Hiçbir ileti taşınmaz veya silinmez.",
  "messages.unreadable": {
    one: "Posta kutun şu an okunamadı, bu yüzden kimden geldikleri ve ne hakkında oldukları gösterilmiyor. Belirtilen: {count}.",
    other:
      "Posta kutun şu an okunamadı, bu yüzden kimden geldikleri ve ne hakkında oldukları gösterilmiyor. Belirtilen: {count}.",
  },
  "notFound.text": {
    one: "Belirtilen {total} iletiden {count} tanesi posta kutunda yok, bu yüzden bu istek olduğu gibi reddedilecek.",
    other:
      "Belirtilen {total} iletiden {count} tanesi posta kutunda yok, bu yüzden bu istek olduğu gibi reddedilecek.",
  },
  "reason.credentials":
    "Parola, kod, iki adımlı doğrulama, kurtarma kodu veya başka bir kimlik bilgisini değiştirmeyi her zaman sen yaparsın.",
  "reason.securitySettings":
    "Bir hesabın güvenlik, paylaşım veya erişim ayarlarını değiştirmeyi her zaman sen yaparsın.",
  "reason.payments":
    "Ödeme yapmayı, satın almayı veya para taşımayı her zaman sen yaparsın.",
  "reason.reviewer.credentials":
    "Otomatik kontrol, bunun bir parolayı, kodu, iki adımlı doğrulamayı veya başka bir kimlik bilgisini değiştirdiğini gördü. Bunu her zaman sen yaparsın.",
  "reason.reviewer.securitySettings":
    "Otomatik kontrol, bunun güvenlik, paylaşım veya erişim ayarlarını değiştirdiğini gördü. Bunu her zaman sen yaparsın.",
  "reason.reviewer.payments":
    "Otomatik kontrol, bunun ödeme yaptığını, satın aldığını veya para taşıdığını gördü. Bunu her zaman sen yaparsın.",
  "reason.fullAccess": "Bu üye için Full access açık.",
  "reason.fullAccessNoPayments": "Bu üye için ödemesiz Full access açık.",
  "reason.ruleHandsOff": "Bir kural bu tür işlemi sana bırakıyor.",
  "reason.ruleAsks": "Bir kural bu tür işlemden önce soruyor.",
  "reason.ruleAllows": "Bir kural bu tür işleme izin veriyor.",
  "reason.preApprovedMet": "Bu istekte tam olarak bu işlemi sen istedin.",
  "reason.preApprovedNotMet":
    "Bir kural buna yalnızca sen istersen izin verir ve bu seferki istek bunu içermiyordu.",
  "reason.askBeforeChanges":
    "Değişiklikler olmadan önce gözden geçirmek istedin.",
  "reason.noRule": "Hiçbir kural veya tercih bunun için soru sormuyor.",
  "reason.mailboxNotAsked":
    "Posta kutundaki bu değişikliği kendi mesajında istemedin, bu yüzden önce sana soruyor.",
  "reason.unattended":
    "Bu, senin gönderdiğin bir mesajdan değil, kendi kendine çalışan bir rutinden veya tetikleyiciden geldi, bu yüzden her zaman önce sana soruyor.",
  "reason.tooLongToReview":
    "Bu komut veya betik, otomatik denetçinin tamamını okuyamayacağı kadar uzun, bu yüzden karar sende.",
  "reason.automation":
    "Rutinler ve tetikleyiciler sonradan sen olmadan çalışır, bu yüzden birini kurmak, değiştirmek veya silmek her zaman önce sana soruyor.",
  "reason.setting":
    "Bir Bot sohbetten ayarlarından birini değiştirdiğinde, Full access açık da olsa kapalı da olsa her zaman önce sana soruyor.",
  "reason.remoteWrite":
    "Bunu, FreeDuet'in çalıştığı bilgisayarla eşleşmemiş bir tarayıcıdan gönderdin, bu yüzden Full access veya kayıtlı kuralların ne dediğine bakmadan her zaman önce sana soruyor. Bilgisayarda eşleşmiş bir tarayıcı eskisi gibi çalışır.",
  "reason.newEmail":
    "Yeni bir e-posta için her seferinde soruluyor. Kime gittiğine ve ne yazdığına bak, sonra buna izin ver veya reddet.",
  "reason.reviewerNone":
    "Hiçbir kontrol modeli ayarlanmamış, bu yüzden onayın gerekiyor.",
  "reason.reviewerInvalid": "Kontrolün yanıtı geçerli bir karar değildi.",
  "reason.reviewerUnreachable":
    "Kontrole ulaşılamadı ({error}), bu yüzden onayın gerekiyor.",
  "remote.answerSentence":
    "FreeDuet'in çalıştığı bilgisayarla eşleşmemiş bir tarayıcı, sıradan bir isteğe bir kez izin verebilir ya da reddedebilir. Bu istek bilgisayarda yanıtlanır, orada tamamını okuyabilirsin. Orada hâlâ bekliyor.",
};
