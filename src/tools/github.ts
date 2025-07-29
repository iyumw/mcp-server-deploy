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
  // --- Autenticação Github ---
  server.registerTool(
    "github_login",
    {
      title: "Passo 1: Iniciar Autenticação no GitHub",
      description:
        "Gera um código e uma URL para autenticação no GitHub. Este é o primeiro passo.",
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => {
      try {
        const { data } = await axios.default.post<GitHubDeviceCodeResponse>(
          "https://github.com/login/device/code",
          { client_id: GITHUB_CLIENT_ID, scope: "repo" },
          { headers: { Accept: "application/json" } }
        );
        setActiveDeviceCode(data.device_code);
        return {
          content: [
            {
              type: "text",
              text: `Autenticação iniciada. Siga os próximos passos:\n1. Vá para: ${data.verification_uri}\n2. Digite o código: ${data.user_code}\n3. Quando estiver pronto e tiver autorizado no navegador, peça para eu verificar o login.`,
            },
          ],
        };
      } catch (error) {
        let errorMessage =
          "Ocorreu um erro inesperado ao tentar iniciar a autenticação com o GitHub.";

        if (isAxiosError(error)) {
          if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;

            console.error(`[GitHub Auth Error] Status: ${status}`, errorData);

            if (status === 404 || status === 422) {
              errorMessage =
                "❌ Erro de configuração: O 'Client ID' do GitHub fornecido parece ser inválido. Verifique o ficheiro .env do servidor.";
            } else if (
              errorData &&
              errorData.error === "unsupported_grant_type"
            ) {
              errorMessage =
                "❌ Erro de configuração: O servidor está a pedir um tipo de autorização que não é suportado. Contacte o administrador.";
            } else if (errorData && errorData.error === "invalid_scope") {
              errorMessage =
                "❌ Erro de configuração: O 'scope' (permissões) solicitado ('repo') é inválido.";
            } else {
              errorMessage = `❌ Ocorreu um erro na API do GitHub (Status ${status}): ${
                errorData.error_description || JSON.stringify(errorData)
              }`;
            }
          } else {
            errorMessage =
              "❌ Erro de rede: Não foi possível conectar ao GitHub. Verifique a sua conexão com a internet.";
          }
        } else {
          console.error("Erro não relacionado ao Axios:", error);
        }

        return {
          content: [
            {
              type: "text",
              text: errorMessage,
            },
          ],
        };
      }
    }
  );

  // --- Verificar Login Github---
  server.registerTool(
    "github_verificar_login",
    {
      title: "Passo 2: Verificar e Finalizar Autenticação",
      description:
        "Use esta ferramenta APÓS ter autorizado o app no seu navegador para obter o token de acesso.",
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => {
      if (!activeDeviceCode) {
        return {
          content: [
            {
              type: "text",
              text: "Você precisa executar a ferramenta 'github_login' primeiro.",
            },
          ],
        };
      }
      try {
        const { data } = await axios.default.post<GitHubAccessTokenResponse>(
          "https://github.com/login/oauth/access_token",
          {
            client_id: GITHUB_CLIENT_ID,
            device_code: activeDeviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          },
          { headers: { Accept: "application/json" } }
        );

        if ("access_token" in data) {
          tokenStore.github = data.access_token;
          setActiveDeviceCode(data.device_code);
          return {
            content: [
              {
                type: "text",
                text: "Sucesso! Autenticação concluída. Agora você pode usar os comandos do Github.",
              },
            ],
          };
        } else if (data.error === "authorization_pending") {
          return {
            content: [
              {
                type: "text",
                text: "Autorização pendente. Certifique-se de que completou o processo no navegador e tente executar esta ferramenta novamente em alguns segundos.",
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `Erro do GitHub: ${data.error_description}`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: "Ocorreu um erro de rede ao tentar verificar a autenticação.",
            },
          ],
        };
      }
    }
  );

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
