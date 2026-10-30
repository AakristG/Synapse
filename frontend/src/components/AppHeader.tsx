import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import BrandMark from './BrandMark'

export default function AppHeader({
  username,
  onLogout,
  children,
}: {
  username?: string
  onLogout?: () => void
  children?: ReactNode
}) {
  return (
    <header className="h-16 shrink-0 border-b border-slate-200/80 bg-white/85 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <BrandMark />
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-800">Synapse</p>
          <p className="text-sm text-slate-600 truncate">
            {username ? `Welcome, ${username}` : 'Diagnostic assistant'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {children}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:text-rose-800 hover:bg-rose-50 border border-slate-200 transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Log out</span>
          </button>
        )}
      </div>
    </header>
  )
}
