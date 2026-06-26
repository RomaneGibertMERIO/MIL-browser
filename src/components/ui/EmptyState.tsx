interface EmptyStateProps {
  title: string;
  message: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, message, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      {icon && <div className="mb-4 text-gray-300">{icon}</div>}
      <p className="text-sm font-semibold text-gray-500">{title}</p>
      <p className="mt-1 text-sm text-gray-400 max-w-xs">{message}</p>
    </div>
  );
}
