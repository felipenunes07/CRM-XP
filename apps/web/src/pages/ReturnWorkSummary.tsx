import type {ReturnTask,ReturnWork} from '@olist-crm/shared';
import {useAuth} from '../hooks/useAuth';
import {usePermissions} from '../hooks/usePermissions';
export const workTeamName=(team:ReturnTask['team'])=>team==='returns.finance'?'Financeiro':team==='returns.manage'?'Equipe técnica':'Coordenação';
export function taskRelation(task:ReturnTask,userId:string,canAccess:(p:string)=>boolean){
 if(task.state==='external_wait'||task.state==='blocked')return 'waiting';
 if(task.owner)return task.owner.id===userId&&canAccess(task.team)?'mine':'other';
 return canAccess(task.team)?'team':task.state==='unassigned'?'unassigned':'other';
}
export function ReturnWorkCompact({work}: {work?:ReturnWork}){
 const {user}=useAuth(),{canAccess}=usePermissions();if(!work)return <span>Conferindo responsáveis...</span>;
 const mine=work.tasks.filter(t=>taskRelation(t,user?.id??'',canAccess)==='mine'),team=work.tasks.filter(t=>taskRelation(t,user?.id??'',canAccess)==='team');
 const names=[...new Set(work.tasks.map(t=>t.owner?.name??workTeamName(t.team)))];
 return <span className="returns-work-compact"><strong>{mine.length?'Sua vez: '+mine[0]!.title:team.length?'Sua equipe: '+team[0]!.title:work.tasks.length?'Aguardando '+names.join(', '):'Atendimento concluído'}</strong><small>{work.phase}{work.coordinator?' · Coordenação: '+work.coordinator.name:''}</small></span>;
}
export function ReturnWorkSummary({work,onOpen}:{work?:ReturnWork;onOpen:(target:ReturnTask['target'])=>void}){
 const {user}=useAuth(),{canAccess}=usePermissions();
 if(!work)return <p role="status">Conferindo a fase e os responsáveis...</p>;
 const own=work.tasks.filter(t=>taskRelation(t,user?.id??'',canAccess)==='mine'),team=work.tasks.filter(t=>taskRelation(t,user?.id??'',canAccess)==='team');
 const ordered=[...own,...team,...work.tasks.filter(t=>!own.includes(t)&&!team.includes(t))];
 const first=own[0]??team[0];
 return <section className="returns-work" aria-label="Vez de cada pessoa"><div className="returns-work-heading"><div><span className="eyebrow">Fase do atendimento</span><h3>{work.phase}</h3><p>Coordenação: <strong>{work.coordinator?.name??'precisa ser definida'}</strong></p></div>{first&&<button className="button primary" onClick={()=>onOpen(first.target)}>{own.length?'Ir para minha tarefa':'Abrir tarefa da minha equipe'}</button>}</div>
  {ordered.length>0?<><p className="returns-work-instruction">{own.length?'É sua vez: '+own.map(t=>t.title).join(' · '):team.length?'Sua equipe tem trabalho para fazer.':'Você está acompanhando. Veja quem precisa agir abaixo.'}</p><div className="returns-work-scroll"><table><thead><tr><th>Tarefa / próximo movimento</th><th>Com quem está</th><th>Situação</th><th>Prazo</th><th/></tr></thead><tbody>{ordered.map(t=>{const relation=taskRelation(t,user?.id??'',canAccess),status=t.state==='external_wait'?'Aguardando retorno externo':t.state==='blocked'?'Aguardando peças / condição anterior':t.state==='unassigned'?'Precisa de atribuição':relation==='mine'?'É sua vez':relation==='team'?'Sua equipe pode agir':'Aguardando esta pessoa/equipe';return <tr key={t.id} data-relation={relation}><td><strong>{t.title}</strong><small>{t.description}</small></td><td>{t.owner?.name??workTeamName(t.team)}{t.state==='external_wait'&&<small>Acompanha o retorno</small>}</td><td><span className="returns-work-status">{status}</span></td><td>{t.dueAt?new Date(t.dueAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'A combinar'}</td><td><button onClick={()=>onOpen(t.target)}>{t.state==='external_wait'||t.state==='blocked'?'Acompanhar':'Abrir'}</button></td></tr>;})}</tbody></table></div></>:<p>Não há tarefas pendentes. Os registros continuam disponíveis para consulta.</p>}
 </section>;
}
