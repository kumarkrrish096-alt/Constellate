import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../auth/AuthLayout';
import { PasswordField } from '../auth/field';
import { checks, strength } from '../auth/validate';
import { resetPassword, AuthError } from '../auth/AuthService';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [token] = useState(() => searchParams.get('token') || '');
    const [v, setV] = useState({ password: '', confirm: '' });
    const [err, setErr] = useState({});
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [done, setDone] = useState(false);
    const s = strength(v.password);

    // Drop the token from the address bar and history once it has been read.
    useEffect(() => {
        window.history.replaceState({}, '', window.location.pathname);
    }, []);

    const set = (k) => (e) => {
        setV((x) => ({ ...x, [k]: e.target.value }));
        setErr((x) => ({ ...x, [k]: undefined }));
    };

    const submit = async (e) => {
        e.preventDefault();
        const found = {};
        if (v.password.length < 8 || s < 3) found.password = 'Use 8+ characters and at least three of the four checks.';
        if (v.confirm !== v.password) found.confirm = 'The passwords don’t match.';
        setErr(found);
        if (Object.keys(found).length) return;

        setBusy(true); setMsg('');
        try {
            const res = await resetPassword(token, v.password);
            setDone(true);
            setMsg(res.message);
            setTimeout(() => navigate('/login', { replace: true }), 2500);
        } catch (e) {
            setMsg(e instanceof AuthError ? e.message : 'Something went wrong. Please try again.');
        } finally { setBusy(false); }
    };

    if (!token) {
        return (
            <AuthLayout
                title="Link incomplete"
                lead="This reset link is missing its token. Request a new one from the login page."
                footer={<Link to="/login">Back to log in</Link>}
            />
        );
    }

    return (
        <AuthLayout
            title="Choose a new password"
            lead="You’ll be signed out everywhere else once it’s saved."
            footer={<Link to="/login">Back to log in</Link>}
        >
            <form onSubmit={submit} noValidate>
                <PasswordField label="New password" autoComplete="new-password" value={v.password}
                    onChange={set('password')} error={err.password} disabled={busy || done} />
                <div className="auth-meter" aria-live="polite">
                    <div className="auth-bars">
                        {[1, 2, 3, 4].map((i) => <i key={i} className={i <= s ? `on s${s}` : ''} />)}
                    </div>
                    <ul>
                        {checks.map(([label, ok]) => <li key={label} className={ok(v.password) ? 'ok' : ''}>{label}</li>)}
                    </ul>
                </div>
                <PasswordField label="Confirm new password" autoComplete="new-password" value={v.confirm}
                    onChange={set('confirm')} error={err.confirm} disabled={busy || done} />
                {msg && (
                    <p className="auth-msg" role="status"
                        style={done ? { color: '#4ade80', borderColor: '#4ade80' } : {}}>
                        {msg}
                    </p>
                )}
                <button className="auth-btn" disabled={busy || done}>
                    {busy && <span className="auth-spin" aria-hidden="true" />}
                    {busy ? 'Saving…' : 'Save new password'}
                </button>
            </form>
        </AuthLayout>
    );
}
