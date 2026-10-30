import { Suspense } from "react";
import SmoothNavigation from "@/components/SmoothNavigation";
import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import DeveloperCredit from "@/components/DeveloperCredit";
import Navbar from "@/components/Navbar";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: "variable",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} · Classroom Allotment, Dept. of Machine Learning`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "BMSCE room management",
    "BMSCE classroom allotment",
    "BMSCE free classrooms",
    "BMSCE timetable",
    "BMS College of Engineering",
    "BMSCE Machine Learning department",
    "room booking",
  ],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_NAME, description: SITE_DESCRIPTION, url: "/", locale: "en_IN" },
  robots: { index: true, follow: true },
  // Set GOOGLE_SITE_VERIFICATION in Vercel to the code Google Search Console gives you.
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};

// Applies the saved theme and colour before first paint, so neither flashes.
const themeScript = `try{var d=document.documentElement,t=localStorage.getItem('theme'),c=localStorage.getItem('color');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))d.classList.add('dark');if(c&&c!=='blue')d.dataset.color=c}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${rubik.variable} flex min-h-screen flex-col font-sans`}>
        <Suspense fallback={null}>
          <SmoothNavigation />
        </Suspense>
        <Navbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">{children}</main>
        <DeveloperCredit />
      </body>
    </html>
  );
}
