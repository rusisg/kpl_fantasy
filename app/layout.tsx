import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "KPL Fantasy — Kazakhstan Premier League Fantasy Football",
    template: "%s · KPL Fantasy",
  },
  description:
    "Unofficial fan-made fantasy football for the Kazakhstan Premier League (KPL). Build a 15-man squad, play chips, and beat your friends in mini-leagues. Data sourced from kffleague.kz.",
  applicationName: "KPL Fantasy",
  appleWebApp: {
    capable: true,
    title: "KPL Fantasy",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070a12" },
    { media: "(prefers-color-scheme: light)", color: "#eef2f8" },
  ],
};

// Runs before paint: applies the saved theme (dark by default) and document language to avoid flashes.
const BOOT_SCRIPT = `
(function() {
  try {
    var d = document.documentElement;
    var t = localStorage.getItem('kpl_fantasy_theme');
    var theme = (t === 'dark' || t === 'light') ? t : 'dark';
    d.setAttribute('data-theme', theme);
    d.classList.toggle('light', theme === 'light');
    d.classList.toggle('dark', theme === 'dark');
    var l = localStorage.getItem('kpl_fantasy_locale');
    if (l === 'en' || l === 'ru' || l === 'kk') d.setAttribute('lang', l);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className="dark"
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Oswald:wght@500;600;700&family=Roboto+Condensed:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased min-h-dvh">{children}</body>
    </html>
  );
}
