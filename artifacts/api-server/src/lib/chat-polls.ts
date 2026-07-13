import { db, chatPollsTable, chatPollVotesTable, chatMessagesTable, usersTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";

export type PollPayload = {
  id: number;
  question: string;
  options: string[];
  counts: number[];
  totalVotes: number;
  myVote: number | null;
  isClosed: boolean;
  createdBy: number;
};

let ensured = false;

export async function ensurePollSchema(): Promise<void> {
  if (ensured) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS chat_polls (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        message_id INTEGER,
        is_closed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS chat_poll_votes (
        id SERIAL PRIMARY KEY,
        poll_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        option_index INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS chat_poll_votes_poll_user_uidx
      ON chat_poll_votes (poll_id, user_id)
    `);
    ensured = true;
  } catch (e) {
    logger.warn({ err: e }, "poll: schema ensure failed");
  }
}

export function pollContentMarker(pollId: number): string {
  return `__OG_POLL__:${pollId}`;
}

export function parsePollIdFromContent(content: string): number | null {
  const m = /^__OG_POLL__:(\d+)$/.exec(content.trim());
  return m ? parseInt(m[1]!, 10) : null;
}

export async function getPollPayload(pollId: number, viewerId?: number | null): Promise<PollPayload | null> {
  await ensurePollSchema();
  const [poll] = await db.select().from(chatPollsTable).where(eq(chatPollsTable.id, pollId)).limit(1);
  if (!poll) return null;
  let options: string[] = [];
  try { options = JSON.parse(poll.options) as string[]; } catch { options = []; }
  const votes = await db.select().from(chatPollVotesTable).where(eq(chatPollVotesTable.pollId, pollId));
  const counts = options.map((_, i) => votes.filter((v) => v.optionIndex === i).length);
  const my = viewerId != null ? votes.find((v) => v.userId === viewerId) : undefined;
  return {
    id: poll.id,
    question: poll.question,
    options,
    counts,
    totalVotes: votes.length,
    myVote: my ? my.optionIndex : null,
    isClosed: poll.isClosed,
    createdBy: poll.createdBy,
  };
}

export async function getPollsForMessages(
  contents: string[],
  viewerId?: number | null,
): Promise<Map<number, PollPayload>> {
  const ids = contents.map(parsePollIdFromContent).filter((x): x is number => x != null);
  const map = new Map<number, PollPayload>();
  if (!ids.length) return map;
  await ensurePollSchema();
  const unique = [...new Set(ids)];
  const polls = await db.select().from(chatPollsTable).where(inArray(chatPollsTable.id, unique));
  const allVotes = await db.select().from(chatPollVotesTable).where(inArray(chatPollVotesTable.pollId, unique));
  for (const poll of polls) {
    let options: string[] = [];
    try { options = JSON.parse(poll.options) as string[]; } catch { options = []; }
    const votes = allVotes.filter((v) => v.pollId === poll.id);
    const counts = options.map((_, i) => votes.filter((v) => v.optionIndex === i).length);
    const my = viewerId != null ? votes.find((v) => v.userId === viewerId) : undefined;
    map.set(poll.id, {
      id: poll.id,
      question: poll.question,
      options,
      counts,
      totalVotes: votes.length,
      myVote: my ? my.optionIndex : null,
      isClosed: poll.isClosed,
      createdBy: poll.createdBy,
    });
  }
  return map;
}

export async function createPoll(opts: {
  question: string;
  options: string[];
  createdBy: number;
}): Promise<{ poll: PollPayload; messageId: number; content: string }> {
  await ensurePollSchema();
  const question = opts.question.trim().slice(0, 200);
  const options = opts.options.map((o) => o.trim().slice(0, 80)).filter(Boolean).slice(0, 6);
  if (!question || options.length < 2) throw new Error("Soru ve en az 2 seçenek gerekli");

  const [poll] = await db.insert(chatPollsTable).values({
    question,
    options: JSON.stringify(options),
    createdBy: opts.createdBy,
    isClosed: false,
  }).returning();

  const content = pollContentMarker(poll.id);
  const [msg] = await db.insert(chatMessagesTable).values({
    content,
    userId: opts.createdBy,
    replyToId: null,
    isPinned: false,
    isDeleted: false,
  }).returning();

  await db.update(chatPollsTable).set({ messageId: msg.id }).where(eq(chatPollsTable.id, poll.id));

  const payload = await getPollPayload(poll.id, opts.createdBy);
  return { poll: payload!, messageId: msg.id, content };
}

export async function votePoll(
  pollId: number,
  userId: number,
  optionIndex: number,
): Promise<PollPayload> {
  await ensurePollSchema();
  const [poll] = await db.select().from(chatPollsTable).where(eq(chatPollsTable.id, pollId)).limit(1);
  if (!poll) throw new Error("Anket bulunamadı");
  if (poll.isClosed) throw new Error("Anket kapalı");
  let options: string[] = [];
  try { options = JSON.parse(poll.options) as string[]; } catch { options = []; }
  if (optionIndex < 0 || optionIndex >= options.length) throw new Error("Geçersiz seçenek");

  const [existing] = await db.select().from(chatPollVotesTable)
    .where(and(eq(chatPollVotesTable.pollId, pollId), eq(chatPollVotesTable.userId, userId)))
    .limit(1);
  if (existing) {
    await db.update(chatPollVotesTable)
      .set({ optionIndex })
      .where(eq(chatPollVotesTable.id, existing.id));
  } else {
    await db.insert(chatPollVotesTable).values({ pollId, userId, optionIndex });
  }
  const payload = await getPollPayload(pollId, userId);
  if (!payload) throw new Error("Anket yüklenemedi");
  return payload;
}
