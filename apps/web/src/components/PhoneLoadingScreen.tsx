import React, { useEffect, useState, useRef } from "react";
import { Cpu, Smartphone, ShieldCheck, Wrench, Sparkles, CheckCircle2, Users } from "lucide-react";

interface PhoneLoadingScreenProps {
  isLoading: boolean;
  onFinished: () => void;
}

export function PhoneLoadingScreen({ isLoading, onFinished }: PhoneLoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const progressRef = useRef(0);
  
  // Update ref to avoid stale closure in intervals
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Simulated progress while loading
  useEffect(() => {
    if (!isLoading) return;
    
    const interval = setInterval(() => {
      const current = progressRef.current;
      if (current >= 98) {
        clearInterval(interval);
        return;
      }
      
      // Asymptotically approach 98%
      let increment = 0;
      if (current < 20) {
        increment = Math.random() * 5 + 3; // fast start
      } else if (current < 50) {
        increment = Math.random() * 3 + 2;
      } else if (current < 80) {
        increment = Math.random() * 2 + 1;
      } else if (current < 95) {
        increment = Math.random() * 1 + 0.5;
      } else {
        increment = 0.1;
      }
      
      const next = Math.min(98, parseFloat((current + increment).toFixed(1)));
      setProgress(next);
    }, 200);

    return () => clearInterval(interval);
  }, [isLoading]);

  // When isLoading becomes false, finish the progress bar quickly
  useEffect(() => {
    if (!isLoading) {
      // Fast forward to 100%
      const current = progressRef.current;
      const duration = 400; // ms
      const steps = 10;
      const stepTime = duration / steps;
      const increment = (100 - current) / steps;
      
      let step = 0;
      const interval = setInterval(() => {
        step++;
        if (step >= steps) {
          setProgress(100);
          clearInterval(interval);
          
          // Wait to show "Ready" then fade out
          setTimeout(() => {
            setFadeOut(true);
            // Wait for fadeout animation then finish
            setTimeout(() => {
              onFinished();
            }, 500); // matches fadeout css duration
          }, 800);
        } else {
          setProgress(prev => Math.min(100, parseFloat((prev + increment).toFixed(1))));
        }
      }, stepTime);

      return () => clearInterval(interval);
    }
  }, [isLoading, onFinished]);

  // Determine stage description based on progress
  const getStageInfo = (p: number) => {
    if (p < 15) {
      return { text: "Ligando display XP Factory...", icon: <Cpu className="stage-icon spin" /> };
    } else if (p < 30) {
      return { text: "Laminando painel e calibrando touch...", icon: <Wrench className="stage-icon pulse" /> };
    } else if (p < 45) {
      return { text: "Carregando atendentes e agentes de vendas...", icon: <Users className="stage-icon wave" /> };
    } else if (p < 60) {
      return { text: "Conectando conversas do time de atendimento...", icon: <Smartphone className="stage-icon pulse" /> };
    } else if (p < 75) {
      return { text: "Sincronizando histórico de mensagens...", icon: <Cpu className="stage-icon pulse" /> };
    } else if (p < 90) {
      return { text: "Buscando chats ativos do WhatsApp...", icon: <Sparkles className="stage-icon wave" /> };
    } else if (p < 98) {
      return { text: "Calibrando brilho e cores do display XP...", icon: <Sparkles className="stage-icon pulse" /> };
    } else if (p < 100) {
      return { text: "Teste de qualidade do display finalizado...", icon: <ShieldCheck className="stage-icon pulse" /> };
    } else {
      return { text: "Display XP Pronto! Carregando conversas do time...", icon: <CheckCircle2 className="stage-icon success-pop" /> };
    }
  };

  const stage = getStageInfo(progress);

  return (
    <div className={`phone-loader-overlay ${fadeOut ? "fade-out" : ""}`}>
      <div className="phone-loader-container">
        
        {/* Glow effect backdrops */}
        <div className="loader-backdrop-glow top-left"></div>
        <div className="loader-backdrop-glow bottom-right"></div>
        
        <div className="loader-panel">
          {/* XP Factory Brand Title */}
          <div className="loader-brand">
            <span className="brand-xp">XP</span>
            <span className="brand-factory">FACTORY</span>
          </div>
          
          {/* Smartphone Mockup */}
          <div className="phone-mockup">
            {/* Front speaker notch / punch-hole camera */}
            <div className="phone-camera-hole"></div>
            
            {/* Screen Inner */}
            <div className="phone-screen">
              {/* Futuristic Tech Grid background */}
              <div className="screen-grid"></div>
              
              {/* Scanning Laser Line */}
              {progress < 100 && <div className="laser-scanner"></div>}
              
              {/* Content Inside Screen */}
              <div className="screen-content">
                <div className="screen-logo-watermark">XP</div>
                
                <div className="screen-status-container">
                  <div className="screen-icon-container">
                    {stage.icon}
                  </div>
                  
                  <div className="screen-percentage">{Math.round(progress)}%</div>
                  
                  <div className="screen-progress-track">
                    <div className="screen-progress-bar" style={{ width: `${progress}%` }}></div>
                  </div>
                  
                  <div className="screen-status-label">{stage.text}</div>
                </div>
              </div>
            </div>
            
            {/* Side buttons mockup */}
            <div className="phone-button volume-up"></div>
            <div className="phone-button volume-down"></div>
            <div className="phone-button power"></div>
          </div>
          
          <div className="loader-caption">
            Fabricando o melhor display para sua experiência
          </div>
        </div>
      </div>
    </div>
  );
}
