import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ReqTest · 需求驱动验证工作台",
  description: "连接需求、代码与测试，追踪行为验证状态和执行证据。",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
