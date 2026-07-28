# Phase F accountant and legal validation checklist

Do not enable `kosovo_payroll_enabled` or production finalization until every
applicable item is approved and the evidence is attached to the release record.

- Confirm the current effective personal-income-tax brackets, thresholds,
  cumulative/fixed treatment, and rounding with a cited official source.
- Confirm employee and employer pension rates, contribution bases, exceptions,
  and effective dates.
- Confirm taxable and non-taxable treatment for every earning, allowance,
  reimbursement, benefit, deduction, advance, and correction type.
- Confirm new-hire, termination, unpaid absence, leave, sick leave, holiday,
  overtime, part-time, hourly, and daily proration policies.
- Confirm gross-contract and net-contract calculations with representative
  payroll examples and cents-level expected outputs.
- Confirm accounting mappings for salary expense, employer pension expense,
  employee pension payable, employer pension payable, personal income tax
  payable, other deductions payable, and net salary payable.
- Confirm branch, department, cost-centre, project, and employee-category
  allocation rules.
- Confirm approval stages, segregation of duties, reversal authority, and
  retention requirements.
- Confirm payslip mandatory fields, Albanian and English wording, employee
  delivery consent, secure retention, access logging, and revocation policy.
- Confirm generic bank export fields with each bank before claiming
  compatibility; store the bank specification/version used.
- Obtain an official current TAK statutory export/submission specification
  before enabling any official-format provider. Do not infer a format.
- Review legacy employee/payroll classifications and approve either historical
  reconstruction or cutover liabilities; never invent missing payroll history.
- Complete privacy, RLS, backup/restore, accountant acceptance, legal review,
  and production feature-flag approval.
