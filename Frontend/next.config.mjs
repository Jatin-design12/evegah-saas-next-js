import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firstNonEmpty = (...values) => {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (trimmed) return trimmed;
  }
  return "";
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_API_BASE_URL: firstNonEmpty(
      process.env.NEXT_PUBLIC_API_BASE_URL,
      process.env.NEXT_PUBLIC_API_URL,
      process.env.VITE_API_BASE_URL,
      process.env.VITE_API_URL
    ),
    NEXT_PUBLIC_API_URL: firstNonEmpty(
      process.env.NEXT_PUBLIC_API_URL,
      process.env.NEXT_PUBLIC_API_BASE_URL,
      process.env.VITE_API_URL,
      process.env.VITE_API_BASE_URL
    ),
    NEXT_PUBLIC_FIREBASE_API_KEY: firstNonEmpty(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      process.env.VITE_FIREBASE_API_KEY
    ),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: firstNonEmpty(
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      process.env.VITE_FIREBASE_AUTH_DOMAIN
    ),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: firstNonEmpty(
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      process.env.VITE_FIREBASE_PROJECT_ID
    ),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: firstNonEmpty(
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      process.env.VITE_FIREBASE_STORAGE_BUCKET
    ),
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: firstNonEmpty(
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      process.env.VITE_FIREBASE_MESSAGING_SENDER_ID
    ),
    NEXT_PUBLIC_FIREBASE_APP_ID: firstNonEmpty(
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      process.env.VITE_FIREBASE_APP_ID
    ),
    NEXT_PUBLIC_EVEGAH_UPI_ID: firstNonEmpty(
      process.env.NEXT_PUBLIC_EVEGAH_UPI_ID,
      process.env.VITE_EVEGAH_UPI_ID
    ),
    NEXT_PUBLIC_EVEGAH_PAYEE_NAME: firstNonEmpty(
      process.env.NEXT_PUBLIC_EVEGAH_PAYEE_NAME,
      process.env.VITE_EVEGAH_PAYEE_NAME
    ),
    NEXT_PUBLIC_ICICI_ENABLED: firstNonEmpty(
      process.env.NEXT_PUBLIC_ICICI_ENABLED,
      process.env.VITE_ICICI_ENABLED
    ),
  },
};

export default nextConfig;
