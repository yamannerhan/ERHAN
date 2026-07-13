import { isSecurityJobPosting } from "../src/lib/job-parsing.ts";

const shouldAccept = [
  ["Yenibosna", `YENİBOSNA DA BULUNAN OTEL PROJESİNE ÖGG KARTI OLAN ERKEK ÖZEL GÜVENLİK ALIMI YAPILACAKTIR 43.000 TL NET MAAŞ Tel: 05449529638`],
  ["Gebze", `GÜVENLİK GÖREVLİSİ ARANIYOR Gebze OSB Özel Güvenlik Görevlisi Net Maaş 40.750 TL 05539532408`],
  ["Yakup", `Hadımköy-Arnavutköy Özel Güvenlik Personeli bay personeller alınacaktır 45.000 tl 0533 361 34 49`],
  ["Gazali", `TUZLA DOUBLETREE BAYAN ÖZEL GÜVENLİK PERSONELİ ALIMI OGG KİMLİK 40.000 TL 0530 699 05 35`],
  ["beykent", `beykent metrobüs yakınında bay güvenlik görevlisi alınacaktır 2+2+2 05071178583`],
  ["Selçuk", `ATAŞEHİR ÖGG KİMLİK KARTLI ERKEK ÖZEL GÜVENLİK PERSONELİ ARANMAKTADIR 51.000 TL 0534 695 80 29`],
  ["Mahmut", `MAÇ GÜNÜ GÖREV Kimlikli özel güvenlik görevlisi alımı yapılacaktır 1.250 TL 0532 609 18 78`],
  ["Gokhan", `Güvenlik kimlik kartı olan Taksim butik AVM Maaş 44.500 0546 169 56 71`],
  ["TAV", `ÖZEL GÜVENLİK AMİRİ ARANIYOR 51.000 TL CV Yollayabilirsiniz 0537 043 66 31`],
  ["coşkun avm", `Esenyurt City Centr Avm görevlendirmek üzere Bay çalışma arkadaşları aranmaktadır 44000 + 8250 ticket 05424013961`],
  ["ARSEN", `Özel Güvenlik Kimlik Kartına sahip Erkek ÖGG personeli alımı yapılacaktır 51.000 TL 0544 949 34 71`],
  ["Silahlı", `BAY Silahlı Güvenlik Görevlisine ihtiyaç vardır 55.000 TL 0546 778 34 42`],
];

const shouldReject = [
  ["temizlik", `ACİL KADIN TEMİZLİK GÖREVLİSİ ARANIYOR Başakşehir 1.500 TL 0549 430 40 20`],
  ["makineci", `MALTEPE AVM BAY MAKİNECİ TEMİZLİK PERSONELİ 51.786 TL 05456721097`],
  ["iş arıyorum", `Ankarada özel güvenlik işi arıyorum 3 yıl deneyimim var`],
  ["dm", `Bana market mağaza projesi lazım varsa dm`],
  ["sponsor", `Cazın Rengi #sponsorlu Garanti BBVA`],
  ["merhaba", `Merhaba nasıl başvuru yaparım`],
  ["bakım", `Evde bulunan erkek hastamız için kadın bakım personeli aranmaktadır 65.000 TL 0537 972 44 60`],
];

let failed = 0;
for (const [name, text] of shouldAccept) {
  if (!isSecurityJobPosting(text)) { console.error("FAIL accept:", name); failed++; }
}
for (const [name, text] of shouldReject) {
  if (isSecurityJobPosting(text)) { console.error("FAIL reject:", name); failed++; }
}
console.log(failed === 0 ? "ALL OK" : `${failed} failures`);
process.exit(failed === 0 ? 0 : 1);
