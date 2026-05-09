import { ThemeStyle } from './ThemeStyle';
import type { ShellProps } from './LeftNavShell';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function TopNavShell({ appName, themeId, tenantId, entities, onNavigate, children }: ShellProps) {
  return (
    <div data-testid="shell-root" data-theme={themeId} className="flex flex-col min-h-screen">
      <ThemeStyle themeId={themeId} tenantId={tenantId} />
      <nav role="navigation" className="flex items-center gap-4 bg-slate-900 px-6 py-3 text-slate-100">
        <div className="font-semibold">{appName}</div>
        <div className="flex gap-2">
          {entities.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onNavigate?.(e)}
              className="rounded px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
            >
              {capitalize(e)}
            </button>
          ))}
        </div>
      </nav>
      <main className="flex-1 bg-slate-50 p-6">{children}</main>
    </div>
  );
}
