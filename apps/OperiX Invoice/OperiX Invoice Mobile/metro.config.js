const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../../..');
const workspacePackagesRoot = path.resolve(workspaceRoot, 'packages');
const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;
// Watch only source packages consumed by the mobile app. Watching the entire
// monorepo also includes transient web build folders such as `.next`, which
// can disappear during a rebuild and crash Metro's file watcher.
config.watchFolders = [
  ...new Set([...(config.watchFolders || []), workspacePackagesRoot]),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// All workspace packages import React as a peer dependency. Keep Metro from
// creating a second React module identity when it follows those symlinks;
// otherwise hooks from @invoice-monorepo/hooks are dispatched by a different
// React instance than the one rendering the app.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: path.resolve(workspaceRoot, 'node_modules/react'),
};

module.exports = config;
