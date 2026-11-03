// Support links are sourced from env vars at build time (VITE_ISSUE_URL, VITE_TEAM_EMAIL).
export const SUPPORT = {
  issueUrl: import.meta.env.VITE_ISSUE_URL || '',
  teamEmail: import.meta.env.VITE_TEAM_EMAIL || '',
};

// Shown only when no authenticated user is found (e.g. during loading or unauthenticated access).
export const DEFAULT_USER = 'User';
