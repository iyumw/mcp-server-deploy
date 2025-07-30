interface ClickUpAuth {
  accessToken: string;
  selectedTeamId: string | null;
  workspaces: any[];
}

interface Tokens {
  github: string | null;
  clickup: ClickUpAuth | null;
}


export const sessionTokens: { [sessionId: string]: Tokens } = {};
export const temporaryTokens: { [authCode: string]: Tokens } = {};
