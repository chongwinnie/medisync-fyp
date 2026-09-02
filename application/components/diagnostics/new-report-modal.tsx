"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createDiagnosticReportAction } from "@/lib/actions/diagnostics"

interface NewReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: Array<{ id: string; name: string; patient_code: string }>
}

export function NewReportModal({
  open,
  onOpenChange,
  patients,
}: NewReportModalProps) {
  const router = useRouter()
  const [patientId, setPatientId] = useState("")
  const [reportType, setReportType] = useState("")
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [isAiAssisted, setIsAiAssisted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!patientId || !reportType || !title) {
      setError("Please fill in required fields")
      return
    }

    setSubmitting(true)
    setError(null)

    const result = await createDiagnosticReportAction({
      patientId,
      reportType,
      title,
      notes: notes || undefined,
      aiAssisted: isAiAssisted,
    })

    setSubmitting(false)
    if (!result.success) {
      setError(result.error ?? "Failed to create report")
      return
    }

    handleOpenChange(false)
    router.refresh()
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setPatientId("")
      setReportType("")
      setTitle("")
      setNotes("")
      setIsAiAssisted(false)
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Diagnostic Report</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label>Patient</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select patient..." />
              </SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.name} ({patient.patient_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-type">Report Type</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger id="report-type" className="w-full">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lab">Lab</SelectItem>
                <SelectItem value="imaging">Imaging</SelectItem>
                <SelectItem value="pathology">Pathology</SelectItem>
                <SelectItem value="radiology">Radiology</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Report title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes or clinical context..."
              className="resize-none min-h-20"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">AI Assisted</p>
              <p className="text-xs text-muted-foreground">
                Enable AI analysis for this report
              </p>
            </div>
            <Switch
              checked={isAiAssisted}
              onCheckedChange={setIsAiAssisted}
              aria-label="AI Assisted toggle"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="border-t-0 bg-transparent p-0 -mx-0 -mb-0 mt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              style={{ backgroundColor: "#0062a1", color: "#fff" }}
            >
              {submitting ? "Creating..." : "Request Report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
