import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ReqTest · Requirement-Aware Verification Workbench",
  description:
    "Connect requirements, code, and tests while tracking behavior verification status and execution evidence.",
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
