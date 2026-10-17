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
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError("")
    if (!email.trim() || !password) return setError("Enter your email and password.")
    setLoading(true)
    const res = await login(email, password)
    setLoading(false)
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
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        New here? <Link to="/register" className="font-bold text-primary hover:underline">Create an account</Link>
      </p>
    </AuthLayout>
  )
}
