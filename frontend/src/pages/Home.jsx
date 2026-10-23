import LandingPage from "../components/LandingPage/LandingPage";
import AuthNav from "../components/Sections/AuthNav";
import Starfield from "../components/Sections/Starfield";
import Process from "../components/Sections/Process";
import Features from "../components/Sections/Features";
import About from "../components/Sections/About";
import useScrollUnlock from "../components/shared/useScrollUnlock";
import "../components/shared/theme.css";
import "../components/Sections/Sections.css";

/**
 * Home component:
 * - Unlocks scrolling via useScrollUnlock()
 * - Preserves the untouched 3D animated hero in a 100vh container
 * - Smoothly flows into the new Process, Features, and About sections
 */
export default function Home() {
  useScrollUnlock();

  return (
    <div className="cx">
      <AuthNav />
      <LandingPage />
      <div className="cx-fx">
        <Starfield />
        <Process />
        <Features />
      </div>
      <About />
    </div>
  );
}
