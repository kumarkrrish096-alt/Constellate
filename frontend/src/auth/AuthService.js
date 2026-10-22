// Single integration point for real authentication.
// Every function rejects until you connect a backend, so the UI never
// pretends a sign-in worked.
export class AuthNotConnectedError extends Error {
    constructor() {
        super('Authentication is not connected yet.');
        this.name = 'AuthNotConnectedError';
    }
}
const notConnected = () => Promise.reject(new AuthNotConnectedError());

// TODO: POST credentials to your API, store the session your backend returns.
export const signInWithEmail = ({ email, password, remember }) => notConnected();
export const signUpWithEmail = ({ name, email, password }) => notConnected();

// TODO: redirect to your backend's OAuth start URL for 'google' or 'github'
// (e.g. window.location.assign('/api/auth/github')). Client IDs and secrets
// belong on the server, not in this file.
export const signInWithProvider = (provider) => notConnected();
