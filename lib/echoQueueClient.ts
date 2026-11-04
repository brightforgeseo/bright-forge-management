const DEFAULT_PORTAL_ORIGIN = 'https://echo-ben.tailfdbc33.ts.net';

export interface EchoJobRequest {
  kind?: 'chat' | 'content' | 'keywords' | 'audit' | 'business-inbox' | 'local-analysis';
  message: string;
  sourceMessageId?: string | null;
  channelId?: string | null;
  parentMessageId?: string | null;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionKey?: string | null;
  attachments?: Array<{ name: string; format: string; base64: string }>;
}

interface EchoQueueClientDependencies {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}

const portalBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http') && !window.location.hostname.endsWith('vercel.app')) {
    return window.location.origin;
  }
  return DEFAULT_PORTAL_ORIGIN;
};

export function createEchoQueueClient({
  baseUrl,
  getAccessToken,
  fetchFn = fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutMs = 300_000,
}: EchoQueueClientDependencies) {
  const request = async (url: string, init: RequestInit = {}) => {
    const token = await getAccessToken();
    if (!token) throw new Error('Sign in again before asking Echo');
    const response = await fetchFn(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Echo queue error ${response.status}`);
    return data;
  };

  return {
    async run(job: EchoJobRequest): Promise<string> {
      const queued = await request(`${baseUrl}/api/echo/jobs`, {
        method: 'POST',
        body: JSON.stringify(job),
      });
      const jobId = queued?.job?.id;
      if (!jobId) throw new Error('Echo queue returned no job id');

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const result = await request(`${baseUrl}/api/echo/jobs?id=${encodeURIComponent(jobId)}`);
        const current = result?.jobs?.[0];
        if (!current) throw new Error('Echo job disappeared from queue');
        if (current.status === 'succeeded') return current.result?.response || '';
        if (current.status === 'failed') throw new Error(current.error_message || 'Echo job failed');
        await sleep(1000);
      }
      throw new Error('Echo job timed out');
    },
  };
}

const echoQueueClient = createEchoQueueClient({
  baseUrl: portalBaseUrl(),
  getAccessToken: async () => {
    const { supabase } = await import('./supabaseClient');
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  },
});

export const runEchoJob = (job: EchoJobRequest): Promise<string> => echoQueueClient.run(job);
