import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadTextFile } from './download.js';

// jsdom (this project's test environment) does not implement Blob URL
// creation at all — vi.spyOn requires the property to already exist to
// intercept it, so define minimal stubs here (scoped to this file only,
// not the shared test setup) before any test runs.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:stub';
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a Blob with the given content/type, triggers an anchor download, and revokes the object URL', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadTextFile('conteúdo', 'arquivo.md', 'text/markdown');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe('text/markdown');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
