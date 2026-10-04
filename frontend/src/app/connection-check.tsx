"use client";

import { useState } from "react";

export default function ConnectionCheck({ configured }: { configured: boolean }) {
  const [checking, setChecking] = useState(false);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState(
    configured
      ? "Your connection details are configured. Check the connection to continue."
      : "Fill in the project URL and publishable key in frontend/.env, then restart the app.",
  );

  async function checkConnection() {
    setChecking(true);
    setConnected(false);
    setMessage("Checking your Supabase connection…");

    try {
      const response = await fetch("/api/supabase/health", { cache: "no-store" });
      const data = await response.json();
      setConnected(response.ok && data.connected === true);
      setMessage(data.message);
    } catch {
      setMessage("The connection check could not complete. Try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="card" aria-labelledby="connection-title">
      <div className="card-heading">
        <h2 id="connection-title">Supabase connection</h2>
        <span className={`badge ${connected ? "connected" : ""}`}>
          {connected ? "Connected" : "Not verified"}
        </span>
      </div>
      <p role="status" aria-live="polite">{message}</p>
      <button onClick={checkConnection} disabled={checking}>
        {checking ? "Checking…" : "Check connection"}
      </button>
    </section>
  );
}
