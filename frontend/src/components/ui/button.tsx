import * as React from "react";
import { cn } from "../../lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-300/50 disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "border border-sky-300/40 bg-sky-400/15 text-sky-50 shadow-glow hover:bg-sky-300/20",
        variant === "secondary" &&
          "border border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.12]",
        variant === "ghost" && "text-slate-300 hover:bg-white/[0.08] hover:text-white",
        className,
      )}
      {...props}
    />
  );
}
