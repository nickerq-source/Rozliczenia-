export interface AnthropicKeyInspection {
  hasRawValue: boolean;
  rawLength: number;
  rawInvalidChars: Array<{ index: number; code: number }>;
  tokenFound: boolean;
  tokenLength: number;
  tokenMask: string | null;
  tokenStartsWithSkAnt: boolean;
  tokenInvalidChars: Array<{ index: number; code: number }>;
  error: string | null;
}

function maskToken(token: string | null): string | null {
  if (!token) return null;
  if (token.length <= 18) return `${token.slice(0, 6)}...`;
  return `${token.slice(0, 10)}...${token.slice(-6)}`;
}

function invalidChars(value: string): Array<{ index: number; code: number }> {
  return [...value]
    .map((ch, index) => ({ ch, index }))
    .filter(({ ch }) => /[^\x20-\x7E]/.test(ch))
    .slice(0, 10)
    .map(({ ch, index }) => ({ index, code: ch.charCodeAt(0) }));
}

export function inspectAnthropicApiKey(raw = process.env.ANTHROPIC_API_KEY): AnthropicKeyInspection {
  const hasRawValue = !!raw?.trim();
  if (!hasRawValue) {
    return {
      hasRawValue: false,
      rawLength: 0,
      rawInvalidChars: [],
      tokenFound: false,
      tokenLength: 0,
      tokenMask: null,
      tokenStartsWithSkAnt: false,
      tokenInvalidChars: [],
      error: "Brak ANTHROPIC_API_KEY na serwerze. Dodaj tę zmienną w Vercel.",
    };
  }

  const cleaned = raw!.trim().replace(/^["']|["']$/g, "");
  const compact = cleaned.replace(/\s+/g, "");
  const token = compact.match(/sk-ant-[A-Za-z0-9_-]{20,}/)?.[0] ?? compact;
  const tokenInvalidChars = invalidChars(token);
  const tokenStartsWithSkAnt = token.startsWith("sk-ant-");

  let error: string | null = null;
  if (tokenInvalidChars.length > 0) {
    const first = tokenInvalidChars[0];
    error = `ANTHROPIC_API_KEY zawiera niedozwolony znak przy pozycji ${first.index} (kod ${first.code}).`;
  } else if (!tokenStartsWithSkAnt) {
    error = "ANTHROPIC_API_KEY wygląda niepoprawnie. Wklej sam klucz Claude zaczynający się od sk-ant-.";
  }

  return {
    hasRawValue: true,
    rawLength: raw!.length,
    rawInvalidChars: invalidChars(raw!),
    tokenFound: tokenStartsWithSkAnt,
    tokenLength: token.length,
    tokenMask: maskToken(token),
    tokenStartsWithSkAnt,
    tokenInvalidChars,
    error,
  };
}

export function getAnthropicApiKey(): { key: string | null; error: string | null } {
  const raw = process.env.ANTHROPIC_API_KEY;
  const inspection = inspectAnthropicApiKey(raw);
  if (inspection.error) return { key: null, error: inspection.error };

  const cleaned = raw!.trim().replace(/^["']|["']$/g, "");
  const compact = cleaned.replace(/\s+/g, "");
  const token = compact.match(/sk-ant-[A-Za-z0-9_-]{20,}/)?.[0] ?? compact;
  return { key: token, error: null };
}
