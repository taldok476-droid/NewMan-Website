import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "NEWMAN | ניהול עובדים ופרויקטים",
  description: "מערכת ניהול פנימית של NEWMAN",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
