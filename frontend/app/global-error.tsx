"use client";

import { useEffect } from "react";
import { reportClientError } from "@/modules/logging/client";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError("frontend.error.global_boundary", error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          alignItems: "center",
          background: "#f3f4f6",
          color: "#111827",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          justifyContent: "center",
          margin: 0,
          minHeight: "100vh",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "520px", textAlign: "center" }}>
          <title>CampusConnect error</title>
          <h1>CampusConnect could not load</h1>
          <p>The error was recorded so the team can investigate it.</p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
