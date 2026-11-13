import { useEffect, type ReactNode } from 'react'

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`rounded-2xl border border-line bg-card p-4 ${onClick ? 'cursor-pointer active:bg-card2' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-black hover:brightness-110',
  secondary: 'bg-card2 text-white border border-line hover:bg-line',
  ghost: 'text-accent hover:bg-card2',
  danger: 'bg-bad/15 text-bad border border-bad/30',
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  className = '',
  type = 'button',
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: Variant
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${VARIANT[variant]} ${className}`}>
      {children}
    </button>
  )
}

export function Stat({ label, value, sub, className = '' }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="truncate text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="pb-safe max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-line bg-card p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-full px-2 text-2xl leading-none text-muted" aria-label="Schließen">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  )
}

const inputCls = 'w-full rounded-xl border border-line bg-card2 px-3 py-2.5 text-white outline-none focus:border-accent'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function NumberInput({ value, onChange, step = 1, min, max, placeholder }: { value: number | undefined; onChange: (v: number | undefined) => void; step?: number; min?: number; max?: number; placeholder?: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={inputCls}
      value={value ?? ''}
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value.replace(',', '.')))}
    />
  )
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-sm">{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-line'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

export function Scale({ value, onChange, labels }: { value: number | undefined; onChange: (v: 1 | 2 | 3 | 4 | 5) => void; labels?: [string, string] }) {
  return (
    <div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n as 1 | 2 | 3 | 4 | 5)}
            className={`h-11 flex-1 rounded-xl border text-base font-semibold ${value === n ? 'border-accent bg-accent text-black' : 'border-line bg-card2'}`}
          >
            {n}
          </button>
        ))}
      </div>
      {labels && (
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  )
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'bad' | 'ok' }) {
  const cls = {
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    warn: 'border-warn/40 bg-warn/10 text-amber-100',
    bad: 'border-bad/40 bg-bad/10 text-rose-100',
    ok: 'border-ok/40 bg-ok/10 text-emerald-100',
  }[tone]
  return <div className={`rounded-xl border px-3 py-2.5 text-sm ${cls}`}>{children}</div>
}

export function Disclaimer() {
  return (
    <p className="px-2 pb-4 pt-6 text-center text-[11px] leading-relaxed text-muted">
      Der Plan ist eine automatische Empfehlung und ersetzt keine Beratung durch Trainer oder Arzt. Bei Schmerzen, Krankheit oder anhaltend schlechten Erholungswerten hat Pause Vorrang.
    </p>
  )
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <header className="pt-safe flex items-end justify-between gap-3 px-1 pb-2 pt-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
      </div>
      {right}
    </header>
  )
}
