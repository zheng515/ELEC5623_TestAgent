import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReqTest · HTTP functional tests",
  description: "Generate reviewed HTTP test cases and inspect real execution evidence.",
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
