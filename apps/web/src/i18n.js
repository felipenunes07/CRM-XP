import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { setFormattingLocale } from "./lib/format";
const extraExactTranslations = {
    "Ideias / Votacao": "想法 / 投票",
    "Resumo do estoque": "库存总览",
    "Leitura para compras": "采购判断",
    "Acompanhamento de reposicao": "补货跟进",
    "Analise por modelo": "按型号分析",
    "Visao rapida para a chefe bater o olho e entender o que fazer primeiro.": "给管理层快速查看并优先判断下一步动作。",
    "Veja o que precisa comprar agora, o que so precisa acompanhar e o que nao vale repor.": "查看哪些需要立刻采购、哪些只需跟进、哪些不值得补货。",
    "Acompanhe o que chegou, se voltou a vender e o que ainda precisa de nova reposicao.": "跟进已到货的型号、是否恢复销售，以及哪些仍需再次补货。",
    "Encontre o que esta ocupando espaco ha muito tempo e precisa de acao comercial.": "找出长期占用库存空间、需要商业处理的商品。",
    "Abra cada modelo com calma e acompanhe estoque, vendas, reposicoes e clientes.": "逐个打开型号，查看库存、销量、补货与客户情况。",
    "Abrir lista": "打开列表",
    "Grafico 1": "图表 1",
    "Grafico 2": "图表 2",
    "Grafico 3": "图表 3",
    "Pecas em estoque": "库存件数",
    "Mostra so a quantidade total da planilha em cada leitura do dia.": "仅显示每天每次读取时表格中的总库存数量。",
    "DOCs de Carga": "充电尾插",
    "Ainda nao da para ver a curva do estoque": "暂时还看不到库存走势",
    "Assim que a planilha diaria for sendo lida em mais dias, a curva do estoque aparece aqui.": "随着每日表格累计更多天的数据，这里就会显示库存曲线。",
    "SKUs ativos": "活跃 SKU",
    "Mostra quantos SKUs de Telas e de DOCs estavam com saldo maior que zero.": "显示屏幕类和尾插类中库存大于零的 SKU 数量。",
    "Ainda nao da para ver a curva do mix": "暂时还看不到品类结构走势",
    "Esse grafico depende de mais de uma leitura diaria da planilha para mostrar se a variedade aumentou ou caiu.": "这个图表需要多天的日报表读取后，才能看出品类是增加还是减少。",
    "Vendas por dia": "每日销量",
    "Mostra so as vendas do CRM. A reposicao aparece separada em verde quando existir.": "只显示 CRM 销量；如有补货，会用绿色单独标出。",
    "Pecas vendidas": "已售件数",
    "Ainda nao apareceram vendas nesse periodo": "当前周期内还没有出现销量",
    "Assim que o CRM tiver vendas registradas no recorte atual, elas vao aparecer aqui separadas do estoque.": "一旦当前周期内 CRM 有销量记录，这里就会与库存分开展示。",
    "Estoque parado": "滞销库存",
    "Carregando analise do modelo...": "正在加载型号分析...",
    "Escolha um modelo da lista para abrir a analise completa.": "请从列表中选择一个型号以查看完整分析。",
    "Detalhe do modelo": "型号详情",
    "Estoque baixo": "低库存",
    "Estoque alto": "高库存",
    "Mix curto": "SKU 较少",
    "Mix amplo": "SKU 较多",
    "Clientes que mais compram": "购买最多的客户",
    "Ver cliente": "查看客户",
    "Sem clientes com historico deste modelo.": "这个型号还没有客户购买历史。",
    "Depositos e saldo": "仓库与余额",
    "Sem empresa": "无公司",
    "Sem leitura de deposito no cache agora.": "当前缓存中没有仓库读取数据。",
    "SKUs do modelo": "型号 SKU",
    "Sem cor": "无颜色",
    "Venda 90d": "90天销量",
    "Atualizando...": "更新中...",
    "Atualizar planilha": "更新表格",
    "Abas de estoque": "库存标签页",
    "Sem leitura da planilha ainda": "还没有表格读取记录",
    "Leitura visual": "图形视图",
    "Cada grafico mostra uma coisa": "每个图表展示一个重点",
    "Separei estoque, variedade e vendas para a leitura ficar mais clara.": "我把库存、SKU 结构和销量拆开显示，方便更快判断。",
    "Telas em estoque": "屏幕库存",
    "DOCs em estoque": "尾插库存",
    "Pecas totais agora": "当前总件数",
    "Leitura do dia": "今日摘要",
    "SKUs ativos totais": "活跃 SKU 总数",
    "SKUs Telas": "屏幕 SKU",
    "SKUs DOCs": "尾插 SKU",
    "Venda 30 dias": "30天销量",
    "Capital parado": "滞压资金",
    "Proximo passo": "下一步",
    "Ver compras": "查看采购",
    "Ver reposicao": "查看补货",
    "Ver estoque parado": "查看滞销库存",
    "Vai acabar": "即将售罄",
    "Segurar venda": "暂停销售",
    "Tabela de compras": "采购表",
    Modelo: "型号",
    Tipo: "类型",
    "Em estoque": "库存中",
    Cobertura: "覆盖天数",
    "Ultima venda": "最近销量",
    "Ultima reposicao": "最近补货",
    Recomendacao: "建议",
    Abrir: "打开",
    Estimado: "估算",
    "Abrir analise": "打开分析",
    "Nenhum modelo entrou nesse filtro agora.": "当前筛选下没有匹配的型号。",
    "Chegou e voltou a vender": "到货后恢复销售",
    "Chegou e ainda nao girou": "到货后仍未动销",
    "Ainda precisa repor": "仍需补货",
    "Tabela de reposicao": "补货跟进表",
    "Ultima entrada": "最近入库",
    Entrou: "入库量",
    "Antes / Depois": "前 / 后",
    "Venda 7d antes": "补货前7天销量",
    "Venda 7d depois": "补货后7天销量",
    "Nenhum modelo entrou nesse periodo agora.": "当前周期内没有匹配的型号。",
    "30 a 60 dias sem vender": "30到60天未售出",
    "60 a 90 dias sem vender": "60到90天未售出",
    "90 a 120 dias sem vender": "90到120天未售出",
    "120+ dias sem vender": "120天以上未售出",
    Selecionado: "已选中",
    "Clique para filtrar": "点击筛选",
    "Tabela de produtos sem giro": "滞销商品表",
    SKU: "SKU",
    "Dias sem vender": "未售天数",
    "Preco unitario": "单价",
    "Valor parado": "滞压金额",
    "Acao sugerida": "建议动作",
    "Sem venda": "无销量",
    "Nenhum modelo entrou nessa faixa agora.": "当前区间内没有匹配的型号。",
    "Buscar modelo, marca, familia ou SKU": "搜索型号、品牌、系列或 SKU",
    Marca: "品牌",
    Familia: "系列",
    Qualidade: "质量",
    Catalogo: "目录",
    "Modelos para analisar": "待分析型号",
    "Nenhum modelo bateu com essa busca.": "没有型号匹配当前搜索。",
    "Comprar agora": "立即采购",
    Acompanhar: "跟进观察",
    "Nao comprar": "暂不采购",
    "Chegou hoje": "今天到货",
    "Deu resultado": "已有结果",
    "Repor de novo": "再次补货",
    "Ainda nao reagiu": "尚未起量",
    "Dar foco comercial": "加强销售推进",
    "Fazer promocao": "做促销",
    "Liquidar ou rever compra": "清货或复盘采购",
    "Performance comercial": "销售表现",
    "Compare faturamento, vendas, pecas e clientes por vendedora, enxergando o corte atual, o historico mensal fechado e a carteira de cada nome.": "按销售人员比较营收、销量、件数和客户数，同时查看当前周期、已结月度趋势和各自客户池。",
    "Janela atual": "当前周期",
    "Selecionar janela mensal": "选择月度窗口",
    "Time monitorado": "已监控团队",
    "Clientes do mes": "本月客户",
    "Recorrencia do time": "团队复购强度",
    "Clientes para reativar": "待唤醒客户",
    "Evolucao mensal": "月度走势",
    "Comparativo entre vendedoras": "销售人员对比",
    "Selecionar metrica do grafico": "选择图表指标",
    "Selecionar atendentes para comparar": "选择要对比的销售",
    "Selecione pelo menos uma atendente para montar o comparativo.": "请至少选择一位销售来生成对比。",
    "Legenda do grafico de comparacao": "对比图图例",
    "Carteira hoje": "当前客户池",
    "Distribuicao por status": "按状态分布",
    "Troquei o ranking de faturamento por uma leitura mais util: quantos clientes cada atendente tem em ativo, atencao e inativo hoje.": "我把营收排行改成了更实用的视图：看每位销售当前有多少活跃、关注和沉默客户。",
    "Nenhuma atendente encontrada para esse filtro.": "当前筛选下没有找到销售。",
    Leaderboard: "排行榜",
    "Quem esta puxando relacionamento e carteira": "谁在拉动关系维护与客户池",
    "Busque uma vendedora, ordene a lista e use os botoes para comparar ou abrir o painel detalhado.": "搜索销售、调整排序，并用按钮进行对比或打开详细面板。",
    Buscar: "搜索",
    "Nome da atendente": "销售姓名",
    "Ordenar por": "排序方式",
    "Clientes atendidos": "服务客户数",
    Recorrencia: "复购强度",
    "Carteira ativa": "活跃客户池",
    "Pressao de reativacao": "唤醒压力",
    "Carteira total": "客户池总量",
    Nome: "姓名",
    "No painel": "已在面板",
    "Ver painel": "查看面板",
    "Remover do grafico": "移出图表",
    "Limite de 5": "上限 5 人",
    Comparar: "比较",
    "Nenhuma atendente encontrada para esse recorte.": "当前区间内没有找到销售。",
    "Resumo do corte atual, carteira sob responsabilidade e os destaques do mes.": "显示当前周期摘要、负责客户池与本月亮点。",
    "Carteira atual": "当前客户池",
    "Top clientes": "头部客户",
    "Quem mais comprou no corte": "当前周期购买最多的客户",
    "Abrir cliente": "打开客户",
    "Sem clientes no corte atual para esta atendente.": "这位销售在当前周期没有客户记录。",
    "Top produtos": "头部商品",
    "Mix vendido no corte": "当前周期销售组合",
    "SKU nao informado": "SKU 未提供",
    "Sem produtos registrados no corte atual para esta atendente.": "这位销售在当前周期没有商品记录。",
    "Selecione uma atendente no leaderboard para abrir o drill-down.": "请在排行榜中选择一位销售以查看下钻详情。",
    "Crescimento de clientes": "客户增长",
    Faturamento: "营收",
    Vendas: "销量",
    Pecas: "件数",
    "Vendas no mes": "本月销量",
    "Pecas no mes": "本月件数",
    "Clientes no mes": "本月客户数",
    "Faturamento no mes": "本月营收",
    "Mural em canvas para acompanhar o consenso do time": "用画布墙跟踪团队共识",
    "O mural mostra so a leitura agregada. O voto acontece no pop-up e fecha depois de salvar.": "墙面只展示聚合结果；投票在弹窗中完成，保存后自动关闭。",
    "Nova ideia": "新想法",
    "Volume de ideias ao longo do tempo": "想法数量趋势",
    "Total acumulado por dia": "按天累计总数",
    "Leituras do mural": "墙面视角",
    Canvas: "画布",
    "Arraste os cards e clique para votar": "拖动卡片并点击投票",
    "arrastar e reposicionar": "拖动并重新定位",
    "Carregando mural...": "正在加载看板...",
    "Nenhuma ideia no mural ainda. Publique a primeira para abrir a rodada.": "看板里还没有想法，先发布第一条来开启本轮讨论。",
    "Adicionar ao mural": "添加到看板",
    Titulo: "标题",
    "Ex: Melhorar aprovacao de campanhas": "例如：优化活动审批流程",
    Descricao: "描述",
    "Explique a dor e o que essa ideia muda.": "说明痛点，以及这个想法会带来什么变化。",
    "Publicar de forma anonima": "匿名发布",
    "Nome para exibir": "显示名称",
    "Ex: Time Comercial": "例如：销售团队",
    "A autoria publica fica como Anonimo no mural.": "发布后在看板上会以“匿名”显示作者。",
    Cancelar: "取消",
    "Publicando...": "发布中...",
    "Salvar ideia": "保存想法",
    "Votacao anonima": "匿名投票",
    "Abrindo ideia...": "正在打开想法...",
    "Carregando ideia...": "正在加载想法...",
    "Registrar voto": "登记投票",
    "Nada no mural mostra qual opcao voce escolheu.": "看板上不会显示你具体选择了哪个选项。",
    "Comentario anonimo": "匿名评论",
    "Se quiser, complemente seu voto com contexto.": "如果愿意，可以补充你的投票背景。",
    "Comentarios anonimos": "匿名评论",
    "Leitura do time em formato aberto.": "以开放形式查看团队反馈。",
    "Ainda nao tem comentarios nessa ideia.": "这条想法还没有评论。",
    "Avisando...": "通知中...",
    "Avisar time no WhatsApp": "在 WhatsApp 通知团队",
    "Excluindo...": "删除中...",
    Excluir: "删除",
    "Salvando...": "保存中...",
    "Salvar voto anonimo": "保存匿名投票",
    "Sim, gostei": "是的，赞成",
    "A ideia faz sentido e pode avancar.": "这个想法有道理，可以推进。",
    "Talvez, pensar mais": "也许，再想想",
    "Tem potencial, mas precisa de lapidacao.": "有潜力，但还需要打磨。",
    "Melhor nao": "暂时不要",
    "Nao parece ser a melhor direcao agora.": "现在看起来这不是最好的方向。",
    Todas: "全部",
    "Novas na mesa": "新进想法",
    "Entraram agora e ainda precisam de leitura do time.": "刚进入看板，还需要团队进一步查看。",
    "Gostei / seguir": "赞成 / 继续",
    "O consenso puxa para apoio e continuidade.": "当前共识偏向支持并继续推进。",
    "Refinar melhor": "继续打磨",
    "Pede debate, teste ou algum amadurecimento.": "需要更多讨论、测试或进一步成熟。",
    "Nao priorizar": "暂不优先",
    "A leitura atual do board puxa para frear.": "当前看板信号倾向于放缓推进。",
    "Votacao aberta": "投票进行中",
    "Votacao encerrada": "投票已结束",
    "Ideia publicada no mural. Abra o card e use o botao verde para avisar o time no WhatsApp.": "想法已发布到看板。打开卡片后可用绿色按钮通过 WhatsApp 通知团队。",
    "Voto salvo anonimamente.": "投票已匿名保存。",
    "Ideia removida do mural.": "想法已从看板移除。",
    "Aviso enviado para o grupo MIDIAS no WhatsApp.": "已向 WhatsApp 的 MIDIAS 群发送通知。",
    "Nao foi possivel publicar a ideia.": "无法发布这条想法。",
    "Selecione uma ideia antes de votar.": "请先选择一条想法再投票。",
    "Nao foi possivel salvar o voto.": "无法保存投票。",
    "Abra uma ideia antes de excluir.": "请先打开一条想法再删除。",
    "Abra uma ideia antes de avisar o time.": "请先打开一条想法再通知团队。",
    "Informe o titulo da ideia.": "请填写想法标题。",
    "Explique a ideia para o time.": "请向团队说明这条想法。",
    "Informe o nome que deve aparecer na ideia.": "请填写这条想法要显示的名字。",
    "Escolha uma opcao de voto antes de salvar.": "保存前请先选择一个投票选项。",
    "Comprar urgente": "紧急采购",
    "Modelos que vendem e estao sem folga de estoque.": "这些型号还在卖，但库存已经没有缓冲。",
    "Ainda tem saldo, mas a cobertura ja esta curta.": "还有库存，但覆盖天数已经偏短。",
    "Chegou reposicao": "补货已到",
    "Entrou produto e ja vale acompanhar o efeito da reposicao.": "商品已入库，现在值得跟进补货带来的效果。",
    "Parado 90+ dias": "滞销 90+ 天",
    "SKUs ocupando espaco e pedindo promocao ou giro.": "这些 SKU 长期占库存空间，需要促销或加速周转。",
    "Venda precisa ser controlada para nao faltar.": "销售需要适当控制，避免缺货。",
    "Empurrar estoque parado": "推动滞销库存",
    "Aguardando mais historico para comparar estoque, mix e vendas.": "需要更多历史数据后，才能比较库存、SKU 结构与销量。",
    "O historico do estoque ainda esta comecando.": "库存历史数据还在积累中。",
    "As vendas por dia ja podem ser acompanhadas separadamente, mesmo antes de acumular varios dias de estoque.": "即使库存数据天数还不够，每日销量也已经可以单独跟踪。",
    "Quando o estoque total subiu, a venda tambem subiu.": "总库存上升时，销量也随之上升。",
    "A venda nao mostrou ganho claro mesmo quando o estoque total aumentou.": "即使总库存增加，销量也没有出现明显提升。",
    Anonimo: "匿名",
};
const STORAGE_KEY = "xp-crm-ui-language";
const exactTranslations = {
    ...extraExactTranslations,
    Dashboard: "仪表盘",
    Metas: "目标",
    Atendentes: "销售团队",
    Clientes: "客户",
    Estoque: "库存",
    Embaixadores: "品牌大使",
    Segmentos: "分群",
    Agenda: "日程",
    "Clientes novos": "新客户",
    Reativacao: "唤醒",
    "Ideias/Votacao": "想法/投票",
    Mensagens: "消息模板",
    Disparador: "批量发送",
    Prospeccao: "获客开发",
    Rotulos: "标签",
    Jan: "1月",
    Fev: "2月",
    Mar: "3月",
    Abr: "4月",
    Mai: "5月",
    Jun: "6月",
    Jul: "7月",
    Ago: "8月",
    Set: "9月",
    Out: "10月",
    Nov: "11月",
    Dez: "12月",
    "Carregando tela...": "正在加载页面...",
    "Sessao interna": "内部会话",
    "Usuario interno": "内部用户",
    "Sem perfil": "未设置角色",
    "Operacao comercial": "销售运营",
    "Saude da carteira de clientes XP": "XP 客户池健康度",
    "Abrir agenda do dia": "打开今日日程",
    "Sincronizando...": "同步中...",
    "Sincronizar Agora": "立即同步",
    "Ultima sincronizacao": "最近同步",
    "Pendente...": "待处理...",
    "Meta do mes": "本月目标",
    Definir: "设置",
    "Tempo medio de compra": "平均购买周期",
    dias: "天",
    "Total de clientes": "客户总数",
    "Base comercial consolidada": "已汇总的销售客户池",
    "Clientes ativos": "活跃客户",
    "Clientes dentro da zona ativa": "处于活跃区间的客户",
    "Clientes em atencao": "关注客户",
    "Clientes pedindo monitoramento": "需要持续跟进的客户",
    "Clientes inativos": "沉默客户",
    "Clientes fora da zona ativa": "已离开活跃区间的客户",
    "LTV (Valor Vitalicio)": "LTV（生命周期价值）",
    "LTV (Valor Vitalício)": "LTV（生命周期价值）",
    "Meta mensal": "月度目标",
    "Sem meta": "未设置目标",
    meta: "目标",
    "Faixas de inatividade": "沉默区间",
    "Onde esta o risco de parada": "停购风险分布",
    "Composicao da carteira": "客户池构成",
    "Composicao diaria da base": "客户池每日构成",
    "Desempenho de vendas": "销售表现",
    "Quantidade de itens (telas) vendidas": "已售项目数量（屏）",
    "Risco de parada": "停购风险",
    "Evolucao da base": "客户池走势",
    "Telas vendidas": "已售数量",
    Ativo: "活跃",
    Atencao: "关注",
    Inativo: "沉默",
    "Ate 30 dias sem comprar": "距离上次购买不超过 30 天",
    "De 31 a 89 dias sem comprar": "距离上次购买 31 到 89 天",
    "90 dias ou mais sem comprar": "距离上次购买 90 天及以上",
    "Filtro ativo:": "当前筛选：",
    "Limpar filtro": "清除筛选",
    "Legenda do grafico de evolucao da base": "客户池走势图例",
    "Legenda do grafico de telas vendidas": "销量图例",
    "Meta (Atual)": "当前目标",
    "Clientes filtrados pelo grafico": "按图表筛选的客户",
    "Fila por prioridade": "优先级队列",
    "Clientes para o time abordar agora": "团队当前优先联系的客户",
    "Carregando dashboard...": "正在加载仪表盘...",
    "Nao foi possivel carregar o dashboard.": "无法加载仪表盘。",
    "Nao foi possivel carregar essa lista de clientes.": "无法加载该客户列表。",
    "Carregando clientes priorizados...": "正在加载优先客户...",
    "Nenhum cliente encontrado para esse filtro.": "当前筛选下没有找到客户。",
    Cliente: "客户",
    Status: "状态",
    "Ultima compra": "最近购买",
    "Tempo sem comprar": "距上次购买",
    Pedidos: "订单数",
    "Media pedidos": "平均下单间隔",
    "Ticket medio": "平均客单价",
    "Total gasto": "累计消费",
    Prioridade: "优先级",
    Insight: "洞察",
    "Sem rotulo": "无标签",
    "Sem alerta": "无提醒",
    "Redimensionar coluna": "调整列宽",
    "Performance do mes": "本月表现",
    "Performance do mês": "本月表现",
    "Ranking Mensal": "月度排名",
    "Carregando performance...": "正在加载表现数据...",
    "Nenhuma venda registrada neste mes.": "本月暂无销售记录。",
    "Nenhuma venda registrada neste mês.": "本月暂无销售记录。",
    "Desempenho corporativo com base nas vendas do periodo.": "基于当前周期销售数据的团队表现。",
    "Desempenho corporativo com base nas vendas do período.": "基于当前周期销售数据的团队表现。",
    "Top Performer": "最佳表现",
    vendas: "销售",
    pecas: "件数",
    peças: "件数",
    "Ultimo atendente:": "最近跟进人：",
    "Nenhum recente": "暂无记录",
    "Priority Score": "优先分数",
    "Ultima Compra:": "最近购买：",
    "Recencia:": "最近活跃：",
    "Prev. Prox. Compra:": "预计下次购买：",
    "Motivo do Contato": "联系原因",
    "Ciclo medio:": "平均周期：",
    "Acao Sugerida": "建议动作",
    "Ver ficha completa": "查看完整档案",
    "Copiar texto": "复制文本",
    "Chamar no WhatsApp": "在 WhatsApp 联系",
    Hoje: "今天",
    "1 dia": "1天",
    "Sem base": "无数据",
    "Sem registro": "无记录",
    "Biblioteca de mensagens": "消息模板库",
    "Criar template": "新建模板",
    "Editar template": "编辑模板",
    "Prévia": "预览",
    "Prospeccao Leads": "线索开发",
    Sugestoes: "建议",
    "Palavras prontas": "快捷词",
    "Buscas salvas": "已保存搜索",
    Busca: "搜索",
    "Pesquisar leads": "搜索线索",
    Resultados: "结果",
    "Leads priorizados para prospeccao": "优先线索列表",
    "Painel operacional": "运营面板",
    "Meta, uso e protecao da franquia": "目标、使用情况与配额保护",
    "Segmentacao inteligente": "智能分群",
    "Monte um publico acionavel": "创建可执行客群",
    Resumo: "摘要",
    "Resultado esperado": "预期结果",
    "Biblioteca compartilhada": "共享库",
    "Publicos salvos": "已保存客群",
    "Carregando publicos...": "正在加载客群...",
    "Nao foi possivel carregar os publicos salvos.": "无法加载已保存客群。",
    "Planejamento de Metas": "目标规划",
    "Registrar Nova Meta": "登记新目标",
    "Metas da Empresa (Globais)": "公司目标（全局）",
    "Metas por Vendedora": "按销售分配目标",
    "Clientes Novos": "新客户",
    "Saude do Negocio (LTV vs CAC)": "业务健康度（LTV 对 CAC）",
    "Saúde do Negócio (LTV vs CAC)": "业务健康度（LTV 对 CAC）",
    "Historico mensal": "月度历史",
    "Histórico mensal": "月度历史",
    "Recuperadoras de Ouro": "黄金唤醒榜",
    "Placar Consolidado": "综合看板",
    Ativos: "活跃",
    Inativos: "沉默",
    clientes: "客户",
    Idioma: "语言",
    "Selecionar idioma da interface": "选择界面语言",
    "Exibir em portugues do Brasil": "切换为巴西葡萄牙语",
    "Exibir em chines mandarim": "切换为中文",
    "Sem email": "无邮箱",
    "Encerrar sessao": "结束会话",
    Sair: "退出",
    "Sessao protegida": "受保护会话",
    "Acesso interno por usuario e permissao da equipe.": "按用户与团队权限进行内部访问控制。",
};
const translationRules = [
    {
        pattern: /^Carregando (.+)\.\.\.$/,
        replace: (_, target) => `正在加载${target}...`,
    },
    {
        pattern: /^Nao foi possivel carregar (.+)\.$/,
        replace: (_, target) => `无法加载${target}。`,
    },
    {
        pattern: /^Falha ao carregar (.+)\.$/,
        replace: (_, target) => `加载${target}失败。`,
    },
    {
        pattern: /^Filtro ativo:\s*(.+)$/,
        replace: (_, target) => `当前筛选：${target}`,
    },
    {
        pattern: /^Clientes na faixa (.+)$/,
        replace: (_, target) => `区间 ${target} 的客户`,
    },
    {
        pattern: /^Tendencia de (.+)$/,
        replace: (_, target) => `${target} 的趋势`,
    },
    {
        pattern: /^Sem historico suficiente para montar (.+)\.$/,
        replace: (_, target) => `历史数据不足，无法生成${target}。`,
    },
    {
        pattern: /^(\d+) dias$/,
        replace: (_, days) => `${days}天`,
    },
    {
        pattern: /^([0-9.,]+)% da base$/,
        replace: (_, value) => `占客户池 ${value}%`,
    },
    {
        pattern: /^Alvo ([0-9.]+)$/,
        replace: (_, value) => `目标 ${value}`,
    },
    {
        pattern: /^\+([0-9.]+) acima$/,
        replace: (_, value) => `超出 ${value}`,
    },
    {
        pattern: /^Faltam ([0-9.]+) para a meta$/,
        replace: (_, value) => `距离目标还差 ${value}`,
    },
    {
        pattern: /^Voce ja passou ([0-9.]+) telas do alvo\.$/,
        replace: (_, value) => `已超出目标 ${value} 屏。`,
    },
    {
        pattern: /^Expectativa de receita \(Estimativa vida: ([0-9.]+) meses\)$/,
        replace: (_, months) => `预计收入（预计生命周期：${months}个月）`,
    },
    {
        pattern: /^(\d+) modelos$/,
        replace: (_, value) => `${value}个型号`,
    },
    {
        pattern: /^(\d+) SKUs$/,
        replace: (_, value) => `${value}个 SKU`,
    },
    {
        pattern: /^Ultima leitura:\s*(.+)$/,
        replace: (_, value) => `最近读取：${value}`,
    },
    {
        pattern: /^(\d+) SKUs com saldo$/,
        replace: (_, value) => `${value}个 SKU 有库存`,
    },
    {
        pattern: /^(\d+) linhas na planilha$/,
        replace: (_, value) => `表格中共 ${value} 行`,
    },
    {
        pattern: /^(\d+) ideias$/,
        replace: (_, value) => `${value}条想法`,
    },
    {
        pattern: /^(\d+) votos$/,
        replace: (_, value) => `${value}票`,
    },
    {
        pattern: /^(\d+) comentarios$/,
        replace: (_, value) => `${value}条评论`,
    },
    {
        pattern: /^(\d+) cards$/,
        replace: (_, value) => `${value}张卡片`,
    },
    {
        pattern: /^(\d+) meses$/,
        replace: (_, value) => `${value}个月`,
    },
    {
        pattern: /^(\d+) com venda no corte atual$/,
        replace: (_, value) => `当前周期内有 ${value} 人成交`,
    },
    {
        pattern: /^(\d+) vendas fechadas no corte$/,
        replace: (_, value) => `当前周期内成交 ${value} 单`,
    },
    {
        pattern: /^([0-9.,]+) pecas por venda em media$/,
        replace: (_, value) => `平均每单 ${value} 件`,
    },
    {
        pattern: /^([0-9.,]+)% da carteira pedindo contato$/,
        replace: (_, value) => `客户池中有 ${value}% 需要联系`,
    },
    {
        pattern: /^Comparando (\d+)\/5$/,
        replace: (_, value) => `已比较 ${value}/5`,
    },
    {
        pattern: /^([0-9.,]+) clientes - ([0-9.,]+) vendas - ([0-9.,]+)% da carteira ativa$/,
        replace: (_, customers, orders, activeShare) => `${customers}位客户 - ${orders}单销量 - 活跃客户池占比 ${activeShare}%`,
    },
    {
        pattern: /^Recorrencia:\s*([0-9.,]+) vendas\/cliente$/,
        replace: (_, value) => `复购强度：${value} 单/客户`,
    },
    {
        pattern: /^Pecas por venda:\s*([0-9.,]+)$/,
        replace: (_, value) => `每单件数：${value}`,
    },
    {
        pattern: /^Reativar:\s*([0-9.,]+)$/,
        replace: (_, value) => `待唤醒：${value}`,
    },
    {
        pattern: /^Carteira:\s*([0-9.,]+)$/,
        replace: (_, value) => `客户池：${value}`,
    },
    {
        pattern: /^Ultima venda:\s*(.+)$/,
        replace: (_, value) => `最近成交：${value}`,
    },
    {
        pattern: /^(\d+) vendas no corte atual$/,
        replace: (_, value) => `当前周期内 ${value} 单`,
    },
    {
        pattern: /^(\d+) clientes pedindo contato$/,
        replace: (_, value) => `${value}位客户需要联系`,
    },
    {
        pattern: /^(\d+) ativos$/,
        replace: (_, value) => `${value}位活跃客户`,
    },
    {
        pattern: /^(\d+) atencao$/,
        replace: (_, value) => `${value}位关注客户`,
    },
    {
        pattern: /^(\d+) inativos$/,
        replace: (_, value) => `${value}位沉默客户`,
    },
    {
        pattern: /^Faturamento:\s*(.+)$/,
        replace: (_, value) => `营收：${value}`,
    },
    {
        pattern: /^Ticket medio:\s*(.+)$/,
        replace: (_, value) => `平均客单价：${value}`,
    },
    {
        pattern: /^Receita por cliente:\s*(.+)$/,
        replace: (_, value) => `每客户营收：${value}`,
    },
    {
        pattern: /^Ultima:\s*(.+)$/,
        replace: (_, value) => `最近：${value}`,
    },
    {
        pattern: /^(\d+) clientes$/,
        replace: (_, value) => `${value}位客户`,
    },
    {
        pattern: /^(\d+) pecas - (\d+) vendas$/,
        replace: (_, pieces, orders) => `${pieces}件 - ${orders}单`,
    },
    {
        pattern: /^Reservado (\d+)$/,
        replace: (_, value) => `已预留 ${value}`,
    },
    {
        pattern: /^Venda 90d (\d+)$/,
        replace: (_, value) => `90天销量 ${value}`,
    },
    {
        pattern: /^([0-9.,]+) pecas\/dia$/,
        replace: (_, value) => `${value}件/天`,
    },
    {
        pattern: /^O historico do estoque comecou em (.+)\. Quando entrar mais um dia de leitura, esse grafico vai ficar claro\.$/,
        replace: (_, date) => `库存历史从 ${date} 开始。再增加一天读取后，这个图表就会更清晰。`,
    },
    {
        pattern: /^Sem venda nos ultimos 90 dias e (\d+) unidades paradas em estoque\.$/,
        replace: (_, units) => `过去90天没有销量，且仍有 ${units} 件库存滞留。`,
    },
    {
        pattern: /^O historico do estoque comecou em (.+)\. Conforme novas leituras entrarem, a curva vai aparecer aqui\.$/,
        replace: (_, date) => `库存历史从 ${date} 开始。随着新的读取进入，这里的曲线会逐渐出现。`,
    },
    {
        pattern: /^Com estoque baixo, esse modelo vendeu em media ([0-9.,]+) pecas por dia\.$/,
        replace: (_, value) => `在低库存状态下，这个型号平均每天卖出 ${value} 件。`,
    },
    {
        pattern: /^Com estoque alto, esse modelo vendeu em media ([0-9.,]+) pecas por dia\.$/,
        replace: (_, value) => `在高库存状态下，这个型号平均每天卖出 ${value} 件。`,
    },
];
const UiLanguageContext = createContext(null);
function withOriginalSpacing(current, translated) {
    const leading = current.match(/^\s*/)?.[0] ?? "";
    const trailing = current.match(/\s*$/)?.[0] ?? "";
    return `${leading}${translated}${trailing}`;
}
function translateTemplate(text) {
    const greetingMatch = text.match(/^Ola, (.+)! Passando para retomar nosso contato comercial\.$/);
    if (greetingMatch) {
        return `您好，${greetingMatch[1]}！我们来继续之前的商务沟通。`;
    }
    return null;
}
function translateToChinese(text) {
    const trimmed = text.trim();
    if (!trimmed) {
        return text;
    }
    const templateTranslation = translateTemplate(trimmed);
    if (templateTranslation) {
        return withOriginalSpacing(text, templateTranslation);
    }
    const exactTranslation = exactTranslations[trimmed];
    if (exactTranslation) {
        return withOriginalSpacing(text, exactTranslation);
    }
    for (const rule of translationRules) {
        const matched = trimmed.match(rule.pattern);
        if (matched) {
            return withOriginalSpacing(text, rule.replace(...matched));
        }
    }
    return text;
}
function translateText(text, language) {
    return language === "zh-CN" ? translateToChinese(text) : text;
}
function isElementNode(node) {
    return node.nodeType === Node.ELEMENT_NODE;
}
function isTextNode(node) {
    return node.nodeType === Node.TEXT_NODE;
}
function getStoredValue(storage, key, currentValue) {
    const storedValue = storage.get(key);
    const translatedStoredValue = storedValue ? translateToChinese(storedValue) : null;
    if (storedValue === undefined) {
        storage.set(key, currentValue);
        return currentValue;
    }
    if (currentValue !== storedValue && currentValue !== translatedStoredValue) {
        storage.set(key, currentValue);
        return currentValue;
    }
    return storedValue;
}
export function UiLanguageProvider({ children }) {
    const [language, setLanguage] = useState(() => {
        if (typeof window === "undefined") {
            return "pt-BR";
        }
        const storedLanguage = window.localStorage.getItem(STORAGE_KEY);
        return storedLanguage === "zh-CN" ? "zh-CN" : "pt-BR";
    });
    const textNodeStore = useRef(new WeakMap());
    const attributeStore = useRef(new WeakMap());
    const isTranslatingRef = useRef(false);
    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEY, language);
        document.documentElement.lang = language;
        setFormattingLocale(language);
    }, [language]);
    useEffect(() => {
        const root = document.getElementById("root");
        if (!root) {
            return;
        }
        const appRoot = root;
        const translatableAttributes = ["placeholder", "title", "aria-label"];
        function applyToTextNode(node) {
            const currentText = node.textContent ?? "";
            const originalText = getStoredValue(textNodeStore.current, node, currentText);
            const nextText = translateText(originalText, language);
            if (node.textContent !== nextText) {
                node.textContent = nextText;
            }
        }
        function applyToElement(element) {
            if (element instanceof HTMLScriptElement || element instanceof HTMLStyleElement) {
                return;
            }
            const attributeMap = attributeStore.current.get(element) ?? new Map();
            attributeStore.current.set(element, attributeMap);
            for (const attributeName of translatableAttributes) {
                const currentValue = element.getAttribute(attributeName);
                if (!currentValue) {
                    continue;
                }
                const storedValue = attributeMap.get(attributeName);
                const translatedStoredValue = storedValue ? translateToChinese(storedValue) : null;
                if (!storedValue || (currentValue !== storedValue && currentValue !== translatedStoredValue)) {
                    attributeMap.set(attributeName, currentValue);
                }
                const nextValue = translateText(attributeMap.get(attributeName) ?? currentValue, language);
                if (currentValue !== nextValue) {
                    element.setAttribute(attributeName, nextValue);
                }
            }
            element.childNodes.forEach(applyNode);
        }
        function applyNode(node) {
            if (isTextNode(node)) {
                applyToTextNode(node);
                return;
            }
            if (isElementNode(node)) {
                applyToElement(node);
            }
        }
        function translateTree() {
            isTranslatingRef.current = true;
            applyNode(appRoot);
            isTranslatingRef.current = false;
        }
        translateTree();
        const observer = new MutationObserver((mutations) => {
            if (isTranslatingRef.current) {
                return;
            }
            isTranslatingRef.current = true;
            for (const mutation of mutations) {
                if (mutation.type === "characterData") {
                    applyNode(mutation.target);
                    continue;
                }
                mutation.addedNodes.forEach(applyNode);
            }
            isTranslatingRef.current = false;
        });
        observer.observe(appRoot, {
            subtree: true,
            childList: true,
            characterData: true,
        });
        return () => observer.disconnect();
    }, [language]);
    const value = useMemo(() => ({
        language,
        locale: language,
        setLanguage,
        tx: (pt, zh) => (language === "zh-CN" ? zh : pt),
    }), [language]);
    return _jsx(UiLanguageContext.Provider, { value: value, children: children });
}
export function useUiLanguage() {
    const context = useContext(UiLanguageContext);
    if (!context) {
        throw new Error("useUiLanguage must be used within UiLanguageProvider.");
    }
    return context;
}
