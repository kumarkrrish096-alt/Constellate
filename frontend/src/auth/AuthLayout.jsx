import { Link } from 'react-router-dom';
import AuthBackground from './AuthBackground';
import './auth.css';

export default function AuthLayout({ title, lead, footer, children }) {
    return (
        <div className="auth">
            <AuthBackground key={title} />
            
            <header className="auth-top">
                <Link to="/" className="auth-mark">Constellate</Link>
            </header>
            <aside className="auth-quote">
                <p>Every codebase is a constellation.</p>
            </aside>
            <main className="auth-main">
                <section className="auth-card" aria-labelledby="auth-title">
                    <svg className="auth-emblem" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
                        <circle cx="16" cy="16" r="13" />
                        <circle cx="16" cy="16" r="8" strokeDasharray="1.5 2.5" />
                        <path d="M16 3v26M3 16h26M7 7l18 18M25 7L7 25" strokeWidth=".7" />
                    </svg>
                    <h1 id="auth-title">{title}</h1>
                    <p className="auth-lead">{lead}</p>
                    {children}
                    <p className="auth-foot">{footer}</p>
                </section>
            </main>
        </div>
    );
}
