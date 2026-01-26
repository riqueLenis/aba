document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return;

  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const credentialsError = document.getElementById("credentialsError");

  const passwordToggleBtn = document.querySelector(
    '[data-toggle-password="password"]',
  );
  if (passwordToggleBtn && passwordInput) {
    passwordToggleBtn.addEventListener("click", () => {
      const showing = passwordInput.type === "text";
      passwordInput.type = showing ? "password" : "text";
      passwordToggleBtn.classList.toggle("is-visible", !showing);
      passwordToggleBtn.setAttribute(
        "aria-label",
        showing ? "Mostrar senha" : "Ocultar senha",
      );
      passwordToggleBtn.setAttribute(
        "aria-pressed",
        String(!showing),
      );
      passwordInput.focus();
    });
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    credentialsError.classList.add("hidden");

    const email = usernameInput.value.trim();
    const senha = passwordInput.value.trim();

    if (!email || !senha) {
      credentialsError.textContent = "Por favor, preencha o e-mail и a senha.";
      credentialsError.classList.remove("hidden");
      return;
    }

    try {
      const response = await fetch("https://aba-aos0.onrender.com/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao tentar fazer login.");
      }

      localStorage.setItem("psyhead-token", data.token);
      localStorage.setItem("terapeuta-nome", data.terapeuta.nome);
      localStorage.setItem("user-role", data.role);
      window.location.href = "index.html";
    } catch (error) {
      console.error("Falha no login:", error);
      credentialsError.textContent = error.message;
      credentialsError.classList.remove("hidden");
    }
  });
});
