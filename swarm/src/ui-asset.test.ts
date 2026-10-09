import { describe, expect, it } from 'vitest';
import { uiAssetKey, uiContentType } from './ui-asset';

describe('uiAssetKey', () => {
  it('maps the canvas shell and hashed assets', () => {
    expect(uiAssetKey('/')).toBe('ui/index.html');
    expect(uiAssetKey('/index.html')).toBe('ui/index.html');
    expect(uiAssetKey('/assets/index-DIC7CQSj.js')).toBe('ui/assets/index-DIC7CQSj.js');
  });

  it('rejects API paths and path traversal', () => {
    expect(uiAssetKey('/api/template')).toBeNull();
    expect(uiAssetKey('/assets/../index.html')).toBeNull();
    expect(uiAssetKey('/assets/nested/file.js')).toBeNull();
  });
});

describe('uiContentType', () => {
  it('types the canvas files', () => {
    expect(uiContentType('ui/index.html')).toBe('text/html; charset=utf-8');
    expect(uiContentType('ui/assets/app.css')).toBe('text/css; charset=utf-8');
    expect(uiContentType('ui/assets/app.js')).toBe('text/javascript; charset=utf-8');
  });

  it('uses a generic type for an unknown suffix', () => {
    expect(uiContentType('ui/assets/font.woff2')).toBe('application/octet-stream');
  });
});
