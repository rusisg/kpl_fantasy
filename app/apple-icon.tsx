import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #0d7a4c 0%, #04402a 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: -2, color: "#ffffff" }}>KPL</div>
        <div
          style={{
            marginTop: 6,
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: 4,
            color: "#00e5ff",
          }}
        >
          FANTASY
        </div>
      </div>
    ),
    { ...size }
  );
}

