import { Link } from 'react-router-dom';
import AuthBackground from './AuthBackground';
import constellateLogo from '../assets/constellate-logo.png';
import './auth.css';

export default function AuthLayout({ title, lead, footer, children }) {
    return (
        <div className="auth">
            <AuthBackground key={title} />
            
            <header className="auth-top">
                <Link to="/" className="auth-mark" aria-label="Constellate home">
                    <span 
                        className="auth-mark-logo" 
                        role="img" 
                        aria-label="Constellate logo"
                        style={{ '--logo-url': `url("${constellateLogo}")` }}
                    />
                    <span>Constellate</span>
                </Link>
            </header>
            <aside className="auth-quote">
                <p>Every codebase is a constellation.</p>
            </aside>
            <main className="auth-main">
                <section className="auth-card" aria-labelledby="auth-title">
                    <span 
                        className="auth-emblem" 
                        role="img" 
                        aria-label="Constellate logo"
                        style={{ '--logo-url': `url("${constellateLogo}")` }}
                    />
                    <h1 id="auth-title">{title}</h1>
                    <p className="auth-lead">{lead}</p>
                    {children}
                    <p className="auth-foot">{footer}</p>
                </section>
            </main>
        </div>
    );
}
