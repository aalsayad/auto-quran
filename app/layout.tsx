import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { CacheBuster } from "@/components/cache-buster";

export const metadata: Metadata = {
  title: "Auto Quran",
  description: "Split Quran surah audio into individual ayahs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body>
        <CacheBuster />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
