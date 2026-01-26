require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

async function main() {
  const email = parseArg("--email") || process.env.ADMIN_EMAIL;
  const password = parseArg("--password") || process.env.ADMIN_PASSWORD;
  const name = parseArg("--name") || process.env.ADMIN_NAME || "Admin";

  if (!email || !password) {
    console.error(
      "Uso: node scripts/createIsolatedAdmin.js --email <email> --password <senha> [--name <nome>]",
    );
    process.exit(1);
  }

  const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      })
    : new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      });

  const normalizedEmail = String(email).trim().toLowerCase();
  const senhaHash = await bcrypt.hash(String(password), 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id, email, tipo_login FROM terapeutas WHERE lower(trim(email)) = $1 LIMIT 1;",
      [normalizedEmail],
    );

    if (existing.rows.length) {
      const id = existing.rows[0].id;
      await client.query(
        "UPDATE terapeutas SET nome = $1, senha_hash = $2, tipo_login = 'admin' WHERE id = $3;",
        [name, senhaHash, id],
      );
      await client.query("COMMIT");
      console.log(
        `OK: usuário atualizado para admin (isolado por e-mail). id=${id} email=${normalizedEmail}`,
      );
      return;
    }

    const inserted = await client.query(
      "INSERT INTO terapeutas (nome, email, senha_hash, tipo_login) VALUES ($1, $2, $3, 'admin') RETURNING id, email;",
      [name, normalizedEmail, senhaHash],
    );

    await client.query("COMMIT");
    console.log(
      `OK: admin criado (isolado por e-mail). id=${inserted.rows[0].id} email=${inserted.rows[0].email}`,
    );
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Erro ao criar/atualizar admin:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
