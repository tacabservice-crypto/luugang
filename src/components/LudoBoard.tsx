/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LudoToken, PlayerColor, LudoPlayer } from '../types/game';
import { Star } from 'lucide-react';
import PhysicalDice from './PhysicalDice';

interface LudoBoardProps {
  tokens: LudoToken[];
  players: LudoPlayer[];
  activeColor: PlayerColor | null;
  validTokenMoves: string[]; // List of token IDs that are valid to move
  onTokenClick: (tokenId: string) => void;
  userColor: PlayerColor | null;
  showTurnDice?: boolean;
  diceValue?: number | null;
  diceRolling?: boolean;
}

// ==========================================
// 1. GRID MAP DEFINITION
// ==========================================
interface Coord {
  col: number;
  row: number;
}

const OUTER_TRACK_COORDS: Coord[] = [
  { col: 1, row: 6 }, { col: 2, row: 6 }, { col: 3, row: 6 }, { col: 4, row: 6 }, { col: 5, row: 6 },
  { col: 6, row: 5 }, { col: 6, row: 4 }, { col: 6, row: 3 }, { col: 6, row: 2 }, { col: 6, row: 1 },
  { col: 6, row: 0 }, { col: 7, row: 0 }, { col: 8, row: 0 },
  { col: 8, row: 1 }, { col: 8, row: 2 }, { col: 8, row: 3 }, { col: 8, row: 4 }, { col: 8, row: 5 },
  { col: 9, row: 6 }, { col: 10, row: 6 }, { col: 11, row: 6 }, { col: 12, row: 6 }, { col: 13, row: 6 },
  { col: 14, row: 6 }, { col: 14, row: 7 }, { col: 14, row: 8 },
  { col: 13, row: 8 }, { col: 12, row: 8 }, { col: 11, row: 8 }, { col: 10, row: 8 }, { col: 9, row: 8 },
  { col: 8, row: 9 }, { col: 8, row: 10 }, { col: 8, row: 11 }, { col: 8, row: 12 }, { col: 8, row: 13 },
  { col: 8, row: 14 }, { col: 7, row: 14 }, { col: 6, row: 14 },
  { col: 6, row: 13 }, { col: 6, row: 12 }, { col: 6, row: 11 }, { col: 6, row: 10 }, { col: 6, row: 9 },
  { col: 5, row: 8 }, { col: 4, row: 8 }, { col: 3, row: 8 }, { col: 2, row: 8 }, { col: 1, row: 8 },
  { col: 0, row: 8 }, { col: 0, row: 7 }, { col: 0, row: 6 }
];

const START_OFFSETS: Record<PlayerColor, number> = { green: 0, yellow: 13, blue: 26, red: 39 };
const SAFE_GLOBAL_INDICES = [0, 8, 13, 21, 26, 34, 39, 47];

const HOME_STRETCH_MAP: Record<PlayerColor, Coord[]> = {
  green: [ { col: 1, row: 7 }, { col: 2, row: 7 }, { col: 3, row: 7 }, { col: 4, row: 7 }, { col: 5, row: 7 } ],
  yellow: [ { col: 7, row: 1 }, { col: 7, row: 2 }, { col: 7, row: 3 }, { col: 7, row: 4 }, { col: 7, row: 5 } ],
  blue: [ { col: 13, row: 7 }, { col: 12, row: 7 }, { col: 11, row: 7 }, { col: 10, row: 7 }, { col: 9, row: 7 } ],
  red: [ { col: 7, row: 13 }, { col: 7, row: 12 }, { col: 7, row: 11 }, { col: 7, row: 10 }, { col: 7, row: 9 } ]
};

const HOME_BASE_COORDS: Record<PlayerColor, Coord[]> = {
  green: [ { col: 1.5, row: 1.5 }, { col: 3.5, row: 1.5 }, { col: 1.5, row: 3.5 }, { col: 3.5, row: 3.5 } ],
  yellow: [ { col: 10.5, row: 1.5 }, { col: 12.5, row: 1.5 }, { col: 10.5, row: 3.5 }, { col: 12.5, row: 3.5 } ],
  blue: [ { col: 10.5, row: 10.5 }, { col: 12.5, row: 10.5 }, { col: 10.5, row: 12.5 }, { col: 12.5, row: 12.5 } ],
  red: [ { col: 1.5, row: 10.5 }, { col: 3.5, row: 10.5 }, { col: 1.5, row: 12.5 }, { col: 3.5, row: 12.5 } ]
};

const CENTER_GOAL_COORDS: Record<PlayerColor, Coord> = {
  green: { col: 5.7, row: 7 },
  yellow: { col: 7, row: 5.7 },
  blue: { col: 8.3, row: 7 },
  red: { col: 7, row: 8.3 }
};

const COLOR_THEMES: Record<PlayerColor, { main: string; light: string; bg: string; text: string }> = {
  red: { main: '#E53170', light: '#ff4d88', bg: '#401124', text: '#FF8E3C' },
  green: { main: '#00B074', light: '#00e699', bg: '#083324', text: '#ffffff' },
  yellow: { main: '#F2C94C', light: '#f9df8c', bg: '#3d320f', text: '#111111' },
  blue: { main: '#0090FF', light: '#4da6ff', bg: '#062947', text: '#ffffff' }
};

// This is the clockwise visual layout of the board starting from Top-Left
const visualColorOrder: PlayerColor[] = ['green', 'yellow', 'blue', 'red'];

// This function creates a mapping to logically "rotate" the board
// so the user's home base always appears at the bottom-left ('green' position).
function getDisplayMapping(userColor: PlayerColor | null): Record<PlayerColor, PlayerColor> {
  const identityMapping: Record<PlayerColor, PlayerColor> = { red: 'red', green: 'green', yellow: 'yellow', blue: 'blue' };
  if (!userColor) {
    return identityMapping;
  }

  const playerIndex = visualColorOrder.indexOf(userColor);
  const targetIndex = visualColorOrder.indexOf('red'); // 'red' is our reference for bottom-left (hoos-bidix)

  const shift = targetIndex - playerIndex;

  const mapping: { [key: string]: PlayerColor } = {};
  for (let i = 0; i < visualColorOrder.length; i++) {
    const originalColor = visualColorOrder[i];
    const newColorIndex = (i + shift + visualColorOrder.length) % visualColorOrder.length;
    mapping[originalColor] = visualColorOrder[newColorIndex];
  }
  
  return mapping as Record<PlayerColor, PlayerColor>;
}

export default function LudoBoard({
  tokens,
  players,
  activeColor,
  validTokenMoves,
  onTokenClick,
  userColor,
  showTurnDice = false,
  diceValue = null,
  diceRolling = false
}: LudoBoardProps) {
  
  const displayColorMapping = getDisplayMapping(userColor);
  const reverseDisplayColorMapping = Object.fromEntries(Object.entries(displayColorMapping).map(([k, v]) => [v, k as PlayerColor]));

  const getCellTokenPositions = () => {
    const placements: Record<string, LudoToken[]> = {};
    tokens.forEach((t) => {
      let key = '';
      const displayColor = displayColorMapping[t.color];
      if (t.position === -1) {
        key = `base_${displayColor}_${t.id}`;
      } else if (t.position === 56) {
        key = `finished_${displayColor}`;
      } else if (t.position >= 51 && t.position <= 55) {
        key = `stretch_${displayColor}_${t.position}`;
      } else {
        const globalIdx = (START_OFFSETS[displayColor] + t.position) % 52;
        key = `track_${globalIdx}`;
      }
      if (!placements[key]) placements[key] = [];
      placements[key].push(t);
    });
    return placements;
  };

  const placements = getCellTokenPositions();
  const activeDisplayColor = activeColor ? displayColorMapping[activeColor] : null;
  const dicePosition = activeDisplayColor === 'green' ? { left: '20%', top: '20%' }
    : activeDisplayColor === 'yellow' ? { left: '80%', top: '20%' }
    : activeDisplayColor === 'blue' ? { left: '80%', top: '80%' }
    : { left: '20%', top: '80%' };

  const getXY = (col: number, row: number) => {
    const size = 100 / 15;
    return { x: col * size + size / 2, y: row * size + size / 2 };
  };

  const renderTrackCells = () => {
    return OUTER_TRACK_COORDS.map((coord, idx) => {
      const size = 100 / 15;
      const x = coord.col * size;
      const y = coord.row * size;
      
      let cellColor = '#1F2026';

      const originalColor = (Object.keys(START_OFFSETS) as PlayerColor[]).find(c => START_OFFSETS[c] === idx);
      if (originalColor) {
        cellColor = COLOR_THEMES[reverseDisplayColorMapping[originalColor]].main;
      } else if (SAFE_GLOBAL_INDICES.includes(idx)) {
        cellColor = '#2F313D';
      }

      return (
        <g key={`track-cell-${idx}`}>
          <rect x={`${x}%`} y={`${y}%`} width={`${size}%`} height={`${size}%`} fill={cellColor} stroke="#121216" strokeWidth="0.2%" />
          {SAFE_GLOBAL_INDICES.includes(idx) && (
            <path
              d="M 10 2 L 12 8 L 18 8 L 13 12 L 15 18 L 10 14 L 5 18 L 7 12 L 2 8 L 8 8 Z"
              fill={originalColor ? '#121216' : '#FF8E3C'}
              transform={`translate(${x + size/4}, ${y + size/4}) scale(${size / 40})`}
              opacity="0.85"
            />
          )}
        </g>
      );
    });
  };

  const renderHomeStretchCells = () => {
    const cells: React.ReactNode[] = [];
    const size = 100 / 15;

    (Object.keys(HOME_STRETCH_MAP) as PlayerColor[]).forEach((color) => {
      const theme = COLOR_THEMES[reverseDisplayColorMapping[color]];
      const coordList = HOME_STRETCH_MAP[color];
      
      coordList.forEach((coord, idx) => {
        const x = coord.col * size;
        const y = coord.row * size;
        cells.push( <rect key={`stretch-${color}-${idx}`} x={`${x}%`} y={`${y}%`} width={`${size}%`} height={`${size}%`} fill={theme.main} stroke="#121216" strokeWidth="0.2%" opacity="0.9" /> );
      });
    });
    return cells;
  };

  return (
    <div className="w-full aspect-square max-w-[480px] bg-[#121214] border-4 border-[#1F2026] rounded-2xl shadow-xl overflow-hidden relative select-none">
      <svg className="w-full h-full" viewBox="0 0 100 100">
        
        {(Object.keys(COLOR_THEMES) as PlayerColor[]).map(color => {
          const theme = COLOR_THEMES[reverseDisplayColorMapping[color]];
          const pos = color === 'green' ? {x:0,y:0} : color === 'yellow' ? {x:60,y:0} : color === 'red' ? {x:0,y:60} : {x:60,y:60};
          const innerPos = color === 'green' ? {x:6.66,y:6.66} : color === 'yellow' ? {x:66.66,y:6.66} : color === 'red' ? {x:6.66,y:66.66} : {x:66.66,y:66.66};
          const circlePos = [
            {cx: innerPos.x + 6.67, cy: innerPos.y + 6.67}, {cx: innerPos.x + 20, cy: innerPos.y + 6.67},
            {cx: innerPos.x + 6.67, cy: innerPos.y + 20}, {cx: innerPos.x + 20, cy: innerPos.y + 20},
          ];
          return (<g key={`base-${color}`}>
            <rect x={`${pos.x}%`} y={`${pos.y}%`} width="40%" height="40%" fill={theme.bg} stroke="#121216" strokeWidth="0.3%" />
            <rect x={`${innerPos.x}%`} y={`${innerPos.y}%`} width="26.66%" height="26.66%" fill="#121216" rx="2" />
            {circlePos.map((c, i) => <circle key={i} cx={`${c.cx}%`} cy={`${c.cy}%`} r="3%" fill={theme.main} />)}
          </g>)
        })}

        {renderTrackCells()}
        {renderHomeStretchCells()}

        {(Object.keys(COLOR_THEMES) as PlayerColor[]).map(color => {
          const theme = COLOR_THEMES[reverseDisplayColorMapping[color]];
          const points = color === 'green' ? "40,40 40,60 50,50" : color === 'yellow' ? "40,40 60,40 50,50" : color === 'blue' ? "60,40 60,60 50,50" : "40,60 60,60 50,50";
          return (<g key={`goal-${color}`}>
            <polygon points={points} fill={theme.bg} stroke="#121216" strokeWidth="0.2%" />
            <polygon points={points} fill={theme.main} opacity="0.3" />
          </g>)
        })}

        <circle cx="50%" cy="50%" r="4%" fill="#121216" stroke="#2F313D" strokeWidth="0.4%" />
        <g>
          <text x="50%" y="51%" fill="#FF8E3C" fontSize="3.5" fontWeight="900" textAnchor="middle" dominantBaseline="middle">GOAL</text>
        </g>

        {Object.entries(placements).map(([key, cellTokens]) => {
          return cellTokens.map((token, subIdx) => {
            const numSharing = cellTokens.length;
            const displayColor = displayColorMapping[token.color];
            
            let baseCoord: Coord = { col: 0, row: 0 };
            if (token.position === -1) {
              const tokenIdx = parseInt(token.id.split('_').pop() || '0');
              baseCoord = HOME_BASE_COORDS[displayColor][tokenIdx];
            } else if (token.position === 56) {
              baseCoord = CENTER_GOAL_COORDS[displayColor];
            } else if (token.position >= 51 && token.position <= 55) {
              baseCoord = HOME_STRETCH_MAP[displayColor][token.position - 51];
            } else {
              const globalIdx = (START_OFFSETS[displayColor] + token.position) % 52;
              baseCoord = OUTER_TRACK_COORDS[globalIdx];
            }

            const centerXY = getXY(baseCoord.col, baseCoord.row);
            let finalX = centerXY.x;
            let finalY = centerXY.y;

            if (numSharing > 1 && token.position !== -1) {
              const angle = (subIdx / numSharing) * 2 * Math.PI;
              const radius = 1.6;
              finalX += radius * Math.cos(angle);
              finalY += radius * Math.sin(angle);
            }

            const tokenTheme = COLOR_THEMES[token.color];
            const isMyTurnAndSelectable = validTokenMoves.includes(token.id);

            return (
              <g key={token.id} onClick={() => { if (isMyTurnAndSelectable) { onTokenClick(token.id); } }}
                className={`transition-all duration-300 ${isMyTurnAndSelectable ? 'cursor-pointer hover:scale-110 active:scale-90 select-none' : 'pointer-events-none'}`}
                style={{ transformOrigin: `${finalX}% ${finalY}%` }}
              >
                {isMyTurnAndSelectable && (
                  <circle cx={`${finalX}%`} cy={`${finalY}%`} r="3.5%" fill="none" stroke="#FF8E3C" strokeWidth="0.6%" className="animate-ping" opacity="0.8" />
                )}
                <circle cx={`${finalX}%`} cy={`${finalY}%`} r="2.4%" fill="#121216" stroke={tokenTheme.main} strokeWidth="0.5%" filter="drop-shadow(0px 2px 2px rgba(0,0,0,0.5))" />
                <circle cx={`${finalX}%`} cy={`${finalY}%`} r="1.8%" fill={tokenTheme.main} stroke={isMyTurnAndSelectable ? '#FFFFFF' : tokenTheme.light} strokeWidth="0.25%" />
                <circle cx={`${finalX}%`} cy={`${finalY}%`} r="0.7%" fill="#FFFFFF" opacity="0.9" />
              </g>
            );
          });
        })}
      </svg>
      {showTurnDice && activeColor && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
          style={dicePosition}
          aria-label={`${activeColor} player dice ${diceValue || ''}`}
        >
          <div className="rounded-2xl border border-white/20 bg-black/45 px-1 shadow-xl backdrop-blur-sm">
            <PhysicalDice
              value={diceValue}
              isRolling={diceRolling}
              onClick={() => undefined}
              disabled
              compact
              color={COLOR_THEMES[activeColor].main}
            />
          </div>
        </div>
      )}
    </div>
  );
}
