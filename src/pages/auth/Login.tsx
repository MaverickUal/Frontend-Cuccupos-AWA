import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useStore } from "@/store/AppStore"
import { AuthLayout } from "./AuthLayout"

export default function Login() {
  const { login } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  function submit(e: FormEvent) {
    e.preventDefault()
    setError("")
    if (!email.trim() || !password) return setError("Enter your email and password.")
    const res = login(email, password)
    if (!res.ok) return setError(res.error)
    toast.success(`Welcome back, ${res.user.name}`)
    navigate(res.user.role === "admin" ? "/admin/dashboard" : "/order", { replace: true })
  }

  return (
    <AuthLayout title="Sign in to your CuccuPOS account">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <Button type="submit" className="w-full">Sign in</Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        New here? <Link to="/register" className="font-bold text-primary hover:underline">Create an account</Link>
      </p>

      {/* Demo helpers. Remove when the real backend is connected. */}
      <div className="mt-5 rounded-xl bg-muted p-3 text-xs">
        <p className="mb-2 font-semibold">Demo accounts</p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" className="flex-1" onClick={() => { setEmail("customer@cuccu.test"); setPassword("password123") }}>Customer</Button>
          <Button type="button" size="sm" variant="secondary" className="flex-1" onClick={() => { setEmail("admin@cuccu.test"); setPassword("admin123") }}>Admin</Button>
        </div>
      </div>
    </AuthLayout>
  )
}
