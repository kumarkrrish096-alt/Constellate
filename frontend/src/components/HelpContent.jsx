import { Link } from 'react-router-dom'

export default function HelpContent() {
  return (
    <>
<div className="kick">Support</div><h1 className="h1">Help Center</h1>
<p className="sub">How Constellate turns a repository into a map, and what to do when a cast does not go as planned.</p>
<div className="card"><div className="ct"><h3>Cast your first atlas</h3></div>
<ol><li>Open <b>Sanctum</b> and paste a public GitHub address such as <span className="k">github.com/owner/repo</span>, or drop a <span className="k">.zip</span> onto the dashed box.</li>
<li>Press <b>Cast atlas</b>. The progress list shows each stage, from checking the commit to sealing the snapshot.</li>
<li>When it finishes, press <b>Open atlas</b>. The same commit always opens the same map, so repeat casts of an unchanged repository return from the archive.</li></ol></div>
<div className="card"><div className="ct"><h3>The five views</h3></div><div className="vg">
<div><b>Sanctum</b><span>Your home page: cast a new atlas, see recent casts and the safest first steps.</span></div>
<div><b>Atlas</b><span>The dependency map. Files are stars, imports are lines, clusters are neighbourhoods.</span></div>
<div><b>Vitals</b><span>Architectural health. Churn against complexity, import cycles and hotspots.</span></div>
<div><b>Pathfinder</b><span>Where a newcomer can start. Files ranked by how little they can break.</span></div>
<div><b>Chronicle</b><span>Every cast you have made. Reopen, compare two side by side, export or remove.</span></div></div></div>
<div className="card"><div className="ct"><h3>Reading the atlas</h3></div>
<ul><li>Click a star to light up what it imports and what imports it. The code panel shows its size, complexity and imports.</li>
<li>Switch between <b>Force</b>, <b>Hierarchy</b> and <b>Heatmap</b> above the map. Heatmap colours files by churn and complexity.</li>
<li><b>Co-change</b> adds dotted links between files that are edited together even when they do not import each other.</li>
<li>Search by file name in the box above the map. Pressing <span className="k">/</span> jumps to it from anywhere, and <span className="k">Esc</span> clears it.</li>
<li><b>Export</b> saves the atlas as PNG, SVG or a JSON snapshot. <b>Copy permalink</b> copies a link for the commit.</li></ul></div>
<div className="card"><div className="ct"><h3>Terms in plain words</h3></div><dl className="gl">
<dt>Import cycle</dt><dd>Files that import each other in a loop. They are hard to change one at a time and are marked in the atlas.</dd>
<dt>God file</dt><dd>A file that a large part of the project depends on. A change here reaches many others.</dd>
<dt>Blast radius</dt><dd>How many files could be affected by a change to one file, found by following imports backwards.</dd>
<dt>Churn</dt><dd>How often a file has changed in the recent history window.</dd>
<dt>Complexity</dt><dd>How many branching paths the code in a file contains (cyclomatic complexity).</dd>
<dt>Cluster</dt><dd>A group of files that import each other far more than they import anything else.</dd></dl></div>
<div className="card"><div className="ct"><h3>Troubleshooting</h3></div>
<details className="fq"><summary>It says to enter a public GitHub URL</summary><div>The address must look like <span className="k">github.com/owner/repo</span>. Only public repositories can be cast. For a private project, zip it and drop the archive instead.</div></details>
<details className="fq"><summary>A cast fizzled</summary><div>The Chronicle marks casts that did not finish. Go back to Sanctum and cast the repository again. The recast button on a Chronicle entry fills in the address for you.</div></details>
<details className="fq"><summary>My repository is rejected as too large</summary><div>Constellate limits each job so one huge archive cannot stall the queue. The defaults are 150 MB, 20,000 files and 90 seconds of processing. Binaries, <span className="k">node_modules</span>, vendor folders and build output are skipped. Zip only the source folders to stay inside the limits.</div></details>
<details className="fq"><summary>GitHub says the rate limit was reached</summary><div>If an atlas for that commit already exists it is served from the archive. Otherwise the job waits in the queue and retries after GitHub resets the limit. Check the status panel for the queue position.</div></details>
<details className="fq"><summary>Is my code run or stored?</summary><div>Code is only read as text and is never executed. Results are kept as an immutable snapshot for that commit.</div></details>
<details className="fq"><summary>The page feels slow or distracting</summary><div>Open Settings from the sidebar or your avatar and turn on <b>Reduce motion</b>. It stills the page and the atlas animation. Your device's reduced-motion preference is also respected automatically.</div></details>
<details className="fq"><summary>The map is too busy to read</summary><div>Use <b>Reset view</b> beside the zoom buttons, search for the file you care about to highlight its neighbours, or switch to <b>Hierarchy</b> for a calmer layout.</div></details></div>
<div className="card"><p style={{margin:0}}>Still stuck? <Link className="lnk" to="/support/report">Report an issue</Link> or <Link className="lnk" to="/support/contact">contact the team</Link>.</p></div>
    </>
  )
}
