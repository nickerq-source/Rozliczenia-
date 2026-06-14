import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist nie bundluje się poprawnie przez webpack w server route —
  // traktuj jako external, by Next.js użył natywnego require() w runtime.
  serverExternalPackages: ["pdfjs-dist"],
  // Wymuś dołączenie danych pdfjs (cmapy CID + czcionki standardowe) do funkcji
  // serverless — inaczej parser pada na fakturach z osadzonymi czcionkami CID.
  outputFileTracingIncludes: {
    "/api/import-invoice": [
      "./node_modules/pdfjs-dist/cmaps/**",
      "./node_modules/pdfjs-dist/standard_fonts/**",
      // Worker ładowany dynamicznie — nft go nie śledzi; wymuś jego wdrożenie
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.js",
    ],
    // PDF wypłaty czyta fonty z dysku w runtime — wymuś ich wdrożenie
    "/api/payroll-pdf/[month]": ["./public/fonts/*.ttf"],
  },
  webpack: (config) => {
    // pdf-parse/pdfjs-dist próbuje załadować moduł canvas (tylko do renderowania).
    // Parsowanie tekstu nie potrzebuje canvas — alias pozwala zignorować ten dependency.
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
