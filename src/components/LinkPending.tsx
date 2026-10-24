"use client";

import { useLinkStatus } from "next/link";
import LoadingOverlay from "./LoadingOverlay";

/** Placed inside a Link: shows the loading overlay while that link's page loads. */
export default function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <LoadingOverlay /> : null;
}
