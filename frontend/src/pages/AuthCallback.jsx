import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { completeOAuthSignIn } from "../auth/AuthService";

// The backend has already set the httpOnly session cookie before redirecting
// here; this page exchanges it for an access token. Nothing secret is in the URL.
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    const error = params.get("error");

    if (error) {
      // OAuth failed — redirect to login with error message
      navigate(`/login?error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }

    if (token) {
      // Save session via AuthService
      saveSession({
        token,
        user: {
          id: params.get("id"),
          name: params.get("name"),
          email: params.get("email"),
        },
      });

      // Redirect to dashboard
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [params, navigate]);

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
