import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { completeOAuthSignIn } from "../auth/AuthService";

// The backend has already set the httpOnly session cookie before redirecting
// here; this page exchanges it for an access token. Nothing secret is in the URL.
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    completeOAuthSignIn().then((user) => {
      if (cancelled) return;
      navigate(user ? "/" : "/login?error=session_failed", { replace: true });
    });
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      color: "#ccc",
      fontFamily: "Inter, sans-serif",
    }}>
      Signing you in…
    </div>
  );
}
