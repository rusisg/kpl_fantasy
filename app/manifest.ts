import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KPL Fantasy",
    short_name: "KPL Fantasy",
    description:
      "Unofficial fantasy football for the Kazakhstan Premier League. Build your squad, play chips, win your mini-league.",
    start_url: "/squad",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070a12",
    theme_color: "#070a12",
    categories: ["sports", "games"],
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
  };
}

