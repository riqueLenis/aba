document.addEventListener("DOMContentLoaded", () => {
  "use strict";
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
  //modulo modal
  const sessionDetailModal = document.getElementById("session-detail-modal");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const modalBodyContent = document.getElementById("modal-body-content");
  const modalFooterContent = document.getElementById("modal-footer-content");
  const token = localStorage.getItem("psyhead-token");
  const nomeTerapeuta = localStorage.getItem("terapeuta-nome");
  const userRole = localStorage.getItem("user-role");
  let calendar;

  let allPacientes = [];
  let terapeutasDisponiveis = [];

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
    }
    if (sectionId === "agenda-section") inicializarCalendario();
    if (sectionId === "financeiro-section") {
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
        `http://localhost:3000/api/pacientes/${pacienteId}/medicacoes`,
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
          `http://localhost:3000/api/medicacoes/${medicacaoId}`,
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
      ? `http://localhost:3000/api/medicacoes/${medicacaoId}`
      : `http://localhost:3000/api/pacientes/${pacienteId}/medicacoes`;

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
        `http://localhost:3000/api/medicacoes/${medicacaoId}`,
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
        "http://localhost:3000/api/dashboard/stats",
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
        "http://localhost:3000/api/financeiro/resumo",
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
        "http://localhost:3000/api/financeiro/transacoes",
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
      const response = await fetch("http://localhost:3000/api/pacientes", {
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
            "http://localhost:3000/api/terapeutas-lista",
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
      const response = await fetch("http://localhost:3000/api/usuarios", {
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
          `http://localhost:3000/api/usuarios/${userId}`,
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
      const response = await fetch("http://localhost:3000/api/usuarios", {
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
        `http://localhost:3000/api/pacientes/${pacienteId}`,
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
        `http://localhost:3000/api/pacientes/${pacienteId}`,
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
        `http://localhost:3000/api/pacientes/${pacienteId}`,
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
      const response = await fetch("http://localhost:3000/api/pacientes", {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Falha ao buscar pacientes.");
      const pacientes = await response.json();

      patientSelector.innerHTML =
        '<option value="">Selecione um paciente</option>';
      pacientes.forEach((p) => {
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent = p.nome_completo;
        patientSelector.appendChild(option);
      });
    } catch (error) {
      console.error(error);
      patientSelector.innerHTML =
        '<option value="">Erro ao carregar pacientes</option>';
    }
  };
  const carregarSessoes = async (pacienteId) => {
    sessionListContainer.innerHTML =
      '<p class="info-message">Carregando sessões...</p>';
    try {
      const response = await fetch(
        `http://localhost:3000/api/pacientes/${pacienteId}/sessoes`,
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
                        <div class="session-card-info">
                            <strong>Pagamento</strong>
                            <p><span class="status-badge ${statusClass}">${s.status_pagamento}</span></p>
                        </div>
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
          const response = await fetch("http://localhost:3000/api/sessoes", {
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
        `http://localhost:3000/api/sessoes/${sessionId}`,
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

      let sessaoHTML = `
            <div class="detail-section">
                <div class="detail-grid">
                    <div class="detail-item"><strong>Paciente</strong><span>${
                      sessao.paciente_nome
                    }</span></div>
                    <div class="detail-item"><strong>Data</strong><span>${dataFormatada}</span></div>
                    <div class="detail-item"><strong>Pagamento</strong><span><span class="status-badge ${statusClass}">${
        sessao.status_pagamento
      }</span></span></div>
                </div>
            </div>
            <div class="detail-section">
                <h4 class="detail-section-title">Anotações da Sessão</h4>
                <div class="detail-item full-width"><span>${
                  sessao.resumo_sessao || "Nenhuma anotação registrada."
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
        `http://localhost:3000/api/sessoes/${sessaoId}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok)
        throw new Error("Não foi possível carregar os dados da sessão.");
      const sessao = await response.json();

      fecharModal();
      document.getElementById("sessoes-link").click();
      setTimeout(() => {
        if (sessionListContainer) sessionListContainer.classList.add("hidden");

        const form = document.getElementById("sessionForm");
        const dataISO = new Date(sessao.data_sessao).toISOString().slice(0, 16);
        form.elements["data_sessao"].value = dataISO;
        form.elements["duracao_minutos"].value = sessao.duracao_minutos;
        form.elements["tipo_sessao"].value = sessao.tipo_sessao;
        form.elements["valor_sessao"].value = sessao.valor_sessao;
        form.elements["status_pagamento"].value = sessao.status_pagamento;
        form.elements["resumo_sessao"].value = sessao.resumo_sessao;

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
        `http://localhost:3000/api/sessoes/${sessaoId}`,
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
        "http://localhost:3000/api/avaliacoes/recebidas",
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
        "http://localhost:3000/api/avaliacoes/pendentes",
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
        "http://localhost:3000/api/relatorios/financeiro",
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
        fetch("http://localhost:3000/api/terapeutas-lista", {
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
            `http://localhost:3000/api/pacientes/${pacienteId}/atribuir`,
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
      if (pacienteId) {
        carregarSessoes(pacienteId);
      } else {
        sessionListContainer.innerHTML =
          '<p class="info-message">Por favor, selecione um paciente para ver suas sessões.</p>';
      }
    });
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
    });
  }
  if (cancelSessionFormBtn) {
    cancelSessionFormBtn.addEventListener("click", () => {
      sessionFormContainer.classList.add("hidden");
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
        ? `http://localhost:3000/api/pacientes/${id}`
        : "http://localhost:3000/api/pacientes";

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

      const formData = new FormData(sessionForm);
      const sessionData = {
        paciente_id: pacienteId,
        data_sessao: formData.get("data_sessao"),
        duracao_minutos: formData.get("duracao_minutos"),
        tipo_sessao: formData.get("tipo_sessao"),
        resumo_sessao: formData.get("resumo_sessao"),
        valor_sessao: formData.get("valor_sessao"),
        status_pagamento: formData.get("status_pagamento"),
      };
      const method = sessaoId ? "PUT" : "POST";
      const url = sessaoId
        ? `http://localhost:3000/api/sessoes/${sessaoId}`
        : "http://localhost:3000/api/sessoes";

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
