import { Tektur } from "next/font/google";

const tektur = Tektur({
  variable: "--font-tektur",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return <div className={`check-studio flex min-h-svh flex-1 flex-col ${tektur.variable}`}>{children}</div>;
}
