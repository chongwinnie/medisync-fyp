"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  User,
  Bell,
  Sun,
  Shield,
  Moon,
  Monitor,
  Phone,
  Building2,
  Mail,
  Save,
  RefreshCw,
  Laptop,
  Globe,
  LogIn,
  Database,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Role } from "@/lib/auth/role-guard"
import { updateStaffProfileAction } from "@/lib/actions/settings"
import { KnowledgeBasePanel } from "@/components/settings/knowledge-base-panel"

type SettingsTab = "profile" | "notifications" | "appearance" | "security" | "knowledge_base"

interface NotificationPreference {
  id: string
  label: string
  description: string
  enabled: boolean
}

type ThemeOption = "light" | "dark" | "system"

export interface SettingsProfile {
  name: string
  email: string
  role: Role
  department: string
  phone: string
  specialization: string
}

const TABS: { id: SettingsTab; label: string; icon: typeof User; adminOnly?: boolean }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Appearance", icon: Sun },
  { id: "security", label: "Security", icon: Shield },
  { id: "knowledge_base", label: "Knowledge Base", icon: Database, adminOnly: true },
]

const INITIAL_NOTIFICATION_PREFS: NotificationPreference[] = [
  {
    id: "clinical",
    label: "Clinical Alerts",
    description: "Abnormal vitals, lab results, and flagged patient conditions.",
    enabled: true,
  },
  {
    id: "appointment",
    label: "Appointment Reminders",
    description: "Upcoming appointments, check-ins, and cancellations.",
    enabled: true,
  },
  {
    id: "inventory",
    label: "Inventory Alerts",
    description: "Low-stock warnings and supply delivery confirmations.",
    enabled: false,
  },
  {
    id: "staff",
    label: "Staff Updates",
    description: "Shift swaps, onboarding, and team announcements.",
    enabled: true,
  },
  {
    id: "system",
    label: "System Notifications",
    description: "Maintenance windows, updates, and platform announcements.",
    enabled: false,
  },
]

const THEME_OPTIONS: { id: ThemeOption; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
]

const ROLE_LABEL: Record<Role, string> = {
  doctor: "Doctor",
  nurse: "Nurse",
  admin: "Admin",
}

function initialsFromName(name: string, email: string): string {
  const source = name.trim() || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return source.slice(0, 2).toUpperCase() || "?"
}

function ProfileTab({ profile }: { profile: SettingsProfile }) {
  const [department, setDepartment] = useState(profile.department)
  const [phone, setPhone] = useState(profile.phone)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const initials = initialsFromName(profile.name, profile.email)
  const subtitle =
    profile.specialization || profile.department || ROLE_LABEL[profile.role]

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateStaffProfileAction({ department, phone })
      if (!result.success) {
        setError(result.error ?? "Failed to save profile")
        setSaved(false)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-5">
        <div className="flex items-center justify-center h-20 w-20 rounded-full bg-[#0062a1] text-white text-2xl font-bold select-none">
          {initials}
        </div>
        <div>
          <p className="text-sm text-gray-400 uppercase tracking-wide font-medium">
            {ROLE_LABEL[profile.role]}
          </p>
          <h2 className="text-xl font-bold text-[#002444] leading-tight">
            {profile.name || profile.email}
          </h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>

      <hr className="border-gray-100" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-gray-400" />
              Full Name
            </span>
          </label>
          <Input
            value={profile.name || "—"}
            readOnly
            className="bg-gray-50 text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">Managed by your Auth0 account.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-gray-400" />
              Email Address
            </span>
          </label>
          <Input
            value={profile.email || "—"}
            readOnly
            className="bg-gray-50 text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">Managed by your Auth0 account.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              Department
            </span>
          </label>
          <Input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Internal Medicine"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-gray-400" />
              Phone Number
            </span>
          </label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +1 (555) 000-0000"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div>
        <Button
          onClick={handleSave}
          disabled={isPending}
          className="gap-2 bg-[#0062a1] hover:bg-[#004e81] text-white"
        >
          {saved ? (
            <>
              <Save className="h-4 w-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {isPending ? "Saving…" : "Save Changes"}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPreference[]>(INITIAL_NOTIFICATION_PREFS)
  const [saved, setSaved] = useState(false)

  function toggle(id: string) {
    setPrefs((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    )
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-[#002444]">Notification Preferences</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Choose which notifications you receive from MediSync.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        {prefs.map((pref) => (
          <div
            key={pref.id}
            className="flex items-center justify-between gap-4 py-4 border-b border-gray-100 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{pref.label}</p>
              <p className="text-sm text-gray-500 mt-0.5">{pref.description}</p>
            </div>
            <Switch
              checked={pref.enabled}
              onCheckedChange={() => toggle(pref.id)}
              className="data-[state=checked]:bg-[#0062a1]"
            />
          </div>
        ))}
      </div>

      <div>
        <Button
          onClick={handleSave}
          className="gap-2 bg-[#0062a1] hover:bg-[#004e81] text-white"
        >
          {saved ? (
            <>
              <Save className="h-4 w-4" />
              Preferences Saved!
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Preferences
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function AppearanceTab() {
  const [theme, setTheme] = useState<ThemeOption>("system")

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-[#002444]">Theme</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Select your preferred colour scheme for MediSync.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTheme(id)}
            className={cn(
              "flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 transition-all",
              theme === id
                ? "border-[#0062a1] bg-blue-50/50"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
            )}
          >
            <div
              className={cn(
                "flex items-center justify-center h-12 w-12 rounded-full",
                theme === id ? "bg-[#0062a1]/10 text-[#0062a1]" : "bg-gray-100 text-gray-500"
              )}
            >
              <Icon className="h-6 w-6" />
            </div>
            <span
              className={cn(
                "text-sm font-medium",
                theme === id ? "text-[#0062a1]" : "text-gray-700"
              )}
            >
              {label}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
        <RefreshCw className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-amber-700">
          Theme switching is coming soon. Your preference will be saved for when this feature launches.
        </p>
      </div>
    </div>
  )
}

function SecurityTab() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <h3 className="text-base font-semibold text-[#002444] mb-1">Change Password</h3>
        <p className="text-sm text-gray-500 mb-4">
          Password managed by Auth0. Click below to update it securely through your identity provider.
        </p>
        <Link href="/auth/login?prompt=login">
          <Button className="gap-2 bg-[#0062a1] hover:bg-[#004e81] text-white">
            <LogIn className="h-4 w-4" />
            Update Password via Auth0
          </Button>
        </Link>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <h3 className="text-base font-semibold text-[#002444] mb-4">Active Sessions</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-[#0062a1]/10 flex-shrink-0">
            <Laptop className="h-5 w-5 text-[#0062a1]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-800">Current browser session</p>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Current
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
              <Globe className="h-3 w-3" />
              <span>Managed via Auth0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SettingsPageClient({ profile }: { profile: SettingsProfile }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile")

  const tabContent: Record<SettingsTab, React.ReactNode> = {
    profile: <ProfileTab profile={profile} />,
    notifications: <NotificationsTab />,
    appearance: <AppearanceTab />,
    security: <SecurityTab />,
    knowledge_base: <KnowledgeBasePanel />,
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[#002444]">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account preferences and security.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav className="flex flex-row gap-1 lg:flex-col lg:w-48 flex-shrink-0 bg-white rounded-xl shadow-sm p-2 border border-gray-100">
          {TABS.filter((t) => !t.adminOnly || profile.role === "admin").map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left",
                activeTab === id
                  ? "bg-[#0062a1] text-white"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1 bg-white rounded-xl shadow-sm p-6 border border-gray-100 min-h-96">
          {tabContent[activeTab]}
        </div>
      </div>
    </div>
  )
}
