import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bfxredmizrphggvsxjpk.supabase.co'
const supabaseKey = 'sb_publishable_CZsWb8CR6dqtmodzi8BlKQ_Z65fL_nM'

export const supabase = createClient(supabaseUrl, supabaseKey)