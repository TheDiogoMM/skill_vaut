import type { SVGProps } from 'react';
import { Sparkles, GitBranch, Plug, Puzzle, Compass, CheckCircle2, AlertCircle, Info, Copy, Check, Library, PlusCircle, Sun, Moon, Wand2 } from 'lucide-react';

const ICONS = {
  sparkles: Sparkles,
  'git-branch': GitBranch,
  plug: Plug,
  puzzle: Puzzle,
  compass: Compass,
  'check-circle-2': CheckCircle2,
  'alert-circle': AlertCircle,
  info: Info,
  copy: Copy,
  check: Check,
  library: Library,
  'plus-circle': PlusCircle,
  sun: Sun,
  moon: Moon,
  'wand-2': Wand2,
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, strokeWidth = 2, ...rest }: IconProps) {
  const LucideIcon = ICONS[name];
  return <LucideIcon width={size} height={size} strokeWidth={strokeWidth} {...rest} />;
}
