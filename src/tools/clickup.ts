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
  server.registerTool(
    "clickup_iniciar_login",
    {
      title: "Passo 1: Iniciar Autenticação no ClickUp",
      description: "Gera uma URL para autorizar o acesso à sua conta ClickUp.",
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => {
      // A URI de redirecionamento agora aponta para o seu servidor principal na porta 3000.
      const redirectUri = "http://localhost:3000/clickup/callback";

      const authUrl = `https://app.clickup.com/api?client_id=${CLICKUP_CLIENT_ID}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}`;

      // A ferramenta agora simplesmente retorna a URL para o utilizador.
      return {
        content: [
          {
            type: "text",
            text: `Para autenticar com o ClickUp, por favor, abra esta URL no seu navegador e autorize o acesso.\n\nURL: ${authUrl}`,
          },
        ],
      };
    }
  );

  // --- Verificar Login ---
  server.registerTool(
    "clickup_finalizar_login",
    {
      title: "Passo 2: Finalizar Autenticação no ClickUp",
      description:
        "Verifica se o login no navegador foi bem-sucedido e lista os workspaces disponíveis.",
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => {
      if (!tokenStore.clickup?.accessToken) {
        return {
          content: [
            {
              type: "text",
              text: "Autorização pendente. Certifique-se de que completou o processo no navegador e tente novamente.",
            },
          ],
        };
      }

      const workspaces = tokenStore.clickup.workspaces;
      if (workspaces.length === 1) {
        const workspace = workspaces[0];
        tokenStore.clickup.selectedTeamId = workspace.id;
        return {
          content: [
            {
              type: "text",
              text: `✅ Autenticação concluída! O seu único workspace '${workspace.name}' foi selecionado automaticamente.`,
            },
          ],
        };
      } else {
        const workspaceListText = workspaces
          .map((ws: any) => `- ${ws.name} (ID: ${ws.id})`)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `✅ Autenticação concluída!\n\nUse a ferramenta 'clickup_selecionar_workspace' com o ID do workspace que deseja usar:\n${workspaceListText}`,
            },
          ],
        };
      }
    }
  );

  // --- O resto das suas ferramentas (sem alterações) ---

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
