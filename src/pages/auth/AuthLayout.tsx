import type { ReactNode } from "react"
import { Logo } from "@/components/Logo"
import { Card } from "@/components/ui/card"

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-sm rounded-2xl p-7 shadow-xl">
        <div className="flex flex-col items-center gap-4">
          <Logo tone="dark" className="text-xl" />
          <h1 className="text-center text-lg font-semibold">{title}</h1>
        </div>
        <div className="mt-6">{children}</div>
      </Card>
    </div>
  )
}
