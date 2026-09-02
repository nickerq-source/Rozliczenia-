function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

const DESCRIPTION_STOP_RE = /^(?:ZLECENIODAWCA|PLATNIK|ODBIORCA\s+FAKTURY|CENTRUM\s+LOGISTYCZNE|NR\s+ZLECENIA|ZLECENIA\s+TRANSPORTU|PODSUMOWANIE|RAZEM|STRONA)\b/i;

function isDescriptionStopLine(line: string): boolean {
  return DESCRIPTION_STOP_RE.test(
    line
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
  );
}

function stripDriverIdentity(value: string, driverName: string): string {
  const identityTokens = new Set(
    `${driverName} YEVHENII PITIANIN ARTUR SZADY`
      .split(/\s+/)
      .map(normalizeToken)
      .filter(Boolean)
  );
  const tokens = value.split(/\s+/).filter(Boolean);

  while (tokens.length > 0 && identityTokens.has(normalizeToken(tokens[0]))) {
    tokens.shift();
  }

  return tokens.join(" ").replace(/^[\s,;:.\-–—]+/, "").trim();
}

/** Wyciąga pełny opis zlecenia z linii /I znajdujących się pod rekordem tabeli PDF. */
export function extractAdditionalDescription(block: string[], driverName: string): string {
  const markerIndex = block.findIndex((line) => /^\/I\b/i.test(line.trim()));
  if (markerIndex < 0) return "";

  const parts: string[] = [];
  for (let index = markerIndex; index < block.length; index++) {
    let line = block[index]?.replace(/\s+/g, " ").trim() ?? "";
    if (!line) continue;

    if (index === markerIndex) {
      line = stripDriverIdentity(line.replace(/^\/I\b\s*/i, ""), driverName);
    } else if (/^\/[A-Za-z]\b/.test(line)) {
      break;
    }

    if (!line) continue;
    if (isDescriptionStopLine(line)) break;
    parts.push(line);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}
