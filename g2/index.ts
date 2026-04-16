import { createDemoActions } from './main'
import type { AppModule } from '../_shared/app-types'

export const app: AppModule = {
  id: 'demo',
  name: 'G2 Demo',
  connectLabel: 'Connect',
  actionLabel: 'Next demo',
  initialStatus: 'Demo ready',
  createActions: createDemoActions,
}

export default app
