# Visual baselines

Store approved PNG baselines in a directory named for the discovered app id. Each screenshot should document the device, OS, locale, color scheme, and flow step in its filename, for example:

`operix-invoice/iphone-se-en-dashboard.png`

Normal QA runs only compare baselines. They do not approve or overwrite them. Use `test:visual:update` with `--human-approved` after reviewing the baseline, actual, and diff files.
