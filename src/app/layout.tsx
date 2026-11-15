import type { Metadata } from "next";
import { Noto_Sans_Ethiopic, Nunito } from "next/font/google";
import "./globals.css";
import "./soil-theme.css";

const notoEthiopic = Noto_Sans_Ethiopic({
  subsets: ["ethiopic"],
  weight: ["400", "600", "700"],
  variable: "--font-noto-ethiopic",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Field Shift AR — The Soil Speaks",
  description:
    "NASA Space Apps 2026 — camera-first field lens where the earth speaks in first person, fusing NASA satellite data with Addis AI Amharic voice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="am" className={`dark ${notoEthiopic.variable} ${nunito.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
