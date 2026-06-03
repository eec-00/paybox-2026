'use client'

import { createContext, useContext } from 'react'

interface AppContextValue {
  user: any
  profileName: string | null
  isAdminUser: boolean
  isDeveloper: boolean
  canCreate: boolean
  allowedModules: string[] | null
}

const defaultValue: AppContextValue = {
  user: null,
  profileName: null,
  isAdminUser: false,
  isDeveloper: false,
  canCreate: false,
  allowedModules: null,
}

export const AppContext = createContext<AppContextValue>(defaultValue)

export const useApp = () => useContext(AppContext)
