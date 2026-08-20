/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'OperixSalesWidget',
  displayName: 'OperiX Sales',
  bundleIdentifier: '.sales-widget',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
  entitlements: {
    'com.apple.security.application-groups': (
      config.ios?.entitlements?.['com.apple.security.application-groups']
      || ['group.com.lrdygroup.operixinvoice']
    ),
  },
});
