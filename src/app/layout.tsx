import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Affiqube",
  description: "Run affiliate marketing and dropshipping brands, with people approving what matters.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
