import type { Metadata } from "next";
import Link from "next/link";
import { Rubik } from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: "variable",
});

export const metadata: Metadata = {
  title: "BMSCE Room Management",
  description: "Classroom allotments, free slots and room requests for the Department of Machine Learning, BMSCE.",
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
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-neutral-500 sm:px-6 dark:text-neutral-400">
          Department of Machine Learning, BMSCE ·{" "}
          <Link href="/privacy" className="underline hover:text-brand-600">
            Privacy policy
          </Link>
        </footer>
      </body>
    </html>
  );
}
