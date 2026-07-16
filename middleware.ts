import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: { signIn: '/login' },
})

export const config = {
  matcher: ['/((?!login|api/auth|api/poll|api/cron|api/backfill|_next|favicon.ico).*)'],
}
