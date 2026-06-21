"use client";

// Kompresja zdjęcia do JPEG base64 (paragony/dokumenty) — ogranicza rozmiar
// przed wysyłką do AI i zapisem w JSONB. Jeśli przeglądarka potrafi odczytać
// HEIC/HEIF, canvas zapisze wynik jako JPEG; jeśli nie, zwracamy czytelny błąd.

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Nie udało się odczytać pliku"));
    reader.readAsDataURL(file);
  });
}

function looksLikeHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return type.includes("heic") || type.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
}

export async function imageToCompressedDataUrl(file: File, maxSide = 2000, quality = 0.84): Promise<string> {
  const raw = await readFileAsDataUrl(file);
  if (!file.type.startsWith("image/") && !looksLikeHeic(file)) return raw;

  const img = new Image();
  img.src = raw;
  const decoded = await new Promise<boolean>((resolve, reject) => {
    img.onload = () => resolve(true);
    img.onerror = () => {
      if (looksLikeHeic(file)) {
        resolve(false);
        return;
      }
      reject(
        new Error(
          "Nie udało się przetworzyć zdjęcia"
        )
      );
    };
  });
  if (!decoded || !img.width || !img.height) return raw;

  // Paragony/faktury paliwowe są prawie zawsze pionowe. Gdy zdjęcie jest bokiem
  // (częste przy telefonie), obracamy je przed OCR, bo Vision myli wtedy wiersze.
  const rotateToPortrait = img.width > img.height * 1.12;
  const sourceW = rotateToPortrait ? img.height : img.width;
  const sourceH = rotateToPortrait ? img.width : img.height;
  const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceW * scale));
  canvas.height = Math.max(1, Math.round(sourceH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  if (rotateToPortrait) {
    const drawW = Math.max(1, Math.round(img.width * scale));
    const drawH = Math.max(1, Math.round(img.height * scale));
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0, drawW, drawH);
  } else {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL("image/jpeg", quality);
}
