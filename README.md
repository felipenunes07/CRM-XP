# Tarefas XP

Quadro por funcionário, separado do CRM. Identidade reaproveitada do CRM: logo XP Factory, Poppins, azul #2956d7, painéis claros.

## Acessos
- `/gestao#CHAVE_DA_GESTAO`: criar, editar, transferir tarefas, cadastrar pessoas e fotos.
- `/equipe#CHAVE_DA_EQUIPE`: consultar todos e marcar início/entrega.
As chaves são variáveis secretas ADMIN_TOKEN e TEAM_TOKEN no servidor. O frontend recebe apenas a chave presente no link; o acesso da equipe nunca recebe a chave de gestão. O fragmento é enviado à API por Authorization, não pela URL. Alterar apenas o caminho não concede privilégios.

## Dados
D1 guarda pessoas, prazos, situação e data de entrega. R2 guarda as fotos. O quadro atualiza a cada 8 segundos enquanto a tela está visível. Alterações usam controle de versão para evitar que uma tela sobrescreva outra. Prazos usam America/Sao_Paulo, com fim do dia quando não há horário. Os seis nomes iniciais são adicionados sem sobrescrever nomes editados.

## Validação
- `npx tsc --noEmit`
- `npx oxlint app lib db`
- `node tests/api.mjs` testa apenas o ambiente local com .dev.vars, incluindo autorização, gravação, conflitos, entrega, fotos e equipe. Usa dados TESTE LOCAL.
- `npm run build`
- WebMCP: leitura do quadro e criação de tarefa pela gestão com validação no servidor. Não foi possível verificar em um contexto WebMCP compatível nesta sessão; suporte opcional e isolado do fluxo normal.

O CRM original não foi modificado. O endereço da equipe pode ser cadastrado como atalho nele. Dados de teste locais não são enviados ao banco de produção.
