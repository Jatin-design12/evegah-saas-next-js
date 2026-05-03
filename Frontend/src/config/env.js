function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

export const ENV = Object.freeze({
  API_BASE_URL: firstNonEmpty(
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.NEXT_PUBLIC_API_URL
  ),
  FIREBASE_API_KEY: firstNonEmpty(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  FIREBASE_AUTH_DOMAIN: firstNonEmpty(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  FIREBASE_PROJECT_ID: firstNonEmpty(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  FIREBASE_STORAGE_BUCKET: firstNonEmpty(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  FIREBASE_MESSAGING_SENDER_ID: firstNonEmpty(
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  ),
  FIREBASE_APP_ID: firstNonEmpty(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  EVEGAH_UPI_ID: firstNonEmpty(process.env.NEXT_PUBLIC_EVEGAH_UPI_ID),
  EVEGAH_PAYEE_NAME: firstNonEmpty(process.env.NEXT_PUBLIC_EVEGAH_PAYEE_NAME),
  ICICI_ENABLED: firstNonEmpty(process.env.NEXT_PUBLIC_ICICI_ENABLED),
});
