export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const checks = [
    ['8+ characters', (p) => p.length >= 8],
    ['Upper and lower case', (p) => /[a-z]/.test(p) && /[A-Z]/.test(p)],
    ['A number', (p) => /\d/.test(p)],
    ['A symbol', (p) => /[^A-Za-z0-9]/.test(p)],
];
export const strength = (p) => checks.filter(([, ok]) => ok(p)).length;

const emailError = (email) =>
    !email.trim() ? 'Enter your email.' : !EMAIL_RE.test(email) ? 'That email looks incomplete.' : undefined;

export function validateLogin({ email, password }) {
    const e = {};
    if (emailError(email)) e.email = emailError(email);
    if (!password) e.password = 'Enter your password.';
    return e;
}

export function validateSignUp({ name, email, password, confirm }) {
    const e = {};
    if (!name.trim()) e.name = 'Tell us what to call you.';
    if (emailError(email)) e.email = emailError(email);
    if (!password) e.password = 'Choose a password.';
    else if (password.length < 8 || strength(password) < 3)
        e.password = 'Use 8+ characters and at least three of the four checks.';
    if (!confirm) e.confirm = 'Repeat your password.';
    else if (confirm !== password) e.confirm = 'The passwords don’t match.';
    return e;
}
