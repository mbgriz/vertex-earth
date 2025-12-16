# Three.js Interactive Vertex Earth (React + TypeScript)

Demonstration of an interactive globe rendered using Three.js, now wrapped in a React 19 + TypeScript app, complete with a gradient background and orbit controls. The globe uses custom shaders to apply textures, elevation, and alpha transparency.

## Features

- **Interactive Globe**: A rotating 3D globe built with an `IcosahedronGeometry`, wireframe, and point geometry using custom shaders.
- **Custom Shaders**: Vertex and fragment shaders are used for applying color, elevation, and alpha textures.
- **Gradient Background**: A subtle blue gradient provides depth behind the globe.
- **Orbit Controls**: Allows users to rotate and zoom the globe interactively using the mouse.
- **Responsive Design**: Automatically adjusts the canvas size when the window is resized.

### Customization

- **Globe Appearance**: Modify the textures in the `TextureLoader` (`colorMap`, `elevMap`, and `alphaMap`) to change the appearance of the globe.
- **Shaders**: Modify the vertex or fragment shaders for custom visual effects on the globe's surface.

### Acknowledgments

- [Three.js](https://threejs.org/) for the awesome 3D library.
- [Three.js Forum](https://discourse.threejs.org/) for shader examples and discussions.

Watch the tutorial on [YouTube](https://youtu.be/tBSzJstOGnM)

## Getting Started

1. Install [Node.js](https://nodejs.org/) (v18+ recommended).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the Vite dev server:
   ```bash
   npm run dev
   ```
4. Open http://localhost:5173 in your browser. Vite supports hot reloads while you edit.

Notes:
- `npm start` is an alias for `npm run dev`. Use `npm run build` to create a production bundle and `npm run preview` to serve the built files locally.
- Modules are resolved by Vite; assets in `src/` are bundled automatically. React entry point is `src/main.tsx` and the Three.js setup lives in `src/App.tsx`.
