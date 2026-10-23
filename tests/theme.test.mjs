import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const root = css.match(/:root\s*\{([^}]+)\}/)[1]
const tokens = new Map(
  [...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
)

function colour(name) {
  const value = tokens.get(name)
  assert.ok(value, `Missing theme token: ${name}`)
  if (/^#[\da-f]{6}$/i.test(value)) {
    return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16)).concat(1)
  }
  assert.match(value, /^rgba?\([\d.,\s]+\)$/, `Unsupported colour: ${name}`)
  const channels = value.slice(value.indexOf('(') + 1, -1).split(',').map(Number)
  return channels.length === 3 ? channels.concat(1) : channels
}

function blend(foreground, background) {
  const alpha = foreground[3]
  return foreground.slice(0, 3).map((value, index) => value * alpha + background[index] * (1 - alpha)).concat(1)
}

function background(layers) {
  const [base, ...overlays] = layers.map(colour)
  assert.equal(base[3], 1, 'The base surface must be opaque')
  return overlays.reduce((result, overlay) => blend(overlay, result), base)
}

function luminance(rgb) {
  const [red, green, blue] = rgb.slice(0, 3).map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground, surface) {
  const values = [luminance(foreground), luminance(surface)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('light mode is the default with consistently light page, panel, and overlay surfaces', () => {
  assert.match(root, /color-scheme:\s*light\s*;/)
  for (const token of ['--ink', '--surface', '--surface-muted', '--surface-raised', '--ink-overlay', '--topbar-overlay', '--code-surface']) {
    assert.ok(luminance(colour(token)) > 0.85, `${token} is no longer a light surface`)
  }
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  assert.ok(html.includes(`name="theme-color" content="${tokens.get('--ink')}"`))
})

test('the bundled display font is selected by the application root', () => {
  assert.match(main, /@fontsource-variable\/manrope\/wght\.css/)
  assert.match(root, /font-family:\s*"Manrope Variable"/)
})

// Token-level checks, not a substitute for browser-rendered accessibility tests.
test('light theme text colours meet WCAG AA on representative component backgrounds', () => {
  assert.equal(contrast([0, 0, 0], [255, 255, 255]), 21)
  const pairs = [
    ['page text', '--cream', ['--ink']],
    ['panel text', '--cream-soft', ['--surface']],
    ['sidebar text', '--cream-soft', ['--ink-overlay']],
    ['helper text', '--muted', ['--surface']],
    ['metadata', '--muted-dark', ['--surface-muted']],
    ['selected row metadata', '--muted-dark', ['--surface', '--cobalt-dim']],
    ['selected row branch', '--muted', ['--surface', '--cobalt-dim']],
    ['section label', '--cobalt-strong', ['--surface']],
    ['branch chip', '--cobalt-strong', ['--surface', '--cobalt-faint']],
    ['primary action', '--on-accent', ['--cobalt']],
    ['primary action hover', '--on-accent', ['--cobalt-bright']],
    ['secondary action', '--cream-soft', ['--surface', '--cobalt-faint']],
    ['disabled action', '--muted-dark', ['--surface-muted']],
    ['passed badge', '--success', ['--surface', '--success-soft']],
    ['failed badge', '--rose', ['--surface', '--rose-soft']],
    ['running badge', '--amber', ['--surface', '--amber-soft']],
    ['queued badge', '--amber', ['--surface', '--amber-faint']],
    ['passed badge in selection', '--success', ['--surface', '--cobalt-dim', '--success-soft']],
    ['failed badge in selection', '--rose', ['--surface', '--cobalt-dim', '--rose-soft']],
    ['passed summary metadata', '--muted-dark', ['--surface', '--success-surface']],
    ['running summary metadata', '--muted-dark', ['--surface', '--amber-surface']],
    ['failed summary metadata', '--muted-dark', ['--surface', '--rose-surface']],
    ['form error', '--rose', ['--surface']],
    ['suggested change', '--amber', ['--code-surface']],
    ['resolved icon', '--surface', ['--success']],
    ['toast text', '--cream', ['--ink-overlay']],
  ]
  for (const [label, foreground, layers] of pairs) {
    const surface = background(layers)
    const ratio = contrast(blend(colour(foreground), surface), surface)
    assert.ok(ratio >= 4.5, `${label}: ${ratio.toFixed(2)}:1 is below 4.5:1`)
  }
})

test('focus and state icons remain distinct against light surfaces', () => {
  for (const foreground of ['--cobalt-strong', '--success', '--amber', '--rose']) {
    for (const surface of ['--ink', '--surface', '--surface-muted']) {
      assert.ok(contrast(colour(foreground), colour(surface)) >= 3, `${foreground} on ${surface} is below 3:1`)
    }
  }
})
