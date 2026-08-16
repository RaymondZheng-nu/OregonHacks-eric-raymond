import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f0fdf4",
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 700,
            letterSpacing: -4,
            color: "#15803d",
          }}
        >
          TOUCH GRASS
        </div>
        <div style={{ fontSize: 36, color: "#3f3f46", marginTop: 24 }}>
          Find real parks and nature spots near you
        </div>
      </div>
    ),
    { ...size }
  );
}
