"use client";

// Renders its own document without the app's stylesheet, so it uses inline styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0B0B0D", color: "#F3EFE6", fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong</title>
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 36, margin: 0 }}>Something went wrong.</h1>
          <p style={{ color: "#A69A86" }}>Please try again.{error.digest ? ` (Reference: ${error.digest})` : ""}</p>
          <button onClick={() => retry()} style={{ marginTop: 16, padding: "10px 18px", borderRadius: 10, border: 0, background: "#F2B84B", color: "#1A1408", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
