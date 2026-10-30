# Contributing

Thanks for helping. Please:

1. Open an issue first for large changes so we can agree on the approach.
2. Fork, create a branch, and keep each pull request focused on one change.
3. Run `npm run typecheck`, `npm test` and `npm run lint` before you push. Add tests for new logic.
4. Match the surrounding code style. Do not reformat unrelated files.
5. Do not include secrets, customer data or real personal data in code, tests, screenshots or issues.
6. Sign off your commits (`git commit -s`) to certify the [Developer Certificate of Origin](https://developercertificate.org/).
   By contributing you agree your work is licensed under the project licence (AGPL-3.0).

Money and tax code: amounts use the `@invoice-monorepo/money` decimal helpers. Never use floating-point
arithmetic for currency. Changes to VAT, accounting or payroll rules need a test and a short note on the source of the rule.

Translations: the app supports English and Albanian. Keep both in step when you add user-visible text.
