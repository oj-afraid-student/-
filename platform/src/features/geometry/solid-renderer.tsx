'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { DoubleSide, Quaternion, Vector3, type Group } from 'three';
import type { GeometryScene, Positions, Vec3 } from './scene';
type Solid = NonNullable<GeometryScene['solids']>[number];
function Ring({ radius, color, width }: { radius: number; color: string; width: number }) {
  const points = useMemo(
    () =>
      Array.from(
        { length: 97 },
        (_, i) =>
          [radius * Math.cos((i * Math.PI) / 48), radius * Math.sin((i * Math.PI) / 48), 0] as Vec3,
      ),
    [radius],
  );
  return <Line points={points} color={color} lineWidth={width} />;
}
function SphereOutline({ radius, width }: { radius: number; width: number }) {
  const group = useRef<Group>(null);
  useFrame(({ camera }) => {
    group.current?.quaternion.copy(camera.quaternion);
  });
  return (
    <group ref={group}>
      <Ring radius={radius} color="#4a626c" width={width} />
    </group>
  );
}
export function SolidRenderer({
  solid,
  positions,
  opacity,
  showFaces,
  lineWidth,
}: {
  solid: Solid;
  positions: Positions;
  opacity: number;
  showFaces: boolean;
  lineWidth: number;
}) {
  const material = (
    <meshStandardMaterial
      color={solid.color}
      transparent
      opacity={opacity}
      side={DoubleSide}
      roughness={0.78}
      depthWrite={false}
    />
  );
  if (solid.type === 'cylinder') {
    const a = new Vector3(...positions[solid.ends[0]]),
      b = new Vector3(...positions[solid.ends[1]]),
      axis = b.clone().sub(a);
    const center = a.clone().add(b).multiplyScalar(0.5),
      q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis.clone().normalize());
    return (
      <group position={center} quaternion={q}>
        {showFaces && (
          <mesh>
            <cylinderGeometry args={[solid.radius, solid.radius, axis.length(), 64, 1, false]} />
            {material}
          </mesh>
        )}
        {[-0.5, 0.5].map((t) => (
          <group key={t} position={[0, axis.length() * t, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <Ring radius={solid.radius} color="#4a626c" width={lineWidth} />
          </group>
        ))}
        {[0, Math.PI].map((t) => (
          <Line
            key={t}
            points={[
              [solid.radius * Math.cos(t), -axis.length() / 2, solid.radius * Math.sin(t)],
              [solid.radius * Math.cos(t), axis.length() / 2, solid.radius * Math.sin(t)],
            ]}
            color="#4a626c"
            lineWidth={lineWidth}
          />
        ))}
      </group>
    );
  }
  return (
    <group position={positions[solid.center]}>
      {showFaces && (
        <mesh rotation={solid.type === 'hemisphere' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}>
          <sphereGeometry
            args={[
              solid.radius,
              48,
              32,
              0,
              Math.PI * 2,
              0,
              solid.type === 'hemisphere' ? Math.PI / 2 : Math.PI,
            ]}
          />
          {material}
        </mesh>
      )}
      {solid.type === 'sphere' ? (
        <SphereOutline radius={solid.radius} width={lineWidth} />
      ) : (
        <>
          <Ring radius={solid.radius} color="#4a626c" width={lineWidth} />
          <Line
            points={Array.from(
              { length: 65 },
              (_, i) =>
                [
                  solid.radius * Math.cos((i * Math.PI) / 64),
                  0,
                  solid.radius * Math.sin((i * Math.PI) / 64),
                ] as Vec3,
            )}
            color="#4a626c"
            lineWidth={lineWidth}
          />
        </>
      )}
    </group>
  );
}
