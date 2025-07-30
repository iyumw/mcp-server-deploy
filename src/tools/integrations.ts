// src/tools/integrations.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios from "axios"; // CORREÇÃO: Importação alterada
import { createAuthenticatedTool } from "./tool-wrapper.js";

export function registerIntegrationTools(server: McpServer) {
  // --- Sincronizar issue com o clickUp ---
  server.registerTool(
    "sincronizar_issue_para_clickup",
    {
      title: "Criar Issue no GitHub e Tarefa no ClickUp",
      description: "Cria um issue no GitHub e uma tarefa correspondente numa lista específica do ClickUp.",
      inputSchema: { /* ... seu schema aqui ... */ },
    },
    createAuthenticatedTool('both', async (params, context, tokens) => {
      const { repositorio, titulo, listaClickup, descricao, prioridade, atribuidoPara } = params;
      try {
        const clickupHeaders = { Authorization: tokens.clickup!.accessToken };
        const githubHeaders = { Authorization: `Bearer ${tokens.github!}` };
        const teamId = tokens.clickup!.selectedTeamId;

        console.error(`[LOG] Procurando pela lista do ClickUp: "${listaClickup}"`);

        const spacesResponse = await axios.get(`https://api.clickup.com/api/v2/team/${teamId}/space`, { headers: clickupHeaders });
        let targetList = null;

        for (const space of spacesResponse.data.spaces) {
          const listsInSpaceRes = await axios.get(`https://api.clickup.com/api/v2/space/${space.id}/list`, { headers: clickupHeaders });
          // CORREÇÃO: Adicionado tipo 'any'
          let found = listsInSpaceRes.data.lists.find((l: any) => l.name.toLowerCase() === listaClickup.toLowerCase());
          if (found) { targetList = found; break; }
          
          const foldersInSpaceRes = await axios.get(`https://api.clickup.com/api/v2/space/${space.id}/folder`, { headers: clickupHeaders });
          // CORREÇÃO: Adicionado tipo 'any'
          const listsInFolders = foldersInSpaceRes.data.folders.flatMap((f: any) => f.lists);
          // CORREÇÃO: Adicionado tipo 'any'
          found = listsInFolders.find((l: any) => l.name.toLowerCase() === listaClickup.toLowerCase());
          if (found) { targetList = found; break; }
        }

        if (!targetList) {
          return { content: [{ type: "text", text: `❌ A lista com o nome "${listaClickup}" não foi encontrada.` }] };
        }
        
        // ... (resto da sua lógica continua aqui)

        return { content: [{ type: "text", text: `✅ Sucesso!` }] }; // Exemplo de retorno
      } catch (error: any) {
        console.log("Erro detalhado na ferramenta ponte:", error.response?.data || error.message);
        return { content: [{ type: "text", text: "❌ Ocorreu um erro durante a sincronização." }] };
      }
    })
  );

  // --- Relatórios de atividade semanal ---
  server.registerTool(
    "relatorio_semanal",
    {
      title: "Gerar Relatório de Atividade Semanal",
      description: "Cria um resumo dos seus commits, issues fechados, e tarefas concluídas.",
      inputSchema: {},
    },
    createAuthenticatedTool('both', async (params, context, tokens) => {
      // ... (sua lógica de relatório, garantindo que os 'map' e 'find' tenham tipos 'any' se necessário)
      return { content: [{ type: "text", text: "Relatório gerado..." }] }; // Exemplo de retorno
    })
  );
}