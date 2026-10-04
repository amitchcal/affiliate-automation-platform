import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marketing Automation Platform",
  description: "Score offers, choose channels, and run compliant affiliate marketing for each brand.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
