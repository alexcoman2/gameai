type TokenGetter = () => Promise<string | null>;

let _getToken: TokenGetter | null = null;

export function setAuthTokenGetter(getter: TokenGetter | null): void {
  _getToken = getter;
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (_getToken && !headers.has("authorization")) {
    try {
      const token = await _getToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
    } catch {
      // If token fetch fails, send the request unauthenticated and let the
      // server return 401 — better than swallowing the request.
    }
  }
  return fetch(input, { ...init, headers });
}
