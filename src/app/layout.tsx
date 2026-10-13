import type { Metadata, Viewport } from "next";
import "@fontsource-variable/readex-pro/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "JAC ICE",
  description: "نظام كاشير ومخزون JAC ICE",
};

// شاشة الكاشير لا تتكبّر ولا تتصغّر بالخطأ | no accidental zoom on the counter
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#00ADEF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
