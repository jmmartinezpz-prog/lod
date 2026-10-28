import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import RegistrarSW from "@/components/RegistrarSW";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "LOD · Road to Napicol 2027",
  description: "Clasificación de la liga de dados",
  applicationName: "LOD",
  appleWebApp: { capable: true, title: "LOD", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = { themeColor: "#0d2b22", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`h-full antialiased ${outfit.variable}`}>
      <body className="min-h-full flex flex-col">
        <RegistrarSW />
        <Nav />
        <main className="w-full flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-10">{children}</main>
      </body>
    </html>
  );
}
