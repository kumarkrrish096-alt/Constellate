export function snapshotAtlas(snapshot) {
  const files = Array.isArray(snapshot?.files) ? snapshot.files : []
  const clusterNames = (snapshot.clusters || []).map(cluster => cluster.label)
  const names = clusterNames.length ? clusterNames : ['Repository']
  const groups = names.map(() => [])
  const filesByPath = new Map(files.map(file => [file.path, file.id]))
  const edges = (snapshot.edges || []).filter(edge => files[edge.s] && files[edge.t])
  const outgoing = files.map(() => [])
  const incoming = files.map(() => [])
  const outgoingEdges = []
  const cyclicFiles = new Set((snapshot.cycles || []).flatMap(cycle => cycle.files || []))

  for (const edge of edges) {
    outgoing[edge.s].push(edge.t)
    incoming[edge.t].push(edge.s)
    outgoingEdges.push({
      a: edge.s,
      b: edge.t,
      cy: cyclicFiles.has(edge.s) && cyclicFiles.has(edge.t),
      i: outgoingEdges.length,
    })
  }

  const maxComplexity = Math.max(1, ...files.map(file => file.complexity || 0))
  const maxChurn = Math.max(1, ...files.map(file => file.churn?.lines || 0))
  const nodes = files.map((file, id) => {
    const cluster = Number.isInteger(file.cluster) && names[file.cluster] ? file.cluster : 0
    const node = {
      id,
      k: cluster,
      name: file.path,
      cx: file.complexity ?? 0,
      ch: file.churn?.lines ?? 0,
      tok: file.tokens ?? 0,
      out: outgoing[id],
      inn: incoming[id],
      bl: file.blastradius ?? 0,
      risk: file.health?.score == null
        ? ((file.complexity || 0) / maxComplexity + (file.churn?.lines || 0) / maxChurn) / 2
        : Math.max(0, Math.min(1, 1 - file.health.score / 100)),
      h: file.health?.score ?? null,
      sourceFile: file,
    }
    node.fwd = reach(id, outgoing)
    node.rev = reach(id, incoming)
    groups[cluster].push(id)
    return node
  })

  const cochange = (snapshot.cochange || [])
    .map(pair => ({ a: pair.a, b: pair.b, w: pair.count }))
    .filter(pair => nodes[pair.a] && nodes[pair.b])
  const positions = layout(nodes.length, groups.length, groups)
  const godFile = (snapshot.godfiles || []).find(id => nodes[id]) ?? -1
  const cycles = cyclicFiles
  const maximumBlastRadius = Math.max(1, ...nodes.map(node => node.bl))

  return {
    N: nodes,
    E: outgoingEdges,
    C: groups,
    CO: cochange,
    F: names,
    U: positions,
    god: godFile,
    cyc: cycles,
    maxB: maximumBlastRadius,
    filesByPath,
    snapshot,
  }
}

function reach(start, adjacency) {
  const visited = new Set()
  const queue = [...(adjacency[start] || [])]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const next = queue[cursor]
    if (next === start || visited.has(next)) continue
    visited.add(next)
    queue.push(...(adjacency[next] || []))
  }
  return visited
}

function layout(nodeCount, groupCount, groups) {
  const positions = Array.from({ length: nodeCount }, () => ({ x: 0, y: 0, vx: 0, vy: 0 }))
  for (let group = 0; group < groupCount; group++) {
    const ids = groups[group]
    const centerAngle = groupCount === 1 ? 0 : (group / groupCount) * Math.PI * 2 - Math.PI / 2
    const centerX = groupCount === 1 ? 0 : Math.cos(centerAngle) * 0.62
    const centerY = groupCount === 1 ? 0 : Math.sin(centerAngle) * 0.62
    ids.forEach((id, index) => {
      const angle = ids.length ? (index / ids.length) * Math.PI * 2 : 0
      const radius = Math.min(0.38, 0.08 + Math.sqrt(ids.length) * 0.025)
      positions[id].x = centerX + Math.cos(angle) * radius
      positions[id].y = centerY + Math.sin(angle) * radius
    })
  }
  return positions
}
