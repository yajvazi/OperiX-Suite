const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

function findExpoConstants(projectRoot) {
  let current = projectRoot;

  for (let index = 0; index < 8; index += 1) {
    const candidate = path.join(current, 'node_modules', 'expo-constants');
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

module.exports = function withExpoConstantsPathFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const packageRoot = findExpoConstants(config.modRequest.projectRoot);
      if (!packageRoot) return config;

      const podspecPath = path.join(packageRoot, 'ios', 'EXConstants.podspec');
      if (!fs.existsSync(podspecPath)) return config;

      const source = fs.readFileSync(podspecPath, 'utf8');
      const unquoted = `env_vars = ENV['PROJECT_ROOT'] ? "PROJECT_ROOT=#{ENV['PROJECT_ROOT']} " : ""`;
      const quoted = `env_vars = ENV['PROJECT_ROOT'] ? "PROJECT_ROOT='#{ENV['PROJECT_ROOT']}' " : ""`;

      if (source.includes(unquoted) && !source.includes(quoted)) {
        fs.writeFileSync(podspecPath, source.replace(unquoted, quoted));
      }

      return config;
    },
  ]);
};
