/** The B.M.S. College of Engineering seal, from the college's own timetable document. */
export default function CollegeSeal({ className = "h-10 w-10" }: { className?: string }) {
  return (
    // A white disc behind it in dark mode, so the dark gear edge stays visible
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/bmsce-seal.png" alt="B.M.S. College of Engineering" width={128} height={128} className={`shrink-0 rounded-full dark:bg-white dark:p-0.5 ${className}`} />
  );
}
