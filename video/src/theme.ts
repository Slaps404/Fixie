import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "800"],
  subsets: ["latin"],
});

// Mirrors site/app/globals.css so the video matches the site.
export const theme = {
  font: fontFamily,
  bg: "#0B0B0C",
  surface: "#131314",
  line: "#2A2A2E",
  text: "#EDEDED",
  body: "#A1A1A6",
  muted: "#8E8E93",
  accent: "#8E9BFF",
  warm: "#F2A93B",
  fault: "#FF6A55",
} as const;
