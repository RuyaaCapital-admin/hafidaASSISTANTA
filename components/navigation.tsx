"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { BarChart3, MessageSquare, Settings } from "lucide-react"

const navigation = [
  { name: "Chart", href: "/chart", icon: BarChart3 },
  { name: "Agent", href: "/agent", icon: MessageSquare },
  { name: "Admin", href: "/admin/uploads", icon: Settings },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/chart" className="flex items-center space-x-2">
              <BarChart3 className="h-6 w-6" />
              <span className="font-bold text-xl">Hafid Assistanta</span>
            </Link>

            <div className="hidden md:flex items-center space-x-1">
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <Button
                    key={item.name}
                    variant={pathname.startsWith(item.href) ? "default" : "ghost"}
                    size="sm"
                    asChild
                  >
                    <Link href={item.href} className="flex items-center space-x-2">
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <ThemeToggle />

            {/* Mobile menu */}
            <div className="md:hidden flex items-center space-x-1">
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <Button
                    key={item.name}
                    variant={pathname.startsWith(item.href) ? "default" : "ghost"}
                    size="sm"
                    asChild
                  >
                    <Link href={item.href}>
                      <Icon className="h-4 w-4" />
                      <span className="sr-only">{item.name}</span>
                    </Link>
                  </Button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
