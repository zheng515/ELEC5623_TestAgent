import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReqTest · Requirement-aware verification",
  description: "Connect original requirements, generated tests and execution evidence to investigate software behaviour.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen scheme-dark bg-background text-foreground font-sans text-base antialiased">
        {children}
      </body>
    </html>
  );
}
