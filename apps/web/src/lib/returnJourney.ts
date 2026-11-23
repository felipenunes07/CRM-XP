import type {ReturnDetail} from '@olist-crm/shared';
export type ReturnStep='receber'|'testar'|'resolver'|'entregar'|'concluir';
export type ReturnWorkArea='customer'|'factory'|'technical'|'finance';
export const RETURN_STEPS=[{key:'receber',label:'Receber'},{key:'testar',label:'Testar'},{key:'resolver',label:'Resolver'},{key:'entregar',label:'Entregar'},{key:'concluir',label:'Concluir'}] as const;
export function returnNextStep(d:ReturnDetail):{step:ReturnStep;area?:ReturnWorkArea;title:string;description:string;action:string}{
 if(d.stage==='closed')return {step:'concluir',title:'Atendimento concluído',description:'As confirmações e os comprovantes continuam disponíveis neste atendimento.',action:'Ver conclusão'};
 if(d.stage==='received')return {step:d.assignee&&d.dueAt?'testar':'receber',title:d.assignee&&d.dueAt?'Pronto para o técnico':'Escolha quem vai testar as peças',description:d.assignee&&d.dueAt?'O recebimento foi registrado. O técnico pode iniciar a triagem.':'Informe o técnico, o prazo e onde a caixa está guardada.',action:d.assignee&&d.dueAt?'Ir para os testes':'Definir técnico e prazo'};
 if(d.stage==='triage')return {step:'testar',title:d.pendingQuantity?'Identifique e teste todas as peças':'Confira os testes e conclua a triagem',description:`${d.itemQuantity} de ${d.receivedQuantity} peças cadastradas. Separe em grupos quando o resultado for diferente.`,action:'Continuar testes'};
 const p=d.execution.progress;
 if(p.canClose)return {step:'concluir',title:'Tudo conferido para encerrar',description:'Revise o resumo e confirme o encerramento do atendimento.',action:'Conferir e encerrar'};
 if(p.factoryPendingQuantity>0)return {step:'resolver',area:'factory',title:'Acompanhe a análise da fábrica',description:'Confira o envio, o parecer e o retorno das peças. Cada confirmação registra um fato diferente.',action:'Ver etapa da fábrica'};
 if(d.execution.pools.some(p=>p.remainingQuantity>0))return {step:'resolver',area:'customer',title:'Defina a solução para o cliente',description:'Escolha, por quantidade, se haverá reposição, crédito ou devolução da peça original.',action:'Definir solução'};
 const supplierCreditPending=d.execution.results.some(r=>!r.voidedAt&&r.compensation==='credit'&&!d.execution.credits.some(c=>c.resultId===r.id&&c.party==='supplier'&&c.status==='posted'));
 if(p.financePendingCount>0||supplierCreditPending)return {step:'resolver',area:'finance',title:'Há crédito aguardando o financeiro',description:'O financeiro confere o cálculo e registra o lançamento. Isis acompanha esta pendência.',action:'Ver créditos'};
 const live=<T extends {voidedAt:string|null}>(rows:T[])=>rows.filter(r=>!r.voidedAt);
 const receipts=live(d.execution.receipts),deliveries=live(d.execution.deliveries),destinations=live(d.execution.dispositions);
 const factoryReturnPending=d.execution.factoryLines.some(l=>!l.voidedAt&&l.state==='sent'&&l.quantity>receipts.filter(r=>r.lineId===l.id&&['original_returned','factory_retained'].includes(r.kind)).reduce((n,r)=>n+r.quantity,0));
 if(factoryReturnPending||p.supplierPendingQuantity>0)return {step:'resolver',area:'factory',title:'Confira o retorno da fábrica',description:'Registre as peças que chegaram, as substitutas ou a retenção autorizada das originais.',action:'Conferir retorno'};
 const hasReadyDelivery=live(d.execution.resolutions).some(r=>{
  if(deliveries.filter(e=>e.resolutionId===r.id).reduce((n,e)=>n+e.quantity,0)>=r.quantity)return false;
  if(r.kind==='return_original')return (d.items.find(i=>i.id===r.itemId)?.quantity??0)-d.execution.factoryLines.filter(l=>!l.voidedAt&&l.itemId===r.itemId).reduce((n,l)=>n+l.quantity,0)+receipts.filter(p=>p.itemId===r.itemId&&p.kind==='original_returned').reduce((n,p)=>n+p.quantity,0)-deliveries.filter(e=>e.itemId===r.itemId&&e.asset==='original').reduce((n,e)=>n+e.quantity,0)-destinations.filter(e=>e.itemId===r.itemId&&e.asset==='original').reduce((n,e)=>n+e.quantity,0)>0;
  return r.kind==='replacement'&&receipts.some(p=>p.itemId===r.itemId&&['supplier_replacement','stock_replacement'].includes(p.kind)&&(p.kind==='stock_replacement'||p.resultId===r.resultId)&&p.quantity-deliveries.filter(e=>e.receiptId===p.id).reduce((n,e)=>n+e.quantity,0)-destinations.filter(e=>e.receiptId===p.id).reduce((n,e)=>n+e.quantity,0)>0);
 });
 if(hasReadyDelivery||deliveries.some(d=>!d.deliveredAt))return {step:'entregar',title:'Há uma entrega para acompanhar',description:'Registre a retirada ou confirme o recebimento do que foi enviado ao cliente.',action:'Ver entrega'};
 if(p.internalPendingQuantity>0)return {step:'resolver',area:'technical',title:'Confira o destino das peças',description:'Acompanhe reteste, reparo e a confirmação de onde cada peça ficou.',action:'Ver peças e reparos'};
 if(!p.customerComplete)return {step:'entregar',title:'Conclua o atendimento ao cliente',description:'Registre o contato e a retirada ou o recebimento do que foi enviado.',action:'Ver entrega e contato'};
 return {step:'concluir',title:'Confira o que falta para encerrar',description:'As pendências abaixo indicam a confirmação ou revisão que ainda precisa ser feita.',action:'Ver pendências'};
}
