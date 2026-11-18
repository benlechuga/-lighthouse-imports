// Converse com o Jarvis pelo terminal, sem WhatsApp. Ótimo para ajustar o prompt.
// Uso: npm run chat
// Precisa só da ANTHROPIC_API_KEY no .env. Comandos: /novo (zera a conversa), /sair

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

process.env.WHATSAPP_DRY_RUN = "true";
process.env.DATA_DIR = process.env.DATA_DIR || "data-chat";

const { respond, buildUserContent } = await import("../src/jarvis.js");
const { loadConversation, saveConversation } = await import("../src/store.js");

const WA_ID = "5500000000000";
const rl = readline.createInterface({ input: stdin, output: stdout });

console.log("💬 Chat de teste do Jarvis. Digite sua mensagem (/novo para recomeçar, /sair para sair).\n");

let conv = await loadConversation(WA_ID);
conv.nome = conv.nome || "Cliente Teste";

while (true) {
  const texto = (await rl.question("Você: ")).trim();
  if (!texto) continue;
  if (texto === "/sair") break;
  if (texto === "/novo") {
    conv = { waId: WA_ID, nome: "Cliente Teste", messages: [], resumo: "", pausado: false };
    await saveConversation(conv);
    console.log("(conversa zerada)\n");
    continue;
  }
  if (conv.pausado) {
    console.log("(o Jarvis transferiu para um humano; digite /novo para recomeçar)\n");
    continue;
  }
  try {
    const content = buildUserContent(conv, [{ ts: Date.now(), nome: conv.nome, text: texto }]);
    const resposta = await respond(conv, content, {
      notifyOwner: async (t) => console.log(`\n--- aviso que iria para o dono ---\n${t}\n---------------------------------`),
    });
    await saveConversation(conv);
    console.log(`\nJarvis: ${resposta || "(sem resposta)"}\n`);
  } catch (err) {
    console.error("Erro:", err.message);
  }
}
rl.close();
