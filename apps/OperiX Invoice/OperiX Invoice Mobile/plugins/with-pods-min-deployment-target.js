const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

// Some pods (e.g. the @react-native-async-storage resource bundle) still ship a
// deployment target below 15.0, which the iOS 27 SDK rejects at archive time.
// Raise any lower target on every pod target after `pod install`.
const MIN_IOS_VERSION = '15.1';
const MARKER = '# operix: raise low pod deployment targets';

const SNIPPET = `    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f
        build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS_VERSION}' if current < ${MIN_IOS_VERSION}
      end
    end
`;

module.exports = function withPodsMinDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return config;

      const source = fs.readFileSync(podfilePath, 'utf8');
      if (source.includes(MARKER)) return config;

      const hook = /^(\s*post_install do \|installer\|\s*\n)/m;
      if (!hook.test(source)) return config;

      fs.writeFileSync(podfilePath, source.replace(hook, `$1${SNIPPET}`));
      return config;
    },
  ]);
};
