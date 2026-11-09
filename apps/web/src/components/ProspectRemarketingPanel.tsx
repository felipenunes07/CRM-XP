import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProspectRemarketingInput } from "@olist-crm/shared";
import { CalendarClock, MessageCircle, Plus, Save } from "lucide-react";
import { api } from "../lib/api";
import "./LiliReactivationPanel.css";
import "./ProspectRemarketingPanel.css";

export function ProspectRemarketingPanel({ token, canManage }: { token: string | null; canManage: boolean }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<ProspectRemarketingInput | null>(null);
  const [saved, setSaved] = useState(false);
  const query = useQuery({ queryKey: ["prospect-remarketing"], queryFn: () => api.prospectRemarketing(token!), enabled: Boolean(token), retry: false });
  const mutation = useMutation({
    mutationFn: (input: ProspectRemarketingInput) => api.saveProspectRemarketing(token!, input),
    onSuccess: value => { client.setQueryData(["prospect-remarketing"], value); setDraft(null); setSaved(true); },
  });
  const settings = draft ?? query.data;
  function change(value: ProspectRemarketingInput) { setDraft(value); setSaved(false); mutation.reset(); }
  const validDays = (days: number) => Number.isInteger(days) && days >= 1 && days <= 365;
  const validMessage = (message: string) => Boolean(message.trim()) && message.includes("{cliente}");
  const valid = settings && validDays(settings.first.daysAfterCreation) && validMessage(settings.first.message)
    && (!settings.second || (validDays(settings.second.daysAfterFirst) && (!settings.second.enabled || validMessage(settings.second.message))));

  return <section className="panel lili-queue prospect-remarketing" aria-labelledby="prospect-remarketing-title">
    <div className="lili-queue-heading"><div>
      <span className="lili-queue-eyebrow"><MessageCircle size={14} /> Lili Assistente</span>
      <h2 id="prospect-remarketing-title">Remarketing de grupos novos</h2>
      <p>Retornos automáticos no grupo para quem ainda não virou cliente ou comprou.</p>
    </div></div>
    <div className="lili-queue-summary"><span><CalendarClock size={16} /> Todos os dias às <strong>9h</strong> · Horário de Brasília</span><span>O cliente é marcado na mensagem</span></div>
    {query.isPending ? <p role="status">Carregando remarketing…</p> : null}
    {query.isError ? <div role="alert"><p className="lili-queue-error">Não foi possível carregar as configurações.</p><button type="button" className="secondary-button" onClick={() => query.refetch()}>Tentar novamente</button></div> : null}
    {settings ? <form onSubmit={event => { event.preventDefault(); if (canManage && valid) mutation.mutate(settings); }}>
      <fieldset disabled={!canManage || mutation.isPending}>
        <label className="prospect-toggle"><input type="checkbox" checked={settings.enabled} onChange={event => change({ ...settings, enabled: event.target.checked })} />
          <strong>{settings.enabled ? "Remarketing ativo" : "Remarketing pausado"}</strong></label>
        <div className="prospect-stage-grid">
          <article className="lili-rule-editor"><h3>1ª mensagem</h3>
            <label>Enviar quantos dias após criar o grupo?<input type="number" min={1} max={365} required value={settings.first.daysAfterCreation || ""} onChange={event => change({ ...settings, first: { ...settings.first, daysAfterCreation: Number(event.target.value) } })} /></label>
            <label>Texto da primeira mensagem<textarea rows={7} maxLength={4000} required value={settings.first.message} onChange={event => change({ ...settings, first: { ...settings.first, message: event.target.value } })} /></label>
            <p className="lili-queue-note">Use <code>{"{cliente}"}</code> para marcar o cliente do grupo.</p>
            <div className="prospect-preview"><small>Prévia no WhatsApp</small><p>{settings.first.message.replaceAll("{cliente}", "@Cliente")}</p></div>
          </article>
          {settings.second ? <article className="lili-rule-editor"><h3>2ª mensagem</h3>
            <label className="prospect-toggle"><input type="checkbox" checked={settings.second.enabled} onChange={event => change({ ...settings, second: { ...settings.second!, enabled: event.target.checked } })} /> Ativar segunda mensagem</label>
            <label>Enviar quantos dias após a primeira mensagem?<input type="number" min={1} max={365} required value={settings.second.daysAfterFirst || ""} onChange={event => change({ ...settings, second: { ...settings.second!, daysAfterFirst: Number(event.target.value) } })} /></label>
            <label>Texto da segunda mensagem<textarea rows={7} maxLength={4000} required={settings.second.enabled} value={settings.second.message} onChange={event => change({ ...settings, second: { ...settings.second!, message: event.target.value } })} /></label>
            <p className="lili-queue-note">Inclua <code>{"{cliente}"}</code>. O prazo começa no envio confirmado da primeira.</p>
            <div className="prospect-preview"><small>Prévia no WhatsApp</small><p>{settings.second.message.replaceAll("{cliente}", "@Cliente") || "Escreva a segunda mensagem acima."}</p></div>
            <button type="button" className="secondary-button" onClick={() => change({ ...settings, second: null })}>Remover segunda mensagem</button>
          </article> : <div className="prospect-add"><MessageCircle size={28} /><h3>Mais um retorno, se precisar</h3><p>Adicione um segundo contato para quem ainda não comprou.</p>
            <button type="button" className="secondary-button" onClick={() => change({ ...settings, second: { enabled: false, daysAfterFirst: 3, message: "" } })}><Plus size={16} /> Adicionar segunda mensagem</button>
          </div>}
        </div>
        {draft && !valid ? <p className="lili-queue-error" role="alert">Informe prazos de 1 a 365 dias e inclua {"{cliente}"} no texto de cada mensagem ativa.</p> : null}
        {canManage ? <div className="prospect-actions"><button type="submit" className="primary-button" disabled={!draft || !valid}><Save size={16} /> {mutation.isPending ? "Salvando…" : "Salvar alterações"}</button><button type="button" className="secondary-button" disabled={!draft} onClick={() => { setDraft(null); mutation.reset(); }}>Cancelar</button></div> : null}
      </fieldset>
      {mutation.isError ? <p role="alert" className="lili-queue-error">{mutation.error.message}</p> : null}
      {saved ? <p role="status" className="prospect-saved">Configurações salvas. Os próximos envios usarão estas regras.</p> : null}
      {!canManage ? <p className="lili-queue-note">Seu acesso permite consultar estas regras. Um administrador pode alterá-las.</p> : null}
    </form> : null}
    <p className="lili-queue-note">Cada mensagem é enviada uma única vez por grupo. Editar ou remover uma etapa preserva o histórico. Antes de cada envio, a Lili verifica se houve compra ou vínculo com um cliente. Alterações valem para as próximas datas; envios de dias anteriores não são recuperados.</p>
  </section>;
}
