import {it,expect} from 'vitest';
import {browserContinuity} from './browserContext';
it('uses observed web URL, but does not invent file bytes, PDF page, or media title from title',()=>{
 const c=browserContinuity({url:'https://example.com/lecture.pdf#page=26',title:'Lecture.pdf'},'chrome');
 expect(c.originalUrl.status).toBe('available');expect(c.document.status).toBe('unavailable');expect(c.currentPage.status).toBe('unavailable');expect(c.mediaTitle.status).toBe('unavailable');
 expect(browserContinuity({url:'file:///private/Lecture.pdf'},'chrome').originalUrl.status).toBe('unavailable');
 expect(browserContinuity({url:'https://user:secret@example.com'},'ally').originalUrl.status).toBe('unavailable');
});
it('includes YouTube continuation URL only when both a YouTube page and an authoritative position are present',()=>{
 const yt=browserContinuity({url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',media:[{kind:'video',positionMs:90000,source:'blob:x'}]},'ally');
 expect(yt.youtubeContinuation).toMatchObject({status:'available',value:'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90',source:'html_media_position'});
 const noPos=browserContinuity({url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'},'chrome');
 expect(noPos.youtubeContinuation).toMatchObject({status:'unavailable'});
 expect(browserContinuity({url:'https://example.com/video',media:[{kind:'video',positionMs:5000}]},'ally').youtubeContinuation).toMatchObject({status:'unavailable'});
 const paramOnly=browserContinuity({url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30'},'chrome');
 expect(paramOnly.youtubeContinuation).toMatchObject({status:'available',source:'url_t_parameter'});
});
it('reports only a supported unambiguous media position, and never invents transcript or forwards blob URIs',()=>{
 const m={kind:'video',positionMs:26000.7,source:'blob:https://example.com/123'};
 const c=browserContinuity({media:[m]},'ally');expect(c.positionMs).toMatchObject({status:'available',value:26000});expect(c.mediaSource.status).toBe('unavailable');expect(c.transcript.status).toBe('unavailable');
 expect(browserContinuity({media:[m,m]},'ally').positionMs.status).toBe('unavailable');
 expect(browserContinuity({media:[{...m,positionMs:NaN}]},'ally').positionMs.status).toBe('unavailable');
 expect(browserContinuity({media:[m]},'chrome').positionMs.status).toBe('unavailable');
});
