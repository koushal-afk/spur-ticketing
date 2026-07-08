// One-off script: converts date columns (K=created_at, L=last_active_at, M=updated_at)
// from IST string format ("01 Jan 2025, 10:30 am") or ISO strings to Unix epoch seconds.
import { google } from 'googleapis'
import { JWT } from 'google-auth-library'

const SHEET_ID = '17tbKUYknOSzQ_zf5GKcOlUfep0YDr4XvimMxi3v13l8'
const SHEET_NAME = 'Tickets'

const auth = new JWT({
  email: 'spur-ticketing-tool@aqueous-tesla-289310.iam.gserviceaccount.com',
  key: `-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC3O6s7nwf6Sq2j\nA6TPaNX1XE8W2xgEBH/t9/LcQCGhed/slusVe9nuQNk9AnymT8b6r+tcP8chWkSF\nFoxSnc57YW4F3Fromlg8qoZT7b0OHNAqgrAq8iG+1LdOiNciDxYJWw7FjdeJjlmA\nBnG4W0C81EWFQsa00PGlO31dzIBTtaUBDC2C1Qq2bJa6wCUZllJTanpTtNhUNWKq\n68g17CztH1LpoUBmjbCgMNuHXVvHLwVEQp50ZlqmQyB77gurUEDs/wh4toMncLe2\ns5WsCIX4i+XLIqHKT5oyFItnPQUw2Y9FlFoHPOCJdX0C0aSxz6GSyn/m+yeg+FWH\n4bKzz1UVAgMBAAECggEABE2HaOAELPGCAFj+jsxUce2YAd5lQvrkEi+HaXqsD4Gw\nK3sjzB5bcMffEhqz2Kf48TweV807nOHkyAdOhkYkaitQjRyumdW+CraqbuAfV2x/\nyu/EuU10U2nlYBfAjZEzIEceIq+BBz7rhSEhnIWwEH8fntCBoA9kDVBHUmOSA+Uu\n6aNOaYaaWR99MHoR2y1p5Hj//8LaNeOFBfnlW3O9nNIfuevwIdjP9m2Jyap7Ktv3\n4W5WQROEszZzPnqOQHwfwqDzO2vlalugvhjd9NOaRdsfpVPkfUmMp93A0cOZnd1r\n1P78CzPcZaE2e5FfLmKh28pCT3GrC+J+JAWBbw0f5QKBgQDlDIgLrV72fAJakRA4\n8pWWH3rJai8HXRPSxpWyfLPH35l6/90Z1dRx92ZwCxAfLdZ7na9Lq3dsewIBwlIU\nGE/P3ZNi8wYrABZdFGP7ydozOniEWEpUwRfE7JXJwy4aK5k3G8OFVltfMqA0OvRk\n6heMSNDCoPrrZdQds6HyJKWjFwKBgQDMyw+EqzU6CIoe5HInfslU7G1d8oeml1z1\n8X2eZgh6QE0HpUoL/IW14u1Q1j91Q9LXmTthhUUh8iyVgUCwtLThtvmPK602Auq4\n1EdGblBoH9GXmdh/aFvwUOeaoX5NwAv/RHYAaF8o7hpMJN+eoqfoTnJ8naqnbfPO\n8r+X4ROUswKBgAvNboEziM4oq7JhATX+Agk/TANu7kdx22CkDPiqhlUJR45X+tum\n8hCBUAz79PO2V/P8txiuGDRFzl+q1LHmYs5yO3MA1NOIaJ6ZO2GxEAZNwAIJzqK5\nZHEoQ7umzAxbLMTzMEsBnSm1oR2v4AIHMflvkxpEU0mn8JsrM3AXxVU3AoGBAMuE\nrSpSHrZKkEC9FDjtxdUQlGt9v5Mt7yM3V3hXu+sKBcMoXxrkXFjyaJciI7Q8r8a0\nsA9tKtPeYLI+3fP90ZhSh1XhuOPpKCyAQUjcDio8HMVFDaMoKd37+P5xqRxJU2Le\nPUqQbqk1Xor3RgfXa3fwpdPzuAllupqaIQ8ljZkDAoGAMIpGZs+dX3YZ1/vTZVea\nD7qJCSiTs92uWyv9+QDR7w0sNPRkkmIUu66hg6Os2g8mT2tpMqvzye4TiujSa+fL\nwJpeY7MhUHcKWtjLLwMuGpnIhzWhnwfpfJP+TnlRDwP4mJ6WOThIJXd0LUsgiiPG\nnrvFm2xZRiWwJncMgjvtntM=\n-----END PRIVATE KEY-----\n`,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

// Parse whatever date format is currently in the sheet → epoch seconds
function parseToEpoch(val) {
  if (!val || val === '') return ''
  // Already a number (epoch) — leave it
  const asNum = Number(val)
  if (!isNaN(asNum) && asNum > 1_000_000_000) return asNum

  // IST locale string: "01 Jan 2025, 10:30 am" or "01-Jan-2025 10:30:00 AM"
  // new Date() handles most ISO strings and many locale strings; for the IST
  // formatted strings from toLocaleString we treat them as IST (UTC+5:30)
  const d = new Date(val)
  if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000)

  // Try replacing comma and converting "01 Jan 2025, 10:30 am" manually
  const cleaned = val.replace(',', '')
  const d2 = new Date(cleaned)
  if (!isNaN(d2.getTime())) return Math.floor(d2.getTime() / 1000)

  return '' // unparseable — leave blank
}

async function run() {
  const sheets = google.sheets({ version: 'v4', auth })

  // Read all rows (data starts at row 2)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:M`,
  })

  const rows = res.data.values ?? []
  console.log(`Read ${rows.length} rows`)

  // Columns K(10), L(11), M(12) are the date columns (0-indexed)
  const DATE_COLS = [10, 11, 12]
  let changed = 0

  // Build batch update data — only send the 3 date columns per row
  const data = []
  rows.forEach((row, i) => {
    const sheetRow = i + 2 // row 2 onwards
    const converted = DATE_COLS.map(col => parseToEpoch(row[col]))
    const original = DATE_COLS.map(col => row[col] ?? '')

    const needsUpdate = converted.some((v, j) => String(v) !== String(original[j]))
    if (needsUpdate) {
      data.push({
        range: `${SHEET_NAME}!K${sheetRow}:M${sheetRow}`,
        values: [converted],
      })
      changed++
    }
  })

  console.log(`${changed} rows need updating`)

  if (data.length === 0) {
    console.log('Nothing to do.')
    return
  }

  // Batch update in chunks of 100 to stay within API limits
  const CHUNK = 100
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK)
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: chunk },
    })
    console.log(`Updated rows ${i + 1}–${Math.min(i + CHUNK, data.length)}`)
  }

  console.log('Migration complete.')
}

run().catch(e => { console.error(e); process.exit(1) })
