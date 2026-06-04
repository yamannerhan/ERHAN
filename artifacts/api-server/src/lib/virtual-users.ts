export interface VirtualUser {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  nameColor: string | null;
  nameAnimated: boolean;
  role: string;
  isBot: boolean;
  isFake: boolean;
}

export const VIRTUAL_USERS: Record<number, VirtualUser> = {
  0: {
    username: "GuvenlikBot", displayName: "GuvenlikBot",
    avatarUrl: null, nameColor: "#06B6D4", nameAnimated: false,
    role: "bot", isBot: true, isFake: false,
  },
  [-999]: {
    username: "BİLGİ_BOTU", displayName: "BİLGİ BOTU",
    avatarUrl: null, nameColor: "#22C55E", nameAnimated: false,
    role: "bot", isBot: true, isFake: false,
  },
  [-1]:  { username: "mehmet_k",  displayName: "Mehmet",  avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-2]:  { username: "ayse_g",    displayName: "Ayşe",    avatarUrl: "https://randomuser.me/api/portraits/women/44.jpg", nameColor: "#a78bfa", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-3]:  { username: "ali_demir", displayName: "Ali",     avatarUrl: "https://randomuser.me/api/portraits/men/45.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-4]:  { username: "fatma_y",   displayName: "Fatma",   avatarUrl: "https://randomuser.me/api/portraits/women/68.jpg", nameColor: "#f9a8d4", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-5]:  { username: "hasan_b",   displayName: "Hasan",   avatarUrl: "https://randomuser.me/api/portraits/men/52.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-6]:  { username: "zeynep_a",  displayName: "Zeynep",  avatarUrl: "https://randomuser.me/api/portraits/women/12.jpg", nameColor: "#67e8f9", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-7]:  { username: "ibrahim_s", displayName: "İbrahim", avatarUrl: "https://randomuser.me/api/portraits/men/76.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-8]:  { username: "selin_c",   displayName: "Selin",   avatarUrl: "https://randomuser.me/api/portraits/women/33.jpg", nameColor: "#86efac", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-9]:  { username: "murat_d",   displayName: "Murat",   avatarUrl: "https://randomuser.me/api/portraits/men/19.jpg",   nameColor: "#fbbf24", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-10]: { username: "gulsum_k",  displayName: "Gülsüm",  avatarUrl: "https://randomuser.me/api/portraits/women/57.jpg", nameColor: "#f472b6", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-11]: { username: "taner_y",   displayName: "Taner",   avatarUrl: "https://randomuser.me/api/portraits/men/85.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-12]: { username: "hacer_o",   displayName: "Hacer",   avatarUrl: "https://randomuser.me/api/portraits/women/90.jpg", nameColor: "#a3e635", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-13]: { username: "kemal_p",   displayName: "Kemal",   avatarUrl: "https://randomuser.me/api/portraits/men/42.jpg",   nameColor: "#fb923c", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-14]: { username: "nese_b",    displayName: "Neşe",    avatarUrl: "https://randomuser.me/api/portraits/women/22.jpg", nameColor: "#e879f9", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-15]: { username: "cengiz_t",  displayName: "Cengiz",  avatarUrl: "https://randomuser.me/api/portraits/men/60.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-16]: { username: "rukiye_s",  displayName: "Rukiye",  avatarUrl: "https://randomuser.me/api/portraits/women/78.jpg", nameColor: "#34d399", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-17]: { username: "burak_a",   displayName: "Burak",   avatarUrl: "https://randomuser.me/api/portraits/men/11.jpg",   nameColor: "#60a5fa", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-18]: { username: "derya_m",   displayName: "Derya",   avatarUrl: "https://randomuser.me/api/portraits/women/25.jpg", nameColor: "#f0abfc", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-19]: { username: "serkan_o",  displayName: "Serkan",  avatarUrl: "https://randomuser.me/api/portraits/men/36.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-20]: { username: "emine_k",   displayName: "Emine",   avatarUrl: "https://randomuser.me/api/portraits/women/51.jpg", nameColor: "#fda4af", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-21]: { username: "osman_c",   displayName: "Osman",   avatarUrl: "https://randomuser.me/api/portraits/men/62.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-22]: { username: "hatice_b",  displayName: "Hatice",  avatarUrl: "https://randomuser.me/api/portraits/women/63.jpg", nameColor: "#d8b4fe", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-23]: { username: "yusuf_d",   displayName: "Yusuf",   avatarUrl: "https://randomuser.me/api/portraits/men/71.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-24]: { username: "merve_s",   displayName: "Merve",   avatarUrl: "https://randomuser.me/api/portraits/women/36.jpg", nameColor: "#6ee7b7", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-25]: { username: "kadir_y",   displayName: "Kadir",   avatarUrl: "https://randomuser.me/api/portraits/men/88.jpg",   nameColor: "#fdba74", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-26]: { username: "sibel_t",   displayName: "Sibel",   avatarUrl: "https://randomuser.me/api/portraits/women/82.jpg", nameColor: "#93c5fd", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-27]: { username: "volkan_k",  displayName: "Volkan",  avatarUrl: "https://randomuser.me/api/portraits/men/17.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-28]: { username: "gulcan_d",  displayName: "Gülcan",  avatarUrl: "https://randomuser.me/api/portraits/women/9.jpg",  nameColor: "#fca5a5", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-29]: { username: "erhan_m",   displayName: "Erhan",   avatarUrl: "https://randomuser.me/api/portraits/men/55.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-30]: { username: "ozlem_b",   displayName: "Özlem",   avatarUrl: "https://randomuser.me/api/portraits/women/40.jpg", nameColor: "#a5b4fc", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-31]: { username: "cem_a",     displayName: "Cem",     avatarUrl: "https://randomuser.me/api/portraits/men/28.jpg",   nameColor: "#94a3b8", nameAnimated: false, role: "user", isBot: false, isFake: true },
  [-32]: { username: "hulya_g",   displayName: "Hülya",   avatarUrl: "https://randomuser.me/api/portraits/women/66.jpg", nameColor: "#f9a8d4", nameAnimated: false, role: "user", isBot: false, isFake: true },
};
