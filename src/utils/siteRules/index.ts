import { SiteRule } from '../../types/index.ts'

import workdayConfig from './workday.ts'
import leverConfig from './lever.ts'
import greenhouseConfig from './greenhouse.ts'
import icimsConfig from './icims.ts'
import ashbyConfig from './ashby.ts'
import bambooHrConfig from './bamboohr.ts'

export const siteRules: SiteRule[] = [
  workdayConfig(),
  leverConfig(),
  greenhouseConfig(),
  icimsConfig(),
  ashbyConfig(),
  bambooHrConfig(),
]
