# Dispatcher Cloud Check

Find AEM as a Cloud Service Dispatcher migration problems **before** Cloud Manager does.

Drop your dispatcher `src` folder into the page and get a list of known migration pitfalls, each with the file, line, a plain-English explanation and a fix. It runs entirely in your browser: your config is never uploaded.

## Use it

Open `index.html` in a browser (or serve the folder statically), then drop or choose your dispatcher `src` folder. Two built-in demos show a legacy AMS-style config and a clean Cloud-style config.

```bash
python -m http.server 8765   # optional: serve locally, then open http://localhost:8765
```

## What it checks

Rules come from Adobe's [AMS to AEM as a Cloud Service migration steps](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/content-delivery/ams-aem):

| ID | Severity | Check |
|---|---|---|
| CS001 | error | `LoadModule` (custom Apache modules are not allowed) |
| CS002 | warning | `/glob` used in filter rules |
| CS003 | warning | custom `/allowedClients` instead of the default invalidate include |
| CS004 | warning | hardcoded `/hostname` in a farm instead of `default_renders.any` |
| CS005 | error | absolute `Include` / `$include` paths |
| CS006 | error | `ams_*` files and references |
| CS007 | error | `conf/`, `conf.modules.d/`, `conf.d/*.conf`, `conf.d/whitelists/` |
| CS008 | error | farm files not named `*.farm` |
| CS009 | warning | `vhosts` folder instead of `virtualhosts` |
| CS010 | warning | legacy AMS files (`*_invalidate_allowed.any`, `base_rewrite.rules`, ...) |
| CS011 | error | legacy variables (`PUBLISH_DOCROOT`, `DISP_ID`, `PUBLISH_FORCE_SSL`, `PUBLISH_WHITELIST_ENABLED`) |
| CS012 | error | `<VirtualHost>` on a port other than 80 |
| CS013 | error | Windows pseudo-symlinks in `enabled_farms` / `enabled_vhosts` |
| CS014 | info | symlinks cannot be verified from a browser upload |
| CS015 | warning | AMS-only author / health / lc / flush farms or vhosts enabled |

## Limitations

- **Heuristic, not authoritative.** It does not contain Adobe's full Apache directive allowlist. Always confirm with the Dispatcher SDK: `validator full`.
- A browser upload follows symlinks, so only the Windows "text file" kind (CS013) can be detected.
- Rule coverage reflects the documentation at the time of writing. Issues and PRs welcome.

## Develop

No dependencies and no build step.

```bash
node test.js
```

The rules engine is `rules.js` (usable in the browser and Node). Input is `[{ path, content }]`; output is a list of findings.

## Disclaimer

Not affiliated with or endorsed by Adobe. Adobe and Adobe Experience Manager are trademarks of Adobe Inc.

## License

MIT
