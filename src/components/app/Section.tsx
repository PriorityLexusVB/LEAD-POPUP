
"use client";
import { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export function Section({
  title,
  className,
  children,
}: PropsWithChildren<{ title: string; className?: string }>) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-sm font-medium">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
