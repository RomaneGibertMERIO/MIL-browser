import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Generic card container with optional title. */
export function Card({ title, children, className = "" }: CardProps) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-5 ${className}`}>
      {title !== undefined && (
        <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      )}
      {children}
    </div>
  );
}
