import { Coffee } from "lucide-react"
import { cn } from "@/lib/utils"

/** Placeholder logo. Swap the icon for your real CuccuPOS mark (e.g. an <img src="/logo.svg" />). */
export function Logo({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const light = tone === "light"
  return (
    <div className={cn("flex items-center gap-2.5 text-2xl font-bold tracking-tight", className)}>
      <span className={cn("grid size-10 place-items-center rounded-2xl shadow-md", light ? "bg-sidebar-foreground text-sidebar" : "bg-primary text-primary-foreground")}>
        <Coffee className="size-5" strokeWidth={2.5} />
      </span>
      <span className={light ? "text-sidebar-foreground" : "text-foreground"}>
        Cuccu<span className={light ? "text-foreground" : "text-primary"}>POS</span>
      </span>
    </div>
  )
}
