import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import TopNav from "@/components/TopNav";
import { linkedinTheme } from "@/theme";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-source-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LinkedIn — Mockup",
  description: "A LinkedIn homepage mockup built with Next.js + Ant Design.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={sourceSans.variable}>
      <body>
        <AntdRegistry>
          <ConfigProvider theme={linkedinTheme}>
            <TopNav />
            <main className="app-container">{children}</main>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
