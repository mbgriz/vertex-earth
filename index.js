import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import colorMapUrl from "./src/00_earthmap1k.jpg";
import elevMapUrl from "./src/01_earthbump1k.jpg";
import alphaMapUrl from "./src/02_earthspec1k.jpg";

// Core scene graph objects: scene, camera, renderer.
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 0, 3.5); // Pull back enough to see the globe.
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
renderer.setSize(innerWidth, innerHeight); // Match canvas to viewport.
renderer.setPixelRatio(window.devicePixelRatio); // Sharper rendering on HiDPI.
document.body.appendChild(renderer.domElement);

// Mouse orbit controls for pan/zoom/rotate with damping inertia.
const orbitCtrl = new OrbitControls(camera, renderer.domElement);
orbitCtrl.enableDamping = true;

// Texture inputs: color map, elevation (bump), and alpha/specular.
const textureLoader = new THREE.TextureLoader();
const colorMap = textureLoader.load(colorMapUrl);
const elevMap = textureLoader.load(elevMapUrl);
const alphaMap = textureLoader.load(alphaMapUrl);

// Group that holds all globe elements so we can rotate them together.
const globeGroup = new THREE.Group();
scene.add(globeGroup);

// Point cloud geometry shares the same sphere radius but with high detail.
const detail = 150;
const pointsGeo = new THREE.IcosahedronGeometry(1, detail);

// Build line segment geometry so each elevated point has a pillar back to the base sphere.
const pillarGeo = new THREE.BufferGeometry();
const basePositions = pointsGeo.attributes.position;
const baseUvs = pointsGeo.attributes.uv;
const vertCount = basePositions.count;
const linePositions = new Float32Array(vertCount * 2 * 3);
const lineUvs = new Float32Array(vertCount * 2 * 2);
const lineEnds = new Float32Array(vertCount * 2); // 0 for base, 1 for tip.

for (let i = 0; i < vertCount; i++) {
  const x = basePositions.getX(i);
  const y = basePositions.getY(i);
  const z = basePositions.getZ(i);
  const u = baseUvs.getX(i);
  const v = baseUvs.getY(i);

  const idxPos = i * 6;
  const idxUv = i * 4;
  const idxEnd = i * 2;

  // Base vertex
  linePositions[idxPos] = x;
  linePositions[idxPos + 1] = y;
  linePositions[idxPos + 2] = z;
  lineUvs[idxUv] = u;
  lineUvs[idxUv + 1] = v;
  lineEnds[idxEnd] = 0;

  // Tip vertex (same position; shader will offset it by elevation)
  linePositions[idxPos + 3] = x;
  linePositions[idxPos + 4] = y;
  linePositions[idxPos + 5] = z;
  lineUvs[idxUv + 2] = u;
  lineUvs[idxUv + 3] = v;
  lineEnds[idxEnd + 1] = 1;
}

pillarGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
pillarGeo.setAttribute("uv", new THREE.BufferAttribute(lineUvs, 2));
pillarGeo.setAttribute("end", new THREE.BufferAttribute(lineEnds, 1));

const pointHeightScale = 0.10;
const pillarHeightScale = 0.10;

// GLSL shaders push points outward based on elevation map and shade them with color/alpha textures.
const vertexShader = `
  uniform float size;
  uniform float heightScale;
  uniform sampler2D elevTexture;

  varying vec2 vUv;
  varying float vVisible;

  void main() {
    vUv = uv;
    float elv = texture2D(elevTexture, vUv).r;
    vec3 n = normalize(position);
    vec3 displaced = position + n * (heightScale * elv);
    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    vec3 vNormal = normalMatrix * n;
    vVisible = step(0.0, dot( -normalize(mvPosition.xyz), normalize(vNormal)));
    gl_PointSize = size;
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const fragmentShader = `
  uniform sampler2D colorTexture;
  uniform sampler2D alphaTexture;

  varying vec2 vUv;
  varying float vVisible;

  void main() {
    if (floor(vVisible + 0.1) == 0.0) discard;
    vec2 p = gl_PointCoord * 2.0 - 1.0; // Remap to [-1, 1] for a centered circle.
    float r = length(p);
    if (r > 1.0) discard;
    float alpha = 2.0 - texture2D(alphaTexture, vUv).r;
    vec3 color = texture2D(colorTexture, vUv).rgb;
    gl_FragColor = vec4(color, alpha);
  }
`;

// Pillar shaders extrude a line from the base sphere to the elevated tip.
const pillarVertexShader = `
  uniform sampler2D elevTexture;
  uniform float heightScale;
  uniform sampler2D alphaTexture;

  attribute float end;

  varying vec2 vUv;
  varying float vVisible;
  varying float vLandMask;

  void main() {
    vUv = uv;
    float elv = texture2D(elevTexture, uv).r;
    float landMask = step(0.2, 1.0 - texture2D(alphaTexture, vUv).r);
    vec3 n = normalize(position);
    vec3 displaced = position + n * ((end == 1.0 ? heightScale : 0.0) * elv * landMask);
    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    vec3 vNormal = normalMatrix * n;
    vVisible = step(0.0, dot(-normalize(mvPosition.xyz), normalize(vNormal)));
    vLandMask = landMask;
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const pillarFragmentShader = `
  uniform sampler2D colorTexture;
  uniform sampler2D alphaTexture;

  varying vec2 vUv;
  varying float vVisible;
  varying float vLandMask;

  void main() {
    if (floor(vVisible + 0.1) == 0.0) discard;
    if (vLandMask < 0.5) discard;
    float alpha = clamp(2.0 - texture2D(alphaTexture, vUv).r, 0.0, 1.0);
    vec3 color = texture2D(colorTexture, vUv).rgb;
    gl_FragColor = vec4(color, alpha);
  }
`;

const uniforms = {
  size: { type: "f", value:6 },
  heightScale: { type: "f", value: pointHeightScale },
  colorTexture: { type: "t", value: colorMap },
  elevTexture: { type: "t", value: elevMap },
  alphaTexture: { type: "t", value: alphaMap }
};
// Shader material drives the point cloud; transparent lets alpha map punch holes.
const pointsMat = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader,
  fragmentShader,
  transparent: true
});

// Points geometry rendered via the custom shader material.
const points = new THREE.Points(pointsGeo, pointsMat);
globeGroup.add(points);

// Pillars that run from the base sphere to the elevated tips.
const pillarUniforms = {
  heightScale: { type: "f", value: pillarHeightScale },
  colorTexture: { type: "t", value: colorMap },
  elevTexture: { type: "t", value: elevMap },
  alphaTexture: { type: "t", value: alphaMap }
};
const pillarMat = new THREE.ShaderMaterial({
  uniforms: pillarUniforms,
  vertexShader: pillarVertexShader,
  fragmentShader: pillarFragmentShader,
  transparent: true
});
const pillars = new THREE.LineSegments(pillarGeo, pillarMat);
globeGroup.add(pillars);

// Soft hemispheric lighting to avoid a fully flat unlit look.
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x080820, 3);
scene.add(hemiLight);

// Keep point size visually stable by scaling with the camera's distance from the origin.
const basePointSize = uniforms.size.value;
const baseCameraDistance = camera.position.length();
let lastLoggedSize = basePointSize;

function animate() {
  const zoomScale = baseCameraDistance / camera.position.length(); // Inverse so points grow as you zoom in.
  pointsMat.uniforms.size.value = basePointSize * zoomScale;
  if (Math.abs(pointsMat.uniforms.size.value - lastLoggedSize) > 0.01) {
    console.log("Point size:", pointsMat.uniforms.size.value.toFixed(3));
    lastLoggedSize = pointsMat.uniforms.size.value;
  }

  renderer.render(scene, camera); // Draw current frame.
  globeGroup.rotation.y += 0.001; // Slow continuous spin.

  requestAnimationFrame(animate); // Schedule next frame.
  orbitCtrl.update(); // Apply damping to controls.
};
animate();

// Keep camera and renderer in sync with viewport size.
window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

// https://discourse.threejs.org/t/earth-point-vertex-elevation/62689
