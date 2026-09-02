import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Auth0Provider } from "@auth0/nextjs-auth0";
import { ClinicalAlertProvider } from "@/components/providers/clinical-alert-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MediSync — Hospital Intelligence & Clinical Operations",
  description: "Advanced AI-powered hospital management and clinical operations suite.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full min-h-dvh antialiased`}
    >
      <body className="min-h-dvh h-full flex flex-col">
        <Auth0Provider>
          <ClinicalAlertProvider>
            {children}
            <Toaster position="top-right" richColors />
          </ClinicalAlertProvider>
        </Auth0Provider>
      </body>
    </html>
  );
}
