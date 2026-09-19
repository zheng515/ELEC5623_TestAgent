import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ReqTest | Requirement-aware verification",
  description: "From software requirements to traceable verification evidence.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
