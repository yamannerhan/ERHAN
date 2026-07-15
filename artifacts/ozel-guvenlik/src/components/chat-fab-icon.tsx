import { motion } from "framer-motion";

/** Sohbetin ağır bağlantı ve panel kodundan bağımsız, küçük açma düğmesi. */
export function ChatFabIcon({ unread, pulse }: { unread: number; pulse: boolean }) {
  return (
    <div className="relative w-[58px] h-[58px] flex items-center justify-center">
      <div
        className="absolute inset-0 rounded-[22px]"
        style={{
          background: "linear-gradient(145deg, #65c7ff 0%, #0878e8 55%, #0568ce 100%)",
          padding: "2.5px",
          boxShadow: pulse
            ? "0 0 28px rgba(8,120,232,0.50), 0 0 42px rgba(37,168,255,0.25)"
            : "0 8px 24px rgba(25,94,165,0.24), 0 0 14px rgba(8,120,232,0.18)",
        }}
      >
        <div
          className="w-full h-full rounded-[19px] relative overflow-hidden"
          style={{ background: "radial-gradient(circle at 30% 25%, #ffffff 0%, #edf6ff 62%, #dceeff 100%)" }}
        >
          <div className="absolute inset-x-2 top-1 h-3 rounded-full opacity-40" style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.55),transparent)" }} />
          <svg viewBox="0 0 48 48" className="absolute inset-0 m-auto w-7 h-7" fill="none">
            <path
              d="M10 14c0-3.3 2.7-6 6-6h16c3.3 0 6 2.7 6 6v10c0 3.3-2.7 6-6 6H22l-7 6v-6h-1c-3.3 0-6-2.7-6-6V14z"
              stroke="#0878E8"
              strokeWidth="2.4"
              strokeLinejoin="round"
              style={{ filter: "drop-shadow(0 0 4px rgba(8,120,232,0.40))" }}
            />
            <circle cx="20" cy="19" r="1.7" fill="#0878E8" />
            <circle cx="24" cy="19" r="1.7" fill="#0878E8" />
            <circle cx="28" cy="19" r="1.7" fill="#0878E8" />
          </svg>
        </div>
      </div>
      <span
        className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-emerald-400 border-[2.5px] border-white z-10"
        style={{ boxShadow: "0 0 8px rgba(52,211,153,1)" }}
      />
      {unread > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-[7px] bg-gradient-to-b from-red-400 to-red-600 text-white text-[10px] font-black flex items-center justify-center z-10 border border-red-300/40"
          style={{ boxShadow: "0 0 10px rgba(239,68,68,0.85)" }}
        >
          {unread > 9 ? "9+" : unread}
        </motion.span>
      )}
    </div>
  );
}
