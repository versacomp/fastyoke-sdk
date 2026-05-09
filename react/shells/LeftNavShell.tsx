import type { ReactNode } from 'react';
import { ThemeStyle } from './ThemeStyle';

export interface ShellProps {
  appName: string;
  themeId: string;
  tenantId: string;
  entities: string[];
  onNavigate?: (entity: string) => void;
  children: ReactNode;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function LeftNavShell({ appName, themeId, tenantId, entities, onNavigate, children }: ShellProps) {
  return (
    <div data-testid="shell-root" data-theme={themeId} className="flex h-full min-h-screen">
      <ThemeStyle themeId={themeId} tenantId={tenantId} />
      <aside className="w-56 bg-slate-900 text-slate-100 px-4 py-5">
        <div className="mb-6 text-base font-semibold">{appName}</div>
        <nav className="flex flex-col gap-1">
          {entities.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onNavigate?.(e)}
              className="w-full text-left rounded px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            >
              {capitalize(e)}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 bg-slate-50 p-6">{children}</main>
    </div>
  );
}
