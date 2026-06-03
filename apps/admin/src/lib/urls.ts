// Cross-app URL config. Reads VITE_CUSTOMER_URL / VITE_KDS_URL from .env so
// the same code works in dev (localhost:8081) and prod (https://app.foodcourt.com).

const trim = (u?: string) => (u ?? '').replace(/\/$/, '');

export const CUSTOMER_URL = trim(import.meta.env.VITE_CUSTOMER_URL as string | undefined)
  || 'http://localhost:8081';

export const KDS_URL = trim(import.meta.env.VITE_KDS_URL as string | undefined)
  || 'http://localhost:5175';

export function customerTableUrl(branchSlug: string, qrToken: string): string {
  return `${CUSTOMER_URL}/${branchSlug}/t/${qrToken}`;
}

export function customerBranchUrl(branchSlug: string): string {
  return `${CUSTOMER_URL}/${branchSlug}`;
}

export function customerLoginUrl(): string {
  return `${CUSTOMER_URL}/login`;
}
