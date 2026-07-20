import { google } from 'googleapis'
import { readFileSync } from 'fs'

// Read .env.local
const env = readFileSync('.env.local', 'utf8')
const vars = {}
env.split('\n').forEach(line => {
  const idx = line.indexOf('=')
  if (idx > 0) {
    const k = line.slice(0, idx).trim()
    const v = line.slice(idx + 1).trim()
    vars[k] = v
  }
})

const SHEET_ID = vars.GOOGLE_SHEET_ID
const privateKey = vars.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

const users = [
  { name: 'Sarat',     email: 'sarat.chandra@superk.in',   hash: '$2b$12$F/RLZLKnMhfqmfsSkaOZy.gJ5cn2Re4WtZh6M.PiSptrJix92YFoW', role: 'admin' },
  { name: 'Sristy',    email: 'sristy@superk.in',           hash: '$2b$12$yulfBqMfapFdWKrsRGhVjenzyzBST0xc4trT.a9liMijFMTJIvXoW', role: 'admin' },
  { name: 'Harish',    email: 'harish.surapureddy@superk.in',hash: '$2b$12$3BtcXceOqlmgBf3zv4Jed.GKO78RtNVmHgS75KVhcRmUpl42NEaE2', role: 'user'  },
  { name: 'Mani Teja', email: 'mani.balanagu@superk.in',    hash: '$2b$12$Ft48zaCvW3O77cotwYulgevrhYuRhOYwH4zBANY4v4Q4rqbv6WeNC', role: 'user'  },
  { name: 'Yasaswi',   email: 'yasaswi@superk.in',          hash: '$2b$12$FfWgKdydzrPqvNQPJQptrOrPFCtc5EsHR.TqEQGdn2phn1iuy2oXC', role: 'user'  },
  { name: 'Shafi',     email: 'shafi@superk.in',            hash: '$2b$12$zwUscXPUh2D.oTUtWj0fvOzDg0vKQtz3MiqAjBbEXS1nkoz928Rjq', role: 'admin' },
  { name: 'Swetha',    email: 'swetha.b@superk.in',         hash: '$2b$12$zKROyzPil2GtZ1ql1HPFduumqFr8UoTRiJQ5OnIj.dF/9CkIEIX52', role: 'admin' },
  { name: 'Siva',      email: 'siva.gojjala@superk.in',     hash: '$2b$12$U4CrnMJbxErWuxV0ckdcvul64YIxzVfmfZX5BOd7y/.LGiq5g0fq.', role: 'admin' },
  { name: 'Sofia',     email: 'sofia.tanguturu@superk.in',  hash: '$2b$12$kyKY3S1mbIYyKFk6T8WF.OwAIPOyw1NvZJC/RpwYoRRYQxMx7wlie', role: 'admin' },
  { name: 'Neelavati', email: 'neelvathi.madduri@superk.in',hash: '$2b$12$Av7q7KygHWgQ2EYM6w6r5OFGu0ST27Sux2SSKuGlXzRyVe/PMdV9.', role: 'admin' },
  { name: 'Lalitha',   email: 'lalitha.saipeta@superk.in',  hash: '$2b$12$LoI5X3VGuSZffII.yLJswOtYnurFKZQqhTp7eS57vrmfAQTr3OVh.', role: 'admin' },
]

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: vars.GOOGLE_CLIENT_EMAIL,
    private_key: privateKey,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

const sheets = google.sheets({ version: 'v4', auth })

const rows = users.map((u, i) => [`USR-${Date.now() + i}`, u.name, u.email, u.hash, u.role])

const res = await sheets.spreadsheets.values.append({
  spreadsheetId: SHEET_ID,
  range: 'Users!A1',
  valueInputOption: 'RAW',
  insertDataOption: 'INSERT_ROWS',
  requestBody: { values: rows },
})

console.log(`✓ Added ${rows.length} users:`, res.data.updates?.updatedRange)
rows.forEach((r, i) => console.log(`  ${r[1]} (${r[2]}) — password: ${['Sarat@SuperK1','Sristy@SuperK1','Harish@SuperK1','Mani@SuperK1','Yasaswi@SuperK1','Shafi@SuperK1','Swetha@SuperK1','Siva@SuperK1','Sofia@SuperK1','Neelavati@SuperK1','Lalitha@SuperK1'][i]}`))
