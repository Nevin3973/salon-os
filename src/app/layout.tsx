import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { APP_TITLE } from "@/lib/brand";

// Poppins carries the wordmark and headings. Bebas Neue was the alternative but
// ships weight 400 only — the same trap Marcellus set here, where every bold
// heading was synthetically emboldened by the browser and looked subtly wrong.
const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_TITLE,
  description:
    "Order supplies, track dispatch, and bill customers — one system for every salon in the group.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${poppins.variable} antialiased font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
