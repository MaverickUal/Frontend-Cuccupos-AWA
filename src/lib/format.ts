export const peso = (n: number) => "₱" + n.toLocaleString("en-PH", { maximumFractionDigits: 2 })

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

export const formatDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
