import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // pdf-parse/pdfjs-dist resolves its Node worker relative to the installed
  // package. Bundling it into a Turbopack server chunk breaks that path and
  // makes PDF.js look for `.next/.../chunks/pdf.worker.mjs` instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "tesseract.js", "@tesseract.js-data/ind"],
  outputFileTracingIncludes: {
    "/api/documents": ["./node_modules/@tesseract.js-data/ind/4.0.0/ind.traineddata.gz"],
  },
  allowedDevOrigins: ["192.168.140.10"],
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};

export default nextConfig;
