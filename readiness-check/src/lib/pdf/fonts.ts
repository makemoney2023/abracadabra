import { join } from "node:path";
import { Font } from "@react-pdf/renderer";

const dir = join(process.cwd(), "assets/fonts");

let registered = false;

/** Register Inter Tight + IBM Plex Sans for @react-pdf (once per process). */
export function registerStudioPdfFonts() {
  if (registered) return;
  Font.register({
    family: "Inter Tight",
    fonts: [
      { src: join(dir, "InterTight-Medium.ttf"), fontWeight: 500 },
      { src: join(dir, "InterTight-SemiBold.ttf"), fontWeight: 600 },
      { src: join(dir, "InterTight-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "IBM Plex Sans",
    fonts: [
      { src: join(dir, "IBMPlexSans-Regular.ttf"), fontWeight: 400 },
      { src: join(dir, "IBMPlexSans-Medium.ttf"), fontWeight: 500 },
      { src: join(dir, "IBMPlexSans-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  registered = true;
}
