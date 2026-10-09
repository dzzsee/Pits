import { useServiceWorker } from '@/lib/use-sw'

export function UpdateToast() {
  const { prompt, applyUpdate } = useServiceWorker()

  if (prompt !== 'update') return null

  return (
    <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-sm animate-slide-up items-center gap-3 rounded-2xl border border-line bg-surface-raised p-3 shadow-lift lg:bottom-6 lg:left-6 lg:right-auto lg:mx-0">
      <p className="flex-1 text-[13px]">Hay una version nueva disponible.</p>
      <button
        type="button"
        onClick={() => void applyUpdate()}
        className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-ink"
      >
        Actualizar
      </button>
    </div>
  )
}
