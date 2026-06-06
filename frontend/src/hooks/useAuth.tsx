import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/client'

interface User {
  id: string
  email: string
  full_name?: string
  profile_picture_url?: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (token: string, user: User, tenantId: string) => void
  logout: () => void
  refreshUser: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = async () => {
    try {
      const res = await authApi.me()
      setUser(res.data)
    } catch {
      setUser(null)
      localStorage.removeItem('token')
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      refreshUser().finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = (token: string, userData: User, tenantId: string) => {
    localStorage.setItem('token', token)
    localStorage.setItem('tenant_id', tenantId)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('tenant_id')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: !!user, isLoading, login, logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login', { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-pulse text-slate-500 text-sm">Loading...</div>
      </div>
    )
  }
  if (!isAuthenticated) return null
  return <>{children}</>
}
