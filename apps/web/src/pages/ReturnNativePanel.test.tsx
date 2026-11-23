import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {ReturnDetail} from '@olist-crm/shared';
import {describe,it,expect,vi} from 'vitest';
const actor=vi.hoisted(()=>({id:'tech',permissions:['returns.manage','returns.view']}));
vi.mock('../hooks/useAuth',()=>({useAuth:()=>({user:{id:actor.id}})}));
vi.mock('../hooks/usePermissions',()=>({usePermissions:()=>({canAccess:(p:string)=>actor.permissions.includes(p)})}));
import {ReturnNativePanel} from './ReturnNativePanel';
const d={id:'case',version:1,stage:'triage_completed',execution:{resolutions:[],credits:[{status:'approved'}]}} as unknown as ReturnDetail;
function render(scope:'technical'|'finance'){
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const job=(id:string,name:string)=>({id,dispositionId:id,assigneeId:id,assigneeName:name,completedAt:null,dueAt:'2026-12-10T12:00:00Z',notes:'Teste atribuído',version:1});
 client.setQueryData(['return-native',d.id,d.version],{wallet:[],cancellations:[],stock:[],messages:[],movements:[],transfers:[],inspections:[job('tech','Meu reteste'),job('other','Reteste de outra pessoa')],repairs:[]});
 return renderToStaticMarkup(<QueryClientProvider client={client}><ReturnNativePanel detail={d} token="test" onSaved={()=>{}} scope={scope}/></QueryClientProvider>);
}
describe('technical and financial workspaces',()=>{
 it('shows a technician the assigned retest without financial or stock controls',()=>{actor.id='tech';actor.permissions=['returns.view','returns.manage'];const html=render('technical');expect(html).toContain('Meu reteste');expect(html).not.toContain('Reteste de outra pessoa');expect(html).toContain('Concluir reteste e indicar destino');expect(html).not.toContain('Lançar crédito na carteira');expect(html).not.toContain('Entrada após inspeção');});
 it('lets Isis coordinate every technical job without granting finance',()=>{actor.id='isis';actor.permissions=['returns.view','returns.manage','returns.logistics'];const html=render('technical');expect(html).toContain('Meu reteste');expect(html).toContain('Reteste de outra pessoa');expect(html).toContain('Atribuir separação e reteste');expect(html).not.toContain('Lançar crédito na carteira');});
 it('keeps technical assignment outside the financial workspace',()=>{actor.id='finance';actor.permissions=['returns.view','returns.finance'];const html=render('finance');expect(html).toContain('Lançar crédito na carteira do CRM');expect(html).not.toContain('Atribuir separação e reteste');expect(html).not.toContain('Meu reteste');});
});
