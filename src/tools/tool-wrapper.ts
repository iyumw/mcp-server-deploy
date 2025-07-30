import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { sessionTokens, Tokens } from "../tokenStore.js"; // Importa o objeto global

type AuthenticatedToolHandler = (
  params: any,
  context: any,
  tokens: Tokens
) => Promise<CallToolResult>;

export function createAuthenticatedTool(
  requirement: 'github' | 'clickup' | 'both',
  handler: AuthenticatedToolHandler
) {
  return async (params: any, context: any): Promise<CallToolResult> => {
    const sessionId = context?.sessionId;
    if (!sessionId) {
      return { content: [{ type: "text", text: "Erro: ID da sessão não encontrado." }] };
    }
  
    const currentTokens = sessionTokens[sessionId]; 
    
    const missingAuth: string[] = [];
    if (requirement === 'github' || requirement === 'both') {
      if (!currentTokens?.github) missingAuth.push("GitHub");
    }
    if (requirement === 'clickup' || requirement === 'both') {
      if (!currentTokens?.clickup?.selectedTeamId) missingAuth.push("ClickUp");
    }
    
    if (missingAuth.length > 0) {
      return { content: [{ type: "text", text: `Autenticação pendente para: ${missingAuth.join(", ")}.` }] };
    }

    return handler(params, context, currentTokens!);
  };
}