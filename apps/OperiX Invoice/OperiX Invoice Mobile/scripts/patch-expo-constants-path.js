const fs = require('fs');
const path = require('path');

function findPodspecs(start) {
  const results = [];
  let current = path.resolve(start);

  for (let index = 0; index < 10; index += 1) {
    const direct = path.join(current, 'node_modules', 'expo-constants', 'ios', 'EXConstants.podspec');
    if (fs.existsSync(direct)) results.push(direct);

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return results;
}

const unquoted = /env_vars = ENV\['PROJECT_ROOT'\] \? "PROJECT_ROOT=#\{ENV\['PROJECT_ROOT'\]\} " : ""/;
const quoted = `env_vars = ENV['PROJECT_ROOT'] ? "PROJECT_ROOT='#{ENV['PROJECT_ROOT']}' " : ""`;
const podspecs = findPodspecs(process.cwd());
let patched = 0;

for (const podspec of podspecs) {
  const source = fs.readFileSync(podspec, 'utf8');
  if (unquoted.test(source)) {
    fs.writeFileSync(podspec, source.replace(unquoted, quoted));
    patched += 1;
  }
}

console.log(`Expo Constants path patch: ${patched} podspec(s) patched.`);
