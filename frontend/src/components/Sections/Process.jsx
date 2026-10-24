import Scene from "./Scene"
import IngestVisual from "./visuals/IngestVisual"
import ParseVisual from "./visuals/ParseVisual"

export default function Process() {
  return (
    <section className="cx-sec" id="process">
      <header className="cx-intro">
        <p className="cx-eyebrow">Process</p>
        <h2 className="cx-big">See how your code connects.</h2>
        <p className="cx-sub">
          Paste a public GitHub repository. Constellate reads every file and draws the map, from the first import to the last circular one.
        </p>
      </header>
      <Scene id="s1" title="Drop in a repository"
        text="A GitHub URL or a zip becomes a field of stars, one for each source file. The code is read, never run.">
        {({ inViewRef }) => <IngestVisual inViewRef={inViewRef} />}
      </Scene>
      <Scene id="s2" flip title="Every file, parsed to a tree"
        text="Tree-sitter turns source into a syntax tree. Imports, exports, functions and calls come out, along with complexity.">
        {() => <ParseVisual />}
      </Scene>
    </section>
  )
}
