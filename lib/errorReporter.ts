import { supabase } from './supabaseClient';

// Self-hosted crash reporting: errors land in the error_logs table
// (SETUP_ERROR_LOGS.sql) so problems are visible without user screenshots.
// Reporting must never break the app or loop, hence the swallow-everything
// error handling and the rate limit.

const sentAt: number[] = [];
const MAX_PER_MINUTE = 10;

export const reportError = async (
  message: unknown,
  stack?: string | null,
  source: string = 'manual'
): Promise<void> => {
  try {
    const now = Date.now();
    while (sentAt.length && now - sentAt[0] > 60_000) sentAt.shift();
    if (sentAt.length >= MAX_PER_MINUTE) return;
    sentAt.push(now);

    const { data } = await supabase.auth.getSession();
    await supabase.from('error_logs').insert({
      message: String(message ?? 'unknown error').slice(0, 2000),
      stack: stack ? String(stack).slice(0, 8000) : null,
      source,
      url: typeof location !== 'undefined' ? location.href : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      user_id: data?.session?.user?.id ?? null,
    });
  } catch {
    // Never let logging cause more errors.
  }
};

let installed = false;

export const installErrorReporter = (): void => {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => {
    reportError(e.message, e.error?.stack, 'window');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason: any = e.reason;
    reportError(reason?.message || String(reason), reason?.stack, 'promise');
  });
};
