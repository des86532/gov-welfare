"use client";

import { useRouter } from "next/navigation";

export function BackLink({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter();
  return <button className="back-link back-button" type="button" onClick={() => window.history.length > 1 ? router.back() : router.push(fallback)}>{label}</button>;
}
