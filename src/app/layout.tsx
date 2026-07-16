import type { Metadata } from "next";
import { Marcellus, Jost } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const marcellus = Marcellus({
  variable: "--font-marcellus",
  weight: "400",
  subsets: ["latin"],
});

const jost = Jost({
  variable: "--font-jost",
  weight: ["300", "400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AMARA Central Supply",
  description: "Multi-branch procurement for salon groups",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${marcellus.variable} ${jost.variable} antialiased font-sans font-light`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
