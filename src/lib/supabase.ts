// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://noxtfmasxlzgijwlreoz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5veHRmbWFzeGx6Z2lqd2xyZW96Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIwNjM3OSwiZXhwIjoyMDg2NzgyMzc5fQ.jKd4mH3hPfytu8RKY-ViPnrrP4Sbb1toFyvoqxdvpHQ',
)
