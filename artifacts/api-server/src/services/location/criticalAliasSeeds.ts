/** Kritik OSB / serbest bölge alias seed — OSM öncesi ve sonrası */
export type CriticalAliasSeed = {
  alias: string;
  locationType: "industrial_zone" | "free_zone" | "business_district";
  province: string;
  district: string;
  name: string;
  ambiguous?: boolean;
};

export const CRITICAL_ALIAS_SEEDS: CriticalAliasSeed[] = [
  { alias: "GOSB", province: "Kocaeli", district: "Gebze", name: "Gebze Organize Sanayi Bölgesi", locationType: "industrial_zone" },
  { alias: "Gebze OSB", province: "Kocaeli", district: "Gebze", name: "Gebze Organize Sanayi Bölgesi", locationType: "industrial_zone" },
  { alias: "Güzeller OSB", province: "Kocaeli", district: "Gebze", name: "Güzeller OSB", locationType: "industrial_zone" },
  { alias: "GEPOSB", province: "Kocaeli", district: "Gebze", name: "GEPOSB", locationType: "industrial_zone" },
  { alias: "TOSB", province: "Kocaeli", district: "Çayırova", name: "TOSB", locationType: "industrial_zone" },
  { alias: "TAYSAD", province: "Kocaeli", district: "Çayırova", name: "TAYSAD", locationType: "industrial_zone" },
  { alias: "İMES Dilovası", province: "Kocaeli", district: "Dilovası", name: "İMES Dilovası", locationType: "industrial_zone" },
  { alias: "Dilovası OSB", province: "Kocaeli", district: "Dilovası", name: "Dilovası OSB", locationType: "industrial_zone" },
  { alias: "Tuzla OSB", province: "İstanbul", district: "Tuzla", name: "Tuzla OSB", locationType: "industrial_zone" },
  { alias: "Tuzla Deri Sanayi", province: "İstanbul", district: "Tuzla", name: "Tuzla Deri Sanayi", locationType: "industrial_zone" },
  { alias: "İstanbul Deri OSB", province: "İstanbul", district: "Tuzla", name: "İstanbul Deri OSB", locationType: "industrial_zone" },
  { alias: "Birlik OSB", province: "İstanbul", district: "Tuzla", name: "Birlik OSB", locationType: "industrial_zone" },
  { alias: "İkitelli OSB", province: "İstanbul", district: "Başakşehir", name: "İkitelli OSB", locationType: "industrial_zone" },
  { alias: "Dudullu OSB", province: "İstanbul", district: "Ümraniye", name: "Dudullu OSB", locationType: "industrial_zone" },
  { alias: "DES Sanayi Sitesi", province: "İstanbul", district: "Başakşehir", name: "DES Sanayi Sitesi", locationType: "industrial_zone" },
  { alias: "OSTİM", province: "Ankara", district: "Yenimahalle", name: "OSTİM", locationType: "industrial_zone" },
  { alias: "İvedik OSB", province: "Ankara", district: "Yenimahalle", name: "İvedik OSB", locationType: "industrial_zone" },
  { alias: "ESBAŞ", province: "İzmir", district: "Gaziemir", name: "Ege Serbest Bölgesi", locationType: "free_zone" },
  { alias: "Ege Serbest Bölgesi", province: "İzmir", district: "Gaziemir", name: "Ege Serbest Bölgesi", locationType: "free_zone" },
  { alias: "ÇOSB", province: "Tekirdağ", district: "Çerkezköy", name: "Çerkezköy OSB", locationType: "industrial_zone" },
  { alias: "Çerkezköy OSB", province: "Tekirdağ", district: "Çerkezköy", name: "Çerkezköy OSB", locationType: "industrial_zone" },
  { alias: "DOSAB", province: "Bursa", district: "Osmangazi", name: "DOSAB", locationType: "industrial_zone" },
  { alias: "NOSAB", province: "Bursa", district: "Nilüfer", name: "NOSAB", locationType: "industrial_zone" },
  { alias: "HOSAB", province: "Bursa", district: "Nilüfer", name: "HOSAB", locationType: "industrial_zone" },
  { alias: "Adana Hacı Sabancı OSB", province: "Adana", district: "Sarıçam", name: "Adana Hacı Sabancı OSB", locationType: "industrial_zone" },
  { alias: "AOSB", province: "Türkiye", district: "", name: "AOSB (belirsiz)", locationType: "industrial_zone", ambiguous: true },
];

/** 81 il — OSM sync öncesi bootstrap */
export const TURKEY_PROVINCES_81 = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir",
  "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli",
  "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari",
  "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir",
  "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir",
  "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat",
  "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman",
  "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce",
] as const;
