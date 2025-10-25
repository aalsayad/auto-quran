import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { CacheBuster } from "@/components/cache-buster";

export const metadata: Metadata = {
  title: "Auto Quran",
  description: "Split Quran surah audio into individual ayahs",
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

//Cache Buster added to force refresh the page when the app is updated
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="google" content="notranslate" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <CacheBuster />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
