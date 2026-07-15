import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverWhatsAppSources,
  fetchMessagesFromChat,
  scanSelectedWhatsAppSources,
  selectedWhatsAppSources,
} from "./whatsapp-core";
import {
  normalizeTurkishWhatsAppPhone,
  startWhatsAppClient,
  WhatsAppStartError,
} from "./whatsapp-client";

const nowSeconds = Math.floor(Date.now() / 1000);

test("Türkiye WhatsApp telefon numarası yalnız rakama ve 90 önekine çevrilir", () => {
  assert.equal(normalizeTurkishWhatsAppPhone("+90 (532) 111-22-33"), "905321112233");
  assert.equal(normalizeTurkishWhatsAppPhone("0532 111 22 33"), "905321112233");
  assert.equal(normalizeTurkishWhatsAppPhone("5321112233"), "905321112233");
  assert.equal(normalizeTurkishWhatsAppPhone("0090 532 111 22 33"), "905321112233");
});

test("geçersiz Türkiye telefonu client oluşturmadan HTTP 400 sınıfı hata verir", async () => {
  await assert.rejects(
    () => startWhatsAppClient({ phoneNumber: "12345" }),
    (error: unknown) => {
      assert.ok(error instanceof WhatsAppStartError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "INVALID_PHONE");
      return true;
    },
  );
});

test("mock client.getChannels sonucu kanal kaydı oluşturur", async () => {
  const result = await discoverWhatsAppSources({
    getChats: async () => [],
    getChannels: async () => [{
      id: { _serialized: "120363000000@newsletter" },
      name: "Güvenlik Kanalı",
      subscribersCount: 125,
    }],
  });

  assert.deepEqual(result.sources, [{
    id: "120363000000@newsletter",
    name: "Güvenlik Kanalı",
    participants: 125,
    kind: "channel",
  }]);
  assert.equal(result.channelCount, 1);
});

test("getChats hata verirken kanallar yine kaydedilir", async () => {
  const result = await discoverWhatsAppSources({
    getChats: async () => { throw new Error("chat index failed"); },
    getChannels: async () => [{
      id: { _serialized: "120363111111@newsletter" },
      name: "İş İlanları",
    }],
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0]?.kind, "channel");
  assert.match(result.errors.join("\n"), /getChats hatası/);
});

test("getChannels hata verirken gruplar yine kaydedilir", async () => {
  const result = await discoverWhatsAppSources({
    getChats: async () => [{
      id: { _serialized: "120363222222@g.us" },
      name: "ÖGG İlan Grubu",
      isGroup: true,
      participants: [{}, {}],
    }],
    getChannels: async () => { throw new Error("channel index failed"); },
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0]?.kind, "group");
  assert.equal(result.sources[0]?.participants, 2);
  assert.match(result.errors.join("\n"), /getChannels hatası/);
});

test("seçili grubun mesajları kendi JID değeriyle çekilir", async () => {
  const jid = "120363333333@g.us";
  const result = await fetchMessagesFromChat({
    fetchMessages: async () => [{
      id: { _serialized: "message-1" },
      timestamp: nowSeconds,
      body: "İstanbul özel güvenlik görevlisi aranıyor. Başvuru 0555 111 22 33",
    }],
  }, jid, {
    cutoff: Date.now() - 86_400_000,
    limit: 50,
  });

  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0]?.remoteJid, jid);
  assert.match(result.messages[0]?.text ?? "", /güvenlik görevlisi/);
});

test("seçili olmayan kaynak taranmaz", async () => {
  const sources = [
    { id: 1, platform: "whatsapp", active: true },
    { id: 2, platform: "whatsapp", active: false },
    { id: 3, platform: "telegram", active: true },
  ];
  assert.deepEqual(selectedWhatsAppSources(sources).map((source) => source.id), [1]);

  const scanned: number[] = [];
  await scanSelectedWhatsAppSources(sources, async (source) => {
    scanned.push(source.id);
  });
  assert.deepEqual(scanned, [1]);
});

test("fetchMessages hatası sonraki seçili kaynağın taramasını durdurmaz", async () => {
  const sources = [
    { id: 1, platform: "whatsapp", active: true },
    { id: 2, platform: "whatsapp", active: true },
  ];
  const completed: number[] = [];

  const errors = await scanSelectedWhatsAppSources(sources, async (source) => {
    const result = await fetchMessagesFromChat({
      fetchMessages: source.id === 1
        ? async () => { throw new Error("fetch failed"); }
        : async () => [{
            id: { _serialized: "message-2" },
            timestamp: nowSeconds,
            caption: "Ankara güvenlik personeli alınacaktır. Maaş ve servis vardır.",
          }],
    }, `${source.id}@g.us`, {
      cutoff: Date.now() - 86_400_000,
      limit: 50,
    });
    if (source.id === 1) assert.match(result.diagnostics.join("\n"), /fetchMessages hatası/);
    if (source.id === 2) assert.equal(result.messages.length, 1);
    completed.push(source.id);
  });

  assert.deepEqual(completed, [1, 2]);
  assert.deepEqual(errors, []);
});

test("aynı mesaj kimliği tek taramada iki defa dönmez", async () => {
  const duplicate = {
    id: { _serialized: "same-message" },
    timestamp: nowSeconds,
    body: "İzmir özel güvenlik görevlisi aranıyor. Ücret ve yemek vardır.",
  };
  const result = await fetchMessagesFromChat({
    fetchMessages: async () => [duplicate, duplicate],
  }, "120363444444@g.us", {
    cutoff: Date.now() - 86_400_000,
    limit: 50,
  });

  assert.equal(result.messages.length, 1);
});
