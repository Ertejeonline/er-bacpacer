import { createBacpacerActions } from './main'
import type { AppModule } from '../_shared/app-types'

export const app: AppModule = {
  id: 'bacpacer',
  name: 'BACpacer',
  connectLabel: 'Connect',
  actionLabel: 'Start',
  resetLabel: 'Reset Drinks',
  initialStatus: 'BACpacer ready',
  createActions: createBacpacerActions,
}

export default app
