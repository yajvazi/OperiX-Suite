# Mobile visual regression fixtures

These flows use Maestro `assertScreenshot` against the checked-in baselines under `baselines/<device>/<language>/`.

The normal visual command is read-only. It must fail when a baseline is missing or the rendered screen exceeds the configured comparison tolerance. Baselines are approved only by the explicit update command:

```sh
npm run test:visual:update --workspace=operix-invoice
```

Set `VISUAL_DEVICE=small-iphone|large-iphone` and `VISUAL_LANGUAGE=en|sq` to approve one simulator/language matrix cell at a time. The command requires the same isolated non-production E2E environment as the device flows. Never run it against production.
