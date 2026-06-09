import { LoaderCircle, CheckCircle2, Send } from "lucide-react";
import { useEffect, useState } from "react";

interface CampaignCreationProgressProps {
  isCreating: boolean;
}

export function CampaignCreationProgress({ isCreating }: CampaignCreationProgressProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    { label: "Validando destinatários...", progress: 25 },
    { label: "Organizando fila de envio...", progress: 50 },
    { label: "Configurando instâncias WhatsApp...", progress: 75 },
    { label: "Finalizando preparação...", progress: 95 },
  ];

  useEffect(() => {
    if (!isCreating) {
      setProgress(0);
      setCurrentStep(0);
      return;
    }

    // Animação de progresso suave
    const interval = setInterval(() => {
      setProgress((prev) => {
        const nextStep = steps.find((step) => prev < step.progress);
        if (nextStep) {
          const increment = (nextStep.progress - prev) / 10;
          return Math.min(prev + increment, nextStep.progress);
        }
        return prev;
      });
    }, 200);

    // Atualizar step atual baseado no progresso
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        const currentProgress = progress;
        const stepIndex = steps.findIndex((step) => currentProgress < step.progress);
        return stepIndex >= 0 ? stepIndex : steps.length - 1;
      });
    }, 300);

    return () => {
      clearInterval(interval);
      clearInterval(stepInterval);
    };
  }, [isCreating, progress]);

  if (!isCreating) return null;

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          zIndex: 10000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "fadeIn 0.2s ease-out",
        }}
      >
        {/* Progress Card */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            padding: "2.5rem 3rem",
            maxWidth: "500px",
            width: "90%",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
            animation: "scaleIn 0.3s ease-out",
          }}
        >
          {/* Icon */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #10b981, #059669)",
                display: "grid",
                placeItems: "center",
                animation: "pulse 2s ease-in-out infinite",
              }}
            >
              <Send size={36} style={{ color: "#ffffff" }} />
            </div>
          </div>

          {/* Title */}
          <h3
            style={{
              margin: "0 0 0.5rem 0",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#18181b",
              textAlign: "center",
            }}
          >
            Preparando Disparo...
          </h3>

          <p
            style={{
              margin: "0 0 2rem 0",
              fontSize: "0.9rem",
              color: "#71717a",
              textAlign: "center",
            }}
          >
            Aguarde enquanto organizamos sua campanha
          </p>

          {/* Progress Bar */}
          <div
            style={{
              width: "100%",
              height: "8px",
              background: "#f4f4f5",
              borderRadius: "9999px",
              overflow: "hidden",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: "linear-gradient(90deg, #10b981, #34d399)",
                borderRadius: "9999px",
                transition: "width 0.3s ease",
              }}
            />
          </div>

          {/* Percentage */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "2rem",
            }}
          >
            <span
              style={{
                fontSize: "0.85rem",
                color: "#71717a",
                fontWeight: 500,
              }}
            >
              {steps[currentStep]?.label || "Processando..."}
            </span>
            <span
              style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "#10b981",
              }}
            >
              {Math.round(progress)}%
            </span>
          </div>

          {/* Steps List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {steps.map((step, index) => {
              const isCompleted = progress >= step.progress;
              const isCurrent = currentStep === index;

              return (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "0.75rem 1rem",
                    background: isCurrent
                      ? "rgba(16, 185, 129, 0.08)"
                      : "transparent",
                    borderRadius: "8px",
                    border: isCurrent
                      ? "1px solid rgba(16, 185, 129, 0.2)"
                      : "1px solid transparent",
                    transition: "all 0.3s ease",
                  }}
                >
                  {isCompleted ? (
                    <CheckCircle2
                      size={20}
                      style={{ color: "#10b981", flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        border: isCurrent
                          ? "3px solid #10b981"
                          : "2px solid #e4e4e7",
                        flexShrink: 0,
                        animation: isCurrent ? "spin 1s linear infinite" : "none",
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: "0.85rem",
                      color: isCompleted || isCurrent ? "#18181b" : "#a1a1aa",
                      fontWeight: isCurrent ? 600 : 400,
                    }}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { 
            opacity: 0; 
            transform: scale(0.9); 
          }
          to { 
            opacity: 1; 
            transform: scale(1); 
          }
        }
        @keyframes pulse {
          0%, 100% { 
            transform: scale(1);
            opacity: 1;
          }
          50% { 
            transform: scale(1.05);
            opacity: 0.9;
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
