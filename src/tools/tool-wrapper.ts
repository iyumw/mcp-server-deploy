import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { sessionTokens, Tokens } from "../tokenStore.js";

type AuthRequirement = 'github' | 'clickup' | 'both';

type AuthenticatedToolHandler = (
  params: any,
  context: any,
  tokens: Tokens
) => Promise<CallToolResult>;

export function createAuthenticatedTool(
  requirement: AuthRequirement,
  handler: AuthenticatedToolHandler
) {
  return async (params: any, context: any): Promise<CallToolResult> => {
    const sessionId = context?.sessionId;

    if (!sessionId) {
      return { content: [{ type: "text", text: "Erro crítico: ID da sessão não encontrado no servidor." }] };
    }

    const currentTokens = sessionTokens[sessionId];
    const missingAuth: string[] = [];

    if (requirement === 'github' || requirement === 'both') {
      if (!currentTokens?.github) missingAuth.push("GitHub");
    }
    if (requirement === 'clickup' || requirement === 'both') {
      // Para o ClickUp, vamos considerar logado se tiver o accessToken
      if (!currentTokens?.clickup?.accessToken) missingAuth.push("ClickUp");
    }

    if (missingAuth.length > 0) {
      return {
        content: [{ type: "text", text: `Autenticação pendente para: ${missingAuth.join(", ")}. Por favor, faça o login.` }],
      };
    }

    return handler(params, context, currentTokens!);
  };
}