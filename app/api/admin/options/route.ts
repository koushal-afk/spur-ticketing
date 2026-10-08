import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOptions, setOptions, OPTION_LISTS, OptionList } from '@/lib/sheets'

const isList = (v: unknown): v is OptionList => typeof v === 'string' && v in OPTION_LISTS

async function isAdmin() {
  const session = await getServerSession(authOptions)
  return (session?.user as unknown as { role?: string } | undefined)?.role === 'admin'
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const lists = await Promise.all(
    (Object.keys(OPTION_LISTS) as OptionList[]).map(async key => ({
      key,
      label: OPTION_LISTS[key],
      values: await getOptions(key),
    })),
  )
  return NextResponse.json({ lists })
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { list, values } = await req.json()
  if (!isList(list)) return NextResponse.json({ error: 'Unknown list.' }, { status: 400 })
  if (!Array.isArray(values) || values.some(v => typeof v !== 'string')) {
    return NextResponse.json({ error: 'Values must be a list of text.' }, { status: 400 })
  }
  if (!values.some((v: string) => v.trim())) {
    return NextResponse.json({ error: 'Keep at least one option.' }, { status: 400 })
  }
  const saved = await setOptions(list, values)
  return NextResponse.json({ values: saved })
}
