import type { Spot } from "@/lib/types";

export type SpotVerdict = {
  label: string;
  tone: "positive" | "neutral" | "caution";
};

// Framed only from real confirm_count/flag_count already on the row — same
// no-fabrication rule spotlight-carousel's old spotlightReason() documented
// (this supersedes it). Never a synthesized "reviews say..." claim.
export function getSpotVerdict(spot: Spot): SpotVerdict {
  const { confirm_count, flag_count } = spot;

  if (confirm_count === 0 && flag_count === 0) {
    return { label: fallbackReason(spot), tone: "neutral" };
  }
  if (flag_count === 0) {
    return {
      label: `${confirm_count} ${confirm_count === 1 ? "person has" : "people have"} vouched for this spot`,
      tone: "positive",
    };
  }
  if (confirm_count === 0) {
    return {
      label: `${flag_count} ${flag_count === 1 ? "visitor has" : "visitors have"} flagged this as inaccurate`,
      tone: "caution",
    };
  }
  return {
    label: `${confirm_count} vouched · ${flag_count} flagged as inaccurate`,
    tone: "caution",
  };
}

function fallbackReason(spot: Spot): string {
  if (spot.source === "official") return "From official city park data";
  if (spot.source === "osm") return "Mapped from OpenStreetMap";
  if (spot.source === "reddit") return "Spotted via a community mention";
  return "Submitted by someone who's been there"; // source === "user"
}
