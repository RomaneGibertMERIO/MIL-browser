import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: ReactNode;
}

/** Centered empty-state display used when a list has no items. */
export function EmptyState({ title, message, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon !== undefined && (
        <div className="text-gray-300 mb-4">{icon}</div>
      )}
      <p className="text-sm font-semibold text-gray-500">{title}</p>
      <p className="mt-1 text-sm text-gray-400 max-w-sm leading-relaxed">{message}</p>
    </div>
  );
}
