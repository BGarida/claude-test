import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
});

export const metadata: Metadata = {
  title: "Proof Clone",
  description: "Collaborative document editing with AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={ibmPlexSans.variable} style={{ fontFamily: "var(--font-ibm-plex-sans), sans-serif", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
