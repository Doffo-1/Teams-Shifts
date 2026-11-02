export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email: string;
  groups: string[];
  isAuthenticated: boolean;
  isDev: boolean;
}

export async function getAuthUser(req?: Request): Promise<AuthUser> {
  return {
    id: 'local-user',
    username: 'user',
    name: 'User',
    email: 'user@example.com',
    groups: ['admin', 'shifts-manager'],
    isAuthenticated: true,
    isDev: false,
  };
}
