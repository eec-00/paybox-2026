"use client";

import { useEffect } from "react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Si el error es un ChunkLoadError, hacer reload automático una sola vez
        if (
            error?.name === "ChunkLoadError" ||
            error?.message?.includes("ChunkLoadError") ||
            error?.message?.includes("Failed to load chunk")
        ) {
            const reloadKey = "chunk_error_reload";
            const hasReloaded = sessionStorage.getItem(reloadKey);

            if (!hasReloaded) {
                sessionStorage.setItem(reloadKey, "1");
                window.location.reload();
            } else {
                // Si ya recargó y sigue fallando, limpiar cache y recargar
                sessionStorage.removeItem(reloadKey);
                if ("caches" in window) {
                    caches.keys().then((names) => {
                        names.forEach((name) => caches.delete(name));
                    });
                }
            }
        }
    }, [error]);

    const isChunkError =
        error?.name === "ChunkLoadError" ||
        error?.message?.includes("ChunkLoadError") ||
        error?.message?.includes("Failed to load chunk");

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
                <div
                    style={{
                        textAlign: "center",
                        padding: "2rem",
                        maxWidth: "480px",
                    }}
                >
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>
                        {isChunkError ? "🔄" : "⚠️"}
                    </div>
                    <h1
                        style={{
                            fontSize: "1.5rem",
                            fontWeight: 700,
                            marginBottom: "0.5rem",
                        }}
                    >
                        {isChunkError ? "Actualizando la aplicación..." : "Algo salió mal"}
                    </h1>
                    <p
                        style={{
                            color: "#94a3b8",
                            marginBottom: "1.5rem",
                            lineHeight: 1.6,
                        }}
                    >
                        {isChunkError
                            ? "Hay una nueva versión disponible. La página se recargará automáticamente."
                            : "Ocurrió un error inesperado. Por favor intenta nuevamente."}
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
