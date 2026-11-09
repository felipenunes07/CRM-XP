# Histórico de envios das automações

Em **Automações → Envios e clientes**, cada linha representa um destinatário e seu resultado registrado. A execução ENQUEUED significa apenas que a lista foi preparada; não é usada para inferir envio.

A tela permite escolher a data de Brasília, pesquisar cliente/código/grupo, filtrar a origem ou o resultado, paginar e abrir a mensagem. As réguas da Lili e as duas etapas de remarketing de grupos novos aparecem juntas. Disparos manuais ficam fora desta consulta.

## Fontes e datas

- Campanhas automáticas: destinatários de whatsapp_campaign_recipients, com envio/falha/descarte pela data do respectivo resultado; destinatários aguardando usam a data programada. Campanhas pausadas são identificadas como pausadas, e destinatários pendentes de campanhas canceladas aparecem como não enviados.
- Aprovações pendentes: grupos do público preparado em message_automation_runs.audience_snapshot, com nomes e códigos de cliente. A revisão mostra a lista antes de oferecer aprovação e rejeição. As ações exigem automations.manage e papel ADMIN/MANAGER; o backend revalida a elegibilidade.
- Remarketing: registros persistidos em sync_cursors, sem repetir message_logs como novas linhas. Cada etapa tem sua própria chave.

O texto enviado vem do registro histórico de message_logs, já personalizado. Os novos registros de remarketing também guardam o texto no cursor, inclusive quando o provedor falha. Se o texto antigo não foi registrado, a interface informa isso; não usa a configuração atual como se fosse a mensagem histórica.

Os limites de data usam date::timestamp AT TIME ZONE America/Sao_Paulo explicitamente, incluindo até 23h59m59s do dia local. Os totais refletem data, busca, tipo e execução selecionados; filtrar por resultado não altera os demais cartões. A paginação mantém o total em páginas vazias.

GET /api/automations/activity exige automations.view e valida data, filtros, busca, UUID da execução e paginação. Consultar ou abrir mensagens não dispara envios.

## Outras automações

A antiga aba Avançado virou **Outras automações**, para cobranças, públicos salvos e regras personalizadas. As réguas da Lili permanecem na própria aba; são apenas ocultadas da lista personalizada, sem excluir os cadastros. **Preparar para aprovação** substitui Rodar e abre a revisão dos destinatários antes de qualquer aprovação.
