import assert from 'node:assert/strict';
import { allGlyphTextures, FORM_GLYPHS, glyphSvg } from '../src/render/formGlyphs';
import type { SpellForm } from '../src/spell/types';

const forms = Object.keys(FORM_GLYPHS) as SpellForm[];

// 공용 글리프 계약: 모든 form은 DOM/HUD 양쪽에서 같은 24px SVG를 공유한다.
assert.equal(forms.length, 13, '공용 form 글리프 수가 주문 form 수와 다릅니다.');
for (const form of forms) {
  const svg = glyphSvg(form);
  assert.match(svg, /viewBox="0 0 24 24"/, `${form}: 24px viewBox가 필요합니다.`);
  assert.match(svg, /currentColor/, `${form}: HUD 팔레트 tint용 currentColor가 필요합니다.`);
}

// PDF 스케치 기준으로 의미가 약했던 다섯 실루엣을 잠근다.
assert.match(FORM_GLYPHS.wave, /<path[^>]*><\/path>|<path/, 'wave: 파도 곡선이 필요합니다.');
assert.ok((FORM_GLYPHS.wave.match(/<path/g) ?? []).length >= 2, 'wave: 봉우리와 잔물결을 함께 유지합니다.');
assert.match(FORM_GLYPHS.bolt, /<circle[^>]*fill="currentColor"/, 'bolt: 투사체 머리는 채워진 둥근 실루엣입니다.');
assert.ok((FORM_GLYPHS.bolt.match(/M[\d.]+ [\d.]+h/g) ?? []).length >= 3, 'bolt: 둥근 투사체의 짧은 잔상 세 줄을 유지합니다.');
assert.ok((FORM_GLYPHS.cage.match(/M[\d.]+ [\d.]+v/g) ?? []).length >= 3, 'cage: 가로 격자 대신 세로 창살 세 개를 유지합니다.');
assert.equal((FORM_GLYPHS.chain.match(/<rect/g) ?? []).length, 3, 'chain: 맞물린 고리 세 개를 유지합니다.');
assert.ok((FORM_GLYPHS.slash.match(/<path/g) ?? []).length >= 1, 'slash: 원호형 칼날 경로가 필요합니다.');
assert.match(FORM_GLYPHS.slash, /A9 9/, 'slash: 바깥쪽은 큰 원호여야 합니다.');
assert.match(FORM_GLYPHS.slash, /A6\.5 6\.5/, 'slash: 안쪽은 작은 원호여야 합니다.');

const textures = allGlyphTextures();
assert.equal(textures.length, forms.length + 1, '모든 form과 sequence 텍스처가 preload되어야 합니다.');
assert.ok(textures.every(({ dataUri }) => dataUri.startsWith('data:image/svg+xml;base64,')), 'Phaser용 SVG data URI가 필요합니다.');

console.log('form glyph regression: ok');
