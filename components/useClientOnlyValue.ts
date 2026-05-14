export function useClientOnlyValue<T>(server: T, client: T): T {
  return client;
}
