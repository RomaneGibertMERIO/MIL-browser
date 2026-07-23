/**
 * Icon wrapper over lucide-react — the single icon system for the whole app.
 * See docs/UI-UX-SPEC.md §19. Replaces the previous emoji/Unicode glyphs with a
 * consistent line-icon set (IDE aesthetic), rendered as inline SVG (CSP-safe,
 * offline-safe).
 *
 * Usage: <Icon name="pin" size={14} />
 */

import {
  Pin, PinOff, X, Settings, ShieldCheck, Users, UploadCloud, ArrowLeft,
  ExternalLink, ChevronRight, ChevronDown, Minus, SquarePen, ListTree, Search,
  Plus, Check, GitBranch, GitCommit, AppWindow, Home, RefreshCw, Trash2,
  Download, Upload, AlertTriangle, type LucideIcon,
} from "lucide-react";

const ICONS = {
  pin: Pin,
  pinOff: PinOff,
  close: X,
  settings: Settings,
  review: ShieldCheck,
  users: Users,
  push: UploadCloud,
  back: ArrowLeft,
  open: ExternalLink,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  collapse: Minus,
  edit: SquarePen,
  standards: ListTree,
  search: Search,
  add: Plus,
  check: Check,
  gitBranch: GitBranch,
  gitCommit: GitCommit,
  window: AppWindow,
  home: Home,
  sync: RefreshCw,
  delete: Trash2,
  download: Download,
  upload: Upload,
  warning: AlertTriangle,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  /** Pixel size (default 16). */
  size?: number;
  className?: string;
  /** Accessible label; omit for purely decorative icons. */
  label?: string;
}

export function Icon({ name, size = 16, className, label }: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  );
}
