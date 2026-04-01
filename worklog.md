---
## Task ID: 1 - api-routes
### Work Task
Create all 13 API route files for the RemoteAdmin v4 admin panel backend.

### Work Summary
Created all 13 API route files with production-quality TypeScript code, proper error handling, and RESTful design:

**Auth Routes:**
1. `src/app/api/auth/login/route.ts` — POST login with credential verification, 2FA flow support, audit logging
2. `src/app/api/auth/totp/route.ts` — POST TOTP code verification with audit logging for success/failure
3. `src/app/api/auth/setup-totp/route.ts` — POST generates TOTP secret + URI, PUT verifies code and enables 2FA

**Admin User Routes:**
4. `src/app/api/users/route.ts` — Full CRUD: GET (list without passwords), POST (create with validation), PUT (update with duplicate checks), DELETE (prevents deleting last superadmin)

**Agent Routes:**
5. `src/app/api/agents/route.ts` — GET lists all agents with latest metric and ticket/installation counts
6. `src/app/api/agents/[id]/route.ts` — GET single agent with full metrics history, tickets, and installations

**Store Routes:**
7. `src/app/api/store/route.ts` — Full CRUD for store apps with installation counts, field validation, and allowed-field filtering on update

**Ticket Routes:**
8. `src/app/api/tickets/route.ts` — GET with status/priority query filters and reply counts, POST creates ticket replies
9. `src/app/api/tickets/[id]/route.ts` — GET with full replies, PUT updates status (with validation), DELETE

**Dashboard Route:**
10. `src/app/api/dashboard/route.ts` — GET returns aggregated stats: agent counts, ticket counts by status, store stats, avg CPU/memory from latest metrics, and recent audit logs. Uses Promise.all for parallel queries and raw SQL for latest-per-agent metrics.

**Utility Routes:**
11. `src/app/api/settings/route.ts` — GET returns key-value pairs, PUT uses upsert in a transaction for batch updates
12. `src/app/api/audit/route.ts` — GET with pagination (limit/offset), includes user info, returns total count
13. `src/app/api/updates/route.ts` — GET lists agent updates, POST creates new update records

All routes use NextRequest/NextResponse, proper try/catch error handling, input validation, and the existing db/crypto utilities. ESLint passes with zero errors.
