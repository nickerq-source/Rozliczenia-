export interface ParsedRouteDriver {
  route: string;
  driverName: string;
}

interface ContinuationIdentity {
  surname: string;
  routePart: string;
}

function extractContinuationIdentity(
  lines: string[],
  knownTokens: Set<string> = new Set()
): ContinuationIdentity | null {
  for (const line of lines.slice(0, 3)) {
    const marker = line.match(/^\/[A-Za-z]\b\s*(.*)$/);
    if (marker) {
      const caps = marker[1]
        .split(/\s+/)
        .map((token) => token.replace(/^[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż-]+|[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż-]+$/g, ""))
        .filter((token) => token.length >= 2 && token === token.toUpperCase())
        .map((token) => token.toUpperCase());
      const unknown = caps.filter((token) => !knownTokens.has(token));
      const surname = unknown.at(-1);
      if (surname) {
        return {
          surname,
          routePart: unknown.slice(0, -1).join(" "),
        };
      }
    }

    const candidates = [...line.matchAll(/,\s*([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż-]{2,})\b/g)]
      .map((match) => match[1].toUpperCase())
      .filter((candidate) => !knownTokens.has(candidate));
    const surname = candidates.at(-1);
    if (surname) return { surname, routePart: "" };
  }
  return null;
}

export function splitRouteDriver(
  beforeType: string,
  continuationLines: string[]
): ParsedRouteDriver {
  const cleaned = beforeType.replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length === 0) return { route: "", driverName: "" };

  const knownTokens = new Set(tokens.map((token) => token.toUpperCase()));
  const continuation = extractContinuationIdentity(continuationLines, knownTokens);
  if (continuation) {
    const firstName = tokens[tokens.length - 1];
    return {
      route: [...tokens.slice(0, -1), continuation.routePart].filter(Boolean).join(" "),
      driverName: `${firstName} ${continuation.surname}`.replace(/\s+/g, " ").trim(),
    };
  }

  if (tokens.length >= 2) {
    return {
      route: tokens.slice(0, -2).join(" "),
      driverName: tokens.slice(-2).join(" "),
    };
  }

  return { route: "", driverName: tokens[0] };
}
