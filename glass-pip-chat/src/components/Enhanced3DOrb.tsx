import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere } from '@react-three/drei';
import * as THREE from 'three';

interface Enhanced3DOrbProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'processing' | 'ggwave';
  size?: number;
  className?: string;
}

function OrbMesh({ state, size = 1 }: { state: Enhanced3DOrbProps['state']; size: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);
  
  // Animation parameters based on state
  const animationConfig = useMemo(() => {
    switch (state) {
      case 'listening':
        return {
          distort: 0.4,
          speed: 2,
          color: '#3b82f6', // Blue
          emissive: '#1e40af',
          intensity: 0.8,
          scale: [0.9, 1.1, 0.9],
          rotationSpeed: 0.01
        };
      case 'thinking':
        return {
          distort: 0.6,
          speed: 1.5,
          color: '#8b5cf6', // Purple
          emissive: '#7c3aed',
          intensity: 1.0,
          scale: [1, 1.2, 1],
          rotationSpeed: 0.02
        };
      case 'speaking':
        return {
          distort: 0.3,
          speed: 3,
          color: '#10b981', // Green
          emissive: '#059669',
          intensity: 0.9,
          scale: [0.95, 1.05, 0.95],
          rotationSpeed: 0.015
        };
      case 'processing':
        return {
          distort: 0.8,
          speed: 2.5,
          color: '#f59e0b', // Orange
          emissive: '#d97706',
          intensity: 1.1,
          scale: [1, 1.3, 1],
          rotationSpeed: 0.03
        };
      case 'ggwave':
        return {
          distort: 0.5,
          speed: 4,
          color: '#ef4444', // Red
          emissive: '#dc2626',
          intensity: 1.2,
          scale: [0.8, 1.4, 0.8],
          rotationSpeed: 0.025
        };
      default: // idle
        return {
          distort: 0.1,
          speed: 0.5,
          color: '#6b7280', // Gray
          emissive: '#374151',
          intensity: 0.3,
          scale: [1, 1, 1],
          rotationSpeed: 0.005
        };
    }
  }, [state]);

  useFrame((frameState) => {
    if (!meshRef.current || !materialRef.current) return;
    
    const time = frameState.clock.getElapsedTime();
    
    // Rotation
    meshRef.current.rotation.x = time * animationConfig.rotationSpeed;
    meshRef.current.rotation.y = time * animationConfig.rotationSpeed * 1.5;
    
    // Scale animation
    const scaleProgress = (Math.sin(time * animationConfig.speed) + 1) / 2;
    const currentScale = THREE.MathUtils.lerp(
      animationConfig.scale[0],
      animationConfig.scale[1],
      scaleProgress
    );
    meshRef.current.scale.setScalar(currentScale * size);
    
    // Material distortion
    materialRef.current.distort = animationConfig.distort * (0.8 + 0.2 * Math.sin(time * animationConfig.speed * 2));
    
    // Emissive intensity animation
    const emissiveIntensity = animationConfig.intensity * (0.7 + 0.3 * Math.sin(time * animationConfig.speed * 1.5));
    materialRef.current.emissiveIntensity = emissiveIntensity;
  });

  return (
    <Sphere ref={meshRef} args={[1, 64, 64]}>
      <MeshDistortMaterial
        ref={materialRef}
        color={animationConfig.color}
        emissive={animationConfig.emissive}
        emissiveIntensity={animationConfig.intensity}
        roughness={0.2}
        metalness={0.8}
        distort={animationConfig.distort}
        speed={animationConfig.speed}
        radius={1}
      />
    </Sphere>
  );
}

function OrbEnvironment() {
  return (
    <>
      {/* Ambient light */}
      <ambientLight intensity={0.2} />
      
      {/* Main directional light */}
      <directionalLight
        position={[5, 5, 5]}
        intensity={1}
        castShadow
      />
      
      {/* Fill light */}
      <pointLight
        position={[-5, -5, 5]}
        intensity={0.5}
        color="#ffffff"
      />
      
      {/* Rim light */}
      <pointLight
        position={[0, 0, -10]}
        intensity={0.3}
        color="#3b82f6"
      />
    </>
  );
}

export default function Enhanced3DOrb({ 
  state = 'idle', 
  size = 1, 
  className = '' 
}: Enhanced3DOrbProps) {
  return (
    <div className={`w-full h-full ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: "high-performance"
        }}
        style={{ background: 'transparent' }}
      >
        <OrbEnvironment />
        <OrbMesh state={state} size={size} />
      </Canvas>
    </div>
  );
}