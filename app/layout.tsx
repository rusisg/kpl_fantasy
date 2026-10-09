import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KPL Fantasy — Official Kazakhstan Premier League Game",
  description: "Build your fantasy squad, manage transfers, and compete in mini-leagues for the Kazakhstan Premier League.",
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