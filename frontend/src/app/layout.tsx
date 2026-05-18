import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Equinox Prime — Private B2B Settlement",
  description:
    "Hidden-ledger procurement system for high-value trade settlement on Stellar. ZK-shielded escrow powered by CAP-0080.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
