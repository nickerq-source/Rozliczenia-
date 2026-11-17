export function useRouter() {
  return { push: (url: string) => window.location.assign(url), refresh: () => window.location.reload() };
}
