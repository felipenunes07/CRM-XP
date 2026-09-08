# Redesenho da tela de Tarefas

Telas de alta fidelidade da tela de Tarefas, desenhadas em cima dos tokens do
proprio app (`app/globals.css`) e depois repaginadas na direcao "Claro + azul XP".

## Arquivos

| Arquivo             | O que e                                            |
| ------------------- | -------------------------------------------------- |
| `Main.dc.html`      | Lista agrupada por pessoa (a tela principal)        |
| `Historico.dc.html` | Aba Historico de entregas                           |
| `Mobile.dc.html`    | Mesma tela em 390x844                               |
| `canvas.json`       | Posicao das telas no canvas e as notas              |
| `*.jpg`             | Avatares (ver origem abaixo)                        |

`tarefas-xp-redesign.html` NAO esta versionado: e o canvas montado a partir
dos arquivos acima, tem 2,6 MB e e regerado a cada publicacao.

## Avatares

- `thais.jpg`, `suelen.jpg`, `amanda.jpg`, `tamires.jpg` — baixados do cache que
  o CRM ja mantem, em `/api/dashboard/executive/avatar/<id da instancia>`.
  O CRM baixa a foto do WhatsApp e guarda os bytes porque a URL da Meta expira
  em horas (ver `whatsappAvatarCache.ts` no crm-tarefas-menu).
- `lucas.jpg` — reduzido de `apps/web/public/seller-avatars/lucas.svg`.
- Camila, Iza e Pedro ainda estao com as iniciais; faltam os arquivos.

## O que o desenho propoe que o app ainda nao faz

- Um link so, sem os modos gestao/equipe.
- Excluir tarefa: hoje a API aceita apenas `create`, `edit`, `status`, `move`
  e `person` — `delete` responde "Acao invalida".
- Aba Historico, usando `completed_at` e o prazo, que ja existem no banco.

## Bug encontrado no app atual

O botao "Desfazer entrega" e renderizado para qualquer acesso em `app/board.tsx`,
mas `app/api/board/route.ts` so permite que a equipe avance o status
(a fazer -> fazendo -> entregue). Quem entra pelo link da equipe recebe 403.
