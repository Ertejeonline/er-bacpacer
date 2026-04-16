import type { AppModule } from '../_shared/app-types'

function updateStatus(text: string) {
  console.log(`[ui] ${text}`)
  const el = document.getElementById('status')
  if (el) el.textContent = text
}

async function boot() {
  const module = await import('../g2/index')
  const app: AppModule = module.app ?? module.default

  const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement | null
  const actionBtn = document.getElementById('actionBtn') as HTMLButtonElement | null

  document.title = `${app.name} \u2013 Even G2`
  updateStatus(app.initialStatus ?? `${app.name} app ready`)

  const actions = await app.createActions(updateStatus)

  connectBtn?.addEventListener('click', async () => {
    connectBtn.disabled = true
    try { await actions.connect() }
    catch (e) { console.error(e); updateStatus('Connect failed') }
    finally { connectBtn.disabled = false }
  })

  actionBtn?.addEventListener('click', async () => {
    actionBtn.disabled = true
    try { await actions.action() }
    catch (e) { console.error(e); updateStatus('Action failed') }
    finally { actionBtn.disabled = false }
  })

  void actions.connect().catch((e) => {
    console.error('[app-loader] auto-connect failed', e)
  })
}

void boot().catch((e) => {
  console.error('[app-loader] boot failed', e)
  updateStatus('App boot failed')
})
