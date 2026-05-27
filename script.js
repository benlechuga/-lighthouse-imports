document.getElementById("year").textContent = new Date().getFullYear();

const form = document.getElementById("leadForm");
const note = document.getElementById("formNote");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = form.email.value.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!valid) {
    note.textContent = "Informe um e-mail válido para continuar.";
    note.classList.add("error");
    form.email.focus();
    return;
  }

  note.classList.remove("error");
  note.textContent = "Tudo certo! Em instantes você receberá o acesso em " + email + ".";
  form.reset();
});
