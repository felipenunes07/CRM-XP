import { ShieldAlert } from "lucide-react";

export function AccessDeniedPage() {
  return (
    <div className="access-denied-page">
      <div className="access-denied-panel">
        <ShieldAlert size={32} />
        <h1>Acesso negado</h1>
        <p>Seu usuario nao possui permissao para acessar esta area. Fale com um administrador se precisar desse acesso.</p>
      </div>
    </div>
  );
}
