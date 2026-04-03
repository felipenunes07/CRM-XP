import { FormEvent, useState } from "react";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("change-me");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <section className="login-hero">
        <img className="login-logo" src="/xp-factory-logo.png" alt="XP Factory" />
        <p className="eyebrow">XP CRM</p>
        <h1>Clientes, recorrencia e prioridade comercial em um painel leve e objetivo.</h1>
        <p>
          Acompanhe a base consolidada, identifique risco de churn e mantenha a equipe focada nos contatos que mais
          importam.
        </p>
      </section>

      <form className="login-card" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Acesso interno</p>
          <h2>Entrar no painel</h2>
        </div>

        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </label>

        <label>
          Senha
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
        </label>

        {error ? <div className="inline-error">{error}</div> : null}

        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
