import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { completeOAuthSignIn } from "../auth/AuthService";

// The backend has already set the httpOnly session cookie before redirecting
// here; this page exchanges it for an access token. Nothing secret is in the URL.
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    completeOAuthSignIn().then((user) => {
      if (active) navigate(user ? "/dashboard" : "/login", { replace: true });
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#0E0607",
        color: "#EADFC8",
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: "1.2rem",
      }}
    >
      Signing you in…
    </div>
  );
}
