const trim = (u?: string) => (u ?? '').replace(/\/$/, '');

export const CUSTOMER_URL = trim(import.meta.env.VITE_CUSTOMER_URL as string | undefined)
  || 'http://localhost:8081';

export const ADMIN_URL = trim(import.meta.env.VITE_ADMIN_URL as string | undefined)
  || 'http://localhost:8000';
