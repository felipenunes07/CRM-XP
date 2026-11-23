import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '../lib/api';
import {usePermissions} from '../hooks/usePermissions';
export function ReturnCoordinatorSettings({token}:{token:string}){
 const {canAccess}=usePermissions(),qc=useQueryClient();
 const query=useQuery({queryKey:['return-transition-settings'],queryFn:()=>api.returnTransition(token),enabled:canAccess('returns.configure')});
 const people=useQuery({queryKey:['return-lookups'],queryFn:()=>api.returnLookups(token),enabled:canAccess('returns.configure')});
 const mutation=useMutation({mutationFn:(coordinatorId:string)=>{const s=query.data!.settings;return api.configureReturnTransition(token,{version:s.version,sourcePath:s.sourcePath,sourceEnabled:s.sourceEnabled,authority:s.authority,coordinatorId,reason:'Definição do responsável pelo retorno da triagem e acompanhamento da fila'});},onSuccess:()=>{void qc.invalidateQueries({queryKey:['return-transition-settings']});void qc.invalidateQueries({queryKey:['return-transition']});},retry:false});
 if(!canAccess('returns.configure'))return null;
 return <section className="panel"><h3>Coordenação da fila</h3><p>Ao concluir a triagem, o protocolo retorna automaticamente para esta pessoa. Reteste e recondicionamento retornam à coordenação que atribuiu o trabalho.</p>{query.data&&<form key={query.data.settings.version} className="returns-form" onSubmit={e=>{e.preventDefault();mutation.mutate(String(new FormData(e.currentTarget).get('coordinatorId')));}}><label>Responsável pela coordenação<select name="coordinatorId" defaultValue={query.data.settings.coordinatorId??''} required><option value="">Selecione</option>{people.data?.people.filter(p=>p.canLogistics).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={mutation.isPending}>Salvar coordenação</button></form>}{query.isError&&<p role="alert">{query.error.message}</p>}{mutation.isError&&<p role="alert">{mutation.error.message}</p>}</section>;
}
