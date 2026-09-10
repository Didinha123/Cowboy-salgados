/* ==========================================================================
   COWBOY SALGADOS — script.js
   Sistema de vendas e controle financeiro 100% front-end (HTML+CSS+JS puro).
   Persistência via localStorage. Otimizado para uso no celular.
   ========================================================================== */

"use strict";

/* ==========================================================================
   1. CONSTANTES
   ========================================================================== */

const STORAGE_KEY = "cowboySalgadosDB_v1";

const PRODUTO_IDS = {
  SALGADO: "p-salgado",
  REFRIGERANTE: "p-refrigerante",
  TRUFA: "p-trufa",
};

const FORMAS_PAGAMENTO_VISTA = [
  { id: "debito", label: "Débito", icon: "💳" },
  { id: "credito", label: "Crédito", icon: "💳" },
  { id: "pix", label: "PIX", icon: "📱" },
  { id: "dinheiro", label: "Dinheiro", icon: "💵" },
];

const CLIENTE_AVULSO_ID = "cliente-avulso";

let db = null; // banco de dados em memória, espelha o localStorage

/* ==========================================================================
   2. PERSISTÊNCIA (localStorage)
   ========================================================================== */

function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Erro ao ler dados salvos, iniciando do zero.", err);
    return null;
  }
}

function saveDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ==========================================================================
   2.1 SINCRONIZAÇÃO COM GOOGLE SHEETS (opcional)
   --------------------------------------------------------------------------
   Se o negócio configurar a URL de um Apps Script (Configurações), o app
   passa a usar uma planilha do Google como fonte de verdade compartilhada
   entre aparelhos. O localStorage continua sendo usado como cache local
   (para abrir instantaneamente e funcionar mesmo sem internet); a cada
   escrita, tentamos sincronizar em segundo plano, sem travar a interface.
   ========================================================================== */

const API_URL_STORAGE_KEY = "cowboySalgadosApiUrl";
let apiUrl = "";
let lastSyncAt = null;

function loadApiUrl() {
  apiUrl = localStorage.getItem(API_URL_STORAGE_KEY) || "";
}

function saveApiUrl(url) {
  apiUrl = (url || "").trim();
  if (apiUrl) localStorage.setItem(API_URL_STORAGE_KEY, apiUrl);
  else localStorage.removeItem(API_URL_STORAGE_KEY);
}

// Busca o estado completo da planilha (fonte de verdade quando conectado).
async function apiFetchAll() {
  const res = await fetch(`${apiUrl}?action=getAll`);
  if (!res.ok) throw new Error("Falha ao consultar a planilha.");
  return res.json();
}

// Envia uma ação de escrita para o Apps Script.
// IMPORTANTE: usar Content-Type "text/plain" evita que o navegador dispare
// um preflight CORS (OPTIONS) — o Apps Script não sabe responder a ele.
async function apiPost(action, payload) {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Falha ao sincronizar com a planilha.");
  return json;
}

// Dispara uma sincronização sem bloquear a interface (otimista):
// a tela já foi atualizada com os dados locais; isso só replica pro Sheets.
function syncInBackground(action, payload) {
  if (!apiUrl) return;
  setSyncStatus("syncing");
  apiPost(action, payload)
    .then(() => setSyncStatus("online"))
    .catch((err) => {
      console.error("Erro de sincronização:", err);
      setSyncStatus("offline");
      showToast("⚠️ Não sincronizado com a planilha. Os dados ficaram salvos só neste aparelho.");
    });
}

function setSyncStatus(status) {
  const badge = document.getElementById("sync-badge");
  if (!badge) return;
  if (!apiUrl) {
    badge.classList.add("hidden");
    return;
  }
  badge.classList.remove("hidden");
  const labels = {
    syncing: { icon: "🔄", text: "Sincronizando…" },
    online: { icon: "🟢", text: "Sincronizado" },
    offline: { icon: "📴", text: "Offline (local)" },
  };
  const info = labels[status] || labels.offline;
  if (status === "online") lastSyncAt = new Date();
  badge.textContent = info.icon;
  badge.title = lastSyncAt
    ? `${info.text} — última vez: ${formatDateTime(lastSyncAt.toISOString())}`
    : info.text;
}

// Puxa o estado atual da planilha e substitui os dados locais por ele
// (usado na abertura do app e no botão "Sincronizar agora").
async function syncFromRemote({ silent = false } = {}) {
  if (!apiUrl) return;
  setSyncStatus("syncing");
  try {
    const remote = await apiFetchAll();
    db = remote;
    saveDB();
    setSyncStatus("online");
    renderView(ui.viewAtual);
    if (!silent) showToast("Dados sincronizados com a planilha!");
  } catch (err) {
    console.error("Erro ao sincronizar:", err);
    setSyncStatus("offline");
    if (!silent) showToast("Não foi possível conectar à planilha. Mostrando dados salvos neste aparelho.");
  }
}

/* ==========================================================================
   3. DADOS INICIAIS (SEED) — criados apenas na primeira execução
   ========================================================================== */

function buildSeedDB() {
  const now = new Date();
  const isoDaysAgo = (days, hours = 10) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(hours, 0, 0, 0);
    return d.toISOString();
  };

  const configuracoes = {
    nomeNegocio: "Cowboy Salgados",
    precoSalgado: 9.9,
    precoRefrigerante: 4.5,
    precoTrufa: 7.5,
    precoKit4Trufas: 24.0,
    metaDiaria: 80,
    estoqueMinimoSalgado: 20,
  };

  const produtos = [
    { id: PRODUTO_IDS.SALGADO, nome: "Salgado", tipo: "salgado", unidade: "un", icon: "🥟" },
    { id: PRODUTO_IDS.REFRIGERANTE, nome: "Refrigerante 200ml", tipo: "refrigerante", unidade: "un", icon: "🥤" },
    { id: PRODUTO_IDS.TRUFA, nome: "Trufa", tipo: "trufa", unidade: "un", icon: "🍫" },
  ];

  const estoque = [
    { produtoId: PRODUTO_IDS.SALGADO, quantidadeAtual: 52, estoqueMinimo: 20 },
    { produtoId: PRODUTO_IDS.REFRIGERANTE, quantidadeAtual: 18, estoqueMinimo: 12 },
    { produtoId: PRODUTO_IDS.TRUFA, quantidadeAtual: 30, estoqueMinimo: 10 },
  ];

  const clientes = [
    {
      id: CLIENTE_AVULSO_ID,
      nome: "Cliente Avulso (Balcão)",
      telefone: "",
      observacao: "Venda rápida sem cadastro completo.",
      fixo: true,
      createdAt: isoDaysAgo(30),
    },
    { id: generateId("cli"), nome: "João", telefone: "11987654321", observacao: "", createdAt: isoDaysAgo(20) },
    { id: generateId("cli"), nome: "Maria", telefone: "11976543210", observacao: "", createdAt: isoDaysAgo(15) },
    { id: generateId("cli"), nome: "Pedro", telefone: "11965432109", observacao: "", createdAt: isoDaysAgo(10) },
  ];

  const joaoId = clientes[1].id;
  const mariaId = clientes[2].id;
  const pedroId = clientes[3].id;

  const vendas = [];
  const itensVenda = [];
  const pagamentos = [];

  function addVendaSeed({
    clienteId,
    diasAtras,
    formaPagamento,
    itens,
    statusOverride,
    valorPagoOverride,
    previsaoDiasAposVenda, // fiado: quantos dias após a venda o pagamento foi combinado
    pagoDiasAtras, // se a venda já foi quitada, há quantos dias isso aconteceu
    quitada, // força a venda como totalmente paga (usado para demonstrar o fluxo completo)
  }) {
    const vendaId = generateId("venda");
    const data = isoDaysAgo(diasAtras);
    let valorTotal = 0;
    itens.forEach((item) => {
      const produto = produtos.find((p) => p.id === item.produtoId);
      const valorItem = calcularValorItem(produto, item.quantidade, configuracoes);
      valorTotal += valorItem;
      itensVenda.push({
        id: generateId("item"),
        vendaId,
        produtoId: item.produtoId,
        quantidade: item.quantidade,
        valorTotal: valorItem,
      });
    });
    valorTotal = Math.round(valorTotal * 100) / 100;

    const isFiado = formaPagamento === "fiado";
    let valorPago = valorPagoOverride != null ? valorPagoOverride : isFiado ? 0 : valorTotal;
    if (quitada) valorPago = valorTotal;
    const valorRestante = Math.round((valorTotal - valorPago) * 100) / 100;
    const status = statusOverride || (valorRestante <= 0 ? "pago" : valorPago > 0 ? "parcial" : "aberto");

    const dataPrevisaoPagamento =
      isFiado && previsaoDiasAposVenda != null
        ? toDateKey(new Date(new Date(data).getTime() + previsaoDiasAposVenda * 86400000))
        : null;
    // "dataPagamento" só faz sentido para fiado (marca a quitação); à vista já
    // nasce paga no ato da venda, então não precisa desse registro à parte.
    const dataPagamento = isFiado && status === "pago" ? (pagoDiasAtras != null ? isoDaysAgo(pagoDiasAtras) : data) : null;

    const venda = {
      id: vendaId,
      clienteId,
      data,
      formaPagamento,
      valorTotal,
      valorPago: Math.round(valorPago * 100) / 100,
      valorRestante,
      status,
      dataPrevisaoPagamento,
      dataPagamento,
    };
    vendas.push(venda);

    return venda;
  }

  // Venda à vista paga hoje
  addVendaSeed({
    clienteId: mariaId,
    diasAtras: 0,
    formaPagamento: "pix",
    itens: [
      { produtoId: PRODUTO_IDS.SALGADO, quantidade: 3 },
      { produtoId: PRODUTO_IDS.REFRIGERANTE, quantidade: 2 },
    ],
  });

  // Venda fiada hoje (em aberto), com previsão de pagamento em 7 dias
  addVendaSeed({
    clienteId: joaoId,
    diasAtras: 0,
    formaPagamento: "fiado",
    itens: [
      { produtoId: PRODUTO_IDS.SALGADO, quantidade: 4 },
      { produtoId: PRODUTO_IDS.TRUFA, quantidade: 4 },
    ],
    previsaoDiasAposVenda: 7,
  });

  // Venda fiada antiga, parcialmente paga — previsão já vencida (demonstra "atrasado")
  addVendaSeed({
    clienteId: pedroId,
    diasAtras: 12,
    formaPagamento: "fiado",
    itens: [{ produtoId: PRODUTO_IDS.SALGADO, quantidade: 8 }],
    valorPagoOverride: 40,
    previsaoDiasAposVenda: 5,
  });
  pagamentos.push({
    id: generateId("pag"),
    clienteId: pedroId,
    valor: 40,
    formaPagamento: "dinheiro",
    data: isoDaysAgo(3),
  });

  // Venda fiada antiga, em aberto, SEM previsão cadastrada — demonstra a
  // regra de compatibilidade (registros antigos usam o critério de +7 dias).
  addVendaSeed({
    clienteId: joaoId,
    diasAtras: 15,
    formaPagamento: "fiado",
    itens: [
      { produtoId: PRODUTO_IDS.SALGADO, quantidade: 5 },
      { produtoId: PRODUTO_IDS.REFRIGERANTE, quantidade: 1 },
    ],
  });

  // Venda fiada antiga já quitada — some das pendências, mas segue no relatório.
  const vendaQuitada = addVendaSeed({
    clienteId: mariaId,
    diasAtras: 20,
    formaPagamento: "fiado",
    itens: [{ produtoId: PRODUTO_IDS.SALGADO, quantidade: 6 }],
    previsaoDiasAposVenda: 5,
    pagoDiasAtras: 18,
    quitada: true,
  });
  pagamentos.push({
    id: generateId("pag"),
    clienteId: mariaId,
    vendaId: vendaQuitada.id,
    valor: vendaQuitada.valorTotal,
    formaPagamento: "pix",
    data: vendaQuitada.dataPagamento,
  });

  // Venda à vista de ontem
  addVendaSeed({
    clienteId: mariaId,
    diasAtras: 1,
    formaPagamento: "dinheiro",
    itens: [{ produtoId: PRODUTO_IDS.TRUFA, quantidade: 2 }],
  });

  // Ajusta estoque para refletir as vendas de exemplo (consumo simulado)
  itensVenda.forEach((item) => {
    const registro = estoque.find((e) => e.produtoId === item.produtoId);
    if (registro) registro.quantidadeAtual = Math.max(0, registro.quantidadeAtual - item.quantidade);
  });
  // Repõe para números redondos de demonstração após o consumo do seed
  estoque.find((e) => e.produtoId === PRODUTO_IDS.SALGADO).quantidadeAtual = 52;
  estoque.find((e) => e.produtoId === PRODUTO_IDS.REFRIGERANTE).quantidadeAtual = 18;
  estoque.find((e) => e.produtoId === PRODUTO_IDS.TRUFA).quantidadeAtual = 30;

  return { clientes, produtos, vendas, itensVenda, pagamentos, estoque, configuracoes };
}

function initDB() {
  db = loadDB();
  if (!db) {
    db = buildSeedDB();
    saveDB();
  }
}

function resetToSeed() {
  db = buildSeedDB();
  saveDB();
}

/* ==========================================================================
   4. UTILITÁRIOS
   ========================================================================== */

function formatCurrency(value) {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateShort(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

// Formata uma data "só o dia" (ex.: dataPrevisaoPagamento, 'YYYY-MM-DD').
// new Date('YYYY-MM-DD') interpreta como meia-noite UTC, o que pode exibir
// o dia errado em fusos negativos (Brasil) — por isso montamos a data local
// a partir dos componentes, em vez de deixar o JS fazer o parse.
function formatDateOnly(dateKey) {
  if (!dateKey) return "—";
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function toDateKey(dateLike) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function onlyDigits(str) {
  return (str || "").replace(/\D/g, "");
}

function formatPhone(str) {
  const digits = onlyDigits(str);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return str || "—";
}

function daysBetween(isoDate, reference = new Date()) {
  const ms = reference.getTime() - new Date(isoDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Segunda-feira 00:00 da semana que contém "date" — para este sistema a
// semana começa na segunda e termina no domingo (seção 11 do briefing).
function getMondayOfWeek(date) {
  const d = new Date(date);
  const dia = d.getDay(); // 0=domingo, 1=segunda, ... 6=sábado
  const diff = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ==========================================================================
   5. CÁLCULOS DE DOMÍNIO
   ========================================================================== */

// Calcula o valor de uma linha de produto, aplicando a promoção de kit de 4
// trufas sempre que for a combinação mais vantajosa (kits inteiros + avulsas).
function calcularValorItem(produto, quantidade, config = db.configuracoes) {
  if (produto.tipo === "trufa") {
    const kits = Math.floor(quantidade / 4);
    const avulsas = quantidade % 4;
    return kits * config.precoKit4Trufas + avulsas * config.precoTrufa;
  }
  const preco = produto.tipo === "salgado" ? config.precoSalgado : config.precoRefrigerante;
  return preco * quantidade;
}

function precoUnitario(produto, config = db.configuracoes) {
  if (produto.tipo === "salgado") return config.precoSalgado;
  if (produto.tipo === "refrigerante") return config.precoRefrigerante;
  return config.precoTrufa;
}

function getProduto(id) {
  return db.produtos.find((p) => p.id === id);
}

function getCliente(id) {
  return db.clientes.find((c) => c.id === id);
}

function getEstoque(produtoId) {
  return db.estoque.find((e) => e.produtoId === produtoId);
}

// Soma do que um cliente ainda deve (apenas vendas fiado com saldo em aberto).
function calcularSaldoCliente(clienteId) {
  return db.vendas
    .filter((v) => v.clienteId === clienteId && v.formaPagamento === "fiado")
    .reduce((sum, v) => sum + v.valorRestante, 0);
}

function totalCompradoCliente(clienteId) {
  return db.vendas.filter((v) => v.clienteId === clienteId).reduce((sum, v) => sum + v.valorTotal, 0);
}

function totalPagoCliente(clienteId) {
  const pagoNaHora = db.vendas
    .filter((v) => v.clienteId === clienteId && v.formaPagamento !== "fiado")
    .reduce((sum, v) => sum + v.valorPago, 0);
  const pagoDepois = db.vendas
    .filter((v) => v.clienteId === clienteId && v.formaPagamento === "fiado")
    .reduce((sum, v) => sum + v.valorPago, 0);
  return pagoNaHora + pagoDepois;
}

// Status visual do cliente conforme legenda de emojis (seção 10 do briefing).
function calcularStatusCliente(clienteId) {
  const saldo = calcularSaldoCliente(clienteId);
  if (saldo <= 0.004) return { emoji: "🟢", label: "Pago" };
  const vendasFiado = db.vendas.filter((v) => v.clienteId === clienteId && v.formaPagamento === "fiado");
  const houvePagamentoParcial = vendasFiado.some((v) => v.valorPago > 0);
  if (houvePagamentoParcial) return { emoji: "🟡", label: "Parcialmente pago" };
  return { emoji: "🔴", label: "Em aberto" };
}

// Status padronizado do pagamento de uma venda: AVISTA / FIADO_PENDENTE /
// FIADO_PAGO internamente, com rótulo amigável para a interface.
// "parcial" (pagamento parcial já registrado) continua contando como
// FIADO_PENDENTE — a venda só sai das pendências quando fica 100% paga.
function getStatusPagamento(venda) {
  if (venda.formaPagamento !== "fiado") return { code: "AVISTA", label: "À Vista", emoji: "🟢" };
  if (venda.status === "pago") return { code: "FIADO_PAGO", label: "Fiado - Pago", emoji: "🟢" };
  if (venda.status === "parcial") return { code: "FIADO_PENDENTE", label: "Fiado - Pendente", emoji: "🟡" };
  return { code: "FIADO_PENDENTE", label: "Fiado - Pendente", emoji: "🔴" };
}

// Mantida por compatibilidade com o restante da interface (mesmo resultado).
function vendaStatusBadge(venda) {
  return getStatusPagamento(venda);
}

// Uma venda fiado pendente cuja previsão de pagamento já passou. Isso é só
// um destaque visual — nunca altera o status da venda automaticamente.
function isVendaAtrasada(venda) {
  if (venda.formaPagamento !== "fiado" || venda.status === "pago") return false;
  if (venda.dataPrevisaoPagamento) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return new Date(`${venda.dataPrevisaoPagamento}T00:00:00`) < hoje;
  }
  return daysBetween(venda.data) > 7; // vendas antigas sem previsão cadastrada
}

function getVendasDoDia(referenceDate = new Date()) {
  const key = toDateKey(referenceDate);
  return db.vendas.filter((v) => toDateKey(v.data) === key);
}

function getItensDeVenda(vendaId) {
  return db.itensVenda.filter((i) => i.vendaId === vendaId);
}

// Total de salgados vendidos em uma data (usado para a meta diária).
function getQuantidadeSalgadosNaData(referenceDate = new Date()) {
  const vendasDia = getVendasDoDia(referenceDate);
  const idsVendasDia = new Set(vendasDia.map((v) => v.id));
  return db.itensVenda
    .filter((i) => idsVendasDia.has(i.vendaId) && getProduto(i.produtoId).tipo === "salgado")
    .reduce((sum, i) => sum + i.quantidade, 0);
}

function getAlertasEstoque() {
  return db.estoque
    .filter((e) => e.quantidadeAtual < e.estoqueMinimo)
    .map((e) => ({ ...e, produto: getProduto(e.produtoId) }));
}

function getRecebimentosDoDia(referenceDate = new Date()) {
  const key = toDateKey(referenceDate);
  const vistaHoje = db.vendas
    .filter((v) => v.formaPagamento !== "fiado" && toDateKey(v.data) === key)
    .reduce((sum, v) => sum + v.valorPago, 0);
  const pagamentosHoje = db.pagamentos
    .filter((p) => toDateKey(p.data) === key)
    .reduce((sum, p) => sum + p.valor, 0);
  return vistaHoje + pagamentosHoje;
}

function getFiadoEmAbertoTotal() {
  return db.vendas.filter((v) => v.formaPagamento === "fiado").reduce((sum, v) => sum + v.valorRestante, 0);
}

/* ==========================================================================
   6. OPERAÇÕES DE DADOS (escrita)
   ========================================================================== */

function criarCliente({ nome, telefone, observacao }) {
  const cliente = {
    id: generateId("cli"),
    nome: nome.trim(),
    telefone: onlyDigits(telefone),
    observacao: (observacao || "").trim(),
    createdAt: new Date().toISOString(),
  };
  db.clientes.push(cliente);
  saveDB();
  syncInBackground("upsert", { sheet: "Clientes", row: cliente });
  return cliente;
}

function editarCliente(clienteId, { nome, telefone, observacao }) {
  const cliente = getCliente(clienteId);
  if (!cliente) return;
  cliente.nome = nome.trim();
  cliente.telefone = onlyDigits(telefone);
  cliente.observacao = (observacao || "").trim();
  saveDB();
  syncInBackground("upsert", { sheet: "Clientes", row: cliente });
}

// Registra uma venda completa: cria a venda, os itens, abate o estoque
// e (se fiado) já deixa o saldo devedor do cliente atualizado.
function registrarVenda({ clienteId, itens, formaPagamento, dataPrevisaoPagamento }) {
  const vendaId = generateId("venda");
  const data = new Date().toISOString(); // registra automaticamente data e hora da venda

  let valorTotal = 0;
  const itensRegistrados = itens.map((item) => {
    const produto = getProduto(item.produtoId);
    const valorItem = calcularValorItem(produto, item.quantidade);
    valorTotal += valorItem;
    return { id: generateId("item"), vendaId, produtoId: item.produtoId, quantidade: item.quantidade, valorTotal: valorItem };
  });

  valorTotal = Math.round(valorTotal * 100) / 100;
  const isFiado = formaPagamento === "fiado";

  const venda = {
    id: vendaId,
    clienteId,
    data,
    formaPagamento,
    valorTotal,
    valorPago: isFiado ? 0 : valorTotal,
    valorRestante: isFiado ? valorTotal : 0,
    status: isFiado ? "aberto" : "pago",
    dataPrevisaoPagamento: isFiado ? dataPrevisaoPagamento || null : null,
    dataPagamento: null,
  };

  db.vendas.push(venda);
  db.itensVenda.push(...itensRegistrados);

  itens.forEach((item) => {
    const estoqueItem = getEstoque(item.produtoId);
    if (estoqueItem) estoqueItem.quantidadeAtual = Math.max(0, estoqueItem.quantidadeAtual - item.quantidade);
  });

  saveDB();

  const produtosAfetados = [...new Set(itens.map((i) => i.produtoId))];
  syncInBackground("registrarVenda", {
    venda,
    itens: itensRegistrados,
    estoque: produtosAfetados.map((id) => getEstoque(id)),
  });

  return venda;
}

// Aplica um pagamento ao saldo devedor do cliente, quitando as vendas fiado
// mais antigas primeiro (FIFO), até o valor informado se esgotar.
function registrarPagamento(clienteId, valorInformado, formaPagamento) {
  const saldoAtual = calcularSaldoCliente(clienteId);
  const valor = Math.min(Math.max(valorInformado, 0), saldoAtual);

  let restante = valor;
  const vendasAbertas = db.vendas
    .filter((v) => v.clienteId === clienteId && v.formaPagamento === "fiado" && v.valorRestante > 0)
    .sort((a, b) => new Date(a.data) - new Date(b.data));

  const vendasAlteradas = [];
  for (const venda of vendasAbertas) {
    if (restante <= 0) break;
    const abate = Math.min(restante, venda.valorRestante);
    venda.valorPago = Math.round((venda.valorPago + abate) * 100) / 100;
    venda.valorRestante = Math.round((venda.valorRestante - abate) * 100) / 100;
    if (venda.valorRestante < 0.01) venda.valorRestante = 0;
    venda.status = venda.valorRestante <= 0 ? "pago" : "parcial";
    if (venda.status === "pago" && !venda.dataPagamento) venda.dataPagamento = new Date().toISOString();
    restante -= abate;
    vendasAlteradas.push(venda);
  }

  const pagamento = { id: generateId("pag"), clienteId, valor, formaPagamento, data: new Date().toISOString() };
  db.pagamentos.push(pagamento);
  saveDB();

  syncInBackground("registrarPagamento", { pagamento, vendasAtualizadas: vendasAlteradas });

  return { pagamento, valorAplicado: valor, foiAjustado: valor < valorInformado };
}

// Quita totalmente UMA venda fiado específica (usado na tela de Fiado).
// Diferente de registrarPagamento (que abate um valor nas vendas mais
// antigas do cliente via FIFO), aqui o alvo é sempre a venda escolhida.
function marcarVendaComoPaga(vendaId, formaPagamento) {
  const venda = db.vendas.find((v) => v.id === vendaId);
  if (!venda || venda.formaPagamento !== "fiado" || venda.valorRestante <= 0) return null;

  const valor = venda.valorRestante;
  venda.valorPago = Math.round((venda.valorPago + valor) * 100) / 100;
  venda.valorRestante = 0;
  venda.status = "pago";
  venda.dataPagamento = new Date().toISOString();

  const pagamento = {
    id: generateId("pag"),
    clienteId: venda.clienteId,
    vendaId: venda.id,
    valor,
    formaPagamento,
    data: venda.dataPagamento,
  };
  db.pagamentos.push(pagamento);
  saveDB();

  syncInBackground("registrarPagamento", { pagamento, vendasAtualizadas: [venda] });

  return { pagamento, venda };
}

// Corrige a data prevista de pagamento de uma venda fiado já registrada.
function editarPrevisaoPagamento(vendaId, novaData) {
  const venda = db.vendas.find((v) => v.id === vendaId);
  if (!venda) return;
  venda.dataPrevisaoPagamento = novaData || null;
  saveDB();
  syncInBackground("upsert", { sheet: "Vendas", row: venda });
}

function ajustarEstoque(produtoId, tipoOperacao, quantidade) {
  const registro = getEstoque(produtoId);
  if (!registro) return;
  if (tipoOperacao === "entrada") registro.quantidadeAtual += quantidade;
  else if (tipoOperacao === "saida") registro.quantidadeAtual = Math.max(0, registro.quantidadeAtual - quantidade);
  else if (tipoOperacao === "ajuste") registro.quantidadeAtual = Math.max(0, quantidade);
  saveDB();
  syncInBackground("upsert", { sheet: "Estoque", row: registro });
}

function editarEstoqueMinimo(produtoId, novoMinimo) {
  const registro = getEstoque(produtoId);
  if (!registro) return;
  registro.estoqueMinimo = Math.max(0, novoMinimo);
  saveDB();
  syncInBackground("upsert", { sheet: "Estoque", row: registro });
}

function salvarConfiguracoes(novasConfig) {
  Object.assign(db.configuracoes, novasConfig);
  const salgadoEstoque = getEstoque(PRODUTO_IDS.SALGADO);
  if (salgadoEstoque && novasConfig.estoqueMinimoSalgado != null) {
    salgadoEstoque.estoqueMinimo = novasConfig.estoqueMinimoSalgado;
  }
  saveDB();
  syncInBackground("saveConfig", { config: db.configuracoes });
  if (salgadoEstoque) syncInBackground("upsert", { sheet: "Estoque", row: salgadoEstoque });
}

/* ==========================================================================
   7. RELATÓRIO / FILTROS DE DATA
   ========================================================================== */

function getPeriodoRange(filtro, customStart, customEnd) {
  const now = new Date();
  let start, end;

  if (filtro === "hoje") {
    start = new Date(now);
    end = new Date(now);
  } else if (filtro === "ontem") {
    start = new Date(now);
    start.setDate(start.getDate() - 1);
    end = new Date(start);
  } else if (filtro === "esta-semana") {
    start = getMondayOfWeek(now);
    end = addDays(start, 6);
  } else if (filtro === "semana-passada") {
    start = addDays(getMondayOfWeek(now), -7);
    end = addDays(start, 6);
  } else if (filtro === "7dias") {
    start = new Date(now);
    start.setDate(start.getDate() - 6);
    end = new Date(now);
  } else if (filtro === "mes") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now);
  } else if (filtro === "personalizado") {
    start = new Date(customStart);
    end = new Date(customEnd);
  } else {
    start = new Date(now);
    end = new Date(now);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function gerarRelatorio(filtro, customStart, customEnd, opcoes = {}) {
  const { clienteId, status } = opcoes;
  const { start, end } = getPeriodoRange(filtro, customStart, customEnd);
  let vendasPeriodo = db.vendas.filter((v) => {
    const d = new Date(v.data);
    return d >= start && d <= end;
  });
  if (clienteId) vendasPeriodo = vendasPeriodo.filter((v) => v.clienteId === clienteId);
  if (status) vendasPeriodo = vendasPeriodo.filter((v) => getStatusPagamento(v).code === status);
  vendasPeriodo = [...vendasPeriodo].sort((a, b) => new Date(b.data) - new Date(a.data));

  const idsVendas = new Set(vendasPeriodo.map((v) => v.id));
  const itensPeriodo = db.itensVenda.filter((i) => idsVendas.has(i.vendaId));
  let pagamentosPeriodo = db.pagamentos.filter((p) => {
    const d = new Date(p.data);
    return d >= start && d <= end;
  });
  if (clienteId) pagamentosPeriodo = pagamentosPeriodo.filter((p) => p.clienteId === clienteId);

  const somaPorTipo = (tipo) =>
    itensPeriodo.filter((i) => getProduto(i.produtoId).tipo === tipo).reduce((sum, i) => sum + i.quantidade, 0);

  const vendasVista = vendasPeriodo.filter((v) => v.formaPagamento !== "fiado");
  const vendasFiado = vendasPeriodo.filter((v) => v.formaPagamento === "fiado");

  const formasPagamento = { pix: 0, dinheiro: 0, debito: 0, credito: 0 };
  vendasVista.forEach((v) => {
    formasPagamento[v.formaPagamento] = (formasPagamento[v.formaPagamento] || 0) + v.valorTotal;
  });

  const faturamentoTotal = vendasPeriodo.reduce((sum, v) => sum + v.valorTotal, 0);
  const valorFiado = vendasFiado.reduce((sum, v) => sum + v.valorTotal, 0);
  const valorAindaAReceber = vendasFiado.reduce((sum, v) => sum + v.valorRestante, 0);
  const valorRecebido = vendasVista.reduce((sum, v) => sum + v.valorPago, 0) + pagamentosPeriodo.reduce((sum, p) => sum + p.valor, 0);

  return {
    periodo: { start, end },
    quantidadeVendas: vendasPeriodo.length,
    salgados: somaPorTipo("salgado"),
    refrigerantes: somaPorTipo("refrigerante"),
    trufas: somaPorTipo("trufa"),
    faturamentoTotal,
    valorRecebido,
    valorFiado,
    valorAindaAReceber,
    formasPagamento,
    vendas: vendasPeriodo,
  };
}

/* ==========================================================================
   8. ESTADO DA UI
   ========================================================================== */

const ui = {
  viewAtual: "inicio",
  novaVenda: {
    step: 1,
    clienteId: null,
    itens: {}, // produtoId -> quantidade
    formaPagamento: null,
    metodoVista: null,
    buscaCliente: "",
    dataPrevisaoPagamento: null,
  },
  clientes: { busca: "" },
  venda: { clienteFiltro: "" },
  fiado: {
    ordenacao: "previsao-proxima",
    clienteFiltro: "",
    statusFiltro: "FIADO_PENDENTE",
    periodoFiltro: "todos",
    customStart: null,
    customEnd: null,
  },
  relatorio: { filtro: "hoje", customStart: null, customEnd: null, clienteFiltro: "", statusFiltro: "" },
  clientePerfilId: null,
};

function resetNovaVendaState() {
  ui.novaVenda = {
    step: 1,
    clienteId: null,
    itens: {},
    formaPagamento: null,
    metodoVista: null,
    buscaCliente: "",
    dataPrevisaoPagamento: null,
  };
}

/* ==========================================================================
   9. TOAST E MODAIS GENÉRICOS
   ========================================================================== */

let toastTimeout = null;
function showToast(mensagem) {
  const toast = document.getElementById("toast");
  toast.textContent = mensagem;
  toast.classList.remove("hidden");
  toast.classList.add("toast--visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => toast.classList.add("hidden"), 250);
  }, 2200);
}

function openConfirm({ title, message, confirmText = "Confirmar", cancelText = "Cancelar", danger = false, onConfirm }) {
  const modal = document.getElementById("modal-confirm");
  modal.querySelector(".modal__title").textContent = title;
  modal.querySelector(".modal__message").textContent = message;
  const btnConfirm = modal.querySelector(".modal__confirm-btn");
  const btnCancel = modal.querySelector(".modal__cancel-btn");
  btnConfirm.textContent = confirmText;
  btnCancel.textContent = cancelText;
  btnConfirm.classList.toggle("btn--danger", danger);

  const cleanup = () => {
    modal.classList.add("hidden");
    btnConfirm.onclick = null;
    btnCancel.onclick = null;
  };
  btnConfirm.onclick = () => {
    cleanup();
    onConfirm && onConfirm();
  };
  btnCancel.onclick = cleanup;
  modal.classList.remove("hidden");
}

// Modal genérico com campos dinâmicos (usado para pagamento, estoque, cliente rápido etc.)
function openPrompt({ title, fields, confirmText = "Salvar", onSubmit }) {
  const modal = document.getElementById("modal-prompt");
  modal.querySelector(".modal__title").textContent = title;
  const body = modal.querySelector(".modal__body");
  body.innerHTML = fields
    .map(
      (f) => `
      <div class="form-field">
        <label for="prompt-${f.id}">${f.label}</label>
        ${
          f.type === "select"
            ? `<select id="prompt-${f.id}">${f.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}</select>`
            : `<input id="prompt-${f.id}" type="${f.type || "text"}" inputmode="${f.inputmode || ""}" placeholder="${f.placeholder || ""}" value="${f.value != null ? f.value : ""}" ${f.step ? `step="${f.step}"` : ""} ${f.max != null ? `max="${f.max}"` : ""} />`
        }
      </div>`
    )
    .join("");

  const btnConfirm = modal.querySelector(".modal__confirm-btn");
  const btnCancel = modal.querySelector(".modal__cancel-btn");
  btnConfirm.textContent = confirmText;
  btnConfirm.classList.remove("btn--danger");

  const cleanup = () => {
    modal.classList.add("hidden");
    btnConfirm.onclick = null;
    btnCancel.onclick = null;
  };

  btnConfirm.onclick = () => {
    const values = {};
    fields.forEach((f) => {
      const el = document.getElementById(`prompt-${f.id}`);
      values[f.id] = f.type === "number" ? parseFloat(el.value.replace(",", ".")) || 0 : el.value;
    });
    cleanup();
    onSubmit(values);
  };
  btnCancel.onclick = cleanup;
  modal.classList.remove("hidden");

  const firstInput = body.querySelector("input, select");
  if (firstInput) setTimeout(() => firstInput.focus(), 50);
}

/* ==========================================================================
   10. NAVEGAÇÃO PRINCIPAL
   ========================================================================== */

function switchView(viewName) {
  ui.viewAtual = viewName;
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(`view-${viewName}`).classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === viewName));
  renderView(viewName);
}

function renderView(viewName) {
  if (viewName === "inicio") renderDashboard();
  else if (viewName === "venda") renderVendaView();
  else if (viewName === "clientes") renderClientes();
  else if (viewName === "fiado") renderFiado();
  else if (viewName === "estoque") renderEstoque();
}

function openOverlay(id) {
  document.getElementById(id).classList.remove("hidden");
}
function closeOverlay(id) {
  document.getElementById(id).classList.add("hidden");
}

/* ==========================================================================
   11. RENDERIZAÇÃO — DASHBOARD (INÍCIO)
   ========================================================================== */

function renderDashboard() {
  const config = db.configuracoes;
  const vendasHoje = getVendasDoDia();
  const totalVendidoHoje = vendasHoje.reduce((sum, v) => sum + v.valorTotal, 0);
  const salgadosVendidosHoje = getQuantidadeSalgadosNaData();
  const meta = config.metaDiaria;
  const percentualMeta = Math.min(999, Math.round((salgadosVendidosHoje / meta) * 100));
  const fiadoAberto = getFiadoEmAbertoTotal();
  const recebimentosHoje = getRecebimentosDoDia();
  const alertas = getAlertasEstoque();

  const el = document.getElementById("view-inicio");

  let metaMensagem = `🟢 ${percentualMeta}% da meta`;
  if (salgadosVendidosHoje > meta) metaMensagem = `🔥 META SUPERADA! (${percentualMeta}%)`;
  else if (salgadosVendidosHoje === meta) metaMensagem = `🎉 META ATINGIDA!`;

  el.innerHTML = `
    <h2 class="business-title">🤠 ${config.nomeNegocio}</h2>
    <p class="business-subtitle">Resumo de hoje, ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p>

    <div class="dash-grid">
      <div class="dash-card">
        <span class="dash-card__label">Vendas de hoje</span>
        <span class="dash-card__value">💰 ${formatCurrency(totalVendidoHoje)}</span>
      </div>
      <div class="dash-card">
        <span class="dash-card__label">Salgados vendidos</span>
        <span class="dash-card__value">🌭 ${salgadosVendidosHoje} / ${meta}</span>
      </div>
    </div>

    <div class="panel meta-panel">
      <div class="meta-panel__header">
        <span>Meta diária</span>
        <strong>${metaMensagem}</strong>
      </div>
      <div class="progress-bar">
        <div class="progress-bar__fill" style="width:${Math.min(100, percentualMeta)}%"></div>
      </div>
      <div class="meta-panel__footer">
        <span>${salgadosVendidosHoje} vendidos</span>
        <span>${Math.max(0, meta - salgadosVendidosHoje)} restantes</span>
      </div>
    </div>

    <div class="dash-grid">
      <div class="dash-card dash-card--danger">
        <span class="dash-card__label">Fiado em aberto</span>
        <span class="dash-card__value">📒 ${formatCurrency(fiadoAberto)}</span>
      </div>
      <div class="dash-card dash-card--success">
        <span class="dash-card__label">Recebimentos do dia</span>
        <span class="dash-card__value">💵 ${formatCurrency(recebimentosHoje)}</span>
      </div>
    </div>

    ${
      alertas.length > 0
        ? `<div class="panel alert-panel">
            <strong>⚠️ ESTOQUE BAIXO</strong>
            <ul class="alert-list">
              ${alertas.map((a) => `<li>${a.produto.icon} ${a.produto.nome}: ${a.quantidadeAtual} (mín. ${a.estoqueMinimo})</li>`).join("")}
            </ul>
          </div>`
        : ""
    }

    <button class="btn btn--primary btn--block btn--xl" id="dash-nova-venda-btn">+ NOVA VENDA</button>
  `;

  document.getElementById("dash-nova-venda-btn").addEventListener("click", startNovaVenda);
}

/* ==========================================================================
   12. RENDERIZAÇÃO — VENDA (lista do dia + acesso ao relatório)
   ========================================================================== */

function renderVendaView() {
  const el = document.getElementById("view-venda");
  const clienteFiltro = ui.venda.clienteFiltro;
  let vendasHoje = [...getVendasDoDia()].sort((a, b) => new Date(b.data) - new Date(a.data));
  if (clienteFiltro) vendasHoje = vendasHoje.filter((v) => v.clienteId === clienteFiltro);

  const clientesOrdenados = [...db.clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  el.innerHTML = `
    <h2 class="view-title">🛒 Venda</h2>
    <button class="btn btn--primary btn--block btn--xl" id="venda-nova-btn">+ NOVA VENDA</button>

    <button class="btn btn--secondary btn--block" id="venda-relatorio-btn">📊 Ver relatório completo</button>

    <div class="form-field">
      <label for="venda-filtro-cliente">Filtrar por cliente</label>
      <select id="venda-filtro-cliente">
        <option value="">Todos os clientes</option>
        ${clientesOrdenados.map((c) => `<option value="${c.id}" ${clienteFiltro === c.id ? "selected" : ""}>${c.nome}</option>`).join("")}
      </select>
    </div>

    <h3 class="section-subtitle">Vendas de hoje (${vendasHoje.length})</h3>
    <ul class="list">
      ${
        vendasHoje.length === 0
          ? `<li class="empty-state">Nenhuma venda registrada hoje ainda${clienteFiltro ? " para este cliente" : ""}.</li>`
          : vendasHoje
              .map((v) => {
                const cliente = getCliente(v.clienteId);
                const badge = getStatusPagamento(v);
                const itens = getItensDeVenda(v.id);
                const resumoItens = itens.map((i) => `${getProduto(i.produtoId).nome} x${i.quantidade}`).join(", ");
                return `
                <li class="list-item">
                  <div class="list-item__main">
                    <strong>${cliente ? cliente.nome : "Cliente"}</strong>
                    <span class="list-item__meta">${resumoItens}</span>
                  </div>
                  <div class="list-item__side">
                    <span class="list-item__value">${formatCurrency(v.valorTotal)}</span>
                    <span class="badge">${badge.emoji} ${badge.label}</span>
                  </div>
                </li>`;
              })
              .join("")
      }
    </ul>
  `;

  document.getElementById("venda-nova-btn").addEventListener("click", startNovaVenda);
  document.getElementById("venda-relatorio-btn").addEventListener("click", () => {
    renderRelatorio();
    openOverlay("overlay-relatorio");
  });
  document.getElementById("venda-filtro-cliente").addEventListener("change", (e) => {
    ui.venda.clienteFiltro = e.target.value;
    renderVendaView();
  });
}

/* ==========================================================================
   13. RENDERIZAÇÃO — CLIENTES
   ========================================================================== */

function filtrarClientes(termo) {
  const t = termo.trim().toLowerCase();
  const tDigits = onlyDigits(termo);
  if (!t) return db.clientes;
  return db.clientes.filter((c) => c.nome.toLowerCase().includes(t) || (tDigits && c.telefone.includes(tDigits)));
}

function renderClientes() {
  const el = document.getElementById("view-clientes");
  const lista = filtrarClientes(ui.clientes.busca).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  el.innerHTML = `
    <h2 class="view-title">👥 Clientes</h2>
    <input type="search" id="clientes-busca" class="search-input" placeholder="Buscar por nome ou telefone" value="${ui.clientes.busca}" />
    <button class="btn btn--secondary btn--block" id="clientes-novo-btn">+ Novo cliente</button>
    <ul class="list">
      ${
        lista.length === 0
          ? `<li class="empty-state">Nenhum cliente encontrado.</li>`
          : lista
              .map((c) => {
                const saldo = calcularSaldoCliente(c.id);
                const status = calcularStatusCliente(c.id);
                return `
                <li class="list-item" data-cliente-id="${c.id}">
                  <div class="list-item__main">
                    <strong>${c.nome}</strong>
                    <span class="list-item__meta">📱 ${formatPhone(c.telefone)}</span>
                  </div>
                  <div class="list-item__side">
                    <span class="badge">${status.emoji} ${saldo > 0 ? `Deve ${formatCurrency(saldo)}` : "Em dia"}</span>
                  </div>
                </li>`;
              })
              .join("")
      }
    </ul>
  `;

  document.getElementById("clientes-busca").addEventListener("input", (e) => {
    ui.clientes.busca = e.target.value;
    renderClientes();
  });
  document.getElementById("clientes-novo-btn").addEventListener("click", () => abrirFormNovoCliente());
  el.querySelectorAll("[data-cliente-id]").forEach((item) => {
    item.addEventListener("click", () => abrirPerfilCliente(item.dataset.clienteId));
  });
}

function abrirFormNovoCliente(onCreated) {
  openPrompt({
    title: "+ Novo cliente",
    fields: [
      { id: "nome", label: "Nome", type: "text", placeholder: "Ex: João" },
      { id: "telefone", label: "Telefone/WhatsApp", type: "tel", inputmode: "numeric", placeholder: "Ex: 11987654321" },
      { id: "observacao", label: "Observação (opcional)", type: "text", placeholder: "Ex: prefere sem cebola" },
    ],
    confirmText: "Cadastrar",
    onSubmit: (values) => {
      if (!values.nome.trim()) {
        showToast("Informe o nome do cliente.");
        return;
      }
      const cliente = criarCliente(values);
      showToast(`Cliente ${cliente.nome} cadastrado!`);
      if (onCreated) onCreated(cliente);
      else renderClientes();
    },
  });
}

/* ==========================================================================
   14. RENDERIZAÇÃO — PERFIL DO CLIENTE
   ========================================================================== */

function abrirPerfilCliente(clienteId) {
  ui.clientePerfilId = clienteId;
  renderPerfilCliente();
  openOverlay("overlay-cliente-perfil");
}

function renderPerfilCliente() {
  const cliente = getCliente(ui.clientePerfilId);
  if (!cliente) return;
  const el = document.getElementById("overlay-cliente-perfil");
  const saldo = calcularSaldoCliente(cliente.id);
  const status = calcularStatusCliente(cliente.id);
  const compras = db.vendas.filter((v) => v.clienteId === cliente.id).sort((a, b) => new Date(b.data) - new Date(a.data));
  const pagamentos = db.pagamentos.filter((p) => p.clienteId === cliente.id).sort((a, b) => new Date(b.data) - new Date(a.data));

  el.innerHTML = `
    <div class="overlay__header">
      <button class="icon-btn" data-action="fechar-perfil">←</button>
      <h2>Perfil do cliente</h2>
      ${cliente.fixo ? "" : `<button class="icon-btn" data-action="editar-cliente">✏️</button>`}
    </div>
    <div class="overlay__body">
      <div class="panel profile-card">
        <h3>${cliente.nome}</h3>
        <p class="profile-card__phone">📱 ${formatPhone(cliente.telefone)}</p>
        <p class="profile-card__saldo">${status.emoji} ${saldo > 0 ? `Deve ${formatCurrency(saldo)}` : "Sem dívidas"}</p>
        ${cliente.observacao ? `<p class="profile-card__obs">📝 ${cliente.observacao}</p>` : ""}
      </div>

      <div class="stat-row">
        <div class="stat-box"><span>Total comprado</span><strong>${formatCurrency(totalCompradoCliente(cliente.id))}</strong></div>
        <div class="stat-box"><span>Total pago</span><strong>${formatCurrency(totalPagoCliente(cliente.id))}</strong></div>
        <div class="stat-box"><span>Em aberto</span><strong>${formatCurrency(saldo)}</strong></div>
      </div>

      <div class="profile-actions">
        <button class="btn btn--primary btn--block" data-action="registrar-pagamento" ${saldo <= 0 ? "disabled" : ""}>💰 Registrar pagamento</button>
        <button class="btn btn--whatsapp btn--block" data-action="cobrar-whatsapp" ${!cliente.telefone ? "disabled" : ""}>📱 Cobrar pelo WhatsApp</button>
      </div>

      <h4 class="section-subtitle">Histórico de compras</h4>
      <ul class="list">
        ${
          compras.length === 0
            ? `<li class="empty-state">Nenhuma compra registrada.</li>`
            : compras
                .map((v) => {
                  const badge = getStatusPagamento(v);
                  const itens = getItensDeVenda(v.id).map((i) => `${getProduto(i.produtoId).nome} x${i.quantidade}`).join(", ");
                  const extras = [];
                  if (v.formaPagamento === "fiado" && v.dataPrevisaoPagamento) extras.push(`Previsto: ${formatDateOnly(v.dataPrevisaoPagamento)}`);
                  if (v.dataPagamento) extras.push(`Pago em: ${formatDateShort(v.dataPagamento)}`);
                  const atrasada = isVendaAtrasada(v);
                  return `<li class="list-item">
                    <div class="list-item__main">
                      <strong>${formatDateTime(v.data)}</strong>
                      <span class="list-item__meta">${itens}${extras.length ? " · " + extras.join(" · ") : ""}</span>
                    </div>
                    <div class="list-item__side">
                      <span class="list-item__value">${formatCurrency(v.valorTotal)}</span>
                      <span class="badge">${badge.emoji} ${badge.label}</span>
                      ${atrasada ? `<span class="badge badge--danger">⏰ Atrasado</span>` : ""}
                    </div>
                  </li>`;
                })
                .join("")
        }
      </ul>

      <h4 class="section-subtitle">Histórico de pagamentos</h4>
      <ul class="list">
        ${
          pagamentos.length === 0
            ? `<li class="empty-state">Nenhum pagamento registrado.</li>`
            : pagamentos
                .map(
                  (p) => `<li class="list-item">
                    <div class="list-item__main"><strong>${formatDateTime(p.data)}</strong><span class="list-item__meta">${p.formaPagamento}</span></div>
                    <div class="list-item__side"><span class="list-item__value">${formatCurrency(p.valor)}</span></div>
                  </li>`
                )
                .join("")
        }
      </ul>
    </div>
  `;

  el.querySelector('[data-action="fechar-perfil"]').addEventListener("click", () => {
    closeOverlay("overlay-cliente-perfil");
    renderView(ui.viewAtual);
  });
  const editBtn = el.querySelector('[data-action="editar-cliente"]');
  if (editBtn) editBtn.addEventListener("click", () => abrirFormEditarCliente(cliente));
  el.querySelector('[data-action="registrar-pagamento"]').addEventListener("click", () => abrirFormPagamento(cliente));
  el.querySelector('[data-action="cobrar-whatsapp"]').addEventListener("click", () => cobrarPeloWhatsApp(cliente));
}

function abrirFormEditarCliente(cliente) {
  openPrompt({
    title: "Editar cliente",
    fields: [
      { id: "nome", label: "Nome", type: "text", value: cliente.nome },
      { id: "telefone", label: "Telefone/WhatsApp", type: "tel", inputmode: "numeric", value: cliente.telefone },
      { id: "observacao", label: "Observação", type: "text", value: cliente.observacao },
    ],
    confirmText: "Salvar",
    onSubmit: (values) => {
      editarCliente(cliente.id, values);
      showToast("Cliente atualizado!");
      renderPerfilCliente();
    },
  });
}

function abrirFormPagamento(cliente) {
  const saldo = calcularSaldoCliente(cliente.id);
  openPrompt({
    title: "💰 Registrar pagamento",
    fields: [
      { id: "valor", label: `Valor pago (saldo: ${formatCurrency(saldo)})`, type: "number", inputmode: "decimal", step: "0.01", max: saldo, placeholder: "0,00" },
      {
        id: "forma",
        label: "Forma de pagamento",
        type: "select",
        options: [
          { value: "pix", label: "PIX" },
          { value: "dinheiro", label: "Dinheiro" },
          { value: "debito", label: "Débito" },
          { value: "credito", label: "Crédito" },
        ],
      },
    ],
    confirmText: "Registrar",
    onSubmit: (values) => {
      if (values.valor <= 0) {
        showToast("Informe um valor válido.");
        return;
      }
      const resultado = registrarPagamento(cliente.id, values.valor, values.forma);
      const novoSaldo = calcularSaldoCliente(cliente.id);
      showToast(
        novoSaldo <= 0
          ? "🟢 Dívida quitada!"
          : `Pagamento registrado. Novo saldo: ${formatCurrency(novoSaldo)}`
      );
      renderPerfilCliente();
    },
  });
}

function cobrarPeloWhatsApp(cliente) {
  const saldo = calcularSaldoCliente(cliente.id);
  const mensagem =
    saldo > 0
      ? `Olá, ${cliente.nome}! 🤠\nPassando para lembrar que ficou um saldo de ${formatCurrency(saldo)} referente às suas compras no ${db.configuracoes.nomeNegocio}.\nObrigado!`
      : `Olá, ${cliente.nome}! 🤠\nPassando para agradecer pela preferência no ${db.configuracoes.nomeNegocio}!`;

  let digits = onlyDigits(cliente.telefone);
  if (digits.length <= 11) digits = `55${digits}`;
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(mensagem)}`, "_blank");
}

/* ==========================================================================
   15. RENDERIZAÇÃO — FIADO
   ========================================================================== */

function renderFiado() {
  const el = document.getElementById("view-fiado");
  const clientesComHistorico = db.clientes.filter((c) => db.vendas.some((v) => v.clienteId === c.id && v.formaPagamento === "fiado"));

  const totalAReceber = getFiadoEmAbertoTotal();
  const clientesDevendo = clientesComHistorico.filter((c) => calcularSaldoCliente(c.id) > 0);
  const emAtraso = clientesDevendo.filter((c) => db.vendas.some((v) => v.clienteId === c.id && isVendaAtrasada(v)));

  const { clienteFiltro, statusFiltro, periodoFiltro, customStart, customEnd, ordenacao } = ui.fiado;

  let vendasFiado = db.vendas.filter((v) => v.formaPagamento === "fiado");
  if (clienteFiltro) vendasFiado = vendasFiado.filter((v) => v.clienteId === clienteFiltro);
  if (statusFiltro) vendasFiado = vendasFiado.filter((v) => getStatusPagamento(v).code === statusFiltro);
  if (periodoFiltro && periodoFiltro !== "todos") {
    const { start, end } = getPeriodoRange(periodoFiltro, customStart, customEnd);
    vendasFiado = vendasFiado.filter((v) => {
      const d = new Date(v.data);
      return d >= start && d <= end;
    });
  }

  vendasFiado = [...vendasFiado].sort((a, b) => {
    const nomeA = getCliente(a.clienteId)?.nome || "";
    const nomeB = getCliente(b.clienteId)?.nome || "";
    if (ordenacao === "cliente-az") return nomeA.localeCompare(nomeB, "pt-BR");
    if (ordenacao === "cliente-za") return nomeB.localeCompare(nomeA, "pt-BR");
    if (ordenacao === "venda-recente") return new Date(b.data) - new Date(a.data);
    if (ordenacao === "venda-antiga") return new Date(a.data) - new Date(b.data);
    if (ordenacao === "valor") return b.valorTotal - a.valorTotal;
    if (ordenacao === "status") return getStatusPagamento(a).label.localeCompare(getStatusPagamento(b).label);
    if (ordenacao === "previsao-proxima") {
      if (!a.dataPrevisaoPagamento && !b.dataPrevisaoPagamento) return 0;
      if (!a.dataPrevisaoPagamento) return 1;
      if (!b.dataPrevisaoPagamento) return -1;
      return new Date(a.dataPrevisaoPagamento) - new Date(b.dataPrevisaoPagamento);
    }
    return new Date(b.data) - new Date(a.data);
  });

  const clientesOrdenados = [...db.clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  el.innerHTML = `
    <h2 class="view-title">📒 Fiado</h2>
    <div class="stat-row">
      <div class="stat-box"><span>Total a receber</span><strong>${formatCurrency(totalAReceber)}</strong></div>
      <div class="stat-box"><span>Clientes devendo</span><strong>${clientesDevendo.length}</strong></div>
      <div class="stat-box"><span>Em atraso</span><strong>${emAtraso.length}</strong></div>
    </div>

    <div class="form-field">
      <label for="fiado-filtro-cliente">Cliente</label>
      <select id="fiado-filtro-cliente">
        <option value="">Todos os clientes</option>
        ${clientesOrdenados.map((c) => `<option value="${c.id}" ${clienteFiltro === c.id ? "selected" : ""}>${c.nome}</option>`).join("")}
      </select>
    </div>

    <div class="stat-row">
      <div class="form-field">
        <label for="fiado-filtro-status">Status</label>
        <select id="fiado-filtro-status">
          <option value="" ${statusFiltro === "" ? "selected" : ""}>Todos</option>
          <option value="FIADO_PENDENTE" ${statusFiltro === "FIADO_PENDENTE" ? "selected" : ""}>Fiado - Pendente</option>
          <option value="FIADO_PAGO" ${statusFiltro === "FIADO_PAGO" ? "selected" : ""}>Fiado - Pago</option>
        </select>
      </div>
      <div class="form-field">
        <label for="fiado-filtro-periodo">Período</label>
        <select id="fiado-filtro-periodo">
          <option value="todos" ${periodoFiltro === "todos" ? "selected" : ""}>Todo o período</option>
          <option value="hoje" ${periodoFiltro === "hoje" ? "selected" : ""}>Hoje</option>
          <option value="esta-semana" ${periodoFiltro === "esta-semana" ? "selected" : ""}>Esta semana</option>
          <option value="semana-passada" ${periodoFiltro === "semana-passada" ? "selected" : ""}>Semana passada</option>
          <option value="mes" ${periodoFiltro === "mes" ? "selected" : ""}>Este mês</option>
          <option value="personalizado" ${periodoFiltro === "personalizado" ? "selected" : ""}>Personalizado</option>
        </select>
      </div>
    </div>
    ${
      periodoFiltro === "personalizado"
        ? `<div class="stat-row">
            <div class="form-field"><label>De</label><input type="date" id="fiado-periodo-start" value="${customStart || toDateKey(new Date())}"/></div>
            <div class="form-field"><label>Até</label><input type="date" id="fiado-periodo-end" value="${customEnd || toDateKey(new Date())}"/></div>
          </div>`
        : ""
    }

    <div class="form-field">
      <label for="fiado-ordenacao">Ordenar por</label>
      <select id="fiado-ordenacao">
        <option value="previsao-proxima" ${ordenacao === "previsao-proxima" ? "selected" : ""}>Data prevista (mais próxima)</option>
        <option value="venda-recente" ${ordenacao === "venda-recente" ? "selected" : ""}>Data da venda (mais recentes)</option>
        <option value="venda-antiga" ${ordenacao === "venda-antiga" ? "selected" : ""}>Data da venda (mais antigas)</option>
        <option value="valor" ${ordenacao === "valor" ? "selected" : ""}>Valor (maior primeiro)</option>
        <option value="status" ${ordenacao === "status" ? "selected" : ""}>Status</option>
        <option value="cliente-az" ${ordenacao === "cliente-az" ? "selected" : ""}>Cliente A-Z</option>
        <option value="cliente-za" ${ordenacao === "cliente-za" ? "selected" : ""}>Cliente Z-A</option>
      </select>
    </div>

    <ul class="list">
      ${
        vendasFiado.length === 0
          ? `<li class="empty-state">Nenhuma venda fiado encontrada com esses filtros.</li>`
          : vendasFiado
              .map((v) => {
                const cliente = getCliente(v.clienteId);
                const badge = getStatusPagamento(v);
                const atrasada = isVendaAtrasada(v);
                const pendente = v.status !== "pago";
                const metaPartes = [`Venda: ${formatDateShort(v.data)}`];
                if (v.dataPrevisaoPagamento) metaPartes.push(`Previsto: ${formatDateOnly(v.dataPrevisaoPagamento)}`);
                if (v.dataPagamento) metaPartes.push(`Pago em: ${formatDateShort(v.dataPagamento)}`);
                if (v.status === "parcial") metaPartes.push(`já pago ${formatCurrency(v.valorPago)}`);
                return `
                <li class="list-item fiado-item" data-venda-id="${v.id}">
                  <div class="list-item__main" data-action="abrir-cliente">
                    <strong>${cliente ? cliente.nome : "Cliente"}</strong>
                    <span class="list-item__meta">${metaPartes.join(" · ")}</span>
                  </div>
                  <div class="list-item__side">
                    <span class="list-item__value">${formatCurrency(v.valorTotal)}</span>
                    <span class="badge">${badge.emoji} ${badge.label}</span>
                    ${atrasada ? `<span class="badge badge--danger">⏰ Atrasado</span>` : ""}
                    ${
                      pendente
                        ? `<div class="fiado-item__actions">
                            <button class="btn btn--small btn--secondary" data-action="editar-previsao">✏️ Previsão</button>
                            <button class="btn btn--small btn--primary" data-action="marcar-pago">✅ Pago</button>
                          </div>`
                        : ""
                    }
                  </div>
                </li>`;
              })
              .join("")
      }
    </ul>
  `;

  document.getElementById("fiado-filtro-cliente").addEventListener("change", (e) => {
    ui.fiado.clienteFiltro = e.target.value;
    renderFiado();
  });
  document.getElementById("fiado-filtro-status").addEventListener("change", (e) => {
    ui.fiado.statusFiltro = e.target.value;
    renderFiado();
  });
  document.getElementById("fiado-filtro-periodo").addEventListener("change", (e) => {
    ui.fiado.periodoFiltro = e.target.value;
    renderFiado();
  });
  const periodoStartInput = document.getElementById("fiado-periodo-start");
  const periodoEndInput = document.getElementById("fiado-periodo-end");
  if (periodoStartInput && periodoEndInput) {
    periodoStartInput.addEventListener("change", (e) => {
      ui.fiado.customStart = e.target.value;
      renderFiado();
    });
    periodoEndInput.addEventListener("change", (e) => {
      ui.fiado.customEnd = e.target.value;
      renderFiado();
    });
  }
  document.getElementById("fiado-ordenacao").addEventListener("change", (e) => {
    ui.fiado.ordenacao = e.target.value;
    renderFiado();
  });

  el.querySelectorAll(".fiado-item").forEach((item) => {
    const venda = db.vendas.find((v) => v.id === item.dataset.vendaId);
    if (!venda) return;
    item.querySelector('[data-action="abrir-cliente"]')?.addEventListener("click", () => abrirPerfilCliente(venda.clienteId));
    item.querySelector('[data-action="marcar-pago"]')?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      abrirFormMarcarPago(venda);
    });
    item.querySelector('[data-action="editar-previsao"]')?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      abrirFormPrevisao(venda);
    });
  });
}

function abrirFormMarcarPago(venda) {
  const cliente = getCliente(venda.clienteId);
  openPrompt({
    title: "✅ Marcar como pago",
    fields: [
      {
        id: "forma",
        label: `${cliente ? cliente.nome : "Cliente"} — ${formatCurrency(venda.valorRestante)}. Forma de pagamento`,
        type: "select",
        options: [
          { value: "pix", label: "PIX" },
          { value: "dinheiro", label: "Dinheiro" },
          { value: "debito", label: "Débito" },
          { value: "credito", label: "Crédito" },
        ],
      },
    ],
    confirmText: "Confirmar",
    onSubmit: (values) => {
      marcarVendaComoPaga(venda.id, values.forma);
      showToast("🟢 Fiado - Pago!");
      renderFiado();
    },
  });
}

function abrirFormPrevisao(venda) {
  openPrompt({
    title: "Data prevista de pagamento",
    fields: [{ id: "data", label: "Nova data prevista", type: "date", value: venda.dataPrevisaoPagamento || toDateKey(new Date()) }],
    confirmText: "Salvar",
    onSubmit: (values) => {
      editarPrevisaoPagamento(venda.id, values.data);
      showToast("Data prevista atualizada!");
      renderFiado();
    },
  });
}

/* ==========================================================================
   16. RENDERIZAÇÃO — ESTOQUE
   ========================================================================== */

function renderEstoque() {
  const el = document.getElementById("view-estoque");

  el.innerHTML = `
    <h2 class="view-title">📦 Estoque</h2>
    <ul class="list">
      ${db.estoque
        .map((e) => {
          const produto = getProduto(e.produtoId);
          const baixo = e.quantidadeAtual < e.estoqueMinimo;
          return `
          <li class="stock-card ${baixo ? "stock-card--baixo" : ""}">
            <div class="stock-card__header">
              <span>${produto.icon} ${produto.nome}</span>
              ${baixo ? `<span class="badge badge--danger">⚠️ ESTOQUE BAIXO</span>` : ""}
            </div>
            <p class="stock-card__qty">Estoque atual: <strong>${e.quantidadeAtual}</strong> <span class="stock-card__min">(mín. ${e.estoqueMinimo})</span></p>
            <div class="stock-card__actions">
              <button class="btn btn--small btn--secondary" data-action="entrada" data-produto="${e.produtoId}">➕ Entrada</button>
              <button class="btn btn--small btn--secondary" data-action="saida" data-produto="${e.produtoId}">➖ Saída</button>
              <button class="btn btn--small btn--secondary" data-action="ajuste" data-produto="${e.produtoId}">🔄 Ajustar</button>
              <button class="btn btn--small btn--ghost" data-action="minimo" data-produto="${e.produtoId}">Editar mínimo</button>
            </div>
          </li>`;
        })
        .join("")}
    </ul>
  `;

  el.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleEstoqueAction(btn.dataset.action, btn.dataset.produto));
  });
}

function handleEstoqueAction(acao, produtoId) {
  const produto = getProduto(produtoId);
  const registro = getEstoque(produtoId);

  if (acao === "minimo") {
    openPrompt({
      title: `Editar mínimo — ${produto.nome}`,
      fields: [{ id: "minimo", label: "Estoque mínimo", type: "number", inputmode: "numeric", value: registro.estoqueMinimo }],
      confirmText: "Salvar",
      onSubmit: (values) => {
        editarEstoqueMinimo(produtoId, Math.round(values.minimo));
        showToast("Estoque mínimo atualizado!");
        renderEstoque();
      },
    });
    return;
  }

  const titulos = { entrada: "➕ Entrada de estoque", saida: "➖ Saída manual", ajuste: "🔄 Ajustar estoque" };
  const labelQtd = acao === "ajuste" ? "Nova quantidade atual" : "Quantidade";

  openPrompt({
    title: `${titulos[acao]} — ${produto.nome}`,
    fields: [{ id: "quantidade", label: labelQtd, type: "number", inputmode: "numeric", value: acao === "ajuste" ? registro.quantidadeAtual : "" }],
    confirmText: "Confirmar",
    onSubmit: (values) => {
      const quantidade = Math.round(values.quantidade);
      if (quantidade < 0) {
        showToast("Informe um valor válido.");
        return;
      }
      ajustarEstoque(produtoId, acao, quantidade);
      showToast("Estoque atualizado!");
      renderEstoque();
    },
  });
}

/* ==========================================================================
   17. RELATÓRIO (overlay)
   ========================================================================== */

function renderRelatorio() {
  const el = document.getElementById("overlay-relatorio");
  const { filtro, customStart, customEnd, clienteFiltro, statusFiltro } = ui.relatorio;
  const relatorio = gerarRelatorio(filtro, customStart, customEnd, { clienteId: clienteFiltro || null, status: statusFiltro || null });
  const clientesOrdenados = [...db.clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  el.innerHTML = `
    <div class="overlay__header">
      <button class="icon-btn" data-action="fechar-relatorio">←</button>
      <h2>📊 Relatório</h2>
      <span></span>
    </div>
    <div class="overlay__body">
      <div class="form-field">
        <label for="relatorio-filtro">Período</label>
        <select id="relatorio-filtro">
          <option value="hoje" ${filtro === "hoje" ? "selected" : ""}>Hoje</option>
          <option value="ontem" ${filtro === "ontem" ? "selected" : ""}>Ontem</option>
          <option value="esta-semana" ${filtro === "esta-semana" ? "selected" : ""}>Esta semana</option>
          <option value="semana-passada" ${filtro === "semana-passada" ? "selected" : ""}>Semana passada</option>
          <option value="7dias" ${filtro === "7dias" ? "selected" : ""}>Últimos 7 dias</option>
          <option value="mes" ${filtro === "mes" ? "selected" : ""}>Este mês</option>
          <option value="personalizado" ${filtro === "personalizado" ? "selected" : ""}>Período personalizado</option>
        </select>
      </div>
      ${
        filtro === "personalizado"
          ? `<div class="stat-row">
              <div class="form-field"><label>De</label><input type="date" id="relatorio-start" value="${customStart || toDateKey(new Date())}"/></div>
              <div class="form-field"><label>Até</label><input type="date" id="relatorio-end" value="${customEnd || toDateKey(new Date())}"/></div>
            </div>`
          : ""
      }

      <div class="stat-row">
        <div class="form-field">
          <label for="relatorio-cliente">Cliente</label>
          <select id="relatorio-cliente">
            <option value="">Todos os clientes</option>
            ${clientesOrdenados.map((c) => `<option value="${c.id}" ${clienteFiltro === c.id ? "selected" : ""}>${c.nome}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label for="relatorio-status">Status</label>
          <select id="relatorio-status">
            <option value="" ${statusFiltro === "" ? "selected" : ""}>Todos</option>
            <option value="AVISTA" ${statusFiltro === "AVISTA" ? "selected" : ""}>À Vista</option>
            <option value="FIADO_PENDENTE" ${statusFiltro === "FIADO_PENDENTE" ? "selected" : ""}>Fiado - Pendente</option>
            <option value="FIADO_PAGO" ${statusFiltro === "FIADO_PAGO" ? "selected" : ""}>Fiado - Pago</option>
          </select>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-box"><span>Vendas</span><strong>${relatorio.quantidadeVendas}</strong></div>
        <div class="stat-box"><span>Faturamento</span><strong>${formatCurrency(relatorio.faturamentoTotal)}</strong></div>
      </div>
      <div class="stat-row">
        <div class="stat-box"><span>🥟 Salgados</span><strong>${relatorio.salgados}</strong></div>
        <div class="stat-box"><span>🥤 Refrigerantes</span><strong>${relatorio.refrigerantes}</strong></div>
        <div class="stat-box"><span>🍫 Trufas</span><strong>${relatorio.trufas}</strong></div>
      </div>

      <h4 class="section-subtitle">Financeiro</h4>
      <ul class="stat-list">
        <li><span>Valor recebido</span><strong>${formatCurrency(relatorio.valorRecebido)}</strong></li>
        <li><span>Valor vendido fiado</span><strong>${formatCurrency(relatorio.valorFiado)}</strong></li>
        <li><span>Ainda a receber (período)</span><strong>${formatCurrency(relatorio.valorAindaAReceber)}</strong></li>
      </ul>

      <h4 class="section-subtitle">Formas de pagamento</h4>
      <ul class="stat-list">
        <li><span>📱 PIX</span><strong>${formatCurrency(relatorio.formasPagamento.pix)}</strong></li>
        <li><span>💵 Dinheiro</span><strong>${formatCurrency(relatorio.formasPagamento.dinheiro)}</strong></li>
        <li><span>💳 Débito</span><strong>${formatCurrency(relatorio.formasPagamento.debito)}</strong></li>
        <li><span>💳 Crédito</span><strong>${formatCurrency(relatorio.formasPagamento.credito)}</strong></li>
        <li><span>🔵 Fiado</span><strong>${formatCurrency(relatorio.valorFiado)}</strong></li>
      </ul>

      <h4 class="section-subtitle">Histórico de vendas (${relatorio.vendas.length})</h4>
      <ul class="list">
        ${
          relatorio.vendas.length === 0
            ? `<li class="empty-state">Nenhuma venda encontrada com esses filtros.</li>`
            : relatorio.vendas
                .map((v) => {
                  const cliente = getCliente(v.clienteId);
                  const badge = getStatusPagamento(v);
                  const itens = getItensDeVenda(v.id).map((i) => `${getProduto(i.produtoId).nome} x${i.quantidade}`).join(", ");
                  const metaPartes = [itens, `Venda: ${formatDateTime(v.data)}`];
                  if (v.dataPrevisaoPagamento) metaPartes.push(`Previsto: ${formatDateOnly(v.dataPrevisaoPagamento)}`);
                  if (v.dataPagamento) metaPartes.push(`Pago em: ${formatDateTime(v.dataPagamento)}`);
                  return `<li class="list-item">
                    <div class="list-item__main"><strong>${cliente ? cliente.nome : "Cliente"}</strong><span class="list-item__meta">${metaPartes.join(" · ")}</span></div>
                    <div class="list-item__side"><span class="list-item__value">${formatCurrency(v.valorTotal)}</span><span class="badge">${badge.emoji} ${badge.label}</span></div>
                  </li>`;
                })
                .join("")
        }
      </ul>
    </div>
  `;

  el.querySelector('[data-action="fechar-relatorio"]').addEventListener("click", () => closeOverlay("overlay-relatorio"));
  document.getElementById("relatorio-filtro").addEventListener("change", (e) => {
    ui.relatorio.filtro = e.target.value;
    renderRelatorio();
  });
  document.getElementById("relatorio-cliente").addEventListener("change", (e) => {
    ui.relatorio.clienteFiltro = e.target.value;
    renderRelatorio();
  });
  document.getElementById("relatorio-status").addEventListener("change", (e) => {
    ui.relatorio.statusFiltro = e.target.value;
    renderRelatorio();
  });
  const startInput = document.getElementById("relatorio-start");
  const endInput = document.getElementById("relatorio-end");
  if (startInput && endInput) {
    startInput.addEventListener("change", (e) => {
      ui.relatorio.customStart = e.target.value;
      renderRelatorio();
    });
    endInput.addEventListener("change", (e) => {
      ui.relatorio.customEnd = e.target.value;
      renderRelatorio();
    });
  }
}

/* ==========================================================================
   18. CONFIGURAÇÕES
   ========================================================================== */

function renderConfiguracoes() {
  const el = document.getElementById("overlay-configuracoes");
  const c = db.configuracoes;

  el.innerHTML = `
    <div class="overlay__header">
      <button class="icon-btn" data-action="fechar-config">←</button>
      <h2>⚙️ Configurações</h2>
      <span></span>
    </div>
    <div class="overlay__body">
      <div class="form-field"><label>Nome do negócio</label><input id="cfg-nome" type="text" value="${c.nomeNegocio}" /></div>
      <div class="form-field"><label>Preço do salgado</label><input id="cfg-salgado" type="number" step="0.01" inputmode="decimal" value="${c.precoSalgado}" /></div>
      <div class="form-field"><label>Preço do refrigerante</label><input id="cfg-refrigerante" type="number" step="0.01" inputmode="decimal" value="${c.precoRefrigerante}" /></div>
      <div class="form-field"><label>Preço da trufa (unidade)</label><input id="cfg-trufa" type="number" step="0.01" inputmode="decimal" value="${c.precoTrufa}" /></div>
      <div class="form-field"><label>Preço do kit com 4 trufas</label><input id="cfg-kit4" type="number" step="0.01" inputmode="decimal" value="${c.precoKit4Trufas}" /></div>
      <div class="form-field"><label>Meta diária de salgados</label><input id="cfg-meta" type="number" inputmode="numeric" value="${c.metaDiaria}" /></div>
      <div class="form-field"><label>Estoque mínimo (Salgado)</label><input id="cfg-min-salgado" type="number" inputmode="numeric" value="${c.estoqueMinimoSalgado}" /></div>
      <button class="btn btn--primary btn--block" id="cfg-salvar-btn">Salvar configurações</button>

      <h4 class="section-subtitle">📊 Planilha do Google (opcional)</h4>
      <p class="field-hint">
        Cole aqui a URL do "App da Web" do Apps Script para os dados ficarem salvos numa
        planilha do Google, compartilhada entre todos os aparelhos. Deixe em branco para
        usar apenas o armazenamento local deste aparelho.
      </p>
      <div class="form-field">
        <label>URL da planilha (Apps Script)</label>
        <input id="cfg-api-url" type="url" placeholder="https://script.google.com/macros/s/.../exec" value="${apiUrl}" />
      </div>
      <button class="btn btn--secondary btn--block" id="cfg-api-salvar-btn">Salvar e conectar</button>
      ${apiUrl ? `<button class="btn btn--secondary btn--block" id="cfg-api-sync-btn">🔄 Sincronizar agora</button>` : ""}

      <h4 class="section-subtitle">Segurança dos dados</h4>
      <button class="btn btn--secondary btn--block" id="cfg-exportar-btn">📤 Exportar dados</button>
      <label class="btn btn--secondary btn--block" for="cfg-importar-input">📥 Importar dados</label>
      <input type="file" id="cfg-importar-input" accept="application/json" class="hidden-input" />
      <button class="btn btn--danger btn--block" id="cfg-apagar-btn">⚠️ Apagar todos os dados</button>
    </div>
  `;

  el.querySelector('[data-action="fechar-config"]').addEventListener("click", () => closeOverlay("overlay-configuracoes"));
  document.getElementById("cfg-salvar-btn").addEventListener("click", () => {
    salvarConfiguracoes({
      nomeNegocio: document.getElementById("cfg-nome").value.trim() || "Cowboy Salgados",
      precoSalgado: parseFloat(document.getElementById("cfg-salgado").value) || 0,
      precoRefrigerante: parseFloat(document.getElementById("cfg-refrigerante").value) || 0,
      precoTrufa: parseFloat(document.getElementById("cfg-trufa").value) || 0,
      precoKit4Trufas: parseFloat(document.getElementById("cfg-kit4").value) || 0,
      metaDiaria: Math.round(parseFloat(document.getElementById("cfg-meta").value)) || 1,
      estoqueMinimoSalgado: Math.round(parseFloat(document.getElementById("cfg-min-salgado").value)) || 0,
    });
    showToast("Configurações salvas!");
    renderView(ui.viewAtual);
  });

  document.getElementById("cfg-api-salvar-btn").addEventListener("click", () => {
    const url = document.getElementById("cfg-api-url").value.trim();
    saveApiUrl(url);
    if (url) {
      showToast("Conectando à planilha...");
      syncFromRemote();
    } else {
      setSyncStatus("offline");
      showToast("Planilha desconectada. Usando apenas os dados deste aparelho.");
    }
    renderConfiguracoes();
  });
  const syncBtn = document.getElementById("cfg-api-sync-btn");
  if (syncBtn) syncBtn.addEventListener("click", () => syncFromRemote());

  document.getElementById("cfg-exportar-btn").addEventListener("click", exportarDados);
  document.getElementById("cfg-importar-input").addEventListener("change", (e) => {
    if (e.target.files[0]) importarDados(e.target.files[0]);
  });
  document.getElementById("cfg-apagar-btn").addEventListener("click", confirmarApagarTudo);
}

function exportarDados() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cowboy-salgados-backup-${toDateKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Dados exportados!");
}

function importarDados(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const novosDados = JSON.parse(reader.result);
      const chavesEsperadas = ["clientes", "produtos", "vendas", "itensVenda", "pagamentos", "estoque", "configuracoes"];
      const valido = chavesEsperadas.every((k) => k in novosDados);
      if (!valido) throw new Error("Arquivo em formato inválido.");

      openConfirm({
        title: "Importar dados",
        message: "Isso substituirá todos os dados atuais pelos dados do arquivo importado. Deseja continuar?",
        confirmText: "Importar",
        danger: true,
        onConfirm: () => {
          db = novosDados;
          saveDB();
          showToast("Dados importados com sucesso!");
          closeOverlay("overlay-configuracoes");
          switchView("inicio");
        },
      });
    } catch (err) {
      showToast("Não foi possível importar: arquivo inválido.");
    }
  };
  reader.readAsText(file);
}

function confirmarApagarTudo() {
  openConfirm({
    title: "⚠️ Apagar todos os dados",
    message: "Essa ação apagará clientes, vendas, pagamentos e histórico. Deseja continuar?",
    confirmText: "Continuar",
    danger: true,
    onConfirm: () => {
      openConfirm({
        title: "Tem certeza absoluta?",
        message: apiUrl
          ? "Essa ação NÃO pode ser desfeita e também vai limpar a planilha conectada."
          : "Essa ação NÃO pode ser desfeita. Os dados de exemplo iniciais serão restaurados.",
        confirmText: "Apagar tudo",
        danger: true,
        onConfirm: () => {
          resetToSeed();
          showToast("Todos os dados foram apagados.");
          closeOverlay("overlay-configuracoes");
          switchView("inicio");
          if (apiUrl) {
            apiPost("resetAll", {})
              .then(() => syncFromRemote({ silent: true }))
              .catch(() => setSyncStatus("offline"));
          }
        },
      });
    },
  });
}

/* ==========================================================================
   19. FLUXO DE NOVA VENDA (overlay em etapas)
   ========================================================================== */

function startNovaVenda() {
  resetNovaVendaState();
  renderNovaVenda();
  openOverlay("overlay-nova-venda");
}

function fecharNovaVenda() {
  closeOverlay("overlay-nova-venda");
  renderView(ui.viewAtual);
}

function calcularCarrinho() {
  const itens = Object.entries(ui.novaVenda.itens)
    .filter(([, qtd]) => qtd > 0)
    .map(([produtoId, quantidade]) => {
      const produto = getProduto(produtoId);
      return { produtoId, produto, quantidade, valorTotal: calcularValorItem(produto, quantidade) };
    });
  const total = itens.reduce((sum, i) => sum + i.valorTotal, 0);
  return { itens, total };
}

function renderNovaVenda() {
  const step = ui.novaVenda.step;
  if (step === 1) renderPassoCliente();
  else if (step === 2) renderPassoProdutos();
  else if (step === 3) renderPassoPagamento();
}

function stepHeader(titulo, mostrarVoltar) {
  return `
    <div class="overlay__header">
      ${mostrarVoltar ? `<button class="icon-btn" data-action="voltar-venda">←</button>` : `<button class="icon-btn" data-action="cancelar-venda">✕</button>`}
      <h2>${titulo}</h2>
      <span class="step-indicator">${ui.novaVenda.step}/3</span>
    </div>
  `;
}

// Passo 1 — selecionar cliente
function renderPassoCliente() {
  const el = document.getElementById("overlay-nova-venda");
  const lista = filtrarClientes(ui.novaVenda.buscaCliente);

  el.innerHTML = `
    ${stepHeader("Selecionar cliente", false)}
    <div class="overlay__body">
      <input type="search" id="venda-busca-cliente" class="search-input" placeholder="Buscar por nome ou telefone" value="${ui.novaVenda.buscaCliente}" />
      <button class="btn btn--secondary btn--block" id="venda-novo-cliente-btn">+ Novo cliente</button>
      <ul class="list">
        ${lista
          .map((c) => {
            const saldo = calcularSaldoCliente(c.id);
            return `<li class="list-item" data-cliente-id="${c.id}">
              <div class="list-item__main"><strong>${c.nome}</strong><span class="list-item__meta">📱 ${formatPhone(c.telefone)}</span></div>
              <div class="list-item__side">${saldo > 0 ? `<span class="badge">🔴 ${formatCurrency(saldo)}</span>` : ""}</div>
            </li>`;
          })
          .join("")}
      </ul>
    </div>
  `;

  el.querySelector('[data-action="cancelar-venda"]').addEventListener("click", fecharNovaVenda);
  document.getElementById("venda-busca-cliente").addEventListener("input", (e) => {
    ui.novaVenda.buscaCliente = e.target.value;
    renderPassoCliente();
  });
  document.getElementById("venda-novo-cliente-btn").addEventListener("click", () => {
    abrirFormNovoCliente((cliente) => {
      ui.novaVenda.clienteId = cliente.id;
      ui.novaVenda.step = 2;
      renderNovaVenda();
    });
  });
  el.querySelectorAll("[data-cliente-id]").forEach((item) => {
    item.addEventListener("click", () => {
      ui.novaVenda.clienteId = item.dataset.clienteId;
      ui.novaVenda.step = 2;
      renderNovaVenda();
    });
  });
}

// Passo 2 — adicionar produtos ao carrinho
function renderPassoProdutos() {
  const el = document.getElementById("overlay-nova-venda");
  const cliente = getCliente(ui.novaVenda.clienteId);
  const { itens, total } = calcularCarrinho();

  el.innerHTML = `
    ${stepHeader("Adicionar produtos", true)}
    <div class="overlay__body">
      <p class="selected-cliente">Cliente: <strong>${cliente.nome}</strong></p>

      <div class="product-list">
        ${db.produtos
          .map((p) => {
            const qtd = ui.novaVenda.itens[p.id] || 0;
            const promo = p.tipo === "trufa" && qtd >= 4;
            return `
            <div class="product-card">
              <div class="product-card__info">
                <span class="product-card__name">${p.icon} ${p.nome}</span>
                <span class="product-card__price">${formatCurrency(precoUnitario(p))} / un ${p.tipo === "trufa" ? `· kit 4 = ${formatCurrency(db.configuracoes.precoKit4Trufas)}` : ""}</span>
              </div>
              <div class="stepper">
                <button class="stepper__btn" data-action="menos" data-produto="${p.id}">−</button>
                <span class="stepper__value">${qtd}</span>
                <button class="stepper__btn" data-action="mais" data-produto="${p.id}">+</button>
              </div>
              ${promo ? `<span class="promo-tag">🎁 Promoção aplicada</span>` : ""}
            </div>`;
          })
          .join("")}
      </div>

      <h4 class="section-subtitle">Carrinho</h4>
      <ul class="cart-list">
        ${
          itens.length === 0
            ? `<li class="empty-state">Nenhum produto adicionado.</li>`
            : itens.map((i) => `<li class="cart-item"><span>${i.produto.nome} x ${i.quantidade}</span><strong>${formatCurrency(i.valorTotal)}</strong></li>`).join("")
        }
      </ul>
      <div class="cart-total"><span>Total</span><strong>${formatCurrency(total)}</strong></div>

      <button class="btn btn--primary btn--block btn--xl" id="venda-avancar-pagamento-btn" ${total <= 0 ? "disabled" : ""}>Avançar</button>
    </div>
  `;

  el.querySelector('[data-action="voltar-venda"]').addEventListener("click", () => {
    ui.novaVenda.step = 1;
    renderNovaVenda();
  });
  el.querySelectorAll("[data-action='mais'], [data-action='menos']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const produtoId = btn.dataset.produto;
      const atual = ui.novaVenda.itens[produtoId] || 0;
      const novo = btn.dataset.action === "mais" ? atual + 1 : Math.max(0, atual - 1);
      ui.novaVenda.itens[produtoId] = novo;
      renderPassoProdutos();
    });
  });
  const avancarBtn = document.getElementById("venda-avancar-pagamento-btn");
  if (avancarBtn) {
    avancarBtn.addEventListener("click", () => {
      ui.novaVenda.step = 3;
      renderNovaVenda();
    });
  }
}

// Passo 3 — forma de pagamento e confirmação
function renderPassoPagamento() {
  const el = document.getElementById("overlay-nova-venda");
  const cliente = getCliente(ui.novaVenda.clienteId);
  const { itens, total } = calcularCarrinho();
  const forma = ui.novaVenda.formaPagamento;
  const metodo = ui.novaVenda.metodoVista;

  if (forma === "fiado" && !ui.novaVenda.dataPrevisaoPagamento) {
    ui.novaVenda.dataPrevisaoPagamento = toDateKey(addDays(new Date(), 7));
  }

  const podeConfirmar = forma === "fiado" || (forma === "vista" && metodo);

  el.innerHTML = `
    ${stepHeader("Forma de pagamento", true)}
    <div class="overlay__body">
      <p class="selected-cliente">Cliente: <strong>${cliente.nome}</strong></p>
      <ul class="cart-list">
        ${itens.map((i) => `<li class="cart-item"><span>${i.produto.nome} x ${i.quantidade}</span><strong>${formatCurrency(i.valorTotal)}</strong></li>`).join("")}
      </ul>
      <div class="cart-total"><span>Total</span><strong>${formatCurrency(total)}</strong></div>

      <div class="payment-options">
        <button class="btn ${forma === "vista" ? "btn--primary" : "btn--secondary"} btn--block btn--xl" data-action="forma-vista">À VISTA</button>
        <button class="btn ${forma === "fiado" ? "btn--primary" : "btn--secondary"} btn--block btn--xl" data-action="forma-fiado">PAGAR DEPOIS (FIADO)</button>
      </div>

      ${
        forma === "vista"
          ? `<div class="payment-methods">
              ${FORMAS_PAGAMENTO_VISTA.map((m) => `<button class="btn ${metodo === m.id ? "btn--primary" : "btn--secondary"}" data-action="metodo" data-metodo="${m.id}">${m.icon} ${m.label}</button>`).join("")}
            </div>`
          : ""
      }

      ${
        forma === "fiado"
          ? `<div class="form-field">
              <label for="venda-data-previsao">Data prevista de pagamento</label>
              <input type="date" id="venda-data-previsao" value="${ui.novaVenda.dataPrevisaoPagamento}" />
            </div>
            <p class="fiado-note">🔵 Esta venda será registrada como fiado na conta de <strong>${cliente.nome}</strong>.</p>`
          : ""
      }

      <button class="btn btn--primary btn--block btn--xl" id="venda-confirmar-btn" ${podeConfirmar ? "" : "disabled"}>Confirmar venda ✅</button>
    </div>
  `;

  el.querySelector('[data-action="voltar-venda"]').addEventListener("click", () => {
    ui.novaVenda.step = 2;
    renderNovaVenda();
  });
  el.querySelector('[data-action="forma-vista"]').addEventListener("click", () => {
    ui.novaVenda.formaPagamento = "vista";
    renderPassoPagamento();
  });
  el.querySelector('[data-action="forma-fiado"]').addEventListener("click", () => {
    ui.novaVenda.formaPagamento = "fiado";
    ui.novaVenda.metodoVista = null;
    renderPassoPagamento();
  });
  el.querySelectorAll('[data-action="metodo"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.novaVenda.metodoVista = btn.dataset.metodo;
      renderPassoPagamento();
    });
  });
  const previsaoInput = document.getElementById("venda-data-previsao");
  if (previsaoInput) {
    previsaoInput.addEventListener("change", (e) => {
      ui.novaVenda.dataPrevisaoPagamento = e.target.value;
    });
  }
  const confirmarBtn = document.getElementById("venda-confirmar-btn");
  if (confirmarBtn) {
    confirmarBtn.addEventListener("click", confirmarNovaVenda);
  }
}

function confirmarNovaVenda() {
  const { itens, total } = calcularCarrinho();
  if (total <= 0) return;

  const formaPagamentoFinal = ui.novaVenda.formaPagamento === "fiado" ? "fiado" : ui.novaVenda.metodoVista;

  registrarVenda({
    clienteId: ui.novaVenda.clienteId,
    itens: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
    formaPagamento: formaPagamentoFinal,
    dataPrevisaoPagamento: ui.novaVenda.formaPagamento === "fiado" ? ui.novaVenda.dataPrevisaoPagamento : null,
  });

  showToast(`Venda de ${formatCurrency(total)} registrada!`);
  fecharNovaVenda();
  switchView("venda");
}

/* ==========================================================================
   20. INICIALIZAÇÃO
   ========================================================================== */

function initEventListeners() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.getElementById("btn-settings").addEventListener("click", () => {
    renderConfiguracoes();
    openOverlay("overlay-configuracoes");
  });
  document.getElementById("sync-badge").addEventListener("click", () => {
    if (apiUrl) syncFromRemote();
  });
}

function init() {
  loadApiUrl();
  initDB();
  initEventListeners();
  switchView("inicio"); // renderiza imediatamente com os dados locais/em cache
  setSyncStatus(apiUrl ? "offline" : "offline");
  if (apiUrl) syncFromRemote({ silent: true }); // depois, atualiza em segundo plano com a planilha
}

document.addEventListener("DOMContentLoaded", init);
