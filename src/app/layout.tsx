import type { Metadata } from "next";
import Link from "next/link";
import { Rubik } from "next/font/google";
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

// Applies the saved theme before first paint, so dark mode does not flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${rubik.variable} font-sans`}>
        <Navbar />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">{children}</main>
        <footer className="mx-auto flex max-w-7xl print:hidden flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-brand-100 px-4 py-5 text-xs text-neutral-500 sm:px-6 dark:border-brand-900/60 dark:text-neutral-400">
          <span>
            Developed by{" "}
            <a href="https://bmsce.ac.in/home/facultyProfile/590/Swaroop-BM" target="_blank" rel="noopener" className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
              Prof. Swaroop BM
            </a>
            , Assistant Professor, Dept. of Machine Learning, BMSCE and{" "}
            <a href="https://www.linkedin.com/in/sinchana-b-m-aa698a32b" target="_blank" rel="noopener" className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
              Sinchana B M
            </a>
            , Student, Computer Science and Engineering (Data Science), BMSCE
          </span>
          <Link href="/privacy" className="underline hover:text-brand-600">
            Privacy policy
          </Link>
        </footer>
      </body>
    </html>
  );
}
