/*
 * Dispatcher Cloud-readiness rules engine.
 * Pure JS, no dependencies. Works in the browser (window.DispatcherRules) and Node (module.exports).
 *
 * Input:  [{ path: 'conf.d/available_vhosts/default.vhost', content: '...' }, ...]
 * Output: [{ id, severity, file, line, title, detail, fix, source }]
 *
 * Rules are derived from Adobe's published migration steps:
 * https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/content-delivery/ams-aem
 * This is NOT a replacement for Adobe's own validator (`validator full`), which holds the full
 * Apache directive allowlist.
 */
(function (root) {
  'use strict';

  const DOCS = {
    migrate: 'https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/content-delivery/ams-aem',
    overview: 'https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/content-delivery/disp-overview',
  };
  const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };
  const RELEVANT = /^(conf|conf\.d|conf\.dispatcher\.d|conf\.modules\.d|opt-in)\//;
  const LEGACY_VARS = {
    PUBLISH_DOCROOT: 'Rename to DOCROOT.',
    DISP_ID: 'Remove the section that references DISP_ID.',
    PUBLISH_FORCE_SSL: 'Remove the section that references PUBLISH_FORCE_SSL.',
    PUBLISH_WHITELIST_ENABLED: 'Remove the section that references PUBLISH_WHITELIST_ENABLED.',
  };

  // Strip everything before the first conf*/ segment so uploads of a parent folder still work.
  function normalizePath(p) {
    p = String(p).replace(/\\/g, '/');
    const m = p.match(/(^|\/)(conf\.dispatcher\.d|conf\.d|conf\.modules\.d|conf|opt-in)\//);
    return m ? p.slice(m.index + m[1].length) : p;
  }

  const basename = (p) => p.slice(p.lastIndexOf('/') + 1);
  const isComment = (line) => /^\s*#/.test(line);

  // Per line, is the line inside a `/filter { ... }` block? Brace-depth tracking, strings ignored.
  function filterContext(lines) {
    const stack = [];
    return lines.map((raw) => {
      const inFilter = stack.includes('filter');
      const line = raw.replace(/"[^"]*"/g, '""').replace(/#.*$/, '');
      const re = /\/(\w+)\s*\{|\{|\}/g;
      let m;
      while ((m = re.exec(line))) {
        if (m[0] === '}') stack.pop();
        else stack.push(m[1] || '');
      }
      return inFilter;
    });
  }

  function validate(files) {
    const all = files.map((f) => ({ path: normalizePath(f.path), content: f.content == null ? '' : String(f.content) }));
    const fs = all.filter((f) => RELEVANT.test(f.path));
    const out = [];
    const add = (id, severity, file, line, title, detail, fix, source) =>
      out.push({ id, severity, file, line: line || null, title, detail, fix, source: source || DOCS.migrate });

    if (!fs.some((f) => /\.farm$/.test(f.path) || /\.vhost$/.test(f.path))) {
      add('CS000', 'warning', '(project)', null, 'No dispatcher files found',
        'No .farm or .vhost files were found under conf.d/ or conf.dispatcher.d/.',
        'Upload the dispatcher "src" folder of your project (the one containing conf.d and conf.dispatcher.d).');
    }

    if (fs.some((f) => f.path === 'opt-in/USE_SOURCES_DIRECTLY')) {
      add('CS100', 'info', 'opt-in/USE_SOURCES_DIRECTLY', null, 'Flexible mode detected',
        'USE_SOURCES_DIRECTLY is present, so the flexible mode applies: fewer constraints on the rewrites folder structure.',
        'No action needed.', DOCS.overview);
    }

    for (const f of fs) {
      const p = f.path;
      const name = basename(p);
      const lines = f.content.split(/\r?\n/);

      // --- Path-based rules -------------------------------------------------------------
      // dispatcher_vhost.conf ships with the archetype ("provided by the runtime environment"), so it is not a finding.
      const runtimeProvided = p === 'conf.d/dispatcher_vhost.conf' || /provided by the runtime environment/i.test(f.content);
      if (!runtimeProvided && (/^conf\//.test(p) || /^conf\.modules\.d\//.test(p) || /^conf\.d\/[^/]+\.conf$/.test(p))) {
        add('CS007', 'error', p, null, 'Apache file not used in Cloud Service',
          'AEM as a Cloud Service supplies its own Apache base config, so the conf/, conf.modules.d/ folders and conf.d/*.conf files are not accepted.',
          'Delete this file (migrate any needed settings into a vhost or an allowed include).');
      }
      if (/^conf\.d\/whitelists\//.test(p)) {
        add('CS007', 'error', p, null, 'conf.d/whitelists is not supported',
          'The whitelists folder must be removed for Cloud Service.', 'Delete the folder.');
      }
      if (/^conf\.dispatcher\.d\/(enabled|available)_farms\//.test(p) && !/\.farm$/.test(p) && !/README/i.test(name) && name !== 'farms.any') {
        add('CS008', 'error', p, null, 'Farm file must be named *.farm',
          'Cloud Service expects farm files to match *.farm (for example customerX_farm.any becomes customerX.farm).',
          'Rename to <name>.farm and update the enabled_farms symlink.');
      }
      if (/^conf\.dispatcher\.d\/vhosts\//.test(p)) {
        add('CS009', 'warning', p, null, 'vhosts folder should be named virtualhosts',
          'Cloud Service uses conf.dispatcher.d/virtualhosts. Single files are conventionally named virtualhosts.any.',
          'Rename the folder to virtualhosts and fix the $include paths.');
      }
      if (/^ams_/.test(name) ) {
        add('CS006', 'error', p, null, 'AMS-specific file',
          'Files prefixed ams_ come from Adobe Managed Services and are removed during migration.', 'Delete the file and remove references to it.');
      }
      if (/_invalidate_allowed\.any$/.test(name) || name === 'base_rewrite.rules' || name === 'xforwarded_forcessl_rewrite.rules') {
        add('CS010', 'warning', p, null, 'Legacy AMS file to remove',
          'This file is part of the AMS default setup and is deleted when moving to Cloud Service.',
          'Delete it and remove its Include statements.');
      }
      if (/^conf\.d\/enabled_vhosts\/[^/]+\.vhost$/.test(p) || /^conf\.dispatcher\.d\/enabled_farms\/[^/]+\.farm$/.test(p)) {
        const body = f.content.trim();
        const pseudo = !/[\r\n]/.test(body) && /^(?:\.\.\/)*available_(?:farms|vhosts)\/[^\s/]+$/.test(body);
        if (pseudo) {
          add('CS013', 'warning', p, null, 'Symlink stored as a plain text file',
            'This file only contains a path ("' + body + '"). That is what a Windows checkout without symlink support produces from a correct git symlink, but it is also what a wrongly committed symlink looks like, and Cloud Manager rejects those.',
            'Verify in git: `git ls-files -s ' + p + '` must show mode 120000. If it shows 100644, recommit it as a symlink (`git update-index --add --cacheinfo 120000,<blob>,' + p + '`).');
        } else {
          add('CS014', 'info', p, null, 'Cannot verify this is a symlink',
            'Files in enabled_farms/enabled_vhosts must be symlinks to available_*, but a folder upload follows symlinks, so a symlink and a full copy look the same.',
            'Check locally: `git ls-files -s ' + p + '` should show mode 120000. A full copy committed here is rejected by Cloud Manager.');
        }
        const tokens = name.toLowerCase().split(/[_.\-]/);
        const hit = ['author', 'unhealthy', 'health', 'lc', 'flush'].find((t) => tokens.includes(t));
        if (hit) {
          add('CS015', 'warning', p, null, 'AMS-only farm/vhost ("' + hit + '") enabled',
            'The AMS author, health-check, lc and flush farms/vhosts are removed for Cloud Service.', 'Remove the file from enabled_* (and available_* if unused).');
        }
      }

      // --- Content-based rules ----------------------------------------------------------
      const inFilterBlock = filterContext(lines);
      const isFarmFile = /\.farm$/.test(p) || /^conf\.dispatcher\.d\/available_farms\//.test(p);
      const inFiltersDir = /^conf\.dispatcher\.d\/filters\//.test(p);

      lines.forEach((raw, i) => {
        if (isComment(raw)) return;
        const n = i + 1;

        if (/^\s*LoadModule\b/i.test(raw)) {
          add('CS001', 'error', p, n, 'LoadModule is not allowed',
            'Customers cannot add Apache modules in Cloud Service; only a fixed module set is supported.',
            'Remove the directive. Run `validator httpd` to see the allowlist.', DOCS.overview);
        }
        const vh = raw.match(/<VirtualHost\s+[^>]*:(\d+)\s*>/i);
        if (vh && vh[1] !== '80') {
          add('CS012', 'error', p, n, 'VirtualHost on port ' + vh[1],
            'Cloud Service terminates TLS in front of Dispatcher; only port 80 virtual hosts are supported.',
            'Remove or comment out virtual host sections that do not use port 80.');
        }
        if (/^\s*Include(Optional)?\s+"?\/(?!\/)/i.test(raw) || /\$include\s+"\/(?!\/)/.test(raw)) {
          add('CS005', 'error', p, n, 'Absolute include path',
            'Includes must be relative to the config root; absolute paths such as /etc/httpd/... do not exist in the Cloud image.',
            'Use a relative path, e.g. $include "../clientheaders/default_clientheaders.any".');
        }
        if (/\bams_[\w.\-]+/.test(raw) && !/^ams_/.test(name)) {
          add('CS006', 'error', p, n, 'Reference to an AMS-specific file',
            'This line references an ams_* file, which is removed during migration.',
            'Replace with the Cloud default (default_clientheaders.any, default_filters.any, ...) or delete the reference.');
        }
        for (const v of Object.keys(LEGACY_VARS)) {
          if (new RegExp('\\b' + v + '\\b').test(raw)) {
            add('CS011', 'error', p, n, 'Legacy variable ' + v, 'AMS variable that Cloud Service does not define.', LEGACY_VARS[v]);
          }
        }
        if (/\/glob\s+"/.test(raw) && (inFiltersDir || inFilterBlock[i])) {
          add('CS002', 'warning', p, n, '/glob in a filter rule',
            'Adobe\'s migration guidance says to disallow filter rules that use /glob, as it is a security risk. Match on /url, /path, /method, /extension, /selectors instead.',
            'Rewrite the rule using specific properties (and keep a default deny).');
        }
        if (/^\s*\/allowedClients\b/.test(raw) && !/default_invalidate\.any/.test(lines.slice(i, i + 4).join('\n'))) {
          add('CS003', 'warning', p, n, 'Custom /allowedClients in cache invalidation',
            'Cloud Service manages who may invalidate the cache, so the block should only include the default.',
            'Replace the contents with: $include "../cache/default_invalidate.any"');
        }
        if (isFarmFile && /\/hostname\s+"/.test(raw)) {
          add('CS004', 'warning', p, n, 'Hardcoded render hostname in farm',
            'The renders section should include the Cloud default instead of a fixed host.',
            'Replace the renders contents with: $include "../renders/default_renders.any"');
        }
      });
    }

    // Files that must be deleted outright: line-level findings inside them are noise.
    const doomed = new Set(out.filter((f) => f.line === null && ['CS006', 'CS007', 'CS010'].includes(f.id)).map((f) => f.file));
    // One finding per rule per file, with every affected line listed.
    const grouped = new Map();
    for (const f of out) {
      if (f.line !== null && doomed.has(f.file)) continue;
      const key = f.id + '|' + f.title + '|' + f.file;
      const g = grouped.get(key);
      if (!g) grouped.set(key, Object.assign({}, f, { lines: f.line ? [f.line] : [] }));
      else if (f.line) g.lines.push(f.line);
    }
    const result = Array.from(grouped.values());
    result.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.file.localeCompare(b.file) || (a.line || 0) - (b.line || 0));
    return result;
  }

  // "file:12, 40, 41 (+3 more)"
  function where(f) {
    if (!f.lines || !f.lines.length) return f.file;
    const shown = f.lines.slice(0, 8).join(', ');
    return f.file + ':' + shown + (f.lines.length > 8 ? ' (+' + (f.lines.length - 8) + ' more)' : '');
  }

  function summarize(findings) {
    const s = { error: 0, warning: 0, info: 0 };
    findings.forEach((f) => { s[f.severity]++; });
    return s;
  }

  function toMarkdown(findings) {
    const s = summarize(findings);
    const lines = ['# Dispatcher Cloud-readiness report', '', `${s.error} errors, ${s.warning} warnings, ${s.info} notes`, ''];
    findings.forEach((f) => {
      lines.push(`- **[${f.severity.toUpperCase()}] ${f.id}: ${f.title}**  `);
      lines.push(`  \`${where(f)}\`  `);
      lines.push(`  ${f.detail}  `);
      lines.push(`  Fix: ${f.fix}`);
    });
    lines.push('', '_Heuristic check based on Adobe migration guidance. Always confirm with Adobe\'s `validator full`._');
    return lines.join('\n');
  }

  const api = { validate, summarize, toMarkdown, normalizePath, where };
  root.DispatcherRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
