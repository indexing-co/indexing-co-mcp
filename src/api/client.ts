export class ApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string | undefined
  ) {}

  async get(path: string, query?: Record<string, string>): Promise<unknown> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }
    const res = await fetch(url, { headers: this.headers() });
    return this.handle(res);
  }

  async post(path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handle(res);
  }

  async delete(path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handle(res);
  }

  async getPublic(path: string, query?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.origin());
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    const res = await fetch(url, { headers: this.headers(false) });
    return this.handle(res);
  }

  private headers(requireAuth = true): Record<string, string> {
    if (!this.apiKey && requireAuth) {
      throw new Error(
        'No API key configured. Set INDEXING_API_KEY env var or add API_KEY to ~/.indexing-co/credentials. Sign up at accounts.indexing.co'
      );
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }
    return headers;
  }

  private origin(): string {
    return new URL(this.baseUrl).origin;
  }

  private async handle(res: Response): Promise<unknown> {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return res.text();
  }
}
