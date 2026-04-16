export function appendEventLog(text: string): void {
  const el = document.getElementById('event-log')
  if (!el) return

  const time = new Date().toLocaleTimeString()
  const existing = el.textContent ?? ''
  el.textContent = (existing ? existing + '\n' : '') + `[${time}] ${text}`

  const lines = el.textContent.split('\n')
  if (lines.length > 200) {
    el.textContent = lines.slice(-200).join('\n')
  }

  el.scrollTop = el.scrollHeight
}
