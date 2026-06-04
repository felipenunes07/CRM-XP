import React, { useEffect, useState, useRef } from "react";
import { Cpu, Database, FileSpreadsheet, BarChart3, TrendingUp, Clock, CheckCircle2, ShieldCheck } from "lucide-react";

interface ReportLoadingScreenProps {
  isLoading: boolean;
  onFinished: () => void;
}

export function ReportLoadingScreen({ isLoading, onFinished }: ReportLoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const progressRef = useRef(0);
  
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Simulated progress
  useEffect(() => {
    if (!isLoading) return;
    
    const interval = setInterval(() => {
      const current = progressRef.current;
      if (current >= 98) {
        clearInterval(interval);
        return;
      }
      
      let increment = 0;
      if (current < 20) {
        increment = Math.random() * 5 + 3;
      } else if (current < 50) {
        increment = Math.random() * 3 + 2;
      } else if (current < 80) {
        increment = Math.random() * 2 + 1.5;
      } else if (current < 95) {
        increment = Math.random() * 1 + 0.5;
      } else {
        increment = 0.1;
      }
      
      const next = Math.min(98, parseFloat((current + increment).toFixed(1)));
      setProgress(next);
    }, 220);

    return () => clearInterval(interval);
  }, [isLoading]);

  // Finish load
  useEffect(() => {
    if (!isLoading) {
      const current = progressRef.current;
      const duration = 350;
      const steps = 10;
      const stepTime = duration / steps;
      const increment = (100 - current) / steps;
      
      let step = 0;
      const interval = setInterval(() => {
        step++;
        if (step >= steps) {
          setProgress(100);
          clearInterval(interval);
          
          setTimeout(() => {
            setFadeOut(true);
            setTimeout(() => {
              onFinished();
            }, 500);
          }, 800);
        } else {
          setProgress(prev => Math.min(100, parseFloat((prev + increment).toFixed(1))));
        }
      }, stepTime);

      return () => clearInterval(interval);
    }
  }, [isLoading, onFinished]);

  const getStageInfo = (p: number) => {
    if (p < 15) {
      return { text: "Ligando processador de relatórios XP...", icon: <Database className="stage-icon spin" /> };
    } else if (p < 30) {
      return { text: "Conectando ao banco de dados de WhatsApp...", icon: <Database className="stage-icon pulse" /> };
    } else if (p < 45) {
      return { text: "Sincronizando 124.500+ registros de eventos...", icon: <FileSpreadsheet className="stage-icon pulse" /> };
    } else if (p < 60) {
      return { text: "Calculando mensagens por hora do time...", icon: <Clock className="stage-icon wave" /> };
    } else if (p < 75) {
      return { text: "Gerando matriz de calor de chats...", icon: <BarChart3 className="stage-icon pulse" /> };
    } else if (p < 90) {
      return { text: "Compilando médias e gráficos de barras...", icon: <TrendingUp className="stage-icon wave" /> };
    } else if (p < 98) {
      return { text: "Consolidando dados de conversas e agentes...", icon: <FileSpreadsheet className="stage-icon pulse" /> };
    } else if (p < 100) {
      return { text: "Processamento de dados finalizado!", icon: <ShieldCheck className="stage-icon pulse" /> };
    } else {
      return { text: "Relatório Pronto! Exibindo painel...", icon: <CheckCircle2 className="stage-icon success-pop" /> };
    }
  };

  const stage = getStageInfo(progress);

  // Simulated metrics that count up
  const conversationsVal = Math.min(845, Math.round(progress * 8.6));
  const sentVal = Math.min(12430, Math.round(progress * 126.8));
  const responseTimeVal = Math.max(34, 180 - Math.round(progress * 1.5));

  return (
    <div className={`phone-loader-overlay ${fadeOut ? "fade-out" : ""}`}>
      <div className="report-loader-container">
        
        {/* Glow backdrops */}
        <div className="loader-backdrop-glow top-left"></div>
        <div className="loader-backdrop-glow bottom-right"></div>
        
        <div className="report-loader-panel">
          {/* XP Diagnostics Header */}
          <div className="loader-brand">
            <span className="brand-xp">XP</span>
            <span className="brand-factory">COMPILER</span>
          </div>

          <div className="report-skeleton-mockup">
            {/* Header section with mock filters */}
            <div className="skeleton-header-row">
              <div className="skeleton-pill"></div>
              <div className="skeleton-pill"></div>
              <div className="skeleton-pill right"></div>
            </div>

            {/* Stat Cards section */}
            <div className="skeleton-stats-row">
              <div className="skeleton-stat-card">
                <span className="stat-label">Conversas</span>
                <span className="stat-number">{conversationsVal}</span>
                <div className="stat-bar-indicator" style={{ width: `${Math.min(100, progress * 1.1)}%` }}></div>
              </div>
              <div className="skeleton-stat-card">
                <span className="stat-label">Enviadas</span>
                <span className="stat-number">{sentVal}</span>
                <div className="stat-bar-indicator" style={{ width: `${Math.min(100, progress * 1.25)}%` }}></div>
              </div>
              <div className="skeleton-stat-card">
                <span className="stat-label">Respostas</span>
                <span className="stat-number">{responseTimeVal}s</span>
                <div className="stat-bar-indicator" style={{ width: `${Math.min(100, progress * 0.95)}%` }}></div>
              </div>
            </div>

            {/* Main Content Split: Chart & Heatmap */}
            <div className="skeleton-content-split">
              {/* Mock Bar Chart */}
              <div className="skeleton-chart-panel">
                <span className="panel-title">Frequência Diária</span>
                <div className="skeleton-bars-container">
                  <div className="skeleton-bar" style={{ height: `${Math.min(65, progress * 0.8)}%` }}></div>
                  <div className="skeleton-bar" style={{ height: `${Math.min(45, progress * 0.65)}%` }}></div>
                  <div className="skeleton-bar" style={{ height: `${Math.min(85, progress * 1.1)}%` }}></div>
                  <div className="skeleton-bar" style={{ height: `${Math.min(30, progress * 0.45)}%` }}></div>
                  <div className="skeleton-bar" style={{ height: `${Math.min(55, progress * 0.7)}%` }}></div>
                  <div className="skeleton-bar" style={{ height: `${Math.min(75, progress * 0.95)}%` }}></div>
                  <div className="skeleton-bar" style={{ height: `${Math.min(90, progress * 1.2)}%` }}></div>
                </div>
              </div>

              {/* Mock Heatmap Grid */}
              <div className="skeleton-heatmap-panel">
                <span className="panel-title">Mapa de Horários</span>
                <div className="skeleton-heatmap-grid">
                  {Array.from({ length: 25 }).map((_, i) => {
                    const row = Math.floor(i / 5);
                    const col = i % 5;
                    // Light up cells based on progress
                    const isActive = progress > (row + col) * 10;
                    const opacity = isActive ? Math.min(0.85, 0.15 + (progress - (row + col) * 10) / 100) : 0.05;
                    return (
                      <div 
                        key={i} 
                        className="skeleton-heatmap-cell" 
                        style={{ 
                          opacity,
                          background: isActive ? 'var(--accent)' : '#cbd5e1'
                        }}
                      ></div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Laser scanning line for compiler diagnostic */}
            {progress < 100 && <div className="compiler-scanner"></div>}
          </div>

          {/* Progress Section */}
          <div className="compiler-progress-section">
            <div className="compiler-status-row">
              <span className="compiler-icon-wrap">{stage.icon}</span>
              <span className="compiler-status-label">{stage.text}</span>
              <span className="compiler-percent">{Math.round(progress)}%</span>
            </div>
            <div className="compiler-progress-track">
              <div className="compiler-progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <div className="loader-caption">
            XP Factory • Compilação Analítica em Tempo Real
          </div>
        </div>
      </div>
    </div>
  );
}
