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
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
            <MessageSquare size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">SuperK Support</h1>
            <p className="text-xs text-gray-500">WhatsApp Ticket Management</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{user.name || user.email}</p>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${roleColor[user.role]}`}>
              {roleIcon[user.role]} {roleLabel[user.role]}
            </span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
