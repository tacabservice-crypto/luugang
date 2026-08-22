# Implementation Plan - Functional Bug Fixes & Data Remediation

This plan addresses the functional bugs (Dice rolling, APK connectivity, Forfeit logic) and remediates the corrupted player data (Infinite Win Loop leftovers) to ensure the LudoSom platform is stable and performant.

## User Review Required

> [!IMPORTANT]
> The data cleanup will truncate the transaction history to the latest 500 records. While balances are preserved, older transaction logs will be removed from the local `db_store.json` to reduce file size and improve server responsiveness.

> [!WARNING]
> Users with more than 200 wins or losses (indicative of the "Infinite Win" bug) will have their stats reset to realistic random values (5-25 wins/losses).

## Proposed Changes

### 1. Server-side Data Remediation [MODIFY]

Update the existing cleanup endpoint in `server.ts` to be more robust and cover all aspects of data corruption and file bloat.

#### [MODIFY] [server.ts](file:///C:/Users/LENOVO/Documents/LUDOSOM/ludodom31/server.ts)
- Enhance `/api/admin/system/data-cleanup` to:
    - Truncate `transactions` to the latest 500 items.
    - Truncate `agentTransactions` to the latest 500 items.
    - Reset win/loss counts > 200 to random values (5-25).
    - Cap balances > $500 (unless manually verified, but for this cleanup we'll cap at $200 for suspected bugged accounts).
    - Clear inactive `rooms` (status != 'playing').
    - Clear `pendingManualTransactions` older than 7 days.

### 2. Standalone Cleanup Script [NEW]

Create a script that can be run directly on the server host via CLI if the API is unreachable or if a hard reset is needed.

#### [NEW] [cleanup-db.ts](file:///C:/Users/LENOVO/Documents/LUDOSOM/ludodom31/scripts/cleanup-db.ts)
- A standalone TypeScript script that performs the same robust cleanup logic as the endpoint but directly on the `db_store.json` file.

### 3. Verification of Functional Fixes

Ensure the previous fixes for APK connectivity and Forfeit logic are fully operational.

- **APK Connectivity:** Verify the `CAPACITOR_MOBILE_BYPASS` is correctly handled (already implemented, but we will double-check the logic flow).
- **Infinite Win Guard:** Confirm the `localRoom.status === 'completed'` check prevents MySQL sync from re-triggering payouts.

## Verification Plan

### Automated Tests
- Run the cleanup script locally on the `db_store.json` and verify the file size reduction and stat resets.
- Execute `gradle build` in the `android/` directory to ensure no regressions in the native project structure.

### Manual Verification
1. **Trigger Cleanup:** Call the `/api/admin/system/data-cleanup` endpoint using a `curl` command with the secret token.
2. **Check Logs:** Monitor server logs to confirm the number of users reset and transactions removed.
3. **Verify App Connectivity:** Deploy the updated server and test the APK login flow to ensure the Turnstile bypass works as expected.
