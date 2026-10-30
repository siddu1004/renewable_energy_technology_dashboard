import type { ReactNode } from "react";

export function LiquidGlassCard({
  children,
  className = "",
  as: Component = "article",
}: {
  children: ReactNode;
  className?: string;
  as?: "article" | "section" | "div";
}) {
  return (
    <Component className={`liquid-glass ${className}`}>
      <span className="liquid-glass-shine" aria-hidden="true" />
      {children}
    </Component>
  );
}
