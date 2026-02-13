export async function apiRequest(
  method: string,
  url: string,
  body?: any
): Promise<Response> {
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(data.message || `Request failed with status ${res.status}`);
  }
  return res;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await apiRequest("GET", url);
  return res.json();
}

export async function apiPost<T>(url: string, body?: any): Promise<T> {
  const res = await apiRequest("POST", url, body);
  return res.json();
}

export async function apiPut<T>(url: string, body?: any): Promise<T> {
  const res = await apiRequest("PUT", url, body);
  return res.json();
}

export async function apiDelete(url: string): Promise<void> {
  await apiRequest("DELETE", url);
}
