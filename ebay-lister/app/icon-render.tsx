import { ImageResponse } from "next/og";

// Shared render for all app icons. Navy background, electric-blue price tag.
export function renderIcon(dim: number) {
  const stroke = Math.max(2, Math.round(dim / 24));
  const s = Math.round(dim * 0.58);
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0f1117",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: Math.round(dim * 0.22),
        }}
      >
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3b82f6"
          strokeWidth={stroke / (dim / 24)}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.5 13.5 13 21a2 2 0 0 1-2.8 0L3 13.8V4h9.8L20.5 11a2 2 0 0 1 0 2.5z" />
          <circle cx="8" cy="9" r="1.6" fill="#3b82f6" />
        </svg>
      </div>
    ),
    { width: dim, height: dim },
  );
}
