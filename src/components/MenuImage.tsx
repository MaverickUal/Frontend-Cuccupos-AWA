import { useState } from "react"
import { CupSoda } from "lucide-react"
import { cn } from "@/lib/utils"

export function MenuImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={cn("grid place-items-center bg-secondary text-primary", className)} role="img" aria-label={alt}>
        <CupSoda className="size-1/3" />
      </div>
    )
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn("object-cover", className)} />
}
