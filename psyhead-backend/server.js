require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
//config servidor
const app = express();
const PORT = process.env.PORT || 3000;
//config pra rodar toda requisição
app.use(cors());
app.use(express.json());

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_DATABASE,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

//middleware
const verificarToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET || "hash123", (err, terapeuta) => {
    if (err) {
      return res.sendStatus(403);
    }
    req.terapeuta = terapeuta;
    next();
  });
};

//middleware para ver se o usuario é admin ou nao
const verificarAdmin = (req, res, next) => {
  const role = req.terapeuta.role;

  if (role !== "admin") {
    return res.status(403).json({ error: "Acesso negao. Apenas admins" });
  }
  next();
};

// Bloqueio pontual de acesso ao módulo financeiro para logins específicos
// - Admin mantém acesso total
// - Usuários listados aqui não acessam: Gestão Financeira e endpoints de resumo/relatórios financeiros
const FINANCE_BLOCKED_EMAILS = new Set(
  (
    process.env.FINANCE_BLOCKED_EMAILS ||
    "ana.suzuki07@gmail.com,taismacieldosantos@gmail.com,magroisabella13@gmail.com,nucleocomportamentall@gmail.com"
  )
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

// Bloqueio pontual de campos sensíveis dentro de agendamento de sessões
// (remover funcionalidades de "valor" e "status do pagamento" apenas para emails específicos)
// - Admin mantém acesso total
// - Para os emails listados: backend ignora updates de valor/status e não retorna esses campos nas respostas de sessões
const SESSION_PAYMENT_FIELDS_BLOCKED_EMAILS = new Set(
  (
    process.env.SESSION_PAYMENT_FIELDS_BLOCKED_EMAILS ||
    "ana.suzuki07@gmail.com,taismacieldosantos@gmail.com,duda.capuano09@gmail.com,simoesamanda84@gmail.com,caetano7799@hotmail.com,magroisabella13@gmail.com"
  )
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

// Compartilhamento restrito: pacientes do admin talitauenopsi@gmail.com
// Só podem ser acessados por: o próprio talitauenopsi + 3 emails liberados
const TALITAU_EMAIL = String(
  process.env.TALITAU_EMAIL || "talitauenopsi@gmail.com"
)
  .trim()
  .toLowerCase();

const TALITAU_SHARED_PATIENTS_ALLOWED_EMAILS = new Set(
  (
    process.env.TALITAU_SHARED_PATIENTS_ALLOWED_EMAILS ||
    "ana.suzuki07@gmail.com,magroisabella13@gmail.com,nucleocomportamentall@gmail.com"
  )
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const isSessionPaymentFieldsBlockedUser = (terapeuta) => {
  if (!terapeuta) return false;
  if (terapeuta.role === "admin") return false;
  const email = normalizeEmail(terapeuta.email);
  return email ? SESSION_PAYMENT_FIELDS_BLOCKED_EMAILS.has(email) : false;
};

const sanitizeSessaoForPaymentPrivacy = (sessao, terapeuta) => {
  if (!isSessionPaymentFieldsBlockedUser(terapeuta)) return sessao;
  const sanitized = { ...sessao };
  delete sanitized.valor_sessao;
  delete sanitized.status_pagamento;
  return sanitized;
};

let TALITAU_USER_ID_CACHE = null;
const getTalitauUserId = async () => {
  if (TALITAU_USER_ID_CACHE) return TALITAU_USER_ID_CACHE;
  const result = await pool.query(
    "SELECT id FROM terapeutas WHERE lower(trim(email)) = $1 LIMIT 1",
    [TALITAU_EMAIL]
  );
  TALITAU_USER_ID_CACHE = result.rows[0]?.id || null;
  return TALITAU_USER_ID_CACHE;
};

const canAccessTalitauPatients = (terapeuta) => {
  const email = normalizeEmail(terapeuta?.email);
  if (!email) return false;
  if (email === TALITAU_EMAIL) return true;
  return TALITAU_SHARED_PATIENTS_ALLOWED_EMAILS.has(email);
};

const makeVerificarAcessoPaciente = (paramName) => async (req, res, next) => {
  try {
    const pacienteId = req.params?.[paramName];
    if (!pacienteId) {
      return res.status(400).json({ error: "ID do paciente é obrigatório." });
    }

    const user = req.terapeuta;
    const { id: userId, role } = user;

    const result = await pool.query(
      "SELECT id, terapeuta_id, usuario_id FROM pacientes WHERE id = $1",
      [pacienteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Paciente não encontrado." });
    }

    const paciente = result.rows[0];
    const talitauId = await getTalitauUserId();

    // Login de paciente: só acessa o próprio prontuário
    if (role === "paciente") {
      if (paciente.usuario_id === userId) {
        req.pacienteAcesso = paciente;
        return next();
      }
      return res.status(403).json({ error: "Acesso negado ao paciente." });
    }

    // Regra específica: pacientes do talitauenopsi só para os emails liberados
    if (talitauId && paciente.terapeuta_id === talitauId) {
      if (canAccessTalitauPatients(user)) {
        req.pacienteAcesso = paciente;
        return next();
      }
      return res
        .status(403)
        .json({ error: "Acesso negado aos pacientes deste terapeuta." });
    }

    // Admin pode acessar demais pacientes
    if (role === "admin") {
      req.pacienteAcesso = paciente;
      return next();
    }

    // Terapeuta: só acessa pacientes próprios
    if (paciente.terapeuta_id === userId) {
      req.pacienteAcesso = paciente;
      return next();
    }

    return res.status(403).json({ error: "Acesso negado ao paciente." });
  } catch (error) {
    console.error("Erro ao verificar acesso ao paciente:", error);
    return res.status(500).json({ error: "Erro interno do servidor." });
  }
};

const verificarAcessoPacienteId = makeVerificarAcessoPaciente("id");
const verificarAcessoPacienteParam = (paramName) =>
  makeVerificarAcessoPaciente(paramName);

const verificarAcessoSessao = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.terapeuta;

    const result = await pool.query(
      `
        SELECT s.id AS sessao_id, p.id AS paciente_id, p.terapeuta_id, p.usuario_id
        FROM sessoes s
        JOIN pacientes p ON p.id = s.paciente_id
        WHERE s.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Sessão não encontrada." });
    }

    req.params.pacienteId = String(result.rows[0].paciente_id);
    return verificarAcessoPacienteParam("pacienteId")(req, res, next);
  } catch (error) {
    console.error("Erro ao verificar acesso à sessão:", error);
    return res.status(500).json({ error: "Erro interno do servidor." });
  }
};

const verificarAcessoMedicacao = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
        SELECT m.id AS medicacao_id, p.id AS paciente_id, p.terapeuta_id, p.usuario_id
        FROM medicacoes m
        JOIN pacientes p ON p.id = m.paciente_id
        WHERE m.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Medicação não encontrada." });
    }

    req.params.pacienteId = String(result.rows[0].paciente_id);
    return verificarAcessoPacienteParam("pacienteId")(req, res, next);
  } catch (error) {
    console.error("Erro ao verificar acesso à medicação:", error);
    return res.status(500).json({ error: "Erro interno do servidor." });
  }
};

const getPacienteForAccess = async (pacienteId) => {
  const result = await pool.query(
    "SELECT id, terapeuta_id, usuario_id FROM pacientes WHERE id = $1",
    [pacienteId]
  );
  return result.rows[0] || null;
};

const assertCanAccessPacienteId = async (req, res, pacienteId) => {
  const paciente = await getPacienteForAccess(pacienteId);
  if (!paciente) {
    res.status(404).json({ error: "Paciente não encontrado." });
    return null;
  }

  const { id: userId, role } = req.terapeuta;
  const talitauId = await getTalitauUserId();

  if (role === "paciente") {
    if (paciente.usuario_id !== userId) {
      res.status(403).json({ error: "Acesso negado ao paciente." });
      return null;
    }
    return paciente;
  }

  if (talitauId && paciente.terapeuta_id === talitauId) {
    if (!canAccessTalitauPatients(req.terapeuta)) {
      res
        .status(403)
        .json({ error: "Acesso negado aos pacientes deste terapeuta." });
      return null;
    }
    return paciente;
  }

  if (role === "admin") {
    return paciente;
  }

  if (paciente.terapeuta_id !== userId) {
    res.status(403).json({ error: "Acesso negado ao paciente." });
    return null;
  }

  return paciente;
};

const verificarAcessoPastaCurricular = async (req, res, next) => {
  try {
    const pastaId = req.params?.id;
    if (!pastaId) {
      return res.status(400).json({ error: "ID da pasta é obrigatório." });
    }

    const result = await pool.query(
      "SELECT id, paciente_id FROM aba_pastas_curriculares WHERE id = $1",
      [pastaId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Pasta não encontrada." });
    }

    const pasta = result.rows[0];
    const ok = await assertCanAccessPacienteId(req, res, pasta.paciente_id);
    if (!ok) return;

    req.pastaCurricular = pasta;
    next();
  } catch (error) {
    console.error("Erro ao verificar acesso à pasta curricular:", error);
    return res.status(500).json({ error: "Erro interno do servidor." });
  }
};

const isFinanceBlockedUser = (terapeuta) => {
  if (!terapeuta) return false;
  if (terapeuta.role === "admin") return false;
  const email = String(terapeuta.email || "")
    .trim()
    .toLowerCase();
  return email ? FINANCE_BLOCKED_EMAILS.has(email) : false;
};

const verificarAcessoFinanceiro = (req, res, next) => {
  if (isFinanceBlockedUser(req.terapeuta)) {
    return res
      .status(403)
      .json({ error: "Acesso negado ao módulo financeiro para este usuário." });
  }
  next();
};

//rota pra adicionar um novo terapeuta
app.post("/api/auth/registrar", async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({
      error: "Nome, email e senha são obrigatórios.",
    });
  }

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const queryText =
      "INSERT INTO terapeutas (nome, email, senha_hash) VALUES ($1, $2, $3) RETURNING id, email;";
    const result = await pool.query(queryText, [nome, email, senhaHash]);

    res.status(201).json({
      message: "Terapeuta registrado com sucesso!",
      terapeuta: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao registrar terapeuta:", error);
    res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
});

//rota de login
app.post("/api/auth/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({
      error: "Email e senha são obrigatórios.",
    });
  }

  try {
    const queryText = "SELECT * FROM terapeutas WHERE email = $1;";
    const result = await pool.query(queryText, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Credenciais inválidas.",
      });
    }

    const terapeuta = result.rows[0];

    const senhaValida = await bcrypt.compare(senha, terapeuta.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({
        error: "Credenciais inválidas.",
      });
    }

    const userRole = terapeuta.tipo_login;

    const token = jwt.sign(
      {
        id: terapeuta.id,
        email: terapeuta.email,
        role: userRole,
      },
      process.env.JWT_SECRET || "hash123",
      {
        expiresIn: "8h",
      }
    );

    res.status(200).json({
      message: "Login bem-sucedido!",
      token: token,
      role: userRole,
      terapeuta: {
        nome: terapeuta.nome,
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
});

//rota pro admin criar um novo usuario terapeuta ou admin
app.post(
  "/api/usuarios",
  [verificarToken, verificarAdmin],
  async (req, res) => {
    const { nome, email, senha, tipo_login } = req.body;
    const criadorId = req.terapeuta.id;

    if (!nome || !email || !senha || !tipo_login) {
      return res
        .status(400)
        .json({ error: "Todos os campos são obrigatórios." });
    }
    if (
      tipo_login !== "admin" &&
      tipo_login !== "terapeuta" &&
      tipo_login !== "paciente"
    ) {
      return res
        .status(400)
        .json({
          error: 'O tipo de login deve ser "admin", "terapeuta" ou "paciente".',
        });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const senhaHash = await bcrypt.hash(senha, 10);
      const queryText =
        "INSERT INTO terapeutas (nome, email, senha_hash, tipo_login) VALUES ($1, $2, $3, $4) RETURNING id, email, nome, tipo_login;";
      const result = await client.query(queryText, [
        nome,
        email,
        senhaHash,
        tipo_login,
      ]);
      const newUserId = result.rows[0].id;

      if (tipo_login === "paciente") {
        // Se quem cria é admin ou terapeuta, ele se torna o "dono" (terapeuta_id) do paciente
        // Isso garante que o admin veja o paciente que acabou de criar
        const terapeutaDonoId = criadorId;
        const pacienteQuery =
          "INSERT INTO pacientes (nome_completo, email, usuario_id, terapeuta_id) VALUES ($1, $2, $3, $4);";
        await client.query(pacienteQuery, [
          nome,
          email,
          newUserId,
          terapeutaDonoId,
        ]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Usuário criado com sucesso!",
        usuario: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Erro ao criar usuário:", error);
      if (error.code === "23505") {
        return res.status(409).json({ error: "Este e-mail já está em uso." });
      }
      res.status(500).json({ error: "Erro interno do servidor." });
    } finally {
      client.release();
    }
  }
);

// rota pra listar todos os usuarios menos terapeuta
app.get("/api/usuarios", [verificarToken, verificarAdmin], async (req, res) => {
  try {
    const queryText =
      "SELECT id, nome, email, tipo_login FROM terapeutas ORDER BY nome;";
    const result = await pool.query(queryText);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

//rota publica pro paciente se cadastrar
app.post("/api/auth/registrar-paciente", async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res
      .status(400)
      .json({ error: "Nome, email e senha são obrigatórios." });
  }

  let client;
  try {
    // Obtém conexão do pool (pode falhar, por isso fica dentro do try)
    client = await pool.connect();
  } catch (error) {
    console.error("Erro ao conectar ao banco para registrar paciente:", error);
    return res
      .status(500)
      .json({ error: "Erro de conexão com o banco de dados." });
  }

  try {
    // Inicia a transação
    await client.query("BEGIN");

    const senhaHash = await bcrypt.hash(senha, 10);
    const tipoLogin = "paciente";
    const userQuery =
      "INSERT INTO terapeutas (nome, email, senha_hash, tipo_login) VALUES ($1, $2, $3, $4) RETURNING id;";

    const userResult = await client.query(userQuery, [
      nome,
      email,
      senhaHash,
      tipoLogin,
    ]);
    const newUserId = userResult.rows[0].id;
    const pacienteQuery =
      "INSERT INTO pacientes (nome_completo, email, usuario_id) VALUES ($1, $2, $3) RETURNING id;";

    await client.query(pacienteQuery, [nome, email, newUserId]);
    await client.query("COMMIT");

    res.status(201).json({
      message: "Paciente registrado com sucesso!",
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("Erro ao executar ROLLBACK:", rollbackErr);
    }

    console.error("Erro ao registrar paciente:", error);
    if (error.code === "23505") {
      return res.status(409).json({ error: "Este e-mail já está em uso." });
    }
    res.status(500).json({ error: "Erro interno do servidor." });
  } finally {
    if (client) client.release();
  }
});

//rota pra buscar o paciente no bd
app.post("/api/pacientes", verificarToken, async (req, res) => {
  const {
    nome_completo,
    data_nascimento,
    sexo,
    cpf,
    rg,
    nacionalidade,
    celular,
    telefone,
    email,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
    motivacao_consulta,
    historico_medico,
  } = req.body;

  const terapeutaId = req.terapeuta.id;
  const role = req.terapeuta.role;

  if (role === "paciente") {
    return res
      .status(403)
      .json({ error: "Pacientes não podem cadastrar outros pacientes." });
  }

  try {
    const queryText = `
            INSERT INTO pacientes (
                nome_completo, data_nascimento, sexo, cpf, rg, nacionalidade,
                celular, telefone, email, cep, logradouro, numero,
                complemento, bairro, cidade, estado,
                motivacao_consulta, historico_medico,
                terapeuta_id 
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 
                $13, $14, $15, $16, $17, $18, $19
            ) RETURNING *;
        `;
    const values = [
      nome_completo,
      data_nascimento,
      sexo,
      cpf,
      rg,
      nacionalidade,
      celular,
      telefone,
      email,
      cep,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      motivacao_consulta,
      historico_medico,
      terapeutaId,
    ];

    const result = await pool.query(queryText, values);
    res.status(201).json({
      message: "Paciente cadastrado com sucesso!",
      paciente: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao cadastrar paciente:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});
//rota pra estatisticas do dashboard index
app.get("/api/dashboard/stats", verificarToken, async (req, res) => {
  const { id: userId, role } = req.terapeuta;

  if (role === "paciente") {
    return res.status(200).json({
      pacientes_ativos: 0,
      sessoes_hoje: 0,
      faturamento_mes: 0,
    });
  }

  // Agora ADMIN e TERAPEUTA se comportam igual: só veem seus próprios dados
  const values = [userId];
  const queryText = `
            SELECT
                (SELECT COUNT(*) FROM pacientes WHERE terapeuta_id = $1) AS pacientes_ativos,
                (SELECT COUNT(*) FROM sessoes s JOIN pacientes p ON s.paciente_id = p.id WHERE s.data_sessao::date = CURRENT_DATE AND p.terapeuta_id = $1) AS sessoes_hoje,
                (SELECT COALESCE(SUM(s.valor_sessao), 0) FROM sessoes s JOIN pacientes p ON s.paciente_id = p.id WHERE s.status_pagamento = 'Pago' AND s.data_sessao >= DATE_TRUNC('month', CURRENT_DATE) AND p.terapeuta_id = $1) AS faturamento_mes,
                (SELECT COUNT(s.id) FROM sessoes s JOIN pacientes p ON s.paciente_id = p.id LEFT JOIN avaliacoes a ON s.id = a.sessao_id WHERE s.data_sessao < NOW() AND a.id IS NULL AND p.terapeuta_id = $1) AS avaliacoes_pendentes;
        `;

  try {
    const result = await pool.query(queryText, values);
    const stats = result.rows[0] || {};
    // Usuários bloqueados não devem ver o resumo financeiro no dashboard
    if (isFinanceBlockedUser(req.terapeuta)) {
      stats.faturamento_mes = 0;
    }
    res.status(200).json(stats);
  } catch (error) {
    console.error("Erro ao buscar estatísticas do dashboard:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

//rota pra buscar os pacientes salvos no BD
app.get("/api/pacientes", verificarToken, async (req, res) => {
  const { id: userId, role } = req.terapeuta;

  let queryText = "SELECT * FROM pacientes";
  let values = [];

  if (role === "admin") {
    // Admin (secretaria) precisa ver todos os pacientes para agendar sessões.
    // Mantém a regra de compartilhamento restrito do Talitau.
    const talitauId = await getTalitauUserId();
    if (talitauId && !canAccessTalitauPatients(req.terapeuta)) {
      queryText +=
        " WHERE (terapeuta_id IS NULL OR terapeuta_id <> $1) ORDER BY nome_completo;";
      values = [talitauId];
    } else {
      queryText += " ORDER BY nome_completo;";
    }
  } else if (role === "terapeuta") {
    // Terapeuta vê apenas seus pacientes (com exceção de compartilhamento do talitau)
    const talitauId = await getTalitauUserId();
    if (
      talitauId &&
      canAccessTalitauPatients(req.terapeuta) &&
      Number(talitauId) !== Number(userId)
    ) {
      queryText +=
        " WHERE (terapeuta_id = $1 OR terapeuta_id = $2) ORDER BY nome_completo;";
      values = [userId, talitauId];
    } else {
      queryText += " WHERE terapeuta_id = $1 ORDER BY nome_completo;";
      values = [userId];
    }
  } else if (role === "paciente") {
    queryText += " WHERE usuario_id = $1;";
    values = [userId];
  } else {
    // Fallback seguro, embora não deva acontecer
    queryText += " WHERE terapeuta_id = $1 ORDER BY nome_completo;";
    values = [userId];
  }

  try {
    const result = await pool.query(queryText, values);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao listar pacientes:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

//buscando paciente especifico
app.get(
  "/api/pacientes/:id",
  [verificarToken, verificarAcessoPacienteId],
  async (req, res) => {
    const { id } = req.params;
    console.log(`recebida requisição para buscar o paciente com ID ${id}`);

    try {
      const queryText = "SELECT * FROM pacientes WHERE id = $1";
      const result = await pool.query(queryText, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Paciente não encontrado ",
        });
      }
      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error("erro ao buscar paciente por ID", error);
      res.status(500).json({
        error: "erro interno do servidor, consulte o suporte",
      });
    }
  }
);

//rota pra atualizar um paciente
app.put(
  "/api/pacientes/:id",
  [verificarToken, verificarAcessoPacienteId],
  async (req, res) => {
    const { id } = req.params;
    console.log(`recebida requisição para atualizar o paciente com ID: {id}`);

    const {
      nome_completo,
      data_nascimento,
      sexo,
      cpf,
      rg,
      nacionalidade,
      telefone,
      celular,
      email,
      cep,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      historico_medico,
      motivacao_consulta,
    } = req.body;
    if (!nome_completo || !data_nascimento || !celular || !motivacao_consulta) {
      return res.status(400).json({
        error: "campos obrigatórios faltando!!",
      });
    }
    try {
      const queryText = `
        UPDATE pacientes SET nome_completo = $1, data_nascimento = $2, sexo = $3, cpf = $4, rg = $5,
        nacionalidade = $6, telefone = $7, celular = $8, email = $9, cep = $10, logradouro = $11,
        numero = $12, complemento = $13, bairro = $14, cidade = $15, estado = $16, historico_medico = $17,
        motivacao_consulta = $18 WHERE id = $19 RETURNING *;
        `;
      const values = [
        nome_completo,
        data_nascimento,
        sexo,
        cpf,
        rg,
        nacionalidade,
        telefone,
        celular,
        email,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        estado,
        historico_medico,
        motivacao_consulta,
        id,
      ];
      const result = await pool.query(queryText, values);
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "paciente não encontrado para atualização ",
        });
      }
      res.status(200).json({
        message: "paciente atualizado com sucesso!!",
        paciente: result.rows[0],
      });
    } catch (error) {
      console.error("erro ao atualizar paciente:", error);
      res.status(500).json({
        error: "erro interno do servidor, consulte o suporte",
      });
    }
  }
);

//rota listar paciente só admins
app.get(
  "/api/terapeutas-lista",
  [verificarToken, verificarAdmin],
  async (req, res) => {
    try {
      const queryText =
        "SELECT id, nome FROM terapeutas WHERE tipo_login = 'terapeuta' ORDER BY nome;";
      const result = await pool.query(queryText);
      res.status(200).json(result.rows);
    } catch (error) {
      console.error("Erro ao listar terapeutas:", error);
      res.status(500).json({ error: "Erro interno do servidor." });
    }
  }
);

//rota listar logins pacientes órfãos (sem paciente associado)
app.get(
  "/api/logins-pacientes-orfaos",
  [verificarToken, verificarAdmin],
  async (req, res) => {
    try {
      const queryText = `
            SELECT t.id, t.nome, t.email FROM terapeutas t
            LEFT JOIN pacientes p ON t.id = p.usuario_id
            WHERE t.tipo_login = 'paciente' AND p.id IS NULL
            ORDER BY t.nome;
        `;
      const result = await pool.query(queryText);
      res.status(200).json(result.rows);
    } catch (error) {
      console.error("Erro ao listar logins órfãos:", error);
      res.status(500).json({ error: "Erro interno do servidor." });
    }
  }
);

//só admins podem atribuir pacientes
app.put(
  "/api/pacientes/:pacienteId/atribuir",
  [verificarToken, verificarAdmin],
  async (req, res) => {
    const { pacienteId } = req.params;
    const { terapeuta_id, usuario_id } = req.body;

    if (!terapeuta_id && !usuario_id) {
      return res.status(400).json({
        error: "Pelo menos um ID (terapeuta ou usuário) é obrigatório.",
      });
    }

    try {
      let queryCampos = [];
      let values = [];
      let valueCount = 1;

      if (terapeuta_id) {
        queryCampos.push(`terapeuta_id = $${valueCount++}`);
        values.push(terapeuta_id);
      }
      if (usuario_id) {
        queryCampos.push(`usuario_id = $${valueCount++}`);
        values.push(usuario_id);
      }

      values.push(pacienteId);

      const queryText = `UPDATE pacientes SET ${queryCampos.join(
        ", "
      )} WHERE id = $${valueCount} RETURNING *;`;
      const result = await pool.query(queryText, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Paciente não encontrado." });
      }

      res.status(200).json({
        message: "Paciente atualizado com sucesso!",
        paciente: result.rows[0],
      });
    } catch (error) {
      console.error("Erro ao atualizar paciente:", error);
      if (error.code === "23505") {
        return res.status(409).json({
          error: "Este login de paciente já está vinculado a outro perfil.",
        });
      }
      res.status(500).json({ error: "Erro interno do servidor." });
    }
  }
);

// Rota para o admin excluir um usuário (terapeuta/admin/paciente)
app.delete(
  "/api/usuarios/:id",
  [verificarToken, verificarAdmin],
  async (req, res) => {
    const { id } = req.params;
    const requesterId = req.terapeuta.id;

    if (parseInt(id, 10) === requesterId) {
      return res
        .status(400)
        .json({ error: "Você não pode excluir seu próprio usuário." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const userRes = await client.query(
        "SELECT id, tipo_login FROM terapeutas WHERE id = $1",
        [id]
      );
      if (userRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Usuário não encontrado." });
      }

      const tipo = userRes.rows[0].tipo_login;

      if (tipo === "paciente") {
        // Remover dados clínicos relacionados ao paciente antes de remover o perfil
        const pacientesRes = await client.query(
          "SELECT id FROM pacientes WHERE usuario_id = $1",
          [id]
        );

        for (const p of pacientesRes.rows) {
          const pacienteId = p.id;
          await client.query(
            "DELETE FROM avaliacoes WHERE sessao_id IN (SELECT id FROM sessoes WHERE paciente_id = $1)",
            [pacienteId]
          );
          await client.query("DELETE FROM sessoes WHERE paciente_id = $1", [
            pacienteId,
          ]);
          await client.query("DELETE FROM medicacoes WHERE paciente_id = $1", [
            pacienteId,
          ]);
          await client.query("DELETE FROM pacientes WHERE id = $1", [
            pacienteId,
          ]);
        }

        // Finalmente remove o login
        await client.query("DELETE FROM terapeutas WHERE id = $1", [id]);
      } else {
        // Se for terapeuta ou admin, apenas desassocia pacientes e remove o login
        await client.query(
          "UPDATE pacientes SET terapeuta_id = NULL WHERE terapeuta_id = $1",
          [id]
        );
        await client.query("DELETE FROM terapeutas WHERE id = $1", [id]);
      }

      await client.query("COMMIT");
      res.status(200).json({ message: "Usuário excluído com sucesso." });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Erro ao excluir usuário:", error);
      res.status(500).json({ error: "Erro interno do servidor." });
    } finally {
      client.release();
    }
  }
);

app.get(
  "/api/terapeutas-lista",
  [verificarToken, verificarAdmin],
  async (req, res) => {
    try {
      const queryText =
        "SELECT id, nome FROM terapeutas WHERE tipo_login = 'terapeuta' ORDER BY nome;";
      const result = await pool.query(queryText);
      res.status(200).json(result.rows);
    } catch (error) {
      console.error("Erro ao listar terapeutas:", error);
      res.status(500).json({ error: "Erro interno do servidor." });
    }
  }
);

//só admin lista os pacientes
app.put(
  "/api/pacientes/:pacienteId/atribuir",
  [verificarToken, verificarAdmin],
  async (req, res) => {
    const { pacienteId } = req.params;
    // Agora aceitamos os DOIS IDs
    const { terapeuta_id, usuario_id } = req.body;

    // Pelo menos um deles tem que ser enviado
    if (!terapeuta_id && !usuario_id) {
      return res
        .status(400)
        .json({
          error: "Pelo menos um ID (terapeuta ou usuário) é obrigatório.",
        });
    }

    try {
      // Constrói a query dinamicamente
      let queryCampos = [];
      let values = [];
      let valueCount = 1;

      if (terapeuta_id) {
        queryCampos.push(`terapeuta_id = $${valueCount++}`);
        values.push(terapeuta_id);
      }
      if (usuario_id) {
        queryCampos.push(`usuario_id = $${valueCount++}`);
        values.push(usuario_id);
      }

      values.push(pacienteId); // O pacienteId é sempre o último

      const queryText = `UPDATE pacientes SET ${queryCampos.join(
        ", "
      )} WHERE id = $${valueCount} RETURNING *;`;
      const result = await pool.query(queryText, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Paciente não encontrado." });
      }

      res.status(200).json({
        message: "Paciente atualizado com sucesso!",
        paciente: result.rows[0],
      });
    } catch (error) {
      console.error("Erro ao atualizar paciente:", error);
      // Erro se tentar vincular um login que já está em uso
      if (error.code === "23505") {
        return res
          .status(409)
          .json({
            error: "Este login de paciente já está vinculado a outro perfil.",
          });
      }
      res.status(500).json({ error: "Erro interno do servidor." });
    }
  }
);

app.delete(
  "/api/pacientes/:id",
  [verificarToken, verificarAcessoPacienteId],
  async (req, res) => {
    const { id } = req.params;
    console.log(`Recebida requisição para EXCLUIR o paciente com ID: ${id}`);

    try {
      const queryText = "DELETE FROM pacientes WHERE id = $1 RETURNING *;";
      const result = await pool.query(queryText, [id]);

      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "Paciente não encontrado para exclusão",
        });
      }
      res.status(200).json({
        message: `Paciente "${result.rows[0].nome_completo}" foi excluído com sucesso.`,
      });
    } catch (error) {
      console.error("Erro ao excluir paciente:", error);
      res.status(500).json({
        error: "Erro interno do servidor",
      });
    }
  }
);

//rota para marcar uma sessao
app.post("/api/sessoes", verificarToken, async (req, res) => {
  console.log("Recebida requisição para criar nova sessão:", req.body);

  const {
    paciente_id,
    data_sessao,
    duracao_minutos,
    tipo_sessao,
    resumo_sessao,
    valor_sessao: rawValorSessao,
    status_pagamento: rawStatusPagamento,
  } = req.body;

  if (!paciente_id || !data_sessao) {
    return res.status(400).json({
      error: "ID do paciente e data da sessão são obrigatórios.",
    });
  }

  try {
    // Garante que o usuário tem acesso ao paciente antes de criar a sessão
    const pacienteRes = await pool.query(
      "SELECT id, terapeuta_id, usuario_id FROM pacientes WHERE id = $1",
      [paciente_id]
    );
    if (pacienteRes.rows.length === 0) {
      return res.status(404).json({ error: "Paciente não encontrado." });
    }
    const paciente = pacienteRes.rows[0];
    const { id: userId, role } = req.terapeuta;
    const talitauId = await getTalitauUserId();

    if (role === "paciente") {
      if (paciente.usuario_id !== userId) {
        return res.status(403).json({ error: "Acesso negado ao paciente." });
      }
    } else if (talitauId && paciente.terapeuta_id === talitauId) {
      if (!canAccessTalitauPatients(req.terapeuta)) {
        return res.status(403).json({
          error: "Acesso negado aos pacientes deste terapeuta.",
        });
      }
    } else if (role !== "admin" && paciente.terapeuta_id !== userId) {
      return res.status(403).json({ error: "Acesso negado ao paciente." });
    }

    const queryText = `
      INSERT INTO sessoes (
        paciente_id, data_sessao, duracao_minutos, tipo_sessao, 
        resumo_sessao, valor_sessao, status_pagamento
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const paymentFieldsBlocked = isSessionPaymentFieldsBlockedUser(req.terapeuta);
    const valor_sessao = paymentFieldsBlocked ? null : rawValorSessao;
    const status_pagamento = paymentFieldsBlocked ? "Pendente" : rawStatusPagamento;

    const values = [
      paciente_id,
      data_sessao,
      duracao_minutos,
      tipo_sessao,
      resumo_sessao,
      valor_sessao,
      status_pagamento,
    ];

    const result = await pool.query(queryText, values);
    res.status(201).json({
      message: "Sessão registrada com sucesso!",
      sessao: sanitizeSessaoForPaymentPrivacy(result.rows[0], req.terapeuta),
    });
  } catch (error) {
    console.error("Erro ao registrar sessão:", error);
    res.status(500).json({
      error: "Erro interno do servidor ao registrar a sessão.",
    });
  }
});

//rota pra buscar os detalhes de uma unica sessao
app.get(
  "/api/sessoes/:id",
  [verificarToken, verificarAcessoSessao],
  async (req, res) => {
    const { id } = req.params;
    console.log(`Buscando detalhes da sessão com ID: ${id}`);

    try {
      const queryText = `
      SELECT 
        s.*,
        p.nome_completo AS paciente_nome
      FROM sessoes s
      JOIN pacientes p ON s.paciente_id = p.id
      WHERE s.id = $1;
    `;
      const result = await pool.query(queryText, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Sessão não encontrada.",
        });
      }
      res.status(200).json(sanitizeSessaoForPaymentPrivacy(result.rows[0], req.terapeuta));
    } catch (error) {
      console.error("Erro ao buscar detalhes da sessão:", error);
      res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }
  }
);

//rota pra atualizar uma sessão
app.put(
  "/api/sessoes/:id",
  [verificarToken, verificarAcessoSessao],
  async (req, res) => {
    const { id } = req.params;
    const {
      data_sessao,
      duracao_minutos,
      tipo_sessao,
      resumo_sessao,
      valor_sessao: rawValorSessao,
      status_pagamento: rawStatusPagamento,
    } = req.body;

    if (!data_sessao) {
      return res.status(400).json({
        error: "A data da sessão é obrigatória.",
      });
    }

    try {
      const paymentFieldsBlocked = isSessionPaymentFieldsBlockedUser(req.terapeuta);

      let queryText;
      let values;

      if (paymentFieldsBlocked) {
        // Para estes logins, não atualizar valor/status (mantém o dado existente no BD)
        queryText = `
        UPDATE sessoes SET
          data_sessao = $1, duracao_minutos = $2, tipo_sessao = $3,
          resumo_sessao = $4
        WHERE id = $5
        RETURNING *;
      `;
        values = [
          data_sessao,
          duracao_minutos,
          tipo_sessao,
          resumo_sessao,
          id,
        ];
      } else {
        queryText = `
        UPDATE sessoes SET
          data_sessao = $1, duracao_minutos = $2, tipo_sessao = $3,
          resumo_sessao = $4, valor_sessao = $5, status_pagamento = $6
        WHERE id = $7
        RETURNING *;
      `;
        values = [
          data_sessao,
          duracao_minutos,
          tipo_sessao,
          resumo_sessao,
          rawValorSessao,
          rawStatusPagamento,
          id,
        ];
      }

      const result = await pool.query(queryText, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Sessão não encontrada para atualização.",
        });
      }
      res.status(200).json({
        message: "Sessão atualizada com sucesso!",
        sessao: sanitizeSessaoForPaymentPrivacy(result.rows[0], req.terapeuta),
      });
    } catch (error) {
      console.error("Erro ao atualizar sessão:", error);
      res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }
  }
);

//rota pra excluir uma sessão
app.delete(
  "/api/sessoes/:id",
  [verificarToken, verificarAcessoSessao],
  async (req, res) => {
    const { id } = req.params;
    try {
      const queryText = "DELETE FROM sessoes WHERE id = $1 RETURNING id;";
      const result = await pool.query(queryText, [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "Sessão não encontrada para exclusão.",
        });
      }
      res.status(200).json({
        message: "Sessão excluída com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao excluir sessão:", error);
      res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }
  }
);

//rota pra buscar todas as sessões de um paciente especific
app.get(
  "/api/pacientes/:pacienteId/sessoes",
  [verificarToken, verificarAcessoPacienteParam("pacienteId")],
  async (req, res) => {
    const { pacienteId } = req.params;
    console.log(`Buscando todas as sessões para o paciente ID: ${pacienteId}`);

    try {
      const queryText =
        "SELECT * FROM sessoes WHERE paciente_id = $1 ORDER BY data_sessao DESC";
      const result = await pool.query(queryText, [pacienteId]);

      res
        .status(200)
        .json(result.rows.map((r) => sanitizeSessaoForPaymentPrivacy(r, req.terapeuta)));
    } catch (error) {
      console.error("Erro ao buscar sessões do paciente:", error);
      res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }
  }
);

//rota pra alimentar o fullcalender biblioteca do js
app.get("/api/sessoes", verificarToken, async (req, res) => {
  const { id: userId, role } = req.terapeuta;

  let queryText = `
        SELECT s.id, s.data_sessao, s.duracao_minutos, p.nome_completo AS title
        FROM sessoes s
        JOIN pacientes p ON s.paciente_id = p.id
    `;

  let values = [];

  if (role === "admin") {
    // Admin (secretaria) enxerga todas as sessões para organizar agenda.
    // Mantém a regra de compartilhamento restrito do Talitau.
    const talitauId = await getTalitauUserId();
    if (talitauId && !canAccessTalitauPatients(req.terapeuta)) {
      queryText += " WHERE (p.terapeuta_id IS NULL OR p.terapeuta_id <> $1)";
      values = [talitauId];
    }
  } else if (role === "terapeuta") {
    const talitauId = await getTalitauUserId();
    if (
      talitauId &&
      canAccessTalitauPatients(req.terapeuta) &&
      Number(talitauId) !== Number(userId)
    ) {
      queryText += " WHERE (p.terapeuta_id = $1 OR p.terapeuta_id = $2)";
      values = [userId, talitauId];
    } else {
      queryText += " WHERE p.terapeuta_id = $1";
      values = [userId];
    }
  } else if (role === "paciente") {
    queryText += " WHERE p.usuario_id = $1";
    values = [userId];
  }

  try {
    const result = await pool.query(queryText, values);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar sessões para agenda:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

//rota pra add uma medicação pra um paciente
app.post(
  "/api/pacientes/:pacienteId/medicacoes",
  [verificarToken, verificarAcessoPacienteParam("pacienteId")],
  async (req, res) => {
    const { pacienteId } = req.params;
    const {
      nome_medicamento,
      dosagem,
      frequencia,
      data_inicio,
      data_termino,
      medico_prescritor,
      observacoes,
    } = req.body;

    if (!nome_medicamento || !data_inicio) {
      return res.status(400).json({
        error: "Nome do medicamento e data de início são obrigatórios.",
      });
    }

    try {
      const queryText = `
      INSERT INTO medicacoes (
        paciente_id, nome_medicamento, dosagem, frequencia, data_inicio,
        data_termino, medico_prescritor, observacoes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
      const values = [
        pacienteId,
        nome_medicamento,
        dosagem,
        frequencia,
        data_inicio,
        data_termino || null,
        medico_prescritor,
        observacoes,
      ];

      const result = await pool.query(queryText, values);
      res.status(201).json({
        message: "Medicação registrada com sucesso!",
        medicacao: result.rows[0],
      });
    } catch (error) {
      console.error("Erro ao registrar medicação:", error);
      res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }
  }
);

//rota pra listar todas as medicações de um paciente
app.get(
  "/api/pacientes/:pacienteId/medicacoes",
  [verificarToken, verificarAcessoPacienteParam("pacienteId")],
  async (req, res) => {
    const { pacienteId } = req.params;
    try {
      const queryText =
        "SELECT * FROM medicacoes WHERE paciente_id = $1 ORDER BY data_inicio DESC;";
      const result = await pool.query(queryText, [pacienteId]);
      res.status(200).json(result.rows);
    } catch (error) {
      console.error("Erro ao buscar medicações do paciente:", error);
      res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }
  }
);

//rota pra atualizar uma medicacao
app.put(
  "/api/medicacoes/:id",
  [verificarToken, verificarAcessoMedicacao],
  async (req, res) => {
    const { id } = req.params;
    const {
      nome_medicamento,
      dosagem,
      frequencia,
      data_inicio,
      data_termino,
      medico_prescritor,
      observacoes,
    } = req.body;

    try {
      const queryText = `
      UPDATE medicacoes SET
        nome_medicamento = $1, dosagem = $2, frequencia = $3, data_inicio = $4,
        data_termino = $5, medico_prescritor = $6, observacoes = $7
      WHERE id = $8 RETURNING *;
    `;
      const values = [
        nome_medicamento,
        dosagem,
        frequencia,
        data_inicio,
        data_termino || null,
        medico_prescritor,
        observacoes,
        id,
      ];
      const result = await pool.query(queryText, values);
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Medicação não encontrada.",
        });
      }
      res.status(200).json({
        message: "Medicação atualizada com sucesso!",
        medicacao: result.rows[0],
      });
    } catch (error) {
      console.error("Erro ao atualizar medicação:", error);
      res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }
  }
);

//rota pra excluir uma medicacao
app.delete(
  "/api/medicacoes/:id",
  [verificarToken, verificarAcessoMedicacao],
  async (req, res) => {
    const { id } = req.params;
    try {
      const queryText = "DELETE FROM medicacoes WHERE id = $1 RETURNING id;";
      const result = await pool.query(queryText, [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "Medicação não encontrada.",
        });
      }
      res.status(200).json({
        message: "Medicação excluída com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao excluir medicação:", error);
      res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }
  }
);

//rota pro resumo financeiro do mes atual
app.get(
  "/api/financeiro/resumo",
  [verificarToken, verificarAcessoFinanceiro],
  async (req, res) => {
    const { id: userId } = req.terapeuta;
    console.log("Buscando resumo financeiro do mês atual");
    try {
      const queryText = `
      SELECT
        -- Soma o valor da sessão APENAS se o status for 'Pago'
        COALESCE(SUM(CASE WHEN s.status_pagamento = 'Pago' THEN s.valor_sessao ELSE 0 END), 0) AS faturamento_mes,
        
        -- Soma o valor da sessão APENAS se o status for 'Pendente'
        COALESCE(SUM(CASE WHEN s.status_pagamento = 'Pendente' THEN s.valor_sessao ELSE 0 END), 0) AS a_receber,
        
        -- Conta quantas sessões foram pagas
        COUNT(CASE WHEN s.status_pagamento = 'Pago' THEN 1 END) AS sessoes_pagas,
        
        -- Conta quantas sessões estão pendentes
        COUNT(CASE WHEN s.status_pagamento = 'Pendente' THEN 1 END) AS sessoes_pendentes

      FROM sessoes s
      JOIN pacientes p ON s.paciente_id = p.id
      WHERE s.data_sessao >= DATE_TRUNC('month', CURRENT_DATE)
      AND p.terapeuta_id = $1; -- Filtra apenas para o admin/terapeuta logado
    `;
      const result = await pool.query(queryText, [userId]);
      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error("Erro ao buscar resumo financeiro:", error);
      res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }
  }
);

//rota para as transacoes recentes
app.get(
  "/api/financeiro/transacoes",
  [verificarToken, verificarAcessoFinanceiro],
  async (req, res) => {
    const { id: userId } = req.terapeuta;
    console.log("Buscando transações financeiras recentes");
    try {
      const queryText = `
      SELECT 
        s.id,
        s.data_sessao,
        s.valor_sessao,
        s.status_pagamento,
        p.nome_completo AS paciente_nome
      FROM sessoes s
      JOIN pacientes p ON s.paciente_id = p.id
      WHERE p.terapeuta_id = $1
      ORDER BY s.data_sessao DESC
      LIMIT 10; -- Pega as 10 últimas sessões
    `;
      const result = await pool.query(queryText, [userId]);
      res.status(200).json(result.rows);
    } catch (error) {
      console.error("Erro ao buscar transações:", error);
      res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }
  }
);
//relatorios rota geração
app.post(
  "/api/relatorios/financeiro",
  [verificarToken, verificarAcessoFinanceiro],
  async (req, res) => {
    const { data_inicio, data_fim } = req.body;
    const { id: userId } = req.terapeuta;
    console.log(`Gerando relatório financeiro de ${data_inicio} a ${data_fim}`);

    if (!data_inicio || !data_fim) {
      return res.status(400).json({
        error: "Data de início e data de fim são obrigatórias.",
      });
    }

    try {
      const queryResumo = `
            SELECT
                COALESCE(SUM(CASE WHEN s.status_pagamento = 'Pago' THEN s.valor_sessao ELSE 0 END), 0) AS faturamento_total,
                COUNT(*) AS total_sessoes
            FROM sessoes s
            JOIN pacientes p ON s.paciente_id = p.id
            WHERE s.data_sessao::date BETWEEN $1 AND $2
            AND p.terapeuta_id = $3;
        `;

      const queryTransacoes = `
            SELECT s.data_sessao, s.valor_sessao, s.status_pagamento, p.nome_completo AS paciente_nome
            FROM sessoes s
            JOIN pacientes p ON s.paciente_id = p.id
            WHERE s.data_sessao::date BETWEEN $1 AND $2
            AND p.terapeuta_id = $3
            ORDER BY s.data_sessao DESC;
        `;

      const resumoResult = await pool.query(queryResumo, [
        data_inicio,
        data_fim,
        userId,
      ]);
      const transacoesResult = await pool.query(queryTransacoes, [
        data_inicio,
        data_fim,
        userId,
      ]);

      res.status(200).json({
        resumo: resumoResult.rows[0],
        transacoes: transacoesResult.rows,
      });
    } catch (error) {
      console.error("Erro ao gerar relatório financeiro:", error);
      res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }
  }
);

// ============================
// Rotas ABA+ (Programas, Sessões, Evoluções, Planos)
// ============================

// Programas ABA
app.get("/api/aba/programas", verificarToken, async (req, res) => {
  const { id: userId, role } = req.terapeuta;
  const { pacienteId } = req.query;

  let queryText = `
    SELECT ap.*, p.nome_completo AS paciente_nome
    FROM aba_programas ap
    JOIN pacientes p ON ap.paciente_id = p.id
  `;
  let values = [];

  if (role === "terapeuta" || role === "admin") {
    const talitauId = await getTalitauUserId();
    if (
      talitauId &&
      canAccessTalitauPatients(req.terapeuta) &&
      Number(talitauId) !== Number(userId)
    ) {
      queryText += " WHERE (p.terapeuta_id = $1 OR p.terapeuta_id = $2)";
      values = [userId, talitauId];
    } else {
      queryText += " WHERE p.terapeuta_id = $1";
      values = [userId];
    }
  } else if (role === "paciente") {
    queryText += " WHERE p.usuario_id = $1";
    values = [userId];
  }

  if (pacienteId) {
    const idx = values.length + 1;
    queryText += values.length
      ? ` AND ap.paciente_id = $${idx}`
      : ` WHERE ap.paciente_id = $${idx}`;
    values.push(pacienteId);
  }

  try {
    const result = await pool.query(queryText, values);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao listar programas ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.post("/api/aba/programas", verificarToken, async (req, res) => {
  const {
    patientId,
    name,
    code,
    description,
    category,
    targetBehavior,
    currentCriteria,
    status,
  } = req.body;

  if (!patientId || !name) {
    return res
      .status(400)
      .json({ error: "Paciente e nome do programa são obrigatórios." });
  }

  try {
    const queryText = `
      INSERT INTO aba_programas (
        paciente_id, codigo, nome, categoria, descricao,
        comportamento_alvo, criterio_atual, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [
      patientId,
      code || null,
      name,
      category || "communication",
      description || null,
      targetBehavior || null,
      currentCriteria || null,
      status || "active",
    ];
    const result = await pool.query(queryText, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao criar programa ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.put("/api/aba/programas/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  const {
    patientId,
    name,
    code,
    description,
    category,
    targetBehavior,
    currentCriteria,
    status,
  } = req.body;

  if (!patientId || !name) {
    return res
      .status(400)
      .json({ error: "Paciente e nome do programa são obrigatórios." });
  }

  try {
    const queryText = `
      UPDATE aba_programas SET
        paciente_id = $1,
        codigo = $2,
        nome = $3,
        categoria = $4,
        descricao = $5,
        comportamento_alvo = $6,
        criterio_atual = $7,
        status = $8,
        atualizado_em = NOW()
      WHERE id = $9
      RETURNING *;
    `;
    const values = [
      patientId,
      code || null,
      name,
      category || "communication",
      description || null,
      targetBehavior || null,
      currentCriteria || null,
      status || "active",
      id,
    ];
    const result = await pool.query(queryText, values);
    if (!result.rows.length) {
      return res.status(404).json({ error: "Programa ABA não encontrado." });
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar programa ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.delete("/api/aba/programas/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  try {
    // Pacientes não podem excluir programas
    if (req.terapeuta?.role === "paciente") {
      return res
        .status(403)
        .json({ error: "Pacientes não podem excluir programas." });
    }

    const programRes = await pool.query(
      "SELECT id, paciente_id FROM aba_programas WHERE id = $1",
      [id]
    );
    if (!programRes.rows.length) {
      return res.status(404).json({ error: "Programa ABA não encontrado." });
    }

    const pacienteId = programRes.rows[0].paciente_id;
    const ok = await assertCanAccessPacienteId(req, res, pacienteId);
    if (!ok) return;

    const result = await pool.query(
      "DELETE FROM aba_programas WHERE id = $1 RETURNING id",
      [id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Programa ABA não encontrado." });
    }
    res.status(200).json({ message: "Programa ABA excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir programa ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.get("/api/aba/alvos", verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, label
       FROM aba_alvos
       ORDER BY created_at ASC`
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao listar alvos ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.post("/api/aba/alvos", verificarToken, async (req, res) => {
  const { id: userId } = req.terapeuta;
  const { label } = req.body;

  if (!label || !label.trim()) {
    return res.status(400).json({ error: "O texto do alvo é obrigatório." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO aba_alvos (terapeuta_id, label)
       VALUES ($1, $2)
       RETURNING id, label;`,
      [userId, label.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao criar alvo ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.delete("/api/aba/alvos/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  const { id: userId, role } = req.terapeuta;

  try {
    const existing = await pool.query(
      "SELECT id, terapeuta_id FROM aba_alvos WHERE id = $1",
      [id]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ error: "Alvo não encontrado." });
    }

    const ownerId = existing.rows[0].terapeuta_id;
    if (
      role !== "admin" &&
      ownerId != null &&
      Number(ownerId) !== Number(userId)
    ) {
      return res
        .status(403)
        .json({ error: "Acesso negado para excluir este alvo." });
    }
    if (role !== "admin" && ownerId == null) {
      return res
        .status(403)
        .json({ error: "Apenas admin pode excluir este alvo." });
    }

    const result = await pool.query(
      "DELETE FROM aba_alvos WHERE id = $1 RETURNING id, label",
      [id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Alvo não encontrado." });
    }
    res
      .status(200)
      .json({ message: "Alvo excluído com sucesso.", alvo: result.rows[0] });
  } catch (error) {
    console.error("Erro ao excluir alvo ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// Sessões ABA
app.get("/api/aba/sessoes", verificarToken, async (req, res) => {
  const { id: userId, role } = req.terapeuta;
  const { pacienteId, programaId } = req.query;

  let queryText = `
    SELECT s.*
    FROM aba_sessoes s
    JOIN pacientes p ON s.paciente_id = p.id
  `;
  let values = [];

  if (role === "terapeuta" || role === "admin") {
    const talitauId = await getTalitauUserId();
    if (
      talitauId &&
      canAccessTalitauPatients(req.terapeuta) &&
      Number(talitauId) !== Number(userId)
    ) {
      queryText += " WHERE (p.terapeuta_id = $1 OR p.terapeuta_id = $2)";
      values = [userId, talitauId];
    } else {
      queryText += " WHERE p.terapeuta_id = $1";
      values = [userId];
    }
  } else if (role === "paciente") {
    queryText += " WHERE p.usuario_id = $1";
    values = [userId];
  }

  if (pacienteId) {
    const idx = values.length + 1;
    queryText += values.length
      ? ` AND s.paciente_id = $${idx}`
      : ` WHERE s.paciente_id = $${idx}`;
    values.push(pacienteId);
  }

  if (programaId) {
    const idx = values.length + 1;
    queryText += values.length
      ? ` AND s.programa_id = $${idx}`
      : ` WHERE s.programa_id = $${idx}`;
    values.push(programaId);
  }

  try {
    const result = await pool.query(queryText, values);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao listar sessões ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.post("/api/aba/sessoes", verificarToken, async (req, res) => {
  const { programId, patientId, therapistId, date, trials, successes, notes } =
    req.body;

  if (
    !programId ||
    !patientId ||
    !date ||
    trials == null ||
    successes == null
  ) {
    return res.status(400).json({
      error: "Programa, paciente, data, tentativas e acertos são obrigatórios.",
    });
  }

  try {
    const queryText = `
      INSERT INTO aba_sessoes (
        programa_id, paciente_id, terapeuta_id,
        data_sessao, tentativas, acertos, observacoes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [
      programId,
      patientId,
      therapistId || null,
      date,
      trials,
      successes,
      notes || null,
    ];
    const result = await pool.query(queryText, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao criar sessão ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.delete("/api/aba/sessoes/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM aba_sessoes WHERE id = $1 RETURNING id",
      [id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Sessão ABA não encontrada." });
    }
    res.status(200).json({ message: "Sessão ABA excluída com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir sessão ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// Evoluções de Critério
app.get("/api/aba/evolucoes", verificarToken, async (req, res) => {
  const { id: userId, role } = req.terapeuta;
  const { pacienteId, programaId } = req.query;

  let queryText = `
    SELECT e.*
    FROM aba_evolucoes_criterio e
    JOIN aba_programas ap ON e.programa_id = ap.id
    JOIN pacientes p ON ap.paciente_id = p.id
  `;
  let values = [];

  if (role === "terapeuta" || role === "admin") {
    const talitauId = await getTalitauUserId();
    if (
      talitauId &&
      canAccessTalitauPatients(req.terapeuta) &&
      Number(talitauId) !== Number(userId)
    ) {
      queryText += " WHERE (p.terapeuta_id = $1 OR p.terapeuta_id = $2)";
      values = [userId, talitauId];
    } else {
      queryText += " WHERE p.terapeuta_id = $1";
      values = [userId];
    }
  } else if (role === "paciente") {
    queryText += " WHERE p.usuario_id = $1";
    values = [userId];
  }

  if (pacienteId) {
    const idx = values.length + 1;
    queryText += values.length
      ? ` AND ap.paciente_id = $${idx}`
      : ` WHERE ap.paciente_id = $${idx}`;
    values.push(pacienteId);
  }

  if (programaId) {
    const idx = values.length + 1;
    queryText += values.length
      ? ` AND e.programa_id = $${idx}`
      : ` WHERE e.programa_id = $${idx}`;
    values.push(programaId);
  }

  try {
    const result = await pool.query(queryText, values);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao listar evoluções ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.post("/api/aba/evolucoes", verificarToken, async (req, res) => {
  const { programId, previousCriteria, newCriteria, reason, changedAt } =
    req.body;

  if (!programId || !previousCriteria || !newCriteria || !reason) {
    return res
      .status(400)
      .json({ error: "Programa, critérios e motivo são obrigatórios." });
  }

  try {
    const queryText = `
      INSERT INTO aba_evolucoes_criterio (
        programa_id, criterio_anterior, novo_criterio, motivo, data_mudanca
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [
      programId,
      previousCriteria,
      newCriteria,
      reason,
      changedAt || new Date().toISOString(),
    ];
    const result = await pool.query(queryText, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao criar evolução de critério ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// Planos Terapêuticos ABA
app.get("/api/aba/planos", verificarToken, async (req, res) => {
  const { id: userId, role } = req.terapeuta;
  const { pacienteId } = req.query;

  let whereClause = "";
  let values = [];

  if (role === "terapeuta" || role === "admin") {
    const talitauId = await getTalitauUserId();
    if (
      talitauId &&
      canAccessTalitauPatients(req.terapeuta) &&
      Number(talitauId) !== Number(userId)
    ) {
      whereClause = "WHERE (p.terapeuta_id = $1 OR p.terapeuta_id = $2)";
      values = [userId, talitauId];
    } else {
      whereClause = "WHERE p.terapeuta_id = $1";
      values = [userId];
    }
  } else if (role === "paciente") {
    whereClause = "WHERE p.usuario_id = $1";
    values = [userId];
  }

  if (pacienteId) {
    const idx = values.length + 1;
    whereClause += values.length
      ? ` AND pt.paciente_id = $${idx}`
      : ` WHERE pt.paciente_id = $${idx}`;
    values.push(pacienteId);
  }

  const queryText = `
    SELECT
      pt.id,
      pt.paciente_id,
      pt.titulo,
      pt.data_inicio,
      pt.data_termino,
      pt.status,
      pt.criado_em,
      pt.atualizado_em,
      COALESCE(
        ARRAY_AGG(m.descricao ORDER BY m.ordem)
        FILTER (WHERE m.id IS NOT NULL),
        ARRAY[]::text[]
      ) AS goals
    FROM aba_planos_terapeuticos pt
    JOIN pacientes p ON pt.paciente_id = p.id
    LEFT JOIN aba_plano_metas m ON m.plano_id = pt.id
    ${whereClause}
    GROUP BY pt.id
    ORDER BY pt.data_inicio DESC;
  `;

  try {
    const result = await pool.query(queryText, values);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao listar planos ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.post("/api/aba/planos", verificarToken, async (req, res) => {
  const { patientId, title, goals, startDate, endDate, status } = req.body;

  if (!patientId || !title || !startDate) {
    return res.status(400).json({
      error: "Paciente, título e data de início são obrigatórios.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const planResult = await client.query(
      `
        INSERT INTO aba_planos_terapeuticos (
          paciente_id, titulo, data_inicio, data_termino, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `,
      [patientId, title, startDate, endDate || null, status || "draft"]
    );

    const plan = planResult.rows[0];
    const metas = Array.isArray(goals) ? goals : [];

    for (let i = 0; i < metas.length; i++) {
      const g = (metas[i] || "").trim();
      if (!g) continue;
      await client.query(
        "INSERT INTO aba_plano_metas (plano_id, ordem, descricao) VALUES ($1, $2, $3)",
        [plan.id, i + 1, g]
      );
    }

    await client.query("COMMIT");
    res
      .status(201)
      .json({ ...plan, goals: metas.filter((g) => g && g.trim()) });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao criar plano ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  } finally {
    client.release();
  }
});

app.put("/api/aba/planos/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  const { patientId, title, goals, startDate, endDate, status } = req.body;

  if (!patientId || !title || !startDate) {
    return res.status(400).json({
      error: "Paciente, título e data de início são obrigatórios.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const planResult = await client.query(
      `
        UPDATE aba_planos_terapeuticos SET
          paciente_id = $1,
          titulo = $2,
          data_inicio = $3,
          data_termino = $4,
          status = $5,
          atualizado_em = NOW()
        WHERE id = $6
        RETURNING *;
      `,
      [patientId, title, startDate, endDate || null, status || "draft", id]
    );

    if (!planResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Plano ABA não encontrado." });
    }

    await client.query("DELETE FROM aba_plano_metas WHERE plano_id = $1", [id]);

    const metas = Array.isArray(goals) ? goals : [];
    for (let i = 0; i < metas.length; i++) {
      const g = (metas[i] || "").trim();
      if (!g) continue;
      await client.query(
        "INSERT INTO aba_plano_metas (plano_id, ordem, descricao) VALUES ($1, $2, $3)",
        [id, i + 1, g]
      );
    }

    await client.query("COMMIT");
    const plan = planResult.rows[0];
    res
      .status(200)
      .json({ ...plan, goals: metas.filter((g) => g && g.trim()) });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao atualizar plano ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  } finally {
    client.release();
  }
});

app.delete("/api/aba/planos/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM aba_planos_terapeuticos WHERE id = $1 RETURNING id",
      [id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Plano ABA não encontrado." });
    }
    res.status(200).json({ message: "Plano ABA excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir plano ABA:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// ============================
// Pastas Curriculares (por paciente) + anexos de Programas/Alvos
// ============================

async function ensureAbaPastaAlvosProgramColumn() {
  try {
    await pool.query(
      "ALTER TABLE aba_pasta_alvos ADD COLUMN IF NOT EXISTS programa_id INTEGER"
    );
  } catch (e) {
    console.warn(
      "Aviso: não foi possível garantir coluna programa_id em aba_pasta_alvos.",
      e?.message || e
    );
  }
}

ensureAbaPastaAlvosProgramColumn();

app.get("/api/aba/pastas-curriculares", verificarToken, async (req, res) => {
  const { id: userId, role } = req.terapeuta;
  const { pacienteId } = req.query;

  const buildQuery = ({ includeProgramIdInTargets }) => {
    return `
      SELECT
        f.id,
        f.paciente_id,
        f.nome,
        f.criado_em,
        f.atualizado_em,
        COALESCE(
          JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('id', ap.id, 'nome', ap.nome))
          FILTER (WHERE ap.id IS NOT NULL),
          '[]'::jsonb
        ) AS programas,
        COALESCE(
          JSONB_AGG(
            DISTINCT (
              CASE
                WHEN a.id IS NULL THEN NULL
                ELSE JSONB_BUILD_OBJECT(
                  'id', a.id,
                  'label', a.label${includeProgramIdInTargets ? ", 'programa_id', fa.programa_id" : ""}
                )
              END
            )
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'::jsonb
        ) AS alvos
      FROM aba_pastas_curriculares f
      JOIN pacientes p ON p.id = f.paciente_id
      LEFT JOIN aba_pasta_programas fp ON fp.pasta_id = f.id
      LEFT JOIN aba_programas ap ON ap.id = fp.programa_id
      LEFT JOIN aba_pasta_alvos fa ON fa.pasta_id = f.id
      LEFT JOIN aba_alvos a ON a.id = fa.alvo_id
    `;
  };

  let queryText = buildQuery({ includeProgramIdInTargets: true });

  let values = [];
  if (role === "terapeuta" || role === "admin") {
    const talitauId = await getTalitauUserId();
    if (
      talitauId &&
      canAccessTalitauPatients(req.terapeuta) &&
      Number(talitauId) !== Number(userId)
    ) {
      queryText += " WHERE (p.terapeuta_id = $1 OR p.terapeuta_id = $2)";
      values = [userId, talitauId];
    } else {
      queryText += " WHERE p.terapeuta_id = $1";
      values = [userId];
    }
  } else if (role === "paciente") {
    queryText += " WHERE p.usuario_id = $1";
    values = [userId];
  }

  if (pacienteId) {
    const idx = values.length + 1;
    queryText += values.length
      ? ` AND f.paciente_id = $${idx}`
      : ` WHERE f.paciente_id = $${idx}`;
    values.push(pacienteId);
  }

  queryText += " GROUP BY f.id ORDER BY f.criado_em DESC;";

  try {
    const result = await pool.query(queryText, values);
    res.status(200).json(result.rows);
  } catch (error) {
    const msg = String(error?.message || "");
    const missingProgramColumn =
      msg.includes("fa.programa_id") ||
      msg.includes('column "programa_id"') ||
      msg.includes("does not exist");

    if (missingProgramColumn) {
      try {
        let legacyQuery = buildQuery({ includeProgramIdInTargets: false });

        // reaplica os mesmos filtros/where/and construídos acima
        const whereIndex = queryText.indexOf(" WHERE ");
        if (whereIndex !== -1) {
          const legacyTail = queryText.slice(whereIndex);
          legacyQuery += legacyTail;
        } else {
          legacyQuery += " GROUP BY f.id ORDER BY f.criado_em DESC;";
        }

        const legacyResult = await pool.query(legacyQuery, values);
        return res.status(200).json(legacyResult.rows);
      } catch (legacyErr) {
        console.error("Erro ao listar pastas curriculares (fallback):", legacyErr);
      }
    }

    console.error("Erro ao listar pastas curriculares:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.post("/api/aba/pastas-curriculares", verificarToken, async (req, res) => {
  const { patientId, name } = req.body;
  if (!patientId || !name || !String(name).trim()) {
    return res.status(400).json({
      error: "Paciente e nome da pasta são obrigatórios.",
    });
  }

  const ok = await assertCanAccessPacienteId(req, res, patientId);
  if (!ok) return;

  try {
    const result = await pool.query(
      `
        INSERT INTO aba_pastas_curriculares (paciente_id, nome, criado_por)
        VALUES ($1, $2, $3)
        RETURNING id, paciente_id, nome, criado_em, atualizado_em;
      `,
      [patientId, String(name).trim(), req.terapeuta.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao criar pasta curricular:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.post(
  "/api/aba/pastas-curriculares/:id/programas",
  [verificarToken, verificarAcessoPastaCurricular],
  async (req, res) => {
    const { id } = req.params;
    const { programId } = req.body;
    if (!programId) {
      return res.status(400).json({ error: "programId é obrigatório." });
    }

    try {
      const folder = req.pastaCurricular;
      const programRes = await pool.query(
        "SELECT id, paciente_id FROM aba_programas WHERE id = $1",
        [programId]
      );
      if (!programRes.rows.length) {
        return res.status(404).json({ error: "Programa não encontrado." });
      }
      if (
        Number(programRes.rows[0].paciente_id) !== Number(folder.paciente_id)
      ) {
        return res.status(400).json({
          error: "O programa deve pertencer ao mesmo paciente da pasta.",
        });
      }

      await pool.query(
        `
          INSERT INTO aba_pasta_programas (pasta_id, programa_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING;
        `,
        [id, programId]
      );

      await pool.query(
        "UPDATE aba_pastas_curriculares SET atualizado_em = NOW() WHERE id = $1",
        [id]
      );

      res.status(200).json({ message: "Programa anexado." });
    } catch (error) {
      console.error("Erro ao anexar programa à pasta curricular:", error);
      res.status(500).json({ error: "Erro interno do servidor." });
    }
  }
);

app.post(
  "/api/aba/pastas-curriculares/:id/alvos",
  [verificarToken, verificarAcessoPastaCurricular],
  async (req, res) => {
    const { id } = req.params;
    const { alvoId, programId } = req.body;
    if (!alvoId) {
      return res.status(400).json({ error: "alvoId é obrigatório." });
    }

    try {
      const alvoRes = await pool.query(
        "SELECT id FROM aba_alvos WHERE id = $1",
        [alvoId]
      );
      if (!alvoRes.rows.length) {
        return res.status(404).json({ error: "Alvo não encontrado." });
      }

      const folder = req.pastaCurricular;
      if (programId) {
        const programRes = await pool.query(
          "SELECT id, paciente_id FROM aba_programas WHERE id = $1",
          [programId]
        );
        if (!programRes.rows.length) {
          return res.status(404).json({ error: "Programa não encontrado." });
        }
        if (
          Number(programRes.rows[0].paciente_id) !== Number(folder.paciente_id)
        ) {
          return res.status(400).json({
            error: "O programa deve pertencer ao mesmo paciente da pasta.",
          });
        }
        const attachedRes = await pool.query(
          "SELECT 1 FROM aba_pasta_programas WHERE pasta_id = $1 AND programa_id = $2",
          [id, programId]
        );
        if (!attachedRes.rowCount) {
          return res.status(400).json({
            error: "Anexe o programa à pasta antes de vincular alvos a ele.",
          });
        }
      }

      try {
        if (programId) {
          await pool.query(
            `
              INSERT INTO aba_pasta_alvos (pasta_id, alvo_id, programa_id)
              VALUES ($1, $2, $3)
              ON CONFLICT (pasta_id, alvo_id)
              DO UPDATE SET programa_id = EXCLUDED.programa_id;
            `,
            [id, alvoId, programId]
          );
        } else {
          await pool.query(
            `
              INSERT INTO aba_pasta_alvos (pasta_id, alvo_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING;
            `,
            [id, alvoId]
          );
        }
      } catch (insertErr) {
        // compatibilidade: bancos antigos sem coluna programa_id
        await pool.query(
          `
            INSERT INTO aba_pasta_alvos (pasta_id, alvo_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING;
          `,
          [id, alvoId]
        );
      }

      await pool.query(
        "UPDATE aba_pastas_curriculares SET atualizado_em = NOW() WHERE id = $1",
        [id]
      );

      res.status(200).json({ message: "Alvo anexado." });
    } catch (error) {
      console.error("Erro ao anexar alvo à pasta curricular:", error);
      res.status(500).json({ error: "Erro interno do servidor." });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Servidor do PsyHead rodando na porta ${PORT}`);
});
