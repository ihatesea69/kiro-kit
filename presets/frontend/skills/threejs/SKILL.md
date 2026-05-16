---
name: threejs
description: Build 3D web experiences with Three.js including scenes, cameras, geometries, materials, lights, animations, and post-processing. Use when creating 3D visualizations or interactive graphics.
---

# Three.js

Activate this skill when building 3D web experiences, visualizations, or interactive graphics.

## When to Use

- Creating 3D scenes and visualizations
- Building interactive product configurators
- Implementing animated backgrounds or hero sections
- Working with WebGL shaders and materials
- Loading and displaying 3D models (glTF, FBX)
- Adding post-processing effects

## Core Concepts

- Scene: container for all 3D objects
- Camera: PerspectiveCamera for most use cases
- Renderer: WebGLRenderer with proper sizing and pixel ratio
- Geometry: shape definition (BoxGeometry, SphereGeometry, custom)
- Material: surface appearance (MeshStandardMaterial for PBR)
- Light: illumination (AmbientLight + DirectionalLight minimum)

## React Integration (React Three Fiber)

```tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';

function Scene() {
  return (
    <Canvas camera={{ position: [0, 0, 5] }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} />
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="orange" />
      </mesh>
      <OrbitControls />
      <Environment preset="studio" />
    </Canvas>
  );
}
```

## Performance

- Use instancing for repeated geometries
- Implement LOD (Level of Detail) for complex scenes
- Dispose geometries and materials when unmounting
- Use compressed textures (KTX2, Basis)
- Limit draw calls and polygon count
- Use `useFrame` for animations (not setInterval)

## Best Practices

- Always dispose resources on cleanup
- Use drei helpers for common patterns
- Implement proper loading states for models
- Handle WebGL context loss gracefully
- Test on mobile devices for performance
