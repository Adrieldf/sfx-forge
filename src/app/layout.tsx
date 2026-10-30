import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SFX Forge — game sound effect and music generator",
  description: "Design sound effects and generate background music for games in the browser. Presets, sliders, WAV export.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
