import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

import { tokenStore } from "./tokenStore.js";
import { registerGithubTools } from "./tools/github.js";
import { registerClickupTools } from "./tools/clickup.js";
import { registerIntegrationTools } from "./tools/integrations.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// mapa para armazenar os transportes ativos por id de sessão
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// rota principal do mcp
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        transports[newSessionId] = transport;
        console.log(`[Server] Nova sessão iniciada: ${newSessionId}`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        console.log(`[Server] Sessão encerrada: ${transport.sessionId}`);
        delete transports[transport.sessionId];
      }
    };

    const server = new McpServer({
      name: "meu-servidor-github",
      version: "2.0.0",
      description:
        "Bem-vindo ao assistente de automação GitHub-ClickUp!\n\nPara começar, autentique-se nos serviços necessários:\n1. Execute a ferramenta `github_login` e siga as instruções.\n2. Execute a ferramenta `clickup_login` e siga as instruções.",
    });

    registerGithubTools(server);
    registerClickupTools(server);
    registerIntegrationTools(server);

    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

app.get("/clickup/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;

  if (!code) {
    return res
      .status(400)
      .send(
        "<h1>Erro</h1><p>Código de autorização não encontrado na requisição.</p>"
      );
  }

  try {
    console.log(
      "Recebido código de autorização do ClickUp. A trocar por token..."
    );

    const tokenResponse = await axios.default.post(
      "https://api.clickup.com/api/v2/oauth/token",
      {
        client_id: process.env.CLICKUP_CLIENT_ID,
        client_secret: process.env.CLICKUP_CLIENT_SECRET,
        code,
      }
    );
    const accessToken = tokenResponse.data.access_token;

    const teamsResponse = await axios.default.get(
      "https://api.clickup.com/api/v2/team",
      {
        headers: { Authorization: accessToken },
      }
    );

    tokenStore.clickup = {
      accessToken: accessToken,
      selectedTeamId: null,
      workspaces: teamsResponse.data.teams,
    };

    console.log("Token do ClickUp obtido e armazenado com sucesso.");
    res.send(
      "<h1>Sucesso!</h1><p>Autenticação com o ClickUp concluída. Pode fechar esta aba e voltar ao seu cliente.</p>"
    );
  } catch (err) {
    // Adicionando tratamento de erro mais específico do Axios
    if (axios.isAxiosError(err)) {
      console.error(
        "Erro na API do ClickUp:",
        err.response?.data || err.message
      );
    } else {
      console.error("Erro inesperado no callback do ClickUp:", err);
    }
    res
      .status(500)
      .send(
        "<h1>Erro na Autenticação</h1><p>Houve um problema ao obter o token do ClickUp. Verifique os logs do servidor.</p>"
      );
  }
});

// rotas adicionais
const handleSessionRequest = async (
  req: express.Request,
  res: express.Response
) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

// inicialização do Server
const port = 3000;
app.listen(port, () => {
  console.log(`\n✅ Servidor MCP com Express a funcionar com sucesso!`);
  console.log(`   ➡️  A escutar em: http://localhost:${port}/mcp`);
});
