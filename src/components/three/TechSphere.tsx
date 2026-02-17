/**
 * ClinicCortex TechSphere — Three.js animated 3D sphere
 * Design: Dark Neon Biopunk — glowing green wireframe sphere with orbiting particles
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function TechSphere() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 3.5;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Main sphere wireframe
    const sphereGeo = new THREE.SphereGeometry(1.2, 32, 32);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x23D996,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphere);

    // Inner glow sphere
    const innerGeo = new THREE.SphereGeometry(1.0, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x23D996,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerSphere);

    // Core sphere (solid glow)
    const coreGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x23D996,
      transparent: true,
      opacity: 0.8,
    });
    const coreSphere = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreSphere);

    // Orbital rings
    const createRing = (radius: number, tilt: number, opacity: number) => {
      const ringGeo = new THREE.TorusGeometry(radius, 0.008, 8, 100);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x23D996,
        transparent: true,
        opacity,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = tilt;
      ring.rotation.z = tilt * 0.5;
      scene.add(ring);
      return ring;
    };

    const ring1 = createRing(1.6, Math.PI / 4, 0.5);
    const ring2 = createRing(1.9, -Math.PI / 6, 0.3);
    const ring3 = createRing(2.2, Math.PI / 3, 0.2);

    // Orbiting particles
    const particleCount = 200;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSizes = new Float32Array(particleCount);
    const particleAngles = new Float32Array(particleCount);
    const particleRadii = new Float32Array(particleCount);
    const particleHeights = new Float32Array(particleCount);
    const particleSpeeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      particleAngles[i] = Math.random() * Math.PI * 2;
      particleRadii[i] = 1.4 + Math.random() * 1.2;
      particleHeights[i] = (Math.random() - 0.5) * 2.5;
      particleSpeeds[i] = 0.003 + Math.random() * 0.008;
      particleSizes[i] = 1.5 + Math.random() * 3;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    particleGeo.setAttribute("size", new THREE.BufferAttribute(particleSizes, 1));

    const particleMat = new THREE.PointsMaterial({
      color: 0x23D996,
      size: 0.025,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Outer glow particles (larger, more spread)
    const outerParticleCount = 80;
    const outerPositions = new Float32Array(outerParticleCount * 3);
    for (let i = 0; i < outerParticleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2.5 + Math.random() * 1.5;
      outerPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      outerPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      outerPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const outerGeo = new THREE.BufferGeometry();
    outerGeo.setAttribute("position", new THREE.BufferAttribute(outerPositions, 3));
    const outerMat = new THREE.PointsMaterial({
      color: 0x23D996,
      size: 0.015,
      transparent: true,
      opacity: 0.3,
    });
    const outerParticles = new THREE.Points(outerGeo, outerMat);
    scene.add(outerParticles);

    // Mouse interaction
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / width - 0.5) * 2;
      mouseY = -((e.clientY - rect.top) / height - 0.5) * 2;
    };
    mount.addEventListener("mousemove", handleMouseMove);

    // Animation loop
    let animId: number;
    let time = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      time += 0.005;

      // Dynamic Sphere rotation based on mouse + time
      const targetRotX = mouseY * 0.5;
      const targetRotY = time * 0.5 + mouseX * 0.5;

      sphere.rotation.x = THREE.MathUtils.lerp(sphere.rotation.x, targetRotX, 0.05);
      sphere.rotation.y = THREE.MathUtils.lerp(sphere.rotation.y, targetRotY, 0.05);

      innerSphere.rotation.y -= 0.005;
      innerSphere.rotation.z += 0.002;

      // Ring rotations (faster, more dynamic)
      ring1.rotation.z += 0.006;
      ring2.rotation.z -= 0.005;
      ring3.rotation.y += 0.003;

      // Outer particles slow rotation
      outerParticles.rotation.y += 0.002;

      // Camera follows mouse smoothly
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, mouseX * 0.8, 0.05);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, mouseY * 0.5, 0.05);
      camera.lookAt(scene.position);

      // Update orbiting particles (including dynamic sizes for twinkling)
      const positions = particleGeo.attributes.position.array as Float32Array;
      const sizes = particleGeo.attributes.size.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        particleAngles[i] += particleSpeeds[i];
        const angle = particleAngles[i];
        const r = particleRadii[i];
        
        // Browninan motion on height
        const motion = Math.sin(time * 2 + i) * 0.15;
        
        positions[i * 3] = r * Math.cos(angle);
        positions[i * 3 + 1] = particleHeights[i] + motion;
        positions[i * 3 + 2] = r * Math.sin(angle);
        
        // Twinkling effect
        sizes[i] = 1.0 + Math.abs(Math.sin(time * 3 + i)) * 3;
      }
      particleGeo.attributes.position.needsUpdate = true;
      particleGeo.attributes.size.needsUpdate = true;

      // Pulsing opacity on core
      coreMat.opacity = 0.08 + Math.sin(time * 2) * 0.06;

      renderer.render(scene, camera);
    };

    animate();

    // Resize handler
    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      mount.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="w-full h-full"
      style={{ cursor: "none" }}
    />
  );
}
