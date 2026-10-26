import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Spinner } from "@/components/icons";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "dark";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 active:bg-emerald-800",
  secondary: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 active:bg-emerald-200",
  outline: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 active:bg-stone-100",
  ghost: "text-stone-700 hover:bg-stone-100 active:bg-stone-200",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800",
  dark: "bg-stone-900 text-white hover:bg-stone-800 active:bg-black",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
  xl: "h-14 px-6 text-base gap-2.5",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}) {
  return [
    "inline-flex items-center justify-center rounded-xl font-semibold transition select-none active:scale-[0.98] motion-reduce:active:scale-100",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? "w-full" : "",
    className,
  ].join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export function Button({
  variant,
  size,
  fullWidth,
  loading,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

type ButtonLinkProps = {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
};

export function ButtonLink({ href, variant, size, fullWidth, leftIcon, rightIcon, className, children, prefetch }: ButtonLinkProps) {
  return (
    <Link href={href} prefetch={prefetch} className={buttonClasses({ variant, size, fullWidth, className })}>
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  );
}
