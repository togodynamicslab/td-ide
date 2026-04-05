export function getXtermThemeColors(): Record<string, string> {
  const style = getComputedStyle(document.documentElement)
  const toHex = (name: string): string => {
    const val = style.getPropertyValue(name).trim()
    if (!val) return '#0f0f17'
    const [r, g, b] = val.split(' ').map(Number)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }
  return {
    background: toHex('--td-bg'),
    foreground: toHex('--td-text'),
    cursor: toHex('--td-accent'),
    cursorAccent: toHex('--td-bg'),
    selectionBackground: toHex('--td-hover'),
    selectionForeground: toHex('--td-text')
  }
}
