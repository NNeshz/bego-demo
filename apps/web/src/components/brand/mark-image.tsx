/** The logo mark for ImageResponse (Satori): inline styles and hex colors only. */
export function MarkImage({ size, maskable = false }: { size: number; maskable?: boolean }) {
  // Maskable icons get cropped to a circle/squircle: keep the glyph inside the 70% safe zone.
  const glyph = maskable ? size * 0.62 : size * 0.86;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#12151b",
        borderRadius: maskable ? 0 : size * 0.28,
      }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 32 32">
        <path
          d="M10 24V14.5a6 6 0 0 1 12 0V20"
          fill="none"
          stroke="#f3e23f"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M18 18.5l4 4 4-4"
          fill="none"
          stroke="#f3e23f"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
