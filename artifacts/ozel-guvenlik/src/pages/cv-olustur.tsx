import React, { useState, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronRight, ChevronLeft, Download, Eye, Plus, Trash2, Upload, Check, Wand2, Sparkles, UserCircle } from "lucide-react";

// ── Tipler ────────────────────────────────────────────────────────────────────
interface Experience { id: number; title: string; company: string; period: string; desc: string; }
interface Skill      { id: number; name: string; level: number; }
interface Certificate { id: number; name: string; year: string; }
interface CVData {
  ad: string; soyad: string; pozisyon: string; dogumTarihi: string;
  medeniDurum: string; boy: string; kilo: string; adres: string;
  telefon: string; email: string; hakkimda: string;
  deneyimler: Experience[]; yetenekler: Skill[];
  sertifikalar: Certificate[]; hobiler: string;
  ozellikler: string[]; motto: string;
}

const INITIAL: CVData = {
  ad: "", soyad: "", pozisyon: "Güvenlik Görevlisi", dogumTarihi: "",
  medeniDurum: "Bekar", boy: "", kilo: "", adres: "", telefon: "", email: "",
  hakkimda: "", deneyimler: [{ id: 1, title: "", company: "", period: "", desc: "" }],
  yetenekler: [{ id: 1, name: "", level: 4 }], sertifikalar: [],
  hobiler: "", ozellikler: [], motto: "",
};

const POZISYONLAR = [
  "Güvenlik Görevlisi", "Başgüvenlik", "VIP Koruma", "Silahlı Güvenlik",
  "Güvenlik Şefi", "Özel Dedektif", "Elektronik Güvenlik", "Güvenlik Danışmanı",
  "Fabrika / Tesis Güvenlik", "Sahil Güvenlik",
];

const OZELLIK_LISTESI = [
  "Disiplinli", "Güvenilir", "Ekip Uyumlu", "Sorumluluk Sahibi", "Çalışkan",
  "Güler Yüzlü", "Planlı & Organize", "İletişime Açık", "Çabuk Karar Veren",
  "Analitik Düşünen", "Güçlü İrade", "Öz Denetimli",
];

// ── Geniş AI İçerik Veritabanı ───────────────────────────────────────────────
type PozStr = { [k: string]: string[] };
type PozExp = { [k: string]: Omit<Experience,"id">[] };
type PozCert = { [k: string]: Omit<Certificate,"id">[] };

const SUMMARIES: PozStr = {
  "Güvenlik Görevlisi": [
    "Disiplinli, sorumluluk sahibi ve güvenilir bir özel güvenlik profesyoneliyim. Görevlerimi özveriyle yerine getirmeye özen gösteririm. Yeni bilgiler öğrenmeye açık, güvenilir ve çalışkan bir bireyim. Ekip çalışmasına uyumlu, stres altında soğukkanlılığını koruyan bir güvenlik uzmanıyım.",
    "Özel güvenlik sektöründe yılların verdiği deneyimle, kurumların ve bireylerin can ve mal güvenliğini sağlamayı hayatımın misyonu olarak benimsedim. Dürüstlük, titizlik ve profesyonellik ilkelerimden hiçbir zaman taviz vermem. Her görevde yüzde yüz performans sergilerim.",
    "Güvenlik alanında uzun soluklu bir kariyere sahip, disiplin ve sadakati her şeyin üstünde tutan bir güvenlik profesyoneliyim. Tehdit analizi, önleyici güvenlik uygulamaları ve kriz yönetiminde edindiğim deneyimleri her görevde etkin şekilde kullanırım. Ekibimle uyum içinde, bireysel olarak da güçlü biçimde çalışabilirim.",
    "Güvenlik protokollerine tam uyum, hızlı karar alma ve soğukkanlılık benim güçlü yönlerimdir. Uzun vardiyalarda bile dikkatimi ve performansımı zirveye taşıyan disipliniyle çalışırım. Kuruma değer katmayı ve güvenilir bir ekip üyesi olmayı görev bilirim.",
    "Vatani görevimi onurla tamamladıktan sonra özel güvenlik sektöründe kariyer yapma kararı aldım. Askeri disiplini ve özel güvenlik eğitimlerini harmanladığım çalışma anlayışımla, kurumların tüm güvenlik ihtiyaçlarını eksiksiz karşılarım.",
  ],
  "Başgüvenlik": [
    "Güvenlik sektöründe liderlik deneyimine sahip, ekibimi etkin yöneten ve güvenlik protokollerini başarıyla uygulayan bir profesyonelim. Sorunları hızlı analiz eder, kriz anlarında doğru kararlar alırım. Vardiya planlaması ve personel koordinasyonu konusunda yetkin ve deneyimliyim.",
    "Başgüvenlik amiri olarak görevlendirildiğim her kurumda; ekip motivasyonunu artıran, güvenlik süreçlerini optimize eden ve olaylara anında müdahale eden bir liderlik anlayışı benimsedim. Personelimi sürekli geliştirmeyi ve kuruma değer katmayı önceliğim olarak görürüm.",
    "Güçlü iletişim becerileri, kararlılık ve disiplin beni başarılı bir güvenlik amiri yapan temel özelliklerdir. Vardiya organizasyonu, personel değerlendirmesi ve raporlamada güçlü bir sicile sahibim. Her koşulda sakin, sistematik ve etkili yönetim tarzımı korururum.",
  ],
  "VIP Koruma": [
    "VIP koruma alanında uzmanlaşmış, taktiksel eğitim almış ve gizlilik ilkelerine tam bağlı bir koruma profesyoneliyim. Müvekkillerin fiziksel güvenliğini her koşulda sağlar; tehdit değerlendirmesi, güzergah planlaması ve acil tahliye prosedürlerini eksiksiz uygularım.",
    "Özel koruma görevlerinde fiziksel yeterlilik, keskin gözlem ve hızlı karar verme benim temel güçlerimdir. Müvekkille sıkı iletişim kurarak güven ortamı oluşturur, olası riskleri önceden tespit ederek önlem alırım. Gizlilik ve sadakat her zaman önceliğimdir.",
    "Üst düzey yöneticilerden sanatçılara, iş insanlarından devlet yetkililerine kadar pek çok müvekkile yakın koruma hizmeti verdim. Protokol bilgisi, ofansif sürüş teknikleri ve takım koordinasyonunda güçlü bir alt yapıya sahibim.",
  ],
  "Silahlı Güvenlik": [
    "Silahlı güvenlik ruhsatına sahip, silah kullanımı ve taktik güvenlik protokolleri konusunda yetkin bir güvenlik uzmanıyım. Yasalara ve kurumsal kurallara tam uyum içinde, sorumlu ve disiplinli biçimde görev yaparım. Tehdit anında hızlı ve doğru müdahale konusunda iyi eğitim almış bir profesyonelim.",
    "Silahlı koruma operasyonlarında görev yapmış, taktiksel eğitim almış, disiplinli bir güvenlik profesyoneliyim. Kritik altyapı ve özel mülk korumasında edindiğim deneyimleri, yüksek risk ortamlarında etkin şekilde kullanırım.",
  ],
  "Güvenlik Şefi": [
    "Güvenlik operasyonlarını planlama, koordine etme ve yönetme konusunda kapsamlı deneyime sahip, stratejik düşünen bir güvenlik yöneticisiyim. Ekip motivasyonu, bütçe optimizasyonu ve operasyonel verimlilik önceliklerimdir.",
    "Büyük ölçekli güvenlik departmanlarını yönetmiş, kriz simülasyonları tasarlamış ve güvenlik altyapısını modernize etmiş bir güvenlik lideriyim. İnsan yönetimi, teknoloji entegrasyonu ve stratejik planlama konularında güçlü bir sicilim var.",
  ],
  "Elektronik Güvenlik": [
    "IP CCTV, alarm sistemleri, erişim kontrol ve otomasyon entegrasyonu konusunda uzmanlaşmış bir elektronik güvenlik teknikeri olarak, müşteri tesislerinde güvenilir çözümler sunarım. Proje tasarımından kuruluma, bakımdan arıza giderimine kadar tüm süreçlerde aktif rol alırım.",
    "Güvenlik teknolojilerindeki hızlı gelişime ayak uyduran, sektörün önde gelen marka ve sistemlerine hakim bir elektronik güvenlik uzmanıyım. Sistem entegrasyonu, yazılım konfigürasyonu ve uzaktan izleme alanlarında güçlü teknik bilgiye sahibim.",
  ],
  "Özel Dedektif": [
    "Sigorta soruşturması, gizli gözetleme, kayıp kişi takibi ve kurumsal araştırma alanlarında deneyimli, analitik düşünen bir özel dedektifim. Delil toplama, kayıt ve raporlamada titiz çalışırım; gizlilik ve mesleki etik her zaman önceliğimdir.",
    "Karmaşık soruşturma vakalarını çözmek için güçlü gözlem yetenekleri, teknik araçlar ve saha deneyimimi bir arada kullanırım. Müvekkillerime güvenilir, kanıta dayalı sonuçlar sunmayı taahhüt ederim.",
  ],
  "Güvenlik Danışmanı": [
    "Risk analizi, güvenlik denetimi ve kurumsal politika geliştirme alanlarında uzmanlaşmış, stratejik bakış açısına sahip bir güvenlik danışmanıyım. Müşterilerimin güvenlik açıklarını tespit eder, bütüncül ve sürdürülebilir çözümler sunarım.",
  ],
  "Fabrika / Tesis Güvenlik": [
    "Fabrika, OSB ve endüstriyel tesislerde güvenlik protokollerini eksiksiz uygulayan, iş güvenliği standartlarına hakim bir güvenlik profesyoneliyim. Tesis güvenliği, yangın önleme, acil tahliye ve çalışan emniyeti konularında deneyimliyim.",
    "Büyük tesislerin güvenlik yönetiminde edindiğim deneyimle, hem teknik güvenlik sistemlerine hem de personel yönetimine hakimiyet sağladım. İSG standartları, vardiya planlaması ve olay raporlamasında güçlü bir sicile sahibim.",
  ],
  "Sahil Güvenlik": [
    "Kıyı ve deniz güvenliği operasyonlarında görev yapmış, su kurtarma, deniz devriyesi ve kaçakçılık önleme konularında eğitim almış bir güvenlik uzmanıyım. Deniz trafiği denetimi ve acil müdahale protokollerinde güçlü bir deneyime sahibim.",
  ],
};

const EXPERIENCES: PozExp = {
  "Güvenlik Görevlisi": [
    { title: "Kıdemli Güvenlik Görevlisi", company: "ProGüvenlik A.Ş.", period: "2022 – Halen", desc: "Tesis giriş-çıkış kontrolü, CCTV izleme sistemi operasyonu ve olay raporlaması. Acil müdahale protokollerinin uygulanması ve yeni personel eğitimlerine destek verilmesi." },
    { title: "Güvenlik Görevlisi", company: "Güven AVM / Alışveriş Merkezi", period: "2019 – 2022", desc: "Alışveriş merkezi müşteri ve personel güvenliğinin sağlanması. Kamera izleme, kayıp önleme prosedürleri, yangın güvenliği protokollerinin titizlikle uygulanması." },
    { title: "Sözleşmeli Er", company: "Türk Silahlı Kuvvetleri", period: "2015 – 2019", desc: "Askeri disiplin çerçevesinde görev yapıldı. Güvenlik ve koruma görevleri icra edildi. Ekip çalışmasına uyum ve görev bilinci yüksek düzeyde sergilendi." },
  ],
  "Başgüvenlik": [
    { title: "Başgüvenlik Amiri", company: "Metropol Güvenlik A.Ş.", period: "2020 – Halen", desc: "30 kişilik güvenlik ekibinin yönetimi, vardiya planlaması ve haftalık güvenlik raporlarının hazırlanması. Personel eğitimi ve motivasyon programlarının koordinasyonu." },
    { title: "Kıdemli Güvenlik Görevlisi", company: "Akıncı Güvenlik Ltd.", period: "2016 – 2020", desc: "Büyük ölçekli tesis güvenliğinin tek sorumlusu olarak devriye yönetimi, CCTV izleme ve acil müdahale operasyonları başarıyla yönetildi." },
    { title: "Sözleşmeli Uzman Çavuş", company: "Türk Silahlı Kuvvetleri", period: "2010 – 2016", desc: "Birlik komutanlığı bünyesinde güvenlik ve istihbarat görevleri. Personel liderliği ve operasyonel planlama konularında kapsamlı deneyim edinildi." },
  ],
  "VIP Koruma": [
    { title: "Yakın Koruma Uzmanı", company: "Elite Koruma & Güvenlik A.Ş.", period: "2021 – Halen", desc: "Üst düzey iş insanları ve kamu görevlilerinin yakın koruma hizmetleri. Risk değerlendirmesi, güzergah analizi ve güvenli ulaşım operasyonlarının planlanması ve icra edilmesi." },
    { title: "VIP Koruma Görevlisi", company: "Prestij Güvenlik Ltd.", period: "2017 – 2021", desc: "Sanatçı ve sporcuların etkinlik ve seyahat süreçlerinde yakın koruma hizmetleri. Kalabalık yönetimi, medya bariyeri ve olay yönetiminde başarılı müdahaleler." },
    { title: "Sözleşmeli Uzman Çavuş", company: "Türk Silahlı Kuvvetleri", period: "2011 – 2017", desc: "Koruma görevi, taktiksel eğitim, silah kullanım atışları ve birlik güvenliği. Özel kuvvetler desteği kapsamında ileri gözetleme ve keşif operasyonları." },
  ],
  "Silahlı Güvenlik": [
    { title: "Silahlı Güvenlik Uzmanı", company: "Türk Telekom / Enerji Altyapı Tesisi", period: "2021 – Halen", desc: "Kritik enerji altyapısının 7/24 silahlı koruması. Tehdit değerlendirmesi, olay raporlaması ve silahlı müdahale prosedürlerinin eksiksiz uygulanması." },
    { title: "Silahlı Güvenlik Görevlisi", company: "Banka ve Finans Kurumu", period: "2017 – 2021", desc: "Şube güvenliği, değerli evrak ve nakit transferi koruma operasyonları. Yüksek riskli nakit taşıma konvoylarında görev alınması." },
    { title: "Uzman Çavuş", company: "Türk Silahlı Kuvvetleri", period: "2011 – 2017", desc: "Piyade birliği bünyesinde silahlı güvenlik ve koruma görevleri. Ağır silah operatörlüğü ve taktik eğitimleri başarıyla tamamlandı." },
  ],
  "Güvenlik Şefi": [
    { title: "Güvenlik Müdürü", company: "Grand Plaza Otel & AVM Kompleksi", period: "2019 – Halen", desc: "50+ kişilik güvenlik departmanının yönetimi. Yıllık güvenlik bütçesinin hazırlanması ve optimize edilmesi. Tesis risk analizi, kriz yönetimi planı ve acil müdahale protokolleri." },
    { title: "Başgüvenlik Amiri", company: "Sanayi Bölgesi / OSB Yönetim Birliği", period: "2014 – 2019", desc: "15 güvenlik noktasında 60 personelin operasyonel koordinasyonu. Güvenlik altyapısının modernizasyonu ve dijital izleme sistemlerine geçiş projesinin liderliği." },
    { title: "Subay", company: "Emniyet Müdürlüğü", period: "2008 – 2014", desc: "Toplumsal düzen ve kamu güvenliği operasyonlarında komuta görevi. Özel operasyonlar birimi koordinatörlüğü ve personel eğitim programları liderliği." },
  ],
  "Elektronik Güvenlik": [
    { title: "Kıdemli Elektronik Güvenlik Teknisyeni", company: "Securtec Güvenlik Sistemleri A.Ş.", period: "2020 – Halen", desc: "200+ kamera IP CCTV sistemleri, dijital kayıt altyapısı, biyometrik erişim kontrol ve entegre alarm sistemleri kurulumu ve bakımı. Büyük ölçekli proje yönetimi." },
    { title: "Güvenlik Sistemleri Teknisyeni", company: "Hikvision / Dahua Yetkili Bayi", period: "2016 – 2020", desc: "Konut, iş yeri ve fabrika projelerinde güvenlik sistemi tasarımı ve sahaya kurulum çalışmaları. Arıza tespiti ve uzaktan destek hizmetleri." },
    { title: "Bilişim Teknisyeni", company: "Teknoloji ve BT Firması", period: "2013 – 2016", desc: "Ağ altyapısı, sunucu bakımı ve güvenlik yazılımları yönetimi. Müşteri teknik destek operasyonları ve saha servis hizmetleri." },
  ],
  "Özel Dedektif": [
    { title: "Lisanslı Özel Dedektif", company: "Araştırma & Soruşturma Bürosu", period: "2019 – Halen", desc: "Sigorta dolandırıcılığı soruşturmaları, kayıp kişi araştırmaları, sadakat testleri ve kurumsal araştırma vakaları. Delil toplama, fotoğraflı gözetleme ve mahkemeye delil raporu hazırlama." },
    { title: "Kurumsal Güvenlik Araştırmacısı", company: "Büyük Ölçekli Holding", period: "2015 – 2019", desc: "İç soruşturmalar, personel güvenilirlik araştırmaları, ticari gizlilik ihlali soruşturmaları ve muhasebe anomalisi araştırmaları." },
    { title: "Polis Memuru", company: "Türkiye Polis Teşkilatı", period: "2009 – 2015", desc: "Suç soruşturması, tanık ifadesi alma ve delil yönetimi konularında geniş deneyim. Organize suç ve ekonomik suç birimleri operasyonlarına katılım." },
  ],
  "Güvenlik Danışmanı": [
    { title: "Kıdemli Güvenlik Danışmanı", company: "GüvenDanış & Ortakları", period: "2018 – Halen", desc: "20+ kuruma güvenlik risk analizi, güvenlik denetimi ve kapsamlı güvenlik politikası geliştirme danışmanlığı. ISO 27001 uyumluluk süreçlerinde liderlik." },
    { title: "Güvenlik Operasyon Direktörü", company: "Uluslararası Güvenlik Firması", period: "2013 – 2018", desc: "Türkiye geneli 15 lokasyonda güvenlik operasyonu yönetimi. Uluslararası güvenlik standartlarına uyum projeleri ve personel sertifikasyon programları." },
    { title: "Emniyet Müdür Yardımcısı", company: "Emniyet Müdürlüğü", period: "2006 – 2013", desc: "Kamu güvenlik stratejileri geliştirme, operasyonel koordinasyon ve kriz yönetimi komuta görevi." },
  ],
  "Fabrika / Tesis Güvenlik": [
    { title: "Tesis Güvenlik Amiri", company: "Otomotiv Fabrikası / Büyük Üretim Tesisi", period: "2021 – Halen", desc: "2000+ çalışanlı fabrikada 20 kişilik güvenlik ekibinin yönetimi. Personel ve tesis güvenlik protokolleri, yangın önleme ve acil tahliye tatbikatları." },
    { title: "Güvenlik Görevlisi", company: "OSB / Organize Sanayi Bölgesi", period: "2017 – 2021", desc: "Endüstriyel tesis giriş-çıkış kontrol sistemi yönetimi, araç ve yük denetimi, kamera izleme ve güvenlik raporlaması." },
    { title: "Sözleşmeli Er", company: "Türk Silahlı Kuvvetleri", period: "2012 – 2017", desc: "Tesis koruma, depo güvenliği ve cephane denetimi görevleri. Disiplin, sorumluluk ve titizlik her görevde ön planda tutuldu." },
  ],
  "Sahil Güvenlik": [
    { title: "Sahil Güvenlik Botu Personeli", company: "Sahil Güvenlik Komutanlığı", period: "2017 – Halen", desc: "Kıyı ve açık deniz devriyesi, arama-kurtarma operasyonları, kaçakçılık önleme ve deniz trafiği denetimi. 15 kurtarma operasyonuna aktif katılım." },
    { title: "Deniz Polisi Memuru", company: "Emniyet Müdürlüğü Deniz Şubesi", period: "2013 – 2017", desc: "Liman ve kıyı bölgelerinde güvenlik operasyonları, tekne denetimi ve kaçakçılık soruşturmaları. Uluslararası deniz güvenliği tatbikatlarına katılım." },
    { title: "Askeri Denizci", company: "Türk Deniz Kuvvetleri", period: "2007 – 2013", desc: "Deniz devriyesi, savaş tatbikatları ve liman koruma görevleri. Deniz kurtarma ekipmanları kullanımı sertifikasyonu tamamlandı." },
  ],
};

const CERTS: PozCert = {
  "Güvenlik Görevlisi": [
    { name: "Özel Güvenlik Temel Eğitimi Sertifikası", year: "2019" },
    { name: "İlk Yardım ve Acil Müdahale Sertifikası", year: "2021" },
    { name: "Yangın Güvenliği Eğitimi", year: "2022" },
  ],
  "Başgüvenlik": [
    { name: "Özel Güvenlik Temel Eğitimi Sertifikası", year: "2015" },
    { name: "Liderlik ve Yönetim Eğitimi", year: "2018" },
    { name: "İlk Yardım Eğitmeni Sertifikası", year: "2020" },
  ],
  "VIP Koruma": [
    { name: "VIP Koruma Uzmanı Sertifikası", year: "2018" },
    { name: "Savunma Sürüşü Eğitimi", year: "2019" },
    { name: "Özel Güvenlik Temel Eğitimi", year: "2017" },
  ],
  "Silahlı Güvenlik": [
    { name: "Silahlı Güvenlik Görevlisi Ruhsatı", year: "2018" },
    { name: "Özel Güvenlik Temel Eğitimi", year: "2017" },
    { name: "Taktik Atış Eğitimi Sertifikası", year: "2020" },
  ],
  "Güvenlik Şefi": [
    { name: "Güvenlik Yöneticisi Sertifikası", year: "2016" },
    { name: "Kriz Yönetimi Eğitimi", year: "2018" },
    { name: "ISO 31000 Risk Yönetimi", year: "2020" },
  ],
  "Elektronik Güvenlik": [
    { name: "Hikvision Yetkili Teknisyen Sertifikası", year: "2019" },
    { name: "Erişim Kontrol Sistemleri Sertifikası", year: "2020" },
    { name: "IP Video Gözetleme Uzmanı", year: "2021" },
  ],
  "Özel Dedektif": [
    { name: "Özel Dedektiflik Lisansı", year: "2019" },
    { name: "Dijital Adli Bilişim Eğitimi", year: "2021" },
    { name: "Sigorta Soruşturması Sertifikası", year: "2020" },
  ],
  "Güvenlik Danışmanı": [
    { name: "ISO 27001 Baş Denetçi Sertifikası", year: "2018" },
    { name: "Risk Analizi Uzmanlık Belgesi", year: "2019" },
    { name: "Güvenlik Yönetimi Lisansı", year: "2016" },
  ],
  "Fabrika / Tesis Güvenlik": [
    { name: "Özel Güvenlik Temel Eğitimi", year: "2018" },
    { name: "İSG Temel Eğitim Sertifikası", year: "2020" },
    { name: "Yangın Söndürme Operatörü Belgesi", year: "2021" },
  ],
  "Sahil Güvenlik": [
    { name: "Deniz Kurtarma Operatörü Sertifikası", year: "2018" },
    { name: "Özel Güvenlik Temel Eğitimi", year: "2017" },
    { name: "İlk Yardım ve Boğulma Müdahalesi", year: "2020" },
  ],
};

const HOBBIES: { [k: string]: string } = {
  "Güvenlik Görevlisi": "Balık Tutmak, Müzik, Araba Sürme",
  "Başgüvenlik": "Spor Yapmak, Okumak, Takım Sporları",
  "VIP Koruma": "Dövüş Sanatları, Spor Atıcılık, Yüzme",
  "Silahlı Güvenlik": "Spor Atıcılık, Fitness, Açık Hava",
  "Güvenlik Şefi": "Golf, Okumak, Strateji Oyunları",
  "Elektronik Güvenlik": "Elektronik, Fotoğrafçılık, Teknoloji",
  "Özel Dedektif": "Satranç, Okumak, Fotoğrafçılık",
  "Güvenlik Danışmanı": "Okumak, Seyahat, Golf",
  "Fabrika / Tesis Güvenlik": "Spor, Bahçecilik, Araba Bakımı",
  "Sahil Güvenlik": "Dalış, Balık Tutmak, Yüzme",
};

const MOTTOS: { [k: string]: string } = {
  "Güvenlik Görevlisi": "GÜVEN, SADAKAT VE ÇALIŞKANLIK EN BÜYÜK GÜCÜMDÜR.",
  "Başgüvenlik": "GÜÇLÜ LİDERLİK, SAĞLAM GÜVENLİK.",
  "VIP Koruma": "HAYAT KIYMETLİDİR — KORUMAK ONURDUR.",
  "Silahlı Güvenlik": "KARARLIYIM, DİSİPLİNLİYİM, GÜVENİLİRİM.",
  "Güvenlik Şefi": "STRATEJİK DÜŞÜN, GÜVENLİ YÖNET.",
  "Elektronik Güvenlik": "TEKNOLOJİ İLE GÜVENLİĞİ GELECEĞE TAŞIYORUM.",
  "Özel Dedektif": "GERÇEK HER ZAMAN ORTAYA ÇIKAR.",
  "Güvenlik Danışmanı": "GÜVENLİK BİR YATIRIM, RİSK BİR SEÇİMDİR.",
  "Fabrika / Tesis Güvenlik": "GÜVENLİ TESİS, BAŞARILI ÜRETİM.",
  "Sahil Güvenlik": "DENİZLER GÜVENDE — VATANI KORUYORUM.",
};

const OZELLIKLER_MAP: { [k: string]: string[] } = {
  "Güvenlik Görevlisi": ["Disiplinli", "Güvenilir", "Ekip Uyumlu", "Sorumluluk Sahibi", "Güler Yüzlü", "Planlı & Organize", "İletişime Açık"],
  "Başgüvenlik": ["Disiplinli", "Güvenilir", "Sorumluluk Sahibi", "Planlı & Organize", "İletişime Açık", "Güçlü İrade", "Ekip Uyumlu"],
  "VIP Koruma": ["Disiplinli", "Güçlü İrade", "Çabuk Karar Veren", "Güvenilir", "Öz Denetimli", "Sorumluluk Sahibi", "Analitik Düşünen"],
  "Silahlı Güvenlik": ["Disiplinli", "Güvenilir", "Güçlü İrade", "Sorumluluk Sahibi", "Çabuk Karar Veren", "Öz Denetimli", "Ekip Uyumlu"],
  "Güvenlik Şefi": ["Disiplinli", "Analitik Düşünen", "Planlı & Organize", "İletişime Açık", "Sorumluluk Sahibi", "Güvenilir", "Güçlü İrade"],
  "Elektronik Güvenlik": ["Analitik Düşünen", "Planlı & Organize", "Güvenilir", "Çalışkan", "İletişime Açık", "Sorumluluk Sahibi", "Öz Denetimli"],
  "Özel Dedektif": ["Analitik Düşünen", "Öz Denetimli", "Güvenilir", "Güçlü İrade", "Disiplinli", "Planlı & Organize", "Çabuk Karar Veren"],
  "Güvenlik Danışmanı": ["Analitik Düşünen", "İletişime Açık", "Planlı & Organize", "Sorumluluk Sahibi", "Güvenilir", "Ekip Uyumlu", "Disiplinli"],
  "Fabrika / Tesis Güvenlik": ["Disiplinli", "Güvenilir", "Çalışkan", "Ekip Uyumlu", "Sorumluluk Sahibi", "Planlı & Organize", "Güler Yüzlü"],
  "Sahil Güvenlik": ["Disiplinli", "Güvenilir", "Güçlü İrade", "Ekip Uyumlu", "Çabuk Karar Veren", "Sorumluluk Sahibi", "Öz Denetimli"],
};

const SKILLS_MAP: { [k: string]: { name: string; level: number }[] } = {
  "Güvenlik Görevlisi": [{ name: "Güvenlik Protokolleri", level: 5 }, { name: "İlk Yardım", level: 4 }, { name: "CCTV İzleme", level: 4 }, { name: "Rapor Yazımı", level: 3 }, { name: "Stres Yönetimi", level: 5 }],
  "Başgüvenlik": [{ name: "Ekip Yönetimi", level: 5 }, { name: "Vardiya Planlama", level: 5 }, { name: "Güvenlik Protokolleri", level: 5 }, { name: "Raporlama", level: 4 }, { name: "Kriz Yönetimi", level: 4 }],
  "VIP Koruma": [{ name: "Taktiksel Düşünce", level: 5 }, { name: "VIP Protokolü", level: 5 }, { name: "Savunma Sanatları", level: 4 }, { name: "Araç Güzergah Takibi", level: 4 }, { name: "Risk Analizi", level: 5 }],
  "Silahlı Güvenlik": [{ name: "Silah Kullanımı", level: 5 }, { name: "Güvenlik Protokolleri", level: 5 }, { name: "Taktik Hareket", level: 4 }, { name: "İlk Yardım", level: 4 }, { name: "Tehdit Değerlendirme", level: 5 }],
  "Güvenlik Şefi": [{ name: "Liderlik", level: 5 }, { name: "Stratejik Planlama", level: 5 }, { name: "Ekip Yönetimi", level: 5 }, { name: "Bütçe Yönetimi", level: 4 }, { name: "Risk Değerlendirme", level: 5 }],
  "Elektronik Güvenlik": [{ name: "CCTV Sistemleri", level: 5 }, { name: "Alarm Sistemleri", level: 5 }, { name: "Erişim Kontrolü", level: 5 }, { name: "Teknik Bakım", level: 4 }, { name: "Sistem Entegrasyonu", level: 4 }],
  "Özel Dedektif": [{ name: "Gözetleme Teknikleri", level: 5 }, { name: "Veri Analizi", level: 5 }, { name: "Raporlama", level: 4 }, { name: "Araştırma Becerileri", level: 5 }, { name: "Gizli Takip", level: 5 }],
  "Güvenlik Danışmanı": [{ name: "Risk Analizi", level: 5 }, { name: "Güvenlik Denetimi", level: 5 }, { name: "Strateji Geliştirme", level: 5 }, { name: "Eğitim Yönetimi", level: 4 }, { name: "Protokol Hazırlama", level: 4 }],
  "Fabrika / Tesis Güvenlik": [{ name: "Tesis Güvenliği", level: 5 }, { name: "Yangın Önleme", level: 5 }, { name: "Acil Müdahale", level: 5 }, { name: "İSG Standartları", level: 4 }, { name: "Erişim Kontrolü", level: 4 }],
  "Sahil Güvenlik": [{ name: "Deniz Güvenliği", level: 5 }, { name: "Su Kurtarma", level: 5 }, { name: "Deniz Devriyesi", level: 5 }, { name: "İlk Yardım", level: 4 }, { name: "Navigasyon", level: 4 }],
};

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] as T; }

function fullAutoFill(poz: string, cur: CVData): CVData {
  const summaries = SUMMARIES[poz] || SUMMARIES["Güvenlik Görevlisi"]!;
  const exps  = (EXPERIENCES[poz] || EXPERIENCES["Güvenlik Görevlisi"]!).map((e, i) => ({ ...e, id: i + 1 }));
  const certs = (CERTS[poz] || CERTS["Güvenlik Görevlisi"]!).map((c, i) => ({ ...c, id: i + 1 }));
  const skills = (SKILLS_MAP[poz] || SKILLS_MAP["Güvenlik Görevlisi"]!).map((s, i) => ({ ...s, id: i + 1 }));
  return {
    ...cur,
    pozisyon: poz,
    hakkimda: pickRandom(summaries),
    deneyimler: exps,
    yetenekler: skills,
    sertifikalar: certs,
    hobiler: HOBBIES[poz] || "Spor, Okumak, Yürüyüş",
    ozellikler: OZELLIKLER_MAP[poz] || ["Disiplinli", "Güvenilir", "Ekip Uyumlu"],
    motto: MOTTOS[poz] || "GÜVEN, SADAKAT VE ONUR EN BÜYÜK GÜCÜMDÜR.",
  };
}

// ── Renk Paleti ───────────────────────────────────────────────────────────────
const PALETTE = [
  { label: "Altın",     c: "#D4AF37" },
  { label: "Gümüş",    c: "#A8B2BC" },
  { label: "Kırmızı",  c: "#C0392B" },
  { label: "Lacivert", c: "#009EDB" },
  { label: "Mor",      c: "#7C3AED" },
  { label: "Cyan",     c: "#06B6D4" },
  { label: "Yeşil",    c: "#16A34A" },
  { label: "Turuncu",  c: "#EA580C" },
  { label: "Pembe",    c: "#EC4899" },
  { label: "Indigo",   c: "#4F46E5" },
];

// ── Template Utilities ────────────────────────────────────────────────────────
interface TP { data: CVData; photo: string; color: string; }

function PhotoBox({ photo, name, color, circle, w = 95, h = 120 }: { photo: string; name: string; color: string; circle?: boolean; w?: number; h?: number }) {
  const initials = (name.trim() || "ÖG").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const base: React.CSSProperties = circle
    ? { width: w, height: w, borderRadius: "50%", border: `3px solid ${color}`, flexShrink: 0, objectFit: "cover" as const }
    : { width: w, height: h, borderRadius: 4, border: `3px solid ${color}`, flexShrink: 0, objectFit: "cover" as const };
  if (photo) return <img src={photo} alt="" style={base} />;
  return <div style={{ ...base, background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: circle ? Math.round(w * 0.32) : 28, fontWeight: 900, color }}>{initials}</div>;
}

function SH({ title, icon, c }: { title: string; icon: string; c: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, marginTop: 4 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, color: c }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: `${c}50` }} />
    </div>
  );
}

function Bar({ level, c, bg = "#33333360" }: { level: number; c: string; bg?: string }) {
  return <div style={{ height: 4, background: bg, borderRadius: 2 }}><div style={{ width: `${level / 5 * 100}%`, height: "100%", background: c, borderRadius: 2 }} /></div>;
}

// ── Şablon 1: Komando (Örnek resme benzer) ────────────────────────────────────
function TKomando({ data, photo, color }: TP) {
  const full = `${data.ad} ${data.soyad}`.trim() || "AD SOYAD";
  const parts = full.split(" "); const sn = parts.pop() || ""; const fn = parts.join(" ");
  const hobiler = (data.hobiler || "").split(",").map(h => h.trim()).filter(Boolean);
  const hobilerEmojis = ["🎣", "🎵", "🚗", "⚽", "🏋️", "🤿", "📚", "🎯", "🌿", "🏹"];
  return (
    <div style={{ background: "#0D0D1A", color: "#fff", fontFamily: "Arial,sans-serif", width: "210mm", minHeight: "297mm", boxSizing: "border-box", fontSize: 10 }}>
      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg,#1a1020 0%,#0D0D1A 60%)", padding: "18px 22px 14px", borderBottom: `3px solid ${color}`, display: "flex", gap: 16, alignItems: "flex-start", minHeight: 180, position: "relative" }}>
        <PhotoBox photo={photo} name={full} color={color} w={100} h={130} />
        <div style={{ flex: 1 }}>
          <div style={{ lineHeight: 1.05 }}>
            <div style={{ fontSize: 30, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: 3, color: "#fff" }}>{fn || data.ad || "AD"}</div>
            <div style={{ fontSize: 34, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: 3, color }}>{sn || data.soyad || "SOYAD"}</div>
          </div>
          <div style={{ fontSize: 10, color: `${color}cc`, letterSpacing: 3, textTransform: "uppercase" as const, margin: "5px 0" }}>{data.pozisyon}</div>
          {data.hakkimda && <p style={{ fontSize: 8.5, color: "#bbb", lineHeight: 1.6, maxWidth: 340, margin: "6px 0 10px" }}>{data.hakkimda}</p>}
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
            {data.ozellikler.slice(0, 5).map(o => (
              <div key={o} style={{ textAlign: "center" as const, minWidth: 44 }}>
                <div style={{ width: 30, height: 30, background: `${color}25`, border: `1px solid ${color}60`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 3px", fontSize: 14 }}>🛡</div>
                <span style={{ fontSize: 6.5, color, textTransform: "uppercase" as const, lineHeight: 1.2, display: "block" }}>{o}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Sağ rozet */}
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 56, height: 56, background: `${color}20`, border: `2px solid ${color}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>⚔️</div>
          <div style={{ width: 52, background: `${color}`, padding: "4px 6px", textAlign: "center" as const, borderRadius: 4 }}>
            <div style={{ fontSize: 7, fontWeight: 900, color: "#000", lineHeight: 1.3 }}>GÜVEN<br />VE ONUR</div>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: "flex", minHeight: "calc(297mm - 200px)" }}>
        {/* Sol sütun */}
        <div style={{ width: "37%", background: "#111122", padding: "14px 13px", borderRight: `1px solid ${color}25` }}>
          <SH title="KİŞİSEL BİLGİLER" icon="👤" c={color} />
          {data.ad && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Ad Soyadı</div><div style={{ fontSize: 9 }}>{data.ad} {data.soyad}</div></div>}
          {data.dogumTarihi && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>📅 Doğum Tarihi</div><div style={{ fontSize: 9 }}>{data.dogumTarihi}</div></div>}
          {data.medeniDurum && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>💍 Medeni Durum</div><div style={{ fontSize: 9 }}>{data.medeniDurum}</div></div>}
          {(data.boy || data.kilo) && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>📏 Boy / Kilo</div><div style={{ fontSize: 9 }}>{data.boy} cm / {data.kilo} kg</div></div>}
          {data.adres && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>📍 Adres</div><div style={{ fontSize: 9, lineHeight: 1.4 }}>{data.adres}</div></div>}

          <SH title="İLETİŞİM" icon="📞" c={color} />
          {data.telefon && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>📞 Telefon</div><div style={{ fontSize: 9 }}>{data.telefon}</div></div>}
          {data.email && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>✉ E-posta</div><div style={{ fontSize: 9 }}>{data.email}</div></div>}

          <SH title="YETENEKLER" icon="⚙️" c={color} />
          {data.yetenekler.filter(s => s.name).map(s => (
            <div key={s.id} style={{ marginBottom: 7 }}>
              <div style={{ fontSize: 8.5, color: "#ccc", marginBottom: 2 }}>{s.name}</div>
              <Bar level={s.level} c={color} />
            </div>
          ))}

          {data.sertifikalar.length > 0 && (
            <>
              <SH title="SERTİFİKALAR" icon="🏅" c={color} />
              {data.sertifikalar.map(cert => (
                <div key={cert.id} style={{ marginBottom: 5, display: "flex", gap: 5, alignItems: "flex-start" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 3 }} />
                  <div><div style={{ fontSize: 8, color: "#ccc", lineHeight: 1.3 }}>{cert.name}</div><div style={{ fontSize: 7, color: `${color}cc` }}>{cert.year}</div></div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Sağ sütun */}
        <div style={{ flex: 1, padding: "14px 16px" }}>
          {data.deneyimler.some(d => d.title) && (
            <>
              <SH title="DENEYİM" icon="💼" c={color} />
              {data.deneyimler.filter(d => d.title).map((d, i, arr) => (
                <div key={d.id} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
                    <div style={{ width: 11, height: 11, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    {i < arr.length - 1 && <div style={{ width: 1, flex: 1, background: `${color}30`, marginTop: 3 }} />}
                  </div>
                  <div style={{ flex: 1, paddingBottom: i < arr.length - 1 ? 4 : 0 }}>
                    <div style={{ fontSize: 8, color: "#777" }}>{d.period}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color }}>{d.company}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#eee", marginBottom: 3 }}>{d.title}</div>
                    {d.desc && <p style={{ fontSize: 8.5, color: "#aaa", margin: 0, lineHeight: 1.55 }}>{d.desc}</p>}
                  </div>
                </div>
              ))}
            </>
          )}

          {hobiler.length > 0 && (
            <>
              <SH title="HOBİLER" icon="⭐" c={color} />
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10, marginBottom: 12 }}>
                {hobiler.map((h, i) => (
                  <div key={h} style={{ textAlign: "center" as const, minWidth: 50 }}>
                    <div style={{ fontSize: 20, marginBottom: 2 }}>{hobilerEmojis[i % hobilerEmojis.length]}</div>
                    <div style={{ fontSize: 8, color: "#aaa" }}>{h}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {data.ozellikler.length > 0 && (
            <>
              <SH title="ÖZELLİKLERİM" icon="🔧" c={color} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>
                {data.ozellikler.map(o => {
                  const icons: Record<string,string> = { "Disiplinli": "🎯", "Güvenilir": "🔒", "Çalışkan": "💪", "Ekip Uyumlu": "🤝", "Sorumluluk Sahibi": "✅", "Planlı & Organize": "📋", "İletişime Açık": "💬", "Güler Yüzlü": "😊", "Çabuk Karar Veren": "⚡", "Analitik Düşünen": "🧠", "Güçlü İrade": "🦁", "Öz Denetimli": "🛡" };
                  return (
                    <div key={o} style={{ textAlign: "center" as const, background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 6, padding: "6px 4px" }}>
                      <div style={{ fontSize: 16, marginBottom: 2 }}>{icons[o] ?? "✔"}</div>
                      <div style={{ fontSize: 7, color: "#ccc", lineHeight: 1.2 }}>{o}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ background: "#0a0a16", borderTop: `2px solid ${color}`, padding: "8px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color, fontSize: 14 }}>★★★★★</span>
        <span style={{ fontSize: 8.5, color, letterSpacing: 2 }}>{data.motto}</span>
        <span style={{ fontSize: 10, color, fontStyle: "italic", fontWeight: 700 }}>{data.ad ? `${data.ad[0]}. ${data.soyad}` : ""}</span>
      </div>
    </div>
  );
}

// ── Şablon 2: Premium (Dikey iki sütun) ──────────────────────────────────────
function TPremium({ data, photo, color }: TP) {
  const full = `${data.ad} ${data.soyad}`.trim() || "AD SOYAD";
  const hobiler = (data.hobiler || "").split(",").map(h => h.trim()).filter(Boolean);
  return (
    <div style={{ background: "#111827", color: "#fff", fontFamily: "Arial,sans-serif", width: "210mm", minHeight: "297mm", boxSizing: "border-box", display: "flex" }}>
      <div style={{ width: "37%", background: `linear-gradient(180deg,${color}22,#0a0a14)`, padding: "22px 14px", borderRight: `2px solid ${color}50` }}>
        <div style={{ textAlign: "center" as const, marginBottom: 16 }}>
          <PhotoBox photo={photo} name={full} color={color} circle w={88} />
          <div style={{ fontSize: 15, fontWeight: 900, color, textTransform: "uppercase" as const, marginTop: 10, letterSpacing: 1 }}>{data.ad}</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", textTransform: "uppercase" as const, letterSpacing: 1 }}>{data.soyad}</div>
          <div style={{ fontSize: 8, color: `${color}cc`, letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 4 }}>{data.pozisyon}</div>
        </div>
        <SH title="KİŞİSEL" c={color} icon="👤" />
        {data.dogumTarihi && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Doğum</div><div style={{ fontSize: 8.5 }}>{data.dogumTarihi}</div></div>}
        {data.medeniDurum && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Medeni</div><div style={{ fontSize: 8.5 }}>{data.medeniDurum}</div></div>}
        {(data.boy || data.kilo) && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Boy/Kilo</div><div style={{ fontSize: 8.5 }}>{data.boy} / {data.kilo}</div></div>}
        {data.adres && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Adres</div><div style={{ fontSize: 8.5, lineHeight: 1.4 }}>{data.adres}</div></div>}
        {data.telefon && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Tel</div><div style={{ fontSize: 8.5 }}>{data.telefon}</div></div>}
        {data.email && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>E-posta</div><div style={{ fontSize: 8.5 }}>{data.email}</div></div>}

        <SH title="YETENEKLER" c={color} icon="⚙️" />
        {data.yetenekler.filter(s => s.name).map(s => (
          <div key={s.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" as const, fontSize: 8.5, color: "#ccc", marginBottom: 2 }}><span>{s.name}</span><span style={{ color }}>{"★".repeat(s.level)}{"☆".repeat(5 - s.level)}</span></div>
            <Bar level={s.level} c={color} />
          </div>
        ))}

        {hobiler.length > 0 && (
          <>
            <SH title="HOBİLER" c={color} icon="⭐" />
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
              {hobiler.map(h => <span key={h} style={{ fontSize: 7.5, background: `${color}20`, color, padding: "2px 7px", borderRadius: 10, border: `1px solid ${color}40` }}>{h}</span>)}
            </div>
          </>
        )}
      </div>

      <div style={{ flex: 1, padding: "22px 16px" }}>
        {data.hakkimda && <div style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 8, padding: "10px 13px", marginBottom: 14 }}>
          <div style={{ fontSize: 7.5, color, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 5 }}>HAKKIMDA</div>
          <p style={{ fontSize: 8.5, color: "#aaa", lineHeight: 1.6, margin: 0 }}>{data.hakkimda}</p>
        </div>}
        <SH title="DENEYİM" c={color} icon="💼" />
        {data.deneyimler.filter(d => d.title).map((d, i, arr) => (
          <div key={d.id} style={{ display: "flex", gap: 10, marginBottom: 13 }}>
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
              <div style={{ width: 11, height: 11, borderRadius: "50%", background: color }} />
              {i < arr.length - 1 && <div style={{ width: 1, flex: 1, background: `${color}30`, marginTop: 3 }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: `${color}cc` }}>{d.period}</div>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{d.title}</div>
              <div style={{ fontSize: 9, color, marginBottom: 3 }}>{d.company}</div>
              {d.desc && <p style={{ fontSize: 8.5, color: "#aaa", margin: 0, lineHeight: 1.5 }}>{d.desc}</p>}
            </div>
          </div>
        ))}
        {data.sertifikalar.length > 0 && (
          <>
            <SH title="SERTİFİKALAR" c={color} icon="🏅" />
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 12 }}>
              {data.sertifikalar.map(cert => <div key={cert.id} style={{ fontSize: 8, background: `${color}15`, border: `1px solid ${color}40`, color: "#ccc", padding: "4px 10px", borderRadius: 6 }}>🏅 {cert.name} <span style={{ color, marginLeft: 4 }}>{cert.year}</span></div>)}
            </div>
          </>
        )}
        {data.ozellikler.length > 0 && (
          <>
            <SH title="ÖZELLİKLERİM" c={color} icon="🔧" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {data.ozellikler.map(o => <div key={o} style={{ display: "flex", alignItems: "center", gap: 5, background: `${color}10`, borderRadius: 5, padding: "5px 8px" }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} /><span style={{ fontSize: 8.5, color: "#ccc" }}>{o}</span></div>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Şablon 3: Baret (Renkli Header) ──────────────────────────────────────────
function TBaret({ data, photo, color }: TP) {
  const full = `${data.ad} ${data.soyad}`.trim() || "AD SOYAD";
  const hobiler = (data.hobiler || "").split(",").map(h => h.trim()).filter(Boolean);
  return (
    <div style={{ background: "#0A1628", color: "#fff", fontFamily: "Arial,sans-serif", width: "210mm", minHeight: "297mm", boxSizing: "border-box" }}>
      <div style={{ background: color, padding: "18px 24px", display: "flex", gap: 18, alignItems: "center" }}>
        <PhotoBox photo={photo} name={full} color="#fff" circle w={88} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 900, textTransform: "uppercase" as const, color: "#fff" }}>{data.ad} {data.soyad}</div>
          <div style={{ fontSize: 9.5, color: "#ffffffcc", letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 4 }}>{data.pozisyon}</div>
          {data.hakkimda && <p style={{ fontSize: 8.5, color: "#ffffffcc", marginTop: 7, lineHeight: 1.55, maxWidth: 380, margin: "7px 0 0" }}>{data.hakkimda}</p>}
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, marginTop: 8 }}>{data.ozellikler.slice(0, 5).map(o => <span key={o} style={{ fontSize: 7.5, background: "rgba(255,255,255,0.2)", color: "#fff", padding: "2px 8px", borderRadius: 10 }}>{o}</span>)}</div>
        </div>
      </div>
      <div style={{ background: `${color}18`, padding: "5px 22px", display: "flex", gap: 16, borderBottom: `1px solid ${color}40` }}>
        {data.telefon && <span style={{ fontSize: 8.5, color }}>📞 {data.telefon}</span>}
        {data.email && <span style={{ fontSize: 8.5, color }}>✉ {data.email}</span>}
        {data.adres && <span style={{ fontSize: 8.5, color }}>📍 {data.adres}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "37% 63%" }}>
        <div style={{ background: "#0d1e35", padding: "13px 12px" }}>
          <SH title="KİŞİSEL" c={color} icon="👤" />
          {data.dogumTarihi && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Doğum</div><div style={{ fontSize: 8.5 }}>{data.dogumTarihi}</div></div>}
          {data.medeniDurum && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Medeni</div><div style={{ fontSize: 8.5 }}>{data.medeniDurum}</div></div>}
          {(data.boy || data.kilo) && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Boy/Kilo</div><div style={{ fontSize: 8.5 }}>{data.boy}/{data.kilo}</div></div>}
          <SH title="YETENEKLER" c={color} icon="⚙️" />
          {data.yetenekler.filter(s => s.name).map(s => (
            <div key={s.id} style={{ marginBottom: 7 }}>
              <div style={{ fontSize: 8.5, color: "#ccc", marginBottom: 2 }}>{s.name}</div>
              <div style={{ height: 5, background: "#1a3a5c", borderRadius: 3 }}><div style={{ width: `${s.level / 5 * 100}%`, height: "100%", background: color, borderRadius: 3 }} /></div>
            </div>
          ))}
          {data.sertifikalar.length > 0 && (
            <>
              <SH title="SERTİFİKALAR" c={color} icon="🏅" />
              {data.sertifikalar.map(cert => <div key={cert.id} style={{ fontSize: 7.5, color: "#ccc", marginBottom: 4 }}>🏅 {cert.name} <span style={{ color }}>({cert.year})</span></div>)}
            </>
          )}
          {hobiler.length > 0 && (
            <>
              <SH title="HOBİLER" c={color} icon="⭐" />
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>{hobiler.map(h => <span key={h} style={{ fontSize: 7.5, background: `${color}22`, border: `1px solid ${color}50`, color, padding: "2px 7px", borderRadius: 10 }}>{h}</span>)}</div>
            </>
          )}
        </div>
        <div style={{ padding: "13px 15px" }}>
          <SH title="DENEYİM" c={color} icon="💼" />
          {data.deneyimler.filter(d => d.title).map((d, i, arr) => (
            <div key={d.id} style={{ display: "flex", gap: 9, marginBottom: 13 }}>
              <div style={{ width: 3, background: color, borderRadius: 2, flexShrink: 0, margin: "2px 0" }} />
              <div>
                <div style={{ fontSize: 8, color }}>{d.period}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700 }}>{d.title}</div>
                <div style={{ fontSize: 8.5, color: "#888" }}>{d.company}</div>
                {d.desc && <p style={{ fontSize: 8.5, color: "#aaa", margin: "2px 0 0", lineHeight: 1.5 }}>{d.desc}</p>}
              </div>
            </div>
          ))}
          <SH title="ÖZELLİKLERİM" c={color} icon="🔧" />
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
            {data.ozellikler.map(o => <span key={o} style={{ fontSize: 8, background: `${color}18`, border: `1px solid ${color}40`, color: "#ccc", padding: "3px 8px", borderRadius: 4 }}>✔ {o}</span>)}
          </div>
        </div>
      </div>
      <div style={{ background: color, padding: "7px 22px", textAlign: "center" as const }}><span style={{ fontSize: 8.5, color: "#fff", fontWeight: 700, letterSpacing: 2 }}>{data.motto}</span></div>
    </div>
  );
}

// ── Şablon 4: Kurumsal (Açık) ─────────────────────────────────────────────────
function TKurumsal({ data, photo, color }: TP) {
  const full = `${data.ad} ${data.soyad}`.trim() || "AD SOYAD";
  const hobiler = (data.hobiler || "").split(",").map(h => h.trim()).filter(Boolean);
  return (
    <div style={{ background: "#f0f4f8", color: "#1e293b", fontFamily: "Arial,sans-serif", width: "210mm", minHeight: "297mm", boxSizing: "border-box" }}>
      <div style={{ background: "#1e293b", padding: "18px 24px", display: "flex", gap: 18, alignItems: "center" }}>
        <PhotoBox photo={photo} name={full} color={color} w={90} h={115} />
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{data.ad} <span style={{ color }}>{data.soyad}</span></div>
          <div style={{ fontSize: 9, color, letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 4 }}>{data.pozisyon}</div>
          {data.hakkimda && <p style={{ fontSize: 8.5, color: "#94a3b8", marginTop: 8, lineHeight: 1.55, maxWidth: 380, margin: "8px 0 0" }}>{data.hakkimda}</p>}
        </div>
      </div>
      <div style={{ background: "#e2e8f0", padding: "5px 22px", display: "flex", gap: 16, borderBottom: "1px solid #cbd5e1" }}>
        {data.telefon && <span style={{ fontSize: 8.5, color }}>📞 {data.telefon}</span>}
        {data.email && <span style={{ fontSize: 8.5, color }}>✉ {data.email}</span>}
        {data.adres && <span style={{ fontSize: 8.5, color }}>📍 {data.adres}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "34% 66%" }}>
        <div style={{ background: "#1e293b", padding: "13px 12px" }}>
          <SH title="KİŞİSEL" c={color} icon="👤" />
          {data.dogumTarihi && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#64748b" }}>Doğum</div><div style={{ fontSize: 8.5, color: "#94a3b8" }}>{data.dogumTarihi}</div></div>}
          {data.medeniDurum && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#64748b" }}>Medeni</div><div style={{ fontSize: 8.5, color: "#94a3b8" }}>{data.medeniDurum}</div></div>}
          {(data.boy || data.kilo) && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#64748b" }}>Boy/Kilo</div><div style={{ fontSize: 8.5, color: "#94a3b8" }}>{data.boy}cm/{data.kilo}kg</div></div>}
          <SH title="YETENEKLER" c={color} icon="⚙️" />
          {data.yetenekler.filter(s => s.name).map(s => (
            <div key={s.id} style={{ marginBottom: 7 }}>
              <div style={{ fontSize: 8.5, color: "#94a3b8", marginBottom: 2 }}>{s.name}</div>
              <div style={{ height: 4, background: "#334155", borderRadius: 2 }}><div style={{ width: `${s.level / 5 * 100}%`, height: "100%", background: color, borderRadius: 2 }} /></div>
            </div>
          ))}
          {data.sertifikalar.length > 0 && (
            <>
              <SH title="SERTİFİKALAR" c={color} icon="🏅" />
              {data.sertifikalar.map(cert => <div key={cert.id} style={{ fontSize: 7.5, color: "#94a3b8", marginBottom: 5 }}>🏅 {cert.name} <span style={{ color }}>({cert.year})</span></div>)}
            </>
          )}
          {hobiler.length > 0 && (
            <>
              <SH title="HOBİLER" c={color} icon="⭐" />
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 3 }}>{hobiler.map(h => <div key={h} style={{ fontSize: 8, color: "#94a3b8" }}>▸ {h}</div>)}</div>
            </>
          )}
        </div>
        <div style={{ padding: "13px 15px" }}>
          <SH title="DENEYİM" c={color} icon="💼" />
          {data.deneyimler.filter(d => d.title).map(d => (
            <div key={d.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "9px 12px", marginBottom: 9, borderLeft: `3px solid ${color}` }}>
              <div style={{ fontSize: 8.5, color, fontWeight: 700 }}>{d.period}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#1e293b" }}>{d.title}</div>
              <div style={{ fontSize: 8.5, color: "#64748b" }}>{d.company}</div>
              {d.desc && <p style={{ fontSize: 8.5, color: "#475569", margin: "3px 0 0", lineHeight: 1.5 }}>{d.desc}</p>}
            </div>
          ))}
          <SH title="ÖZELLİKLER" c={color} icon="🔧" />
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>{data.ozellikler.map(o => <div key={o} style={{ fontSize: 8, color: "#475569" }}>✔ {o}</div>)}</div>
        </div>
      </div>
      <div style={{ background: color, padding: "7px 22px", textAlign: "center" as const }}><span style={{ fontSize: 8.5, color: "#fff", letterSpacing: 2 }}>{data.motto}</span></div>
    </div>
  );
}

// ── Şablon 5: Modern Tech ─────────────────────────────────────────────────────
function TModern({ data, photo, color }: TP) {
  const full = `${data.ad} ${data.soyad}`.trim() || "AD SOYAD";
  const hobiler = (data.hobiler || "").split(",").map(h => h.trim()).filter(Boolean);
  return (
    <div style={{ background: "#0F172A", color: "#fff", fontFamily: "Arial,sans-serif", width: "210mm", minHeight: "297mm", boxSizing: "border-box" }}>
      <div style={{ background: `linear-gradient(135deg,${color},${color}88)`, padding: "18px 24px", display: "flex", gap: 18, alignItems: "center" }}>
        <PhotoBox photo={photo} name={full} color="#fff" circle w={88} />
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{data.ad} <span style={{ color: "#ffffffbb" }}>{data.soyad}</span></div>
          <div style={{ fontSize: 9, color: "#ffffffcc", letterSpacing: 3, textTransform: "uppercase" as const, marginTop: 4 }}>{data.pozisyon}</div>
          {data.hakkimda && <p style={{ fontSize: 8.5, color: "#ffffffcc", marginTop: 7, lineHeight: 1.55, maxWidth: 380, margin: "7px 0 0" }}>{data.hakkimda}</p>}
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, marginTop: 7 }}>{data.ozellikler.slice(0, 5).map(o => <span key={o} style={{ fontSize: 7.5, background: "rgba(255,255,255,0.18)", color: "#fff", padding: "2px 8px", borderRadius: 10 }}>{o}</span>)}</div>
        </div>
      </div>
      <div style={{ background: "#0a0f1e", padding: "5px 22px", display: "flex", gap: 16, borderBottom: `1px solid ${color}40` }}>
        {data.telefon && <span style={{ fontSize: 8.5, color }}>📞 {data.telefon}</span>}
        {data.email && <span style={{ fontSize: 8.5, color }}>✉ {data.email}</span>}
        {data.adres && <span style={{ fontSize: 8.5, color }}>📍 {data.adres}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "37% 63%" }}>
        <div style={{ background: "#1e1b4b", padding: "13px 12px" }}>
          <SH title="KİŞİSEL" c={color} icon="👤" />
          {data.dogumTarihi && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Doğum</div><div style={{ fontSize: 8.5, color: "#a5b4fc" }}>{data.dogumTarihi}</div></div>}
          {data.medeniDurum && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Medeni</div><div style={{ fontSize: 8.5, color: "#a5b4fc" }}>{data.medeniDurum}</div></div>}
          {(data.boy || data.kilo) && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Boy/Kilo</div><div style={{ fontSize: 8.5, color: "#a5b4fc" }}>{data.boy}/{data.kilo}</div></div>}
          <SH title="YETENEKLER" c={color} icon="⚙️" />
          {data.yetenekler.filter(s => s.name).map(s => (
            <div key={s.id} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 8.5, color: "#a5b4fc", marginBottom: 2 }}>{s.name}</div>
              <div style={{ height: 5, background: "#312e81", borderRadius: 3 }}><div style={{ width: `${s.level / 5 * 100}%`, height: "100%", background: color, borderRadius: 3 }} /></div>
            </div>
          ))}
          {data.sertifikalar.length > 0 && (
            <>
              <SH title="SERTİFİKALAR" c={color} icon="🏅" />
              {data.sertifikalar.map(cert => <div key={cert.id} style={{ fontSize: 7.5, color: "#a5b4fc", marginBottom: 5 }}>🏅 {cert.name} <span style={{ color }}>({cert.year})</span></div>)}
            </>
          )}
          {hobiler.length > 0 && (
            <>
              <SH title="HOBİLER" c={color} icon="⭐" />
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>{hobiler.map(h => <span key={h} style={{ fontSize: 7.5, background: "#312e81", color: "#a5b4fc", padding: "2px 7px", borderRadius: 8 }}>{h}</span>)}</div>
            </>
          )}
        </div>
        <div style={{ padding: "13px 15px" }}>
          <SH title="DENEYİM" c={color} icon="💼" />
          {data.deneyimler.filter(d => d.title).map(d => (
            <div key={d.id} style={{ background: "#1e293b", borderRadius: 7, padding: "9px 12px", marginBottom: 9, borderLeft: `3px solid ${color}` }}>
              <div style={{ fontSize: 8.5, color }}>{d.period}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700 }}>{d.title}</div>
              <div style={{ fontSize: 8.5, color: "#64748b" }}>{d.company}</div>
              {d.desc && <p style={{ fontSize: 8.5, color: "#94a3b8", margin: "3px 0 0", lineHeight: 1.5 }}>{d.desc}</p>}
            </div>
          ))}
          <SH title="ÖZELLİKLERİM" c={color} icon="🔧" />
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>{data.ozellikler.map(o => <span key={o} style={{ fontSize: 8, background: `${color}20`, border: `1px solid ${color}40`, color, padding: "2px 8px", borderRadius: 8 }}>✦ {o}</span>)}</div>
        </div>
      </div>
      <div style={{ background: color, padding: "7px 22px", textAlign: "center" as const }}><span style={{ fontSize: 8.5, color: "#fff", letterSpacing: 2 }}>{data.motto}</span></div>
    </div>
  );
}

// ── Şablon 6: VIP Lüks ───────────────────────────────────────────────────────
function TVIP({ data, photo, color }: TP) {
  const full = `${data.ad} ${data.soyad}`.trim() || "AD SOYAD";
  const hobiler = (data.hobiler || "").split(",").map(h => h.trim()).filter(Boolean);
  return (
    <div style={{ background: "#080808", color: "#fff", fontFamily: "Georgia,serif", width: "210mm", minHeight: "297mm", boxSizing: "border-box" }}>
      <div style={{ background: `linear-gradient(180deg,${color}18,#080808)`, padding: "24px", borderBottom: `1px solid ${color}`, display: "flex", gap: 22, alignItems: "center" }}>
        <PhotoBox photo={photo} name={full} color={color} w={90} h={115} />
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" as const, color, lineHeight: 1.1 }}>{full}</div>
          <div style={{ width: 60, height: 2, background: color, margin: "9px 0" }} />
          <div style={{ fontSize: 9.5, letterSpacing: 5, textTransform: "uppercase" as const, color: "#888" }}>{data.pozisyon}</div>
          {data.hakkimda && <p style={{ fontSize: 9, color: "#aaa", marginTop: 10, lineHeight: 1.7, maxWidth: 360, fontStyle: "italic", margin: "10px 0 0" }}>"{data.hakkimda}"</p>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ padding: "18px 16px", borderRight: "1px solid #222" }}>
          <SH title="KİŞİSEL" c={color} icon="👤" />
          {data.dogumTarihi && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Doğum</div><div style={{ fontSize: 8.5 }}>{data.dogumTarihi}</div></div>}
          {data.medeniDurum && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Medeni</div><div style={{ fontSize: 8.5 }}>{data.medeniDurum}</div></div>}
          {(data.boy || data.kilo) && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Boy/Kilo</div><div style={{ fontSize: 8.5 }}>{data.boy} / {data.kilo}</div></div>}
          {data.adres && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Adres</div><div style={{ fontSize: 8.5 }}>{data.adres}</div></div>}
          {data.telefon && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>Telefon</div><div style={{ fontSize: 8.5 }}>{data.telefon}</div></div>}
          {data.email && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 7, color: "#666" }}>E-posta</div><div style={{ fontSize: 8.5 }}>{data.email}</div></div>}
          <SH title="YETENEKLER" c={color} icon="⚙️" />
          {data.yetenekler.filter(s => s.name).map(s => (
            <div key={s.id} style={{ marginBottom: 7 }}>
              <div style={{ fontSize: 8.5, color: "#ccc", marginBottom: 2 }}>{s.name}</div>
              <Bar level={s.level} c={color} />
            </div>
          ))}
          {hobiler.length > 0 && (<><SH title="HOBİLER" c={color} icon="⭐" /><p style={{ fontSize: 8.5, color: "#aaa", lineHeight: 1.6, margin: 0 }}>{hobiler.join(" · ")}</p></>)}
        </div>
        <div style={{ padding: "18px 16px" }}>
          <SH title="DENEYİM" c={color} icon="💼" />
          {data.deneyimler.filter(d => d.title).map(d => (
            <div key={d.id} style={{ borderLeft: `2px solid ${color}`, paddingLeft: 10, marginBottom: 13 }}>
              <div style={{ fontSize: 8.5, color }}>{d.period}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700 }}>{d.title}</div>
              <div style={{ fontSize: 8.5, color: "#888", marginBottom: 3 }}>{d.company}</div>
              {d.desc && <p style={{ fontSize: 8.5, color: "#aaa", margin: 0, lineHeight: 1.5 }}>{d.desc}</p>}
            </div>
          ))}
          {data.sertifikalar.length > 0 && (
            <>
              <SH title="SERTİFİKALAR" c={color} icon="🏅" />
              {data.sertifikalar.map(cert => <div key={cert.id} style={{ fontSize: 8, color: "#ccc", marginBottom: 5 }}>◆ {cert.name} <span style={{ color }}>({cert.year})</span></div>)}
            </>
          )}
          <SH title="ÖZELLİKLER" c={color} icon="🔧" />
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>{data.ozellikler.map(o => <span key={o} style={{ fontSize: 7.5, color: "#888" }}>◆ {o}</span>)}</div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${color}`, padding: "7px 24px", textAlign: "center" as const }}><span style={{ fontSize: 8.5, color: `${color}90`, letterSpacing: 3 }}>{data.motto}</span></div>
    </div>
  );
}

const TEMPLATES = [
  { id: 0, name: "Komando",  desc: "Askeri + rozetli", C: TKomando  },
  { id: 1, name: "Premium",  desc: "Dikey sol şerit",  C: TPremium  },
  { id: 2, name: "Baret",    desc: "Renkli header",    C: TBaret    },
  { id: 3, name: "Kurumsal", desc: "Açık & net",       C: TKurumsal },
  { id: 4, name: "Modern",   desc: "Gradient tech",    C: TModern   },
  { id: 5, name: "VIP Lüks", desc: "Serif lüks",       C: TVIP      },
];

// ── Stabil FInput ─────────────────────────────────────────────────────────────
const FInput = React.memo(function FI({ label, value, onChange, onBlur, placeholder }: { label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder || ""}
        className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
    </div>
  );
});

// ── Ana Bileşen ───────────────────────────────────────────────────────────────
export default function CvOlustur() {
  const { user } = useAuth();
  const [step, setStep]           = useState(1);
  const [selTpl, setSelTpl]       = useState(0);
  const [selColor, setSelColor]   = useState(0);
  const [photo, setPhoto]         = useState("");
  const [data, setData]           = useState<CVData>(INITIAL);
  const [isAutoFill, setAutoFill] = useState(false);
  const [isDownload, setDownload] = useState(false);
  const [showPreview, setPreview] = useState(false);
  const [isSyncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]     = useState("");
  const cvRef = useRef<HTMLDivElement>(null);

  const color = PALETTE[selColor]!.c;
  const Tmpl  = TEMPLATES[selTpl]!.C;

  const upd = useCallback(<K extends keyof CVData>(key: K, val: CVData[K]) =>
    setData(p => ({ ...p, [key]: val })), []);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── Format yardımcıları ───────────────────────────────────────────
  const formatPhone = (v: string): string => {
    const d = v.replace(/\D/g, "");
    if (!d) return v;
    // 90XXXXXXXXXX → 0XXXXXXXXXX
    const n = d.startsWith("90") && d.length === 12 ? "0" + d.slice(2) : d;
    // 5XXXXXXXXX (10 hane başı 5) veya 0XXXXXXXXX (10 hane başı 0)
    const t = n.startsWith("0") ? n : n.length === 10 ? "0" + n : n;
    if (t.length === 11)
      return `${t.slice(0,4)} ${t.slice(4,7)} ${t.slice(7,9)} ${t.slice(9,11)}`;
    return v;
  };

  const formatDate = (v: string): string => {
    const d = v.replace(/\D/g, "");
    if (d.length === 8) {
      // DDMMYYYY veya YYYYMMDD?
      const day = parseInt(d.slice(0, 2));
      const mon = parseInt(d.slice(2, 4));
      if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12)
        return `${d.slice(0,2)}.${d.slice(2,4)}.${d.slice(4,8)}`;
    }
    // zaten noktalı ise olduğu gibi döndür
    return v;
  };

  // ── Profilden doldur (taze API isteği) ────────────────────────────
  const handleFillFromProfile = useCallback(async () => {
    if (!user) return;
    setSyncMsg("Yükleniyor...");
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/auth/me", {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error();
      const u = await res.json() as {
        displayName?: string | null; fullName?: string | null; email?: string; bio?: string | null; avatarUrl?: string | null;
        phone?: string | null; birthDate?: string | null;
        height?: string | null; weight?: string | null; address?: string | null; maritalStatus?: string | null;
      };
      const nameSrc = (u.fullName?.trim() || u.displayName?.trim() || "");
      const parts = nameSrc.split(" ");
      const rawPhone = u.phone || "";
      const rawDate  = u.birthDate || "";
      setData(prev => ({
        ...prev,
        ad:          parts[0]                       || prev.ad,
        soyad:       parts.slice(1).join(" ")       || prev.soyad,
        email:       u.email                        || prev.email,
        telefon:     (rawPhone ? formatPhone(rawPhone) : "")  || prev.telefon,
        dogumTarihi: (rawDate  ? formatDate(rawDate)  : "")   || prev.dogumTarihi,
        boy:         u.height                       || prev.boy,
        kilo:        u.weight                       || prev.kilo,
        adres:       u.address                      || prev.adres,
        medeniDurum: u.maritalStatus                || prev.medeniDurum,
        hakkimda:    u.bio                          || prev.hakkimda,
      }));
      if (u.avatarUrl && !photo) setPhoto(u.avatarUrl);
      setSyncMsg("Profil bilgileri getirildi!");
    } catch {
      setSyncMsg("Profil alınamadı, tekrar deneyin.");
    }
    setTimeout(() => setSyncMsg(""), 3000);
  }, [user, photo]);

  // ── Profili geri kaydet (step 1 → 2 geçişinde) ───────────────────
  const syncProfileFromStep1 = useCallback(async () => {
    if (!user) return;
    const fullName = `${data.ad} ${data.soyad}`.trim();
    try {
      const token = localStorage.getItem("auth_token");
      await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          ...(fullName       ? { fullName }                  : {}),
          ...(data.hakkimda  ? { bio: data.hakkimda }        : {}),
          ...(data.telefon   ? { phone: data.telefon }       : {}),
          ...(data.dogumTarihi ? { birthDate: data.dogumTarihi } : {}),
          ...(data.boy       ? { height: data.boy }          : {}),
          ...(data.kilo      ? { weight: data.kilo }         : {}),
          ...(data.adres     ? { address: data.adres }       : {}),
          ...(data.medeniDurum ? { maritalStatus: data.medeniDurum } : {}),
        }),
      });
    } catch { /* sessiz */ }
  }, [user, data.ad, data.soyad, data.hakkimda, data.telefon, data.dogumTarihi, data.boy, data.kilo, data.adres, data.medeniDurum]);

  const goNext = useCallback(async () => {
    if (step === 1) await syncProfileFromStep1();
    setStep(s => s + 1);
  }, [step, syncProfileFromStep1]);

  const handleAutoFill = useCallback(() => {
    setAutoFill(true);
    setTimeout(() => {
      setData(prev => {
        const filled = fullAutoFill(prev.pozisyon, prev);
        if (user) {
          const u = user as unknown as {
            displayName?: string | null; email?: string; bio?: string | null;
            phone?: string | null; birthDate?: string | null;
            height?: string | null; weight?: string | null; address?: string | null; maritalStatus?: string | null;
          };
          const parts = (u.displayName?.trim() || "").split(" ");
          return {
            ...filled,
            ad:          filled.ad          || parts[0] || "",
            soyad:       filled.soyad       || parts.slice(1).join(" "),
            email:       filled.email       || u.email        || "",
            telefon:     filled.telefon     || u.phone        || "",
            dogumTarihi: filled.dogumTarihi || u.birthDate    || "",
            boy:         filled.boy         || u.height       || "",
            kilo:        filled.kilo        || u.weight       || "",
            adres:       filled.adres       || u.address      || "",
            medeniDurum: filled.medeniDurum || u.maritalStatus || prev.medeniDurum,
            hakkimda:    filled.hakkimda    || u.bio          || "",
          };
        }
        return filled;
      });
      setAutoFill(false);
    }, 900);
  }, [user]);

  const handleDownload = async () => {
    if (!cvRef.current) return;
    setDownload(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF       = (await import("jspdf")).default;
      const canvas = await html2canvas(cvRef.current, { scale: 2, useCORS: true });
      const pdf    = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 210 * (canvas.height / canvas.width));
      pdf.save(`${data.ad || "CV"}_${data.soyad || "Guvenlik"}.pdf`);
    } catch { window.print(); }
    finally { setDownload(false); }
  };

  const addDeneyim    = useCallback(() => setData(p => ({ ...p, deneyimler: [...p.deneyimler, { id: Date.now(), title: "", company: "", period: "", desc: "" }] })), []);
  const removeDeneyim = useCallback((id: number) => setData(p => ({ ...p, deneyimler: p.deneyimler.filter(d => d.id !== id) })), []);
  const updDeneyim    = useCallback((id: number, field: keyof Experience, val: string) => setData(p => ({ ...p, deneyimler: p.deneyimler.map(d => d.id === id ? { ...d, [field]: val } : d) })), []);
  const addSkill      = useCallback(() => setData(p => ({ ...p, yetenekler: [...p.yetenekler, { id: Date.now(), name: "", level: 4 }] })), []);
  const removeSkill   = useCallback((id: number) => setData(p => ({ ...p, yetenekler: p.yetenekler.filter(s => s.id !== id) })), []);
  const updSkill      = useCallback((id: number, field: keyof Skill, val: string | number) => setData(p => ({ ...p, yetenekler: p.yetenekler.map(s => s.id === id ? { ...s, [field]: val } : s) })), []);
  const addCert       = useCallback(() => setData(p => ({ ...p, sertifikalar: [...p.sertifikalar, { id: Date.now(), name: "", year: "" }] })), []);
  const removeCert    = useCallback((id: number) => setData(p => ({ ...p, sertifikalar: p.sertifikalar.filter(c => c.id !== id) })), []);
  const updCert       = useCallback((id: number, field: keyof Certificate, val: string) => setData(p => ({ ...p, sertifikalar: p.sertifikalar.map(c => c.id === id ? { ...c, [field]: val } : c) })), []);
  const toggleOzellik = useCallback((o: string) => setData(p => ({ ...p, ozellikler: p.ozellikler.includes(o) ? p.ozellikler.filter(x => x !== o) : p.ozellikler.length < 8 ? [...p.ozellikler, o] : p.ozellikler })), []);

  const STEP_LABELS = ["Kişisel", "Deneyim", "Yetenekler", "Önizleme"];

  return (
    <Layout>
      <div className="p-4 pb-8">
        {/* Adım */}
        <div className="flex items-center justify-between mb-4">
          {STEP_LABELS.map((lbl, i) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => setStep(i + 1)}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step === i + 1 ? "bg-primary text-white" : step > i + 1 ? "bg-green-500/20 text-green-400 border border-green-500/40" : "bg-card border border-white/10 text-muted-foreground"}`}>
                  {step > i + 1 ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-[10px] ${step === i + 1 ? "text-primary font-semibold" : "text-muted-foreground"}`}>{lbl}</span>
              </div>
              {i < STEP_LABELS.length - 1 && <div className={`h-px flex-1 mx-1 mb-4 ${step > i + 1 ? "bg-green-500/40" : "bg-white/10"}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Yapay Zeka Banner */}
        <button onClick={handleAutoFill} disabled={isAutoFill}
          className="w-full mb-4 flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-secondary/10 hover:from-primary/20 hover:to-secondary/20 transition-all disabled:opacity-60">
          <Wand2 className={`w-4 h-4 text-primary ${isAutoFill ? "animate-spin" : ""}`} />
          <span className="text-sm font-bold text-primary">{isAutoFill ? "Yapay Zeka Dolduruyor..." : "Yapay Zeka ile Otomatik Doldur"}</span>
          <Sparkles className="w-3.5 h-3.5 text-secondary" />
        </button>
        <p className="text-[10px] text-muted-foreground text-center -mt-3 mb-3">Her bastığınızda farklı açıklama önerir — istediğiniz zaman düzenleyin</p>

        <h1 className="text-lg font-extrabold mb-4">{step < 4 ? `${step}. Adım — ${STEP_LABELS[step - 1]}` : "Şablon & Önizleme"}</h1>

        {/* ── ADIM 1 ── */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Profilden Getir */}
            {user && (
              <div className="flex flex-col gap-1.5">
                <button onClick={handleFillFromProfile}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 transition-all text-cyan-400">
                  <UserCircle className="w-4 h-4" />
                  <span className="text-sm font-semibold">Profilden Bilgileri Getir</span>
                </button>
                {syncMsg && <p className="text-[11px] text-green-400 text-center font-medium">{syncMsg}</p>}
              </div>
            )}
            <div className="flex flex-col items-center gap-1">
              <label className="cursor-pointer">
                <div className="w-24 h-28 rounded-xl border-2 border-dashed border-primary/40 flex flex-col items-center justify-center bg-card overflow-hidden hover:border-primary transition-colors">
                  {photo ? <img src={photo} className="w-full h-full object-cover" alt="foto" /> : <><Upload className="w-6 h-6 text-muted-foreground mb-1" /><span className="text-[10px] text-muted-foreground text-center px-2">Fotoğraf Ekle</span></>}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </label>
              {photo && <button onClick={() => setPhoto("")} className="text-[11px] text-destructive">Kaldır</button>}
              <p className="text-[10px] text-muted-foreground">Fotoğraf zorunlu değil</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FInput label="Ad" value={data.ad} onChange={v => upd("ad", v)} />
              <FInput label="Soyad" value={data.soyad} onChange={v => upd("soyad", v)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Pozisyon</label>
              <select value={data.pozisyon} onChange={e => upd("pozisyon", e.target.value)}
                className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50">
                {POZISYONLAR.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FInput label="Doğum Tarihi" value={data.dogumTarihi} onChange={v => upd("dogumTarihi", v)} onBlur={() => upd("dogumTarihi", formatDate(data.dogumTarihi))} placeholder="10.09.1990" />
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Medeni Durum</label>
                <select value={data.medeniDurum} onChange={e => upd("medeniDurum", e.target.value)}
                  className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50">
                  {["Bekar", "Evli", "Boşanmış"].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FInput label="Boy (cm)" value={data.boy} onChange={v => upd("boy", v)} placeholder="175" />
              <FInput label="Kilo (kg)" value={data.kilo} onChange={v => upd("kilo", v)} placeholder="80" />
            </div>
            <FInput label="Adres" value={data.adres} onChange={v => upd("adres", v)} placeholder="Mahalle, İlçe / Şehir" />
            <div className="grid grid-cols-2 gap-3">
              <FInput label="Telefon" value={data.telefon} onChange={v => upd("telefon", v)} onBlur={() => upd("telefon", formatPhone(data.telefon))} placeholder="0555 555 55 55" />
              <FInput label="E-posta" value={data.email} onChange={v => upd("email", v)} placeholder="ornek@mail.com" />
            </div>
          </div>
        )}

        {/* ── ADIM 2 ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Hakkımda</label>
              <textarea value={data.hakkimda} onChange={e => upd("hakkimda", e.target.value)} rows={4}
                placeholder="'Yapay Zeka ile Doldur' butonuna basın veya kendiniz yazın..."
                className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold">Deneyimler</label>
                <button onClick={addDeneyim} className="flex items-center gap-1 text-[11px] text-accent"><Plus className="w-3.5 h-3.5" /> Ekle</button>
              </div>
              {data.deneyimler.map((d, i) => (
                <div key={d.id} className="glass-card rounded-xl p-3 mb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{i + 1}. Deneyim</span>
                    {data.deneyimler.length > 1 && <button onClick={() => removeDeneyim(d.id)} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-[10px] text-muted-foreground mb-1">Görev/Unvan</label><input value={d.title} onChange={e => updDeneyim(d.id, "title", e.target.value)} className="w-full bg-background/50 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none" /></div>
                    <div><label className="block text-[10px] text-muted-foreground mb-1">Şirket/Kurum</label><input value={d.company} onChange={e => updDeneyim(d.id, "company", e.target.value)} className="w-full bg-background/50 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none" /></div>
                  </div>
                  <div><label className="block text-[10px] text-muted-foreground mb-1">Dönem</label><input value={d.period} onChange={e => updDeneyim(d.id, "period", e.target.value)} className="w-full bg-background/50 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none" /></div>
                  <div><label className="block text-[10px] text-muted-foreground mb-1">Açıklama</label><textarea value={d.desc} onChange={e => updDeneyim(d.id, "desc", e.target.value)} rows={2} className="w-full bg-background/50 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none resize-none" /></div>
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold">Sertifikalar & Belgeler</label>
                <button onClick={addCert} className="flex items-center gap-1 text-[11px] text-accent"><Plus className="w-3.5 h-3.5" /> Ekle</button>
              </div>
              {data.sertifikalar.map(cert => (
                <div key={cert.id} className="flex items-center gap-2 mb-2">
                  <input value={cert.name} onChange={e => updCert(cert.id, "name", e.target.value)} placeholder="Sertifika adı"
                    className="flex-1 bg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                  <input value={cert.year} onChange={e => updCert(cert.id, "year", e.target.value)} placeholder="2021"
                    className="w-16 bg-card border border-white/10 rounded-lg px-2 py-2 text-sm text-foreground outline-none" />
                  <button onClick={() => removeCert(cert.id)} className="text-destructive shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ADIM 3 ── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold">Yetenekler</label>
                <button onClick={addSkill} className="flex items-center gap-1 text-[11px] text-accent"><Plus className="w-3.5 h-3.5" /> Ekle</button>
              </div>
              {data.yetenekler.map(s => (
                <div key={s.id} className="flex items-center gap-2 mb-2">
                  <input value={s.name} onChange={e => updSkill(s.id, "name", e.target.value)} placeholder="Yetenek adı"
                    className="flex-1 bg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                  <select value={s.level} onChange={e => updSkill(s.id, "level", Number(e.target.value))}
                    className="bg-card border border-white/10 rounded-lg px-2 py-2 text-sm text-foreground outline-none w-20">
                    {[1, 2, 3, 4, 5].map(l => <option key={l} value={l}>{l}/5</option>)}
                  </select>
                  {data.yetenekler.length > 1 && <button onClick={() => removeSkill(s.id)} className="text-destructive shrink-0"><Trash2 className="w-4 h-4" /></button>}
                </div>
              ))}
            </div>
            <FInput label="Hobiler (virgülle ayırın)" value={data.hobiler} onChange={v => upd("hobiler", v)} placeholder="Balık Tutmak, Müzik, Araba Sürme" />
            <div>
              <label className="text-xs font-bold block mb-2">Kişilik Özellikleri (en fazla 8)</label>
              <div className="flex flex-wrap gap-2">
                {OZELLIK_LISTESI.map(o => {
                  const sel = data.ozellikler.includes(o);
                  return (
                    <button key={o} onClick={() => toggleOzellik(o)}
                      className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-all ${sel ? "bg-primary/20 border-primary text-primary" : "bg-card border-white/10 text-muted-foreground hover:border-primary/30"}`}>
                      {sel && <Check className="w-3 h-3" />}{o}
                    </button>
                  );
                })}
              </div>
            </div>
            <FInput label="Motto / İmza Cümlesi" value={data.motto} onChange={v => upd("motto", v)} />
          </div>
        )}

        {/* ── ADIM 4 ── */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold mb-2">CV Şablonu</p>
              <div className="grid grid-cols-3 gap-2">
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setSelTpl(t.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${selTpl === t.id ? "border-primary bg-primary/10" : "border-white/10 glass-card hover:border-primary/30"}`}>
                    <div className="text-xs font-semibold leading-tight">{t.name}</div>
                    <div className="text-[10px] text-muted-foreground">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold mb-2">Vurgu Rengi</p>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((p, i) => (
                  <button key={i} onClick={() => setSelColor(i)} title={p.label}
                    className={`w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center ${selColor === i ? "border-white scale-110 shadow-lg" : "border-transparent"}`}
                    style={{ background: p.c }}>
                    {selColor === i && <Check className="w-4 h-4 text-white" style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.8))" }} />}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{PALETTE[selColor]?.label} seçildi</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(true)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-card border border-white/10 rounded-xl text-sm font-medium hover:border-primary/40 transition-all">
                <Eye className="w-4 h-4 text-accent" /> Önizle
              </button>
              <button onClick={handleDownload} disabled={isDownload} className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary rounded-xl text-sm font-bold text-white hover:bg-primary/80 transition-all disabled:opacity-60">
                <Download className="w-4 h-4" />{isDownload ? "Hazırlanıyor..." : "PDF İndir"}
              </button>
            </div>
            <div className="glass-card rounded-2xl overflow-hidden" style={{ maxHeight: "55vh" }}>
              <div style={{ transform: "scale(0.45)", transformOrigin: "top left", width: "222%", pointerEvents: "none" }}>
                <Tmpl data={data} photo={photo} color={color} />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          {step > 1 && <button onClick={() => setStep(s => s - 1)} className="flex items-center gap-2 px-5 py-3 glass-card rounded-xl text-sm font-medium border border-white/10 hover:border-primary/30 transition-all"><ChevronLeft className="w-4 h-4" /> Geri</button>}
          {step < 4 && <button onClick={goNext} disabled={isSyncing} className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary rounded-xl text-sm font-bold text-white hover:bg-primary/80 transition-all disabled:opacity-60">İleri <ChevronRight className="w-4 h-4" /></button>}
        </div>
      </div>

      {/* Gizli PDF render */}
      <div style={{ position: "absolute", left: "-9999px", top: 0, pointerEvents: "none" }}>
        <div ref={cvRef}><Tmpl data={data} photo={photo} color={color} /></div>
      </div>

      {/* Tam Ekran Önizleme */}
      {showPreview && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-white/10 shrink-0">
            <span className="font-bold text-sm">{TEMPLATES[selTpl]?.name} · {PALETTE[selColor]?.label}</span>
            <div className="flex gap-2">
              <button onClick={handleDownload} disabled={isDownload} className="flex items-center gap-1.5 text-xs bg-primary px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-60">
                <Download className="w-3 h-3" />{isDownload ? "..." : "PDF İndir"}
              </button>
              <button onClick={() => setPreview(false)} className="text-xs border border-white/20 px-3 py-1.5 rounded-lg">Kapat</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2">
            <div style={{ transform: "scale(0.47)", transformOrigin: "top left", width: "213%", pointerEvents: "none" }}>
              <Tmpl data={data} photo={photo} color={color} />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
