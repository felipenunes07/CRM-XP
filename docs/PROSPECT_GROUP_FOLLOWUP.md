# Retorno de grupos novos sem conversão

`WHATSAPP_PROSPECT_FOLLOWUP_ENABLED=true` liga o retorno às **09h de Brasília,
todos os dias**, incluindo sábado e domingo. O grupo precisa ter sido criado
dois dias de calendário antes: criado segunda-feira, retorno quarta-feira às 9h.
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

Texto enviado, com marcação real do telefone do cliente:

```text
Bom dia @cliente ☀️🙏🏻🤩

Gostou dos nossos preços?

Qualquer coisa é só avisar a gente que deixamos tudo separado e prontinho pra vc! 📦🤝☺️
```

Há uma trava por grupo e registro persistente em `sync_cursors`, com chave
`prospect_group_followup:<jid>`, para enviar uma única vez. Uma falha ou resultado
incerto no provedor fica registrado e exige conferir a entrega antes de liberar
outra tentativa. Envios confirmados também entram em `message_logs`. A rotina
não repete mensagens em D+3, não reativa campanhas antigas e não muda os relatórios
ou a régua de 30/60/90 dias.

Prévia sem enviar, considerando as informações disponíveis no momento da consulta:

```sh
npx tsx apps/api/src/scripts/checkProspectFollowups.ts 2026-11-11
```

Uma prévia com data futura não prevê compras futuras; as verificações são feitas
novamente no horário do envio.
