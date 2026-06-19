import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding. Defaults to 'md' (p-5, the common card padding). */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const PADDING = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-8',
} as const;

/** White rounded surface with the app's standard subtle shadow. */
export default function Card({ padding = 'md', className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${PADDING[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
