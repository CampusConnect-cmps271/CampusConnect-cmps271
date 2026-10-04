import type { Metadata } from "next";
import { Lora, Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  title: "CampusConnect",
  description:
    "One trusted place to discover clubs and events, ask campus questions, exchange skills, and choose electives with confidence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${montserrat.variable} ${lora.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
