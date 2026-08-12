import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const orbitron = Orbitron({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-orbitron" });

export const metadata: Metadata = {
  metadataBase: new URL("https://tensets.vercel.app"),
  title: "tensets — 10 sets a week, every body part",
  description:
    "The whole theory of growth in one number: 10 sets to failure per body part per week (20 before diminishing returns). Tap a set, watch the body light up.",
};

export const viewport: Viewport = {
  themeColor: "#07070b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${orbitron.variable}`}>
      <body>{children}</body>
    </html>
  );
}
