// src/tools/clickup.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios"; // CORREÇÃO: Importação alterada
import dotenv from "dotenv";
import { createAuthenticatedTool } from "./tool-wrapper.js";

dotenv.config();

export function registerClickupTools(server: McpServer) {
  // As ferramentas de login são obsoletas com o novo fluxo de autenticação via redirecionamento.
  // Elas foram removidas para clareza.

  // --- Selecionar o Workspace do ClickUp ---
  server.registerTool(
    "clickup_selecionar_workspace",
    {
      title: "Selecionar Workspace do ClickUp",
      description: "Define qual workspace do ClickUp será usado para as outras ferramentas.",
      inputSchema: {
        workspaceId: z.string().describe("O ID do workspace obtido após o login."),
      },
    },
    createAuthenticatedTool('clickup', async ({ workspaceId }, context, tokens) => {
      // Atualiza o workspace para a sessão atual
      if (tokens.clickup) {
        tokens.clickup.selectedTeamId = workspaceId;
      }
      return {
        content: [{ type: "text", text: `✅ Workspace com ID ${workspaceId} selecionado com sucesso!` }],
      };
    })
  );

  // --- Listar Listas do ClickUp ---
  server.registerTool(
    "clickup_listar_listas",
    {
      title: "Listar Listas de um Espaço no ClickUp",
      description: "Mostra todas as Listas de tarefas disponíveis dentro de um Espaço específico.",
      inputSchema: {
        nomeDoEspaco: z.string().describe("O nome exato do Espaço (Space)."),
      },
    },
    createAuthenticatedTool('clickup', async ({ nomeDoEspaco }, context, tokens) => {
      try {
        const headers = { Authorization: tokens.clickup!.accessToken };
        const teamId = tokens.clickup!.selectedTeamId;
        const spacesResponse = await axios.get(
          `https://api.clickup.com/api/v2/team/${teamId}/space`,
          { headers }
        );
        
        // CORREÇÃO: Adicionado tipo 'any'
        const space = spacesResponse.data.spaces.find(
          (s: any) => s.name.toLowerCase() === nomeDoEspaco.toLowerCase()
        );

        if (!space) {
          return { content: [{ type: "text", text: `❌ Espaço com o nome "${nomeDoEspaco}" não encontrado.` }] };
        }

        const listsResponse = await axios.get(
          `https://api.clickup.com/api/v2/space/${space.id}/list`,
          { headers }
        );

        if (!listsResponse.data.lists || listsResponse.data.lists.length === 0) {
          return { content: [{ type: "text", text: `Nenhuma lista encontrada no espaço "${nomeDoEspaco}".` }] };
        }
        
        // CORREÇÃO: Adicionado tipo 'any'
        const listText = listsResponse.data.lists
          .map((l: any) => `- Nome: "${l.name}"`)
          .join("\n");
          
        return { content: [{ type: "text", text: `Listas encontradas no espaço "${nomeDoEspaco}":\n${listText}` }] };
      } catch (error) {
        console.error("Erro ao listar listas do ClickUp:", error);
        return { content: [{ type: "text", text: "❌ Ocorreu um erro ao buscar as listas do ClickUp." }] };
      }
    })
  );

}