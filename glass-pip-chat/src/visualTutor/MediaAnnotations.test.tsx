import {cleanup,render,screen} from '@testing-library/react';import {afterEach,expect,it} from 'vitest';
import MediaAnnotations from './MediaAnnotations';import type{MediaAnnotation}from '../../electron/visualTutor/lesson';
afterEach(cleanup);
it('uses playback time for pointing and writing, restoring earlier state on replay',()=>{
 const marks:MediaAnnotation[]=[{id:'pointer',kind:'pointer',x:400,y:500,x2:600,y2:500,travel:1,tone:'blue',at:1,until:2},{id:'equation',kind:'text',x:100,y:100,text:'F = mg',write:true,tone:'blue',at:2}];
 const rect={x:0,y:50,width:800,height:450};
 const {container,rerender}=render(<MediaAnnotations annotations={marks} time={1.5} rect={rect}/>);
 expect(container.querySelector('[data-annotation-id="pointer"]')).toBeTruthy();expect(screen.queryByText('F = mg')).toBeNull();
 expect(container.querySelector('[data-native-study-pointer]')?.getAttribute('transform')).toContain('translate(500,500)');
 expect(container.querySelector('[data-native-study-pointer] path')?.getAttribute('fill')).toBe('#3380FF');expect(container.querySelector('circle')).toBeNull();
 rerender(<MediaAnnotations annotations={marks} time={3} rect={rect}/>);expect(screen.getByText('F = mg')).toBeTruthy();expect(container.querySelector('[data-annotation-id="pointer"]')).toBeNull();
 rerender(<MediaAnnotations annotations={marks} time={0} rect={{...rect,width:400,height:225}}/>);expect(screen.queryByText('F = mg')).toBeNull();expect(screen.getByLabelText('Animation annotations')).toHaveStyle({width:'400px',height:'225px'});
});
