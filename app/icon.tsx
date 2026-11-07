import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0d1424 0%, #070a12 100%)",
          borderRadius: 14,
          border: "3px solid #00e5ff",
          color: "#00e5ff",
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: -1,
        }}
      >
        KPL
      </div>
    ),
    { ...size }
  );
}

