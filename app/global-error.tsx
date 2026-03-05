"use client";

import { useEffect } from "react";

// global-error.tsx captura errores que ocurren en el Root Layout
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (
      error?.name === "ChunkLoadError" ||
      error?.message?.includes("ChunkLoadError") ||
      error?.message?.includes("Failed to load chunk")
    ) {
      const reloadKey = "chunk_error_reload_global";
      const hasReloaded = sessionStorage.getItem(reloadKey);
      if (!hasReloaded) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
      } else {
        sessionStorage.removeItem(reloadKey);
      }
    }
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily: "'Inter', sans-serif",
          background: "#0f172a",
          color: "#e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔄</div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Actualizando la aplicación...
          </h1>
          <p style={{ color: "#94a3b8", margin: "1rem 0 1.5rem" }}>
            Hay una nueva versión disponible.
          </p>
          <button
            onClick={() => {
              sessionStorage.clear();
              window.location.reload();
            }}
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "0.75rem 1.5rem",
              cursor: "pointer",
              fontSize: "0.95rem",
              fontWeight: 600,
            }}
          >
            Recargar página
          </button>
        </div>
      </body>
    </html>
  );
}
