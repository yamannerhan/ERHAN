/** İlk yükleme / lazy route — düşük bellekli cihazlarda hafif fallback */
export function PageLoader() {
  return (
    <div
      className="og-page-loader"
      style={{
        minHeight: "40vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 12,
        padding: 24,
        color: "#94a3b8",
        fontFamily: "system-ui, sans-serif",
      }}
      aria-live="polite"
      aria-busy="true"
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: "3px solid rgba(245,197,24,0.2)",
          borderTopColor: "#f5c518",
          borderRadius: "50%",
          animation: "og-spin 0.9s linear infinite",
        }}
      />
      <span style={{ fontSize: 13, fontWeight: 600 }}>Yükleniyor…</span>
    </div>
  );
}
