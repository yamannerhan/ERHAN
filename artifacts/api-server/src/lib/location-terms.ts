// İl / ilçe / OSB / semt / işyeri anahtar kelimeleri — filtreleme ve konum çıkarımı için tek kaynak.

export type LocationKeyword = {
  term: string;
  display: string;
  district?: string;
  neighborhood?: string;
};

export type ProvinceKeywords = {
  aliases: string[];
  districts: string[];
  terms: LocationKeyword[];
};

function asciiKey(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

function termVariants(term: string): string[] {
  const trimmed = term.trim().replace(/\s+/g, " ");
  const normalized = asciiKey(trimmed);
  return [...new Set([trimmed, trimmed.toLocaleLowerCase("tr-TR"), normalized, normalized.replace(/\s+/g, "")].filter(Boolean))];
}

function kw(term: string, display: string, district?: string, neighborhood?: string): LocationKeyword {
  return { term, display, district, neighborhood };
}

export const REGIONAL_LOCATION_KEYWORDS: Record<string, ProvinceKeywords> = {
  Kocaeli: {
    aliases: ["kocaeli", "izmit"],
    districts: [
      "İzmit", "Gebze", "Çayırova", "Darıca", "Dilovası", "Körfez", "Derince", "Başiskele",
      "Kartepe", "Gölcük", "Karamürsel", "Kandıra",
    ],
    terms: [
      kw("gosb", "Kocaeli / Gebze OSB", "Gebze", "GOSB"),
      kw("gebze osb", "Kocaeli / Gebze OSB", "Gebze"),
      kw("gebze organize sanayi bölgesi", "Kocaeli / Gebze OSB", "Gebze"),
      kw("tosb", "Kocaeli / TOSB", "Gebze"),
      kw("gebkim", "Kocaeli / GEBKİM", "Gebze"),
      kw("imes osb", "Kocaeli / İMES OSB", "Gebze"),
      kw("plastikçiler osb", "Kocaeli / Plastikçiler OSB", "Gebze"),
      kw("kimya ihtisas osb", "Kocaeli / Kimya İhtisas OSB", "Gebze"),
      kw("dilovası makine osb", "Kocaeli / Dilovası Makine OSB", "Dilovası"),
      kw("demirciler osb", "Kocaeli / Demirciler OSB", "Gebze"),
      kw("kartepe osb", "Kocaeli / Kartepe OSB", "Kartepe"),
      kw("asım kibar osb", "Kocaeli / Asım Kibar OSB", "Gebze"),
      kw("kömürcüler osb", "Kocaeli / Kömürcüler OSB", "Gebze"),
      kw("şekerpınar", "Kocaeli / Çayırova / Şekerpınar", "Çayırova", "Şekerpınar"),
      kw("balçık", "Kocaeli / Gebze / Balçık", "Gebze", "Balçık"),
      kw("beylikbağı", "Kocaeli / Gebze / Beylikbağı", "Gebze", "Beylikbağı"),
      kw("kirazpınar", "Kocaeli / Gebze / Kirazpınar", "Gebze", "Kirazpınar"),
      kw("yarımca", "Kocaeli / Körfez / Yarımca", "Körfez", "Yarımca"),
      kw("hereke", "Kocaeli / Körfez / Hereke", "Körfez", "Hereke"),
      kw("tütünçiftlik", "Kocaeli / İzmit / Tütünçiftlik", "İzmit", "Tütünçiftlik"),
      kw("köseköy", "Kocaeli / Kartepe / Köseköy", "Kartepe", "Köseköy"),
      kw("arslanbey", "Kocaeli / Kartepe / Arslanbey", "Kartepe", "Arslanbey"),
      kw("maşukiye", "Kocaeli / Kartepe / Maşukiye", "Kartepe", "Maşukiye"),
      kw("kullar", "Kocaeli / Kartepe / Kullar", "Kartepe", "Kullar"),
      kw("bahçecik", "Kocaeli / Kartepe / Bahçecik", "Kartepe", "Bahçecik"),
      kw("yuvacık", "Kocaeli / Başiskele / Yuvacık", "Başiskele", "Yuvacık"),
      kw("değirmendere", "Kocaeli / Kartepe / Değirmendere", "Kartepe", "Değirmendere"),
      kw("halıdere", "Kocaeli / Gölcük / Halıdere", "Gölcük", "Halıdere"),
      kw("yazlık", "Kocaeli / Körfez / Yazlık", "Körfez", "Yazlık"),
      kw("yahya kaptan", "Kocaeli / İzmit / Yahya Kaptan", "İzmit", "Yahya Kaptan"),
      kw("yenişehir", "Kocaeli / İzmit / Yenişehir", "İzmit", "Yenişehir"),
      kw("bekirdere", "Kocaeli / Körfez / Bekirdere", "Körfez", "Bekirdere"),
      kw("alikahya", "Kocaeli / İzmit / Alikahya", "İzmit", "Alikahya"),
      kw("ford otosan", "Kocaeli / Gölcük / Ford Otosan", "Gölcük"),
      kw("hyundai", "Kocaeli / İzmit / Hyundai", "İzmit"),
      kw("brisa", "Kocaeli / Körfez / Brisa", "Körfez"),
      kw("goodyear", "Kocaeli / İzmit / Goodyear", "İzmit"),
      kw("pirelli", "Kocaeli / İzmit / Pirelli", "İzmit"),
      kw("polisan", "Kocaeli / Gebze / Polisan", "Gebze"),
      kw("gübretaş", "Kocaeli / İzmit / Gübretaş", "İzmit"),
      kw("tüpraş", "Kocaeli / Körfez / TÜPRAŞ", "Körfez"),
      kw("çolakoğlu", "Kocaeli / Dilovası / Çolakoğlu", "Dilovası"),
      kw("assan hanil", "Kocaeli / Dilovası / Assan Hanil", "Dilovası"),
      kw("assan alüminyum", "Kocaeli / Dilovası / Assan Alüminyum", "Dilovası"),
      kw("posco assan", "Kocaeli / Kocaeli / Posco Assan", "Körfez"),
      kw("sarkuysan", "Kocaeli / Dilovası / Sarkuysan", "Dilovası"),
      kw("nuh çimento", "Kocaeli / Körfez / Nuh Çimento", "Körfez"),
      kw("yıldız entegre", "Kocaeli / Gebze / Yıldız Entegre", "Gebze"),
      kw("dp world", "Kocaeli / Köseköy / DP World", "Kartepe"),
      kw("evyap", "Kocaeli / Körfez / Evyap", "Körfez"),
      kw("safiport", "Kocaeli / Derince / Safiport", "Derince"),
      kw("autoport", "Kocaeli / Gebze / Autoport", "Gebze"),
    ],
  },
  İstanbul: {
    aliases: ["istanbul", "i̇stanbul"],
    districts: [
      "Adalar", "Arnavutköy", "Ataşehir", "Avcılar", "Bağcılar", "Bahçelievler", "Bakırköy",
      "Başakşehir", "Bayrampaşa", "Beşiktaş", "Beykoz", "Beylikdüzü", "Beyoğlu", "Büyükçekmece",
      "Çatalca", "Çekmeköy", "Esenler", "Esenyurt", "Eyüpsultan", "Fatih", "Gaziosmanpaşa",
      "Güngören", "Kadıköy", "Kağıthane", "Kartal", "Küçükçekmece", "Maltepe", "Pendik",
      "Sancaktepe", "Sarıyer", "Silivri", "Sultanbeyli", "Sultangazi", "Şile", "Şişli",
      "Tuzla", "Ümraniye", "Üsküdar", "Zeytinburnu",
    ],
    terms: [
      kw("ikitelli osb", "İstanbul / Başakşehir / İkitelli OSB", "Başakşehir", "İkitelli OSB"),
      kw("dudullu osb", "İstanbul / Ümraniye / Dudullu OSB", "Ümraniye", "Dudullu OSB"),
      kw("anadolu yakası osb", "İstanbul / Anadolu Yakası OSB"),
      kw("beylikdüzü osb", "İstanbul / Beylikdüzü OSB", "Beylikdüzü"),
      kw("birlik osb", "İstanbul / Esenyurt / Birlik OSB", "Esenyurt"),
      kw("tuzla osb", "İstanbul / Tuzla OSB", "Tuzla"),
      kw("tuzla kimya osb", "İstanbul / Tuzla Kimya OSB", "Tuzla"),
      kw("idosb", "İstanbul / Tuzla / İDOSB", "Tuzla"),
      kw("istanbul deri osb", "İstanbul / Tuzla / Deri OSB", "Tuzla"),
      kw("ikitelli", "İstanbul / Başakşehir / İkitelli", "Başakşehir", "İkitelli"),
      kw("dudullu", "İstanbul / Ümraniye / Dudullu", "Ümraniye", "Dudullu"),
      kw("hadımköy", "İstanbul / Arnavutköy / Hadımköy", "Arnavutköy", "Hadımköy"),
      kw("haramidere", "İstanbul / Avcılar / Haramidere", "Avcılar", "Haramidere"),
      kw("güneşli", "İstanbul / Bağcılar / Güneşli", "Bağcılar", "Güneşli"),
      kw("yenibosna", "İstanbul / Bahçelievler / Yenibosna", "Bahçelievler", "Yenibosna"),
      kw("halkalı", "İstanbul / Küçükçekmece / Halkalı", "Küçükçekmece", "Halkalı"),
      kw("sefaköy", "İstanbul / Küçükçekmece / Sefaköy", "Küçükçekmece", "Sefaköy"),
      kw("bahçeşehir", "İstanbul / Başakşehir / Bahçeşehir", "Başakşehir", "Bahçeşehir"),
      kw("kayaşehir", "İstanbul / Başakşehir / Kayaşehir", "Başakşehir", "Kayaşehir"),
      kw("istoç", "İstanbul / Bağcılar / İSTOÇ", "Bağcılar", "İSTOÇ"),
      kw("masko", "İstanbul / Başakşehir / MASKO", "Başakşehir", "MASKO"),
      kw("modoko", "İstanbul / Ümraniye / Modoko", "Ümraniye", "Modoko"),
      kw("perpa", "İstanbul / Şişli / Perpa", "Şişli", "Perpa"),
      kw("imes", "İstanbul / Sancaktepe / İMES", "Sancaktepe", "İMES"),
      kw("des", "İstanbul / Ümraniye / DES", "Ümraniye", "DES"),
      kw("kadosan", "İstanbul / Ümraniye / Kadosan", "Ümraniye", "Kadosan"),
      kw("beysan", "İstanbul / Ümraniye / Beysan", "Ümraniye", "Beysan"),
      kw("mermerciler", "İstanbul / Beylikdüzü / Mermerciler", "Beylikdüzü", "Mermerciler"),
      kw("kurtköy", "İstanbul / Pendik / Kurtköy", "Pendik", "Kurtköy"),
      kw("orhanlı", "İstanbul / Tuzla / Orhanlı", "Tuzla", "Orhanlı"),
      kw("aydınlı", "İstanbul / Tuzla / Aydınlı", "Tuzla", "Aydınlı"),
      kw("tepeören", "İstanbul / Tuzla / Tepeören", "Tuzla", "Tepeören"),
      kw("levent", "İstanbul / Beşiktaş / Levent", "Beşiktaş", "Levent"),
      kw("maslak", "İstanbul / Sarıyer / Maslak", "Sarıyer", "Maslak"),
      kw("mecidiyeköy", "İstanbul / Şişli / Mecidiyeköy", "Şişli", "Mecidiyeköy"),
      kw("gayrettepe", "İstanbul / Şişli / Gayrettepe", "Şişli", "Gayrettepe"),
      kw("zincirlikuyu", "İstanbul / Şişli / Zincirlikuyu", "Şişli", "Zincirlikuyu"),
      kw("kozyatağı", "İstanbul / Kadıköy / Kozyatağı", "Kadıköy", "Kozyatağı"),
      kw("içerenköy", "İstanbul / Ataşehir / İçerenköy", "Ataşehir", "İçerenköy"),
      kw("bostancı", "İstanbul / Kadıköy / Bostancı", "Kadıköy", "Bostancı"),
      kw("fikirtepe", "İstanbul / Kadıköy / Fikirtepe", "Kadıköy", "Fikirtepe"),
      kw("istanbul havalimanı", "İstanbul / Arnavutköy / İstanbul Havalimanı", "Arnavutköy"),
      kw("sabiha gökçen", "İstanbul / Pendik / Sabiha Gökçen", "Pendik"),
      kw("ambarlı", "İstanbul / Avcılar / Ambarlı", "Avcılar", "Ambarlı"),
      kw("kumport", "İstanbul / Avcılar / Kumport", "Avcılar", "Kumport"),
      kw("marport", "İstanbul / Bakırköy / Marport", "Bakırköy", "Marport"),
      kw("haydarpaşa", "İstanbul / Kadıköy / Haydarpaşa", "Kadıköy", "Haydarpaşa"),
      kw("tuzla tersaneleri", "İstanbul / Tuzla / Tersaneler", "Tuzla"),
      kw("mall of istanbul", "İstanbul / Başakşehir / Mall of İstanbul", "Başakşehir"),
      kw("forum istanbul", "İstanbul / Bayrampaşa / Forum İstanbul", "Bayrampaşa"),
      kw("marmara forum", "İstanbul / Bakırköy / Marmara Forum", "Bakırköy"),
      kw("cevahir", "İstanbul / Şişli / Cevahir", "Şişli"),
      kw("kanyon", "İstanbul / Şişli / Kanyon", "Şişli"),
      kw("vadistanbul", "İstanbul / Sarıyer / Vadistanbul", "Sarıyer"),
      kw("zorlu center", "İstanbul / Beşiktaş / Zorlu Center", "Beşiktaş"),
      kw("akasya", "İstanbul / Üsküdar / Akasya", "Üsküdar"),
      kw("palladium", "İstanbul / Ataşehir / Palladium", "Ataşehir"),
      kw("emaar", "İstanbul / Üsküdar / Emaar", "Üsküdar"),
      kw("viaport", "İstanbul / Pendik / Viaport", "Pendik"),
    ],
  },
  Ankara: {
    aliases: ["ankara"],
    districts: [
      "Çankaya", "Keçiören", "Yenimahalle", "Etimesgut", "Sincan", "Mamak", "Altındağ",
      "Gölbaşı", "Pursaklar", "Akyurt", "Kahramankazan", "Çubuk", "Polatlı", "Ayaş",
      "Haymana", "Elmadağ", "Şereflikoçhisar",
    ],
    terms: [
      kw("ostim", "Ankara / Yenimahalle / OSTİM", "Yenimahalle", "OSTİM"),
      kw("ivedik osb", "Ankara / Yenimahalle / İvedik OSB", "Yenimahalle"),
      kw("aso 1", "Ankara / Sincan / ASO 1", "Sincan"),
      kw("aso 2", "Ankara / Sincan / ASO 2", "Sincan"),
      kw("aso 3", "Ankara / Sincan / ASO 3", "Sincan"),
      kw("başkent osb", "Ankara / Sincan / Başkent OSB", "Sincan"),
      kw("anadolu osb", "Ankara / Akyurt / Anadolu OSB", "Akyurt"),
      kw("polatlı osb", "Ankara / Polatlı OSB", "Polatlı"),
      kw("dökümcüler osb", "Ankara / Sincan / Dökümcüler OSB", "Sincan"),
      kw("uzay ve havacılık osb", "Ankara / Kahramankazan / Uzay OSB", "Kahramankazan"),
      kw("kızılay", "Ankara / Çankaya / Kızılay", "Çankaya", "Kızılay"),
      kw("balgat", "Ankara / Çankaya / Balgat", "Çankaya", "Balgat"),
      kw("çukurambar", "Ankara / Çankaya / Çukurambar", "Çankaya", "Çukurambar"),
      kw("dikmen", "Ankara / Çankaya / Dikmen", "Çankaya", "Dikmen"),
      kw("ayrancı", "Ankara / Çankaya / Ayrancı", "Çankaya", "Ayrancı"),
      kw("çankaya oran", "Ankara / Çankaya / Oran", "Çankaya", "Oran"),
      kw("batıkent", "Ankara / Yenimahalle / Batıkent", "Yenimahalle", "Batıkent"),
      kw("eryaman", "Ankara / Etimesgut / Eryaman", "Etimesgut", "Eryaman"),
      kw("bağlıca", "Ankara / Etimesgut / Bağlıca", "Etimesgut", "Bağlıca"),
      kw("elvankent", "Ankara / Etimesgut / Elvankent", "Etimesgut", "Elvankent"),
      kw("temelli", "Ankara / Gölbaşı / Temelli", "Gölbaşı", "Temelli"),
      kw("şaşmaz", "Ankara / Etimesgut / Şaşmaz", "Etimesgut", "Şaşmaz"),
      kw("gimat", "Ankara / Yenimahalle / Gimat", "Yenimahalle", "Gimat"),
      kw("siteler", "Ankara / Altındağ / Siteler", "Altındağ", "Siteler"),
      kw("iskitler", "Ankara / Altındağ / İskitler", "Altındağ", "İskitler"),
      kw("macunköy", "Ankara / Yenimahalle / Macunköy", "Yenimahalle", "Macunköy"),
      kw("ergazi", "Ankara / Yenimahalle / Ergazi", "Yenimahalle", "Ergazi"),
      kw("etlik", "Ankara / Keçiören / Etlik", "Keçiören", "Etlik"),
      kw("incek", "Ankara / Gölbaşı / İncek", "Gölbaşı", "İncek"),
      kw("saray", "Ankara / Kahramankazan / Saray", "Kahramankazan", "Saray"),
      kw("esenboğa havalimanı", "Ankara / Akyurt / Esenboğa", "Akyurt"),
      kw("aselsan", "Ankara / Yenimahalle / ASELSAN", "Yenimahalle"),
      kw("tusaş", "Ankara / Kahramankazan / TUSAŞ", "Kahramankazan"),
      kw("roketsan", "Ankara / Elmadağ / ROKETSAN", "Elmadağ"),
      kw("havelsan", "Ankara / Yenimahalle / HAVELSAN", "Yenimahalle"),
      kw("mke", "Ankara / Kahramankazan / MKE", "Kahramankazan"),
      kw("türk traktör", "Ankara / Sincan / Türk Traktör", "Sincan"),
      kw("bosch sincan", "Ankara / Sincan / Bosch", "Sincan"),
      kw("siemens", "Ankara / Sincan / Siemens", "Sincan"),
      kw("fnss", "Ankara / Sincan / FNSS", "Sincan"),
      kw("bmc power", "Ankara / Sincan / BMC Power", "Sincan"),
    ],
  },
  İzmir: {
    aliases: ["izmir", "i̇zmir"],
    districts: [
      "Konak", "Karşıyaka", "Bornova", "Buca", "Bayraklı", "Karabağlar", "Balçova",
      "Narlıdere", "Gaziemir", "Çiğli", "Menemen", "Aliağa", "Foça", "Dikili", "Bergama",
      "Kemalpaşa", "Torbalı", "Menderes", "Urla", "Çeşme", "Seferihisar", "Selçuk", "Tire",
      "Ödemiş", "Kiraz", "Beydağ",
    ],
    terms: [
      kw("atatürk osb", "İzmir / Çiğli / Atatürk OSB", "Çiğli", "Atatürk OSB"),
      kw("iaosb", "İzmir / Çiğli / İAOSB", "Çiğli"),
      kw("kemalpaşa osb", "İzmir / Kemalpaşa OSB", "Kemalpaşa"),
      kw("kosbi", "İzmir / Bornova / KOSBİ", "Bornova"),
      kw("bağyurdu osb", "İzmir / Kemalpaşa / Bağyurdu OSB", "Kemalpaşa"),
      kw("pancar osb", "İzmir / Torbalı / Pancar OSB", "Torbalı"),
      kw("itob", "İzmir / Menderes / İTOB", "Menderes"),
      kw("torbalı osb", "İzmir / Torbalı OSB", "Torbalı"),
      kw("aliağa kimya osb", "İzmir / Aliağa Kimya OSB", "Aliağa"),
      kw("menemen plastik osb", "İzmir / Menemen Plastik OSB", "Menemen"),
      kw("alsancak", "İzmir / Konak / Alsancak", "Konak", "Alsancak"),
      kw("kordon", "İzmir / Konak / Kordon", "Konak", "Kordon"),
      kw("basmane", "İzmir / Konak / Basmane", "Konak", "Basmane"),
      kw("şirinyer", "İzmir / Buca / Şirinyer", "Buca", "Şirinyer"),
      kw("buca hatay", "İzmir / Buca / Hatay", "Buca", "Hatay"),
      kw("güzelyalı", "İzmir / Konak / Güzelyalı", "Konak", "Güzelyalı"),
      kw("pınarbaşı", "İzmir / Bornova / Pınarbaşı", "Bornova", "Pınarbaşı"),
      kw("ışıkkent", "İzmir / Bornova / Işıkkent", "Bornova", "Işıkkent"),
      kw("mavişehir", "İzmir / Karşıyaka / Mavişehir", "Karşıyaka", "Mavişehir"),
      kw("bostanlı", "İzmir / Karşıyaka / Bostanlı", "Karşıyaka", "Bostanlı"),
      kw("ulucak", "İzmir / Kemalpaşa / Ulucak", "Kemalpaşa", "Ulucak"),
      kw("bağyurdu", "İzmir / Kemalpaşa / Bağyurdu", "Kemalpaşa", "Bağyurdu"),
      kw("ayrancılar", "İzmir / Torbalı / Ayrancılar", "Torbalı", "Ayrancılar"),
      kw("tepeköy", "İzmir / Menderes / Tepeköy", "Menderes", "Tepeköy"),
      kw("tekeli", "İzmir / Menderes / Tekeli", "Menderes", "Tekeli"),
      kw("sasalı", "İzmir / Çiğli / Sasalı", "Çiğli", "Sasalı"),
      kw("ege serbest bölgesi", "İzmir / Gaziemir / Ege Serbest Bölgesi", "Gaziemir"),
      kw("esbaş", "İzmir / Gaziemir / ESBAŞ", "Gaziemir"),
      kw("adnan menderes havalimanı", "İzmir / Gaziemir / Adnan Menderes", "Gaziemir"),
      kw("alsancak limanı", "İzmir / Konak / Alsancak Limanı", "Konak"),
      kw("aliağa limanı", "İzmir / Aliağa Limanı", "Aliağa"),
      kw("nemrut limanı", "İzmir / Aliağa / Nemrut Limanı", "Aliağa"),
      kw("petlim", "İzmir / Aliağa / Petlim", "Aliağa"),
      kw("petkim", "İzmir / Aliağa / PETKİM", "Aliağa"),
      kw("tüpraş aliağa", "İzmir / Aliağa / Tüpraş", "Aliağa"),
      kw("habaş", "İzmir / Aliağa / HABAŞ", "Aliağa"),
      kw("philip morris", "İzmir / Torbalı / Philip Morris", "Torbalı"),
      kw("jti", "İzmir / Torbalı / JTI", "Torbalı"),
      kw("cms jant", "İzmir / Kemalpaşa / CMS Jant", "Kemalpaşa"),
      kw("pınar bornova", "İzmir / Bornova / Pınar", "Bornova"),
      kw("dyo", "İzmir / Bornova / DYO", "Bornova"),
      kw("hugo boss", "İzmir / Kemalpaşa / Hugo Boss", "Kemalpaşa"),
      kw("tpi kompozit", "İzmir / Kemalpaşa / TPI Kompozit", "Kemalpaşa"),
      kw("kocaer çelik", "İzmir / Kemalpaşa / Kocaer Çelik", "Kemalpaşa"),
    ],
  },
  Manisa: {
    aliases: ["manisa"],
    districts: [
      "Şehzadeler", "Yunusemre", "Akhisar", "Turgutlu", "Salihli", "Soma", "Alaşehir",
      "Kırkağaç", "Saruhanlı", "Kula", "Demirci", "Gördes", "Selendi", "Köprübaşı",
      "Ahmetli", "Gölmarmara",
    ],
    terms: [
      kw("manisa osb", "Manisa / Manisa OSB", "Yunusemre"),
      kw("mosb", "Manisa / MOSB", "Yunusemre"),
      kw("muradiye osb", "Manisa / Muradiye OSB", "Yunusemre"),
      kw("akhisar osb", "Manisa / Akhisar OSB", "Akhisar"),
      kw("turgutlu osb", "Manisa / Turgutlu OSB", "Turgutlu"),
      kw("salihli osb", "Manisa / Salihli OSB", "Salihli"),
      kw("soma osb", "Manisa / Soma OSB", "Soma"),
      kw("kula deri osb", "Manisa / Kula Deri OSB", "Kula"),
      kw("muradiye", "Manisa / Yunusemre / Muradiye", "Yunusemre", "Muradiye"),
      kw("keçiliköy", "Manisa / Yunusemre / Keçiliköy", "Yunusemre", "Keçiliköy"),
      kw("laleli", "Manisa / Yunusemre / Laleli", "Yunusemre", "Laleli"),
      kw("uncubozköy", "Manisa / Yunusemre / Uncubozköy", "Yunusemre", "Uncubozköy"),
      kw("horozköy", "Manisa / Yunusemre / Horozköy", "Yunusemre", "Horozköy"),
      kw("nurlupınar", "Manisa / Yunusemre / Nurlupınar", "Yunusemre", "Nurlupınar"),
      kw("karaağaçlı", "Manisa / Yunusemre / Karaağaçlı", "Yunusemre", "Karaağaçlı"),
      kw("akhisar sanayi", "Manisa / Akhisar Sanayi", "Akhisar"),
      kw("turgutlu sanayi", "Manisa / Turgutlu Sanayi", "Turgutlu"),
      kw("salihli sanayi", "Manisa / Salihli Sanayi", "Salihli"),
      kw("soma sanayi", "Manisa / Soma Sanayi", "Soma"),
      kw("vestel", "Manisa / Turgutlu / Vestel", "Turgutlu"),
      kw("vestel city", "Manisa / Turgutlu / Vestel City", "Turgutlu"),
      kw("bosch manisa", "Manisa / Yunusemre / Bosch", "Yunusemre"),
      kw("indesit", "Manisa / Turgutlu / Indesit", "Turgutlu"),
      kw("ferrero", "Manisa / Manisa / Ferrero", "Yunusemre"),
      kw("keskinoğlu", "Manisa / Salihli / Keskinoğlu", "Salihli"),
      kw("ülker", "Manisa / Akhisar / Ülker", "Akhisar"),
      kw("eczacıbaşı", "Manisa / Yunusemre / Eczacıbaşı", "Yunusemre"),
      kw("jantaş", "Manisa / Turgutlu / Jantaş", "Turgutlu"),
      kw("işbir sentetik", "Manisa / Yunusemre / İşbir Sentetik", "Yunusemre"),
      kw("orta anadolu", "Manisa / Yunusemre / Orta Anadolu", "Yunusemre"),
    ],
  },
};

let districtProvincesCache: Record<string, string> | null = null;
let provinceTermsCache: Record<string, string[]> | null = null;
let builtinTermsCache: { province: string; term: string; display: string }[] | null = null;
let supplementalNeighborhoodsCache: Record<string, { city: string; district?: string; neighborhood: string }> | null = null;
let supplementalDistrictsCache: Record<string, { city: string; district: string }> | null = null;

function ensureBuilt(): void {
  if (districtProvincesCache) return;

  const districtProvinces: Record<string, string> = {};
  const provinceTerms: Record<string, string[]> = {};
  const builtin: { province: string; term: string; display: string }[] = [];
  const neighborhoods: Record<string, { city: string; district?: string; neighborhood: string }> = {};
  const districts: Record<string, { city: string; district: string }> = {};

  for (const [province, data] of Object.entries(REGIONAL_LOCATION_KEYWORDS)) {
    const termsForProvince = new Set<string>();
    const addTerm = (raw: string) => {
      for (const variant of termVariants(raw)) {
        districtProvinces[variant] = province;
        termsForProvince.add(variant);
      }
    };

    addTerm(province);
    for (const alias of data.aliases) addTerm(alias);
    for (const district of data.districts) {
      addTerm(district);
      const key = asciiKey(district);
      districts[key] = { city: province, district };
      builtin.push({ province, term: district.toLocaleLowerCase("tr-TR"), display: `${province} / ${district}` });
      builtin.push({ province, term: key, display: `${province} / ${district}` });
    }
    for (const item of data.terms) {
      addTerm(item.term);
      builtin.push({ province, term: item.term, display: item.display });
      const key = asciiKey(item.term);
      if (item.neighborhood) {
        neighborhoods[key] = {
          city: province,
          district: item.district,
          neighborhood: item.neighborhood,
        };
      } else if (item.district) {
        districts[key] = { city: province, district: item.district };
      }
    }
    provinceTerms[province] = [...termsForProvince];
    provinceTerms[province.toLocaleLowerCase("tr-TR")] = [...termsForProvince];
    provinceTerms[asciiKey(province)] = [...termsForProvince];
  }

  districtProvincesCache = districtProvinces;
  provinceTermsCache = provinceTerms;
  builtinTermsCache = builtin;
  supplementalNeighborhoodsCache = neighborhoods;
  supplementalDistrictsCache = districts;
}

export function getRegionalDistrictProvinces(): Record<string, string> {
  ensureBuilt();
  return { ...districtProvincesCache! };
}

export function getProvinceMatchTerms(target: string): string[] {
  ensureBuilt();
  const raw = target.trim();
  if (!raw) return [];
  const lower = raw.toLocaleLowerCase("tr-TR");
  const ascii = asciiKey(raw);

  for (const province of Object.keys(REGIONAL_LOCATION_KEYWORDS)) {
    if (province.toLocaleLowerCase("tr-TR") === lower || asciiKey(province) === ascii) {
      return provinceTermsCache![province] ?? [lower, ascii];
    }
  }

  const direct = provinceTermsCache![lower] ?? provinceTermsCache![ascii];
  if (direct) return direct;

  return termVariants(raw);
}

export function getBuiltinRegionalFilterTerms(): { province: string; term: string; display: string }[] {
  ensureBuilt();
  return builtinTermsCache!;
}

export function getSupplementalNeighborhoods(): Record<string, { city: string; district?: string; neighborhood: string }> {
  ensureBuilt();
  return { ...supplementalNeighborhoodsCache! };
}

export function getSupplementalDistricts(): Record<string, { city: string; district: string }> {
  ensureBuilt();
  return { ...supplementalDistrictsCache! };
}

export function textMatchesProvince(text: string, province: string): boolean {
  const plain = text.toLocaleLowerCase("tr-TR");
  const asciiPlain = asciiKey(text);
  return getProvinceMatchTerms(province).some(term => {
    const t = term.toLocaleLowerCase("tr-TR");
    return plain.includes(t) || asciiPlain.includes(asciiKey(t));
  });
}
