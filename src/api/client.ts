export class ApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
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

  private headers(): Record<string, string> {
    return { 'X-API-KEY': this.apiKey, 'Content-Type': 'application/json' };
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
