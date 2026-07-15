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
        color: "#60738d",
        fontFamily: "system-ui, sans-serif",
      }}
      aria-live="polite"
      aria-busy="true"
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: "3px solid rgba(8,120,232,0.16)",
          borderTopColor: "#0878e8",
          borderRadius: "50%",
          animation: "og-spin 0.9s linear infinite",
        }}
      />
      <span style={{ fontSize: 13, fontWeight: 600 }}>Yükleniyor…</span>
    </div>
  );
}
