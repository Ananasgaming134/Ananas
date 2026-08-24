import type { Metadata } from "next";
import { Geist, Geist_Mono, Archivo } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Breite, plakative Grotesk fuer Ueberschriften auf der Startseite - gibt dem
// Auftritt Gewicht, ohne den ruhigen Fliesstext im Dashboard anzufassen.
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "OP-LeihCenter",
  description: "Item-Verleih für den OPSucht-Minecraft-Server (opsucht.net).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
