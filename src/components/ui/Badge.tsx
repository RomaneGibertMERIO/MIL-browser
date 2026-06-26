interface BadgeProps {
  children: React.ReactNode;
  variant?: 'blue' | 'gray' | 'green';
}

export function Badge({ children, variant = 'blue' }: BadgeProps) {
  const styles: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800',
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-emerald-100 text-emerald-800',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
}
