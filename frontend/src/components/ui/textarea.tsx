import * as React from "react";
import { cn } from "../../lib/utils";

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-md border border-white/10 bg-slate-950/55 px-3 py-2 text-sm text-slate-100 shadow-inner-glow outline-none transition placeholder:text-slate-500 focus:border-sky-300/50 focus:ring-2 focus:ring-sky-300/15",
        className,
      )}
      {...props}
    />
  );
}
