import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../auth/AuthLayout';
import { Field, PasswordField } from '../auth/field';
import SocialButtons, { Divider } from '../auth/SocialButtons';
import { validateLogin } from '../auth/validate';
import { signInWithEmail, signInWithProvider, AuthNotConnectedError } from '../auth/AuthService';

export default function Login() {
    const [v, setV] = useState({ email: '', password: '', remember: true });
    const [err, setErr] = useState({});
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    const set = (k) => (e) => {
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setV((s) => ({ ...s, [k]: val }));
        setErr((s) => ({ ...s, [k]: undefined }));
    };

    const run = async (fn) => {
        setBusy(true); setMsg('');
        try { await fn(); }
        catch (e) {
            setMsg(e instanceof AuthNotConnectedError
                ? 'Sign-in isn’t connected to a server yet, so nothing was sent.'
                : 'Something went wrong. Please try again.');
        } finally { setBusy(false); }
    };

    const submit = (e) => {
        e.preventDefault();
        const found = validateLogin(v);
        setErr(found);
        if (Object.keys(found).length) return;
        run(() => signInWithEmail(v));
    };

    return (
        <AuthLayout
            title="Welcome back"
            lead="Pick up your chart where you left it."
            footer={<>New here? <Link to="/signup">Create an account</Link></>}
        >
            <form onSubmit={submit} noValidate>
                <Field label="Email" type="email" autoComplete="email" value={v.email}
                    onChange={set('email')} error={err.email} disabled={busy} />
                <PasswordField label="Password" autoComplete="current-password" value={v.password}
                    onChange={set('password')} error={err.password} disabled={busy} />
                <div className="auth-row">
                    <label className="auth-check">
                        <input type="checkbox" checked={v.remember} onChange={set('remember')} disabled={busy} /> Remember me
                    </label>
                    <button type="button" className="auth-link"
                        onClick={() => setMsg('Password reset isn’t available yet.')}>Forgot password?</button>
                </div>
                {msg && <p className="auth-msg" role="status">{msg}</p>}
                <button className="auth-btn" disabled={busy}>
                    {busy && <span className="auth-spin" aria-hidden="true" />}
                    {busy ? 'Signing in…' : 'Log in'}
                </button>
            </form>
            <Divider>Or continue with</Divider>
            <SocialButtons mode="login" disabled={busy} onProvider={(p) => run(() => signInWithProvider(p))} />
        </AuthLayout>
    );
}
