import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type AlertProps = HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' }

export function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'relative w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground',
        variant === 'destructive' && 'border-destructive/50 text-destructive',
        className,
      )}
      {...props}
    />
  )
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
}
