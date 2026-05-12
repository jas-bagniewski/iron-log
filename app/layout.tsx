import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Iron Log",
  description: "4-day strength training tracker with auto-progression",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Iron Log",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="apple-touch-icon"
          href="data:image/svg+xml;utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20180%20180'%3E%3Crect%20width='180'%20height='180'%20rx='40'%20fill='%23000'/%3E%3Crect%20x='34'%20y='34'%20width='112'%20height='112'%20rx='24'%20fill='%23F97316'/%3E%3Cpath%20d='M70%2070l40%2040M120%20120l5%205M55%2055l5%205M105%20130l20-20M55%2070l20-20M60%2080l35-35M125%20120l35-35'%20stroke='%23000'%20stroke-width='10'%20stroke-linecap='round'%20fill='none'/%3E%3C/svg%3E"
        />
      </head>
      <body className="bg-black text-neutral-100 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
