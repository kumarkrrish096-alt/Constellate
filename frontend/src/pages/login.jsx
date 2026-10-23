import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../auth/AuthLayout';
import { Field, PasswordField } from '../auth/field';
import SocialButtons, { Divider } from '../auth/SocialButtons';
import { validateLogin } from '../auth/validate';
import {
    signInWithEmail,
    signInWithProvider,
    requestPasswordReset,
    AuthError,
} from '../auth/AuthService';

export default function Login() {
    const [v, setV] = useState(() => {
        try {
            const saved = sessionStorage.getItem('constellate_login_draft');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return { email: '', password: '', remember: true };
    });
    const [err, setErr] = useState({});
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [msgType, setMsgType] = useState('error'); // 'error' or 'success'
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Preserve written credentials across page reloads
    useEffect(() => {
        try {
            sessionStorage.setItem('constellate_login_draft', JSON.stringify(v));
        } catch (e) {}
    }, [v]);

    // Reset busy state if user navigates back using browser Back button
    useEffect(() => {
        const handlePageShow = () => setBusy(false);
        window.addEventListener('pageshow', handlePageShow);
        return () => window.removeEventListener('pageshow', handlePageShow);
    }, []);

    // Handle URL error message and remove it from URL so reload clears it
    useEffect(() => {
        const error = searchParams.get('error');
        if (error) {
            setMsg(error);
            setMsgType('error');
            // Clean the error parameter from URL so it doesn't reappear on reload
            const url = new URL(window.location.href);
            url.searchParams.delete('error');
            window.history.replaceState(
                {},
                '',
                url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '')
            );
        }
    }, [searchParams]);

    const set = (k) => (e) => {
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setV((s) => ({ ...s, [k]: val }));
        setErr((s) => ({ ...s, [k]: undefined }));
    };

    const run = async (fn) => {
        setBusy(true); setMsg('');
        try {
            await fn();
            try { sessionStorage.removeItem('constellate_login_draft'); } catch (e) {}
            navigate('/');
        }
        catch (e) {
            setMsgType('error');
            setMsg(e instanceof AuthError
                ? e.message
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

    const handleForgotPassword = async () => {
        if (!v.email || !v.email.includes('@')) {
            setMsgType('error');
            setMsg('Please enter your email address above first, then click "Forgot password?".');
            return;
        }

        setBusy(true);
        setMsg('');
        try {
            const res = await requestPasswordReset(v.email);
            setMsgType('success');
            setMsg(res.message || 'If an account exists with this email, instructions have been sent.');
        } catch (e) {
            setMsgType('error');
            setMsg(e.message || 'Could not process password reset request.');
        } finally {
            setBusy(false);
        }
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
                    <button
                        type="button"
                        className="auth-link"
                        onClick={handleForgotPassword}
                        disabled={busy}
                    >
                        Forgot password?
                    </button>
                </div>
                {msg && (
                    <p
                        className="auth-msg"
                        style={msgType === 'success' ? { color: '#4ade80', borderColor: '#4ade80' } : {}}
                        role="status"
                    >
                        {msg}
                    </p>
                )}
                <button className="auth-btn" disabled={busy}>
                    {busy && <span className="auth-spin" aria-hidden="true" />}
                    {busy ? 'Signing in…' : 'Log in'}
                </button>
            </form>
            <Divider>Or continue with</Divider>
            <SocialButtons
                mode="login"
                disabled={busy}
                onProvider={(p, m) => {
                    setMsg('');
                    signInWithProvider(p, m || 'login');
                }}
            />
        </AuthLayout>
    );
}
