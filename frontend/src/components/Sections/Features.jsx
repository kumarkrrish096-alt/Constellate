import Scene from "./Scene"
import AtlasVisual from "./visuals/AtlasVisual"
import CycleVisual from "./visuals/CycleVisual"
import BlastVisual from "./visuals/BlastVisual"

export default function Features() {
  return (
    <section className="cx-sec" id="features">
      <header className="cx-intro">
        <p className="cx-eyebrow">Features</p>
        {/* Intro copy below is new placeholder text: edit freely */}
        <h2 className="cx-big">Read the sky.</h2>
        <p className="cx-sub">Once the map is drawn, every star is a file and every line is an import.</p>
      </header>
      <Scene id="s3" title="The dependency atlas"
        text="Files that import each other pull together into clusters. Pick any star to light up what it uses and what uses it.">
        {({ inViewRef }) => <AtlasVisual inViewRef={inViewRef} />}
      </Scene>
      <Scene id="s4" flip title="Import cycles, found"
        text="When files import each other in a loop, the loop lights up. It is invisible in a folder tree and easy to see here.">
        {() => <CycleVisual />}
      </Scene>
      <Scene id="s5" title="Know where a change lands"
        text="Churn against complexity marks fragile god files. Blast radius shows how far an edit travels, so newcomers can start at the edge.">
        {() => <BlastVisual />}
      </Scene>
    </section>
  )
}
