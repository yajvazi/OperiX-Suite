# OperiX HR E2E flows

- App: OperiX HR
- Path: `apps/hr-app`
- Standard: Maestro (real simulator/emulator only)
- QA data: dedicated non-production accounts/tenants only
- Latest execution: ENVIRONMENT_FAILURE

## Discovered routes

- `AdvancedSettings`
- `Approvals`
- `Attendance`
- `AttendanceMain`
- `Compliance`
- `ComplianceForm`
- `ContractTemplateEditor`
- `ContractTemplates`
- `Dashboard`
- `EmployeeDirectory`
- `EmployeeForm`
- `EmployeeVault`
- `EmployeesTab`
- `InvoiceTemplateSettings`
- `JoinRequests`
- `JoinTeam`
- `Leave`
- `LeaveRequests`
- `MainTabs`
- `ManageCompanies`
- `MoreHome`
- `MoreTab`
- `PaymentIntegrations`
- `Payroll`
- `PayrollDashboard`
- `PayrollDetail`
- `Performance`
- `Profile`
- `Recruitment`
- `Schedule`
- `Settings`
- `SettingsMain`
- `ShiftForm`
- `SignIn`
- `SignUp`
- `StripeDashboard`
- `TemplateEditor`

## Major user journey

1. Login
2. HR dashboard
3. Employee directory → create/update employee
4. Attendance/time
5. Leave request/approval
6. Payroll
7. Logout

## Flow requirements

- Use stable accessibility labels/test IDs following `<screen>-<element>-<action>`.
- Assert loading, empty, error, protected-route, and success states where they exist.
- Tag all created data with the QA namespace and clean only that data.
- Capture console/runtime/network failures as separate evidence.
- Do not run against production or use customer accounts.

## Current limitation

- No Maestro or Detox flow/configuration was discovered for this app.
