import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#15803d",
          color: "white",
          fontSize: 96,
          fontWeight: 700,
        }}
      >
        TG
      </div>
    ),
    { ...size }
  );
}
