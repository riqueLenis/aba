document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const API_BASE = "https://aba-aos0.onrender.com";
  const sidebarLinks = document.querySelectorAll(".sidebar nav a");
  const contentSections = document.querySelectorAll(".content-section");
  const featureCards = document.querySelectorAll(".feature-card");
  const logoutLink = document.getElementById("logout-link");
  const userAvatarSpan = document.querySelector(".user-avatar span");
  const mainModal = document.getElementById("main-modal");
  //modulo pacientes
  const pacienteForm = document.getElementById("pacienteForm");
  const pacienteIdInput = document.getElementById("pacienteId");
  const pacientesViewList = document.getElementById("pacientes-view-list");
  const pacientesViewForm = document.getElementById("pacientes-view-form");
  const pacientesViewDetail = document.getElementById("pacientes-view-detail");
  const showPacienteFormBtn = document.getElementById(
    "show-add-paciente-form-btn"
  );
  const backToListBtn = document.getElementById("back-to-list-btn");
  const detailBackToListBtn = document.getElementById(
    "detail-back-to-list-btn"
  );
  const detailHeader = document.querySelector(
    "#pacientes-view-detail .page-header"
  );
  //modulo sessoes e agenda
  const patientSelector = document.getElementById("patient-selector");
  const sessionListContainer = document.getElementById(
    "session-list-container"
  );
  const sessionFormContainer = document.getElementById(
    "session-form-container"
  );
  const showSessionFormBtn = document.getElementById(
    "show-add-session-form-btn"
  );
  const cancelSessionFormBtn = document.getElementById(
    "cancel-session-form-btn"
  );
  const sessionForm = document.getElementById("sessionForm");
  const sessionIdInput = document.getElementById("sessionId");
  const sessionFormPatientName = document.getElementById(
    "session-form-patient-name"
  );
  const curricularFolderSelector = document.getElementById(
    "curricular-folder-selector"
  );
  const curricularFolderDetails = document.getElementById(
    "curricular-folder-details"
  );
  const sessionTherapistGroup = document.getElementById(
    "session-therapist-group"
  );
  const sessionTherapistSelector = document.getElementById(
    "session-therapist-selector"
  );
  //modulo modal
  const sessionDetailModal = document.getElementById("session-detail-modal");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const modalBodyContent = document.getElementById("modal-body-content");
  const modalFooterContent = document.getElementById("modal-footer-content");
  const token = localStorage.getItem("psyhead-token");
  const nomeTerapeuta = localStorage.getItem("terapeuta-nome");
  const userRole = localStorage.getItem("user-role");
  let calendar;

  // Bloqueio pontual de acesso financeiro para logins específicos (admin mantém acesso total)
  const FINANCE_BLOCKED_EMAILS = new Set([
    "ana.suzuki07@gmail.com",
    "taismacieldosantos@gmail.com",
    "magroisabella13@gmail.com",
    "nucleocomportamentall@gmail.com",
  ]);

  // Bloqueio pontual de campos sensíveis no agendamento de sessões
  // (remove as funcionalidades de "valor" e "status do pagamento" apenas para logins específicos)
  const SESSION_PAYMENT_FIELDS_BLOCKED_EMAILS = new Set([
    "ana.suzuki07@gmail.com",
    "taismacieldosantos@gmail.com",
    "duda.capuano09@gmail.com",
    "simoesamanda84@gmail.com",
    "caetano7799@hotmail.com",
    "magroisabella13@gmail.com",
  ]);

  const parseJwtPayload = (jwt) => {
    try {
      const parts = String(jwt || "").split(".");
      if (parts.length < 2) return null;
      const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = payload + "===".slice((payload.length + 3) % 4);
      const json = decodeURIComponent(
        atob(padded)
          .split("")
          .map((c) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`)
          .join("")
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const isFinanceBlockedUser = () => {
    if (!token) return false;
    if (userRole === "admin") return false;
    const payload = parseJwtPayload(token);
    const email = String(payload?.email || "").trim().toLowerCase();
    return email ? FINANCE_BLOCKED_EMAILS.has(email) : false;
  };

  const isSessionPaymentFieldsBlockedUser = () => {
    if (!token) return false;
    if (userRole === "admin") return false;
    if (userRole !== "terapeuta") return false;
    const payload = parseJwtPayload(token);
    const email = String(payload?.email || "").trim().toLowerCase();
    return email ? SESSION_PAYMENT_FIELDS_BLOCKED_EMAILS.has(email) : false;
  };

  const financeBlocked = isFinanceBlockedUser();
  const sessionPaymentFieldsBlocked = isSessionPaymentFieldsBlockedUser();

  const hideNavItem = (linkId) => {
    const link = document.getElementById(linkId);
    if (link && link.parentElement) {
      link.parentElement.classList.add("hidden");
    }
  };

  const hideFinanceUI = () => {
    // Sidebar
    hideNavItem("financeiro-link");

    // Dashboard card (Faturamento)
    const faturamentoEl = document.getElementById("stat-faturamento-mes");
    const faturamentoCard = faturamentoEl?.closest?.(".stat-card");
    if (faturamentoCard) faturamentoCard.classList.add("hidden");

    // Feature card
    document
      .querySelectorAll('.feature-card[data-target="financeiro-link"]')
      .forEach((card) => card.classList.add("hidden"));

    // Seção Financeiro
    const financeiroSection = document.getElementById("financeiro-section");
    if (financeiroSection) financeiroSection.classList.add("hidden");
  };

  const hideSessionPaymentFieldsUI = () => {
    const valorEl = document.getElementById("valor_sessao");
    const valorGroup = valorEl?.closest?.(".form-group");
    if (valorGroup) valorGroup.classList.add("hidden");
    if (valorEl) valorEl.value = "";

    const statusEl = document.getElementById("status_pagamento");
    const statusGroup = statusEl?.closest?.(".form-group");
    if (statusGroup) statusGroup.classList.add("hidden");
    if (statusEl) statusEl.value = "Pendente";
  };

  let allPacientes = [];
  let terapeutasDisponiveis = [];
  let curricularFoldersCache = [];
  let pacientesDropdownCache = [];

  const ensureTherapistsLoaded = async () => {
    if (userRole !== "admin") return;
    if (terapeutasDisponiveis.length > 0) return;
    try {
      const resp = await fetch(`${API_BASE}/api/terapeutas-lista`, {
        headers: getAuthHeaders(),
      });
      if (!resp.ok) throw new Error("Falha ao carregar terapeutas.");
      terapeutasDisponiveis = await resp.json();
    } catch (e) {
      console.error("Erro ao buscar lista de terapeutas", e);
      terapeutasDisponiveis = [];
    }
  };

  // ABA - Avaliação em tempo real (sem alterar schema)
  // Armazena o registro no campo resumo_sessao em um bloco JSON delimitado.
  const ABA_EVAL_BLOCK_START = "\n\n[ABA_AVALIACAO]\n";
  const ABA_EVAL_BLOCK_END = "\n[/ABA_AVALIACAO]\n";
  const ABA_ATTEMPT_CODES = ["-", "AFT", "AFP", "AG", "AV", "+"];

  let abaLiveEval = null;
  let abaLiveEvalTimer = null;

  const splitResumoSessao = (raw) => {
    const text = String(raw || "");
    const startIdx = text.indexOf(ABA_EVAL_BLOCK_START);
    const endIdx = startIdx >= 0 ? text.indexOf(ABA_EVAL_BLOCK_END, startIdx) : -1;
    if (startIdx < 0 || endIdx < 0) {
      return { notes: text, eval: null };
    }

    const notes = (text.slice(0, startIdx) + text.slice(endIdx + ABA_EVAL_BLOCK_END.length)).trimEnd();
    const jsonRaw = text.slice(startIdx + ABA_EVAL_BLOCK_START.length, endIdx).trim();
    try {
      const parsed = JSON.parse(jsonRaw);
      return { notes, eval: parsed };
    } catch {
      return { notes, eval: null };
    }
  };

  const mergeResumoSessao = (notes, evalObj) => {
    const base = splitResumoSessao(notes || "").notes.trimEnd();
    if (!evalObj) return base;
    return (
      base +
      ABA_EVAL_BLOCK_START +
      JSON.stringify(evalObj) +
      ABA_EVAL_BLOCK_END
    ).trimEnd();
  };

  const stopAbaTimer = () => {
    if (abaLiveEvalTimer) {
      clearInterval(abaLiveEvalTimer);
      abaLiveEvalTimer = null;
    }
  };

  const formatElapsed = (startIso, endIso) => {
    if (!startIso) return "00:00";
    const start = new Date(startIso).getTime();
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    const sec = Math.max(0, Math.floor((end - start) / 1000));
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const buildAbaEvalFromFolder = (folder, existingEval) => {
    const programas = Array.isArray(folder?.programas) ? folder.programas : [];
    const alvos = Array.isArray(folder?.alvos) ? folder.alvos : [];
    const totalAttempts =
      Number(existingEval?.totalAttempts) > 0
        ? Number(existingEval.totalAttempts)
        : 2;

    const base = {
      version: 1,
      folderId: String(folder?.id ?? ""),
      folderName: String(folder?.nome ?? ""),
      startedAt: existingEval?.startedAt || null,
      endedAt: existingEval?.endedAt || null,
      started: Boolean(existingEval?.started),
      totalAttempts,
      rows: [],
    };

    const existingRows = Array.isArray(existingEval?.rows) ? existingEval.rows : [];
    const existingMap = new Map(
      existingRows
        .filter((r) => r && r.programId != null && r.targetId != null)
        .map((r) => [`${String(r.programId)}::${String(r.targetId)}`, r])
    );

    programas.forEach((p) => {
      const programId = String(p?.id ?? p?.codigo ?? p?.nome ?? "");
      const programName = String(p?.nome ?? p?.label ?? p?.codigo ?? programId);

      alvos.forEach((a) => {
        const targetId = String(a?.id ?? a?.codigo ?? a?.label ?? "");
        const targetLabel = String(a?.label ?? a?.nome ?? a?.codigo ?? targetId);

        const key = `${programId}::${targetId}`;
        const prev = existingMap.get(key);
        const attempts = Array.isArray(prev?.attempts) ? prev.attempts.slice(0, totalAttempts) : [];
        while (attempts.length < totalAttempts) attempts.push(null);

        base.rows.push({
          programId,
          programName,
          targetId,
          targetLabel,
          attempts,
        });
      });
    });

    return base;
  };

  const getAbaRow = (programId, targetId) => {
    if (!abaLiveEval || !Array.isArray(abaLiveEval.rows)) return null;
    return (
      abaLiveEval.rows.find(
        (r) => String(r.programId) === String(programId) && String(r.targetId) === String(targetId)
      ) || null
    );
  };

  const updateAbaEvalUI = () => {
    if (!curricularFolderDetails) return;
    if (!abaLiveEval) return;

    const headerTimer = curricularFolderDetails.querySelector("[data-aba-elapsed]");
    if (headerTimer)
      headerTimer.textContent = formatElapsed(abaLiveEval.startedAt, abaLiveEval.endedAt);

    curricularFolderDetails
      .querySelectorAll("[data-aba-row]")
      .forEach((rowEl) => {
        const programId = rowEl.getAttribute("data-program-id");
        const targetId = rowEl.getAttribute("data-target-id");
        const row = getAbaRow(programId, targetId);
        if (!row) return;

        const filled = row.attempts.filter(Boolean).length;
        const total = abaLiveEval.totalAttempts;
        const current = Math.min(filled + 1, total);

        const attemptTextEl = rowEl.querySelector("[data-aba-attempt-text]");
        if (attemptTextEl) {
          attemptTextEl.textContent = filled >= total ? `Tentativas: ${total}/${total}` : `Tentativa ${current}/${total}`;
        }

        const historyEl = rowEl.querySelector("[data-aba-history]");
        if (historyEl) {
          historyEl.innerHTML = "";
          row.attempts.forEach((code, idx) => {
            const pill = document.createElement("span");
            pill.className = "aba-attempt-pill";
            pill.textContent = code ? String(code) : `${idx + 1}`;
            if (code) pill.classList.add("filled");
            historyEl.appendChild(pill);
          });
        }

        rowEl.querySelectorAll("button[data-aba-code]").forEach((btn) => {
          const disabled = !abaLiveEval.started || filled >= total;
          btn.disabled = disabled;
        });

        const clearBtn = rowEl.querySelector("button[data-aba-clear]");
        if (clearBtn) clearBtn.disabled = !abaLiveEval.started;
      });

    const canRunEval = userRole === "terapeuta";

    const startBtn = curricularFolderDetails.querySelector(
      "button[data-aba-start]"
    );
    const stopBtn = curricularFolderDetails.querySelector(
      "button[data-aba-stop]"
    );
    if (startBtn) startBtn.disabled = abaLiveEval.started;
    if (stopBtn) stopBtn.disabled = !abaLiveEval.started;

    // Admin (secretaria) não executa avaliação — só agenda.
    if (!canRunEval) {
      if (startBtn) startBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = true;
    }

    const attemptsInput = curricularFolderDetails.querySelector("input[data-aba-total-attempts]");
    if (attemptsInput) attemptsInput.disabled = abaLiveEval.started;
  };

  const renderAbaEvalUI = () => {
    if (!curricularFolderDetails) return;
    curricularFolderDetails.innerHTML = "";

    if (!abaLiveEval) {
      curricularFolderDetails.classList.add("hidden");
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "aba-eval";

    const header = document.createElement("div");
    header.className = "aba-eval-header";

    const title = document.createElement("div");
    title.className = "aba-eval-title";
    title.textContent = `Avaliação ABA+ — ${abaLiveEval.folderName || "Pasta curricular"}`;

    const actions = document.createElement("div");
    actions.className = "aba-eval-actions";

    const attemptsLabel = document.createElement("label");
    attemptsLabel.className = "aba-eval-attempts-label";
    attemptsLabel.textContent = "Tentativas:";

    const attemptsInput = document.createElement("input");
    attemptsInput.type = "number";
    attemptsInput.min = "1";
    attemptsInput.max = "20";
    attemptsInput.value = String(abaLiveEval.totalAttempts || 2);
    attemptsInput.className = "form-input aba-eval-attempts-input";
    attemptsInput.setAttribute("data-aba-total-attempts", "1");

    const elapsed = document.createElement("span");
    elapsed.className = "aba-eval-elapsed";
    elapsed.setAttribute("data-aba-elapsed", "1");
    elapsed.textContent = formatElapsed(abaLiveEval.startedAt, abaLiveEval.endedAt);

    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "btn btn-primary btn-sm";
    startBtn.textContent = "Iniciar atendimento";
    startBtn.setAttribute("data-aba-start", "1");

    const stopBtn = document.createElement("button");
    stopBtn.type = "button";
    stopBtn.className = "btn btn-secondary btn-sm";
    stopBtn.textContent = "Encerrar";
    stopBtn.setAttribute("data-aba-stop", "1");

    actions.append(attemptsLabel, attemptsInput, elapsed, startBtn, stopBtn);
    header.append(title, actions);

    const list = document.createElement("div");
    list.className = "aba-eval-list";

    if (!abaLiveEval.rows.length) {
      const empty = document.createElement("div");
      empty.className = "aba-eval-empty";
      empty.textContent =
        "Nenhum programa/alvo cadastrado nesta pasta curricular. Anexe programas e alvos na ABA+.";
      list.appendChild(empty);
    } else {
      const byProgram = new Map();
      abaLiveEval.rows.forEach((r) => {
        const key = String(r.programId);
        if (!byProgram.has(key)) {
          byProgram.set(key, { programName: r.programName, rows: [] });
        }
        byProgram.get(key).rows.push(r);
      });

      Array.from(byProgram.entries()).forEach(([programId, group]) => {
        const section = document.createElement("div");
        section.className = "aba-program";

        const programTitle = document.createElement("div");
        programTitle.className = "aba-program-title";
        programTitle.textContent = group.programName || `Programa ${programId}`;

        const targetsWrap = document.createElement("div");
        targetsWrap.className = "aba-targets";

        group.rows.forEach((r) => {
          const row = document.createElement("div");
          row.className = "aba-target-row";
          row.setAttribute("data-aba-row", "1");
          row.setAttribute("data-program-id", String(r.programId));
          row.setAttribute("data-target-id", String(r.targetId));

          const left = document.createElement("div");
          left.className = "aba-target-left";

          const targetLabel = document.createElement("div");
          targetLabel.className = "aba-target-label";
          targetLabel.textContent = r.targetLabel;

          const attemptText = document.createElement("div");
          attemptText.className = "aba-target-attempt";
          attemptText.setAttribute("data-aba-attempt-text", "1");
          attemptText.textContent = "Tentativa 1/2";

          left.append(targetLabel, attemptText);

          const controls = document.createElement("div");
          controls.className = "aba-target-controls";

          ABA_ATTEMPT_CODES.forEach((code) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "aba-code-btn";
            b.textContent = code;
            b.setAttribute("data-aba-code", code);
            controls.appendChild(b);
          });

          const clearBtn = document.createElement("button");
          clearBtn.type = "button";
          clearBtn.className = "aba-clear-btn";
          clearBtn.textContent = "Limpar";
          clearBtn.setAttribute("data-aba-clear", "1");
          controls.appendChild(clearBtn);

          const history = document.createElement("div");
          history.className = "aba-target-history";
          history.setAttribute("data-aba-history", "1");

          row.append(left, controls, history);
          targetsWrap.appendChild(row);
        });

        section.append(programTitle, targetsWrap);
        list.appendChild(section);
      });
    }

    wrap.append(header, list);
    curricularFolderDetails.appendChild(wrap);
    curricularFolderDetails.classList.remove("hidden");

    updateAbaEvalUI();
  };

  const handleAbaEvalInteraction = (event) => {
    if (!abaLiveEval || !curricularFolderDetails) return;
    if (userRole !== "terapeuta") return;

    const startBtn = event.target.closest?.("button[data-aba-start]");
    if (startBtn) {
      abaLiveEval.started = true;
      abaLiveEval.startedAt = abaLiveEval.startedAt || new Date().toISOString();
      abaLiveEval.endedAt = null;

      stopAbaTimer();
      abaLiveEvalTimer = setInterval(() => updateAbaEvalUI(), 1000);
      updateAbaEvalUI();
      return;
    }

    const stopBtn = event.target.closest?.("button[data-aba-stop]");
    if (stopBtn) {
      abaLiveEval.started = false;
      abaLiveEval.endedAt = new Date().toISOString();
      stopAbaTimer();
      updateAbaEvalUI();
      return;
    }

    const codeBtn = event.target.closest?.("button[data-aba-code]");
    if (codeBtn) {
      if (!abaLiveEval.started) return;
      const rowEl = event.target.closest?.("[data-aba-row]");
      if (!rowEl) return;
      const programId = rowEl.getAttribute("data-program-id");
      const targetId = rowEl.getAttribute("data-target-id");
      const code = codeBtn.getAttribute("data-aba-code");
      if (!programId || !targetId || !code) return;
      const row = getAbaRow(programId, targetId);
      if (!row) return;
      const nextIdx = row.attempts.findIndex((x) => !x);
      if (nextIdx < 0) return;
      row.attempts[nextIdx] = code;
      updateAbaEvalUI();
      return;
    }

    const clearBtn = event.target.closest?.("button[data-aba-clear]");
    if (clearBtn) {
      if (!abaLiveEval.started) return;
      const rowEl = event.target.closest?.("[data-aba-row]");
      if (!rowEl) return;
      const programId = rowEl.getAttribute("data-program-id");
      const targetId = rowEl.getAttribute("data-target-id");
      if (!programId || !targetId) return;
      const row = getAbaRow(programId, targetId);
      if (!row) return;
      row.attempts = Array.from({ length: abaLiveEval.totalAttempts }, () => null);
      updateAbaEvalUI();
    }
  };

  const handleAbaEvalAttemptsChange = (event) => {
    if (!abaLiveEval || !curricularFolderDetails) return;
    if (userRole !== "terapeuta") return;
    const input = event.target;
    if (!input || !input.matches?.("input[data-aba-total-attempts]")) return;
    const nextTotal = Math.max(1, Math.min(20, Number(input.value || 2)));
    if (!Number.isFinite(nextTotal)) return;
    if (abaLiveEval.started) return;
    abaLiveEval.totalAttempts = nextTotal;

    // Ajusta o tamanho dos arrays preservando o histórico do início
    if (Array.isArray(abaLiveEval.rows)) {
      abaLiveEval.rows.forEach((r) => {
        const prev = Array.isArray(r.attempts) ? r.attempts : [];
        const next = prev.slice(0, nextTotal);
        while (next.length < nextTotal) next.push(null);
        r.attempts = next;
      });
    }
    updateAbaEvalUI();
  };

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  const hideAllSections = () =>
    contentSections.forEach((s) => s.classList.add("hidden"));
  const removeActiveClass = () =>
    sidebarLinks.forEach((l) => l.classList.remove("active-nav-link"));

  const activateSection = (sectionId, navLinkId) => {
    hideAllSections();
    const targetSection = document.getElementById(sectionId);
    if (targetSection) targetSection.classList.remove("hidden");

    removeActiveClass();
    const targetNavLink = document.getElementById(navLinkId);
    if (targetNavLink) targetNavLink.classList.add("active-nav-link");
    if (sectionId === "avaliacoes-section") {
      carregarAvaliacoesRecebidas();
      carregarAvaliacoesPendentes();
    }

    if (sectionId === "relatorios-section") {
      const resultadoContainer = document.getElementById(
        "relatorio-resultado-container"
      );
      if (resultadoContainer) resultadoContainer.classList.add("hidden");
    }

    if (sectionId === "usuarios-section") {
      carregarUsuarios();
    }

    if (sectionId === "pacientes-section") goBackToList();
    if (sectionId === "sessoes-section") {
      popularDropdownPacientes();
      sessionListContainer.innerHTML =
        '<p class="info-message">Por favor, selecione um paciente para ver suas sessões.</p>';
      sessionFormContainer.classList.add("hidden");
      if (showSessionFormBtn) showSessionFormBtn.disabled = true;

      if (curricularFolderSelector) {
        curricularFoldersCache = [];
        curricularFolderSelector.innerHTML =
          '<option value="">Selecione um paciente acima</option>';
        curricularFolderSelector.disabled = true;
      }
      if (curricularFolderDetails) {
        curricularFolderDetails.textContent = "";
        curricularFolderDetails.classList.add("hidden");
      }
    }
    if (sectionId === "agenda-section") inicializarCalendario();
    if (sectionId === "financeiro-section") {
      if (financeBlocked) return;
      carregarResumoFinanceiro();
      carregarTransacoesRecentes();
    }
  };

  //esta função decide o que mostrar/esconder com base no papel do usuário
  const setupNavigationForRole = (role) => {
    const hideMenuItem = (linkId) => {
      const link = document.getElementById(linkId);
      if (link && link.parentElement) {
        link.parentElement.classList.add("hidden");
      }
    };

    if (role === "paciente") {
      hideMenuItem("dashboard-link");
      hideMenuItem("pacientes-link");
      hideMenuItem("sessoes-link");
      hideMenuItem("financeiro-link");
      hideMenuItem("avaliacoes-link");
      hideMenuItem("relatorios-link");
      hideMenuItem("usuarios-link");
      hideMenuItem("config-link");
    } else if (role === "terapeuta") {
      hideMenuItem("avaliacoes-link");
      hideMenuItem("relatorios-link");
      hideMenuItem("usuarios-link");
    }
  };

  const goBackToList = () => {
    if (pacientesViewForm) pacientesViewForm.classList.add("hidden");
    if (pacientesViewDetail) pacientesViewDetail.classList.add("hidden");
    if (pacientesViewList) pacientesViewList.classList.remove("hidden");
    const searchInput = document.getElementById("search-pacientes");
    if (searchInput) searchInput.value = "";
    carregarPacientes();
  };

  const carregarMedicacoes = async (pacienteId) => {
    const medicationListDiv = document.getElementById("medication-list");
    if (!medicationListDiv) return;
    medicationListDiv.innerHTML = "<p>Carregando...</p>";
    try {
      const response = await fetch(
        `${API_BASE}/api/pacientes/${pacienteId}/medicacoes`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok) throw new Error("Falha ao buscar medicações.");
      const medicacoes = await response.json();

      medicationListDiv.innerHTML = "";
      if (medicacoes.length === 0) {
        medicationListDiv.innerHTML = "<p>Nenhuma medicação registrada.</p>";
        return;
      }

      medicacoes.forEach((med) => {
        const itemHTML = `
                    <div class="medication-item" data-medicacao-id="${med.id}">
                        <div class="medication-info">
                            <strong>${med.nome_medicamento}</strong>
                            <span>(${med.dosagem || "N/D"}, ${
          med.frequencia || "N/D"
        })</span>
                        </div>
                        <div class="medication-actions">
                            <button class="btn btn-secondary btn-sm edit-med-btn">Editar</button>
                            <button class="btn btn-danger btn-sm delete-med-btn">Excluir</button>
                        </div>
                    </div>
                `;
        medicationListDiv.innerHTML += itemHTML;
      });
    } catch (error) {
      console.error(error);
      medicationListDiv.innerHTML =
        '<p class="error-message">Erro ao carregar medicações.</p>';
    }
  };

  const abrirFormularioMedicacao = async (pacienteId, medicacaoId = null) => {
    const modalTitle = mainModal.querySelector(".modal-title");
    const modalBody = mainModal.querySelector(".modal-body");
    const modalFooter = mainModal.querySelector(".modal-footer");

    modalTitle.textContent = medicacaoId
      ? "Editar Medicação"
      : "Adicionar Nova Medicação";
    modalBody.innerHTML = `
            <form id="medicationForm" class="space-y-6">
                <input type="hidden" id="medPacienteId" value="${pacienteId}">
                <input type="hidden" id="medId" value="${medicacaoId || ""}">
                <div class="form-grid">
                    <div class="form-group col-span-2">
                        <label for="nome_medicamento" class="form-label">Nome do Medicamento</label>
                        <input type="text" id="nome_medicamento" name="nome_medicamento" required class="form-input">
                    </div>
                    <div class="form-group"><label for="dosagem" class="form-label">Dosagem</label><input type="text" id="dosagem" name="dosagem" class="form-input" placeholder="Ex: 50mg"></div>
                    <div class="form-group"><label for="frequencia" class="form-label">Frequência</label><input type="text" id="frequencia" name="frequencia" class="form-input" placeholder="Ex: 2 vezes ao dia"></div>
                    <div class="form-group"><label for="data_inicio" class="form-label">Data de Início</label><input type="date" id="data_inicio" name="data_inicio" required class="form-input"></div>
                    <div class="form-group"><label for="data_termino" class="form-label">Data de Término (Opcional)</label><input type="date" id="data_termino" name="data_termino" class="form-input"></div>
                    <div class="form-group col-span-2"><label for="medico_prescritor" class="form-label">Médico Prescritor</label><input type="text" id="medico_prescritor" name="medico_prescritor" class="form-input"></div>
                    <div class="form-group col-span-2"><label for="observacoes" class="form-label">Observações</label><textarea id="observacoes" name="observacoes" rows="3" class="form-input"></textarea></div>
                </div>
            </form>
        `;

    modalFooter.innerHTML = `
            <button id="cancel-med-btn" class="btn btn-secondary">Cancelar</button>
            <button id="save-med-btn" class="btn btn-primary">Salvar Medicação</button>
        `;
    if (medicacaoId) {
      try {
        const response = await fetch(
          `${API_BASE}/api/medicacoes/${medicacaoId}`,
          {
            headers: getAuthHeaders(),
          }
        );
        if (!response.ok)
          throw new Error("Falha ao carregar dados da medicação.");
        const med = await response.json();

        const form = document.getElementById("medicationForm");
        form.elements["nome_medicamento"].value = med.nome_medicamento;
        form.elements["dosagem"].value = med.dosagem;
        form.elements["frequencia"].value = med.frequencia;
        if (med.data_inicio)
          form.elements["data_inicio"].value = new Date(med.data_inicio)
            .toISOString()
            .split("T")[0];
        if (med.data_termino)
          form.elements["data_termino"].value = new Date(med.data_termino)
            .toISOString()
            .split("T")[0];
        form.elements["medico_prescritor"].value = med.medico_prescritor;
        form.elements["observacoes"].value = med.observacoes;
      } catch (error) {
        console.error(error);
        alert("Não foi possível carregar os dados para edição.");
        return;
      }
    }

    mainModal.classList.remove("hidden");
    document.getElementById("cancel-med-btn").onclick = () =>
      mainModal.classList.add("hidden");
    document.getElementById("save-med-btn").onclick = () => salvarMedicacao();
  };

  const salvarMedicacao = async () => {
    const form = document.getElementById("medicationForm");
    const pacienteId = form.elements["medPacienteId"].value;
    const medicacaoId = form.elements["medId"].value;

    const medData = {
      nome_medicamento: form.elements["nome_medicamento"].value,
      dosagem: form.elements["dosagem"].value,
      frequencia: form.elements["frequencia"].value,
      data_inicio: form.elements["data_inicio"].value,
      data_termino: form.elements["data_termino"].value || null,
      medico_prescritor: form.elements["medico_prescritor"].value,
      observacoes: form.elements["observacoes"].value,
    };

    const method = medicacaoId ? "PUT" : "POST";
    const url = medicacaoId
      ? `${API_BASE}/api/medicacoes/${medicacaoId}`
      : `${API_BASE}/api/pacientes/${pacienteId}/medicacoes`;

    try {
      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(medData),
      });
      if (!response.ok) throw new Error("Falha ao salvar medicação.");
      const result = await response.json();
      alert(result.message);
      mainModal.classList.add("hidden");
      carregarMedicacoes(pacienteId);
    } catch (error) {
      alert(error.message);
    }
  };
  const excluirMedicacao = async (medicacaoId, pacienteId) => {
    if (
      !confirm(
        "Você tem certeza que deseja excluir esta medicação? Esta ação é permanente."
      )
    ) {
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE}/api/medicacoes/${medicacaoId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok) throw new Error("Falha ao excluir a medicação.");
      const result = await response.json();
      alert(result.message);
      carregarMedicacoes(pacienteId);
    } catch (error) {
      alert(error.message);
    }
  };

  const carregarDashboardStats = async () => {
    const nomeTerapeuta = localStorage.getItem("terapeuta-nome");
    const welcomeMsg = document.getElementById("dashboard-welcome-message");
    if (welcomeMsg && nomeTerapeuta) {
      welcomeMsg.textContent = `Bem-vindo(a) de volta, ${nomeTerapeuta}!`;
    }
    const dateMsg = document.getElementById("dashboard-current-date");
    if (dateMsg) {
      const hoje = new Date();
      const opcoes = { day: "numeric", month: "long", year: "numeric" };
      dateMsg.textContent = `Aqui está um resumo da sua clínica hoje, ${hoje.toLocaleDateString(
        "pt-BR",
        opcoes
      )}.`;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/dashboard/stats`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok)
        throw new Error("Falha ao buscar estatísticas do dashboard.");

      const stats = await response.json();
      const formatarMoeda = (valor) => {
        return parseFloat(valor || 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
      };

      document.getElementById("stat-pacientes-ativos").textContent =
        stats.pacientes_ativos;
      document.getElementById("stat-sessoes-hoje").textContent =
        stats.sessoes_hoje;
      document.getElementById("stat-faturamento-mes").textContent =
        formatarMoeda(stats.faturamento_mes);
    } catch (error) {
      console.error("Erro ao carregar estatísticas do dashboard:", error);
      document.getElementById("stat-pacientes-ativos").textContent = "-";
      document.getElementById("stat-sessoes-hoje").textContent = "-";
      document.getElementById("stat-faturamento-mes").textContent = "-";
    }
  };

  const carregarResumoFinanceiro = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/financeiro/resumo`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok) throw new Error("Falha ao buscar resumo financeiro.");
      const resumo = await response.json();
      const formatarMoeda = (valor) => {
        return parseFloat(valor).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
      };

      document.getElementById("faturamento-mes").textContent = formatarMoeda(
        resumo.faturamento_mes
      );
      document.getElementById("a-receber").textContent = formatarMoeda(
        resumo.a_receber
      );
      document.getElementById("sessoes-pagas").textContent =
        resumo.sessoes_pagas;
      document.getElementById("sessoes-pendentes").textContent =
        resumo.sessoes_pendentes;
    } catch (error) {
      console.error(error);
    }
  };
  const carregarTransacoesRecentes = async () => {
    const tbody = document.getElementById("transactions-table-body");
    tbody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
    try {
      const response = await fetch(
        `${API_BASE}/api/financeiro/transacoes`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok) throw new Error("Falha ao buscar transações.");
      const transacoes = await response.json();

      tbody.innerHTML = "";
      if (transacoes.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="4">Nenhuma transação encontrada.</td></tr>';
        return;
      }

      transacoes.forEach((t) => {
        const dataFormatada = new Date(t.data_sessao).toLocaleDateString(
          "pt-BR"
        );
        const statusClass =
          t.status_pagamento === "Pago" ? "status-pago" : "status-pendente";
        const linhaHTML = `
                <tr>
                    <td>${t.paciente_nome}</td>
                    <td>${dataFormatada}</td>
                    <td>${parseFloat(t.valor_sessao).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}</td>
                    <td><span class="status-badge ${statusClass}">${
          t.status_pagamento
        }</span></td>
                </tr>
            `;
        tbody.innerHTML += linhaHTML;
      });
    } catch (error) {
      console.error(error);
      tbody.innerHTML =
        '<tr><td colspan="4" class="error-message">Erro ao carregar transações.</td></tr>';
    }
  };
  const formatarMoeda = (valor) =>
    parseFloat(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const calcularIdade = (dataNascimento) => {
    if (!dataNascimento) return "N/A";
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mes = hoje.getMonth() - nascimento.getMonth();
    if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
      idade--;
    }
    return idade;
  };

  const carregarPacientes = async () => {
    const patientGrid = document.querySelector(".patient-grid");
    if (!patientGrid) return;
    patientGrid.innerHTML = "<p>Carregando pacientes...</p>";

    const userRole = localStorage.getItem("user-role");

    try {
      const response = await fetch(`${API_BASE}/api/pacientes`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Falha ao carregar pacientes.");

      allPacientes = await response.json();
      patientGrid.innerHTML = "";

      if (allPacientes.length === 0) {
        patientGrid.innerHTML = "<p>Nenhum paciente encontrado.</p>";
        return;
      }

      if (userRole === "admin" && terapeutasDisponiveis.length === 0) {
        try {
          const resp = await fetch(
            `${API_BASE}/api/terapeutas-lista`,
            { headers: getAuthHeaders() }
          );
          terapeutasDisponiveis = await resp.json();
        } catch (e) {
          console.error("Erro ao buscar lista de terapeutas");
        }
      }

      renderizarPacientesGrid(allPacientes);
    } catch (error) {
      console.error(error);
      patientGrid.innerHTML = `<p class="error-message">${error.message}</p>`;
    }
  };

  const renderizarPacientesGrid = (pacientes) => {
    const patientGrid = document.querySelector(".patient-grid");
    if (!patientGrid) return;
    patientGrid.innerHTML = "";

    if (pacientes.length === 0) {
      patientGrid.innerHTML = "<p>Nenhum paciente encontrado.</p>";
      return;
    }

    const userRole = localStorage.getItem("user-role");

    pacientes.forEach((paciente) => {
      const card = document.createElement("div");
      card.className = "patient-card";
      card.dataset.pacienteId = paciente.id;

      let cardContent = `
              <div class="patient-card-info">
                  <strong class="patient-name">${
                    paciente.nome_completo
                  }</strong>
                  <span class="patient-phone">${
                    paciente.celular || "Sem celular"
                  }</span>
              </div>
              <div class="patient-card-actions">
                  <button class="btn btn-primary btn-sm view-patient-btn">Ver Prontuário</button>
              </div>
          `;

      if (userRole === "admin") {
        let terapeutaInfo = "";
        if (paciente.terapeuta_id) {
          const terapeuta = terapeutasDisponiveis.find(
            (t) => t.id === paciente.terapeuta_id
          );
          terapeutaInfo = `<span class="patient-owner">Terapeuta: ${
            terapeuta ? terapeuta.nome : "ID " + paciente.terapeuta_id
          }</span>`;
        } else {
          terapeutaInfo = `
                      <span class="patient-owner-none">Terapeuta: Não atribuído</span>
                      <button class="btn btn-secondary btn-sm assign-therapist-btn mt-2">Atribuir</button>
                  `;
        }
        cardContent = `
                  <div class="patient-card-info">
                      <strong class="patient-name">${paciente.nome_completo}</strong>
                      ${terapeutaInfo}
                  </div>
                  <div class="patient-card-actions">
                      <button class="btn btn-primary btn-sm view-patient-btn">Ver Prontuário</button>
                  </div>
              `;
      }

      card.innerHTML = cardContent;
      patientGrid.appendChild(card);
    });
  };

  const filtrarPacientes = () => {
    const searchInput = document.getElementById("search-pacientes");
    const termoBusca = searchInput
      ? searchInput.value.toLowerCase().trim()
      : "";

    if (!termoBusca) {
      renderizarPacientesGrid(allPacientes);
      return;
    }

    const pacientesFiltrados = allPacientes.filter(
      (paciente) =>
        paciente.nome_completo.toLowerCase().includes(termoBusca) ||
        (paciente.cpf && paciente.cpf.toLowerCase().includes(termoBusca))
    );

    renderizarPacientesGrid(pacientesFiltrados);
  };

  const carregarUsuarios = async () => {
    const listBody = document.getElementById("user-list-body");
    listBody.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>';
    try {
      const response = await fetch(`${API_BASE}/api/usuarios`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Falha ao carregar usuários.");

      const usuarios = await response.json();
      listBody.innerHTML = "";

      if (usuarios.length === 0) {
        listBody.innerHTML =
          '<tr><td colspan="3">Nenhum usuário da equipe encontrado.</td></tr>';
        return;
      }

      usuarios.forEach((user) => {
        const statusClass =
          user.tipo_login === "admin" ? "status-pago" : "status-pendente";
        listBody.innerHTML += `
                <tr>
                    <td>${user.nome}</td>
                    <td>${user.email}</td>
                    <td><span class="status-badge ${statusClass}">${user.tipo_login}</span></td>
                    <td>
                        <button class="btn btn-danger btn-sm delete-user-btn" data-user-id="${user.id}">Excluir</button>
                    </td>
                </tr>
            `;
      });
    } catch (error) {
      console.error(error);
      listBody.innerHTML = `<tr><td colspan="3" class="error-message">${error.message}</td></tr>`;
    }
  };

  const userListBody = document.getElementById("user-list-body");
  if (userListBody) {
    userListBody.addEventListener("click", async (event) => {
      const btn = event.target.closest(".delete-user-btn");
      if (!btn || !userListBody.contains(btn)) return;
      const userId = btn.dataset.userId;
      if (!userId) return;

      if (
        !confirm("Confirma a exclusão deste usuário? Esta ação é irreversível.")
      )
        return;

      try {
        const resp = await fetch(
          `${API_BASE}/api/usuarios/${userId}`,
          {
            method: "DELETE",
            headers: getAuthHeaders(),
          }
        );
        const data = await resp.json();
        if (!resp.ok)
          throw new Error(data.error || "Falha ao excluir usuário.");
        alert(data.message || "Usuário excluído com sucesso.");
        carregarUsuarios();
      } catch (e) {
        alert(e.message);
      }
    });
  }

  const submitNovoUsuario = async (event) => {
    event.preventDefault();
    const form = document.getElementById("create-user-form");
    const errorDiv = document.getElementById("create-user-error");
    errorDiv.classList.add("hidden");

    const nome = form.elements["nome"].value;
    const email = form.elements["email"].value;
    const senha = form.elements["senha"].value;
    const tipo_login = form.elements["tipo_login"].value;

    try {
      const response = await fetch(`${API_BASE}/api/usuarios`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ nome, email, senha, tipo_login }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro desconhecido");
      }

      alert("Usuário criado com sucesso!");
      form.reset();
      carregarUsuarios();
    } catch (error) {
      errorDiv.textContent = error.message;
      errorDiv.classList.remove("hidden");
    }
  };

  const mostrarDetalhesPaciente = async (pacienteId) => {
    try {
      const response = await fetch(
        `${API_BASE}/api/pacientes/${pacienteId}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok) throw new Error("Paciente não encontrado");
      const paciente = await response.json();
      document.getElementById("detail-patient-name").textContent =
        paciente.nome_completo;
      document.getElementById("detail-grid-pessoais").innerHTML = `
            <div class="detail-item"><strong>Data de Nasc.</strong><span>${new Date(
              paciente.data_nascimento
            ).toLocaleDateString("pt-BR")}</span></div>
            <div class="detail-item"><strong>Idade</strong><span>${calcularIdade(
              paciente.data_nascimento
            )} anos</span></div>
            <div class="detail-item"><strong>Sexo</strong><span>${
              paciente.sexo
            }</span></div>
            <div class="detail-item"><strong>CPF</strong><span>${
              paciente.cpf || "Não informado"
            }</span></div>
            <div class="detail-item"><strong>RG</strong><span>${
              paciente.rg || "Não informado"
            }</span></div>
            <div class="detail-item"><strong>Nacionalidade</strong><span>${
              paciente.nacionalidade
            }</span></div>
        `;
      document.getElementById("detail-grid-contato").innerHTML = `
            <div class="detail-item"><strong>Celular</strong><span>${
              paciente.celular
            }</span></div>
            <div class="detail-item"><strong>Telefone</strong><span>${
              paciente.telefone || "Não informado"
            }</span></div>
            <div class="detail-item"><strong>E-mail</strong><span>${
              paciente.email || "Não informado"
            }</span></div>
        `;
      document.getElementById("detail-grid-clinicos").innerHTML = `
            <div class="detail-item full-width"><strong>Motivo da Consulta</strong><span>${
              paciente.motivacao_consulta
            }</span></div>
            <div class="detail-item full-width"><strong>Histórico Médico Relevante</strong><span>${
              paciente.historico_medico || "Nenhum"
            }</span></div>
        `;
      carregarMedicacoes(pacienteId);



      pacientesViewList.classList.add("hidden");
      pacientesViewForm.classList.add("hidden");
      pacientesViewDetail.classList.remove("hidden");
      pacientesViewDetail.dataset.pacienteId = pacienteId;
    } catch (error) {
      console.error("Erro ao buscar detalhes do paciente:", error);
      alert(error.message);
    }
  };
  const abrirFormularioEdicao = async (pacienteId) => {
    try {
      const response = await fetch(
        `${API_BASE}/api/pacientes/${pacienteId}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok)
        throw new Error("Não foi possível carregar os dados do paciente");
      const paciente = await response.json();

      //preenchimento do forms
      pacienteForm.elements["nome"].value = paciente.nome_completo;
      pacienteForm.elements["dataNascimento"].value = new Date(
        paciente.data_nascimento
      )
        .toISOString()
        .split("T")[0];
      pacienteForm.elements["sexo"].value = paciente.sexo;
      pacienteForm.elements["cpf"].value = paciente.cpf;
      pacienteForm.elements["rg"].value = paciente.rg;
      pacienteForm.elements["nacionalidade"].value = paciente.nacionalidade;
      pacienteForm.elements["telefone"].value = paciente.telefone;
      pacienteForm.elements["celular"].value = paciente.celular;
      pacienteForm.elements["email"].value = paciente.email;
      pacienteForm.elements["cep"].value = paciente.cep;
      pacienteForm.elements["logradouro"].value = paciente.logradouro;
      pacienteForm.elements["numero"].value = paciente.numero;
      pacienteForm.elements["complemento"].value = paciente.complemento;
      pacienteForm.elements["bairro"].value = paciente.bairro;
      pacienteForm.elements["cidade"].value = paciente.cidade;
      pacienteForm.elements["estado"].value = paciente.estado;
      pacienteForm.elements["motivacaoConsulta"].value =
        paciente.motivacao_consulta;
      pacienteForm.elements["historicoMedico"].value =
        paciente.historico_medico;
      pacienteIdInput.value = paciente.id;
      document.querySelector(
        "#pacientes-view-form .section-title"
      ).textContent = "Editar Paciente";
      pacienteForm.querySelector('button[type="submit"]').textContent =
        "Salvar Alterações";
      pacientesViewDetail.classList.add("hidden");
      pacientesViewForm.classList.remove("hidden");
    } catch (error) {
      console.error("Erro ao preparar formulário de edição:", error);
      alert(error.message);
    }
  };
  const excluirPaciente = async (pacienteId) => {
    const nomePaciente = document.getElementById(
      "detail-patient-name"
    ).textContent;
    if (
      !confirm(
        `Você tem certeza que deseja excluir permanentemente o paciente "${nomePaciente}"? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/pacientes/${pacienteId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Ocorreu um erro no servidor.");
      }
      const result = await response.json();
      alert(result.message);
      goBackToList();
    } catch (error) {
      console.error("Falha ao excluir paciente:", error);
      alert(`Erro ao excluir: ${error.message}`);
    }
  };

  const popularDropdownPacientes = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/pacientes`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Falha ao buscar pacientes.");
      const pacientes = await response.json();
      pacientesDropdownCache = Array.isArray(pacientes) ? pacientes : [];

      if (userRole === "admin") {
        await ensureTherapistsLoaded();
        if (sessionTherapistGroup) sessionTherapistGroup.classList.remove("hidden");
        if (sessionTherapistSelector) {
          sessionTherapistSelector.innerHTML =
            '<option value="">Selecione o psicólogo...</option>';
          terapeutasDisponiveis.forEach((t) => {
            const opt = document.createElement("option");
            opt.value = t.id;
            opt.textContent = t.nome;
            sessionTherapistSelector.appendChild(opt);
          });
        }
      } else {
        if (sessionTherapistGroup) sessionTherapistGroup.classList.add("hidden");
      }

      patientSelector.innerHTML =
        '<option value="">Selecione um paciente</option>';
      pacientesDropdownCache.forEach((p) => {
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent = p.nome_completo;
        patientSelector.appendChild(option);
      });

      if (curricularFolderSelector) {
        curricularFoldersCache = [];
        curricularFolderSelector.innerHTML =
          '<option value="">Selecione um paciente acima</option>';
        curricularFolderSelector.disabled = true;
      }
      if (curricularFolderDetails) {
        curricularFolderDetails.textContent = "";
        curricularFolderDetails.classList.add("hidden");
      }
    } catch (error) {
      console.error(error);
      patientSelector.innerHTML =
        '<option value="">Erro ao carregar pacientes</option>';

      if (curricularFolderSelector) {
        curricularFoldersCache = [];
        curricularFolderSelector.innerHTML =
          '<option value="">Erro ao carregar pastas curriculares</option>';
        curricularFolderSelector.disabled = true;
      }
      if (curricularFolderDetails) {
        curricularFolderDetails.textContent = "";
        curricularFolderDetails.classList.add("hidden");
      }
    }
  };

  const renderCurricularFolderDetails = (folder) => {
    if (!curricularFolderDetails) return;

    if (!folder) {
      abaLiveEval = null;
      stopAbaTimer();
      curricularFolderDetails.textContent = "";
      curricularFolderDetails.classList.add("hidden");
      return;
    }

    // Se estiver editando e já houver um bloco salvo no resumo, restaurar tentativas.
    // A restauração real acontece quando abrirFormularioEdicaoSessao setar abaLiveEval diretamente.
    const existingEval =
      abaLiveEval && String(abaLiveEval.folderId) === String(folder.id)
        ? abaLiveEval
        : null;
    abaLiveEval = buildAbaEvalFromFolder(folder, existingEval);
    renderAbaEvalUI();
  };

  const carregarPastasCurriculares = async (pacienteId) => {
    if (!curricularFolderSelector) return;

    if (!pacienteId) {
      curricularFoldersCache = [];
      curricularFolderSelector.innerHTML =
        '<option value="">Selecione um paciente acima</option>';
      curricularFolderSelector.disabled = true;
      renderCurricularFolderDetails(null);
      return;
    }

    curricularFolderSelector.disabled = true;
    curricularFolderSelector.innerHTML =
      '<option value="">Carregando pastas curriculares...</option>';
    renderCurricularFolderDetails(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/aba/pastas-curriculares?pacienteId=${encodeURIComponent(
          pacienteId
        )}`,
        { headers: getAuthHeaders() }
      );
      if (!response.ok) throw new Error("Falha ao buscar pastas curriculares.");

      const pastas = await response.json();
      curricularFoldersCache = Array.isArray(pastas) ? pastas : [];

      curricularFolderSelector.innerHTML =
        '<option value="">(Opcional) Selecione uma pasta curricular</option>';

      curricularFoldersCache.forEach((f) => {
        const option = document.createElement("option");
        option.value = f.id;
        const qtdProgramas = Array.isArray(f.programas) ? f.programas.length : 0;
        const qtdAlvos = Array.isArray(f.alvos) ? f.alvos.length : 0;
        option.textContent = `${f.nome} (${qtdProgramas} programas, ${qtdAlvos} alvos)`;
        curricularFolderSelector.appendChild(option);
      });

      curricularFolderSelector.disabled = false;
    } catch (error) {
      console.error(error);
      curricularFoldersCache = [];
      curricularFolderSelector.innerHTML =
        '<option value="">Erro ao carregar pastas curriculares</option>';
      curricularFolderSelector.disabled = true;
      renderCurricularFolderDetails(null);
    }
  };
  const carregarSessoes = async (pacienteId) => {
    sessionListContainer.innerHTML =
      '<p class="info-message">Carregando sessões...</p>';
    try {
      const response = await fetch(
        `${API_BASE}/api/pacientes/${pacienteId}/sessoes`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok) throw new Error("Falha ao buscar sessões.");
      const sessoes = await response.json();

      sessionListContainer.innerHTML = "";
      if (sessoes.length === 0) {
        sessionListContainer.innerHTML =
          '<p class="info-message">Nenhuma sessão registrada para este paciente.</p>';
        return;
      }

      sessoes.forEach((s) => {
        const dataFormatada = new Date(s.data_sessao).toLocaleString("pt-BR", {
          dateStyle: "long",
          timeStyle: "short",
        });
        const statusClass =
          s.status_pagamento === "Pago" ? "status-pago" : "status-pendente";
        const pagamentoHTML = sessionPaymentFieldsBlocked
          ? ""
          : `
                        <div class="session-card-info">
                            <strong>Pagamento</strong>
                            <p><span class="status-badge ${statusClass}">${s.status_pagamento}</span></p>
                        </div>
                    `;
        const cardHTML = `
                    <div class="session-card" data-session-id="${s.id}">
                        <div class="session-card-info">
                            <strong>Data da Sessão</strong>
                            <p>${dataFormatada}</p>
                        </div>
                        <div class="session-card-info">
                            <strong>Duração</strong>
                            <p>${s.duracao_minutos} min</p>
                        </div>
                        ${pagamentoHTML}
                        <div class="session-card-actions">
                            <a href="#" class="btn btn-secondary btn-sm view-session-btn">Ver Detalhes</a>
                        </div>
                    </div>
                `;
        sessionListContainer.innerHTML += cardHTML;
      });
    } catch (error) {
      console.error(error);
      sessionListContainer.innerHTML =
        '<p class="error-message">Erro ao carregar sessões.</p>';
    }
  };
  // Delegação de evento para abrir detalhes da sessão via botão "Ver Detalhes"
  if (sessionListContainer) {
    sessionListContainer.addEventListener("click", (event) => {
      const btn = event.target.closest(".view-session-btn");
      if (!btn) return;
      event.preventDefault();
      const card = btn.closest(".session-card");
      if (!card) return;
      const sessionId = card.dataset.sessionId;
      if (!sessionId) return;
      abrirModalDetalhesSessao(sessionId);
    });
  }
  const inicializarCalendario = () => {
    const calendarEl = document.getElementById("calendar");

    if (calendar) {
      calendar.refetchEvents();
      return;
    }
    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: "dayGridMonth",
      locale: "pt-br",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay",
      },
      buttonText: {
        today: "Hoje",
        month: "Mês",
        week: "Semana",
        day: "Dia",
      },
      events: async (fetchInfo, successCallback, failureCallback) => {
        try {
          const response = await fetch(`${API_BASE}/api/sessoes`, {
            method: "GET",
            headers: getAuthHeaders(),
          });
          if (!response.ok)
            throw new Error("Falha ao carregar sessões para o calendário.");
          const eventos = await response.json();

          const mapped = eventos.map((e) => ({
            id: e.id,
            title: e.title || e.nome_completo || "Sessão",
            start: e.data_sessao,
            extendedProps: {
              duracao_minutos: e.duracao_minutos,
            },
          }));

          successCallback(mapped);
        } catch (error) {
          console.error(error);
          failureCallback(error);
        }
      },

      eventClick: function (info) {
        info.jsEvent.preventDefault();
        const sessionId = info.event.id;
        abrirModalDetalhesSessao(sessionId);
      },
    });

    calendar.render();
  };

  const abrirModalDetalhesSessao = async (sessionId) => {
    const modalBody = mainModal.querySelector(".modal-body");
    const modalFooter = mainModal.querySelector(".modal-footer");

    modalBody.innerHTML = "<p>Carregando...</p>";
    modalFooter.innerHTML = "";
    mainModal.classList.remove("hidden");

    try {
      const sessaoResponse = await fetch(
        `${API_BASE}/api/sessoes/${sessionId}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!sessaoResponse.ok)
        throw new Error("Não foi possível carregar os detalhes da sessão.");
      const sessao = await sessaoResponse.json();

      const dataFormatada = new Date(sessao.data_sessao).toLocaleString(
        "pt-BR",
        {
          dateStyle: "full",
          timeStyle: "short",
        }
      );
      const statusClass =
        sessao.status_pagamento === "Pago" ? "status-pago" : "status-pendente";

      const pagamentoDetailHTML = sessionPaymentFieldsBlocked
        ? ""
        : `<div class="detail-item"><strong>Pagamento</strong><span><span class="status-badge ${statusClass}">${
            sessao.status_pagamento
          }</span></span></div>`;

      let sessaoHTML = `
            <div class="detail-section">
                <div class="detail-grid">
                    <div class="detail-item"><strong>Paciente</strong><span>${
                      sessao.paciente_nome
                    }</span></div>
                    <div class="detail-item"><strong>Data</strong><span>${dataFormatada}</span></div>
                    ${pagamentoDetailHTML}
                </div>
            </div>
            <div class="detail-section">
                <h4 class="detail-section-title">Anotações da Sessão</h4>
                <div class="detail-item full-width"><span>${
                  splitResumoSessao(sessao.resumo_sessao).notes ||
                  "Nenhuma anotação registrada."
                }</span></div>
            </div>
        `;
      
      // Parte de avaliação removida conforme solicitado

      modalBody.innerHTML = sessaoHTML;
      modalFooter.innerHTML = `
            <button id="edit-session-btn" class="btn btn-primary btn-sm">Editar</button>
            <button id="delete-session-btn" class="btn btn-danger btn-sm">Excluir</button>
        `;
      document.getElementById("edit-session-btn").onclick = () =>
        abrirFormularioEdicaoSessao(sessionId);
      document.getElementById("delete-session-btn").onclick = () =>
        excluirSessao(sessionId);
    } catch (error) {
      modalBody.innerHTML = `<p class="error-message">${error.message}</p>`;
    }
  };

  const abrirFormularioEdicaoSessao = async (sessaoId) => {
    try {
      const response = await fetch(
        `${API_BASE}/api/sessoes/${sessaoId}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok)
        throw new Error("Não foi possível carregar os dados da sessão.");
      const sessao = await response.json();

      const { notes: resumoNotes, eval: abaEvalSaved } = splitResumoSessao(
        sessao.resumo_sessao
      );

      fecharModal();
      document.getElementById("sessoes-link").click();
      setTimeout(() => {
        if (sessionListContainer) sessionListContainer.classList.add("hidden");

        const form = document.getElementById("sessionForm");
        const dataISO = new Date(sessao.data_sessao).toISOString().slice(0, 16);
        form.elements["data_sessao"].value = dataISO;
        form.elements["duracao_minutos"].value = sessao.duracao_minutos;
        form.elements["tipo_sessao"].value = sessao.tipo_sessao;
        if (!sessionPaymentFieldsBlocked) {
          if (form.elements["valor_sessao"]) {
            form.elements["valor_sessao"].value = sessao.valor_sessao;
          }
          if (form.elements["status_pagamento"]) {
            form.elements["status_pagamento"].value = sessao.status_pagamento;
          }
        } else {
          if (form.elements["valor_sessao"]) form.elements["valor_sessao"].value = "";
          if (form.elements["status_pagamento"]) {
            form.elements["status_pagamento"].value = "Pendente";
          }
        }
        form.elements["resumo_sessao"].value = resumoNotes;

        sessionIdInput.value = sessao.id;

        const selectedOption =
          patientSelector.options[patientSelector.selectedIndex];
        document.querySelector(
          "#session-form-container .form-section-title"
        ).textContent = `Editar Sessão de ${selectedOption.text}`;
        form.querySelector('button[type="submit"]').textContent =
          "Salvar Alterações";

        if (sessionFormContainer)
          sessionFormContainer.classList.remove("hidden");

        // Restaura avaliação ABA (se existir)
        stopAbaTimer();
        abaLiveEval = null;

        const pacienteId = patientSelector.value;
        const restore = async () => {
          if (!pacienteId) return;
          await carregarPastasCurriculares(pacienteId);

          const folderId = abaEvalSaved?.folderId;
          if (curricularFolderSelector && folderId) {
            curricularFolderSelector.value = String(folderId);
            const folder = curricularFoldersCache.find(
              (f) => String(f.id) === String(folderId)
            );
            if (folder) {
              abaLiveEval = buildAbaEvalFromFolder(folder, abaEvalSaved);
              // Mantém flags/tempos salvos
              abaLiveEval.started = Boolean(abaEvalSaved?.started);
              abaLiveEval.startedAt = abaEvalSaved?.startedAt || null;
              abaLiveEval.endedAt = abaEvalSaved?.endedAt || null;
              renderAbaEvalUI();
              if (abaLiveEval.started) {
                stopAbaTimer();
                abaLiveEvalTimer = setInterval(() => updateAbaEvalUI(), 1000);
              }
            } else {
              renderCurricularFolderDetails(null);
            }
          } else {
            renderCurricularFolderDetails(null);
          }
        };

        restore().catch((e) => console.warn("ABA+: falha ao restaurar avaliação", e));
      }, 100);
    } catch (error) {
      alert(error.message);
    }
  };
  const excluirSessao = async (sessaoId) => {
    if (
      !confirm(
        "Você tem certeza que deseja excluir esta sessão? Esta ação não pode ser desfeita."
      )
    ) {
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE}/api/sessoes/${sessaoId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok) throw new Error("Falha ao excluir a sessão.");

      const result = await response.json();
      alert(result.message);

      sessionDetailModal.classList.add("hidden");
      calendar.refetchEvents();
      if (patientSelector.value) {
        carregarSessoes(patientSelector.value);
      }
    } catch (error) {
      alert(error.message);
    }
  };
  const carregarAvaliacoesRecebidas = async () => {
    const listDiv = document.getElementById("avaliacoes-recebidas-list");
    listDiv.innerHTML = "<p>Carregando...</p>";
    try {
      const response = await fetch(
        `${API_BASE}/api/avaliacoes/recebidas`,
        {
          headers: getAuthHeaders(),
        }
      );
      const avaliacoes = await response.json();
      listDiv.innerHTML = "";
      if (avaliacoes.length === 0) {
        listDiv.innerHTML = "<p>Nenhuma avaliação recebida ainda.</p>";
        return;
      }
      avaliacoes.forEach((a) => {
        const dataFormatada = new Date(a.data_sessao).toLocaleDateString(
          "pt-BR"
        );
        listDiv.innerHTML += `
                <div class="avaliacao-card">
                    <div class="avaliacao-card-header">
                        <span class="patient-name">${a.paciente_nome}</span>
                        <span class="session-date">${dataFormatada}</span>
                    </div>
                    <div class="rating">${"⭐".repeat(a.nota_geral)}</div>
                    <p class="comment">"${
                      a.comentarios_positivos || "Sem comentários."
                    }"</p>
                </div>
            `;
      });
    } catch (error) {
      listDiv.innerHTML =
        '<p class="error-message">Erro ao carregar avaliações.</p>';
    }
  };

  const carregarAvaliacoesPendentes = async () => {
    const listDiv = document.getElementById("avaliacoes-pendentes-list");
    listDiv.innerHTML = "<p>Carregando...</p>";
    try {
      const response = await fetch(
        `${API_BASE}/api/avaliacoes/pendentes`,
        {
          headers: getAuthHeaders(),
        }
      );
      const pendentes = await response.json();
      listDiv.innerHTML = "";
      if (pendentes.length === 0) {
        listDiv.innerHTML = "<p>Nenhuma avaliação pendente. Bom trabalho!</p>";
        return;
      }
      pendentes.forEach((p) => {
        const dataFormatada = new Date(p.data_sessao).toLocaleDateString(
          "pt-BR"
        );
        listDiv.innerHTML += `
                <div class="pendente-card">
                    <div class="pendente-card-header">
                        <span class="patient-name">${p.paciente_nome}</span>
                        <span class="session-date">${dataFormatada}</span>
                    </div>
                    <button class="btn btn-secondary btn-sm mt-2">Enviar Lembrete</button>
                </div>
            `;
      });
    } catch (error) {
      listDiv.innerHTML =
        '<p class="error-message">Erro ao carregar pendências.</p>';
    }
  };

  const gerarRelatorioFinanceiro = async (event) => {
    event.preventDefault();
    const form = document.getElementById("relatorio-financeiro-form");
    const data_inicio = form.elements["data_inicio"].value;
    const data_fim = form.elements["data_fim"].value;
    const resultadoContainer = document.getElementById(
      "relatorio-resultado-container"
    );
    resultadoContainer.classList.remove("hidden");
    const summaryGrid = document.getElementById("relatorio-summary-grid");
    const transactionsBody = document.getElementById(
      "relatorio-transactions-body"
    );
    const downloadBtn = document.getElementById("download-pdf-btn");
    summaryGrid.innerHTML = "<p>Gerando...</p>";
    transactionsBody.innerHTML = '<tr><td colspan="4">Gerando...</td></tr>';

    try {
      const response = await fetch(
        `${API_BASE}/api/relatorios/financeiro`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            data_inicio,
            data_fim,
          }),
        }
      );
      if (!response.ok) throw new Error("Falha ao gerar o relatório.");
      const relatorio = await response.json();
      const resumoData = relatorio.resumo;
      const transacoesData = relatorio.transacoes;

      summaryGrid.innerHTML = `
          <div class="stat-card">
              <div class="stat-card-icon icon-financeiro"><i class="fas fa-dollar-sign"></i></div>
              <div class="stat-card-info">
                  <span class="stat-card-title">Faturamento no Período</span>
                  <span class="stat-card-value">${formatarMoeda(
                    relatorio.resumo.faturamento_total
                  )}</span>
              </div>
          </div>
          <div class="stat-card">
              <div class="stat-card-icon icon-sessoes"><i class="fas fa-calendar-check"></i></div>
              <div class="stat-card-info">
                  <span class="stat-card-title">Total de Sessões</span>
                  <span class="stat-card-value">${
                    relatorio.resumo.total_sessoes
                  }</span>
              </div>
          </div>
      `;
      transactionsBody.innerHTML = "";
      if (relatorio.transacoes.length === 0) {
        transactionsBody.innerHTML =
          '<tr><td colspan="4">Nenhuma transação encontrada no período.</td></tr>';
        return;
      }
      relatorio.transacoes.forEach((t) => {
        const dataFormatada = new Date(t.data_sessao).toLocaleDateString(
          "pt-BR"
        );
        const statusClass =
          t.status_pagamento === "Pago" ? "status-pago" : "status-pendente";
        transactionsBody.innerHTML += `
              <tr>
                  <td>${t.paciente_nome}</td>
                  <td>${dataFormatada}</td>
                  <td>${formatarMoeda(t.valor_sessao)}</td>
                  <td><span class="status-badge ${statusClass}">${
          t.status_pagamento
        }</span></td>
              </tr>
          `;
      });

      if (downloadBtn) {
        downloadBtn.classList.remove("hidden");
        downloadBtn.onclick = () =>
          gerarPDFRelatorio(data_inicio, data_fim, resumoData, transacoesData);
      }
    } catch (error) {
      console.error(error);
      summaryGrid.innerHTML =
        '<p class="error-message">Erro ao gerar resumo.</p>';
      transactionsBody.innerHTML =
        '<tr><td colspan="4" class="error-message">Erro ao gerar transações.</td></tr>';
    }
  };

  const gerarPDFRelatorio = (dataInicio, dataFim, resumo, transacoes) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Relatório Financeiro - PsyHead", 20, 20);
    doc.setFontSize(12);
    doc.text(
      `Período: ${new Date(dataInicio).toLocaleDateString(
        "pt-BR"
      )} a ${new Date(dataFim).toLocaleDateString("pt-BR")}`,
      20,
      35
    );

    // Resumo
    doc.setFontSize(14);
    doc.text("Resumo do Período", 20, 55);
    doc.setFontSize(10);
    let yPos = 70;
    doc.text(
      `Faturamento Total: ${formatarMoeda(resumo.faturamento_total)}`,
      20,
      yPos
    );
    yPos += 10;
    doc.text(`Total de Sessões: ${resumo.total_sessoes}`, 20, yPos);

    if (transacoes.length > 0) {
      yPos += 20;
      doc.setFontSize(14);
      doc.text("Transações", 20, yPos);
      yPos += 10;
      doc.setFontSize(8);
      doc.text("Paciente | Data | Valor | Status", 20, yPos);
      yPos += 7;
      transacoes.forEach((t, index) => {
        if (yPos > 280) {
          doc.addPage();
          yPos = 20;
        }
        const dataFormatada = new Date(t.data_sessao).toLocaleDateString(
          "pt-BR"
        );
        const linha = `${t.paciente_nome} | ${dataFormatada} | ${formatarMoeda(
          t.valor_sessao
        )} | ${t.status_pagamento}`;
        doc.text(linha, 20, yPos);
        yPos += 7;
      });
    } else {
      yPos += 10;
      doc.text("Nenhuma transação no período.", 20, yPos);
    }

    doc.save(`relatorio-financeiro-${dataInicio}-a-${dataFim}.pdf`);
  };

  //listeners
  if (!token && window.location.pathname.includes("index.html")) {
    window.location.href = "login.html";
    return;
  }
  if (userAvatarSpan && nomeTerapeuta) {
    userAvatarSpan.textContent = `Olá, ${nomeTerapeuta}`;
  }

  setupNavigationForRole(userRole);
  if (financeBlocked) {
    hideFinanceUI();
  }
  if (sessionPaymentFieldsBlocked) {
    hideSessionPaymentFieldsUI();
  }
  if (userRole === "paciente") {
    activateSection("agenda-section", "agenda-link");
    inicializarCalendario();
  } else {
    activateSection("dashboard-section", "dashboard-link");
    carregarDashboardStats();
  }

  // Listener para o novo formulário de criação de usuário
  const createUserForm = document.getElementById("create-user-form");
  if (createUserForm) {
    createUserForm.addEventListener("submit", submitNovoUsuario);
  }

  if (logoutLink) {
    logoutLink.addEventListener("click", (event) => {
      event.preventDefault();
      localStorage.removeItem("psyhead-token");
      localStorage.removeItem("terapeuta-nome");
      window.location.href = "login.html";
    });
  }
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const sidebar = document.querySelector(".sidebar");

  if (hamburgerBtn && sidebar) {
    hamburgerBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });

    sidebar.addEventListener("click", (event) => {
      if (event.target.tagName === "A") {
        sidebar.classList.remove("open");
      }
    });
  }

  //LÓGICA RECURSOS
  const accordionContainer = document.querySelector(".accordion-container");
  if (accordionContainer) {
    accordionContainer.addEventListener("click", (event) => {
      const header = event.target.closest(".accordion-header");

      if (!header) return;
      const item = header.parentElement;

      document.querySelectorAll(".accordion-item").forEach((otherItem) => {
        if (otherItem !== item && otherItem.classList.contains("open")) {
          otherItem.classList.remove("open");
          otherItem.querySelector(".accordion-content").style.paddingTop = "0";
        }
      });

      item.classList.toggle("open");

      if (item.classList.contains("open")) {
        item.querySelector(".accordion-content").style.paddingTop = "1rem";
      } else {
        item.querySelector(".accordion-content").style.paddingTop = "0";
      }
    });
  }

  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      // Deixa o link ABA+ navegar para a página aba.html normalmente
      if (link.id === "aba-link") {
        return;
      }
      event.preventDefault();
      const targetId = link.id.replace("-link", "-section");
      activateSection(targetId, link.id);
    });
  });
  const relatorioForm = document.getElementById("relatorio-financeiro-form");
  if (relatorioForm) {
    relatorioForm.addEventListener("submit", gerarRelatorioFinanceiro);
  }

  featureCards.forEach((card) => {
    card.addEventListener("click", (event) => {
      event.preventDefault();
      const targetLinkId = card.dataset.target;
      if (targetLinkId) document.getElementById(targetLinkId)?.click();
    });
  });

  if (showPacienteFormBtn) {
    showPacienteFormBtn.addEventListener("click", () => {
      pacienteForm.reset();
      pacienteIdInput.value = "";
      document.querySelector(
        "#pacientes-view-form .section-title"
      ).textContent = "Adicionar Novo Paciente";
      pacienteForm.querySelector('button[type="submit"]').textContent =
        "Salvar Paciente";
      pacientesViewList.classList.add("hidden");
      pacientesViewForm.classList.remove("hidden");
    });
  }

  if (backToListBtn) backToListBtn.addEventListener("click", goBackToList);

  if (detailBackToListBtn)
    detailBackToListBtn.addEventListener("click", goBackToList);

  pacientesViewList.addEventListener("click", async (event) => {
    if (event.target.classList.contains("assign-therapist-btn")) {
      const card = event.target.closest(".patient-card");
      const pacienteId = card.dataset.pacienteId;
      const pacienteNome = card.querySelector(".patient-name").textContent;

      abrirModalAtribuicao(pacienteId, pacienteNome);
      return;
    }

    const viewBtn = event.target.closest(".view-patient-btn");
    if (viewBtn) {
      const card = viewBtn.closest(".patient-card");
      if (!card) return;
      const pacienteId = card.dataset.pacienteId;
      if (!pacienteId) return;
      mostrarDetalhesPaciente(pacienteId);
      return;
    }
  });

  const abrirModalAtribuicao = async (pacienteId, pacienteNome) => {
    const modal = mainModal;
    const modalTitle = modal.querySelector(".modal-title");
    const modalBody = modal.querySelector(".modal-body");
    const modalFooter = modal.querySelector(".modal-footer");

    modalTitle.textContent = `Gerenciar Paciente: ${pacienteNome}`;
    modalBody.innerHTML = "<p>Carregando dados...</p>";
    modalFooter.innerHTML = "";
    modal.classList.remove("hidden");

    try {
      const [terapeutasRes, loginsRes] = await Promise.all([
        fetch(`${API_BASE}/api/terapeutas-lista`, {
          headers: getAuthHeaders(),
        }),
      ]);

      if (!terapeutasRes.ok) throw new Error("Falha ao buscar terapeutas.");

      const terapeutas = await terapeutasRes.json();
      let terapeutasOptions = terapeutas
        .map((t) => `<option value="${t.id}">${t.nome}</option>`)
        .join("");
      const dropdownTerapeutas = `
           <div class="form-group">
              <label for="terapeuta-select" class="form-label">Atribuir ao Terapeuta:</label>
              <select id="terapeuta-select" class="form-input">
                  <option value="">Selecione o Psicólogo ou Terapeuta</option>
                  ${terapeutasOptions}
              </select>
          </div> 
      `;

      modalBody.innerHTML = `
          <form id="assign-form">
              ${dropdownTerapeutas}
          </form>
      `;

      modalFooter.innerHTML = `
          <button id="cancel-assign-btn" class="btn btn-secondary">Cancelar</button>
          <button id="save-assign-btn" class="btn btn-primary">Salvar Alterações</button>
      `;

      document.getElementById("cancel-assign-btn").onclick = () =>
        fecharModal();

      document.getElementById("save-assign-btn").onclick = async () => {
        const terapeutaId = document.getElementById("terapeuta-select").value;

        if (!terapeutaId) {
          alert("Nenhuma alteração selecionada.");
          return;
        }

        let bodyPayload = {};
        if (terapeutaId) bodyPayload.terapeuta_id = terapeutaId;

        try {
          const assignResp = await fetch(
            `${API_BASE}/api/pacientes/${pacienteId}/atribuir`,
            {
              method: "PUT",
              headers: getAuthHeaders(),
              body: JSON.stringify(bodyPayload),
            }
          );
          const result = await assignResp.json();
          if (!assignResp.ok) throw new Error(result.error);

          alert("Paciente atualizado com sucesso!");
          fecharModal();
          carregarPacientes();
        } catch (e) {
          alert(`Erro: ${e.message}`);
        }
      };
    } catch (e) {
      modalBody.innerHTML = `<p class="error-message">${e.message}</p>`;
    }
  };

  if (detailHeader) {
    detailHeader.addEventListener("click", (event) => {
      const pacienteId = pacientesViewDetail.dataset.pacienteId;
      if (event.target.closest("#edit-patient-btn"))
        abrirFormularioEdicao(pacienteId);
      if (event.target.closest("#delete-patient-btn"))
        excluirPaciente(pacienteId);
    });
  }

  if (patientSelector) {
    patientSelector.addEventListener("change", () => {
      const pacienteId = patientSelector.value;
      showSessionFormBtn.disabled = !pacienteId;

      // Para admin, ao selecionar paciente, sugere o terapeuta responsável atual.
      if (userRole === "admin" && sessionTherapistSelector) {
        const p = pacientesDropdownCache.find(
          (x) => String(x.id) === String(pacienteId)
        );
        const currentTherapistId = p?.terapeuta_id;
        sessionTherapistSelector.value =
          currentTherapistId != null ? String(currentTherapistId) : "";
      }

      if (pacienteId) {
        carregarSessoes(pacienteId);
        carregarPastasCurriculares(pacienteId);
      } else {
        sessionListContainer.innerHTML =
          '<p class="info-message">Por favor, selecione um paciente para ver suas sessões.</p>';
        carregarPastasCurriculares("");
      }
    });
  }

  if (curricularFolderSelector) {
    curricularFolderSelector.addEventListener("change", () => {
      // Troca de pasta curricular reinicia o atendimento em andamento
      stopAbaTimer();
      abaLiveEval = null;
      const selectedId = curricularFolderSelector.value;
      const folder = curricularFoldersCache.find(
        (f) => String(f.id) === String(selectedId)
      );
      renderCurricularFolderDetails(folder || null);
    });
  }

  if (curricularFolderDetails) {
    curricularFolderDetails.addEventListener("click", handleAbaEvalInteraction);
    curricularFolderDetails.addEventListener(
      "change",
      handleAbaEvalAttemptsChange
    );
  }

  if (showSessionFormBtn) {
    showSessionFormBtn.addEventListener("click", () => {
      const selectedOption =
        patientSelector.options[patientSelector.selectedIndex];
      sessionFormPatientName.textContent = selectedOption.text;
      sessionFormContainer.classList.remove("hidden");
      sessionForm.reset();
      sessionIdInput.value = "";
      document.querySelector(
        "#session-form-container .form-section-title"
      ).textContent = `Registrar Nova Sessão para ${selectedOption.text}`;
      sessionForm.querySelector('button[type="submit"]').textContent =
        "Salvar Sessão";

      const pacienteId = patientSelector.value;
      if (pacienteId) carregarPastasCurriculares(pacienteId);
      renderCurricularFolderDetails(null);

      // Admin precisa escolher o psicólogo responsável no agendamento
      if (userRole === "admin") {
        if (sessionTherapistGroup) sessionTherapistGroup.classList.remove("hidden");
        if (sessionTherapistSelector) {
          const p = pacientesDropdownCache.find(
            (x) => String(x.id) === String(pacienteId)
          );
          const currentTherapistId = p?.terapeuta_id;
          sessionTherapistSelector.value =
            currentTherapistId != null ? String(currentTherapistId) : "";
        }
      }
    });
  }
  if (cancelSessionFormBtn) {
    cancelSessionFormBtn.addEventListener("click", () => {
      sessionFormContainer.classList.add("hidden");
      stopAbaTimer();
      abaLiveEval = null;
      renderCurricularFolderDetails(null);
    });
  }

  const fecharModal = () => {
    const modal = document.getElementById("main-modal");
    if (modal) {
      modal.classList.add("hidden");
    }
  };
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", fecharModal);
  }
  if (mainModal) {
    mainModal.addEventListener("click", (event) => {
      if (event.target === mainModal) {
        fecharModal();
      }
    });
  }
  window.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      mainModal &&
      !mainModal.classList.contains("hidden")
    ) {
      fecharModal();
    }
  });
  if (pacientesViewDetail) {
    pacientesViewDetail.addEventListener("click", (event) => {
      const pacienteId = pacientesViewDetail.dataset.pacienteId;
      const addBtn = event.target.closest("#add-medication-btn");
      const editBtn = event.target.closest(".edit-med-btn");
      const deleteBtn = event.target.closest(".delete-med-btn");

      if (addBtn) {
        abrirFormularioMedicacao(pacienteId);
      }
      if (editBtn) {
        const medicacaoId =
          editBtn.closest(".medication-item").dataset.medicacaoId;
        abrirFormularioMedicacao(pacienteId, medicacaoId);
      }
      if (deleteBtn) {
        const medicacaoId =
          deleteBtn.closest(".medication-item").dataset.medicacaoId;
        excluirMedicacao(medicacaoId, pacienteId);
      }
    });
  }

  if (pacienteForm) {
    pacienteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(pacienteForm);
      const pacienteData = {
        nome_completo: formData.get("nome"),
        data_nascimento: formData.get("dataNascimento"),
        sexo: formData.get("sexo"),
        cpf: formData.get("cpf"),
        rg: formData.get("rg"),
        nacionalidade: formData.get("nacionalidade"),
        telefone: formData.get("telefone"),
        celular: formData.get("celular"),
        email: formData.get("email"),
        cep: formData.get("cep"),
        logradouro: formData.get("logradouro"),
        numero: formData.get("numero"),
        complemento: formData.get("complemento"),
        bairro: formData.get("bairro"),
        cidade: formData.get("cidade"),
        estado: formData.get("estado"),
        historico_medico: formData.get("historicoMedico"),
        motivacao_consulta: formData.get("motivacaoConsulta"),
      };

      if (
        !pacienteData.nome_completo ||
        !pacienteData.data_nascimento ||
        !pacienteData.celular ||
        !pacienteData.motivacao_consulta
      ) {
        alert("Por favor preencha todos os campos obrigatórios");
        return;
      }

      const id = pacienteIdInput.value;
      const method = id ? "PUT" : "POST";
      const url = id
        ? `${API_BASE}/api/pacientes/${id}`
        : `${API_BASE}/api/pacientes`;

      try {
        const response = await fetch(url, {
          method,
          headers: getAuthHeaders(),
          body: JSON.stringify(pacienteData),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Ocorreu um erro no servidor");
        }
        const result = await response.json();
        alert(result.message);

        pacienteForm.reset();
        pacienteIdInput.value = "";
        if (id) {
          mostrarDetalhesPaciente(id);
        } else {
          goBackToList();
        }
      } catch (error) {
        console.error("Falha ao salvar paciente:", error);
        alert(`Erro ao salvar: ${error.message}`);
      }
    });
  }
  if (sessionForm) {
    sessionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const pacienteId = patientSelector.value;
      const sessaoId = sessionIdInput.value;
      if (!pacienteId) {
        alert("Por favor, selecione um paciente primeiro.");
        return;
      }

      // Fluxo SECRETÁRIA (admin): escolhe psicólogo responsável antes de agendar
      if (userRole === "admin") {
        const terapeutaIdSelecionado = sessionTherapistSelector?.value;
        if (!terapeutaIdSelecionado) {
          alert("Selecione o psicólogo responsável antes de salvar a sessão.");
          return;
        }

        const p = pacientesDropdownCache.find(
          (x) => String(x.id) === String(pacienteId)
        );
        const currentTherapistId = p?.terapeuta_id;

        // Se diferente, atualiza o terapeuta do paciente para garantir que
        // o psicólogo veja o agendamento e possa iniciar o atendimento.
        if (String(currentTherapistId || "") !== String(terapeutaIdSelecionado)) {
          try {
            const atribResp = await fetch(
              `${API_BASE}/api/pacientes/${pacienteId}/atribuir`,
              {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({ terapeuta_id: terapeutaIdSelecionado }),
              }
            );
            const atribJson = await atribResp.json().catch(() => null);
            if (!atribResp.ok) {
              throw new Error(
                atribJson?.error ||
                  "Falha ao atribuir o paciente ao psicólogo selecionado."
              );
            }
            // Atualiza cache local
            const updated = atribJson?.paciente;
            if (updated) {
              pacientesDropdownCache = pacientesDropdownCache.map((x) =>
                String(x.id) === String(updated.id) ? updated : x
              );
            }
          } catch (e) {
            alert(e.message);
            return;
          }
        }
      }

      const formData = new FormData(sessionForm);
      const sessionData = {
        paciente_id: pacienteId,
        data_sessao: formData.get("data_sessao"),
        duracao_minutos: formData.get("duracao_minutos"),
        tipo_sessao: formData.get("tipo_sessao"),
        resumo_sessao: formData.get("resumo_sessao"),
      };

      // Salva avaliação ABA no próprio resumo (sem alterar schema/API)
      const hasAnyAbaAttempt =
        abaLiveEval?.rows?.some?.((r) => Array.isArray(r.attempts) && r.attempts.some(Boolean)) ||
        false;
      const abaEvalToSave = abaLiveEval && (abaLiveEval.started || hasAnyAbaAttempt) ? abaLiveEval : null;
      sessionData.resumo_sessao = mergeResumoSessao(
        sessionData.resumo_sessao,
        abaEvalToSave
      );

      if (!sessionPaymentFieldsBlocked) {
        sessionData.valor_sessao = formData.get("valor_sessao");
        sessionData.status_pagamento = formData.get("status_pagamento");
      }
      const method = sessaoId ? "PUT" : "POST";
      const url = sessaoId
        ? `${API_BASE}/api/sessoes/${sessaoId}`
        : `${API_BASE}/api/sessoes`;

      try {
        const response = await fetch(url, {
          method,
          headers: getAuthHeaders(),
          body: JSON.stringify(sessionData),
        });
        if (!response.ok) throw new Error("Falha ao salvar sessão.");

        const result = await response.json();
        alert(result.message);

        sessionForm.reset();
        sessionIdInput.value = "";
        sessionFormContainer.classList.add("hidden");

        calendar.refetchEvents();
        carregarSessoes(pacienteId);
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const searchPacientesInput = document.getElementById("search-pacientes");
  if (searchPacientesInput) {
    searchPacientesInput.addEventListener("input", filtrarPacientes);
  }
});
