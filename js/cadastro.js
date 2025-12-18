document.addEventListener("DOMContentLoaded", () => {
  const cadastroForm = document.getElementById("cadastroForm");
  const errorDiv = document.getElementById("cadastro-error");

  cadastroForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorDiv.classList.add("hidden");

    const nome = document.getElementById("nome").value;
    const email = document.getElementById("email").value;
    const senha = document.getElementById("senha").value;

    if (!nome || !email || !senha) {
      errorDiv.textContent = "Por favor, preencha todos os campos.";
      errorDiv.classList.remove("hidden");
      return;
    }

    try {
      const response = await fetch(
        "https://aba-aos0.onrender.com/api/auth/registrar-paciente",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, email, senha }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao criar conta.");
      }

      // Sucesso!
      alert(
        "Conta de paciente criada com sucesso! Você será redirecionado para o login."
      );
      window.location.href = "login.html";
    } catch (error) {
      errorDiv.textContent = error.message;
      errorDiv.classList.remove("hidden");
    }
  });
});
