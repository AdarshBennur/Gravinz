export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mockRequest<T>(data: T, ms = 700): Promise<T> {
  await sleep(ms);
  return data;
}
