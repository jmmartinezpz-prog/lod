import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "LOD · Road to Napicol 2027",
  description: "Clasificación de la liga de dados",
};

export const viewport: Viewport = { themeColor: "#0d2b22" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-4">{children}</main>
      </body>
    </html>
  );
}
