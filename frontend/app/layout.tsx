import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora, Montserrat } from "next/font/google";
import "./globals.css";

// Geist is the app-wide default (Tailwind's font-sans). Montserrat and Lora are
// the landing-page and password-reset brand fonts, applied only inside
// `.cc-page` (see globals.css), so other pages keep their own look.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  title: "CampusConnect",
  description:
    "One trusted place to discover clubs and events, ask campus questions, exchange skills, and choose electives with confidence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${montserrat.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
