export const AGENT_LOCATIONS = [
  { name: 'Mogadishu', latitude: 2.0469, longitude: 45.3182 },
  { name: 'Hargeisa', latitude: 9.5624, longitude: 44.0770 },
  { name: 'Bosaso', latitude: 11.2842, longitude: 49.1816 },
  { name: 'Garowe', latitude: 8.4054, longitude: 48.4845 },
  { name: 'Kismayo', latitude: -0.3582, longitude: 42.5454 },
  { name: 'Baidoa', latitude: 3.1167, longitude: 43.6500 },
  { name: 'Galkayo', latitude: 6.7697, longitude: 47.4308 },
  { name: 'Beledweyne', latitude: 4.7358, longitude: 45.2036 },
  { name: 'Jowhar', latitude: 2.7809, longitude: 45.5005 },
  { name: 'Burao', latitude: 9.5221, longitude: 45.5336 },
  { name: 'Berbera', latitude: 10.4396, longitude: 45.0143 },
  { name: 'Erigavo', latitude: 10.6162, longitude: 47.3679 },
  { name: 'Las Anod', latitude: 8.4774, longitude: 47.3597 },
  { name: 'Dhusamareb', latitude: 5.5350, longitude: 46.3867 },
  { name: 'Doolow', latitude: 4.1833, longitude: 42.0833 },
  { name: 'Nairobi', latitude: -1.2864, longitude: 36.8172 },
] as const;

export function findNearestAgentLocation(latitude: number, longitude: number): string {
  let nearest: (typeof AGENT_LOCATIONS)[number] = AGENT_LOCATIONS[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const location of AGENT_LOCATIONS) {
    const latDistance = latitude - location.latitude;
    const lngDistance = (longitude - location.longitude) * Math.cos(latitude * Math.PI / 180);
    const distance = latDistance * latDistance + lngDistance * lngDistance;
    if (distance < nearestDistance) {
      nearest = location;
      nearestDistance = distance;
    }
  }
  return nearest.name;
}
