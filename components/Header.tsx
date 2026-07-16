'use client'

import { signOut } from 'next-auth/react'
import { MessageSquare, LogOut, Shield, Users, UserCircle } from 'lucide-react'
import { UserRole } from '@/lib/types'

const roleLabel: Record<UserRole, string> = {
  admin: 'Admin',
  executive: 'Executive',
  employee: 'Employee',
}

const roleIcon: Record<UserRole, React.ReactNode> = {
  admin: <Shield size={12} />,
  executive: <Users size={12} />,
  employee: <UserCircle size={12} />,
}

const roleColor: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  executive: 'bg-blue-100 text-blue-700',
  employee: 'bg-gray-100 text-gray-700',
}

export default function Header({ user }: { user: { name: string; email: string; role: UserRole } }) {
  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center shrink-0">
            <MessageSquare size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-gray-900">SuperK Support</h1>
            <p className="text-xs text-gray-500 hidden sm:block">WhatsApp Ticket Management</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="text-right">
            <p className="text-xs sm:text-sm font-medium text-gray-900 truncate max-w-[120px] sm:max-w-none">{user.name || user.email}</p>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${roleColor[user.role]}`}>
              {roleIcon[user.role]} <span className="hidden sm:inline">{roleLabel[user.role]}</span>
            </span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-2 py-1.5 sm:px-3 transition-colors"
          >
            <LogOut size={14} /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  )
}
