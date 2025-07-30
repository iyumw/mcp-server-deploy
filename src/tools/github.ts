import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// CORREÇÃO 1: A importação do Axios foi alterada
import axios from "axios";
import dotenv from "dotenv";
import { createAuthenticatedTool } from "./tool-wrapper.js"; // Certifique-se que este arquivo existe

dotenv.config();

export function registerGithubTools(server: McpServer) {
  // --- Listar Repositórios ---
  server.registerTool(
    "github_meus_repositorios",
    {
      title: "Listar Repositórios do GitHub",
      description: "Lista os 10 repositórios mais recentes do usuário autenticado.",
      inputSchema: {},
    },
    createAuthenticatedTool('github', async (params, context, tokens) => {
      const { data } = await axios.get<any[]>(
        "https://api.github.com/user/repos?sort=pushed&per_page=10",
        { headers: { Authorization: `Bearer ${tokens.github}` } }
      );
      
      // CORREÇÃO 2: Adicionado o tipo 'any' para o parâmetro 'repo'
      const repos = data.map((repo: any) => `- ${repo.full_name}`).join("\n");
      
      return {
        content: [{ type: "text", text: `Seus 10 repositórios mais recentes:\n${repos}` }],
      };
    })
  );

  // --- Criar Repositório ---
  server.registerTool(
    "github_criar_repositorio",
    {
      title: "Criar Repositório no GitHub",
      description: "Cria um novo repositório no GitHub.",
      inputSchema: {
        nome: z.string().describe("O nome para o novo repositório."),
        descricao: z.string().optional().describe("Uma breve descrição."),
        privado: z.boolean().optional().default(false).describe("Define se o repositório deve ser privado."),
      },
    },
    createAuthenticatedTool('github', async ({ nome, descricao, privado }, context, tokens) => {
      try {
        const endpoint = "https://api.github.com/user/repos";
        const repoData = { name: nome, description: descricao, private: privado };
        const headers = {
          Authorization: `Bearer ${tokens.github}`,
          Accept: "application/vnd.github.v3+json",
        };
        const { data } = await axios.post(endpoint, repoData, { headers });
        return {
          content: [{ type: "text", text: `✅ Repositório "${data.full_name}" criado com sucesso!\nURL: ${data.html_url}` }],
        };
      } catch (error: any) {
        if (axios.isAxiosError(error) && error.response?.status === 422) {
          return { content: [{ type: "text", text: "❌ Falha ao criar. Um repositório com este nome provavelmente já existe." }] };
        }
        return { content: [{ type: "text", text: "❌ Ocorreu um erro inesperado ao tentar criar o repositório." }] };
      }
    })
  );
}