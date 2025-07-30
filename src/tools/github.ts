import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as axios from "axios";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  activeDeviceCode,
  setActiveDeviceCode,
  tokenStore,
} from "../tokenStore.js";
import dotenv from "dotenv";
import { isAxiosError } from "axios";

interface GitHubDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
}
interface GitHubAccessTokenSuccess {
  device_code: string | null;
  access_token: string;
}
interface GitHubAccessTokenError {
  error: string;
  error_description: string;
}
type GitHubAccessTokenResponse =
  | GitHubAccessTokenSuccess
  | GitHubAccessTokenError;
interface GitHubRepo {
  full_name: string;
}

dotenv.config();
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

export function registerGithubTools(server: McpServer) {

  // --- Listar Repositórios ---
  server.registerTool(
    "github_meus_repositorios",
    {
      title: "Listar Repositórios do GitHub",
      description:
        "Lista os 10 repositórios mais recentes do usuário autenticado.",
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => {
      if (!tokenStore.github) {
        return {
          content: [
            {
              type: "text",
              text: "Autenticação não concluída. Execute 'github_login' e depois 'github_verificar_login'.",
            },
          ],
        };
      }
      const { data } = await axios.default.get<GitHubRepo[]>(
        "https://api.github.com/user/repos?sort=pushed&per_page=10",
        { headers: { Authorization: `Bearer ${tokenStore.github}` } }
      );
      const repos = data.map((repo) => `- ${repo.full_name}`).join("\n");
      return {
        content: [
          {
            type: "text",
            text: `Seus 10 repositórios mais recentes:\n${repos}`,
          },
        ],
      };
    }
  );

  // --- Criar Repositório ---
  server.registerTool(
    "github_criar_repositorio",
    {
      title: "Criar Repositório no GitHub",
      description: "Cria um novo repositório no GitHub.",
      inputSchema: {
        nome: z
          .string()
          .describe("O nome para o novo repositório (ex: 'meu-novo-projeto')."),
        descricao: z
          .string()
          .optional()
          .describe("Uma breve descrição para o repositório."),
        privado: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Define se o repositório deve ser privado. O padrão é 'público' (false)."
          ),
      },
    },
    async ({ nome, descricao, privado }): Promise<CallToolResult> => {
      if (!tokenStore.github) {
        return {
          content: [
            {
              type: "text",
              text: "Autenticação não concluída. Execute 'github_login' e depois 'github_verificar_login'.",
            },
          ],
        };
      }
      try {
        const endpoint = "https://api.github.com/user/repos";
        const repoData = {
          name: nome,
          description: descricao,
          private: privado,
        };
        const headers = {
          Authorization: `Bearer ${tokenStore.github}`,
          Accept: "application/vnd.github.v3+json",
        };
        const { data } = await axios.default.post(endpoint, repoData, {
          headers,
        });
        return {
          content: [
            {
              type: "text",
              text: `✅ Repositório "${data.full_name}" criado com sucesso!\nURL: ${data.html_url}`,
            },
          ],
        };
      } catch (error) {
        console.error("Erro detalhado ao criar repositório:", error);

        if (
          axios.default.isAxiosError(error) &&
          error.response?.status === 422
        ) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Falha ao criar. Um repositório com este nome provavelmente já existe na sua conta.",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: "❌ Ocorreu um erro inesperado ao tentar criar o repositório.",
            },
          ],
        };
      }
    }
  );
}
