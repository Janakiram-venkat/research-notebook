// Save an on-screen SVG (a mind map or diagram) as a standalone .svg or .png file.
//
// On screen the drawings take some colours from CSS variables (so they follow the
// light/dark theme). A file has no stylesheet, so the clone is given the resolved
// colours and font of every element, plus a background, before it is written out.
// The result looks exactly like what is on screen in the current theme.

const STYLE_PROPS = ['fill', 'stroke', 'stroke-opacity', 'fill-opacity', 'opacity', 'font-family', 'font-size', 'font-weight']

function inlineComputedStyles(source, clone) {
  const src = [source, ...source.querySelectorAll('*')]
  const dst = [clone, ...clone.querySelectorAll('*')]
  src.forEach((el, i) => {
    const target = dst[i]
    if (!target || !(el instanceof SVGElement)) return
    const cs = getComputedStyle(el)
    for (const prop of STYLE_PROPS) {
      const v = cs.getPropertyValue(prop)
      if (v) target.style.setProperty(prop, v)
    }
  })
}

export function svgToString(svgEl, { background, padding = 0 } = {}) {
  const clone = svgEl.cloneNode(true)
  inlineComputedStyles(svgEl, clone)
  clone.querySelectorAll('[data-export="skip"]').forEach((el) => el.remove())
  const box = svgEl.viewBox?.baseVal
  const w = Math.ceil(box?.width || svgEl.getBoundingClientRect().width)
  const h = Math.ceil(box?.height || svgEl.getBoundingClientRect().height)
  const x = box?.x || 0
  const y = box?.y || 0
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('viewBox', `${x - padding} ${y - padding} ${w + padding * 2} ${h + padding * 2}`)
  clone.setAttribute('width', String(w + padding * 2))
  clone.setAttribute('height', String(h + padding * 2))
  clone.removeAttribute('style')
  clone.removeAttribute('class')
  if (background) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', String(x - padding))
    rect.setAttribute('y', String(y - padding))
    rect.setAttribute('width', String(w + padding * 2))
    rect.setAttribute('height', String(h + padding * 2))
    rect.setAttribute('fill', background)
    clone.insertBefore(rect, clone.firstChild)
  }
  return { markup: new XMLSerializer().serializeToString(clone), width: w + padding * 2, height: h + padding * 2 }
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function fileStem(text, fallback = 'drawing') {
  return (text || fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || fallback
}

function pageBackground() {
  return getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#FFFFFF'
}

export function downloadSvg(svgEl, stem) {
  const { markup } = svgToString(svgEl, { background: pageBackground(), padding: 12 })
  save(new Blob([markup], { type: 'image/svg+xml' }), `${stem}.svg`)
}

// Resolves when the file has been handed to the browser; rejects if drawing failed.
export function downloadPng(svgEl, stem, scale = 2) {
  const { markup, width, height } = svgToString(svgEl, { background: pageBackground(), padding: 12 })
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Could not create the image.')); return }
        save(blob, `${stem}.png`)
        resolve()
      }, 'image/png')
    }
    img.onerror = () => reject(new Error('Could not draw the image.'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  })
}
