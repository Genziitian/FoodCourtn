const trim = (u?: string) => (u ?? '').replace(/\/$/, '');

export const ADMIN_URL = trim(import.meta.env.VITE_ADMIN_URL as string | undefined)
  || 'http://localhost:8000';

export const adminLoginUrl = () => `${ADMIN_URL}/login`;
