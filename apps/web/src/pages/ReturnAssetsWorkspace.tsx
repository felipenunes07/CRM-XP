import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {api} from '../lib/api';
import {usePermissions} from '../hooks/usePermissions';
import {useAuth} from '../hooks/useAuth';
import './ReturnsPage.css';
const money=(cents:number,currency:string)=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency});
export function ReturnWalletList({token,customerId,onCase}:{token:string;customerId?:string;onCase?:(id:string)=>void}){
 const {canAccess}=usePermissions(),allowed=canAccess('returns.view')&&canAccess('returns.finance');
 const [search,setSearch]=useState(''),[page,setPage]=useState(1);
 const query=useQuery({queryKey:['return-wallet',search,page,customerId],queryFn:()=>api.returnWallet(token,search,page,customerId),enabled:allowed});
 if(!allowed)return null;
 return <section className="panel"><h2>Créditos de trocas no CRM</h2><p>A carteira de trocas tem saldo próprio e não é somada ao saldo importado. Consulte os dois controles antes de acertar uma cobrança ou aplicar um crédito.</p><label>Buscar cliente, fábrica ou referência<input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>{query.data?.items.map(c=><article className="returns-execution-card" key={c.id}><strong>{c.protocol} · {c.customerCode} · {c.customerName}</strong><p>{c.factoryName} · {c.party==='customer'?'Crédito ao cliente':'Crédito da fábrica'} · {money(c.amountCents,c.currency)} · {({approved:'Autorizado, aguardando lançamento',posted:'Lançado',voided:'Cancelado',reversed:'Estornado'} as Record<string,string>)[c.status]}</p><p>{c.balanceCents===null?'Lançamento fora da carteira nativa':`Saldo na carteira: ${money(c.balanceCents,c.currency)}`} · {c.officialSystem} · {c.officialReference}</p>{onCase?<button onClick={()=>onCase(c.caseId)}>Abrir protocolo {c.protocol}</button>:<Link to={`/trocas?protocolo=${c.caseId}`}>Abrir protocolo {c.protocol}</Link>}</article>)}{query.isError&&<p role="alert">{query.error.message}</p>}{query.data&&!query.data.total&&<p>Sem créditos de trocas registrados nesta consulta.</p>}{query.data&&<div className="returns-pagination"><button disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page} · {query.data.total} créditos</span><button disabled={page*50>=query.data.total} onClick={()=>setPage(page+1)}>Próxima</button></div>}</section>;
}
export function ReturnCustomerWallet({customerId}:{customerId:string|null}){const {token}=useAuth();return token&&customerId?<ReturnWalletList token={token} customerId={customerId}/>:null;}
export function ReturnAssetsWorkspace({token,onCase}:{token:string;onCase:(id:string)=>void}){
 const [search,setSearch]=useState(''),query=useQuery({queryKey:['return-stock',search],queryFn:()=>api.returnStock(token,search)});
 return <div className="page-stack"><ReturnWalletList token={token} onCase={onCase}/><section className="panel"><h2>Estoque recuperado disponível</h2><p>Peças de trocas com inspeção e entrada registradas no CRM. A baixa para atendimento é feita pelo protocolo destinatário. A consulta mostra até 100 lotes; refine pelo SKU ou modelo.</p><label>Buscar SKU ou modelo<input value={search} onChange={e=>setSearch(e.target.value)}/></label>{query.data?.map(l=><article className="returns-execution-card" key={l.id}><strong>{l.sku} · {l.model} · {l.manufacturer}</strong><p>{l.availableQuantity} disponíveis · {({new:'Nova',grade_1:'Condição 1',grade_2:'Condição 2'} as Record<string,string>)[l.grade]} · {l.location} · selo {l.seal||'não informado'}</p><p>{l.inspection}</p><button onClick={()=>onCase(l.caseId)}>Abrir protocolo de origem</button></article>)}{query.isError&&<p role="alert">{query.error.message}</p>}{query.data&&!query.data.length&&<p>Nenhuma peça recuperada disponível nesta consulta.</p>}</section></div>;
}
