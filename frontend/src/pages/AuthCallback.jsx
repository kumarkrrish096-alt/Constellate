import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { saveSession } from "../auth/AuthService";

export default function AuthCallback() {
  const [params] = useSearchParams();
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
