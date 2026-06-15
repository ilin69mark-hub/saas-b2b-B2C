package jobs

import (
    "context"
    "log"

    "franchise-saas-backend/internal/services"
)

type AutoInvoiceJob struct {
    svc *services.AdminService
}

func NewAutoInvoiceJob(svc *services.AdminService) *AutoInvoiceJob {
    return &AutoInvoiceJob{svc: svc}
}

func (j *AutoInvoiceJob) Run() {
    log.Println("Running Auto-Invoice Job...")
    ctx := context.Background()

    settings, err := j.svc.GetBillingSettings()
    if err != nil {
        log.Printf("AutoInvoiceJob: failed to get settings: %v", err)
        return
    }

    daysBeforeDue, ok := settings["autoInvoiceDays"].(int)
    if !ok || daysBeforeDue <= 0 {
        daysBeforeDue = 3
    }

    tenants, err := j.svc.GetTenantsDueForInvoice(ctx, daysBeforeDue)
    if err != nil {
        log.Printf("AutoInvoiceJob: failed to get tenants: %v", err)
        return
    }

    created := 0
    for _, t := range tenants {
        if err := j.svc.AutoCreateInvoice(ctx, t.ID, t.Price, t.PaidUntil); err != nil {
            log.Printf("AutoInvoiceJob: failed to create invoice for tenant %s: %v", t.ID, err)
            continue
        }
        created++
    }

    log.Printf("Auto-Invoice Job complete: %d invoices created", created)
}
