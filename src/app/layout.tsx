import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "LOD · Road to Napicol 2027",
  description: "Clasificación de la liga de dados",
};

export const viewport: Viewport = { themeColor: "#0d2b22", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`h-full antialiased ${outfit.variable}`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="w-full flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-10">{children}</main>
      </body>
    </html>
  );
}
