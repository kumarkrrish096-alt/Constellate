import assert from 'node:assert/strict'
import test from 'node:test'
import { snapshotAtlas } from './snapshotAtlas.js'

function makeSnapshot() {
  return {
    files: [
      { id: 0, path: 'src/entry.js', cluster: 0, complexity: 5, tokens: 42, blastradius: 2, churn: { lines: 12 }, health: { score: 80 } },
      { id: 1, path: 'src/helper.js', cluster: 0, complexity: 2, tokens: 15, blastradius: 0, churn: null, health: { score: 95 } },
      { id: 2, path: 'lib/other.js', cluster: 1, complexity: null, tokens: 8, blastradius: 0, churn: null, health: null },
    ],
    clusters: [{ id: 0, label: 'src' }, { id: 1, label: 'lib' }],
    edges: [{ s: 0, t: 1, lines: [3], kinds: ['import'] }, { s: 2, t: 99, lines: [], kinds: [] }],
    cycles: [{ files: [0, 1] }],
    godfiles: [0],
    cochange: [{ a: 0, b: 1, count: 4 }],
  }
}

test('maps snapshot files and graph relationships into atlas node IDs', () => {
  const snapshot = makeSnapshot()
  const atlas = snapshotAtlas(snapshot)

  assert.equal(atlas.N.length, 3)
  assert.equal(atlas.N[0].name, 'src/entry.js')
  assert.equal(atlas.filesByPath.get('src/helper.js'), 1)
  assert.deepEqual(atlas.N[0].out, [1])
  assert.deepEqual(atlas.N[1].inn, [0])
  assert.deepEqual([...atlas.N[0].fwd], [1])
  assert.deepEqual([...atlas.N[1].rev], [0])
  assert.equal(atlas.E.length, 1)
  assert.equal(atlas.E[0].cy, true)
})

test('preserves analysis metrics and handles missing metrics', () => {
  const atlas = snapshotAtlas(makeSnapshot())

  assert.equal(atlas.N[0].cx, 5)
  assert.equal(atlas.N[0].ch, 12)
  assert.equal(atlas.N[0].tok, 42)
  assert.equal(atlas.N[0].h, 80)
  assert.ok(Math.abs(atlas.N[0].risk - 0.2) < 1e-12)
  assert.equal(atlas.N[2].cx, 0)
  assert.equal(atlas.N[2].risk, 0)
  assert.equal(atlas.god, 0)
  assert.deepEqual(atlas.CO, [{ a: 0, b: 1, w: 4 }])
  assert.equal(atlas.U.length, 3)
})

test('does not mutate the source snapshot', () => {
  const snapshot = makeSnapshot()
  const before = structuredClone(snapshot)

  snapshotAtlas(snapshot)

  assert.deepEqual(snapshot, before)
})
