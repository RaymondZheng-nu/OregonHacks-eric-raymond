import { ImageResponse } from "next/og";
import { getSpotById } from "@/lib/supabase/queries.server";
import { CATEGORY_META } from "@/lib/categories";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function SpotOpengraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const spot = await getSpotById(id);

  if (!spot) {
    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f0fdf4",
            fontSize: 64,
            color: "#15803d",
            fontWeight: 700,
          }}
        >
          TOUCH GRASS
        </div>
      ),
      { ...size },
    );
  }

  const categoryLabel = CATEGORY_META[spot.category].label;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a0a0a",
        }}
      >
        {spot.photo_url ? (
          // ImageResponse's own renderer, not next/image — fetches directly.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spot.photo_url}
            alt=""
            style={{
              width: "100%",
              height: 420,
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: 420,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#166534",
              fontSize: 48,
              color: "#f0fdf4",
              fontWeight: 700,
            }}
          >
            TOUCH GRASS
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "32px 48px",
          }}
        >
          <div style={{ fontSize: 52, fontWeight: 700, color: "#fafafa" }}>
            {spot.name}
          </div>
          <div style={{ fontSize: 28, color: "#a1a1aa" }}>
            {`${categoryLabel} · TOUCH GRASS`}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
