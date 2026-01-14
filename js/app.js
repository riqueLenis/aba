"use strict";

const Store = (() => {
  const KEY = "aba-navigator-state-v1";
  const defaultState = {
    therapists: [],
    patients: [],
    programs: [],
    sessions: [],
    therapeuticPlans: [],
    criteriaEvolutions: [],
    targets: [], // modelos de alvos ABA salvos no backend
  };

  const read = () => {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object"
        ? parsed
        : { ...defaultState };
    } catch {
      return { ...defaultState };
    }
  };

  const write = (state) => localStorage.setItem(KEY, JSON.stringify(state));
  const id = () =>
    crypto?.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  let state = read();

  const api = {
    get: () => state,
    set: (updater) => {
      state = typeof updater === "function" ? updater(state) : updater;
      write(state);
      Router.render();
    },

    add: (collection, item) =>
      api.set((s) => ({
        ...s,
        [collection]: [
          ...s[collection],
          { ...item, id: id(), createdAt: new Date().toISOString() },
        ],
      })),

    update: (collection, itemId, patch) =>
      api.set((s) => ({
        ...s,
        [collection]: s[collection].map((x) =>
          x.id === itemId ? { ...x, ...patch } : x
        ),
      })),

    remove: (collection, itemId) =>
      api.set((s) => ({
        ...s,
        [collection]: s[collection].filter((x) => x.id !== itemId),
      })),
  };

  return api;
})();

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function")
      node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined) return;
    if (typeof c === "string") node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  });
  return node;
};

const toast = (msg) => {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2200);
};

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const CUSTOM_TEMPLATES_KEY = "aba-plus-custom-templates";
const loadCustomTemplates = () => {
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") {
      return { programs: [], targets: [] };
    }
    return {
      programs: Array.isArray(parsed.programs) ? parsed.programs : [],
      targets: Array.isArray(parsed.targets) ? parsed.targets : [],
    };
  } catch {
    return { programs: [], targets: [] };
  }
};

const saveCustomTemplates = (data) => {
  const base = loadCustomTemplates();
  const next = {
    programs: Array.isArray(data.programs) ? data.programs : base.programs,
    targets: Array.isArray(data.targets) ? data.targets : base.targets,
  };
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(next));
};

// Modal
const Modal = (() => {
  const wrap = $("#modal");
  const backdrop = $("#modal-backdrop");
  const close = () => {
    wrap.classList.add("hidden");
    backdrop.classList.add("hidden");
    wrap.innerHTML = "";
  };
  const open = (title, bodyNode) => {
    wrap.innerHTML = "";
    wrap.appendChild(
      el("div", { class: "panel" }, [
        el("div", { class: "panel-header" }, title),
        el("div", { class: "panel-body" }, bodyNode),
      ])
    );
    wrap.classList.remove("hidden");
    backdrop.classList.remove("hidden");
  };
  backdrop.addEventListener("click", close);
  return { open, close };
})();

// Integração com backend PsyHead (sempre via backend hospedado no Render)
const API_BASE = "https://aba-aos0.onrender.com";
const getAuthHeaders = () => {
  const token = localStorage.getItem("psyhead-token");
  return token
    ? {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }
    : { "Content-Type": "application/json" };
};

// Sincroniza pacientes/terapeutas + dados ABA (programas, sessões, planos, evoluções)
const syncFromBackend = async () => {
  const token = localStorage.getItem("psyhead-token");
  if (!token) {
    console.warn("ABA+: nenhum token encontrado, usando apenas dados locais.");
    return;
  }

  try {
    const headers = getAuthHeaders();
    const [
      patientsRes,
      therapistsRes,
      programsRes,
      sessionsRes,
      evolutionsRes,
      plansRes,
      targetsRes,
    ] = await Promise.all([
      fetch(`${API_BASE}/api/pacientes`, { headers }),
      fetch(`${API_BASE}/api/terapeutas-lista`, { headers }).catch(() => null),
      fetch(`${API_BASE}/api/aba/programas`, { headers }).catch(() => null),
      fetch(`${API_BASE}/api/aba/sessoes`, { headers }).catch(() => null),
      fetch(`${API_BASE}/api/aba/evolucoes`, { headers }).catch(() => null),
      fetch(`${API_BASE}/api/aba/planos`, { headers }).catch(() => null),
      fetch(`${API_BASE}/api/aba/alvos`, { headers }).catch(() => null),
    ]);

    const current = Store.get();

    // Pacientes
    let patients = current.patients;
    if (patientsRes.ok) {
      const data = await patientsRes.json();
      patients = data.map((p) => ({
        id: String(p.id),
        name: p.nome_completo,
        diagnosis: p.motivacao_consulta || "",
      }));
    } else {
      console.warn("ABA+: não foi possível carregar pacientes do backend.");
    }

    // Terapeutas (apenas admins conseguem listar)
    let therapists = current.therapists;
    if (therapistsRes && therapistsRes.ok) {
      const data = await therapistsRes.json();
      therapists = data.map((t) => ({ id: String(t.id), name: t.nome }));
    }

    // Programas ABA
    let programs = current.programs;
    if (programsRes && programsRes.ok) {
      const data = await programsRes.json();
      programs = data.map((p) => ({
        id: String(p.id),
        patientId: String(p.paciente_id),
        name: p.nome,
        code: p.codigo || "",
        description: p.descricao || "",
        category: p.categoria || "communication",
        targetBehavior: p.comportamento_alvo || "",
        currentCriteria: p.criterio_atual || "",
        status: p.status || "active",
      }));
    }

    // Sessões ABA
    let sessions = current.sessions;
    if (sessionsRes && sessionsRes.ok) {
      const data = await sessionsRes.json();
      sessions = data.map((s) => ({
        id: String(s.id),
        programId: String(s.programa_id),
        patientId: String(s.paciente_id),
        therapistId: s.terapeuta_id ? String(s.terapeuta_id) : null,
        date: s.data_sessao,
        trials: Number(s.tentativas) || 0,
        successes: Number(s.acertos) || 0,
        notes: s.observacoes || "",
      }));
    }

    // Evoluções de critério ABA
    let criteriaEvolutions = current.criteriaEvolutions;
    if (evolutionsRes && evolutionsRes.ok) {
      const data = await evolutionsRes.json();
      criteriaEvolutions = data.map((e) => ({
        id: String(e.id),
        programId: String(e.programa_id),
        previousCriteria: e.criterio_anterior,
        newCriteria: e.novo_criterio,
        changedAt: e.data_mudanca,
        reason: e.motivo,
      }));
    }

    // Planos terapêuticos ABA
    let therapeuticPlans = current.therapeuticPlans;
    if (plansRes && plansRes.ok) {
      const data = await plansRes.json();
      therapeuticPlans = data.map((p) => ({
        id: String(p.id),
        patientId: String(p.paciente_id),
        title: p.titulo,
        goals: Array.isArray(p.goals) ? p.goals : [],
        startDate: p.data_inicio ? p.data_inicio.substring(0, 10) : "",
        endDate: p.data_termino ? p.data_termino.substring(0, 10) : "",
        status: p.status || "draft",
      }));
    }

    // Alvos ABA (modelos)
    let targets = current.targets || [];
    if (targetsRes && targetsRes.ok) {
      const data = await targetsRes.json();
      targets = data.map((t) => ({ id: String(t.id), label: t.label }));
    }

    Store.set((s) => ({
      ...s,
      patients,
      therapists,
      programs,
      sessions,
      criteriaEvolutions,
      therapeuticPlans,
      targets,
    }));
  } catch (error) {
    console.error("ABA+: erro ao sincronizar com backend", error);
  }
};

const Router = (() => {
  const routes = {};
  const setTitle = (t) => {
    $("#page-title").textContent = t;
  };
  const mount = (path, title, renderFn) => {
    routes[path] = { title, renderFn };
  };
  const parse = () => location.hash.replace("#", "") || "/";
  const render = () => {
    const path = parse();
    const match = routes[path] || routes["*"];
    setTitle(match.title);
    $("#view").innerHTML = "";
    $("#view").appendChild(match.renderFn());
    $$(".nav a").forEach((a) =>
      a.classList.toggle("active", a.getAttribute("href") === `#${path}`)
    );
  };
  window.addEventListener("hashchange", render);
  return { mount, render };
})();

const Labels = {
  programCategory: {
    communication: "Comunicação",
    motor_skills: "Habilidades Motoras",
    social_skills: "Habilidades Sociais",
    daily_living: "Vida Diária",
    play: "Brincar",
    academic: "Acadêmico",
  },
  programStatus: {
    active: ["Ativo", "badge success"],
    paused: ["Pausado", "badge warn"],
    completed: ["Concluído", "badge info"],
  },
  planStatus: {
    draft: ["Rascunho", "badge"],
    active: ["Ativo", "badge success"],
    completed: ["Concluído", "badge info"],
  },
};

const PROGRAM_TEMPLATES = [
  { name: "Sentar - alvo do seguindo o comando", code: "1131011" },
  { name: "Emitindo recusas com o botão", code: "1117574" },
  { name: "Pareamento de letras", code: "1117600" },
  { name: "Hora da história", code: "1117603" },
  { name: "Pomodoro timer", code: "1117609" },
  { name: "Ações motoras sob comando auditivo", code: "1152599" },
  { name: "Imitação motora", code: "1152624" },
  { name: "Condicionamento de reforçadores", code: "1152623" },
  { name: "Obtendo acesso", code: "1117571" },
  { name: "Atenção triangular", code: "1117577" },
  { name: "Pareamento de números", code: "1117589" },
  { name: "Troca de turno", code: "1117606" },
  { name: "Seguindo o comando", code: "1117583" },
  { name: "Imitação com objetos", code: "1131068" },
  { name: "Imitação de movimentos motores grossos", code: "1131059" },
  { name: "Condicionamento de reforçadores", code: "1131072" },
  { name: "Emitindo comandos generalizados no comunicador", code: "1152523" },
  { name: "O que está faltando? - Cópia", code: "1152546" },
  { name: "O que está faltando?", code: "1152548" },
  {
    name: "Discriminando itens não reforçadores a partir de FCC",
    code: "1152594",
  },
  {
    name: "Condicionamento de reforçadores - percepção",
    code: "1152620",
  },
  {
    name: "Seleção de ouvinte - arranjo de 4 itens",
    code: "1152618",
  },
  {
    name: "Estabelecendo comandos sobre o mundo e sobre terceiros",
    code: "1152591",
  },
  { name: "COMUNICAÇÃO FUNCIONAL", code: "1189794" },
  {
    name: "AUTOGERENCIAMENTO DE EMOÇÕES - TABELA DE PERCEPÇÃO",
    code: "1189802",
  },
  { name: "ATIVIDADES DE LAZER/BRINCADEIRAS MOTORAS", code: "1189819" },
  {
    name: "Identificação das partes do próprio corpo",
    code: "1191609",
  },
  { name: "MENI - Parear itens semelhantes", code: "1191610" },
  {
    name: "Identificar produtos de higiene para o cabelo",
    code: "1191611",
  },
  { name: "Idenficação de emoções", code: "1191612" },
  { name: "Ouvinte e seleção ; objetos (casa)", code: "1191613" },
  { name: "TOLERANCIA - DEMANDAS E TRANSIÇÕES", code: "1191643" },
  { name: "Brincar Funcional", code: "1228642" },
  {
    name: "Identificação de itens para atividades funcionais",
    code: "1228686",
  },
  { name: "Ouvinte - FCC", code: "1228855" },
  { name: "Tomar banho", code: "1239845" },
  { name: "Vestir - Camiseta", code: "1239846" },
  { name: "Vestir - Cueca", code: "1239847" },
  { name: "Vestir - Short", code: "1239848" },
  { name: "Comer com talheres", code: "1239849" },
  { name: "Organização - Alimentação", code: "1239850" },
  { name: "Motricidade fina", code: "1244143" },
  {
    name: "Seguir Instruções - Pegar itens de casa",
    code: "1247815",
  },
];

function Select(list, value, onChange, placeholder = "Selecione...") {
  const s = el("select", { class: "select" }, [
    el("option", { value: "" }, placeholder),
  ]);
  list.forEach(([val, label]) =>
    s.appendChild(el("option", { value: val }, label))
  );
  s.value = value ?? "";
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

function Field(label, inputEl) {
  return el("div", {}, [el("label", { class: "label" }, label), inputEl]);
}

const Views = {
  Dashboard() {
    const { therapists, patients, programs, sessions } = Store.get();
    const activePrograms = programs.filter((p) => p.status === "active").length;

    const stats = [
      ["Terapeutas", therapists.length],
      ["Pacientes", patients.length],
      ["Programas Ativos", activePrograms],
      ["Sessões Registradas", sessions.length],
    ];

    const lastPatients = patients.slice(-5).reverse();

    return el("div", { class: "grid gap" }, [
      el(
        "div",
        { class: "grid cols-4" },
        stats.map(([label, value]) =>
          el(
            "div",
            { class: "card" },
            el("div", { class: "card-body" }, [
              el("div", { class: "small" }, label),
              el("div", { class: "title" }, String(value)),
            ])
          )
        )
      ),
      el("div", { class: "grid cols-2 mt-4" }, [
        el(
          "div",
          { class: "card" },
          el("div", { class: "card-body" }, [
            el("div", { class: "title mt-2" }, "Últimos Pacientes"),
            lastPatients.length
              ? el(
                  "ul",
                  { class: "list mt-2" },
                  lastPatients.map((p) => {
                    const therapist = Store.get().therapists.find(
                      (t) => t.id === p.therapistId
                    );
                    return el("li", {}, [
                      el("div", {}, [
                        el("div", {}, p.name),
                        el(
                          "div",
                          { class: "small" },
                          therapist
                            ? `Terapeuta: ${therapist.name}`
                            : "Sem terapeuta"
                        ),
                      ]),
                      p.diagnosis
                        ? el("span", { class: "badge" }, p.diagnosis)
                        : "",
                    ]);
                  })
                )
              : el(
                  "div",
                  { class: "small mt-2" },
                  "Nenhum paciente cadastrado"
                ),
          ])
        ),
        el(
          "div",
          { class: "card" },
          el("div", { class: "card-body" }, [
            el("div", { class: "title mt-2" }, "Acesso Rápido"),
            el("div", { class: "row mt-3 wrap" }, [
              el(
                "a",
                { href: "#/therapists", class: "btn secondary" },
                "Gerenciar Terapeutas"
              ),
              el(
                "a",
                { href: "#/programs", class: "btn secondary" },
                "Gerenciar Programas"
              ),
            ]),
          ])
        ),
      ]),
    ]);
  },

  CurricularFolders() {
    const wrap = el("div");
    const { patients, programs, targets } = Store.get();

    let selectedPatientId = patients[0]?.id || "";
    let folders = [];
    const selectedProgramByFolder = {};

    const patientSel = Select(
      patients.map((p) => [p.id, p.name]),
      selectedPatientId,
      async (v) => {
        selectedPatientId = v;
        await loadFolders();
      },
      "Selecione o paciente..."
    );

    const folderName = el("input", {
      class: "input",
      placeholder: "Nome da pasta curricular",
    });

    const createBtn = el(
      "button",
      {
        class: "btn",
        onclick: async () => {
          if (!selectedPatientId) return toast("Selecione o paciente");
          if (!folderName.value.trim()) return toast("Informe o nome da pasta");

          try {
            const headers = getAuthHeaders();
            const res = await fetch(`${API_BASE}/api/aba/pastas-curriculares`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                patientId: selectedPatientId,
                name: folderName.value.trim(),
              }),
            });
            if (!res.ok) {
              console.error(
                "Erro ao criar pasta curricular",
                await res.text().catch(() => "")
              );
              return toast("Erro ao criar pasta no servidor");
            }
            folderName.value = "";
            toast("Pasta criada");
            await loadFolders();
          } catch (e) {
            console.error("ABA+: erro ao criar pasta curricular", e);
            toast("Falha na comunicação com o servidor");
          }
        },
      },
      "Criar Pasta"
    );

    const header = el("div", { class: "card" }, [
      el("div", { class: "card-body" }, [
        el("div", { class: "title" }, "Pastas Curriculares"),
        el(
          "div",
          { class: "small mt-1" },
          "Crie pastas por paciente e anexe programas e alvos."
        ),
        el("div", { class: "row mt-3 wrap" }, [
          Field("Paciente", patientSel),
          Field("Nova pasta", folderName),
          createBtn,
        ]),
      ]),
    ]);

    const listWrap = el("div", { class: "grid gap mt-3" });

    const attachProgram = async (folderId, programId) => {
      if (!programId) return toast("Selecione o programa");
      try {
        const headers = getAuthHeaders();
        const res = await fetch(
          `${API_BASE}/api/aba/pastas-curriculares/${folderId}/programas`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ programId }),
          }
        );
        if (!res.ok) {
          console.error(
            "Erro ao anexar programa",
            await res.text().catch(() => "")
          );
          return toast("Erro ao anexar programa");
        }
        toast("Programa anexado");
        await loadFolders();
      } catch (e) {
        console.error("ABA+: erro ao anexar programa", e);
        toast("Falha na comunicação com o servidor");
      }
    };

    const deleteFolder = async (folder) => {
      const folderId = folder?.id;
      const folderName = String(folder?.nome || folder?.name || "").trim();
      if (!folderId) return;

      const ok = confirm(
        `Excluir a pasta curricular?\n\n${folderName || "(sem nome)"}`
      );
      if (!ok) return;

      try {
        const headers = getAuthHeaders();
        const res = await fetch(
          `${API_BASE}/api/aba/pastas-curriculares/${folderId}`,
          {
            method: "DELETE",
            headers,
          }
        );
        if (!res.ok) {
          console.error(
            "Erro ao excluir pasta curricular",
            await res.text().catch(() => "")
          );
          return toast("Erro ao excluir pasta");
        }
        toast("Pasta excluída");
        await loadFolders();
      } catch (e) {
        console.error("ABA+: erro ao excluir pasta curricular", e);
        toast("Falha na comunicação com o servidor");
      }
    };

    const attachTarget = async (folderId, alvoId, programId) => {
      if (!alvoId) return toast("Selecione o alvo");
      try {
        const headers = getAuthHeaders();
        const res = await fetch(
          `${API_BASE}/api/aba/pastas-curriculares/${folderId}/alvos`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ alvoId, programId }),
          }
        );
        if (!res.ok) {
          console.error(
            "Erro ao anexar alvo",
            await res.text().catch(() => "")
          );
          return toast("Erro ao anexar alvo");
        }
        toast("Alvo anexado");
        await loadFolders();
      } catch (e) {
        console.error("ABA+: erro ao anexar alvo", e);
        toast("Falha na comunicação com o servidor");
      }
    };

    const editProgramName = async (programId) => {
      const prog = Store.get().programs.find((p) => String(p.id) === String(programId));
      if (!prog) return toast("Programa não encontrado no ABA+");

      const name = el("input", {
        class: "input",
        value: prog.name || "",
        placeholder: "Nome do programa",
      });

      const body = el("div", {}, [
        Field("Nome do Programa", name),
        el("div", { class: "row mt-3" }, [
          el(
            "button",
            { class: "btn secondary", onclick: () => Modal.close() },
            "Cancelar"
          ),
          el(
            "button",
            {
              class: "btn",
              onclick: async () => {
                if (!name.value.trim()) return toast("Informe o nome");
                try {
                  const headers = getAuthHeaders();
                  const payload = {
                    patientId: prog.patientId,
                    name: name.value.trim(),
                    code: prog.code || "",
                    description: prog.description || "",
                    category: prog.category || "communication",
                    targetBehavior: prog.targetBehavior || "",
                    currentCriteria: prog.currentCriteria || "",
                    status: prog.status || "active",
                  };
                  const res = await fetch(
                    `${API_BASE}/api/aba/programas/${prog.id}`,
                    {
                      method: "PUT",
                      headers,
                      body: JSON.stringify(payload),
                    }
                  );
                  if (!res.ok) {
                    console.error(
                      "Erro ao editar programa",
                      await res.text().catch(() => "")
                    );
                    return toast("Erro ao editar programa");
                  }
                  await syncFromBackend();
                  await loadFolders();
                  Modal.close();
                  toast("Programa atualizado");
                } catch (e) {
                  console.error("ABA+: erro ao editar programa", e);
                  toast("Falha na comunicação com o servidor");
                }
              },
            },
            "Salvar"
          ),
        ]),
      ]);

      Modal.open("Editar Programa", body);
    };

    const editTargetName = async (targetId, currentLabel) => {
      const label = el("input", {
        class: "input",
        value: String(currentLabel || ""),
        placeholder: "Nome do alvo",
      });

      const body = el("div", {}, [
        Field("Nome do Alvo", label),
        el("div", { class: "row mt-3" }, [
          el(
            "button",
            { class: "btn secondary", onclick: () => Modal.close() },
            "Cancelar"
          ),
          el(
            "button",
            {
              class: "btn",
              onclick: async () => {
                if (!label.value.trim()) return toast("Informe o nome");
                try {
                  const headers = getAuthHeaders();
                  const res = await fetch(`${API_BASE}/api/aba/alvos/${targetId}`,
                    {
                      method: "PUT",
                      headers,
                      body: JSON.stringify({ label: label.value.trim() }),
                    }
                  );
                  if (!res.ok) {
                    console.error(
                      "Erro ao editar alvo",
                      await res.text().catch(() => "")
                    );
                    return toast("Erro ao editar alvo");
                  }
                  await syncFromBackend();
                  await loadFolders();
                  Modal.close();
                  toast("Alvo atualizado");
                } catch (e) {
                  console.error("ABA+: erro ao editar alvo", e);
                  toast("Falha na comunicação com o servidor");
                }
              },
            },
            "Salvar"
          ),
        ]),
      ]);

      Modal.open("Editar Alvo", body);
    };

    const renderFolders = () => {
      listWrap.innerHTML = "";

      if (!selectedPatientId) {
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el(
              "div",
              { class: "card-body" },
              el(
                "div",
                { class: "small" },
                "Selecione um paciente para ver as pastas."
              )
            )
          )
        );
        return;
      }

      if (!folders.length) {
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el(
              "div",
              { class: "card-body" },
              el(
                "div",
                { class: "small" },
                "Nenhuma pasta criada para este paciente."
              )
            )
          )
        );
        return;
      }

      const patientPrograms = programs
        .filter((p) => String(p.patientId) === String(selectedPatientId))
        .map((p) => [p.id, p.name]);

      const targetOptions = (targets || []).map((t) => [t.id, t.label]);

      const getAlvoProgramId = (a) =>
        a?.programa_id ??
        a?.programaId ??
        a?.programId ??
        a?.program_id ??
        null;

      folders.forEach((f) => {
        const programSel = Select(
          patientPrograms,
          "",
          (v) => (programSel.value = v),
          "Selecione o programa..."
        );
        const targetSel = Select(
          targetOptions,
          "",
          (v) => (targetSel.value = v),
          "Selecione o alvo..."
        );

        const progList = Array.isArray(f.programas) ? f.programas : [];
        const alvoList = Array.isArray(f.alvos) ? f.alvos : [];

        const folderId = String(f.id);
        const normalizedPrograms = progList
          .filter((p) => p && p.id)
          .map((p) => ({ id: String(p.id), nome: p.nome || "Programa" }));

        const hasUnlinkedTargets = alvoList.some(
          (a) => getAlvoProgramId(a) == null
        );
        const hasTargetProgramInfo = alvoList.some(
          (a) => getAlvoProgramId(a) != null
        );

        const currentSelectedProgram =
          selectedProgramByFolder[folderId] ??
          (normalizedPrograms[0]?.id ||
            (hasUnlinkedTargets ? "__unlinked__" : ""));

        // Se o programa selecionado não existe mais na pasta, reseta.
        if (
          currentSelectedProgram &&
          currentSelectedProgram !== "__unlinked__" &&
          !normalizedPrograms.some((p) => p.id === currentSelectedProgram)
        ) {
          selectedProgramByFolder[folderId] =
            normalizedPrograms[0]?.id ||
            (hasUnlinkedTargets ? "__unlinked__" : "");
        } else if (selectedProgramByFolder[folderId] == null) {
          selectedProgramByFolder[folderId] = currentSelectedProgram;
        }

        const selectedProgId = selectedProgramByFolder[folderId] || "";
        const filteredTargets = (() => {
          if (!selectedProgId) return [];
          if (selectedProgId === "__unlinked__") {
            return alvoList.filter((a) => getAlvoProgramId(a) == null);
          }
          return alvoList.filter(
            (a) => String(getAlvoProgramId(a)) === String(selectedProgId)
          );
        })();

        const programTabs = (() => {
          if (!normalizedPrograms.length && !hasUnlinkedTargets) return "";

          const items = [
            ...normalizedPrograms.map((p) => ({
              id: p.id,
              label: p.nome,
            })),
          ];
          if (hasUnlinkedTargets)
            items.push({ id: "__unlinked__", label: "Sem programa" });

          return el(
            "div",
            { class: "row mt-2 wrap" },
            items.map((it) =>
              el(
                "button",
                {
                  class:
                    "btn secondary" +
                    (String(selectedProgId) === String(it.id) ? "" : ""),
                  style:
                    String(selectedProgId) === String(it.id)
                      ? "border-color: var(--primary);"
                      : "",
                  onclick: () => {
                    selectedProgramByFolder[folderId] = it.id;
                    renderFolders();
                  },
                },
                it.label
              )
            )
          );
        })();

        listWrap.appendChild(
          el("div", { class: "card" }, [
            el("div", { class: "card-body" }, [
              el("div", { class: "row space-between" }, [
                el("div", { class: "title" }, f.nome || "Pasta"),
                el(
                  "div",
                  { class: "row", style: "gap:10px; align-items:center;" },
                  [
                    el(
                      "div",
                      { class: "small" },
                      f.criado_em
                        ? new Date(f.criado_em).toLocaleDateString()
                        : ""
                    ),
                    el(
                      "button",
                      {
                        class: "btn danger",
                        style: "padding:6px 10px;",
                        onclick: () => deleteFolder(f),
                        title: "Excluir pasta",
                      },
                      "Excluir"
                    ),
                  ]
                ),
              ]),

              el("div", { class: "row mt-2 wrap" }, [
                Field("Anexar programa", programSel),
                el(
                  "button",
                  {
                    class: "btn secondary",
                    onclick: () => attachProgram(f.id, programSel.value),
                  },
                  "Anexar"
                ),
              ]),

              progList.length
                ? el(
                    "ul",
                    { class: "list mt-2" },
                    progList.map((p) =>
                      el("li", {}, [
                        el(
                          "div",
                          {
                            class: "row",
                            style:
                              "justify-content:space-between; align-items:center; gap:10px;",
                          },
                          [
                            el("span", {}, p.nome || "Programa"),
                            el(
                              "button",
                              {
                                class: "btn secondary",
                                style: "padding:6px 10px;",
                                onclick: () => editProgramName(p.id),
                              },
                              "Editar Programa"
                            ),
                          ]
                        ),
                      ])
                    )
                  )
                : el(
                    "div",
                    { class: "small mt-2" },
                    "Nenhum programa anexado."
                  ),

              normalizedPrograms.length || hasUnlinkedTargets
                ? el(
                    "div",
                    { class: "small mt-2" },
                    "Clique em um programa para ver apenas os alvos vinculados."
                  )
                : "",

              programTabs,

              el("div", { class: "row mt-3 wrap" }, [
                Field("Anexar alvo", targetSel),
                el(
                  "button",
                  {
                    class: "btn secondary",
                    onclick: () => {
                      if (!targetSel.value) return toast("Selecione o alvo");
                      if (!normalizedPrograms.length)
                        return toast(
                          "Anexe um programa antes de vincular alvos"
                        );
                      if (!selectedProgId || selectedProgId === "__unlinked__")
                        return toast(
                          "Selecione um programa para vincular o alvo"
                        );
                      attachTarget(f.id, targetSel.value, selectedProgId);
                    },
                  },
                  "Anexar"
                ),
              ]),

              !alvoList.length
                ? el("div", { class: "small mt-2" }, "Nenhum alvo anexado.")
                : !selectedProgId
                ? el(
                    "div",
                    { class: "small mt-2" },
                    "Selecione um programa para filtrar os alvos."
                  )
                  : filteredTargets.length
                    ? el(
                        "ul",
                        { class: "list mt-2" },
                        filteredTargets.map((a) =>
                          el("li", {}, [
                            el(
                              "div",
                              {
                                class: "row",
                                style:
                                  "justify-content:space-between; align-items:center; gap:10px;",
                              },
                              [
                                el("span", {}, a.label || "Alvo"),
                                el(
                                  "button",
                                  {
                                    class: "btn secondary",
                                    style: "padding:6px 10px;",
                                    onclick: () => editTargetName(a.id, a.label),
                                  },
                                  "Editar Alvo"
                                ),
                              ]
                            ),
                          ])
                        )
                      )
                : el(
                    "div",
                    { class: "small mt-2" },
                    hasTargetProgramInfo
                      ? "Nenhum alvo vinculado a este programa."
                      : "Seu servidor ainda não informa o vínculo alvo↔programa; exibindo/registrando vínculo quando disponível."
                  ),
            ]),
          ])
        );
      });
    };

    const loadFolders = async () => {
      if (!selectedPatientId) {
        folders = [];
        renderFolders();
        return;
      }
      try {
        const headers = getAuthHeaders();
        const url = `${API_BASE}/api/aba/pastas-curriculares?pacienteId=${encodeURIComponent(
          selectedPatientId
        )}`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
          console.error(
            "Erro ao carregar pastas curriculares",
            await res.text().catch(() => "")
          );
          folders = [];
          renderFolders();
          return;
        }
        const data = await safeJson(res);
        folders = Array.isArray(data) ? data : [];
        renderFolders();
      } catch (e) {
        console.error("ABA+: erro ao carregar pastas curriculares", e);
        folders = [];
        renderFolders();
      }
    };

    wrap.appendChild(header);
    wrap.appendChild(listWrap);
    // carregamento inicial
    loadFolders();
    return wrap;
  },

  Therapists() {
    const wrap = el("div");
    const header = el("div", { class: "row space-between mt-2" }, [
      el("div", { class: "title" }, "Terapeutas"),
      el(
        "button",
        { class: "btn", onclick: () => openForm() },
        "+ Novo Terapeuta"
      ),
    ]);

    const listWrap = el("div", { class: "grid cols-3 mt-4" });

    const renderList = () => {
      listWrap.innerHTML = "";
      const { therapists, patients } = Store.get();
      if (!therapists.length) {
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el("div", { class: "card-body" }, "Nenhum terapeuta cadastrado")
          )
        );
        return;
      }
      therapists.forEach((t) => {
        const count = patients.filter((p) => p.therapistId === t.id).length;
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el("div", { class: "card-body" }, [
              el("div", { class: "title" }, t.name),
              t.email
                ? el("div", { class: "small mt-2" }, `Email: ${t.email}`)
                : "",
              t.phone
                ? el("div", { class: "small mt-2" }, `Telefone: ${t.phone}`)
                : "",
              t.specialty
                ? el(
                    "div",
                    { class: "small mt-2" },
                    `Especialidade: ${t.specialty}`
                  )
                : "",
              el("div", { class: "small mt-2" }, `${count} paciente(s)`),
              el("div", { class: "row mt-3" }, [
                el(
                  "button",
                  { class: "btn secondary", onclick: () => openForm(t) },
                  "Editar"
                ),
                el(
                  "button",
                  { class: "btn danger", onclick: () => onDelete(t.id) },
                  "Excluir"
                ),
              ]),
            ])
          )
        );
      });
    };

    const openForm = (therapist) => {
      const name = el("input", {
        class: "input",
        value: therapist?.name || "",
        placeholder: "Nome completo",
      });
      const email = el("input", {
        class: "input",
        value: therapist?.email || "",
        placeholder: "email@exemplo.com",
        type: "email",
      });
      const phone = el("input", {
        class: "input",
        value: therapist?.phone || "",
        placeholder: "(00) 00000-0000",
      });
      const specialty = el("input", {
        class: "input",
        value: therapist?.specialty || "",
        placeholder: "Ex: TEA, TDAH, etc.",
      });

      const form = el("div", {}, [
        Field("Nome *", name),
        Field("E-mail", email),
        Field("Telefone", phone),
        Field("Especialidade", specialty),
        el("div", { class: "row mt-3" }, [
          el(
            "button",
            { class: "btn secondary", onclick: () => Modal.close() },
            "Cancelar"
          ),
          el(
            "button",
            {
              class: "btn",
              onclick: () => {
                if (!name.value.trim()) return toast("Nome é obrigatório");
                if (therapist)
                  Store.update("therapists", therapist.id, {
                    name: name.value,
                    email: email.value,
                    phone: phone.value,
                    specialty: specialty.value,
                  });
                else
                  Store.add("therapists", {
                    name: name.value,
                    email: email.value,
                    phone: phone.value,
                    specialty: specialty.value,
                  });
                toast(
                  therapist ? "Terapeuta atualizado!" : "Terapeuta cadastrado!"
                );
                Modal.close();
              },
            },
            therapist ? "Atualizar" : "Cadastrar"
          ),
        ]),
      ]);
      Modal.open(therapist ? "Editar Terapeuta" : "Novo Terapeuta", form);
    };

    const onDelete = (id) => {
      const { patients } = Store.get();
      if (patients.some((p) => p.therapistId === id))
        return toast("Não é possível excluir: há pacientes vinculados.");
      Store.remove("therapists", id);
      toast("Terapeuta excluído!");
    };

    wrap.appendChild(header);
    wrap.appendChild(listWrap);
    renderList();
    return wrap;
  },

  Patients() {
    const wrap = el("div");
    const header = el("div", { class: "row space-between mt-2" }, [
      el("div", { class: "title" }, "Pacientes"),
      el(
        "button",
        { class: "btn", onclick: () => openForm() },
        "+ Novo Paciente"
      ),
    ]);

    const listWrap = el("div", { class: "grid cols-3 mt-4" });

    const renderList = () => {
      listWrap.innerHTML = "";
      const { patients, therapists, programs } = Store.get();
      if (!patients.length) {
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el("div", { class: "card-body" }, "Nenhum paciente cadastrado")
          )
        );
        return;
      }
      const getAge = (dob) => {
        if (!dob) return null;
        const d = new Date(dob);
        const now = new Date();
        let age = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
        return age;
      };
      patients.forEach((p) => {
        const therapist = therapists.find((t) => t.id === p.therapistId);
        const progCount = programs.filter((pr) => pr.patientId === p.id).length;
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el("div", { class: "card-body" }, [
              el("div", { class: "title" }, p.name),
              p.dateOfBirth
                ? el(
                    "div",
                    { class: "small mt-2" },
                    `${getAge(p.dateOfBirth)} anos`
                  )
                : "",
              therapist
                ? el(
                    "div",
                    { class: "small mt-2" },
                    `Terapeuta: ${therapist.name}`
                  )
                : "",
              p.diagnosis
                ? el("span", { class: "badge mt-2" }, p.diagnosis)
                : "",
              p.guardianPhone
                ? el(
                    "div",
                    { class: "small mt-2" },
                    `Telefone responsável: ${p.guardianPhone}`
                  )
                : "",
              el(
                "div",
                { class: "small mt-2" },
                `${progCount} programa(s) ativo(s)`
              ),
              el("div", { class: "row mt-3" }, [
                el(
                  "button",
                  { class: "btn secondary", onclick: () => openForm(p) },
                  "Editar"
                ),
                el(
                  "button",
                  { class: "btn danger", onclick: () => onDelete(p.id) },
                  "Excluir"
                ),
              ]),
            ])
          )
        );
      });
    };

    const openForm = (patient) => {
      const { therapists } = Store.get();
      const name = el("input", {
        class: "input",
        value: patient?.name || "",
        placeholder: "Nome completo",
      });
      const dob = el("input", {
        class: "input",
        type: "date",
        value: patient?.dateOfBirth || "",
      });
      const therapistSel = Select(
        therapists.map((t) => [t.id, t.name]),
        patient?.therapistId || "",
        (v) => (therapistSel.value = v),
        "Selecione um terapeuta"
      );
      const guardian = el("input", {
        class: "input",
        value: patient?.guardianName || "",
        placeholder: "Nome do responsável",
      });
      const phone = el("input", {
        class: "input",
        value: patient?.guardianPhone || "",
        placeholder: "(00) 00000-0000",
      });
      const diagnosis = el("input", {
        class: "input",
        value: patient?.diagnosis || "",
        placeholder: "Ex: TEA, TDAH, etc.",
      });
      const notes = el("textarea", {
        class: "textarea",
        value: patient?.notes || "",
        placeholder: "Observações",
      });

      const form = el("div", {}, [
        Field("Nome do Paciente *", name),
        Field("Data de Nascimento", dob),
        Field("Terapeuta Responsável *", therapistSel),
        therapists.length
          ? ""
          : el(
              "div",
              { class: "small mt-2" },
              "Cadastre um terapeuta primeiro"
            ),
        Field("Nome do Responsável", guardian),
        Field("Telefone do Responsável", phone),
        Field("Diagnóstico", diagnosis),
        Field("Observações", notes),
        el("div", { class: "row mt-3" }, [
          el(
            "button",
            { class: "btn secondary", onclick: () => Modal.close() },
            "Cancelar"
          ),
          el(
            "button",
            {
              class: "btn",
              onclick: () => {
                if (!name.value.trim())
                  return toast("Nome do paciente é obrigatório");
                if (!therapistSel.value)
                  return toast("Selecione um terapeuta responsável");
                const payload = {
                  name: name.value,
                  dateOfBirth: dob.value,
                  therapistId: therapistSel.value,
                  guardianName: guardian.value,
                  guardianPhone: phone.value,
                  diagnosis: diagnosis.value,
                  notes: notes.value,
                };
                if (patient) Store.update("patients", patient.id, payload);
                else Store.add("patients", payload);
                Modal.close();
              },
            },
            patient ? "Atualizar" : "Cadastrar"
          ),
        ]),
      ]);
      Modal.open(patient ? "Editar Paciente" : "Novo Paciente", form);
    };

    const onDelete = (id) => {
      const { programs } = Store.get();
      if (programs.some((p) => p.patientId === id))
        return toast("Não é possível excluir: há programas vinculados.");
      Store.remove("patients", id);
      toast("Paciente excluído!");
    };

    wrap.appendChild(header);
    wrap.appendChild(listWrap);
    renderList();
    return wrap;
  },

  Programs() {
    const wrap = el("div");
    const header = el("div", { class: "row space-between mt-2" }, [
      el("div", { class: "title" }, "Programas"),
      el(
        "button",
        { class: "btn", onclick: () => openForm() },
        "+ Novo Programa"
      ),
    ]);
    const listWrap = el("div", { class: "grid cols-3 mt-4" });

    const lastRate = (programId) => {
      const { sessions } = Store.get();
      const s = sessions
        .filter((x) => x.programId === programId)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      return s ? Math.round((s.successes / s.trials) * 100) : null;
    };

    const renderList = () => {
      listWrap.innerHTML = "";
      const { programs, patients } = Store.get();
      if (!programs.length) {
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el("div", { class: "card-body" }, "Nenhum programa cadastrado")
          )
        );
        return;
      }
      programs.forEach((p) => {
        const patient = patients.find((pt) => pt.id === p.patientId);
        const [statusLabel, statusCls] = Labels.programStatus[
          p.status || "active"
        ] || ["Ativo", "badge success"];
        const sessionsCount = Store.get().sessions.filter(
          (s) => s.programId === p.id
        ).length;
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el("div", { class: "card-body" }, [
              el("div", { class: "title" }, p.name),
              el(
                "div",
                { class: "small mt-2" },
                patient?.name || "Paciente não encontrado"
              ),
              p.code
                ? el("div", { class: "small mt-1" }, `Código: ${p.code}`)
                : "",
              el("div", { class: "mt-2" }, [
                el(
                  "span",
                  { class: "badge" },
                  Labels.programCategory[p.category]
                ),
                " ",
                el("span", { class: "small" }, `${sessionsCount} sessões`),
              ]),
              p.description
                ? el("div", { class: "small mt-2" }, p.description)
                : "",
              el(
                "div",
                { class: "small mt-2" },
                `Critério: ${p.currentCriteria}`
              ),
              lastRate(p.id) !== null
                ? el("div", { class: "mt-2" }, [
                    el("span", { class: "small" }, "Última sessão:"),
                    " ",
                    el(
                      "span",
                      {
                        class: lastRate(p.id) >= 80 ? "badge success" : "badge",
                      },
                      `${lastRate(p.id)}%`
                    ),
                  ])
                : "",
              el("div", { class: "row mt-3" }, [
                el(
                  "button",
                  { class: "btn secondary", onclick: () => openSessionForm(p) },
                  "Nova Sessão"
                ),
                el(
                  "button",
                  { class: "btn secondary", onclick: () => openForm(p) },
                  "Editar Programa"
                ),
                el(
                  "button",
                  { class: "btn danger", onclick: () => onDelete(p.id) },
                  "Excluir"
                ),
                el(
                  "span",
                  { class: statusCls, style: "margin-left:auto" },
                  statusLabel
                ),
              ]),
            ])
          )
        );
      });
    };

    const openForm = (program) => {
      const { patients, targets } = Store.get();
      const custom = loadCustomTemplates();

      const templateOptions = [
        ...PROGRAM_TEMPLATES.map((t) => [
          t.code,
          `${t.name} - Código: ${t.code}`,
        ]),
        ...custom.programs.map((name) => [
          `custom-prog:${name}`,
          `${name} (personalizado)`,
        ]),
      ];

      const templateSel = Select(
        templateOptions,
        program?.code || "",
        (v) => {
          const tpl = PROGRAM_TEMPLATES.find((t) => t.code === v);
          if (tpl) {
            name.value = tpl.name;
            return;
          }
          if (v && v.startsWith("custom-prog:")) {
            const customName = v.replace("custom-prog:", "");
            name.value = customName;
          }
        },
        "Selecione um programa..."
      );

      const targetsSel = Select(
        targets.map((t) => [t.id, t.label]),
        "",
        () => {},
        "Selecione um alvo..."
      );

      const target = el("textarea", {
        class: "textarea",
        value: program?.targetBehavior || "",
        placeholder: "Alvos selecionados (um por linha)",
        rows: 3,
        readOnly: true,
      });

      let extraTargetLabels = [];
      const selectedTargetIds = new Set();

      // Se estiver editando, tenta pré-selecionar alvos com base no texto salvo.
      if (program?.targetBehavior) {
        const tokens = String(program.targetBehavior)
          .split(/\n|,|;|\r/)
          .map((x) => x.trim())
          .filter(Boolean);

        if (tokens.length) {
          const byLabel = new Map(
            targets.map((t) => [String(t.label), String(t.id)])
          );
          const ids = tokens
            .map((t) => byLabel.get(t))
            .filter((id) => id !== undefined && id !== null);
          ids.forEach((id) => selectedTargetIds.add(String(id)));
          extraTargetLabels = tokens.filter((t) => !byLabel.has(t));
        }
      }

      // Ajuste: seleção de alvos com checkboxes (mais simples que Ctrl/Shift)
      const targetsChecklist = (() => {
        let localTargets = (targets || []).map((t) => ({
          id: String(t.id),
          label: t.label,
        }));

        const editTarget = async (t) => {
          const input = el("input", {
            class: "input",
            value: String(t?.label || ""),
            placeholder: "Nome do alvo",
          });

          const body = el("div", {}, [
            Field("Nome do Alvo", input),
            el("div", { class: "row mt-3" }, [
              el(
                "button",
                { class: "btn secondary", onclick: () => Modal.close() },
                "Cancelar"
              ),
              el(
                "button",
                {
                  class: "btn",
                  onclick: async () => {
                    if (!input.value.trim()) return toast("Informe o nome");
                    try {
                      const headers = getAuthHeaders();
                      const res = await fetch(
                        `${API_BASE}/api/aba/alvos/${t.id}`,
                        {
                          method: "PUT",
                          headers,
                          body: JSON.stringify({ label: input.value.trim() }),
                        }
                      );
                      if (!res.ok) {
                        console.error(
                          "Erro ao editar alvo ABA",
                          await res.text().catch(() => "")
                        );
                        return toast("Erro ao editar alvo no servidor");
                      }

                      // atualiza store e lista local
                      Store.set((s) => ({
                        ...s,
                        targets: (s.targets || []).map((x) =>
                          String(x.id) === String(t.id)
                            ? { ...x, label: input.value.trim() }
                            : x
                        ),
                      }));
                      localTargets = localTargets.map((x) =>
                        String(x.id) === String(t.id)
                          ? { ...x, label: input.value.trim() }
                          : x
                      );
                      render();
                      syncTargetText();
                      Modal.close();
                      toast("Alvo atualizado");
                    } catch (e) {
                      console.error("ABA+: erro ao editar alvo", e);
                      toast("Falha na comunicação com o servidor");
                    }
                  },
                },
                "Salvar"
              ),
            ]),
          ]);

          Modal.open("Editar Alvo", body);
        };

        const search = el("input", {
          class: "input",
          placeholder: "Filtrar alvos...",
        });

        const actions = el("div", { class: "row wrap mt-1" }, [
          el(
            "button",
            {
              class: "btn secondary",
              onclick: () => {
                localTargets.forEach((t) =>
                  selectedTargetIds.add(String(t.id))
                );
                render();
                syncTargetText();
              },
            },
            "Selecionar todos"
          ),
          el(
            "button",
            {
              class: "btn secondary",
              onclick: () => {
                selectedTargetIds.clear();
                extraTargetLabels = [];
                render();
                syncTargetText();
              },
            },
            "Limpar seleção"
          ),
        ]);

        const count = el("div", { class: "small mt-1" }, "0 selecionado(s)");

        const list = el("div", {
          class: "card",
          style:
            "padding:10px; max-height:240px; overflow:auto; background:#fff; border:1px solid #e5e7eb;",
        });

        const syncTargetText = () => {
          const selectedLabels = localTargets
            .filter((t) => selectedTargetIds.has(String(t.id)))
            .map((t) => String(t.label || "").trim())
            .filter(Boolean);

          const extras = (extraTargetLabels || [])
            .map((x) => String(x || "").trim())
            .filter(Boolean);

          const finalList = [...selectedLabels, ...extras];
          target.value = finalList.join("\n");
          count.textContent = `${finalList.length} selecionado(s)`;
        };

        const render = () => {
          const q = String(search.value || "")
            .trim()
            .toLowerCase();
          list.innerHTML = "";

          const items = q
            ? localTargets.filter((t) =>
                String(t.label || "")
                  .toLowerCase()
                  .includes(q)
              )
            : localTargets;

          if (!items.length) {
            list.appendChild(
              el("div", { class: "small" }, "Nenhum alvo encontrado.")
            );
            return;
          }

          items.forEach((t) => {
            const id = String(t.id);
            const checked = selectedTargetIds.has(id);
            const cb = el("input", {
              type: "checkbox",
              checked: checked ? "checked" : null,
            });
            cb.addEventListener("change", () => {
              if (cb.checked) selectedTargetIds.add(id);
              else selectedTargetIds.delete(id);
              syncTargetText();
            });

            const label = el("label", { class: "row", style: "gap:10px; align-items:center;" }, [
              cb,
              el("span", {}, t.label || "Alvo"),
            ]);

            const editBtn = el(
              "button",
              {
                class: "btn secondary",
                style: "margin-left:auto; padding:6px 10px;",
                onclick: () => editTarget(t),
              },
              "Editar Alvo"
            );

            const row = el(
              "div",
              { class: "row", style: "padding:6px 2px; align-items:center; gap:10px;" },
              [label, editBtn]
            );
            list.appendChild(row);
          });
        };

        search.addEventListener("input", render);

        const setTargets = (arr) => {
          localTargets = (arr || []).map((t) => ({
            id: String(t.id),
            label: t.label,
          }));
          render();
          syncTargetText();
        };

        const addTarget = (t) => {
          localTargets.push({ id: String(t.id), label: t.label });
          render();
          syncTargetText();
        };

        const removeTargetsById = (ids) => {
          const remove = new Set((ids || []).map((x) => String(x)));
          localTargets = localTargets.filter((t) => !remove.has(String(t.id)));
          remove.forEach((id) => selectedTargetIds.delete(String(id)));
          render();
          syncTargetText();
        };

        // render inicial
        render();
        syncTargetText();

        return {
          wrap: el("div", {}, [search, actions, count, list]),
          syncTargetText,
          setTargets,
          addTarget,
          removeTargetsById,
          getSelected: () =>
            localTargets.filter((t) => selectedTargetIds.has(String(t.id))),
        };
      })();
      const patientSel = Select(
        patients.map((p) => [p.id, p.name]),
        program?.patientId || "",
        (v) => (patientSel.value = v),
        "Selecione o paciente"
      );
      const name = el("input", {
        class: "input",
        value: program?.name || "",
        required: true,
      });
      const description = el("textarea", {
        class: "textarea",
        value: program?.description || "",
        rows: 2,
      });
      const category = Select(
        Object.entries(Labels.programCategory),
        program?.category || "communication",
        (v) => (category.value = v)
      );
      const criteria = el("input", {
        class: "input",
        value:
          program?.currentCriteria ||
          "80% de acertos em 3 sessões consecutivas",
      });
      const status = Select(
        Object.entries({
          active: "Ativo",
          paused: "Pausado",
          completed: "Concluído",
        }),
        program?.status || "active",
        (v) => (status.value = v)
      );

      const newProgramInput = el("input", {
        class: "input",
        placeholder: "Digite um programa para salvar na lista",
      });
      const saveProgramBtn = el(
        "button",
        {
          class: "btn secondary mt-1",
          onclick: () => {
            const v = newProgramInput.value.trim();
            if (!v) return toast("Informe um nome de programa para salvar");
            const data = loadCustomTemplates();
            if (!data.programs.includes(v)) {
              data.programs.push(v);
              saveCustomTemplates(data);
              templateSel.appendChild(
                el(
                  "option",
                  { value: `custom-prog:${v}` },
                  `${v} (personalizado)`
                )
              );
            }
            templateSel.value = `custom-prog:${v}`;
            name.value = v;
            newProgramInput.value = "";
          },
        },
        "Salvar programa na lista"
      );

      const newTargetInput = el("input", {
        class: "input",
        placeholder: "Digite um alvo para salvar na lista",
      });
      const saveTargetBtn = el(
        "button",
        {
          class: "btn secondary mt-1",
          onclick: async () => {
            const v = newTargetInput.value.trim();
            if (!v) return toast("Informe um alvo para salvar");
            try {
              const headers = getAuthHeaders();
              const res = await fetch(`${API_BASE}/api/aba/alvos`, {
                method: "POST",
                headers,
                body: JSON.stringify({ label: v }),
              });
              if (!res.ok) {
                console.error("Erro ao salvar alvo ABA", await res.text());
                return toast("Erro ao salvar alvo no servidor");
              }
              const created = await res.json();
              // Atualiza store local
              Store.set((s) => ({
                ...s,
                targets: [
                  ...s.targets,
                  { id: String(created.id), label: created.label },
                ],
              }));

              // Adiciona no checklist e marca como selecionado
              selectedTargetIds.add(String(created.id));
              targetsChecklist.addTarget({
                id: String(created.id),
                label: created.label,
              });
              targetsChecklist.syncTargetText();
              newTargetInput.value = "";
            } catch (e) {
              console.error("ABA+: erro ao salvar alvo", e);
              toast("Falha na comunicação com o servidor");
            }
          },
        },
        "Salvar alvo na lista"
      );

      const deleteSelectedTargetsBtn = el(
        "button",
        {
          class: "btn danger mt-1",
          onclick: async () => {
            const selected = targetsChecklist.getSelected().map((t) => ({
              id: String(t.id),
              label: String(t.label || ""),
            }));
            if (!selected.length)
              return toast("Marque o(s) alvo(s) que deseja excluir");

            const names = selected
              .map((s) => String(s.label || "").trim())
              .filter(Boolean)
              .join(", ");
            const ok = confirm(
              `Excluir ${selected.length} alvo(s)?\n\n${names || "(sem nome)"}`
            );
            if (!ok) return;

            try {
              const headers = getAuthHeaders();
              for (const s of selected) {
                const res = await fetch(`${API_BASE}/api/aba/alvos/${s.id}`, {
                  method: "DELETE",
                  headers,
                });
                if (!res.ok) {
                  console.error("Erro ao excluir alvo ABA", await res.text());
                  toast("Erro ao excluir um alvo no servidor");
                  return;
                }
              }

              // Atualiza Store e selects
              const removedIds = new Set(selected.map((s) => String(s.id)));
              Store.set((st) => ({
                ...st,
                targets: (st.targets || []).filter(
                  (t) => !removedIds.has(String(t.id))
                ),
              }));

              targetsChecklist.removeTargetsById(Array.from(removedIds));
              targetsChecklist.syncTargetText();

              toast("Alvo(s) excluído(s)");
            } catch (e) {
              console.error("ABA+: erro ao excluir alvo", e);
              toast("Falha na comunicação com o servidor");
            }
          },
        },
        "Excluir alvo selecionado"
      );

      const form = el("div", {}, [
        el("div", {}, [
          el("label", { class: "label" }, "Programa"),
          templateSel,
          el("div", { class: "row wrap mt-1" }, [
            newProgramInput,
            saveProgramBtn,
          ]),
        ]),
        el("div", { class: "mt-2" }, [
          el("label", { class: "label" }, "Alvos"),
          targetsChecklist.wrap,
          el(
            "div",
            { class: "small mt-1" },
            "Marque os alvos desejados (mais simples que Ctrl/Shift)."
          ),
          el("div", { class: "row wrap mt-1" }, [
            newTargetInput,
            saveTargetBtn,
            deleteSelectedTargetsBtn,
          ]),
        ]),
        Field("Paciente *", patientSel),
        Field("Nome do Programa *", name),
        Field("Categoria", category),
        Field("Descrição", description),
        Field("Alvos selecionados", target),
        Field("Critério Atual", criteria),
        program ? Field("Status", status) : "",
        el("div", { class: "row mt-3" }, [
          el(
            "button",
            { class: "btn secondary", onclick: () => Modal.close() },
            "Cancelar"
          ),
          program && program.id
            ? el(
                "button",
                {
                  class: "btn danger",
                  onclick: async () => {
                    const ok = confirm(
                      `Excluir este programa?\n\n${
                        String(program.name || "").trim() || "(sem nome)"
                      }`
                    );
                    if (!ok) return;

                    try {
                      const headers = getAuthHeaders();
                      const res = await fetch(
                        `${API_BASE}/api/aba/programas/${program.id}`,
                        {
                          method: "DELETE",
                          headers,
                        }
                      );
                      if (!res.ok) {
                        console.error(
                          "Erro ao excluir programa ABA",
                          await res.text()
                        );
                        return toast("Erro ao excluir programa no servidor");
                      }
                      await syncFromBackend();
                      Modal.close();
                      toast("Programa excluído");
                    } catch (e) {
                      console.error("ABA+: erro ao excluir programa", e);
                      toast("Falha na comunicação com o servidor");
                    }
                  },
                },
                "Excluir"
              )
            : "",
          el(
            "button",
            {
              class: "btn",
              onclick: async () => {
                if (!patientSel.value) return toast("Selecione o paciente");
                if (!name.value.trim())
                  return toast("Informe o nome do programa");
                const selectedTemplate = PROGRAM_TEMPLATES.find(
                  (t) => t.code === templateSel.value
                );
                const payload = {
                  patientId: patientSel.value,
                  name: name.value,
                  code: selectedTemplate?.code || program?.code || "",
                  description: description.value,
                  category: category.value,
                  targetBehavior: target.value,
                  currentCriteria: criteria.value,
                  status: status.value || "active",
                };
                try {
                  const headers = getAuthHeaders();
                  let res;
                  if (program && program.id) {
                    res = await fetch(
                      `${API_BASE}/api/aba/programas/${program.id}`,
                      {
                        method: "PUT",
                        headers,
                        body: JSON.stringify(payload),
                      }
                    );
                  } else {
                    res = await fetch(`${API_BASE}/api/aba/programas`, {
                      method: "POST",
                      headers,
                      body: JSON.stringify(payload),
                    });
                  }
                  if (!res.ok) {
                    console.error(
                      "Erro ao salvar programa ABA",
                      await res.text()
                    );
                    return toast("Erro ao salvar programa no servidor");
                  }
                  await syncFromBackend();
                  Modal.close();
                } catch (e) {
                  console.error("ABA+: erro ao salvar programa", e);
                  toast("Falha na comunicação com o servidor");
                }
              },
            },
            program ? "Salvar Alterações" : "Criar Programa"
          ),
        ]),
      ]);
      Modal.open(program ? "Editar Programa" : "Novo Programa", form);
    };

    const openSessionForm = (program) => {
      const { therapists } = Store.get();
      const therapistSel = Select(
        therapists.map((t) => [t.id, t.name]),
        "",
        (v) => (therapistSel.value = v),
        "Selecione o terapeuta"
      );
      const date = el("input", {
        class: "input",
        type: "date",
        value: new Date().toISOString().split("T")[0],
      });
      const trials = el("input", {
        class: "input",
        type: "number",
        min: "1",
        value: 10,
      });
      const successes = el("input", {
        class: "input",
        type: "number",
        min: "0",
        value: 0,
      });
      const notes = el("textarea", {
        class: "textarea",
        placeholder: "Anotações sobre a sessão...",
        rows: 3,
      });

      const rateBox = el("div", { class: "badge info mt-2" }, "0%");
      const computeRate = () => {
        const t = Math.max(parseInt(trials.value || "0", 10), 0);
        let s = Math.max(parseInt(successes.value || "0", 10), 0);
        if (s > t) {
          s = t;
          successes.value = String(s);
        }
        const rate = t > 0 ? Math.round((s / t) * 100) : 0;
        rateBox.textContent = `${rate}%`;
      };
      trials.addEventListener("input", computeRate);
      successes.addEventListener("input", computeRate);
      setTimeout(computeRate);

      const form = el("div", {}, [
        el("div", { class: "badge mt-2" }, program.name),
        el(
          "div",
          { class: "small mt-2" },
          `Critério: ${program.currentCriteria}`
        ),
        Field("Terapeuta *", therapistSel),
        Field("Data da Sessão *", date),
        el("div", { class: "row mt-2" }, [
          Field("Tentativas *", trials),
          Field("Acertos *", successes),
        ]),
        el("div", { class: "mt-2" }, [
          el("span", { class: "small" }, "Taxa de Sucesso: "),
          rateBox,
        ]),
        Field("Observações", notes),
        el("div", { class: "row mt-3" }, [
          el(
            "button",
            { class: "btn secondary", onclick: () => Modal.close() },
            "Cancelar"
          ),
          el(
            "button",
            {
              class: "btn",
              onclick: async () => {
                if (!therapistSel.value) return toast("Selecione o terapeuta");
                const t = Math.max(parseInt(trials.value || "0", 10), 0);
                const s = Math.max(parseInt(successes.value || "0", 10), 0);
                if (t <= 0) return toast("Tentativas deve ser maior que 0");
                if (s > t) return toast("Acertos não pode exceder tentativas");
                try {
                  const headers = getAuthHeaders();
                  const res = await fetch(`${API_BASE}/api/aba/sessoes`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                      programId: program.id,
                      patientId: program.patientId,
                      therapistId: therapistSel.value,
                      date: date.value,
                      trials: t,
                      successes: s,
                      notes: notes.value,
                    }),
                  });
                  if (!res.ok) {
                    console.error(
                      "Erro ao registrar sessão ABA",
                      await res.text()
                    );
                    return toast("Erro ao registrar sessão no servidor");
                  }
                  await syncFromBackend();
                  Modal.close();
                } catch (e) {
                  console.error("ABA+: erro ao registrar sessão", e);
                  toast("Falha na comunicação com o servidor");
                }
              },
            },
            "Registrar Sessão"
          ),
        ]),
      ]);
      Modal.open("Registrar Sessão", form);
    };

    const onDelete = async (id) => {
      try {
        const headers = getAuthHeaders();
        const res = await fetch(`${API_BASE}/api/aba/programas/${id}`, {
          method: "DELETE",
          headers,
        });
        if (!res.ok) {
          console.error("Erro ao excluir programa ABA", await res.text());
          return toast("Erro ao excluir programa no servidor");
        }
        await syncFromBackend();
      } catch (e) {
        console.error("ABA+: erro ao excluir programa", e);
        toast("Falha na comunicação com o servidor");
      }
    };

    wrap.appendChild(header);
    wrap.appendChild(listWrap);
    renderList();
    return wrap;
  },

  Performance() {
    const wrap = el("div");
    const { patients, programs, sessions } = Store.get();

    const patientSel = Select(
      patients.map((p) => [p.id, p.name]),
      "",
      (v) => renderPrograms(v),
      "Escolha um paciente"
    );

    wrap.appendChild(
      el(
        "div",
        { class: "card" },
        el("div", { class: "card-body" }, [
          Field("Selecione um Paciente", patientSel),
        ])
      )
    );

    const progWrap = el("div", { class: "mt-4" });
    wrap.appendChild(progWrap);

    const renderPrograms = (patientId) => {
      progWrap.innerHTML = "";
      if (!patientId) {
        progWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el(
              "div",
              { class: "card-body" },
              "Selecione um paciente para visualizar os gráficos de desempenho"
            )
          )
        );
        return;
      }
      const pPrograms = programs.filter((p) => p.patientId === patientId);
      if (!pPrograms.length) {
        progWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el(
              "div",
              { class: "card-body" },
              "Este paciente não possui programas cadastrados"
            )
          )
        );
        return;
      }

      const allSessions = sessions.filter((s) =>
        pPrograms.some((p) => p.id === s.programId)
      );
      const totalSessions = allSessions.length;
      const successPct = totalSessions
        ? Math.round(
            (allSessions.reduce((a, s) => a + s.successes, 0) /
              allSessions.reduce((a, s) => a + s.trials, 0)) *
              100
          )
        : 0;
      const summary = el("div", { class: "grid cols-3" }, [
        el(
          "div",
          { class: "card" },
          el("div", { class: "card-body" }, [
            el("div", { class: "small" }, "Programas Ativos"),
            el("div", { class: "title" }, String(pPrograms.length)),
          ])
        ),
        el(
          "div",
          { class: "card" },
          el("div", { class: "card-body" }, [
            el("div", { class: "small" }, "Total de Sessões"),
            el("div", { class: "title" }, String(totalSessions)),
          ])
        ),
        el(
          "div",
          { class: "card" },
          el("div", { class: "card-body" }, [
            el("div", { class: "small" }, "Taxa Média de Sucesso"),
            el("div", { class: "title" }, `${successPct}%`),
          ])
        ),
      ]);
      progWrap.appendChild(summary);

      pPrograms.forEach((pr) => {
        const prSessions = sessions
          .filter((s) => s.programId === pr.id)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        const card = el(
          "div",
          { class: "card mt-4" },
          el("div", { class: "card-body" }, [
            el("div", { class: "row space-between" }, [
              el("div", {}, [
                el("div", { class: "title" }, pr.name),
                el("div", { class: "small mt-2" }, pr.description || ""),
              ]),
              el(
                "span",
                { class: pr.status === "active" ? "badge success" : "badge" },
                pr.status === "active"
                  ? "Ativo"
                  : pr.status === "paused"
                  ? "Pausado"
                  : "Concluído"
              ),
            ]),
            prSessions.length
              ? (() => {
                  const canvas = el("canvas", {
                    style: "max-width:100%;height:260px;margin-top:12px",
                  });
                  setTimeout(() => drawLineChart(canvas, prSessions), 0);
                  return canvas;
                })()
              : el(
                  "div",
                  { class: "small mt-3" },
                  "Nenhuma sessão registrada para este programa"
                ),
          ])
        );
        progWrap.appendChild(card);
      });
    };

    const drawLineChart = (canvas, prSessions) => {
      const labels = prSessions
        .map((s) => new Date(s.date))
        .map(
          (d) =>
            `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
              .toString()
              .padStart(2, "0")}`
        );
      const data = prSessions.map((s) =>
        Math.round((s.successes / s.trials) * 100)
      );
      new Chart(canvas.getContext("2d"), {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Taxa de Sucesso",
              data,
              borderColor: getComputedStyle(document.documentElement)
                .getPropertyValue("--primary")
                .trim(),
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } },
          },
        },
      });
    };

    return wrap;
  },

  Evolution() {
    const wrap = el("div");
    const { patients, programs, criteriaEvolutions, sessions } = Store.get();

    let charts = [];

    const patientSel = Select(
      patients.map((p) => [p.id, p.name]),
      "",
      (v) => render(v),
      "Escolha um paciente"
    );
    wrap.appendChild(
      el(
        "div",
        { class: "card" },
        el("div", { class: "card-body" }, [
          Field("Selecione um Paciente", patientSel),
        ])
      )
    );
    const listWrap = el("div", { class: "mt-4" });
    wrap.appendChild(listWrap);

    const render = (patientId) => {
      // Limpa gráficos antigos
      charts.forEach(
        (c) => c && typeof c.destroy === "function" && c.destroy()
      );
      charts = [];

      listWrap.innerHTML = "";
      if (!patientId) {
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el(
              "div",
              { class: "card-body" },
              "Selecione um paciente para visualizar as evoluções"
            )
          )
        );
        return;
      }

      const pPrograms = programs.filter((p) => p.patientId === patientId);
      if (!pPrograms.length) {
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el(
              "div",
              { class: "card-body" },
              "Este paciente não possui programas cadastrados"
            )
          )
        );
        return;
      }

      pPrograms.forEach((program) => {
        const evols = criteriaEvolutions
          .filter((e) => e.programId === program.id)
          .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));

        // Construímos série temporal de desempenho a partir das sessões ABA
        const progSessions = sessions
          .filter(
            (s) => s.programId === program.id && s.patientId === patientId
          )
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        const btn = el(
          "button",
          { class: "btn", onclick: () => openForm(program) },
          "+ Evoluir Critério"
        );

        const chartContainer = el("div", { class: "mt-3" });
        let chartCanvas = null;

        if (progSessions.length) {
          chartCanvas = el("canvas");
          chartContainer.appendChild(chartCanvas);
        } else {
          chartContainer.appendChild(
            el(
              "div",
              { class: "small" },
              "Ainda não há sessões registradas para este programa."
            )
          );
        }

        const body = el("div", {}, [
          el("div", { class: "row space-between" }, [
            el("div", { class: "title" }, program.name),
            btn,
          ]),
          el(
            "div",
            { class: "small mt-2" },
            `Critério atual: ${program.currentCriteria}`
          ),
          chartContainer,
          evols.length
            ? el(
                "div",
                { class: "mt-3" },
                evols.map((e) =>
                  el(
                    "div",
                    { class: "card mt-2" },
                    el("div", { class: "card-body" }, [
                      el(
                        "span",
                        { class: "badge" },
                        new Date(e.changedAt).toLocaleString("pt-BR")
                      ),
                      el("div", { class: "row mt-2" }, [
                        el(
                          "span",
                          {
                            class: "small",
                            style: "text-decoration:line-through",
                          },
                          e.previousCriteria
                        ),
                        el("span", { class: "small" }, " → "),
                        el("span", { class: "badge info" }, e.newCriteria),
                      ]),
                      el("div", { class: "small mt-2" }, `Motivo: ${e.reason}`),
                    ])
                  )
                )
              )
            : el("div", { class: "small mt-3" }, "Nenhuma evolução registrada"),
        ]);

        const card = el(
          "div",
          { class: "card mt-3" },
          el("div", { class: "card-body" }, body)
        );
        listWrap.appendChild(card);

        // Cria o gráfico após o card estar no DOM
        if (chartCanvas && typeof Chart !== "undefined") {
          const labels = progSessions.map((s) =>
            new Date(s.date).toLocaleDateString("pt-BR")
          );
          const data = progSessions.map((s) => {
            const t = Number(s.trials) || 0;
            const ok = Number(s.successes) || 0;
            return t > 0 ? Math.round((ok / t) * 100) : 0;
          });

          const ctx = chartCanvas.getContext("2d");
          const chart = new Chart(ctx, {
            type: "line",
            data: {
              labels,
              datasets: [
                {
                  label: "Taxa de acerto (%)",
                  data,
                  borderColor: "#2563eb",
                  backgroundColor: "rgba(37, 99, 235, 0.15)",
                  tension: 0.25,
                  fill: true,
                  pointRadius: 3,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  ticks: {
                    callback: (v) => `${v}%`,
                  },
                },
              },
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${ctx.parsed.y}% de acertos`,
                  },
                },
              },
            },
          });
          charts.push(chart);
        }
      });
    };

    const openForm = (program) => {
      const newCriteria = el("input", {
        class: "input",
        placeholder: "Ex: 90% de acertos em 3 sessões consecutivas",
      });
      const reason = el("textarea", {
        class: "textarea",
        rows: 3,
        placeholder: "Descreva o motivo da evolução...",
      });
      const form = el("div", {}, [
        el("div", { class: "badge" }, program.name),
        el(
          "div",
          { class: "small mt-2" },
          `Critério atual: ${program.currentCriteria}`
        ),
        Field("Novo Critério *", newCriteria),
        Field("Motivo da Alteração *", reason),
        el("div", { class: "row mt-3" }, [
          el(
            "button",
            { class: "btn secondary", onclick: () => Modal.close() },
            "Cancelar"
          ),
          el(
            "button",
            {
              class: "btn",
              onclick: async () => {
                if (!newCriteria.value.trim() || !reason.value.trim())
                  return toast("Preencha os campos obrigatórios");
                try {
                  const headers = getAuthHeaders();
                  const evolutionPayload = {
                    programId: program.id,
                    previousCriteria: program.currentCriteria,
                    newCriteria: newCriteria.value,
                    reason: reason.value,
                    changedAt: new Date().toISOString(),
                  };

                  const evoRes = await fetch(`${API_BASE}/api/aba/evolucoes`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(evolutionPayload),
                  });
                  if (!evoRes.ok) {
                    console.error(
                      "Erro ao registrar evolução ABA",
                      await evoRes.text()
                    );
                    return toast("Erro ao registrar evolução no servidor");
                  }

                  // Atualiza também o critério atual do programa no backend
                  const programPayload = {
                    patientId: program.patientId,
                    name: program.name,
                    code: program.code || "",
                    description: program.description || "",
                    category: program.category || "communication",
                    targetBehavior: program.targetBehavior || "",
                    currentCriteria: newCriteria.value,
                    status: program.status || "active",
                  };
                  const progRes = await fetch(
                    `${API_BASE}/api/aba/programas/${program.id}`,
                    {
                      method: "PUT",
                      headers,
                      body: JSON.stringify(programPayload),
                    }
                  );
                  if (!progRes.ok) {
                    console.error(
                      "Erro ao atualizar critério do programa ABA",
                      await progRes.text()
                    );
                    return toast(
                      "Evolução criada, mas falhou ao atualizar o programa"
                    );
                  }

                  await syncFromBackend();
                  Modal.close();
                } catch (e) {
                  console.error("ABA+: erro ao registrar evolução", e);
                  toast("Falha na comunicação com o servidor");
                }
              },
            },
            "Registrar Evolução"
          ),
        ]),
      ]);
      Modal.open("Evoluir Critério", form);
    };

    return wrap;
  },

  Plans() {
    const wrap = el("div");
    const header = el("div", { class: "row space-between mt-2" }, [
      el("div", { class: "title" }, "Planos Terapêuticos"),
      el("button", { class: "btn", onclick: () => openForm() }, "+ Novo Plano"),
    ]);
    const listWrap = el("div", { class: "grid cols-2 mt-4" });

    const renderList = () => {
      listWrap.innerHTML = "";
      const { therapeuticPlans, patients } = Store.get();
      if (!therapeuticPlans.length) {
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el("div", { class: "card-body" }, "Nenhum plano cadastrado")
          )
        );
        return;
      }
      therapeuticPlans.forEach((plan) => {
        const patient = patients.find((p) => p.id === plan.patientId);
        const [statusLabel, statusCls] = Labels.planStatus[
          plan.status || "draft"
        ] || ["Rascunho", "badge"];
        listWrap.appendChild(
          el(
            "div",
            { class: "card" },
            el("div", { class: "card-body" }, [
              el("div", { class: "row space-between" }, [
                el("div", {}, [
                  el("div", { class: "title" }, plan.title),
                  el(
                    "div",
                    { class: "small mt-2" },
                    patient?.name || "Paciente não encontrado"
                  ),
                ]),
                el("span", { class: statusCls }, statusLabel),
              ]),
              el("div", { class: "row mt-2" }, [
                el(
                  "div",
                  { class: "small" },
                  `Início: ${new Date(plan.startDate).toLocaleDateString(
                    "pt-BR"
                  )}`
                ),
                plan.endDate
                  ? el(
                      "div",
                      { class: "small" },
                      `Término: ${new Date(plan.endDate).toLocaleDateString(
                        "pt-BR"
                      )}`
                    )
                  : "",
              ]),
              plan.goals?.length
                ? el("div", { class: "mt-2" }, [
                    el(
                      "div",
                      { class: "small" },
                      `Metas (${plan.goals.length})`
                    ),
                    ...plan.goals
                      .slice(0, 3)
                      .map((g) => el("div", { class: "small mt-1" }, "• " + g)),
                    plan.goals.length > 3
                      ? el(
                          "div",
                          { class: "small mt-1" },
                          `+${plan.goals.length - 3} mais...`
                        )
                      : "",
                  ])
                : "",
              el("div", { class: "row mt-3" }, [
                el(
                  "button",
                  { class: "btn secondary", onclick: () => openForm(plan) },
                  "Editar"
                ),
                el(
                  "button",
                  { class: "btn danger", onclick: () => onDelete(plan.id) },
                  "Excluir"
                ),
              ]),
            ])
          )
        );
      });
    };

    const openForm = (plan) => {
      const { patients } = Store.get();
      const patientSel = Select(
        patients.map((p) => [p.id, p.name]),
        plan?.patientId || "",
        (v) => (patientSel.value = v),
        "Selecione o paciente"
      );
      const title = el("input", {
        class: "input",
        value: plan?.title || "",
        placeholder: "Título do Plano",
      });
      let goals =
        Array.isArray(plan?.goals) && plan.goals.length
          ? [...plan.goals]
          : [""];
      const goalsWrap = el("div");
      const renderGoals = () => {
        goalsWrap.innerHTML = "";
        goals.forEach((g, i) => {
          const row = el("div", { class: "row mt-2" }, [
            el("textarea", {
              class: "textarea",
              rows: 2,
              value: g,
              oninput: (e) => (goals[i] = e.target.value),
            }),
            goals.length > 1
              ? el(
                  "button",
                  {
                    class: "btn danger",
                    onclick: () => {
                      goals.splice(i, 1);
                      renderGoals();
                    },
                  },
                  "X"
                )
              : "",
          ]);
          goalsWrap.appendChild(row);
        });
      };
      renderGoals();
      const addGoalBtn = el(
        "button",
        {
          class: "btn secondary mt-2",
          onclick: () => {
            goals.push("");
            renderGoals();
          },
        },
        "+ Adicionar Meta"
      );
      const start = el("input", {
        class: "input",
        type: "date",
        value: plan?.startDate || new Date().toISOString().split("T")[0],
      });
      const end = el("input", {
        class: "input",
        type: "date",
        value: plan?.endDate || "",
      });
      const status = Select(
        Object.entries({
          draft: "Rascunho",
          active: "Ativo",
          completed: "Concluído",
        }),
        plan?.status || "draft",
        (v) => (status.value = v)
      );

      const form = el("div", {}, [
        Field("Paciente *", patientSel),
        Field("Título do Plano *", title),
        el("div", { class: "row space-between mt-2" }, [
          el("div", { class: "label" }, "Metas e Objetivos"),
          addGoalBtn,
        ]),
        goalsWrap,
        el("div", { class: "row mt-2" }, [
          Field("Data de Início *", start),
          Field("Data de Término", end),
        ]),
        Field("Status", status),
        el("div", { class: "row mt-3" }, [
          el(
            "button",
            { class: "btn secondary", onclick: () => Modal.close() },
            "Cancelar"
          ),
          el(
            "button",
            {
              class: "btn",
              onclick: async () => {
                if (!patientSel.value) return toast("Selecione o paciente");
                if (!title.value.trim())
                  return toast("Informe o título do plano");
                const cleaned = goals.map((g) => g.trim()).filter(Boolean);
                const payload = {
                  patientId: patientSel.value,
                  title: title.value,
                  goals: cleaned,
                  startDate: start.value,
                  endDate: end.value,
                  status: status.value || "draft",
                };
                try {
                  const headers = getAuthHeaders();
                  let res;
                  if (plan && plan.id) {
                    res = await fetch(`${API_BASE}/api/aba/planos/${plan.id}`, {
                      method: "PUT",
                      headers,
                      body: JSON.stringify(payload),
                    });
                  } else {
                    res = await fetch(`${API_BASE}/api/aba/planos`, {
                      method: "POST",
                      headers,
                      body: JSON.stringify(payload),
                    });
                  }
                  if (!res.ok) {
                    console.error("Erro ao salvar plano ABA", await res.text());
                    return toast("Erro ao salvar plano no servidor");
                  }
                  await syncFromBackend();
                  Modal.close();
                } catch (e) {
                  console.error("ABA+: erro ao salvar plano", e);
                  toast("Falha na comunicação com o servidor");
                }
              },
            },
            plan ? "Salvar Alterações" : "Criar Plano"
          ),
        ]),
      ]);

      Modal.open(plan ? "Editar Plano" : "Novo Plano Terapêutico", form);
    };

    const onDelete = async (id) => {
      try {
        const headers = getAuthHeaders();
        const res = await fetch(`${API_BASE}/api/aba/planos/${id}`, {
          method: "DELETE",
          headers,
        });
        if (!res.ok) {
          console.error("Erro ao excluir plano ABA", await res.text());
          return toast("Erro ao excluir plano no servidor");
        }
        await syncFromBackend();
      } catch (e) {
        console.error("ABA+: erro ao excluir plano", e);
        toast("Falha na comunicação com o servidor");
      }
    };

    wrap.appendChild(header);
    wrap.appendChild(listWrap);
    renderList();
    return wrap;
  },

  NotFound() {
    return el(
      "div",
      { class: "center", style: "min-height:60vh" },
      el("div", {}, [
        el("div", { class: "title" }, "404 - Página não encontrada"),
        el("a", { class: "btn mt-3", href: "#/" }, "Voltar ao Início"),
      ])
    );
  },
};

Router.mount("/", "Dashboard", Views.Dashboard);
Router.mount("/therapists", "Terapeutas", Views.Therapists);
Router.mount("/patients", "Pacientes", Views.Patients);
Router.mount("/programs", "Programas", Views.Programs);
Router.mount(
  "/pastas-curriculares",
  "Pastas Curriculares",
  Views.CurricularFolders
);
Router.mount("/performance", "Desempenho", Views.Performance);
Router.mount("/evolution", "Evolução de Critério", Views.Evolution);
Router.mount("/plans", "Planos Terapêuticos", Views.Plans);
Router.mount("*", "Não Encontrado", Views.NotFound);

const initABA = async () => {
  await syncFromBackend();
  Router.render();
};

initABA();
