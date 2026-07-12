// Skins de personaje (esquemas de color). Se usan en el menú, el avatar y el
// sprite del jugador en el mundo.

export interface Skin {
  id: string;
  name: string;
  body: number;
  head: number;
  belt: number;
}

export const SKINS: Skin[] = [
  { id: 'amber', name: 'Ámbar', body: 0xe0803a, head: 0xf2d3a8, belt: 0x9c4a1e },
  { id: 'forest', name: 'Bosque', body: 0x4a8f5c, head: 0xe8c9a0, belt: 0x2f5d3a },
  { id: 'ocean', name: 'Océano', body: 0x3f7ba8, head: 0xf0d6b0, belt: 0x274e66 },
  { id: 'rose', name: 'Rosa', body: 0xc85a86, head: 0xf2d3c0, belt: 0x8a3a5a },
  { id: 'slate', name: 'Pizarra', body: 0x6b7280, head: 0xe6d6c0, belt: 0x3f434c },
];

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

export function hex(n: number): string {
  return '#' + ('000000' + n.toString(16)).slice(-6);
}
