import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { api } from '../api'

interface User {
  id: number
  username: string
  role: string
}

interface AuthContextValue {
  user: User | null
  token: string
  loading: boolean
  login: (username: string, password: string) => Promise<User>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'token'
const REFRESH_KEY = 'refreshToken'
const USER_KEY = 'user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const u = localStorage.getItem(USER_KEY)
      return u ? JSON.parse(u) : null
    } catch {
      return null
    }
  })
  const [token, setTokenState] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [loading, setLoading] = useState(!!localStorage.getItem(TOKEN_KEY))

  const setToken = useCallback((t: string) => {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t)
      setTokenState(t)
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)
      localStorage.removeItem(USER_KEY)
      setTokenState('')
      setUser(null)
    }
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<User> => {
    const data = await api.login(username, password) as { access: string; refresh?: string; user: User }
    setToken(data.access)
    if (data.refresh) localStorage.setItem(REFRESH_KEY, data.refresh)
    setUser(data.user)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    return data.user
  }, [setToken])

  const logout = useCallback(() => {
    setToken('')
  }, [setToken])

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    api.me()
      .then((u) => {
        const parsed = u as unknown as User
        setUser(parsed)
        localStorage.setItem(USER_KEY, JSON.stringify(parsed))
      })
      .catch(() => setToken(''))
      .finally(() => setLoading(false))
  }, [token, setToken])

  const value: AuthContextValue = { user, token, loading, login, logout, isAuthenticated: !!token }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
