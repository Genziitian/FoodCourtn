import { Database, X } from 'lucide-react';
import { useState } from 'react';

const KEY = 'foodcourt-mock-banner-dismissed';

/**
 * Displayed above pages that still read from in-memory mocks instead of Supabase.
 * Lets the reviewer know what's wired and what isn't.
 */
export function MockBanner({ page }: { page: string }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(KEY + ':' + page) === '1'; } catch { return false; }
  });
  if (dismissed) return null;

  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3 text-sm text-amber-900 mb-4">
      <Database className="size-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        <strong className="font-semibold">{page}</strong>{' '}
        still reads from in-memory mocks. The schema and CRUD queries exist in{' '}
        <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">apps/admin/src/lib/api.ts</code>{' '}
        — wire this page in the next pass.
      </div>
      <button
        onClick={() => {
          try { sessionStorage.setItem(KEY + ':' + page, '1'); } catch { /* */ }
          setDismissed(true);
        }}
        className="size-7 grid place-items-center rounded-full hover:bg-amber-100 text-amber-900"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
