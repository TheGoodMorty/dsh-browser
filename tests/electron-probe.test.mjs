import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * The Electron-binary probe used to be cached for the whole host lifetime —
 * including a NEGATIVE result. Since provider selection also happens once per
 * DSH process, an Electron that arrived later (`npm i electron`, or the package
 * postinstall that downloads the binary) could never be picked up without a
 * DSH restart: every browser call answered "no usable browser provider is
 * registered" even though the binary was now on disk.
 *
 * The probe window is read at module load, hence the env assignment above the
 * dynamic import. The third constructor argument is the probe seam.
 */
process.env.DSH_BROWSER_PROBE_RETRY_MS = '30'
const { RemoteElectronViewHost } = await import('../lib/browser-electron/remote-host.js')

const settle = (ms) => new Promise(resolve => setTimeout(resolve, ms))

test('a failed Electron probe expires instead of poisoning the process', async () => {
  let scans = 0
  let binaryOnDisk = false
  const host = new RemoteElectronViewHost('host-main.js', undefined, () => {
    scans++
    if (!binaryOnDisk) throw new Error('Electron binary not found')
  })

  assert.equal(host.available(), false)
  assert.equal(scans, 1)
  // Within the retry window the cached answer is reused — no scan per call.
  assert.equal(host.available(), false)
  assert.equal(scans, 1)

  // Once the window passes, the search runs again: a late-installed Electron
  // heals the provider on its own.
  binaryOnDisk = true
  await settle(40)
  assert.equal(host.available(), true)
  assert.equal(scans, 2)

  // A success is kept, so the hot path never scans again.
  await settle(40)
  assert.equal(host.available(), true)
  assert.equal(scans, 2)
})
