import { mkdir, copyFile, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor', { recursive: true });
for (const name of ['index.html', 'console.css', 'world.js', 'game.js', 'navigation.js', 'canvas-renderer.js']) {
  await copyFile(name, 'dist/' + name);
}
const assets = [
  ['three/build/three.module.min.js', 'three.js'],
  ['three/examples/jsm/controls/PointerLockControls.js', 'pointer.js'],
  ['three/examples/jsm/utils/BufferGeometryUtils.js', 'geometry.js'],
  ['three/LICENSE', 'three.LICENSE'],
  ['@fontsource/barlow-condensed/files/barlow-condensed-latin-800-italic.woff2', 'display.woff2'],
  ['@fontsource/barlow-condensed/LICENSE', 'font.LICENSE']
];
for (const [source, name] of assets) await copyFile('node_modules/' + source, 'dist/vendor/' + name);
