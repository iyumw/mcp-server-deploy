import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as axios from "axios";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  tokenStore,
  activeDeviceCode,
  setActiveDeviceCode,
} from "../tokenStore.js";
import dotenv from "dotenv";

export function registerIntegrationTools(server: McpServer) {
  // --- Sincronizar issue com o clickUp ---
  server.registerTool(
    "sincronizar_issue_para_clickup",
    {
      title: "Criar Issue no GitHub e Tarefa no ClickUp",
      description:
        "Cria um issue no GitHub e uma tarefa correspondente numa lista específica do ClickUp.",
      inputSchema: {
        repositorio: z
          .string()
          .describe(
            "O nome completo do repositório GitHub (ex: 'usuario/repo')."
          ),
        titulo: z.string().describe("O título para o issue e para a tarefa."),
        listaClickup: z
          .string()
          .describe(
            "O nome exato da lista no ClickUp onde a tarefa será criada."
          ),
        descricao: z
          .string()
          .optional()
          .describe("A descrição a ser usada em ambos."),
        prioridade: z
          .string()
          .optional()
          .describe(
            "A prioridade da tarefa (ex: 'urgente', 'alta', 'normal', 'baixa')."
          ),
        atribuidoPara: z
          .string()
          .describe("O nome de utilizador do GitHub para atribuir o issue."),
      },
    },
    async ({
      repositorio,
      titulo,
      listaClickup,
      descricao,
      prioridade,
      atribuidoPara,
    }): Promise<CallToolResult> => {
      if (!tokenStore.github || !tokenStore.clickup?.selectedTeamId) {
        let missingAuth = [];
        if (!tokenStore.github) missingAuth.push("GitHub");
        if (!tokenStore.clickup) missingAuth.push("ClickUp");
        return {
          content: [
            {
              type: "text",
              text: `Autenticação pendente para: ${missingAuth.join(
                ", "
              )}. Por favor, execute o(s) login(s) correspondente(s).`,
            },
          ],
        };
      }

      try {
        const headers = { Authorization: tokenStore.clickup.accessToken };
        const teamId = tokenStore.clickup.selectedTeamId;

        console.error(
          `[LOG] Procurando pela lista do ClickUp: "${listaClickup}"`
        );

        const spacesResponse = await axios.default.get(
          `https://api.clickup.com/api/v2/team/${teamId}/space`,
          { headers }
        );
        const spaces = spacesResponse.data.spaces;
        let targetList = null;

        for (const space of spaces) {
          const listsInSpaceRes = await axios.default.get(
            `https://api.clickup.com/api/v2/space/${space.id}/list`,
            { headers }
          );
          let found = listsInSpaceRes.data.lists.find(
            (l: any) => l.name.toLowerCase() === listaClickup.toLowerCase()
          );
          if (found) {
            targetList = found;
            break;
          }
          const foldersInSpaceRes = await axios.default.get(
            `https://api.clickup.com/api/v2/space/${space.id}/folder`,
            { headers }
          );
          const listsInFolders = foldersInSpaceRes.data.folders.flatMap(
            (f: any) => f.lists
          );
          found = listsInFolders.find(
            (l: any) => l.name.toLowerCase() === listaClickup.toLowerCase()
          );
          if (found) {
            targetList = found;
            break;
          }
        }

        if (!targetList) {
          return {
            content: [
              {
                type: "text",
                text: `❌ A lista com o nome "${listaClickup}" não foi encontrada em nenhum espaço do workspace. Use 'clickup_listar_listas' para confirmar o nome e o espaço.`,
              },
            ],
          };
        }
        const clickupListId = targetList.id;
        console.log(`[LOG] Lista encontrada. ID: ${clickupListId}`);

        const { data: githubUser } = await axios.default.get(
          "https://api.github.com/user",
          { headers: { Authorization: `Bearer ${tokenStore.github!}` } }
        );
        const username = githubUser.login;
        let repoFullName = repositorio;
        if (!repositorio.includes("/")) {
          repoFullName = `${username}/${repositorio}`;
        }
        const finalAssignee = atribuidoPara || username;
        const { data: githubIssue } = await axios.default.post(
          `https://api.github.com/repos/${repoFullName}/issues`,
          { title: titulo, body: descricao, assignees: [finalAssignee] },
          { headers: { Authorization: `Bearer ${tokenStore.github!}` } }
        );

        let clickupPriority: number | null = null;
        switch (prioridade?.toLowerCase()) {
          case "urgente":
            clickupPriority = 1;
            break;
          case "alta":
            clickupPriority = 2;
            break;
          case "normal":
            clickupPriority = 3;
            break;
          case "baixa":
            clickupPriority = 4;
            break;
        }

        const clickupEndpoint = `https://api.clickup.com/api/v2/list/${clickupListId}/task`;
        const clickupDescription = `${
          descricao || ""
        }\n\nLink para o Issue no GitHub: ${githubIssue.html_url}`;

        const { data: clickupTask } = await axios.default.post(
          clickupEndpoint,
          {
            name: titulo,
            description: clickupDescription,
            priority: clickupPriority,
          },
          { headers }
        );

        return {
          content: [
            {
              type: "text",
              text: `✅ Sucesso!\n- Issue #${githubIssue.number} criado: ${githubIssue.html_url}\n- Tarefa '${clickupTask.name}' criada na lista '${targetList.name}': ${clickupTask.url}`,
            },
          ],
        };
      } catch (error: any) {
        console.log(
          "Erro detalhado na ferramenta ponte:",
          error.response?.data || error.message
        );
        return {
          content: [
            {
              type: "text",
              text: "❌ Ocorreu um erro durante a sincronização. Verifique os logs do servidor.",
            },
          ],
        };
      }
    }
  );

  // --- Relatórios de atividade semanal ---
  server.registerTool(
    "relatorio_semanal",
    {
      title: "Gerar Relatório de Atividade Semanal do GitHub e ClickUp",
      description:
        "Cria um resumo dos seus commits, pull requests/issues fechados, e as tarefas concluídas nos últimos 7 dias.",
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => {
      if (!tokenStore.github || !tokenStore.clickup?.selectedTeamId) {
        const missing = [
          !tokenStore.github && "GitHub",
          !tokenStore.clickup && "ClickUp",
        ]
          .filter(Boolean)
          .join(", ");
        return {
          content: [
            {
              type: "text",
              text: `Autenticação pendente para: ${missing}. Por favor, execute os logins necessários.`,
            },
          ],
        };
      }

      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoISO = sevenDaysAgo.toISOString().split("T")[0];

        const githubHeaders = { Authorization: `Bearer ${tokenStore.github!}` };
        const clickupHeaders = {
          Authorization: tokenStore.clickup.accessToken,
        };

        const { data: githubUser } = await axios.default.get(
          "https://api.github.com/user",
          { headers: githubHeaders }
        );
        const { data: clickupUserResponse } = await axios.default.get(
          "https://api.clickup.com/api/v2/user",
          { headers: clickupHeaders }
        );

        const clickupUserId = clickupUserResponse.user.id;
        const username = githubUser.login;

        const commitsQuery = `author:${username} author-date:>=${sevenDaysAgoISO}`;

        const closedIssuesQuery = `involves:${username} is:issue is:closed closed:>${
          sevenDaysAgo.toISOString().split("T")[0]
        }`;

        const [githubCommitsRes, githubIssuesRes, clickupTasksRes] =
          await Promise.all([
            axios.default.get(`https://api.github.com/search/commits`, {
              params: { q: commitsQuery, sort: "author-date", order: "desc" },
              headers: githubHeaders,
            }),
            axios.default.get("https://api.github.com/search/issues", {
              params: { q: closedIssuesQuery },
              headers: githubHeaders,
            }),
            axios.default.get(
              `https://api.clickup.com/api/v2/team/${tokenStore.clickup.selectedTeamId}/task`,
              {
                params: {
                  assignees: [clickupUserId],
                  statuses: ["complete"],
                  date_done_gt: sevenDaysAgo.getTime(),
                  subtasks: true,
                  include_closed: true,
                },
                headers: clickupHeaders,
              }
            ),
          ]);

        const today = new Date().toLocaleDateString("pt-BR");
        let reportContent = `# Relatório de Atividade Semanal - ${today}\n\n`;

        reportContent += `### Commits no GitHub\n`;
        const commits = githubCommitsRes.data.items;
        if (commits && commits.length > 0) {
          reportContent += commits
            .map(
              (item: any) =>
                `- ${item.commit.message.split("\n")[0]} (no repo: ${
                  item.repository.full_name
                })`
            )
            .join("\n");
        } else {
          reportContent += "_Nenhum commit encontrado._";
        }

        reportContent += "\n\n### Issues Fechados\n";
        const issues = githubIssuesRes.data.items;
        if (issues.length > 0) {
          reportContent += issues
            .map(
              (issue: any) =>
                `- #${issue.number}: ${
                  issue.title
                } (no repo: ${issue.repository_url
                  .split("/")
                  .slice(-2)
                  .join("/")})`
            )
            .join("\n");
        } else {
          reportContent += "_Nenhum issue fechado encontrado._";
        }

        reportContent += `\n\n## Tarefas Concluídas no ClickUp\n`;
        const tasks = clickupTasksRes.data.tasks.map(
          (task: any) => `- ${task.name} (${task.list.name})`
        );
        reportContent +=
          tasks.length > 0
            ? tasks.join("\n")
            : "_Nenhuma tarefa concluída encontrada._";

        const finalReport = `## Relatório de Atividade para @${username}\n\n${reportContent}`;

        return {
          content: [{ type: "text", text: finalReport }],
        };
      } catch (error: any) {
        console.error(
          "Erro detalhado ao gerar relatório:",
          error.response?.data || error.message
        );
        return {
          content: [
            {
              type: "text",
              text: "❌ Ocorreu um erro ao gerar o relatório. Verifique os logs do servidor.",
            },
          ],
        };
      }
    }
  );
}
