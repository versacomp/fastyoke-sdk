import { ThemeStyle } from './ThemeStyle';
import type { ShellProps } from './LeftNavShell';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function TopBarSideRailShell({ appName, themeId, tenantId, entities, onNavigate, children }: ShellProps) {
  return (
    <div data-testid="shell-root" data-theme={themeId} className="flex flex-col min-h-screen">
      <ThemeStyle themeId={themeId} tenantId={tenantId} />
      <header className="flex items-center justify-between bg-slate-900 px-6 py-3 text-slate-100">
        <div className="font-semibold">{appName}</div>
        <div data-testid="user-menu" className="text-sm text-slate-300">user@tenant</div>
      </header>
      <div className="flex flex-1">
        <aside className="w-48 bg-slate-100 px-3 py-4 border-r border-slate-200">
          <nav className="flex flex-col gap-1">
            {entities.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onNavigate?.(e)}
                className="rounded px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
              >
                {capitalize(e)}
              </button>
            ))}
          </nav>
        </aside>
        <main className="flex-1 bg-white p-6">{children}</main>
      </div>
    </div>
  );
}
