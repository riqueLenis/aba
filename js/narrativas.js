const API_BASE = "https://aba-aos0.onrender.com";
const token = localStorage.getItem("psyhead-token");

try {
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed") === "1") {
    document.body.classList.add("embed");
  }
} catch {
  // ignore
}

if (!token) {
  window.location.href = "login.html";
}

const getAuthHeaders = (extra = {}) => ({
  Authorization: `Bearer ${token}`,
  ...extra,
});

let narrativasCache = [];

const viewLista = document.getElementById("viewLista");
const viewForm = document.getElementById("viewForm");
const btnNova = document.getElementById("btnNova");
const btnCancelar = document.getElementById("btnCancelar");
const narrativaForm = document.getElementById("narrativaForm");
const cardsEl = document.getElementById("cards");
const emptyEl = document.getElementById("empty");
const toastEl = document.getElementById("toast");

const filtroInicio = document.getElementById("filtroInicio");
const filtroFim = document.getElementById("filtroFim");
const filtroBusca = document.getElementById("filtroBusca");

const narrativaIdEl = document.getElementById("narrativaId");
const dataEl = document.getElementById("data");
const duracaoEl = document.getElementById("duracao");
const intensidadeEl = document.getElementById("intensidade");
const aprendizEl = document.getElementById("aprendiz");
const aprendizOutroEl = document.getElementById("aprendizOutro");
const localEl = document.getElementById("local");
const antecedenteEl = document.getElementById("antecedente");
const comportamentoEl = document.getElementById("comportamento");
const consequenciasEl = document.getElementById("consequencias");
const observacoesEl = document.getElementById("observacoes");

const showToast = (message) => {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2200);
};

const fetchNarrativas = async () => {
  const inicio = filtroInicio?.value;
  const fim = filtroFim?.value;
  const busca = String(filtroBusca?.value || "").trim();

  const url = new URL(`${API_BASE}/api/narrativas-abc`);
  if (inicio) url.searchParams.set("inicio", inicio);
  if (fim) url.searchParams.set("fim", fim);
  if (busca) url.searchParams.set("busca", busca);

  const resp = await fetch(url.toString(), {
    headers: getAuthHeaders(),
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => "");
    throw new Error(msg || "Falha ao carregar narrativas.");
  }

  const data = await resp.json();
  narrativasCache = Array.isArray(data) ? data : [];
  render();
};

const fetchAprendizesFromPacientes = async () => {
  try {
    const resp = await fetch(`${API_BASE}/api/pacientes`, {
      headers: getAuthHeaders(),
    });
    if (!resp.ok) return;
    const pacientes = await resp.json();
    const nomes = (Array.isArray(pacientes) ? pacientes : [])
      .map((p) => String(p?.nome_completo || "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(nomes)).sort((a, b) =>
      a.localeCompare(b),
    );

    // preserva a opção "Selecione" e "Outro"
    const keep = [];
    Array.from(aprendizEl.options).forEach((o) => {
      if (o.value === "" || o.value === "Outro") keep.push(o);
    });

    aprendizEl.innerHTML = "";
    keep.forEach((o) => aprendizEl.appendChild(o));

    unique.forEach((nome) => {
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;

      const outroOpt = Array.from(aprendizEl.options).find(
        (o) => o.value === "Outro",
      );
      if (outroOpt) {
        aprendizEl.insertBefore(opt, outroOpt);
      } else {
        aprendizEl.appendChild(opt);
      }
    });
  } catch {
    // opcional
  }
};

const nowIsoLocal = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatPtBrDateTime = (iso) => {
  const d = toDate(iso);
  if (!d) return "-";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const initialsFromName = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (first + last).toUpperCase();
};

const clampText = (text, max = 70) => {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "-";
  return t.length > max ? `${t.slice(0, max)}...` : t;
};

const currentAprendiz = () => {
  const v = aprendizEl.value;
  if (v === "Outro") return aprendizOutroEl.value.trim();
  return v.trim();
};

const setMode = (mode) => {
  const isForm = mode === "form";
  viewForm.classList.toggle("hidden", !isForm);
  viewLista.classList.toggle("hidden", isForm);

  // Ao voltar para a lista (ex.: após salvar/cancelar), garante que o usuário
  // veja o botão "Nova Narrativa" mesmo com muitas narrativas e scroll.
  if (!isForm) {
    window.requestAnimationFrame(() => {
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        window.scrollTo(0, 0);
      }
      btnNova?.focus?.();
    });
  }
};

const resetForm = () => {
  narrativaIdEl.value = "";
  dataEl.value = nowIsoLocal();
  duracaoEl.value = "";
  intensidadeEl.value = "";
  aprendizEl.value = "";
  aprendizOutroEl.value = "";
  localEl.value = "";
  antecedenteEl.value = "";
  comportamentoEl.value = "";
  consequenciasEl.value = "";
  observacoesEl.value = "";
  updateAllCounters();
};

const getFilters = () => {
  const inicio = filtroInicio.value ? new Date(filtroInicio.value) : null;
  const fim = filtroFim.value ? new Date(filtroFim.value) : null;
  const q = String(filtroBusca.value || "")
    .trim()
    .toLowerCase();
  if (fim) {
    fim.setHours(23, 59, 59, 999);
  }
  return { inicio, fim, q };
};

const applyFilters = (items) => {
  const { inicio, fim, q } = getFilters();
  return items
    .filter((n) => {
      const d = toDate(n.data);
      if (inicio && d && d < inicio) return false;
      if (fim && d && d > fim) return false;
      if (q) {
        const hay = `${n.aprendiz} ${n.local} ${n.profissional}`
          .toLowerCase()
          .trim();
        return hay.includes(q);
      }
      return true;
    })
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
};

const iconEdit = () => `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
        </svg>
      `;

const iconEye = () => `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;

const iconDownload = () => `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      `;

const render = () => {
  const items = applyFilters(narrativasCache);
  cardsEl.innerHTML = "";

  emptyEl.classList.toggle("hidden", items.length !== 0);
  if (!items.length) return;

  items.forEach((n) => {
    const isActive = n.status === "ATIVO";
    const badgeClass = isActive ? "badge" : "badge inactive";
    const avatar = initialsFromName(n.aprendiz);

    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = n.id;
    card.innerHTML = `
            <div class="card-head">
              <div class="who">
                <div class="avatar">${avatar}</div>
                <div style="min-width:0">
                  <h3 title="${n.aprendiz}">${n.aprendiz}</h3>
                  <p>${n.local || "-"}</p>
                </div>
              </div>
              <span class="${badgeClass}">${isActive ? "ATIVO" : "INATIVO"}</span>
            </div>
            <div class="card-body">
              <div class="two-col">
                <div>
                  <div class="label">Local</div>
                  <div class="value">${n.local || "-"}</div>
                </div>
                <div>
                  <div class="label">Data</div>
                  <div class="value">${formatPtBrDateTime(n.data)}</div>
                </div>
              </div>

              <div class="narrativa-preview">
                <div>
                  <div class="label">Narrativa</div>
                  <div class="value">${clampText([n.antecedente, n.comportamento, n.consequencias].filter(Boolean).join(" "), 80)}</div>
                </div>
                <div>
                  <div class="label">Profissional</div>
                  <div class="value">${n.profissional || "-"}</div>
                </div>
              </div>
            </div>
            <div class="card-actions">
              <button class="action-btn" data-action="edit" type="button">
                ${iconEdit()} Editar
              </button>
              <button class="action-btn" data-action="toggle" type="button">
                ${iconEye()} ${isActive ? "Inativar" : "Ativar"}
              </button>
              <button class="action-btn" data-action="pdf" type="button">
                ${iconDownload()} Exportar PDF
              </button>
            </div>
          `;

    cardsEl.appendChild(card);
  });
};

const openNew = () => {
  resetForm();
  setMode("form");
  dataEl.focus();
};

const openEdit = (id) => {
  const found = narrativasCache.find((x) => String(x.id) === String(id));
  if (!found) return;

  narrativaIdEl.value = found.id;
  dataEl.value = String(found.data || "");
  duracaoEl.value = String(found.duracao || "");
  intensidadeEl.value =
    found.intensidade === null || found.intensidade === undefined
      ? ""
      : String(found.intensidade);

  // aprendiz
  const baseOptions = Array.from(aprendizEl.options)
    .map((o) => o.value)
    .filter(Boolean);
  if (baseOptions.includes(found.aprendiz)) {
    aprendizEl.value = found.aprendiz;
    aprendizOutroEl.value = "";
  } else {
    aprendizEl.value = "Outro";
    aprendizOutroEl.value = found.aprendiz;
  }

  localEl.value = String(found.local || "");
  antecedenteEl.value = String(found.antecedente || "");
  comportamentoEl.value = String(found.comportamento || "");
  consequenciasEl.value = String(found.consequencias || "");
  observacoesEl.value = String(found.observacoes || "");
  updateAllCounters();

  setMode("form");
  dataEl.focus();
};

const toggleStatus = async (id) => {
  const found = narrativasCache.find((x) => String(x.id) === String(id));
  if (!found) return;

  const nextStatus = found.status === "ATIVO" ? "INATIVO" : "ATIVO";

  try {
    const resp = await fetch(
      `${API_BASE}/api/narrativas-abc/${encodeURIComponent(id)}/status`,
      {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: nextStatus }),
      },
    );

    if (!resp.ok) {
      const msg = await resp.text().catch(() => "");
      throw new Error(msg || "Falha ao atualizar status.");
    }

    found.status = nextStatus;
    render();
    showToast(nextStatus === "ATIVO" ? "Narrativa ativada." : "Narrativa inativada.");
  } catch (e) {
    alert(e.message);
  }
};

const exportPdf = (id) => {
  const found = narrativasCache.find((x) => String(x.id) === String(id));
  if (!found) return;

  // Export simples via janela de impressão (usuário pode salvar como PDF)
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    alert("Não foi possível abrir a janela para exportar.");
    return;
  }

  const esc = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  w.document.write(`
          <!doctype html>
          <html lang="pt-BR">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Narrativa ABC - ${esc(found.aprendiz)}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
                h1 { margin: 0 0 6px; }
                .meta { color: #475569; margin-bottom: 18px; }
                .box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-top: 12px; }
                .label { font-weight: 800; margin-bottom: 6px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
                .kv .k { color: #64748b; font-size: 12px; }
                .kv .v { font-size: 14px; }
                @media print { button { display:none; } }
              </style>
            </head>
            <body>
              <h1>Narrativa ABC</h1>
              <div class="meta">
                <div><strong>Aprendiz:</strong> ${esc(found.aprendiz)}</div>
                <div><strong>Data:</strong> ${esc(formatPtBrDateTime(found.data))}</div>
              </div>

              <div class="box">
                <div class="grid">
                  <div class="kv"><div class="k">Local</div><div class="v">${esc(found.local)}</div></div>
                  <div class="kv"><div class="k">Duração</div><div class="v">${esc(found.duracao)}</div></div>
                  <div class="kv"><div class="k">Intensidade</div><div class="v">${esc(found.intensidade ?? "-")}</div></div>
                  <div class="kv"><div class="k">Status</div><div class="v">${esc(found.status)}</div></div>
                </div>
              </div>

              <div class="box"><div class="label">A - Antecedente</div><div>${esc(found.antecedente || "-")}</div></div>
              <div class="box"><div class="label">B - Comportamento</div><div>${esc(found.comportamento || "-")}</div></div>
              <div class="box"><div class="label">C - Consequências</div><div>${esc(found.consequencias || "-")}</div></div>
              <div class="box"><div class="label">Observações do Supervisor</div><div>${esc(found.observacoes || "-")}</div></div>

              <script>
                window.addEventListener('load', () => {
                  setTimeout(() => window.print(), 250);
                });
              <\/script>
            </body>
          </html>
        `);
  w.document.close();
};

const updateCounter = (textarea) => {
  const max = Number(textarea.getAttribute("maxlength")) || 4000;
  const used = String(textarea.value || "").length;
  const remaining = Math.max(0, max - used);
  const counter = document.querySelector(`[data-counter-for="${textarea.id}"]`);
  if (counter) counter.textContent = `${remaining}/${max} caracteres restantes`;
};

const updateAllCounters = () => {
  [antecedenteEl, comportamentoEl, consequenciasEl, observacoesEl].forEach(
    updateCounter,
  );
};

// Eventos
btnNova.addEventListener("click", openNew);
btnCancelar.addEventListener("click", () => {
  setMode("lista");
});

let filterDebounce;
if (filtroInicio) {
  filtroInicio.addEventListener("change", () => {
    fetchNarrativas().catch((e) => alert(e.message));
  });
}
if (filtroFim) {
  filtroFim.addEventListener("change", () => {
    fetchNarrativas().catch((e) => alert(e.message));
  });
}
if (filtroBusca) {
  filtroBusca.addEventListener("input", () => {
    render();
    window.clearTimeout(filterDebounce);
    filterDebounce = window.setTimeout(() => {
      fetchNarrativas().catch(() => {
        // silêncio: já mostramos filtragem local
      });
    }, 250);
  });
}

aprendizEl.addEventListener("change", () => {
  const isOutro = aprendizEl.value === "Outro";
  aprendizOutroEl.disabled = !isOutro;
  aprendizOutroEl.placeholder = isOutro ? "Digite o nome do aprendiz" : "";
  if (!isOutro) aprendizOutroEl.value = "";
});
aprendizOutroEl.disabled = true;

[antecedenteEl, comportamentoEl, consequenciasEl, observacoesEl].forEach((t) =>
  t.addEventListener("input", () => updateCounter(t)),
);

cardsEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const card = event.target.closest(".card");
  if (!card) return;
  const id = card.dataset.id;
  const action = btn.dataset.action;

  if (action === "edit") {
    openEdit(id);
    return;
  }
  if (action === "toggle") {
    toggleStatus(id);
    return;
  }
  if (action === "pdf") {
    exportPdf(id);
  }
});

narrativaForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const aprendiz = currentAprendiz();
  const data = String(dataEl.value || "").trim();
  const duracao = String(duracaoEl.value || "").trim();
  const local = String(localEl.value || "").trim();

  if (!data || !duracao || !aprendiz || !local) {
    alert("Preencha os campos obrigatórios: Data, Duração, Aprendiz e Local.");
    return;
  }

  const intensidadeRaw = String(intensidadeEl.value || "").trim();
  const intensidade = intensidadeRaw === "" ? null : Number(intensidadeRaw);

  const payload = {
    data,
    duracao,
    aprendiz,
    local,
    intensidade,
    antecedente: antecedenteEl.value,
    comportamento: comportamentoEl.value,
    consequencias: consequenciasEl.value,
    observacoes: observacoesEl.value,
    profissional: localStorage.getItem("terapeuta-nome") || "Profissional",
  };

  const id = String(narrativaIdEl.value || "").trim();
  const method = id ? "PUT" : "POST";
  const url = id
    ? `${API_BASE}/api/narrativas-abc/${encodeURIComponent(id)}`
    : `${API_BASE}/api/narrativas-abc`;

  fetch(url, {
    method,
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  })
    .then(async (resp) => {
      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        throw new Error(msg || "Falha ao salvar narrativa.");
      }
      return resp.json().catch(() => ({}));
    })
    .then(() => {
      showToast(id ? "Narrativa atualizada." : "Narrativa salva.");
      setMode("lista");
      fetchNarrativas().catch((e) => alert(e.message));
    })
    .catch((e) => alert(e.message));
});

resetForm();
setMode("lista");
fetchAprendizesFromPacientes();
fetchNarrativas().catch((e) => {
  console.warn("Falha ao carregar narrativas:", e);
  alert("Não foi possível carregar narrativas do servidor.");
});
