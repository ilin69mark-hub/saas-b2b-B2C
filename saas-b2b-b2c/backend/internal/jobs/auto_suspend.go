package jobs

import (
    "context"
    "log"

    "franchise-saas-backend/internal/services"
)

type AutoSuspendJob struct {
    svc *services.AdminService
}

func NewAutoSuspendJob(svc *services.AdminService) *AutoSuspendJob {
    return &AutoSuspendJob{svc: svc}
}

func (j *AutoSuspendJob) Run() {
    log.Println("Running Auto-Suspend Job...")
    ctx := context.Background()

    tenants, err := j.svc.GetTenantsOverdue(ctx)
    if err != nil {
        log.Printf("AutoSuspendJob: failed to get overdue tenants: %v", err)
        return
    }

    suspended := 0
    for _, t := range tenants {
        if err := j.svc.AutoSuspendTenant(ctx, t.ID); err != nil {
            log.Printf("AutoSuspendJob: failed to suspend tenant %s (%s): %v", t.ID, t.Name, err)
            continue
        }
        log.Printf("AutoSuspendJob: tenant %s (%s) suspended", t.ID, t.Name)
        suspended++
    }

    log.Printf("Auto-Suspend Job complete: %d tenants suspended", suspended)
}
