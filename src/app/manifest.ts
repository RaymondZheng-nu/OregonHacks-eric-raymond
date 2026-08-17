import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TOUCH GRASS",
    short_name: "Touch Grass",
    description:
      "Find real parks and nature spots near you, spotted by people who actually left the house to find them.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#15803d",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
