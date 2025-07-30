import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { sessionTokens, Tokens } from "../tokenStore.js";

// Define os tipos de autenticação que uma ferramenta pode exigir
type AuthRequirement = 'github' | 'clickup' | 'both';

// Este é o formato que suas ferramentas terão agora: elas recebem os tokens como um terceiro argumento.
type AuthenticatedToolHandler = (
  params: any,
  context: any,
  tokens: Tokens
) => Promise<CallToolResult>;

/**
 * Cria um handler de ferramenta que primeiro verifica a autenticação da sessão.
 * @param requirement O tipo de autenticação necessária ('github', 'clickup', ou 'both').
 * @param handler A função da sua ferramenta, que só será chamada se a autenticação for bem-sucedida.
 */
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

    // Verifica as credenciais necessárias
    if (requirement === 'github' || requirement === 'both') {
      if (!currentTokens?.github) missingAuth.push("GitHub");
    }
    if (requirement === 'clickup' || requirement === 'both') {
      if (!currentTokens?.clickup?.selectedTeamId) missingAuth.push("ClickUp");
    }

    // Se alguma autenticação estiver faltando, retorna a mensagem de erro
    if (missingAuth.length > 0) {
      return {
        content: [{ type: "text", text: `Autenticação pendente para: ${missingAuth.join(", ")}. Por favor, faça o login.` }],
      };
    }

    // Se tudo estiver OK, chama a função da sua ferramenta com os tokens
    return handler(params, context, currentTokens!);
  };
}