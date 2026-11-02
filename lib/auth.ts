import { headers } from 'next/headers';

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
  let headerEmail: string | null = null;
  let headerName: string | null = null;
  let headerUsername: string | null = null;
  let headerUid: string | null = null;
  let headerGroups: string | null = null;

  if (req) {
    headerEmail = req.headers.get('x-authentik-email');
    headerName = req.headers.get('x-authentik-name');
    headerUsername = req.headers.get('x-authentik-username');
    headerUid = req.headers.get('x-authentik-uid');
    headerGroups = req.headers.get('x-authentik-groups');
  } else {
    try {
      const h = await headers();
      headerEmail = h.get('x-authentik-email');
      headerName = h.get('x-authentik-name');
      headerUsername = h.get('x-authentik-username');
      headerUid = h.get('x-authentik-uid');
      headerGroups = h.get('x-authentik-groups');
    } catch {
      // In non-request context
    }
  }

  if (headerEmail || headerUsername || headerName) {
    const groups = headerGroups
      ? headerGroups.split(/[,;|]/).map(g => g.trim()).filter(Boolean)
      : [];

    return {
      id: headerUid || headerUsername || headerEmail || 'user',
      username: headerUsername || headerEmail?.split('@')[0] || 'user',
      name: headerName || headerUsername || 'User',
      email: headerEmail || '',
      groups,
      isAuthenticated: true,
      isDev: false,
    };
  }

  // Development Fallback when not running behind Authentik proxy
  return {
    id: 'dev-user',
    username: process.env.DEV_USER_USERNAME || 'developer',
    name: process.env.DEV_USER_NAME || 'Developer',
    email: process.env.DEV_USER_EMAIL || 'developer@example.com',
    groups: ['admin', 'shifts-manager'],
    isAuthenticated: true,
    isDev: true,
  };
}
