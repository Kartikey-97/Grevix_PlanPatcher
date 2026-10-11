import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlanPatch — Change-aware planning",
  description: "Deterministic plan recovery and change orchestration workspace",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
