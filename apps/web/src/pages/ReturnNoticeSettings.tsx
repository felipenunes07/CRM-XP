import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '../lib/api';
import {usePermissions} from '../hooks/usePermissions';
export function ReturnNoticeSettings({token}:{token:string}){
 const {canAccess}=usePermissions(),allowed=canAccess('returns.configure'),qc=useQueryClient();
 const [instanceId,setInstanceId]=useState(''),[userId,setUserId]=useState(''),[grant,setGrant]=useState(true);
 const query=useQuery({queryKey:['return-notice-access'],queryFn:()=>api.returnNoticeAccess(token),enabled:allowed});
 const mutation=useMutation({mutationFn:(input:Parameters<typeof api.configureReturnNoticeAccess>[1])=>api.configureReturnNoticeAccess(token,input),retry:false,onSuccess:data=>{qc.setQueryData(['return-notice-access'],data);void qc.invalidateQueries({queryKey:['return-notice-senders']});}});
 if(!allowed)return null;
 const current=query.data?.instances.find(i=>i.id===instanceId)?.grants.some(g=>g.userId===userId)??false;
 return <section className="panel"><h2>WhatsApp para avisos de trocas</h2><p>Escolha o canal aprovado para cada responsável pelos avisos. A pessoa também precisa da permissão de comunicação de trocas.</p>
  {query.data?.instances.map(i=><article className="returns-execution-card" key={i.id}><strong>{i.name}</strong><p>{i.status==='ACTIVE'?'Ativo':'Inativo'} · {i.configured?'Configurado':'Configuração de conexão pendente'} · última conferência: {i.health??'não informada'}</p>{i.isDefault&&<p>Remetente padrão da empresa.</p>}{i.assignedUserName&&<p>Atribuição no WhatsApp: {i.assignedUserName}</p>}<p>Vínculos adicionais para trocas: {i.grants.map(g=>g.name).join(', ')||'nenhum'}</p></article>)}
  <form className="returns-form" aria-label="Vincular remetente de trocas" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);mutation.mutate({requestId:crypto.randomUUID(),instanceId,userId,allowed:grant,previousAllowed:current,reason:String(f.get('reason'))});}}><fieldset disabled={mutation.isPending}>
   <label>WhatsApp aprovado<select aria-label="WhatsApp aprovado" value={instanceId} onChange={e=>setInstanceId(e.target.value)} required><option value="">Selecione o canal</option>{query.data?.instances.map(i=><option key={i.id} value={i.id}>{i.name} · {i.status==='ACTIVE'?'ativo':'inativo'}</option>)}</select></label>
   <label>Responsável pelos avisos<select aria-label="Responsável pelos avisos" value={userId} onChange={e=>setUserId(e.target.value)} required><option value="">Selecione a pessoa</option>{query.data?.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>Ação<select aria-label="Ação do vínculo de WhatsApp" value={String(grant)} onChange={e=>setGrant(e.target.value==='true')}><option value="true">Vincular para avisos de trocas</option><option value="false">Remover vínculo de trocas</option></select></label>
   <label>Motivo / autorização do canal<textarea name="reason" minLength={5} maxLength={4000} required/></label><p>O vínculo libera a escolha do remetente. Cada mensagem ainda precisa ser revisada e enviada no protocolo.</p><button className="button primary">Salvar vínculo de WhatsApp</button>
  </fieldset></form>{mutation.isSuccess&&<p role="status">Vinculação atualizada.</p>}{query.isError&&<p role="alert">{query.error.message}</p>}{mutation.isError&&<p role="alert">{mutation.error.message} <button onClick={()=>void query.refetch()}>Recarregar vínculos</button></p>}
 </section>;
}
