import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as axios from "axios";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { tokenStore } from "../tokenStore.js";
import dotenv from "dotenv";

dotenv.config();

const CLICKUP_CLIENT_ID = process.env.CLICKUP_CLIENT_ID;
const CLICKUP_CLIENT_SECRET = process.env.CLICKUP_CLIENT_SECRET;

export function registerClickupTools(server: McpServer) {
  // --- Selecionar o Workspace do ClickUp ---
  server.registerTool(
    "clickup_selecionar_workspace",
    {
      title: "Selecionar Workspace do ClickUp",
      description:
        "Define qual workspace do ClickUp será usado para as outras ferramentas nesta sessão.",
      inputSchema: {
        workspaceId: z
          .string()
          .describe("O ID do workspace que você obteve após o login."),
      },
    },
    async ({ workspaceId }): Promise<CallToolResult> => {
      if (!tokenStore.clickup?.accessToken) {
        return {
          content: [
            {
              type: "text",
              text: "Você precisa fazer o login no ClickUp primeiro com a ferramenta 'clickup_login'.",
            },
          ],
        };
      }
      tokenStore.clickup.selectedTeamId = workspaceId;
      return {
        content: [
          {
            type: "text",
            text: `✅ Workspace com ID ${workspaceId} selecionado com sucesso para esta sessão!`,
          },
        ],
      };
    }
  );

  // --- Listar Listas do ClickUp ---
  server.registerTool(
    "clickup_listar_listas",
    {
      title: "Listar Listas de um Espaço no ClickUp",
      description:
        "Mostra todas as Listas de tarefas disponíveis dentro de um Espaço específico do ClickUp.",
      inputSchema: {
        nomeDoEspaco: z
          .string()
          .describe("O nome exato do Espaço (Space) onde as listas estão."),
      },
    },
    async ({ nomeDoEspaco }): Promise<CallToolResult> => {
      if (!tokenStore.clickup?.selectedTeamId) {
        return {
          content: [
            {
              type: "text",
              text: "Autenticação ou seleção de workspace do ClickUp pendente.",
            },
          ],
        };
      }
      try {
        const headers = { Authorization: tokenStore.clickup.accessToken };
        const teamId = tokenStore.clickup.selectedTeamId;
        const spacesResponse = await axios.default.get(
          `https://api.clickup.com/api/v2/team/${teamId}/space`,
          { headers }
        );
        const space = spacesResponse.data.spaces.find(
          (s: any) => s.name.toLowerCase() === nomeDoEspaco.toLowerCase()
        );

        if (!space) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Espaço com o nome "${nomeDoEspaco}" não encontrado.`,
              },
            ],
          };
        }

        const listsResponse = await axios.default.get(
          `https://api.clickup.com/api/v2/space/${space.id}/list`,
          { headers }
        );

        if (
          !listsResponse.data.lists ||
          listsResponse.data.lists.length === 0
        ) {
          return {
            content: [
              {
                type: "text",
                text: `Nenhuma lista encontrada no espaço "${nomeDoEspaco}".`,
              },
            ],
          };
        }

        const listText = listsResponse.data.lists
          .map((l: any) => `- Nome: "${l.name}"`)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Listas encontradas no espaço "${nomeDoEspaco}":\n${listText}`,
            },
          ],
        };
      } catch (error) {
        console.error("Erro ao listar listas do ClickUp:", error);
        return {
          content: [
            {
              type: "text",
              text: "❌ Ocorreu um erro ao buscar as listas do ClickUp.",
            },
          ],
        };
      }
    }
  );

  // --- Testar Busca de Tarefas no ClickUp ---
  server.registerTool(
    "clickup_testar_busca",
    {
      title: "Testar Busca de Tarefas no ClickUp",
      description:
        "Busca as tarefas mais recentes de um utilizador no ClickUp com o mínimo de filtros para depuração.",
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => {
      if (!tokenStore.clickup?.selectedTeamId) {
        return {
          content: [
            {
              type: "text",
              text: "Autenticação com ClickUp incompleta. Use 'clickup_login' e 'clickup_selecionar_workspace'.",
            },
          ],
        };
      }
      try {
        const clickupHeaders = {
          Authorization: tokenStore.clickup.accessToken,
        };
        const { data: clickupUserResponse } = await axios.default.get(
          "https://api.clickup.com/api/v2/user",
          { headers: clickupHeaders }
        );
        const clickupUserId = clickupUserResponse.user.id;

        const { data: clickupTasks } = await axios.default.get(
          `https://api.clickup.com/api/v2/team/${tokenStore.clickup.selectedTeamId}/task`,
          {
            params: { assignees: [clickupUserId], subtasks: true },
            headers: clickupHeaders,
          }
        );

        if (!clickupTasks.tasks || clickupTasks.tasks.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "DIAGNÓSTICO: A busca não retornou nenhuma tarefa. Verifique se as tarefas estão atribuídas a si no ClickUp.",
              },
            ],
          };
        }

        const tasksInfo = clickupTasks.tasks
          .slice(0, 10)
          .map(
            (task: any) =>
              `- Nome: "${task.name}", Status Exato: "${task.status.status}"`
          )
          .join("\n");
        const resultText = `✅ DIAGNÓSTICO: Encontrei ${clickupTasks.tasks.length} tarefa(s) atribuída(s) a si. Aqui estão as 10 mais recentes e os seus status:\n\n${tasksInfo}`;
        return { content: [{ type: "text", text: resultText }] };
      } catch (error: any) {
        console.error(
          "Erro na ferramenta de diagnóstico:",
          error.response?.data || error.message
        );
        return {
          content: [
            {
              type: "text",
              text: "❌ Ocorreu um erro na ferramenta de diagnóstico. Verifique os logs do servidor.",
            },
          ],
        };
      }
    }
  );
}
