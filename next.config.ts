import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist nie bundluje się poprawnie przez webpack w server route —
  // traktuj jako external, by Next.js użył natywnego require() w runtime.
  serverExternalPackages: ["pdfjs-dist"],
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
