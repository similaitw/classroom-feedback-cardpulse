import { golden, manifest, project, rotate } from './helpers.mjs';

// Independent inverse rasterizer; no production geometry or reference bits.
export function paste(frame, source, matrix, exposure = [0, 1]) {
  const [a,b,c,d,e,f,g,h,i] = matrix;
  const inverse = [e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const uv = project(inverse, x + .5, y + .5);
    if (uv.x >= 0 && uv.x < 1 && uv.y >= 0 && uv.y < 1) {
      const value = source.data[Math.floor(uv.y * source.height) * source.width + Math.floor(uv.x * source.width)];
      frame.data[y * frame.width + x] = Math.round(exposure[0] + exposure[1] * value);
    }
  }
  return [[0,0],[1,0],[1,1],[0,1]].map(([u,v]) => project(matrix,u,v));
}
export const blank = () => ({ width: 640, height: 420, data: new Uint8Array(640 * 420).fill(240) });
export function composite(count, turn = 0, lighting = false) {
  const frame = blank(), expected = [];
  const placements = [[32,28,70], [205,32,112], [425,40,135], [75,235,125], [340,248,80]];
  for (let n = 0; n < count; n++) {
    const fixture = manifest.fixtures[n], [x,y,size] = placements[n];
    let source = golden(fixture);
    const rotation = (turn + n) % 4;
    for (let k = 0; k < rotation; k++) source = rotate(source);
    const matrix = [size, size * .13, x, -size * .07, size, y, .08, -.05, 1];
    const quad = paste(frame, source, matrix, lighting ? [25 + n * 8, .65] : [0,1]);
    expected.push({ cardId: fixture.cardId, answer: fixture.answersCW[rotation], quad });
  }
  // Detached text-like bars and a solid block are geometric distractors.
  for (let y = 170; y < 192; y++) for (let x = 20; x < 280; x++) {
    if (x % 19 < 7) frame.data[y * frame.width + x] = 30;
  }
  for (let y = 310; y < 355; y++) for (let x = 520; x < 585; x++) frame.data[y * frame.width + x] = 20;
  return { frame, expected };
}
