import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadSchibsted } from "@remotion/google-fonts/SchibstedGrotesk";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";

// The same palette and type as the app: an editing desk with the video in a
// dark room and the transcript as paper, marked up in red (cut) and blue (rewrite).
export const C = {
  slate: "#1d2026",
  slate2: "#262a32",
  slate3: "#323743",
  line: "#393f4b",
  onSlate: "#e6e9ef",
  dim: "#9aa3b2",
  faint: "#5d6574",
  paper: "#f4f6f8",
  ink: "#1a2230",
  red: "#cf3346",
  redLight: "#ff8a98",
  blue: "#2a54d6",
  blueLight: "#8eabff",
};

export const serif = loadNewsreader("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;
loadNewsreader("italic", { weights: ["400", "500"], subsets: ["latin"] });
export const sans = loadSchibsted("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;
export const mono = loadJetBrains("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;

export const FPS = 30;
export const W = 1080;
export const H = 1920;
