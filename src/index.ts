import { initSentry } from './utils/instrument'

// Initialize Sentry BEFORE other imports for proper instrumentation
initSentry()

import { Lifecycle } from '@well-known-components/interfaces'
import { initComponents } from './components'
import { main } from './service'

// This file is the program entry point, it only calls the Lifecycle function
void Lifecycle.run({ main, initComponents })
