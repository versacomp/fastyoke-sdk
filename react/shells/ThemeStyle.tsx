import { useEffect, useState } from 'react';

export interface ThemeStyleProps {
  themeId: string;
  tenantId: string;
  fetcher?: typeof fetch;
}

export function ThemeStyle({ themeId, tenantId, fetcher = fetch }: ThemeStyleProps) {
  const [css, setCss] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetcher(`/api/v1/tenant/themes/${encodeURIComponent(themeId)}?tenant_id=${encodeURIComponent(tenantId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`theme fetch ${r.status}`))))
      .then((body: { tokens_json?: Record<string, string> }) => {
        if (cancelled) return;
        const lines = Object.entries(body.tokens_json ?? {})
          .map(([k, v]) => `  ${k}: ${v};`)
          .join('\n');
        setCss(`[data-theme="${themeId}"] {\n${lines}\n}`);
      })
      .catch(() => {
        if (!cancelled) setCss(null);
      });
    return () => {
      cancelled = true;
    };
  }, [themeId, tenantId, fetcher]);

  if (css === null) return null;
  return <style data-theme-style={themeId} dangerouslySetInnerHTML={{ __html: css }} />;
}
