import Link from "next/link";
import LinkPending from "./LinkPending";

/** A link that shows the loading overlay while the next page loads. */
export default function PendingLink({ href, className, children, ...rest }: { href: string; className?: string; children: React.ReactNode } & React.AriaAttributes) {
  return (
    <Link href={href} className={className} scroll={false} {...rest}>
      {children}
      <LinkPending />
    </Link>
  );
}
