import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../auth/AuthLayout';
import { Field, PasswordField } from '../auth/field';
import SocialButtons, { Divider } from '../auth/SocialButtons';
import { validateSignUp, checks, strength } from '../auth/validate';
import { signUpWithEmail, signInWithProvider, AuthNotConnectedError } from '../auth/AuthService';

export default function SignUp() {
    const [v, setV] = useState({ name: '', email: '', password: '', confirm: '' });
    const [err, setErr] = useState({});
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const s = strength(v.password);

    const set = (k) => (e) => {
        setV((x) => ({ ...x, [k]: e.target.value }));
        setErr((x) => ({ ...x, [k]: undefined }));
    };

    const run = async (fn) => {
        setBusy(true); setMsg('');
        try { await fn(); }
        catch (e) {
            setMsg(e instanceof AuthNotConnectedError
                ? 'Sign-up isn’t connected to a server yet, so no account was created.'
                : 'Something went wrong. Please try again.');
        } finally { setBusy(false); }
    };

    const submit = (e) => {
        e.preventDefault();
        const found = validateSignUp(v);
        setErr(found);
        if (Object.keys(found).length) return;
        run(() => signUpWithEmail(v));
    };

    return (
        <AuthLayout
            title="Create your account"
            lead="Start mapping codebases in a minute."
            footer={<>Already have an account? <Link to="/login">Log in</Link></>}
        >
            <form onSubmit={submit} noValidate>
                <Field label="Full name" autoComplete="name" value={v.name}
                    onChange={set('name')} error={err.name} disabled={busy} />
                <Field label="Email" type="email" autoComplete="email" value={v.email}
                    onChange={set('email')} error={err.email} disabled={busy} />
                <PasswordField label="Password" autoComplete="new-password" value={v.password}
                    onChange={set('password')} error={err.password} disabled={busy} />
                <div className="auth-meter" aria-live="polite">
                    <div className="auth-bars">
                        {[1, 2, 3, 4].map((i) => <i key={i} className={i <= s ? `on s${s}` : ''} />)}
                    </div>
                    <ul>
                        {checks.map(([label, ok]) => <li key={label} className={ok(v.password) ? 'ok' : ''}>{label}</li>)}
                    </ul>
                </div>
                <PasswordField label="Confirm password" autoComplete="new-password" value={v.confirm}
                    onChange={set('confirm')} error={err.confirm} disabled={busy} />
                {msg && <p className="auth-msg" role="status">{msg}</p>}
                <button className="auth-btn" disabled={busy}>
                    {busy && <span className="auth-spin" aria-hidden="true" />}
                    {busy ? 'Creating account…' : 'Create account'}
                </button>
            </form>
            <Divider>Or sign up with</Divider>
            <SocialButtons mode="signup" disabled={busy} onProvider={(p) => run(() => signInWithProvider(p))} />
        </AuthLayout>
    );
}
