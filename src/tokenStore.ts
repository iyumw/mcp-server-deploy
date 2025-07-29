interface ClickUpAuth {
  accessToken: string;
  selectedTeamId: string | null;
  workspaces: any[];
}

interface Tokens {
  github: string | null;
  clickup: ClickUpAuth | null;
}

export const tokenStore: Tokens = {
  github: null,
  clickup: null,
};

export let activeDeviceCode: string | null = null;
export function setActiveDeviceCode(code: string | null) {
  activeDeviceCode = code;
}