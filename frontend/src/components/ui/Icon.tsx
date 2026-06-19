import type { LucideIcon, LucideProps } from 'lucide-react';

interface IconProps extends Omit<LucideProps, 'ref'> {
  /** The lucide icon component to render (e.g. `Search` from 'lucide-react'). */
  icon: LucideIcon;
  /**
   * Accessible label. When provided the icon is exposed to assistive tech as
   * an image with this name; when omitted the icon is decorative (aria-hidden).
   */
  label?: string;
}

/**
 * Thin wrapper around lucide-react icons.
 * - Decorative by default (`aria-hidden`), so screen readers skip it.
 * - Pass `label` to make it a meaningful image (role="img" + aria-label).
 * Defaults: 1.5 stroke width and 16px size to match the current inline SVGs.
 */
export default function Icon({ icon: LucideGlyph, label, size = 16, strokeWidth = 1.5, ...rest }: IconProps) {
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true, focusable: false } as const);
  return <LucideGlyph size={size} strokeWidth={strokeWidth} {...a11y} {...rest} />;
}
