/* Demo inputs: a legacy AMS-style config (many issues) and a clean Cloud-style config. */
(function (root) {
  'use strict';

  const legacy = [
    { path: 'dispatcher/src/conf/httpd.conf', content: 'ServerRoot "/etc/httpd"\nListen 80\n' },
    { path: 'dispatcher/src/conf.modules.d/00-base.conf', content: 'LoadModule rewrite_module modules/mod_rewrite.so\nLoadModule php_module modules/mod_php.so\n' },
    { path: 'dispatcher/src/conf.d/dispatcher_vhost.conf', content: 'Include conf.d/enabled_vhosts/*.vhost\n' },
    { path: 'dispatcher/src/conf.d/whitelists/ip.rules', content: 'Require ip 10.0.0.0/8\n' },
    {
      path: 'dispatcher/src/conf.d/available_vhosts/default.vhost',
      content: [
        '<VirtualHost *:80>',
        '  ServerName "www.example.com"',
        '  DocumentRoot "${PUBLISH_DOCROOT}"',
        '  Include conf.d/variables/ams_default.vars',
        '  Include conf.d/rewrites/base_rewrite.rules',
        '  Include /etc/httpd/conf.d/rewrites/xforwarded_forcessl_rewrite.rules',
        '</VirtualHost>',
        '<VirtualHost *:443>',
        '  ServerName "www.example.com"',
        '</VirtualHost>',
      ].join('\n'),
    },
    { path: 'dispatcher/src/conf.d/enabled_vhosts/default.vhost', content: '../available_vhosts/default.vhost' },
    { path: 'dispatcher/src/conf.d/enabled_vhosts/author.vhost', content: '../available_vhosts/author.vhost' },
    { path: 'dispatcher/src/conf.d/variables/ams_default.vars', content: 'Define DISP_ID pub1\nDefine PUBLISH_FORCE_SSL 1\n' },
    { path: 'dispatcher/src/conf.d/rewrites/base_rewrite.rules', content: 'RewriteEngine On\n' },
    {
      path: 'dispatcher/src/conf.dispatcher.d/available_farms/customerX_farm.any',
      content: [
        '/customerX {',
        '  /clientheaders { $include "/etc/httpd/conf.dispatcher.d/clientheaders/ams_publish_clientheaders.any" }',
        '  /virtualhosts { "www.example.com" }',
        '  /renders { /0001 { /hostname "10.1.2.3" /port "4503" } }',
        '  /filter { $include "../filters/custom_filters.any" }',
        '  /cache {',
        '    /docroot "/mnt/var/www/html"',
        '    /allowedClients { /0000 { /glob "*" /type "deny" } /0001 { /glob "10.*" /type "allow" } }',
        '  }',
        '}',
      ].join('\n'),
    },
    { path: 'dispatcher/src/conf.dispatcher.d/enabled_farms/customerX_farm.any', content: '../available_farms/customerX_farm.any' },
    {
      path: 'dispatcher/src/conf.dispatcher.d/filters/custom_filters.any',
      content: [
        '/0001 { /type "deny" /glob "*" }',
        '/0002 { /type "allow" /glob "GET /content/*" }',
        '/0003 { /type "allow" /url "/libs/granite/csrf/token.json" }',
      ].join('\n'),
    },
    { path: 'dispatcher/src/conf.dispatcher.d/vhosts/vhosts.any', content: '"www.example.com"\n' },
    { path: 'dispatcher/src/conf.dispatcher.d/cache/ams_publish_invalidate_allowed.any', content: '/0000 { /glob "*" /type "deny" }\n' },
  ];

  const clean = [
    { path: 'dispatcher/src/opt-in/USE_SOURCES_DIRECTLY', content: '' },
    {
      path: 'dispatcher/src/conf.d/available_vhosts/default.vhost',
      content: '<VirtualHost *:80>\n  ServerName "www.example.com"\n  DocumentRoot "${DOCROOT}"\n  Include conf.d/rewrites/rewrite.rules\n</VirtualHost>\n',
    },
    {
      path: 'dispatcher/src/conf.dispatcher.d/available_farms/default.farm',
      content: [
        '/default {',
        '  /clientheaders { $include "../clientheaders/default_clientheaders.any" }',
        '  /virtualhosts { $include "../virtualhosts/default_virtualhosts.any" }',
        '  /renders { $include "../renders/default_renders.any" }',
        '  /filter { $include "../filters/default_filters.any" }',
        '  /cache { /docroot "${DOCROOT}" /allowedClients { $include "../cache/default_invalidate.any" } }',
        '}',
      ].join('\n'),
    },
    {
      path: 'dispatcher/src/conf.dispatcher.d/filters/default_filters.any',
      content: '/0001 { /type "deny" /url "*" }\n/0002 { /type "allow" /method "GET" /url "/content/*" }\n',
    },
  ];

  root.DispatcherSamples = { legacy, clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DispatcherSamples;
})(typeof window !== 'undefined' ? window : globalThis);
