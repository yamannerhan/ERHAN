import { useState } from "react";

type PollData = {
  id: number;
  question: string;
  options: string[];
  counts: number[];
  totalVotes: number;
  myVote: number | null;
  isClosed: boolean;
};

export function ChatPollCard({
  poll: initial,
  token,
  onUpdate,
}: {
  poll: PollData;
  token: string;
  onUpdate?: (p: PollData) => void;
}) {
  const [poll, setPoll] = useState(initial);
  const [busy, setBusy] = useState(false);

  const vote = async (optionIndex: number) => {
    if (poll.isClosed || busy || !token) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/chat/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ optionIndex }),
      });
      if (!res.ok) return;
      const data = await res.json() as PollData;
      setPoll(data);
      onUpdate?.(data);
    } finally {
      setBusy(false);
    }
  };

  const options = Array.isArray(poll.options) ? poll.options : [];
  const counts = Array.isArray(poll.counts) ? poll.counts : [];
  const max = Math.max(1, ...counts, 0);

  return (
    <div className="mt-1 rounded-xl border border-amber-400/25 bg-black/30 p-2.5 space-y-2 min-w-[200px]">
      <div className="text-[12px] font-bold text-amber-300">📊 {poll.question}</div>
      {options.map((opt, i) => {
        const count = counts[i] ?? 0;
        const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
        const selected = poll.myVote === i;
        return (
          <button
            key={i}
            type="button"
            disabled={poll.isClosed || busy || !token}
            onClick={() => void vote(i)}
            className={`relative w-full text-left rounded-lg overflow-hidden border px-2.5 py-1.5 text-[11px] transition-colors ${
              selected ? "border-amber-400 text-amber-200" : "border-white/10 text-white/80 hover:border-white/25"
            }`}
          >
            <div
              className="absolute inset-y-0 left-0 bg-amber-400/15"
              style={{ width: `${(count / max) * 100}%` }}
            />
            <span className="relative z-10 flex justify-between gap-2">
              <span>{opt}</span>
              <span className="text-white/50">{pct}% · {count}</span>
            </span>
          </button>
        );
      })}
      <div className="text-[10px] text-white/35">{poll.totalVotes} oy</div>
    </div>
  );
}
