import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

const TOKEN_KEY = 'token'
const USER_KEY = 'user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const u = localStorage.getItem(USER_KEY)
      return u ? JSON.parse(u) : null
    } catch {
      return null
    }
  })
  const [token, setTokenState] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [loading, setLoading] = useState(!!localStorage.getItem(TOKEN_KEY))

  const setToken = useCallback((t) => {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t)
      setTokenState(t)
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      setTokenState('')
      setUser(null)
    }
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password)
    setToken(data.access)
    setUser(data.user)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
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
        setUser(u)
        localStorage.setItem(USER_KEY, JSON.stringify(u))
      })
      .catch(() => setToken(''))
      .finally(() => setLoading(false))
  }, [token])

  const value = { user, token, loading, login, logout, isAuthenticated: !!token }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
