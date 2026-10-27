import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import DiagramFrame, { diagramDocument, FittedDiagram } from './DiagramFrame';
afterEach(cleanup);
it('isolates complex interactive SVG/HTML without parent, file/network, navigation or popup privileges', () => {
  const html = '<svg viewBox="0 0 100 100"><circle r="20" cx="50" cy="50"/></svg><input id="angle" type="range"><script>document.querySelector("input").addEventListener("input",()=>{});</script>';
  render(<DiagramFrame diagram={{ html, height: 320 }} title="Projection simulation" />);
  const frame = screen.getByTitle('Diagram: Projection simulation');
  expect(frame).toHaveAttribute('sandbox', 'allow-scripts'); expect(frame).toHaveAttribute('referrerPolicy', 'no-referrer');
  expect(frame.getAttribute('srcdoc')).toContain("connect-src 'none'");
  expect(frame.getAttribute('srcdoc')).toContain('nonce="ally-local-diagram"');
  expect(frame.getAttribute('srcdoc')).toContain('viewBox');
  fireEvent.click(screen.getByText('Hide diagram')); expect(screen.queryByTitle('Diagram: Projection simulation')).toBeNull();
});
it('strips navigation, nested frames, remote scripts, handlers and resource URLs while retaining local SVG references', () => {
  const doc = diagramDocument('<base href="file:///"><meta http-equiv="refresh" content="0;url=https://evil.test"><iframe src="https://evil.test"></iframe><script src="https://evil.test/a.js"></script><a href="javascript:alert(1)" onclick="evil()">bad</a><svg><use href="#shape" /></svg>');
  expect(doc).not.toContain('evil.test'); expect(doc).not.toContain('onclick'); expect(doc).not.toContain('javascript:');
  expect(doc).toContain('href="#shape"'); expect(doc).toContain("form-action 'none'");
});
it('fits bounded content and ignores size messages from other windows', () => {
  render(<FittedDiagram title="Fitted" html="<svg/>" />);
  const frame = screen.getByTitle('Fitted') as HTMLIFrameElement;
  fireEvent(window, new MessageEvent('message', { source: window, data: { type: 'ally-diagram-size', height: 90 } }));
  expect(frame).toHaveStyle({ height: '260px' });
  fireEvent(window, new MessageEvent('message', { source: frame.contentWindow, data: { type: 'ally-diagram-size', height: 130 } }));
  expect(frame).toHaveStyle({ height: '130px' });
  fireEvent(window, new MessageEvent('message', { source: frame.contentWindow, data: { type: 'ally-diagram-size', height: 9000 } }));
  expect(frame).toHaveStyle({ height: '260px' });
  expect(diagramDocument('<img src="data:image/png;base64,aGVsbG8="><img src="https://private.test/pixel">')).toContain('src="data:image/png;base64,aGVsbG8="');
  expect(diagramDocument('<img src="https://private.test/pixel">')).not.toContain('private.test');
});
it('resolves only attached raster assets and keeps the card isolated', () => {
  const doc = diagramDocument('<img src="ally-image:page1"><img src="ally-image:missing"><img src="file:///C:/private.png"><svg><circle r="5"/></svg><input type="range">', { page1: 'data:image/jpeg;base64,cHJldmlldw==' });
  expect(doc).toContain('src="data:image/jpeg;base64,cHJldmlldw=="');
  expect(doc).not.toContain('src="ally-image:'); expect(doc).not.toContain('private.png');
  expect(doc).toContain('<circle'); expect(doc).toContain('type="range"'); expect(doc).toContain("connect-src 'none'");
});
