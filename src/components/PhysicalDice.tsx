/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';

interface PhysicalDiceProps {
  value: number | null;
  isRolling: boolean;
  onClick: () => void;
  disabled: boolean;
  color?: string;
  compact?: boolean;
}

function PhysicalDice({
  value,
  isRolling,
  onClick,
  disabled,
  color = '#E53170',
  compact = false
}: PhysicalDiceProps) {
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [shake, setShake] = useState(false);
  const latestValueRef = useRef(value);
  const faceDepth = compact ? 16 : 24;

  // Map each value to standard 3D rotations to face the viewer
  const faceRotations: Record<number, { x: number; y: number; z: number }> = {
    1: { x: 0, y: 0, z: 0 },
    6: { x: 180, y: 0, z: 0 },
    5: { x: 0, y: -90, z: 0 },
    2: { x: 0, y: 90, z: 0 },
    3: { x: -90, y: 0, z: 0 },
    4: { x: 90, y: 0, z: 0 }
  };

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (isRolling) {
      setShake(true);
      // Generate crazy tumble rotation cycles
      const interval = setInterval(() => {
        setRotation({
          x: Math.floor(Math.random() * 360),
          y: Math.floor(Math.random() * 360),
          z: Math.floor(Math.random() * 360)
        });
      }, 80);

      return () => {
        clearInterval(interval);
      };
    } else {
      setShake(false);
      const finalValue = latestValueRef.current || 1;
      const target = faceRotations[finalValue] || faceRotations[1];
      setRotation(target);
    }
  }, [isRolling]);

  const renderFaceDots = (faceVal: number) => {
    const dotPositions: Record<number, number[]> = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 3, 6, 2, 5, 8]
    };

    const activeDots = dotPositions[faceVal] || [];

    return (
      <div className="grid grid-cols-3 gap-0 w-full h-full p-0 bg-white border-2 border-gray-200 rounded-lg shadow-inner select-none">
        {[...Array(9)].map((_, idx) => (
          <div key={idx} className="flex items-center justify-center">
            {activeDots.includes(idx) && (
              <div 
                className={`${compact ? 'h-1.5 w-1.5' : 'h-2.5 w-2.5'} rounded-full bg-black`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center py-2 sm:py-4">
      {/* 3D Perspective Container */}
      <div 
        className={`${compact ? 'h-14 w-14' : 'h-20 w-20'} cursor-pointer flex items-center justify-center relative ${
          shake ? 'animate-bounce' : ''
        } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        style={{ perspective: '600px' }}
        onClick={() => {
          if (!disabled && !isRolling) {
            onClick();
          }
        }}
      >
        {/* The 3D Cube */}
        <div
          className={`${compact ? 'h-8 w-8' : 'h-12 w-12'} relative transition-transform duration-500 ease-out`}
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)`,
            filter: `drop-shadow(0 4px 8px ${color}55)`
          }}
        >
          {/* Face 1: Front */}
          <div 
            className="absolute inset-0 w-full h-full"
            style={{ transform: `translateZ(${faceDepth}px)`, backfaceVisibility: 'hidden' }}
          >
            {renderFaceDots(1)}
          </div>
          {/* Face 6: Back */}
          <div 
            className="absolute inset-0 w-full h-full"
            style={{ transform: `rotateY(180deg) translateZ(${faceDepth}px)`, backfaceVisibility: 'hidden' }}
          >
            {renderFaceDots(6)}
          </div>
          {/* Face 2: Left */}
          <div 
            className="absolute inset-0 w-full h-full"
            style={{ transform: `rotateY(-90deg) translateZ(${faceDepth}px)`, backfaceVisibility: 'hidden' }}
          >
            {renderFaceDots(2)}
          </div>
          {/* Face 5: Right */}
          <div 
            className="absolute inset-0 w-full h-full"
            style={{ transform: `rotateY(90deg) translateZ(${faceDepth}px)`, backfaceVisibility: 'hidden' }}
          >
            {renderFaceDots(5)}
          </div>
          {/* Face 3: Top */}
          <div 
            className="absolute inset-0 w-full h-full"
            style={{ transform: `rotateX(90deg) translateZ(${faceDepth}px)`, backfaceVisibility: 'hidden' }}
          >
            {renderFaceDots(3)}
          </div>
          {/* Face 4: Bottom */}
          <div 
            className="absolute inset-0 w-full h-full"
            style={{ transform: `rotateX(-90deg) translateZ(${faceDepth}px)`, backfaceVisibility: 'hidden' }}
          >
            {renderFaceDots(4)}
          </div>
        </div>
      </div>

      {/* Tap Instruction / Status Glow */}
      {!disabled && !isRolling && !value && (
        <span className="mt-1 text-[9px] font-black uppercase tracking-widest text-blue-400 animate-pulse sm:mt-2">
          TAABO SI AAD U LA REEDO 🎲
        </span>
      )}
    </div>
  );
}

export default React.memo(PhysicalDice);
