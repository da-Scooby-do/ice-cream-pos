import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  title: "كاشير الآيس كريم",
  description: "نظام كاشير ومخزون لمحل الآيس كريم",
};

// شاشة الكاشير لا تتكبّر ولا تتصغّر بالخطأ | lock zoom on the counter screen
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#D6336C",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body>{children}</body>
    </html>
  );
}
