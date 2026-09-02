import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Stethoscope, Activity, Pill, Syringe, HeartPulse } from "lucide-react";

const ROLE_CHIPS = [
  { label: "Doctor", icon: "🩺" },
  { label: "Nurse", icon: "💉" },
  { label: "Admin", icon: "🏥" },
] as const;

const GRID_ICONS = [
  Stethoscope,
  HeartPulse,
  Activity,
  Pill,
  Syringe,
  Stethoscope,
  HeartPulse,
  Activity,
  Pill,
  Syringe,
  Stethoscope,
  HeartPulse,
];

export default function LoginPage() {
  return (
    <div className="flex min-h-screen w-full">
      {/* Left panel — hidden on mobile */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center relative overflow-hidden"
        style={{ backgroundColor: "#002444" }}
      >
        {/* Decorative medical icon grid */}
        <div className="absolute inset-0 grid grid-cols-4 gap-8 p-10 opacity-10 pointer-events-none select-none">
          {GRID_ICONS.map((Icon, i) => (
            <div key={i} className="flex items-center justify-center">
              <Icon className="h-10 w-10 text-white" />
            </div>
          ))}
        </div>

        {/* Brand content */}
        <div className="relative z-10 flex flex-col items-center gap-6 text-center px-12">
          {/* Logo mark */}
          <div
            className="flex items-center justify-center h-20 w-20 rounded-full border-2 border-white/30"
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
          >
            <HeartPulse className="h-10 w-10 text-white" />
          </div>

          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight">
              MediSync
            </h1>
            <p className="mt-2 text-base text-white/60">
              Intelligent care, seamlessly managed.
            </p>
          </div>

          {/* Secure AI Environment badge */}
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2 mt-4"
            style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
          >
            <ShieldCheck className="h-4 w-4 text-white/80" />
            <span className="text-sm text-white/80 font-medium">
              Secure AI Environment
            </span>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div
        className="flex flex-1 items-center justify-center px-6 py-12"
        style={{ backgroundColor: "#E8F3FC" }}
      >
        <div
          className="w-full max-w-md rounded-xl bg-white p-8 shadow-md"
        >
          {/* Headings */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="mt-1 text-sm text-gray-500">
              Sign in to your MediSync workspace
            </p>
          </div>

          {/* Supported roles — informational only; real role comes from Auth0 + DB */}
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Supported roles
            </p>
            <div className="flex gap-2 flex-wrap">
              {ROLE_CHIPS.map(({ label, icon }) => (
                <Badge
                  key={label}
                  variant="outline"
                  className="cursor-default select-none px-3 py-1 text-sm rounded-full"
                  style={{ borderColor: "#cbd5e1", color: "#64748b" }}
                >
                  <span className="mr-1" aria-hidden>
                    {icon}
                  </span>
                  {label}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Your role is assigned by your organization after sign-in — these
              chips are not selectable.
            </p>
          </div>

          {/* Sign in button */}
          <a href="/auth/login" className="block w-full">
            <Button
              className="w-full h-11 text-base font-semibold rounded-lg text-white"
              style={{ backgroundColor: "#0062a1" }}
            >
              Sign In with Auth0 →
            </Button>
          </a>

          {/* Quick workspace sign-in for testing */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
              Quick Workspace Login (Demo / Test)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <a
                href="/api/auth/dev-login?role=admin"
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-medium transition-colors shadow-2xs"
                id="dev-login-admin"
              >
                <span>🏥</span> Admin
              </a>
              <a
                href="/api/auth/dev-login?role=doctor"
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-medium transition-colors shadow-2xs"
                id="dev-login-doctor"
              >
                <span>🩺</span> Doctor
              </a>
              <a
                href="/api/auth/dev-login?role=nurse"
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border border-pink-200 bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-medium transition-colors shadow-2xs"
                id="dev-login-nurse"
              >
                <span>💉</span> Nurse
              </a>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-gray-400">
            Access is restricted to authorised staff
          </p>
        </div>
      </div>
    </div>
  );
}
