import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'bg-surface text-ink border border-border hover:border-border-strong',
  ghost: 'bg-transparent text-ink-muted hover:text-ink',
};

// Классы кнопки отдельно от самого <button>: там, где по смыслу нужна
// ССЫЛКА (переход на другую страницу, которую хочется открыть в новой
// вкладке или скопировать), верстать её через <button onClick={navigate}>
// неправильно — браузер не даст ни того, ни другого. Такие места берут эти
// классы и вешают на <Link>, оставаясь в одном стиле с обычными кнопками.
export function buttonClasses(variant: ButtonVariant = 'primary', className?: string): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    variantClasses[variant],
    className,
  );
}

export function Button({ variant = 'primary', icon, className, children, ...props }: ButtonProps) {
  return (
    <button
      className={buttonClasses(variant, className)}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
