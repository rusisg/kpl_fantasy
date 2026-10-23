import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KPL Fantasy — Unofficial Kazakhstan Premier League Fantasy Football Simulator",
  description:
    "Unofficial fan-made fantasy football simulator for the Kazakhstan Premier League (KPL). Not affiliated with or endorsed by the QFL or KFF.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
