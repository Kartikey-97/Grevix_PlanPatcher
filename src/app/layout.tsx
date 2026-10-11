import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "../lib/theme-context";

export const metadata: Metadata = {
  title: "PlanPatch — Change-aware planning",
  description: "Deterministic plan recovery and change orchestration workspace",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 0.85,
  maximumScale: 3,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
