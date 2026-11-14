import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Field Shift AR — Living Field Lens",
  description:
    "NASA Space Apps 2026 — AR-powered soil diagnostics fusing NASA SMAP, ECOSTRESS, Landsat, SRTM, and POWER data with ground-level camera imagery and Gemini AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  );
}
