/**
 * ClinicCortex EcosystemOrbit — Three.js orbital node visualization
 * Design: Dark Neon Biopunk — connected nodes in orbital formation
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

const NODES = [
  { label: "CRM", color: 0x025940, angle: 0, radius: 2.2 },
  { label: "Agenda", color: 0x118C5F, angle: (Math.PI * 2) / 5, radius: 2.2 },
  { label: "Analytics", color: 0x025940, angle: (Math.PI * 4) / 5, radius: 2.2 },
  { label: "Automação", color: 0x118C5F, angle: (Math.PI * 6) / 5, radius: 2.2 },
  { label: "WhatsApp", color: 0x025940, angle: (Math.PI * 8) / 5, radius: 2.2 },
];

export default function EcosystemOrbit() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Central core sphere
    const coreGeo = new THREE.SphereGeometry(0.45, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x118C5F,
      transparent: true,
      opacity: 0.95,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    // Core wireframe
    const coreWireGeo = new THREE.SphereGeometry(0.55, 16, 16);
    const coreWireMat = new THREE.MeshBasicMaterial({
      color: 0x025940,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const coreWire = new THREE.Mesh(coreWireGeo, coreWireMat);
    scene.add(coreWire);

    // Orbital ring
    const orbitRingGeo = new THREE.TorusGeometry(2.2, 0.006, 8, 120);
    const orbitRingMat = new THREE.MeshBasicMaterial({
      color: 0x118C5F,
      transparent: true,
      opacity: 0.3,
    });
    const orbitRing = new THREE.Mesh(orbitRingGeo, orbitRingMat);
    orbitRing.rotation.x = Math.PI / 2.5;
    scene.add(orbitRing);

    // Satellite nodes
    const nodeMeshes: THREE.Mesh[] = [];
    const nodeAngles = NODES.map((n) => n.angle);

    NODES.forEach((node) => {
      const nodeGeo = new THREE.SphereGeometry(0.22, 24, 24);
      const nodeMat = new THREE.MeshBasicMaterial({
        color: node.color,
        transparent: true,
        opacity: 0.85,
      });
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
      scene.add(nodeMesh);
      nodeMeshes.push(nodeMesh);

      // Node wireframe halo
      const haloGeo = new THREE.SphereGeometry(0.3, 12, 12);
      const haloMat = new THREE.MeshBasicMaterial({
        color: node.color,
        wireframe: true,
        transparent: true,
        opacity: 0.2,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      nodeMesh.add(halo);
    });

    // Connection lines (from core to each node)
    const lineMeshes: THREE.Line[] = [];
    NODES.forEach(() => {
      const lineGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(6);
      lineGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x118C5F,
        transparent: true,
        opacity: 0.45,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);
      lineMeshes.push(line);
    });

    // Background particles
    const bgParticleCount = 150;
    const bgPositions = new Float32Array(bgParticleCount * 3);
    for (let i = 0; i < bgParticleCount; i++) {
      bgPositions[i * 3] = (Math.random() - 0.5) * 12;
      bgPositions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      bgPositions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2;
    }
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute("position", new THREE.BufferAttribute(bgPositions, 3));
    const bgMat = new THREE.PointsMaterial({
      color: 0x01523A,
      size: 0.025,
      transparent: true,
      opacity: 0.4,
    });
    const bgParticles = new THREE.Points(bgGeo, bgMat);
    scene.add(bgParticles);

    // Data Pulses (particles traveling along connection lines)
    const pulseCount = NODES.length * 4;
    const pulseGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const pulseMat = new THREE.MeshBasicMaterial({ 
      color: 0x23D996, 
      transparent: true, 
      opacity: 1.0 
    });
    
    const pulses: { mesh: THREE.Mesh; nodeIndex: number; progress: number; speed: number }[] = [];
    for (let i = 0; i < pulseCount; i++) {
        const pulse = new THREE.Mesh(pulseGeo, pulseMat);
        scene.add(pulse);
        pulses.push({
            mesh: pulse,
            nodeIndex: i % NODES.length,
            progress: Math.random(),
            speed: 0.005 + Math.random() * 0.008
        });
    }

    // Mouse interaction for subtle parallax
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / width - 0.5) * 2;
      mouseY = -((e.clientY - rect.top) / height - 0.5) * 2;
    };
    mount.addEventListener("mousemove", handleMouseMove);

    let animId: number;
    let time = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      time += 0.008;

      // Rotate core
      coreWire.rotation.y += 0.01;
      coreWire.rotation.x += 0.005;

      // Pulse core
      const pulse = 0.85 + Math.sin(time * 2) * 0.15;
      coreMat.opacity = pulse;

      // Rotate orbit ring
      orbitRing.rotation.z += 0.003;

      // Update node positions
      NODES.forEach((node, i) => {
        nodeAngles[i] += 0.006;
        const x = Math.cos(nodeAngles[i]) * node.radius;
        const z = Math.sin(nodeAngles[i]) * node.radius * 0.4;
        const y = Math.sin(nodeAngles[i]) * node.radius * 0.3;
        nodeMeshes[i].position.set(x, y, z);

        // Pulse node
        const nodePulse = 0.7 + Math.sin(time * 3 + i) * 0.3;
        (nodeMeshes[i].material as THREE.MeshBasicMaterial).opacity = nodePulse;

        // Update connection line
        const linePositions = lineMeshes[i].geometry.attributes.position.array as Float32Array;
        linePositions[0] = 0; linePositions[1] = 0; linePositions[2] = 0;
        linePositions[3] = x; linePositions[4] = y; linePositions[5] = z;
        lineMeshes[i].geometry.attributes.position.needsUpdate = true;

        // Pulse line opacity
        (lineMeshes[i].material as THREE.LineBasicMaterial).opacity = 0.15 + Math.sin(time * 2 + i) * 0.15;
      });

      // Update data pulses flowing through the lines
      pulses.forEach((pulse, i) => {
        pulse.progress += pulse.speed;
        if (pulse.progress > 1) {
            pulse.progress = 0;
        }

        const node = nodeMeshes[pulse.nodeIndex];
        // Lerp from core to node position
        pulse.mesh.position.lerpVectors(new THREE.Vector3(0,0,0), node.position, pulse.progress);
        
        // Fading logic: invisible at the very beginning and end, bright in the middle
        const fade = Math.sin(pulse.progress * Math.PI); 
        (pulse.mesh.material as THREE.Material).opacity = fade * (0.3 + Math.sin(time * 10 + i) * 0.5);
      });

      // Subtle camera parallax effect
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, mouseX * 1.5, 0.05);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.5 + mouseY * 1.5, 0.05);
      camera.lookAt(scene.position);

      bgParticles.rotation.y += 0.0005;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      
      // Responsive camera distance
      const isMobile = w < 640;
      camera.position.z = isMobile ? 8.5 : 6;
      camera.position.y = isMobile ? 1.2 : 1.5;
      
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);
    // Initial call to set values
    handleResize();

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

  return <div ref={mountRef} className="w-full h-full" />;
}
