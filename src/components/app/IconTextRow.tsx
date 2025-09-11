
"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export function IconTextRow({
  icon,
  children,
  className,
}: {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2 text-sm leading-5", className)}>
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
