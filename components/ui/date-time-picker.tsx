"use client"

import * as React from "react"
import { CalendarIcon, X } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type DateTimePickerProps = {
  value: Date | null
  onChange: (value: Date | null) => void
  placeholder?: string
  disabled?: boolean
  allowClear?: boolean
}

const setTimeOnDate = (source: Date, timeValue: string): Date => {
  const [hoursRaw, minutesRaw] = timeValue.split(":")
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  const next = new Date(source)
  next.setHours(Number.isFinite(hours) ? hours : 0)
  next.setMinutes(Number.isFinite(minutes) ? minutes : 0)
  next.setSeconds(0)
  next.setMilliseconds(0)
  return next
}

const toTimeString = (value: Date | null): string => {
  if (!value) return ""
  const hours = String(value.getHours()).padStart(2, "0")
  const minutes = String(value.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Selecionar data e horario",
  disabled,
  allowClear = false,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)

  const handleSelectDate = (selectedDate: Date | undefined) => {
    if (!selectedDate) return
    const next = new Date(selectedDate)
    if (value) {
      next.setHours(value.getHours())
      next.setMinutes(value.getMinutes())
    } else {
      next.setHours(0)
      next.setMinutes(0)
    }
    next.setSeconds(0)
    next.setMilliseconds(0)
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "dd/MM/yyyy HH:mm", { locale: ptBR }) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <div className="space-y-3">
            <Calendar mode="single" selected={value ?? undefined} onSelect={handleSelectDate} initialFocus />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Horario</p>
              <Input
                type="time"
                value={toTimeString(value)}
                onChange={(event) => {
                  if (!value) {
                    const now = new Date()
                    onChange(setTimeOnDate(now, event.target.value))
                    return
                  }
                  onChange(setTimeOnDate(value, event.target.value))
                }}
                disabled={disabled}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {allowClear ? (
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} disabled={disabled || !value}>
          <X />
          <span className="sr-only">Limpar data</span>
        </Button>
      ) : null}
    </div>
  )
}
