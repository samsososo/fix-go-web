"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function MobileMenuDetails({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }, [pathname, search]);

  function handleClickCapture(event: MouseEvent<HTMLDetailsElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const link = target.closest("a[href]");
    if (link && detailsRef.current?.contains(link)) {
      detailsRef.current.open = false;
    }
  }

  return (
    <details
      className={className}
      ref={detailsRef}
      onClickCapture={handleClickCapture}
    >
      {children}
    </details>
  );
}
