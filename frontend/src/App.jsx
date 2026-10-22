import LandingPage from './components/LandingPage/LandingPage'
import { Routes, Route } from "react-router-dom";
import Login from "./pages/login";
import Signup from "./pages/signup";

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Routes>
    </div>
  );
}

export default App;