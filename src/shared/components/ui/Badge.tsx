import type { ReactNode } from "react";

type BadgeVariant = "blue" | "gray" | "green" | "red";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  blue:  "bg-blue-50 text-blue-700",
  gray:  "bg-gray-100 text-gray-700",
  green: "bg-green-50 text-green-700",
  red:   "bg-red-50 text-red-700",
};

/** Small inline label badge. */
export function Badge({ variant = "gray", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}
