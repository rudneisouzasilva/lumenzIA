"use client";

/**
 * Última proteção: quando até a moldura do site falha. Não usa o CSS do site (o Next não carrega
 * aqui), então o estilo vai junto, e acompanha o tema claro ou escuro do aparelho.
 */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          colorScheme: "light dark",
        }}
      >
        <title>Algo deu errado · LumenzIA</title>
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>
            Não foi possível carregar o site
          </h1>
          <p style={{ opacity: 0.75, lineHeight: 1.5 }}>
            Pode ser uma instabilidade momentânea. Tente de novo em alguns
            segundos.
          </p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: 16,
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: "#7c3aed",
              color: "#fff",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
