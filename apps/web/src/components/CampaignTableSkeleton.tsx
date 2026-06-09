export function CampaignTableSkeleton() {
  return (
    <div className="z-table-wrapper" style={{ border: "1px solid #e4e4e7", borderRadius: "12px", background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.02)" }}>
      <table className="z-table">
        <thead>
          <tr>
            <th style={{ padding: "1rem 1.5rem" }}>CAMPANHA</th>
            <th style={{ padding: "1rem 1.5rem" }}>STATUS</th>
            <th style={{ padding: "1rem 1.5rem" }}>PROGRESSO GERAL</th>
            <th style={{ padding: "1rem 1.5rem", textAlign: "right" }}>AÇÕES</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5].map((i) => (
            <tr key={i} style={{ borderBottom: "1px solid #e4e4e7" }}>
              <td style={{ padding: "1.25rem 1.5rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div
                    style={{
                      width: "70%",
                      height: "16px",
                      background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                      backgroundSize: "200% 100%",
                      borderRadius: "4px",
                      animation: "shimmer 1.5s infinite",
                    }}
                  />
                  <div
                    style={{
                      width: "50%",
                      height: "12px",
                      background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                      backgroundSize: "200% 100%",
                      borderRadius: "4px",
                      animation: "shimmer 1.5s infinite",
                      animationDelay: "0.1s",
                    }}
                  />
                </div>
              </td>
              <td style={{ padding: "1.25rem 1.5rem" }}>
                <div
                  style={{
                    width: "90px",
                    height: "24px",
                    background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                    backgroundSize: "200% 100%",
                    borderRadius: "9999px",
                    animation: "shimmer 1.5s infinite",
                    animationDelay: "0.2s",
                  }}
                />
              </td>
              <td style={{ padding: "1.25rem 1.5rem", width: "300px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div
                    style={{
                      width: "100%",
                      height: "6px",
                      background: "#f4f4f5",
                      borderRadius: "9999px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: "60%",
                        height: "100%",
                        background: "linear-gradient(90deg, #d4d4d8 0%, #a1a1aa 50%, #d4d4d8 100%)",
                        backgroundSize: "200% 100%",
                        borderRadius: "9999px",
                        animation: "shimmer 1.5s infinite",
                        animationDelay: "0.3s",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      width: "80%",
                      height: "12px",
                      background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                      backgroundSize: "200% 100%",
                      borderRadius: "4px",
                      animation: "shimmer 1.5s infinite",
                      animationDelay: "0.4s",
                    }}
                  />
                </div>
              </td>
              <td style={{ padding: "1.25rem 1.5rem", textAlign: "right" }}>
                <div
                  style={{
                    width: "100px",
                    height: "36px",
                    marginLeft: "auto",
                    background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                    backgroundSize: "200% 100%",
                    borderRadius: "8px",
                    animation: "shimmer 1.5s infinite",
                    animationDelay: "0.5s",
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <style>{`
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>
    </div>
  );
}
