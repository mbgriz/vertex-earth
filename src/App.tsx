import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import colorMapUrl from "./00_earthmap1k.jpg";
import elevMapUrl from "./01_earthbump1k.jpg";
import alphaMapUrl from "./02_earthspec1k.jpg";

const detail = 150;
const pointSize = 6;
const pointHeightScale = 0.1;
const pillarHeightScale = 0.1;

function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const textureLoader = new THREE.TextureLoader();
    const colorMap = textureLoader.load(colorMapUrl);
    const elevMap = textureLoader.load(elevMapUrl);
    const alphaMap = textureLoader.load(alphaMapUrl);

    const pointsGeo = new THREE.IcosahedronGeometry(1, detail);

    const pillarGeo = new THREE.BufferGeometry();
    const basePositions = pointsGeo.attributes.position;
    const baseUvs = pointsGeo.attributes.uv;
    const vertCount = basePositions.count;
    const linePositions = new Float32Array(vertCount * 2 * 3);
    const lineUvs = new Float32Array(vertCount * 2 * 2);
    const lineEnds = new Float32Array(vertCount * 2);

    for (let i = 0; i < vertCount; i++) {
      const x = basePositions.getX(i);
      const y = basePositions.getY(i);
      const z = basePositions.getZ(i);
      const u = baseUvs.getX(i);
      const v = baseUvs.getY(i);

      const idxPos = i * 6;
      const idxUv = i * 4;
      const idxEnd = i * 2;

      linePositions[idxPos] = x;
      linePositions[idxPos + 1] = y;
      linePositions[idxPos + 2] = z;
      lineUvs[idxUv] = u;
      lineUvs[idxUv + 1] = v;
      lineEnds[idxEnd] = 0;

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
      size: { value: pointSize },
      heightScale: { value: pointHeightScale },
      colorTexture: { value: colorMap },
      elevTexture: { value: elevMap },
      alphaTexture: { value: alphaMap },
    };

    const pointsMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
    });

    const points = new THREE.Points(pointsGeo, pointsMat);
    globeGroup.add(points);

    const pillarUniforms = {
      heightScale: { value: pillarHeightScale },
      colorTexture: { value: colorMap },
      elevTexture: { value: elevMap },
      alphaTexture: { value: alphaMap },
    };

    const pillarMat = new THREE.ShaderMaterial({
      uniforms: pillarUniforms,
      vertexShader: pillarVertexShader,
      fragmentShader: pillarFragmentShader,
      transparent: true,
    });

    const pillars = new THREE.LineSegments(pillarGeo, pillarMat);
    globeGroup.add(pillars);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x080820, 3);
    scene.add(hemiLight);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 3.5);

    const orbitCtrl = new OrbitControls(camera, renderer.domElement);
    orbitCtrl.enableDamping = true;

    container.appendChild(renderer.domElement);

    const basePointSize = uniforms.size.value;
    const baseCameraDistance = camera.position.length();

    let animationId = 0;

    const handleResize = () => {
      const nextWidth = container.clientWidth || window.innerWidth;
      const nextHeight = container.clientHeight || window.innerHeight;
      renderer.setSize(nextWidth, nextHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      const zoomScale = baseCameraDistance / camera.position.length();
      pointsMat.uniforms.size.value = basePointSize * zoomScale;

      renderer.render(scene, camera);
      globeGroup.rotation.y += 0.001;

      animationId = requestAnimationFrame(animate);
      orbitCtrl.update();
    };

    window.addEventListener("resize", handleResize);
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      orbitCtrl.dispose();
      pointsGeo.dispose();
      pillarGeo.dispose();
      pointsMat.dispose();
      pillarMat.dispose();
      hemiLight.dispose?.();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div className="app"><div ref={containerRef} className="canvas-container" /></div>;
}

export default App;
