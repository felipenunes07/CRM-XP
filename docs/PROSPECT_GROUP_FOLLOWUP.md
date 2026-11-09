# Retorno de grupos novos sem conversão

Em **Automações → Remarketing**, administradores e gerentes com a permissão
`automations.manage` podem editar os textos, os prazos e pausar os retornos.
O envio é às **09h de Brasília, todos os dias**, incluindo sábado e domingo.
O primeiro retorno usa, por padrão, dois dias de calendário desde a criação do
grupo: criado segunda-feira, retorno quarta-feira às 9h.
Não é um intervalo de 48 horas exatas. A janela de recuperação é das 9h às 9h14.

O job reaproveita a data real de criação do WhatsApp, sem confundir com importação
no CRM, e envia pela conta Lili Assistente verificada. Não atua em grupos internos,
comunidades, grupos ignorados ou grupos cujo criador não seja identificado como
membro da equipe. Só marca o cliente se houver exatamente um participante externo
com telefone confirmado; exclui vendedoras, equipe interna, instâncias e contatos
internos cadastrados. Identidade ambígua não gera envio.

Antes de cada envio, consulta o nome e os participantes diretamente no WhatsApp.
Um código CL/KH/LJ no nome ou nos vínculos do grupo bloqueia o retorno. Também
verifica cadastro e compras usando os vínculos do grupo/deal, telefone com aliases
de celular brasileiro e nome normalizado. Assim, a ausência de CL sozinha não
significa ausência de compra. Compra ou vínculo com cliente existente bloqueiam.
Exige sincronização de vendas dos últimos 15 minutos e tenta atualizar a fonte
principal se necessário; se não conseguir, não envia.

O marcador obrigatório `{cliente}` vira a marcação real do telefone do cliente.
Texto inicial:

```text
Bom dia @cliente ☀️🙏🏻🤩

Gostou dos nossos preços?

Qualquer coisa é só avisar a gente que deixamos tudo separado e prontinho pra vc! 📦🤝☺️
```

Há uma trava por grupo e registro persistente em `sync_cursors`, com chave
`prospect_group_followup:<jid>`, para enviar uma única vez. Uma falha ou resultado
incerto no provedor fica registrado e exige conferir a entrega antes de liberar
outra tentativa. Envios confirmados também entram em `message_logs`.

A segunda mensagem é opcional e começa desativada, sem texto. Seu prazo de 1 a
365 dias conta desde a data do **envio confirmado da primeira mensagem**, no
horário de Brasília. A segunda usa a chave `prospect_group_followup_second:<jid>`
e repete todas as verificações de compra, identidade e grupo. Primeiras mensagens
falhas, puladas ou ainda em andamento não geram a segunda etapa.

Configurações ficam no banco em `sync_cursors`, chave
`prospect_group_followup_settings`. GET `/api/automations/prospect-followup` apenas
consulta; PUT na mesma rota valida e salva, sem disparar mensagens. Sem configuração
salva, `WHATSAPP_PROSPECT_FOLLOWUP_ENABLED` fornece o estado inicial e o texto/prazo
anteriores são preservados. Depois de salvar, a tela controla o estado ativo ou
pausado, sem exigir outra variável de ambiente. O agendador verifica alterações
antes de cada envio. Cada prazo aceita inteiros de 1 a 365 dias; textos têm limite
de 4000 caracteres.

Editar, desativar, remover ou readicionar uma etapa preserva o histórico e não
repete etapas já registradas. Datas anteriores não são recuperadas ao ativar ou
alterar um prazo. A rotina não muda os relatórios nem a régua de 30/60/90 dias.

Prévia sem enviar, considerando as informações disponíveis no momento da consulta:

```sh
npx tsx apps/api/src/scripts/checkProspectFollowups.ts 2026-11-11
```

Uma prévia com data futura não prevê compras futuras; as verificações são feitas
novamente no horário do envio.
