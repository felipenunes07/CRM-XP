import { FormEvent, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Meteors } from "../components/Meteors";

export function LoginPage() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("change-me");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      await login(email, password);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao entrar");
    }
  }

  return (
    <div className="login-shell">
      <section className="login-hero relative z-10 overflow-hidden">
        <Meteors number={30} />
        <img className="login-logo" src="/xp-factory-logo.png" alt="XP Factory" />

        <div className="login-hero-copy">
          <p className="eyebrow">XP CRM</p>
          <h1>Entrar no CRM</h1>
          <p>Acesso interno da equipe.</p>
        </div>
      </section>

      <form className="login-card relative z-10" onSubmit={handleSubmit}>
        <div className="login-card-header">
          <p className="eyebrow">Acesso interno</p>
          <h2>Entrar no painel</h2>
        </div>

        <div className="login-form-grid">
          <label>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="username"
              placeholder="seu.email@empresa.com"
            />
          </label>

          <label>
            Senha
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="Digite sua senha"
            />
          </label>
        </div>

        {error ? <div className="inline-error">{error}</div> : null}

        <button className="primary-button login-submit-button" type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
